import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { ulid } from 'ulid';
import { ControlDatabaseService } from '../database/control-database.service.js';
import { TenantRole, MembershipStatus, UserStatus } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AcceptExistingInvitationDto, AcceptInvitationDto, InviteMemberDto, MemberRoleDto } from './dto/team.dto.js';
import { permissionsForRole } from '../authorization/permissions.js';

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function activeOwner(role: TenantRole, status: MembershipStatus) {
  return role === TenantRole.OWNER && status === MembershipStatus.ACTIVE;
}

@Injectable()
export class TeamService {
  constructor(private readonly database: ControlDatabaseService) {}

  async listMembers(tenantId: string) {
    const [members, invitations] = await Promise.all([
      this.database.tenantMembership.findMany({
        where: { tenantId },
        select: {
          id: true,
          role: true,
          status: true,
          disabledAt: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true, status: true } },
        },
        orderBy: [{ status: 'asc' }, { user: { name: 'asc' } }],
      }),
      this.database.tenantInvitation.findMany({
        where: { tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { members, invitations };
  }

  listRoles() {
    return Object.values(TenantRole).map((role) => ({
      role,
      permissions: permissionsForRole(role),
    }));
  }

  private async assertCanManage(tenantId: string, actorId: string) {
    const actor = await this.database.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: actorId } },
      select: { role: true, status: true },
    });
    if (!actor || actor.status !== MembershipStatus.ACTIVE || !permissionsForRole(actor.role).includes('team.manage')) {
      throw new ForbiddenException();
    }
    return actor;
  }

  async invite(tenantId: string, actorId: string, input: InviteMemberDto) {
    await this.assertCanManage(tenantId, actorId);
    const email = input.email.trim().toLowerCase();
    const existingMembership = await this.database.tenantMembership.findFirst({
      where: { tenantId, user: { email } },
      select: { status: true },
    });
    if (existingMembership?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('User is already a team member');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.database.$transaction(async (transaction) => {
      await transaction.tenantInvitation.updateMany({
        where: { tenantId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.tenantInvitation.create({
        data: {
          id: ulid(),
          tenantId,
          email,
          role: input.role,
          tokenHash: hashToken(token),
          expiresAt,
          createdById: actorId,
        },
      });
    });

    return { email, role: input.role, expiresAt, invitationToken: token };
  }

  async resend(tenantId: string, actorId: string, invitationId: string) {
    await this.assertCanManage(tenantId, actorId);
    const invitation = await this.database.tenantInvitation.findFirst({
      where: { id: invitationId, tenantId, acceptedAt: null, revokedAt: null },
      select: { email: true, role: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return this.invite(tenantId, actorId, invitation);
  }

  async acceptNew(input: AcceptInvitationDto) {
    const invitation = await this.database.tenantInvitation.findUnique({
      where: { tokenHash: hashToken(input.token) },
      select: { id: true, tenantId: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      throw new NotFoundException('Invitation is invalid or expired');
    }

    const existingUser = await this.database.user.findUnique({ where: { email: invitation.email }, select: { id: true, status: true } });
    if (existingUser) throw new ConflictException('Invitation must be accepted while signed in');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    return this.acceptForUser(invitation, {
      id: ulid(),
      email: invitation.email,
      name: input.name,
      passwordHash,
      status: UserStatus.ACTIVE,
    }, true);
  }

  async acceptExisting(input: AcceptExistingInvitationDto, userId: string) {
    const invitation = await this.database.tenantInvitation.findUnique({
      where: { tokenHash: hashToken(input.token) },
      select: { id: true, tenantId: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      throw new NotFoundException('Invitation is invalid or expired');
    }
    const user = await this.database.user.findUnique({ where: { id: userId }, select: { id: true, email: true, status: true } });
    if (!user || user.email !== invitation.email) throw new ForbiddenException();
    if (user.status === UserStatus.DISABLED) throw new ForbiddenException();
    return this.acceptForUser(invitation, user);
  }

  private async acceptForUser(
    invitation: { id: string; tenantId: string; role: TenantRole; email: string },
    user: { id: string; email: string; name?: string; passwordHash?: string; status: UserStatus },
    createUser = false,
  ) {
    return this.database.$transaction(async (transaction) => {
      const persistedUser = createUser
        ? await transaction.user.create({
            data: {
              id: user.id,
              email: user.email,
              name: user.name!,
              passwordHash: user.passwordHash!,
              status: UserStatus.ACTIVE,
            },
          })
        : user;
      const membership = await transaction.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId: persistedUser.id } },
        create: { tenantId: invitation.tenantId, userId: persistedUser.id, role: invitation.role, status: MembershipStatus.ACTIVE },
        update: { role: invitation.role, status: MembershipStatus.ACTIVE, disabledAt: null },
        select: { id: true, role: true, status: true },
      });
      const consumed = await transaction.tenantInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new ConflictException('Invitation is invalid or already used');
      }
      return { membershipId: membership.id, role: membership.role, status: membership.status };
    });
  }

  async changeRole(tenantId: string, actorId: string, membershipId: string, input: MemberRoleDto) {
    const actor = await this.assertCanManage(tenantId, actorId);
    if (input.role === TenantRole.OWNER && actor.role !== TenantRole.OWNER) {
      throw new ForbiddenException();
    }
    return this.database.$transaction(async (transaction) => {
      const target = await transaction.tenantMembership.findFirst({ where: { id: membershipId, tenantId } });
      if (!target) throw new NotFoundException('Member not found');
      if (target.role === TenantRole.OWNER && input.role !== TenantRole.OWNER) await this.assertOwnerRemains(transaction, tenantId, membershipId);
      return transaction.tenantMembership.update({ where: { id: target.id }, data: { role: input.role } });
    });
  }

  async setStatus(tenantId: string, actorId: string, membershipId: string, status: MembershipStatus) {
    await this.assertCanManage(tenantId, actorId);
    return this.database.$transaction(async (transaction) => {
      const target = await transaction.tenantMembership.findFirst({ where: { id: membershipId, tenantId } });
      if (!target) throw new NotFoundException('Member not found');
      if (activeOwner(target.role, target.status) && status !== MembershipStatus.ACTIVE) await this.assertOwnerRemains(transaction, tenantId, membershipId);
      return transaction.tenantMembership.update({
        where: { id: target.id },
        data: { status, disabledAt: status === MembershipStatus.DISABLED ? new Date() : null },
      });
    });
  }

  async remove(tenantId: string, actorId: string, membershipId: string) {
    await this.assertCanManage(tenantId, actorId);
    return this.database.$transaction(async (transaction) => {
      const target = await transaction.tenantMembership.findFirst({ where: { id: membershipId, tenantId } });
      if (!target) throw new NotFoundException('Member not found');
      if (activeOwner(target.role, target.status)) await this.assertOwnerRemains(transaction, tenantId, membershipId);
      await transaction.tenantMembership.delete({ where: { id: target.id } });
      return { removed: true };
    });
  }

  private async assertOwnerRemains(transaction: Prisma.TransactionClient, tenantId: string, excludingMembershipId: string) {
    const count = await transaction.tenantMembership.count({
      where: { tenantId, status: MembershipStatus.ACTIVE, role: TenantRole.OWNER, id: { not: excludingMembershipId } },
    });
    if (count < 1) throw new ConflictException('The tenant must retain an active owner');
  }
}
