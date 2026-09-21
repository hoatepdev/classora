import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import type { PoolClient } from 'pg';
import { Prisma } from '../generated/prisma/client.js';
import { ControlDatabaseService } from '../database/control-database.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import type { AuditCursorPosition, AuditEvent, AuditFilter, AuditJson, AuditRecordInput } from './audit.types.js';

const SECRET_KEY = /(?:^|_)(?:password|password_hash|token|token_hash|secret|jwt|credential|connection_string|database_url|api_key|private_key)(?:$|_)/i;
const MAX_JSON_BYTES = 32_768;
const CURSOR_VERSION = 2;
const CURSOR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

type StoredRow = {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: AuditJson | null;
  after: AuditJson | null;
  reason: string | null;
  requestId: string | null;
  metadata: AuditJson | null;
  occurredAt: string;
};

type Cursor = {
  v: number;
  hash: string;
  control: AuditCursorPosition | null;
  tenant: AuditCursorPosition | null;
};

function safeJson(value: AuditJson | null | undefined) {
  if (value == null) return null;
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, 'utf8') > MAX_JSON_BYTES) throw new BadRequestException('Audit payload is too large');
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.entries(input)
      .filter(([key]) => !SECRET_KEY.test(key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()))
      .map(([key, item]) => [key, walk(item)]));
  };
  return walk(value) as AuditJson;
}

function hashFilters(filter: Omit<AuditFilter, 'cursor'>) {
  const canonical = JSON.stringify({
    tenantId: filter.tenantId,
    action: filter.action ?? null,
    entityType: filter.entityType ?? null,
    entityId: filter.entityId ?? null,
    actorUserId: filter.actorUserId ?? null,
    from: filter.from?.toISOString() ?? null,
    to: filter.to?.toISOString() ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function isCursorPosition(value: unknown): value is AuditCursorPosition {
  return Boolean(value) && typeof value === 'object' &&
    typeof (value as AuditCursorPosition).id === 'string' &&
    CURSOR_TIMESTAMP.test((value as AuditCursorPosition).occurredAt);
}

function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (cursor.v !== CURSOR_VERSION || typeof cursor.hash !== 'string' ||
      (cursor.control !== null && !isCursorPosition(cursor.control)) ||
      (cursor.tenant !== null && !isCursorPosition(cursor.tenant)) ||
      (cursor.control === null && cursor.tenant === null)) throw new Error();
    return cursor;
  } catch {
    throw new BadRequestException('Invalid audit cursor');
  }
}

function normalize(row: StoredRow, source: AuditEvent['source']): AuditEvent {
  return { ...row, before: row.before ?? null, after: row.after ?? null, metadata: row.metadata ?? null, source, occurredAt: formatTimestamp(row.occurredAt) };
}

function compare(left: AuditEvent, right: AuditEvent) {
  if (left.occurredAt !== right.occurredAt) return left.occurredAt > right.occurredAt ? -1 : 1;
  if (left.id !== right.id) return left.id > right.id ? -1 : 1;
  return left.source.localeCompare(right.source);
}

function cursorPosition(event: AuditEvent): AuditCursorPosition {
  return { occurredAt: event.occurredAt, id: event.id };
}

@Injectable()
export class AuditService {
  constructor(
    private readonly database: ControlDatabaseService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async recordControl(transaction: Prisma.TransactionClient, input: AuditRecordInput) {
    const before = safeJson(input.before);
    const after = safeJson(input.after);
    const metadata = safeJson(input.metadata);
    return transaction.auditEvent.create({
      data: {
        id: ulid(), tenantId: input.tenantId, actorUserId: input.actorUserId ?? null, actorMembershipId: input.actorMembershipId ?? null,
        actorName: input.actorName ?? null, actorEmail: input.actorEmail ?? null, action: input.action, entityType: input.entityType,
        entityId: input.entityId ?? null, ...(before === null ? { before: Prisma.JsonNull } : { before: before as Prisma.InputJsonValue }), ...(after === null ? { after: Prisma.JsonNull } : { after: after as Prisma.InputJsonValue }),
        reason: input.reason ?? null, requestId: input.requestId ?? null, ...(metadata === null ? { metadata: Prisma.JsonNull } : { metadata: metadata as Prisma.InputJsonValue }),
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  }

  async recordTenant(client: PoolClient, input: AuditRecordInput) {
    const before = safeJson(input.before);
    const after = safeJson(input.after);
    const metadata = safeJson(input.metadata);
    await client.query(
      `INSERT INTO audit_events
       (id, tenant_id, actor_user_id, actor_membership_id, actor_name, actor_email, action, entity_type, entity_id, before, after, reason, request_id, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14::jsonb, $15)`,
      [ulid(), input.tenantId, input.actorUserId ?? null, input.actorMembershipId ?? null, input.actorName ?? null, input.actorEmail ?? null, input.action,
        input.entityType, input.entityId ?? null, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), input.reason ?? null,
        input.requestId ?? null, metadata === null ? null : JSON.stringify(metadata), input.occurredAt ?? new Date()],
    );
  }

  async list(filter: AuditFilter) {
    const cursor = decodeCursor(filter.cursor);
    const filterHash = hashFilters(filter);
    if (cursor && cursor.hash !== filterHash) throw new BadRequestException('Audit cursor does not match filters');
    const { tenant, pool } = this.tenantContext.get();
    if (tenant.tenantId !== filter.tenantId) throw new BadRequestException('Invalid tenant scope');
    const [control, tenantRows] = await Promise.all([
      this.queryControl(filter, cursor?.control),
      this.queryTenant(pool, filter, cursor?.tenant),
    ]);
    const controlEvents = control.map((row) => normalize(row, 'control'));
    const tenantEvents = tenantRows.map((row) => normalize(row, 'tenant'));
    const events = [...controlEvents, ...tenantEvents].sort(compare);
    const page = events.slice(0, filter.limit);
    const last = page.at(-1);
    const hasMore = events.length > filter.limit;
    const lastControl = page.filter((event) => event.source === 'control').at(-1);
    const lastTenant = page.filter((event) => event.source === 'tenant').at(-1);
    return {
      data: page,
      nextCursor: hasMore && last ? encodeCursor({
        v: CURSOR_VERSION,
        hash: filterHash,
        control: lastControl ? cursorPosition(lastControl) : cursor?.control ?? null,
        tenant: lastTenant ? cursorPosition(lastTenant) : cursor?.tenant ?? null,
      }) : null,
    };
  }

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const [controlRows, tenantRows] = await Promise.all([
      this.database.$queryRaw<StoredRow[]>(Prisma.sql`SELECT id, tenant_id AS "tenantId", actor_user_id AS "actorUserId", actor_membership_id AS "actorMembershipId", actor_name AS "actorName", actor_email AS "actorEmail", action, entity_type AS "entityType", entity_id AS "entityId", before, after, reason, request_id AS "requestId", metadata, to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt" FROM audit_events WHERE tenant_id = ${tenant.tenantId} AND id = ${id}`),
      pool.query<StoredRow>(`SELECT id, tenant_id AS "tenantId", actor_user_id AS "actorUserId", actor_membership_id AS "actorMembershipId", actor_name AS "actorName", actor_email AS "actorEmail", action, entity_type AS "entityType", entity_id AS "entityId", before, after, reason, request_id AS "requestId", metadata, to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt" FROM audit_events WHERE tenant_id = $1 AND id = $2`, [tenant.tenantId, id]),
    ]);
    const control = controlRows[0];
    if (control) return normalize(control, 'control');
    const tenantRow = tenantRows.rows[0];
    if (tenantRow) return normalize(tenantRow, 'tenant');
    throw new NotFoundException('Audit event not found');
  }

  private async queryControl(filter: AuditFilter, cursor?: AuditCursorPosition | null) {
    const conditions: Prisma.Sql[] = [Prisma.sql`tenant_id = ${filter.tenantId}`];
    if (filter.actorUserId) conditions.push(Prisma.sql`actor_user_id = ${filter.actorUserId}`);
    if (filter.action) conditions.push(Prisma.sql`action = ${filter.action}`);
    if (filter.entityType) conditions.push(Prisma.sql`entity_type = ${filter.entityType}`);
    if (filter.entityId) conditions.push(Prisma.sql`entity_id = ${filter.entityId}`);
    if (filter.from) conditions.push(Prisma.sql`occurred_at >= ${filter.from}`);
    if (filter.to) conditions.push(Prisma.sql`occurred_at <= ${filter.to}`);
    if (cursor) conditions.push(Prisma.sql`(occurred_at < ${cursor.occurredAt}::timestamptz OR (occurred_at = ${cursor.occurredAt}::timestamptz AND id < ${cursor.id}))`);
    const where = Prisma.join(conditions, ' AND ');
    return this.database.$queryRaw<StoredRow[]>(Prisma.sql`
      SELECT id, tenant_id AS "tenantId", actor_user_id AS "actorUserId", actor_membership_id AS "actorMembershipId",
        actor_name AS "actorName", actor_email AS "actorEmail", action, entity_type AS "entityType", entity_id AS "entityId",
        before, after, reason, request_id AS "requestId", metadata,
        to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt"
      FROM audit_events
      WHERE ${where}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${filter.limit + 1}`);
  }

  private async queryTenant(pool: { query: PoolClient['query'] }, filter: AuditFilter, cursor?: AuditCursorPosition | null) {
    const values: unknown[] = [filter.tenantId];
    const conditions = ['tenant_id = $1'];
    const add = (sql: string, value: unknown) => { values.push(value); conditions.push(`${sql} = $${values.length}`); };
    if (filter.actorUserId) add('actor_user_id', filter.actorUserId);
    if (filter.action) add('action', filter.action);
    if (filter.entityType) add('entity_type', filter.entityType);
    if (filter.entityId) add('entity_id', filter.entityId);
    if (filter.from) { values.push(filter.from); conditions.push(`occurred_at >= $${values.length}`); }
    if (filter.to) { values.push(filter.to); conditions.push(`occurred_at <= $${values.length}`); }
    if (cursor) {
      values.push(cursor.occurredAt);
      const timestamp = `$${values.length}`;
      values.push(cursor.id);
      const id = `$${values.length}`;
      conditions.push(`(occurred_at < ${timestamp}::timestamptz OR (occurred_at = ${timestamp}::timestamptz AND id < ${id}))`);
    }
    const result = await pool.query<StoredRow>(`SELECT id, tenant_id AS "tenantId", actor_user_id AS "actorUserId", actor_membership_id AS "actorMembershipId", actor_name AS "actorName", actor_email AS "actorEmail", action, entity_type AS "entityType", entity_id AS "entityId", before, after, reason, request_id AS "requestId", metadata, to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt" FROM audit_events WHERE ${conditions.join(' AND ')} ORDER BY occurred_at DESC, id DESC LIMIT ${filter.limit + 1}`, values);
    return result.rows;
  }
}

function formatTimestamp(value: Date | string) {
  if (typeof value === 'string' && CURSOR_TIMESTAMP.test(value)) return value;
  const date = new Date(value);
  const iso = date.toISOString();
  return `${iso.slice(0, 19)}.${iso.slice(20, 23)}000Z`;
}
