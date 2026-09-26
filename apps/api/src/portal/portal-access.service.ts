import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { ControlDatabaseService } from '../database/control-database.service.js';
import { PortalAccessStatus, PortalSubjectType, UserStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { RequestWithId } from '../request-logging.js';
import { TenantConnectionManager } from '../tenant/tenant-connection-manager.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { TenantResolverService } from '../tenant/tenant-resolver.service.js';
import type { AcceptPortalInvitationDto, InvitePortalSubjectDto } from './dto/portal.dto.js';

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

type Subject = { id: string; name: string; email: string };
type Invitation = { id: string; tenantId: string; subjectType: PortalSubjectType; subjectId: string; email: string; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null };

@Injectable()
export class PortalAccessService {
  constructor(
    private readonly database: ControlDatabaseService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantResolver: TenantResolverService,
    private readonly connections: TenantConnectionManager,
  ) {}

  async list() {
    const { tenant, pool } = this.tenantContext.get();
    const [accesses, invitations] = await Promise.all([
      this.database.portalAccess.findMany({
        where: { tenantId: tenant.tenantId },
        select: { id: true, subjectType: true, subjectId: true, status: true, disabledAt: true, createdAt: true, user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.database.portalInvitation.findMany({
        where: { tenantId: tenant.tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, subjectType: true, subjectId: true, email: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const subjects = await this.subjects(pool, tenant.tenantId, [
      ...accesses.map(({ subjectType, subjectId }) => ({ subjectType, subjectId })),
      ...invitations.map(({ subjectType, subjectId }) => ({ subjectType, subjectId })),
    ]);
    return {
      accesses: accesses.map((access) => ({ ...access, subjectName: subjects.get(this.subjectKey(access))?.name ?? null, subjectEmail: subjects.get(this.subjectKey(access))?.email ?? null })),
      invitations: invitations.map((invitation) => ({ ...invitation, subjectName: subjects.get(this.subjectKey(invitation))?.name ?? null, subjectEmail: subjects.get(this.subjectKey(invitation))?.email ?? null })),
    };
  }

  async subjectsForInvite(type: PortalSubjectType, search?: string) {
    const { tenant, pool } = this.tenantContext.get();
    const table = type === PortalSubjectType.GUARDIAN ? 'guardians' : 'students';
    const values: unknown[] = [tenant.tenantId];
    const filter = search?.trim();
    if (filter) values.push(`%${filter}%`);
    const result = await pool.query<Subject>(
      `SELECT id,full_name AS name,email FROM ${table}
       WHERE tenant_id=$1 AND email IS NOT NULL${filter ? ' AND (full_name ILIKE $2 OR email ILIKE $2)' : ''}
       ORDER BY full_name,id LIMIT 50`,
      values,
    );
    return result.rows.map((row) => ({ ...row, email: row.email.toLowerCase() }));
  }

  async invite(actorUserId: string, input: InvitePortalSubjectDto, request?: RequestWithId) {
    const context = this.tenantContext.get();
    const subject = await this.subject(context.pool, context.tenant.tenantId, input.subjectType, input.subjectId);
    const email = subject.email.toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.database.$transaction(async (transaction) => {
      await this.lockSubject(transaction, context.tenant.tenantId, input.subjectType, input.subjectId);
      const access = await transaction.portalAccess.findUnique({
        where: { tenantId_subjectType_subjectId: { tenantId: context.tenant.tenantId, subjectType: input.subjectType, subjectId: input.subjectId } },
      });
      if (access) throw new ConflictException('Portal access already exists');
      await transaction.portalInvitation.updateMany({
        where: { tenantId: context.tenant.tenantId, subjectType: input.subjectType, subjectId: input.subjectId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const invitation = await transaction.portalInvitation.create({
        data: { id: ulid(), tenantId: context.tenant.tenantId, subjectType: input.subjectType, subjectId: input.subjectId, email, tokenHash: hashToken(token), expiresAt, createdById: actorUserId },
      });
      await this.audit.recordControl(transaction, {
        ...this.actor(context, request), action: 'portal.invited', entityType: 'PORTAL_ACCESS', entityId: null,
        after: { subjectType: input.subjectType, subjectId: input.subjectId, email, status: 'PENDING' }, metadata: { invitationId: invitation.id },
      });
    });
    return { subjectType: input.subjectType, subjectId: input.subjectId, email, expiresAt, invitationToken: token };
  }

  async resend(actorUserId: string, invitationId: string, request?: RequestWithId) {
    const context = this.tenantContext.get();
    const invitation = await this.database.portalInvitation.findFirst({
      where: { id: invitationId, tenantId: context.tenant.tenantId, acceptedAt: null, revokedAt: null },
      select: { id: true, subjectType: true, subjectId: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    const subject = await this.subject(context.pool, context.tenant.tenantId, invitation.subjectType, invitation.subjectId);
    const email = subject.email.toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.database.$transaction(async (transaction) => {
      await this.lockSubject(transaction, context.tenant.tenantId, invitation.subjectType, invitation.subjectId);
      const stillPending = await transaction.portalInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (stillPending.count !== 1) throw new NotFoundException('Invitation not found');
      const access = await transaction.portalAccess.findUnique({
        where: { tenantId_subjectType_subjectId: { tenantId: context.tenant.tenantId, subjectType: invitation.subjectType, subjectId: invitation.subjectId } },
      });
      if (access) throw new ConflictException('Portal access already exists');
      await transaction.portalInvitation.updateMany({
        where: { tenantId: context.tenant.tenantId, subjectType: invitation.subjectType, subjectId: invitation.subjectId, acceptedAt: null, revokedAt: null, id: { not: invitation.id } },
        data: { revokedAt: new Date() },
      });
      const replacement = await transaction.portalInvitation.create({
        data: { id: ulid(), tenantId: context.tenant.tenantId, subjectType: invitation.subjectType, subjectId: invitation.subjectId, email, tokenHash: hashToken(token), expiresAt, createdById: actorUserId },
      });
      await this.audit.recordControl(transaction, {
        ...this.actor(context, request), action: 'portal.invitation_resent', entityType: 'PORTAL_ACCESS', entityId: null,
        after: { subjectType: invitation.subjectType, subjectId: invitation.subjectId, email, status: 'PENDING' },
        metadata: { invitationId: replacement.id, replacedInvitationId: invitation.id },
      });
    });
    return { subjectType: invitation.subjectType, subjectId: invitation.subjectId, email, expiresAt, invitationToken: token };
  }

  async revoke(invitationId: string, request?: RequestWithId) {
    const context = this.tenantContext.get();
    return this.database.$transaction(async (transaction) => {
      const invitation = await transaction.portalInvitation.findFirst({ where: { id: invitationId, tenantId: context.tenant.tenantId, acceptedAt: null, revokedAt: null } });
      if (!invitation) throw new NotFoundException('Invitation not found');
      await this.lockSubject(transaction, context.tenant.tenantId, invitation.subjectType, invitation.subjectId);
      const revoked = await transaction.portalInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new ConflictException('Invitation is no longer pending');
      await this.audit.recordControl(transaction, {
        ...this.actor(context, request), action: 'portal.invitation_revoked', entityType: 'PORTAL_ACCESS', entityId: null,
        before: { subjectType: invitation.subjectType, subjectId: invitation.subjectId, email: invitation.email, status: 'PENDING' }, metadata: { invitationId },
      });
      return { revoked: true };
    });
  }

  async setStatus(accessId: string, status: PortalAccessStatus, request?: RequestWithId) {
    const context = this.tenantContext.get();
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.portalAccess.findFirst({ where: { id: accessId, tenantId: context.tenant.tenantId } });
      if (!current) throw new NotFoundException('Portal access not found');
      const updated = await transaction.portalAccess.update({ where: { id: current.id }, data: { status, disabledAt: status === PortalAccessStatus.DISABLED ? new Date() : null } });
      await this.audit.recordControl(transaction, {
        ...this.actor(context, request), action: status === PortalAccessStatus.DISABLED ? 'portal.disabled' : 'portal.enabled', entityType: 'PORTAL_ACCESS', entityId: current.id,
        before: this.accessSnapshot(current), after: this.accessSnapshot(updated),
      });
      return updated;
    });
  }

  async remove(accessId: string, request?: RequestWithId) {
    const context = this.tenantContext.get();
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.portalAccess.findFirst({ where: { id: accessId, tenantId: context.tenant.tenantId } });
      if (!current) throw new NotFoundException('Portal access not found');
      await this.audit.recordControl(transaction, { ...this.actor(context, request), action: 'portal.removed', entityType: 'PORTAL_ACCESS', entityId: current.id, before: this.accessSnapshot(current) });
      await transaction.portalAccess.delete({ where: { id: current.id } });
      return { removed: true };
    });
  }

  async acceptNew(hostname: string, input: AcceptPortalInvitationDto, request?: RequestWithId) {
    const invitation = await this.validInvitation(hostname, input.token);
    const existing = await this.database.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
    if (existing) throw new ConflictException('Invitation must be accepted while signed in');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    return this.acceptForUser(invitation, { id: ulid(), email: invitation.email, name: input.name, passwordHash }, true, request);
  }

  async acceptExisting(hostname: string, token: string, userId: string, request?: RequestWithId) {
    const invitation = await this.validInvitation(hostname, token);
    const user = await this.database.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, status: true } });
    if (!user || user.status !== UserStatus.ACTIVE || user.email !== invitation.email) throw new ForbiddenException();
    return this.acceptForUser(invitation, user, false, request);
  }

  private async validInvitation(hostname: string, token: string): Promise<Invitation> {
    const tenant = await this.tenantResolver.resolve(hostname);
    if (!tenant) throw new NotFoundException('Invitation is invalid or expired');
    const invitation = await this.database.portalInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, tenantId: true, subjectType: true, subjectId: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true },
    });
    if (!invitation || invitation.tenantId !== tenant.tenantId || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) throw new NotFoundException('Invitation is invalid or expired');
    const pool = await this.connections.getConnection(tenant.dbName);
    try {
      const subject = await this.subject(pool, tenant.tenantId, invitation.subjectType, invitation.subjectId);
      if (subject.email.toLowerCase() !== invitation.email) throw new NotFoundException('Invitation is invalid or expired');
    } finally {
      this.connections.releaseConnection(tenant.dbName, pool);
    }
    return invitation;
  }

  private async acceptForUser(invitation: Invitation, user: { id: string; email: string; name: string; passwordHash?: string }, createUser: boolean, request?: RequestWithId) {
    return this.database.$transaction(async (transaction) => {
      await this.lockSubject(transaction, invitation.tenantId, invitation.subjectType, invitation.subjectId);
      const consumed = await transaction.portalInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) throw new ConflictException('Invitation is invalid or already used');
      const persistedUser = createUser ? await transaction.user.create({ data: { ...user, passwordHash: user.passwordHash!, status: UserStatus.ACTIVE } }) : user;
      const existingAccess = await transaction.portalAccess.findUnique({
        where: { tenantId_subjectType_subjectId: { tenantId: invitation.tenantId, subjectType: invitation.subjectType, subjectId: invitation.subjectId } },
      });
      if (existingAccess && existingAccess.userId !== persistedUser.id) throw new ConflictException('Portal access already belongs to another user');
      const access = existingAccess
        ? await transaction.portalAccess.update({ where: { id: existingAccess.id }, data: { status: PortalAccessStatus.ACTIVE, disabledAt: null } })
        : await transaction.portalAccess.create({ data: { tenantId: invitation.tenantId, userId: persistedUser.id, subjectType: invitation.subjectType, subjectId: invitation.subjectId } });
      await this.audit.recordControl(transaction, {
        tenantId: invitation.tenantId, actorUserId: persistedUser.id, actorName: persistedUser.name, actorEmail: persistedUser.email,
        action: 'portal.activated', entityType: 'PORTAL_ACCESS', entityId: access.id,
        before: existingAccess ? this.accessSnapshot(existingAccess) : null, after: this.accessSnapshot(access), requestId: request?.requestId,
        metadata: { invitationId: invitation.id, subjectType: invitation.subjectType, subjectId: invitation.subjectId },
      });
      return { accessId: access.id, subjectType: access.subjectType, subjectId: access.subjectId, status: access.status };
    });
  }

  private async subject(pool: Pick<Pool, 'query'>, tenantId: string, type: PortalSubjectType, id: string): Promise<Subject> {
    const table = type === PortalSubjectType.GUARDIAN ? 'guardians' : 'students';
    const result = await pool.query<Subject>(`SELECT id,full_name AS name,email FROM ${table} WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
    const subject = result.rows[0];
    if (!subject) throw new NotFoundException('Portal subject not found');
    if (!subject.email || !isEmail(subject.email)) throw new ConflictException('Portal subject requires a valid email address');
    return subject;
  }

  private async subjects(pool: Pick<Pool, 'query'>, tenantId: string, refs: Array<{ subjectType: PortalSubjectType; subjectId: string }>) {
    const guardians = [...new Set(refs.filter((ref) => ref.subjectType === PortalSubjectType.GUARDIAN).map((ref) => ref.subjectId))];
    const students = [...new Set(refs.filter((ref) => ref.subjectType === PortalSubjectType.STUDENT).map((ref) => ref.subjectId))];
    const [guardianRows, studentRows] = await Promise.all([
      guardians.length ? pool.query<Subject>('SELECT id,full_name AS name,email FROM guardians WHERE tenant_id=$1 AND id=ANY($2::char(26)[])', [tenantId, guardians]) : { rows: [] },
      students.length ? pool.query<Subject>('SELECT id,full_name AS name,email FROM students WHERE tenant_id=$1 AND id=ANY($2::char(26)[])', [tenantId, students]) : { rows: [] },
    ]);
    return new Map<string, Subject>([
      ...guardianRows.rows.map((row): [string, Subject] => [`${PortalSubjectType.GUARDIAN}:${row.id}`, row]),
      ...studentRows.rows.map((row): [string, Subject] => [`${PortalSubjectType.STUDENT}:${row.id}`, row]),
    ]);
  }

  private subjectKey(ref: { subjectType: PortalSubjectType; subjectId: string }) { return `${ref.subjectType}:${ref.subjectId}`; }
  private lockSubject(transaction: Prisma.TransactionClient, tenantId: string, subjectType: PortalSubjectType, subjectId: string) { return transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${subjectType}:${subjectId}`}, 0))`; }
  private actor(context: ReturnType<TenantContextService['get']>, request?: RequestWithId) { return { tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId, actorName: context.actorName, actorEmail: context.actorEmail, requestId: request?.requestId }; }
  private accessSnapshot(access: { id: string; userId: string; subjectType: PortalSubjectType; subjectId: string; status: PortalAccessStatus; disabledAt: Date | null }) { return { accessId: access.id, userId: access.userId, subjectType: access.subjectType, subjectId: access.subjectId, status: access.status, disabledAt: access.disabledAt }; }
}

export type PortalHttpRequest = Request & RequestWithId;
