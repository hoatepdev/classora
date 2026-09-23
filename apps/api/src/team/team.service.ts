import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import type { RequestWithId } from '../request-logging.js';
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

function membershipSnapshot(member: {
  id: string;
  role: TenantRole;
  status: MembershipStatus;
  disabledAt: Date | null;
  createdAt: Date;
  user?: { email: string; name: string } | null;
}) {
  return {
    membershipId: member.id,
    email: member.user?.email ?? null,
    name: member.user?.name ?? null,
    role: member.role,
    status: member.status,
    disabledAt: member.disabledAt,
    createdAt: member.createdAt,
  };
}

@Injectable()
export class TeamService {
  constructor(private readonly database: ControlDatabaseService, private readonly audit: AuditService) {}

  private actor(tenantId: string, actorId: string, membershipId: string, user?: { name: string; email: string }, request?: RequestWithId) {
    return { tenantId, actorUserId: actorId, actorMembershipId: membershipId, actorName: user?.name, actorEmail: user?.email, requestId: request?.requestId };
  }

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
      select: { id: true, role: true, status: true, user: { select: { name: true, email: true } } },
    });
    if (!actor || actor.status !== MembershipStatus.ACTIVE || !permissionsForRole(actor.role).includes('team.manage')) {
      throw new ForbiddenException();
    }
    return actor;
  }

  async invite(tenantId: string, actorId: string, input: InviteMemberDto, request?: RequestWithId) {
    const actor = await this.assertCanManage(tenantId, actorId);
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
      const invitation = await transaction.tenantInvitation.create({
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
      await this.audit.recordControl(transaction, {
        ...this.actor(tenantId, actorId, actor.id, actor.user, request), action: 'membership.invited', entityType: 'MEMBERSHIP', entityId: null,
        after: { email, role: input.role, status: 'PENDING' }, metadata: { invitationId: invitation.id },
      });
    });

    return { email, role: input.role, expiresAt, invitationToken: token };
  }

  async resend(tenantId: string, actorId: string, invitationId: string, request?: RequestWithId) {
    const actor = await this.assertCanManage(tenantId, actorId);
    const invitation = await this.database.tenantInvitation.findFirst({
      where: { id: invitationId, tenantId, acceptedAt: null, revokedAt: null },
      select: { email: true, role: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.database.$transaction(async (transaction) => {
      await transaction.tenantInvitation.updateMany({
        where: { tenantId, email: invitation.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const replacement = await transaction.tenantInvitation.create({
        data: {
          id: ulid(),
          tenantId,
          email: invitation.email,
          role: invitation.role,
          tokenHash: hashToken(token),
          expiresAt,
          createdById: actorId,
        },
      });
      await this.audit.recordControl(transaction, {
        ...this.actor(tenantId, actorId, actor.id, actor.user, request),
        action: 'membership.invitation_resent',
        entityType: 'MEMBERSHIP',
        entityId: null,
        after: { email: invitation.email, role: invitation.role, status: 'PENDING' },
        metadata: { invitationId: replacement.id, replacedInvitationId: invitationId },
      });
    });

    return { email: invitation.email, role: invitation.role, expiresAt, invitationToken: token };
  }

  async acceptNew(input: AcceptInvitationDto, request?: RequestWithId) {
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
    }, true, request);
  }

  async acceptExisting(input: AcceptExistingInvitationDto, userId: string, request?: RequestWithId) {
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
    return this.acceptForUser(invitation, user, false, request);
  }

  private async acceptForUser(
    invitation: { id: string; tenantId: string; role: TenantRole; email: string },
    user: { id: string; email: string; name?: string; passwordHash?: string; status: UserStatus },
    createUser = false,
    request?: RequestWithId,
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
      const existingMembership = await transaction.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId: persistedUser.id } },
        select: { id: true, role: true, status: true, disabledAt: true, createdAt: true, user: { select: { name: true, email: true } } },
      });
      const membership = await transaction.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId: persistedUser.id } },
        create: { tenantId: invitation.tenantId, userId: persistedUser.id, role: invitation.role, status: MembershipStatus.ACTIVE },
        update: { role: invitation.role, status: MembershipStatus.ACTIVE, disabledAt: null },
        select: { id: true, role: true, status: true, disabledAt: true, createdAt: true, user: { select: { name: true, email: true } } },
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
      await this.audit.recordControl(transaction, {
        tenantId: invitation.tenantId,
        actorUserId: persistedUser.id,
        actorMembershipId: membership.id,
        actorName: membership.user.name,
        actorEmail: membership.user.email,
        action: 'membership.activated',
        entityType: 'MEMBERSHIP',
        entityId: membership.id,
        before: existingMembership ? membershipSnapshot(existingMembership) : null,
        after: membershipSnapshot(membership),
        requestId: request?.requestId,
        metadata: { invitationId: invitation.id },
      });
      return { membershipId: membership.id, role: membership.role, status: membership.status };
    });
  }

  async changeRole(tenantId: string, actorId: string, membershipId: string, input: MemberRoleDto, request?: RequestWithId) {
    const actor = await this.assertCanManage(tenantId, actorId);
    if (input.role === TenantRole.OWNER && actor.role !== TenantRole.OWNER) {
      throw new ForbiddenException();
    }
    return this.database.$transaction(async (transaction) => {
      await this.lockTenantMemberships(transaction, tenantId);
      const target = await transaction.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, role: true, status: true, disabledAt: true, createdAt: true, user: { select: { name: true, email: true } } },
      });
      if (!target) throw new NotFoundException('Member not found');
      if (target.role === TenantRole.OWNER && input.role !== TenantRole.OWNER) await this.assertOwnerRemains(transaction, tenantId, membershipId);
      const updated = await transaction.tenantMembership.update({
        where: { id: target.id }, data: { role: input.role },
        select: { id: true, role: true, status: true, disabledAt: true, createdAt: true, user: { select: { name: true, email: true } } },
      });
      await this.audit.recordControl(transaction, {
        ...this.actor(tenantId, actorId, actor.id, actor.user, request), action: 'membership.role_changed', entityType: 'MEMBERSHIP', entityId: target.id,
        before: membershipSnapshot(target), after: membershipSnapshot(updated),
      });
      return updated;
    });
  }

  async setStatus(tenantId: string, actorId: string, membershipId: string, status: MembershipStatus, request?: RequestWithId) {
    const actor = await this.assertCanManage(tenantId, actorId);
    return this.database.$transaction(async (transaction) => {
      await this.lockTenantMemberships(transaction, tenantId);
      const target = await transaction.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, role: true, status: true, disabledAt: true, createdAt: true, user: { select: { name: true, email: true } } },
      });
      if (!target) throw new NotFoundException('Member not found');
      if (activeOwner(target.role, target.status) && status !== MembershipStatus.ACTIVE) await this.assertOwnerRemains(transaction, tenantId, membershipId);
      const updated = await transaction.tenantMembership.update({
        where: { id: target.id },
        data: { status, disabledAt: status === MembershipStatus.DISABLED ? new Date() : null },
        select: { id: true, role: true, status: true, disabledAt: true, createdAt: true, user: { select: { name: true, email: true } } },
      });
      await this.audit.recordControl(transaction, {
        ...this.actor(tenantId, actorId, actor.id, actor.user, request), action: status === MembershipStatus.DISABLED ? 'membership.disabled' : 'membership.enabled', entityType: 'MEMBERSHIP', entityId: target.id,
        before: membershipSnapshot(target), after: membershipSnapshot(updated),
      });
      return updated;
    });
  }

  async remove(tenantId: string, actorId: string, membershipId: string, request?: RequestWithId) {
    const actor = await this.assertCanManage(tenantId, actorId);
    return this.database.$transaction(async (transaction) => {
      await this.lockTenantMemberships(transaction, tenantId);
      const target = await transaction.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, role: true, status: true, disabledAt: true, createdAt: true, user: { select: { name: true, email: true } } },
      });
      if (!target) throw new NotFoundException('Member not found');
      if (activeOwner(target.role, target.status)) await this.assertOwnerRemains(transaction, tenantId, membershipId);
      await this.audit.recordControl(transaction, {
        ...this.actor(tenantId, actorId, actor.id, actor.user, request), action: 'membership.removed', entityType: 'MEMBERSHIP', entityId: target.id,
        before: membershipSnapshot(target), after: null,
      });
      await transaction.tenantMembership.delete({ where: { id: target.id } });
      return { removed: true };
    });
  }

  private async lockTenantMemberships(transaction: Prisma.TransactionClient, tenantId: string) {
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`;
  }

  private async assertOwnerRemains(transaction: Prisma.TransactionClient, tenantId: string, excludingMembershipId: string) {
    const count = await transaction.tenantMembership.count({
      where: { tenantId, status: MembershipStatus.ACTIVE, role: TenantRole.OWNER, id: { not: excludingMembershipId } },
    });
    if (count < 1) throw new ConflictException('The tenant must retain an active owner');
  }
}
