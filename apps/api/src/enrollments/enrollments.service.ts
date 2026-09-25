import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { EnrollmentInitialStatus, type CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import type { EnrollmentCommandDto, TransferEnrollmentDto } from './dto/update-enrollment.dto.js';

type EnrollmentStatus = 'PENDING' | 'TRIAL' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'WITHDRAWN' | 'CANCELLED';
type EnrollmentRow = QueryResultRow & { id: string; tenantId: string; studentId: string; classId: string; status: EnrollmentStatus; enrolledAt: Date; startedAt: Date | null; endedAt: Date | null; pauseStartedAt: Date | null; expectedEndDate: Date | string | null; sourceEnrollmentId: string | null; notes: string | null; createdAt: Date; updatedAt: Date };
type HistoryRow = QueryResultRow & { id: string; type: string; fromStatus: EnrollmentStatus | null; toStatus: EnrollmentStatus | null; fromClassId: string | null; toClassId: string | null; reason: string | null; metadata: Record<string, unknown> | null; actorUserId: string | null; actorMembershipId: string | null; occurredAt: Date };

const columns = `e.id, e.tenant_id AS "tenantId", e.student_id AS "studentId", e.class_id AS "classId", e.status,
  e.enrolled_at AS "enrolledAt", e.started_at AS "startedAt", e.ended_at AS "endedAt", e.pause_started_at AS "pauseStartedAt",
  e.expected_end_date AS "expectedEndDate", e.source_enrollment_id AS "sourceEnrollmentId", e.notes,
  e.created_at AS "createdAt", e.updated_at AS "updatedAt"`;
const consuming = "('PENDING', 'TRIAL', 'ACTIVE', 'PAUSED')";
const terminal = "('COMPLETED', 'WITHDRAWN', 'CANCELLED')";

function dateValue(value: Date | string | null) { return value == null ? null : typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10); }
function serialize(row: EnrollmentRow) { return { ...row, enrolledAt: row.enrolledAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null, endedAt: row.endedAt?.toISOString() ?? null, pauseStartedAt: row.pauseStartedAt?.toISOString() ?? null, expectedEndDate: dateValue(row.expectedEndDate), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
function actor(context: ReturnType<TenantContextService['get']>) { return { tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId, actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId }; }
function pgConstraint(error: unknown) { return typeof error === 'object' && error !== null && 'constraint' in error ? error.constraint : undefined; }

@Injectable()
export class EnrollmentsService {
  constructor(private readonly tenantContext: TenantContextService, private readonly audit: AuditService) {}

  async create(input: CreateEnrollmentDto) {
    const context = this.tenantContext.get(); const client = await this.client(context.pool);
    try {
      await client.query('BEGIN');
      const enrollment = await this.createInTransaction(client, input);
      await client.query('COMMIT');
      return enrollment;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); if (pgConstraint(error) === 'enrollments_operational_student_class_key') throw new ConflictException('Student already has an operational enrollment in this class'); throw error; } finally { client.release(); }
  }

  async createInTransaction(client: PoolClient, input: CreateEnrollmentDto) {
    const context = this.tenantContext.get(); const id = ulid();
    const status = (input.status ?? 'PENDING') as EnrollmentInitialStatus;
    await this.validateStudentAndClass(client, context.tenant.tenantId, input.studentId, input.classId, status !== 'PENDING');
    await this.lockCapacity(client, context.tenant.tenantId, input.classId, status);
    const result = await client.query<EnrollmentRow>(`INSERT INTO enrollments (id, tenant_id, student_id, class_id, status, enrolled_at, started_at, expected_end_date, source_enrollment_id, notes)
      VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,CURRENT_TIMESTAMP),$7,$8,$9,$10) RETURNING ${columns.replaceAll('e.', '')}`, [id, context.tenant.tenantId, input.studentId, input.classId, status, input.enrolledAt ?? null, status === 'ACTIVE' ? input.enrolledAt ?? null : null, input.expectedEndDate ?? null, null, input.notes ?? null]);
    const enrollment = result.rows[0];
    if (!enrollment) throw new ConflictException('Enrollment could not be created');
    await this.event(client, context, enrollment, 'ENROLLED', null, status, null, input.classId, null);
    if (status === 'ACTIVE') await this.event(client, context, enrollment, 'ACTIVATED', status, status, null, input.classId, null);
    if (status === 'TRIAL') await this.event(client, context, enrollment, 'TRIAL_STARTED', status, status, null, input.classId, null);
    await this.audit.recordTenant(client, { ...actor(context), action: 'enrollment.created', entityType: 'ENROLLMENT', entityId: id, after: serialize(enrollment) });
    return serialize(enrollment);
  }

  async transition(id: string, command: 'activate' | 'trial' | 'pause' | 'resume' | 'withdraw' | 'complete' | 'cancel', input: EnrollmentCommandDto = {}) {
    const context = this.tenantContext.get(); const client = await this.client(context.pool);
    try {
      await client.query('BEGIN');
      const updated = await this.transitionInTransaction(client, id, command, input);
      await client.query('COMMIT');
      return updated;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
  }

  async transitionInTransaction(client: PoolClient, id: string, command: 'activate' | 'trial' | 'pause' | 'resume' | 'withdraw' | 'complete' | 'cancel', input: EnrollmentCommandDto = {}) {
    const context = this.tenantContext.get();
    const target: Record<string, EnrollmentStatus> = { activate: 'ACTIVE', trial: 'TRIAL', pause: 'PAUSED', resume: 'ACTIVE', withdraw: 'WITHDRAWN', complete: 'COMPLETED', cancel: 'CANCELLED' };
    const eventTypes: Record<string, string> = { activate: 'ACTIVATED', trial: 'TRIAL_STARTED', pause: 'PAUSED', resume: 'RESUMED', withdraw: 'WITHDRAWN', complete: 'COMPLETED', cancel: 'CANCELLED' };
    const current = await this.locked(client, context.tenant.tenantId, id); const next = target[command];
    if (!allowed(current.status, next)) throw new ConflictException(`Cannot transition enrollment from ${current.status} to ${next}`);
    if (next === 'ACTIVE' || next === 'PAUSED') await this.lockCapacity(client, context.tenant.tenantId, current.classId, next, id);
    const at = input.effectiveAt ? new Date(input.effectiveAt) : new Date();
    const result = await client.query<EnrollmentRow>(`UPDATE enrollments AS e SET status=$3, started_at=CASE WHEN $3='ACTIVE' AND started_at IS NULL THEN $4 ELSE started_at END, pause_started_at=CASE WHEN $3='PAUSED' THEN $4 ELSE NULL END, ended_at=CASE WHEN $3 IN ${terminal} THEN $4 ELSE NULL END, updated_at=CURRENT_TIMESTAMP WHERE e.tenant_id=$1 AND e.id=$2 RETURNING ${columns}`,[context.tenant.tenantId,id,next,at]);
    const updated = result.rows[0]; await this.event(client, context, updated, eventTypes[command], current.status, next, current.classId, current.classId, input.reason ?? null); await this.audit.recordTenant(client, { ...actor(context), action: `enrollment.${eventTypes[command].toLowerCase()}`, entityType: 'ENROLLMENT', entityId: id, before: serialize(current), after: serialize(updated), reason: input.reason });
    return serialize(updated);
  }

  async transfer(id: string, input: TransferEnrollmentDto) {
    const context = this.tenantContext.get(); const client = await this.client(context.pool);
    try {
      await client.query('BEGIN'); const source = await this.locked(client, context.tenant.tenantId, id); if (!['PENDING','TRIAL','ACTIVE','PAUSED'].includes(source.status)) throw new ConflictException('Only operational enrollments can be transferred');
      if (source.classId === input.destinationClassId) throw new BadRequestException('Destination class must be different');
      await this.validateStudentAndClass(client, context.tenant.tenantId, source.studentId, input.destinationClassId, source.status === 'ACTIVE'); await this.lockCapacity(client, context.tenant.tenantId, input.destinationClassId, source.status);
      const destinationId = ulid(); const at = input.effectiveAt ? new Date(input.effectiveAt) : new Date();
      const inserted = await client.query<EnrollmentRow>(`INSERT INTO enrollments (id,tenant_id,student_id,class_id,status,enrolled_at,started_at,source_enrollment_id,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${columns.replaceAll('e.', '')}`,[destinationId,context.tenant.tenantId,source.studentId,input.destinationClassId,source.status,at,source.startedAt ?? (source.status === 'ACTIVE' ? at : null),source.id,source.notes]);
      const destination = inserted.rows[0]; const closed = (await client.query<EnrollmentRow>(`UPDATE enrollments AS e SET status='WITHDRAWN', ended_at=$3, updated_at=CURRENT_TIMESTAMP WHERE e.tenant_id=$1 AND e.id=$2 RETURNING ${columns}`,[context.tenant.tenantId,id,at])).rows[0];
      await this.event(client, context, closed, 'TRANSFERRED', source.status, 'WITHDRAWN', source.classId, input.destinationClassId, input.reason ?? null); await this.event(client, context, destination, 'TRANSFERRED', null, destination.status, source.classId, input.destinationClassId, input.reason ?? null); await this.audit.recordTenant(client, { ...actor(context), action: 'enrollment.transferred', entityType: 'ENROLLMENT', entityId: destinationId, before: serialize(source), after: serialize(destination), reason: input.reason, metadata: { sourceEnrollmentId: id } }); await client.query('COMMIT'); return serialize(destination);
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); if (pgConstraint(error) === 'enrollments_operational_student_class_key') throw new ConflictException('Student already has an operational enrollment in the destination class'); throw error; } finally { client.release(); }
  }

  async reenroll(id: string, input: CreateEnrollmentDto) {
    const context = this.tenantContext.get(); const client = await this.client(context.pool);
    try {
      await client.query('BEGIN');
      const destination = await this.reenrollInTransaction(client, id, input);
      await client.query('COMMIT');
      return destination;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); if (pgConstraint(error) === 'enrollments_operational_student_class_key') throw new ConflictException('Student already has an operational enrollment in this class'); throw error; } finally { client.release(); }
  }

  async reenrollInTransaction(client: PoolClient, id: string, input: CreateEnrollmentDto) {
    const context = this.tenantContext.get(); const destinationId = ulid();
    const status = (input.status ?? EnrollmentInitialStatus.ACTIVE) as EnrollmentInitialStatus;
    const source = await this.locked(client, context.tenant.tenantId, id);
    if (!['COMPLETED', 'WITHDRAWN', 'CANCELLED'].includes(source.status)) throw new ConflictException('Only terminal enrollments can be re-enrolled');
    if (input.studentId !== source.studentId) throw new BadRequestException('Student must match the source enrollment');
    await this.validateStudentAndClass(client, context.tenant.tenantId, source.studentId, input.classId, status !== 'PENDING');
    await this.lockCapacity(client, context.tenant.tenantId, input.classId, status);
    const inserted = await client.query<EnrollmentRow>(`INSERT INTO enrollments (id,tenant_id,student_id,class_id,status,enrolled_at,started_at,expected_end_date,source_enrollment_id,notes)
      VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,CURRENT_TIMESTAMP),$7,$8,$9,$10) RETURNING ${columns.replaceAll('e.', '')}`,[destinationId,context.tenant.tenantId,source.studentId,input.classId,status,input.enrolledAt ?? null,status === 'ACTIVE' ? input.enrolledAt ?? null : null,input.expectedEndDate ?? null,source.id,input.notes ?? null]);
    const destination = inserted.rows[0];
    if (!destination) throw new ConflictException('Enrollment could not be created');
    await this.event(client, context, destination, 'REENROLLED', source.status, status, source.classId, input.classId, null);
    await this.audit.recordTenant(client, { ...actor(context), action: 'enrollment.reenrolled', entityType: 'ENROLLMENT', entityId: destinationId, before: serialize(source), after: serialize(destination), metadata: { sourceEnrollmentId: source.id } });
    return serialize(destination);
  }
  async get(id: string) { const { tenant, pool } = this.tenantContext.get(); const result = await pool.query<EnrollmentRow>(`SELECT ${columns} FROM enrollments e WHERE e.tenant_id=$1 AND e.id=$2`, [tenant.tenantId,id]); if (!result.rows[0]) throw new NotFoundException('Enrollment not found'); return serialize(result.rows[0]); }
  async history(id: string) { const { tenant, pool } = this.tenantContext.get(); const exists = await pool.query('SELECT 1 FROM enrollments WHERE tenant_id=$1 AND id=$2',[tenant.tenantId,id]); if (!exists.rows[0]) throw new NotFoundException('Enrollment not found'); const result = await pool.query<HistoryRow>(`SELECT id,type,from_status AS "fromStatus",to_status AS "toStatus",from_class_id AS "fromClassId",to_class_id AS "toClassId",reason,metadata,actor_user_id AS "actorUserId",actor_membership_id AS "actorMembershipId",occurred_at AS "occurredAt" FROM enrollment_events WHERE tenant_id=$1 AND enrollment_id=$2 ORDER BY occurred_at ASC,id ASC`,[tenant.tenantId,id]); return result.rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })); }
  async listStudents(classId: string) { const { tenant, pool } = this.tenantContext.get(); await this.assertExists(pool, 'classes', classId, 'Class'); const result = await pool.query(`SELECT ${columns},s.code AS "studentCode",s.full_name AS "studentFullName" FROM enrollments e JOIN students s ON s.tenant_id=e.tenant_id AND s.id=e.student_id WHERE e.tenant_id=$1 AND e.class_id=$2 ORDER BY s.full_name,e.id`,[tenant.tenantId,classId]); return result.rows.map(serialize); }
  async listClasses(studentId: string) { const { tenant, pool } = this.tenantContext.get(); await this.assertExists(pool, 'students', studentId, 'Student'); const result = await pool.query(`SELECT ${columns},c.code AS "classCode",c.name AS "className" FROM enrollments e JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id WHERE e.tenant_id=$1 AND e.student_id=$2 ORDER BY c.name,e.id`,[tenant.tenantId,studentId]); return result.rows.map(serialize); }

  private async client(pool: { connect?: () => Promise<PoolClient>; query: PoolClient['query'] }) {
    if (pool.connect) return pool.connect();
    return { query: pool.query.bind(pool), release() {} } as unknown as PoolClient;
  }

  private async validateStudentAndClass(client: PoolClient, tenantId: string, studentId: string, classId: string, active: boolean) { const student = await client.query<{ status: string }>('SELECT status FROM students WHERE tenant_id=$1 AND id=$2 FOR SHARE',[tenantId,studentId]); if (!student.rows[0]) throw new NotFoundException('Student not found'); if (active && student.rows[0].status !== 'ACTIVE') throw new ConflictException('Student is disabled'); const classRow = await client.query<{ status: string }>('SELECT status FROM classes WHERE tenant_id=$1 AND id=$2 FOR SHARE',[tenantId,classId]); if (!classRow.rows[0]) throw new NotFoundException('Class not found'); if (classRow.rows[0].status !== 'ACTIVE' && active) throw new ConflictException('Class is disabled'); }
  private async lockCapacity(client: PoolClient, tenantId: string, classId: string, status: string, excludeId?: string) { if (!['PENDING','TRIAL','ACTIVE','PAUSED'].includes(status)) return; const row = await client.query<{ capacity: number | null }>('SELECT capacity FROM classes WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,classId]); if (!row.rows[0]) throw new NotFoundException('Class not found'); if (row.rows[0].capacity == null) return; const values: unknown[] = [tenantId,classId]; const exclude = excludeId ? ` AND id <> $3` : ''; if (excludeId) values.push(excludeId); const count = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM enrollments WHERE tenant_id=$1 AND class_id=$2 AND status IN ${consuming}${exclude}`,values); if (Number(count.rows[0].count) >= row.rows[0].capacity) throw new ConflictException('Class capacity is full'); }
  private async locked(client: PoolClient, tenantId: string, id: string) { const result = await client.query<EnrollmentRow>(`SELECT ${columns} FROM enrollments e WHERE e.tenant_id=$1 AND e.id=$2 FOR UPDATE`,[tenantId,id]); if (!result.rows[0]) throw new NotFoundException('Enrollment not found'); return result.rows[0]; }
  private async assertExists(pool: { query: PoolClient['query'] }, table: string, id: string, label: string) { const result = await pool.query(`SELECT 1 FROM ${table} WHERE tenant_id=$1 AND id=$2`,[this.tenantContext.get().tenant.tenantId,id]); if (!result.rows[0]) throw new NotFoundException(`${label} not found`); }
  private async event(client: PoolClient, context: ReturnType<TenantContextService['get']>, enrollment: EnrollmentRow, type: string, fromStatus: EnrollmentStatus | null, toStatus: EnrollmentStatus | null, fromClassId: string | null, toClassId: string | null, reason: string | null) { await client.query(`INSERT INTO enrollment_events (id,tenant_id,enrollment_id,type,from_status,to_status,from_class_id,to_class_id,reason,actor_user_id,actor_membership_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[ulid(),context.tenant.tenantId,enrollment.id,type,fromStatus,toStatus,fromClassId,toClassId,reason ?? null,context.actorUserId ?? null,context.actorMembershipId ?? null]); }
}

function allowed(from: EnrollmentStatus, to: EnrollmentStatus) { return ({ PENDING: ['ACTIVE','TRIAL','CANCELLED'], TRIAL: ['ACTIVE','CANCELLED','WITHDRAWN'], ACTIVE: ['PAUSED','COMPLETED','WITHDRAWN'], PAUSED: ['ACTIVE','WITHDRAWN'] } as Record<string, string[]>)[from]?.includes(to) ?? false; }
