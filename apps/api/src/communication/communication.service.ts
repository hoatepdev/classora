import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ulid } from 'ulid';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { CommunicationChannelAdapter, InAppAdapter, LocalEmailAdapter } from './communication.adapters.js';
import {
  COMMUNICATION_EVENTS,
  COMMUNICATION_EVENT_TYPES,
  communicationDedupeKey,
  normalizeEmail,
  type CommunicationChannel,
  type CommunicationEventType,
  type MessagePlan,
  type TemplateContent,
} from './communication.events.js';
import { renderTemplate, validateTemplateContent } from './communication.renderer.js';

export type DispatchInput = {
  eventType: CommunicationEventType;
  sourceEntityId: string;
  dedupeScope?: string;
};

export type DispatchResult = { messageIds: string[]; skippedNoDestination: number };

type EffectiveTemplate = { subject: string | null; body: string };

const actor = (context: ReturnType<TenantContextService['get']>) => ({
  tenantId: context.tenant.tenantId,
  actorUserId: context.actorUserId,
  actorMembershipId: context.actorMembershipId,
  actorName: context.actorName,
  actorEmail: context.actorEmail,
  requestId: context.requestId,
});

export const sanitizeError = (error: unknown) =>
  String(error instanceof Error ? error.message : error)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .slice(0, 500);

const FIXTURE_CONTEXT: Record<string, string> = {
  studentName: 'Nguyễn Minh An',
  guardianName: 'Nguyễn Thu Hà',
  className: 'TOEIC Căn bản',
  sessionDate: '05/10/2026',
  startTime: '09:00',
  endTime: '10:30',
  teacherName: 'Trần Gia Bảo',
  roomName: 'P201',
  roomLine: 'Phòng: P201',
  invoiceNumber: 'INV-00000042',
  amountVnd: '2.500.000 ₫',
  amountDueVnd: '2.500.000 ₫',
  outstandingVnd: '2.500.000 ₫',
  dueDate: '10/10/2026',
  receivedDate: '05/10/2026',
  paymentMethod: 'Chuyển khoản',
  trialDate: '07/10/2026',
  trialTime: '18:00',
  absenceKind: 'có phép',
  changeKind: 'được dời lịch',
  originalDate: '05/10/2026',
  originalStartTime: '09:00',
  originalEndTime: '10:30',
  newDate: '08/10/2026',
  newStartTime: '09:00',
  newEndTime: '10:30',
  reason: 'trùng sự kiện của trung tâm',
  newScheduleText: 'Buổi học mới: 08/10/2026 09:00 - 10:30 (phòng P201).',
  expectedEndDate: '30/12/2026',
};

type MessageRow = {
  id: string;
  eventType: string;
  channel: string;
  recipientType: string;
  recipientId: string | null;
  recipientName: string | null;
  destination: string | null;
  subject: string | null;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  dedupeKey: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  failedAt: Date | null;
};

const serializeMessage = (row: MessageRow) => ({
  id: row.id,
  eventType: row.eventType,
  channel: row.channel,
  recipientType: row.recipientType,
  recipientId: row.recipientId,
  recipientName: row.recipientName,
  destination: row.destination,
  subject: row.subject,
  body: row.body,
  relatedEntityType: row.relatedEntityType,
  relatedEntityId: row.relatedEntityId,
  dedupeKey: row.dedupeKey,
  status: row.status,
  provider: row.provider,
  providerMessageId: row.providerMessageId,
  attemptCount: row.attemptCount,
  lastError: row.lastError,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  sentAt: row.sentAt?.toISOString() ?? null,
  failedAt: row.failedAt?.toISOString() ?? null,
});

const messageColumns = (prefix = '') => `${prefix}id, ${prefix}event_type AS "eventType", ${prefix}channel, ${prefix}recipient_type AS "recipientType",
  ${prefix}recipient_id AS "recipientId", ${prefix}recipient_name AS "recipientName", ${prefix}destination, ${prefix}subject, ${prefix}body,
  ${prefix}related_entity_type AS "relatedEntityType", ${prefix}related_entity_id AS "relatedEntityId", ${prefix}dedupe_key AS "dedupeKey",
  ${prefix}status, ${prefix}provider, ${prefix}provider_message_id AS "providerMessageId", ${prefix}attempt_count AS "attemptCount",
  ${prefix}last_error AS "lastError", ${prefix}created_at AS "createdAt", ${prefix}updated_at AS "updatedAt",
  ${prefix}sent_at AS "sentAt", ${prefix}failed_at AS "failedAt"`;

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger('Communication');
  private readonly adapters: Record<CommunicationChannel, CommunicationChannelAdapter>;

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {
    this.adapters = { IN_APP: new InAppAdapter(), EMAIL: new LocalEmailAdapter() };
  }

  // Test seam: simulate EMAIL delivery failures deterministically. Never wired in production code paths.
  overrideEmailAdapterForTesting(predicate: (message: { destination: string | null }) => boolean) {
    this.adapters.EMAIL = new LocalEmailAdapter(predicate);
  }

  // Domain-service entry point: durable message inserts inside the caller's
  // transaction, isolated under a savepoint so a communication failure can
  // never roll back the business mutation. Delivery happens after COMMIT via deliver().
  async dispatchWithinTransaction(client: PoolClient, input: DispatchInput): Promise<DispatchResult> {
    try {
      await client.query('SAVEPOINT communication_dispatch');
      const result = await this.planAndInsert(client, input);
      await client.query('RELEASE SAVEPOINT communication_dispatch');
      return result;
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT communication_dispatch').catch(() => undefined);
      this.logger.warn(
        `Communication dispatch skipped: event=${input.eventType} source=${input.sourceEntityId} error=${sanitizeError(error)}`,
      );
      return { messageIds: [], skippedNoDestination: 0 };
    }
  }

  // Standalone entry point for explicit dispatch (service-level tests now,
  // LOCAL-18 automation later). Owns its transaction and surfaces errors.
  async dispatchEvent(input: DispatchInput): Promise<DispatchResult> {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.planAndInsert(client, input);
      await client.query('COMMIT');
      await this.deliver(result.messageIds);
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async planAndInsert(client: PoolClient, input: DispatchInput): Promise<DispatchResult> {
    const { tenant } = this.tenantContext.get();
    const definition = COMMUNICATION_EVENTS[input.eventType];
    const plans = await definition.buildPlans(client, tenant.tenantId, input.sourceEntityId, input.dedupeScope);
    const requiredVariables = definition.variables.filter((v) => v.required).map((v) => v.name);
    const messageIds: string[] = [];
    let skippedNoDestination = 0;
    for (const plan of plans) {
      for (const channel of ['IN_APP', 'EMAIL'] as const) {
        const template = await this.effectiveTemplate(client, tenant.tenantId, input.eventType, channel);
        if (!template) continue;
        if (channel === 'EMAIL' && !plan.recipient.email) {
          skippedNoDestination += 1;
          continue;
        }
        const rendered = renderTemplate({
          channel,
          requiredVariables,
          subject: template.subject,
          body: template.body,
          context: plan.context,
        });
        const id = await this.insertMessage(client, tenant.tenantId, input, plan, channel, rendered);
        if (id) messageIds.push(id);
      }
    }
    return { messageIds, skippedNoDestination };
  }

  // Effective template: an enabled tenant override wins; a disabled override
  // disables the event/channel; no override falls back to the built-in default.
  private async effectiveTemplate(
    client: PoolClient,
    tenantId: string,
    eventType: CommunicationEventType,
    channel: CommunicationChannel,
  ): Promise<EffectiveTemplate | null> {
    const definition = COMMUNICATION_EVENTS[eventType];
    const row = await client.query<{ subject: string | null; body: string; enabled: boolean }>(
      'SELECT subject, body, enabled FROM communication_templates WHERE tenant_id=$1 AND event_type=$2 AND channel=$3',
      [tenantId, eventType, channel],
    );
    if (row.rows[0]) {
      if (!row.rows[0].enabled) return null;
      return { subject: row.rows[0].subject, body: row.rows[0].body };
    }
    const defaults = definition.defaults[channel];
    return { subject: defaults.subject, body: defaults.body };
  }

  private async insertMessage(
    client: PoolClient,
    tenantId: string,
    input: DispatchInput,
    plan: MessagePlan,
    channel: CommunicationChannel,
    rendered: { subject: string | null; body: string },
  ): Promise<string | null> {
    const definition = COMMUNICATION_EVENTS[input.eventType];
    const dedupeKey = communicationDedupeKey({
      slug: definition.slug,
      sourceEntityId: input.sourceEntityId,
      scope: plan.dedupeScope ?? input.dedupeScope,
      recipient: plan.recipient,
      channel,
    });
    const id = ulid();
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO communication_messages
        (id, tenant_id, event_type, channel, recipient_type, recipient_id, recipient_name, destination, subject, body,
         related_entity_type, related_entity_id, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
       RETURNING id`,
      [
        id,
        tenantId,
        input.eventType,
        channel,
        plan.recipient.type,
        plan.recipient.id,
        plan.recipient.name,
        channel === 'EMAIL' && plan.recipient.email ? normalizeEmail(plan.recipient.email) : null,
        rendered.subject,
        rendered.body,
        plan.relatedEntityType,
        plan.relatedEntityId,
        dedupeKey,
      ],
    );
    return inserted.rows[0]?.id ?? null;
  }

  async deliver(messageIds: readonly string[]): Promise<void> {
    await Promise.all(messageIds.map((id) => this.attemptDelivery(id).catch(() => undefined)));
  }

  async retry(id: string) {
    return this.attemptDelivery(id, true);
  }

  // Sends under the row lock: with only PENDING/SENT/FAILED/CANCELLED statuses
  // there is no in-flight marker, so holding the lock across the (local,
  // deterministic) adapter call is what makes concurrent retries single-send.
  // When LOCAL-22 introduces a real provider this moves out of the transaction.
  private async attemptDelivery(id: string, auditRetry = false) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const current = await client.query<MessageRow>(
        `SELECT ${messageColumns()} FROM communication_messages WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [context.tenant.tenantId, id],
      );
      const message = current.rows[0];
      if (!message) throw new NotFoundException('Message not found');
      if (message.status === 'SENT' || message.status === 'CANCELLED') {
        throw new ConflictException('Only pending or failed messages can be retried');
      }
      if (auditRetry) {
        await this.audit.recordTenant(client, {
          ...actor(context),
          action: 'communication.retry_requested',
          entityType: 'CommunicationMessage',
          entityId: id,
        });
      }
      const adapter = this.adapters[message.channel as CommunicationChannel];
      try {
        const delivery = await adapter.send({
          channel: message.channel as CommunicationChannel,
          destination: message.destination,
          subject: message.subject,
          body: message.body,
        });
        await client.query(
          `UPDATE communication_messages SET status='SENT', provider=$3, provider_message_id=$4, sent_at=CURRENT_TIMESTAMP,
             failed_at=NULL, last_error=NULL, attempt_count=attempt_count+1, updated_at=CURRENT_TIMESTAMP
           WHERE tenant_id=$1 AND id=$2`,
          [context.tenant.tenantId, id, delivery.provider, delivery.providerMessageId],
        );
      } catch (sendError) {
        await client.query(
          `UPDATE communication_messages SET status='FAILED', attempt_count=attempt_count+1, failed_at=CURRENT_TIMESTAMP,
             last_error=$3, updated_at=CURRENT_TIMESTAMP
           WHERE tenant_id=$1 AND id=$2`,
          [context.tenant.tenantId, id, sanitizeError(sendError)],
        );
      }
      await client.query('COMMIT');
      committed = true;
      return this.message(id);
    } catch (error) {
      if (!committed) await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async list(filters: {
    eventType?: string;
    channel?: string;
    status?: string;
    from?: string;
    to?: string;
    recipient?: string;
    studentId?: string;
    leadId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { tenant, pool } = this.tenantContext.get();
    const conditions = ['m.tenant_id = $1'];
    const values: unknown[] = [tenant.tenantId];
    const add = (clause: string, ...vals: unknown[]) => {
      const base = values.length;
      values.push(...vals);
      let index = 0;
      conditions.push(clause.replace(/\?/g, () => `$${base + ++index}`));
    };
    if (filters.eventType) add('m.event_type = ?', filters.eventType);
    if (filters.channel) add('m.channel = ?', filters.channel);
    if (filters.status) add('m.status = ?', filters.status);
    if (filters.from) add('m.created_at >= ?::timestamptz', filters.from);
    if (filters.to) add('m.created_at <= ?::timestamptz', filters.to);
    if (filters.recipient) {
      const needle = `%${filters.recipient}%`;
      add('(m.recipient_name ILIKE ? OR m.destination ILIKE ?)', needle, needle);
    }
    if (filters.studentId) {
      add(
        `((m.recipient_type = 'STUDENT' AND m.recipient_id = ?)
          OR (m.recipient_type = 'GUARDIAN' AND EXISTS (
            SELECT 1 FROM student_guardians sg
            WHERE sg.tenant_id = m.tenant_id AND sg.guardian_id = m.recipient_id AND sg.student_id = ?)))`,
        filters.studentId,
        filters.studentId,
      );
    }
    if (filters.leadId) {
      add(
        `((m.recipient_type = 'LEAD' AND m.recipient_id = ?)
          OR (m.related_entity_type = 'TrialBooking' AND EXISTS (
            SELECT 1 FROM trial_bookings tb
            WHERE tb.tenant_id = m.tenant_id AND tb.id = m.related_entity_id AND tb.lead_id = ?)))`,
        filters.leadId,
        filters.leadId,
      );
    }
    if (filters.cursor) {
      const [createdAt, cursorId] = decodeCursor(filters.cursor);
      add('(m.created_at, m.id) < (?::timestamptz, ?)', createdAt, cursorId);
    }
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    values.push(limit + 1);
    const result = await pool.query<MessageRow>(
      `SELECT ${messageColumns('m.')}
       FROM communication_messages m
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $${values.length}`,
      values,
    );
    const rows = result.rows.slice(0, limit);
    const last = rows[rows.length - 1];
    return {
      data: rows.map(serializeMessage),
      nextCursor: result.rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
    };
  }

  async message(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<MessageRow>(
      `SELECT ${messageColumns()} FROM communication_messages WHERE tenant_id=$1 AND id=$2`,
      [tenant.tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException('Message not found');
    return serializeMessage(result.rows[0]);
  }

  async templates() {
    const { tenant, pool } = this.tenantContext.get();
    const overrides = await pool.query<{ eventType: string; channel: string; subject: string | null; body: string; enabled: boolean }>(
      `SELECT event_type AS "eventType", channel, subject, body, enabled
       FROM communication_templates WHERE tenant_id=$1`,
      [tenant.tenantId],
    );
    const byKey = new Map(overrides.rows.map((row) => [`${row.eventType}:${row.channel}`, row]));
    return COMMUNICATION_EVENT_TYPES.flatMap((eventType) =>
      (['IN_APP', 'EMAIL'] as const).map((channel) => {
        const definition = COMMUNICATION_EVENTS[eventType];
        const override = byKey.get(`${eventType}:${channel}`);
        const effective = override?.enabled ? { subject: override.subject, body: override.body } : definition.defaults[channel];
        return {
          eventType,
          channel,
          timing: definition.timing,
          variables: definition.variables,
          hasOverride: Boolean(override),
          enabled: override ? override.enabled : true,
          effectiveSubject: effective.subject,
          effectiveBody: effective.body,
        };
      }),
    );
  }

  async upsertTemplate(eventType: CommunicationEventType, channel: CommunicationChannel, input: { subject?: string; body: string; enabled?: boolean }) {
    const context = this.tenantContext.get();
    const definition = COMMUNICATION_EVENTS[eventType];
    const allowed = definition.variables.map((v) => v.name);
    const required = definition.variables.filter((v) => v.required).map((v) => v.name);
    const problems = validateTemplateContent({ channel, allowedVariables: allowed, subject: input.subject, body: input.body });
    if (problems.length > 0) throw new ConflictException(problems.join('; '));
    // A template that cannot render must be rejected at save time; builders always
    // populate every allowlisted variable (empty string when absent).
    const fixtures = Object.fromEntries(allowed.map((name) => [name, FIXTURE_CONTEXT[name] ?? '']));
    renderTemplate({ channel, requiredVariables: required, subject: input.subject, body: input.body, context: fixtures });
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO communication_templates (id, tenant_id, event_type, channel, subject, body, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, TRUE))
         ON CONFLICT (tenant_id, event_type, channel) DO UPDATE
           SET subject=$5, body=$6, enabled=COALESCE($7, communication_templates.enabled), updated_at=CURRENT_TIMESTAMP`,
        [ulid(), context.tenant.tenantId, eventType, channel, input.subject ?? null, input.body, input.enabled ?? null],
      );
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: 'communication.template_updated',
        entityType: 'CommunicationTemplate',
        entityId: `${eventType}:${channel}`,
        after: { eventType, channel, subject: input.subject ?? null, enabled: input.enabled ?? undefined },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return this.template(eventType, channel);
  }

  async resetTemplate(eventType: CommunicationEventType, channel: CommunicationChannel) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const deleted = await client.query(
        'DELETE FROM communication_templates WHERE tenant_id=$1 AND event_type=$2 AND channel=$3',
        [context.tenant.tenantId, eventType, channel],
      );
      if (!deleted.rowCount) throw new NotFoundException('Template override not found');
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: 'communication.template_reset',
        entityType: 'CommunicationTemplate',
        entityId: `${eventType}:${channel}`,
        after: { eventType, channel },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return this.template(eventType, channel);
  }

  async setTemplateEnabled(eventType: CommunicationEventType, channel: CommunicationChannel, enabled: boolean) {
    const context = this.tenantContext.get();
    const definition = COMMUNICATION_EVENTS[eventType];
    const defaults = definition.defaults[channel];
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO communication_templates (id, tenant_id, event_type, channel, subject, body, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id, event_type, channel) DO UPDATE SET enabled=$7, updated_at=CURRENT_TIMESTAMP`,
        [ulid(), context.tenant.tenantId, eventType, channel, defaults.subject, defaults.body, enabled],
      );
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: enabled ? 'communication.template_enabled' : 'communication.template_disabled',
        entityType: 'CommunicationTemplate',
        entityId: `${eventType}:${channel}`,
        after: { eventType, channel, enabled },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return this.template(eventType, channel);
  }

  async previewTemplate(eventType: CommunicationEventType, channel: CommunicationChannel, draft?: { subject?: string; body: string }) {
    const definition = COMMUNICATION_EVENTS[eventType];
    const allowed = definition.variables.map((v) => v.name);
    const required = definition.variables.filter((v) => v.required).map((v) => v.name);
    let subject = draft?.subject;
    let body = draft?.body;
    if (!draft) {
      const effective = await this.effectiveTemplateOnPool(this.tenantContext.get(), eventType, channel);
      subject = effective?.subject ?? undefined;
      body = effective?.body;
      if (!effective) throw new ConflictException('Template is disabled');
    }
    const problems = validateTemplateContent({ channel, allowedVariables: allowed, subject, body: body! });
    if (problems.length > 0) throw new ConflictException(problems.join('; '));
    const context = Object.fromEntries(definition.variables.map((v) => [v.name, FIXTURE_CONTEXT[v.name] ?? '']));
    const rendered = renderTemplate({ channel, requiredVariables: required, subject, body: body!, context });
    return { eventType, channel, subject: rendered.subject, body: rendered.body, variables: definition.variables };
  }

  private async effectiveTemplateOnPool(
    context: ReturnType<TenantContextService['get']>,
    eventType: CommunicationEventType,
    channel: CommunicationChannel,
  ): Promise<EffectiveTemplate | null> {
    const row = await context.pool.query<{ subject: string | null; body: string; enabled: boolean }>(
      'SELECT subject, body, enabled FROM communication_templates WHERE tenant_id=$1 AND event_type=$2 AND channel=$3',
      [context.tenant.tenantId, eventType, channel],
    );
    if (row.rows[0]) {
      if (!row.rows[0].enabled) return null;
      return { subject: row.rows[0].subject, body: row.rows[0].body };
    }
    return COMMUNICATION_EVENTS[eventType].defaults[channel];
  }

  private async template(eventType: CommunicationEventType, channel: CommunicationChannel) {
    const all = await this.templates();
    const found = all.find((t) => t.eventType === eventType && t.channel === channel);
    if (!found) throw new NotFoundException('Template not found');
    return found;
  }
}

const encodeCursor = (createdAt: string, id: string) => Buffer.from(`${createdAt}|${id}`).toString('base64url');
const decodeCursor = (cursor: string): [string, string] => {
  const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!createdAt || !id) throw new ConflictException('Invalid cursor');
  return [createdAt, id];
};
