import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import type { AuditJson } from '../audit/audit.types.js';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { calculateAmount, durationMinutes, type CompensationBasis } from './calculation.js';
import type { CreateCompensationAdjustmentDto, CreateCompensationAgreementDto, CreateCompensationPeriodDto, EndCompensationAgreementDto } from './dto/compensation.dto.js';

type Context = ReturnType<TenantContextService['get']>;
type Agreement = QueryResultRow & { id: string; teacherId: string; teacherCode: string; teacherName: string; classId: string | null; classCode: string | null; className: string | null; basis: CompensationBasis; rateVnd: bigint; effectiveFrom: string; effectiveUntil: string | null; status: string; notes: string | null };
const agreementSelect = `SELECT a.id, a.teacher_id AS "teacherId", t.code AS "teacherCode", t.name AS "teacherName", a.class_id AS "classId", c.code AS "classCode", c.name AS "className", c.completed_on::text AS "completedOn", a.basis, a.rate_vnd AS "rateVnd", a.effective_from::text AS "effectiveFrom", a.effective_until::text AS "effectiveUntil", a.status, a.notes FROM compensation_agreements a JOIN teachers t ON t.tenant_id=a.tenant_id AND t.id=a.teacher_id LEFT JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id`;
const serialize = (value: unknown): unknown => value instanceof Date ? value.toISOString() : typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(serialize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)])) : value;
const auditJson = (value: unknown): AuditJson => serialize(value) as AuditJson;
const actor = (context: Context) => ({ tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId, actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId });
const day = (value: unknown) => String(value).slice(0, 10);

@Injectable()
export class CompensationService {
  constructor(private readonly tenantContext: TenantContextService, private readonly audit: AuditService) {}
  private context() { return this.tenantContext.get(); }
  private async transaction<T>(fn: (client: PoolClient, context: Context) => Promise<T>) { const context = this.context(); const client = await context.pool.connect(); try { await client.query('BEGIN'); const result = await fn(client, context); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); } }
  private async lock(client: PoolClient, tenantId: string) { await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`compensation:${tenantId}`]); }
  private async findAgreement(client: PoolClient, tenantId: string, id: string, forUpdate = false) { const result = await client.query<Agreement>(`${agreementSelect} WHERE a.tenant_id=$1 AND a.id=$2 ${forUpdate ? 'FOR UPDATE OF a' : ''}`, [tenantId, id]); if (!result.rows[0]) throw new NotFoundException('Compensation agreement not found'); return result.rows[0]; }

  async agreements() { const { tenant, pool } = this.context(); const result = await pool.query<Agreement>(`${agreementSelect} WHERE a.tenant_id=$1 ORDER BY a.effective_from DESC, a.id DESC`, [tenant.tenantId]); return result.rows.map((row) => serialize(row)); }
  async getAgreement(id: string) { const { tenant, pool } = this.context(); const result = await pool.query<Agreement>(`${agreementSelect} WHERE a.tenant_id=$1 AND a.id=$2`, [tenant.tenantId, id]); if (!result.rows[0]) throw new NotFoundException('Compensation agreement not found'); return serialize(result.rows[0]); }
  async references() { const { tenant, pool } = this.context(); const [teachers, classes] = await Promise.all([pool.query(`SELECT id, code, name FROM teachers WHERE tenant_id=$1 AND status='ACTIVE' ORDER BY name,id`, [tenant.tenantId]), pool.query(`SELECT id, code, name FROM classes WHERE tenant_id=$1 AND status IN ('ACTIVE','COMPLETED') ORDER BY name,id`, [tenant.tenantId])]); return { teachers: teachers.rows, classes: classes.rows }; }
  async teacherSummary(teacherId: string) {
    const { tenant, pool } = this.context();
    const teacher = await pool.query('SELECT id, code, name FROM teachers WHERE tenant_id=$1 AND id=$2', [tenant.tenantId, teacherId]);
    if (!teacher.rows[0]) throw new NotFoundException('Teacher not found');
    const [agreements, statements] = await Promise.all([
      pool.query<Agreement>(`${agreementSelect} WHERE a.tenant_id=$1 AND a.teacher_id=$2 ORDER BY a.effective_from DESC,a.id DESC`, [tenant.tenantId, teacherId]),
      pool.query(`SELECT s.id,s.period_id AS "periodId",p.period_start::text AS "periodStart",p.period_end::text AS "periodEnd",s.earnings_vnd AS "earningsVnd",s.adjustments_vnd AS "adjustmentsVnd",s.payable_vnd AS "payableVnd" FROM teacher_compensation_statements s JOIN compensation_periods p ON p.tenant_id=s.tenant_id AND p.id=s.period_id WHERE s.tenant_id=$1 AND s.teacher_id=$2 AND p.status='FINALIZED' ORDER BY p.period_end DESC,p.id DESC LIMIT 12`, [tenant.tenantId, teacherId]),
    ]);
    return serialize({ teacher: teacher.rows[0], agreements: agreements.rows, statements: statements.rows });
  }

  async createAgreement(input: CreateCompensationAgreementDto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) || (input.effectiveUntil !== undefined && input.effectiveUntil !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveUntil))) throw new BadRequestException('Agreement dates must be calendar dates');
    const from = new Date(`${input.effectiveFrom}T00:00:00Z`);
    const until = input.effectiveUntil ? new Date(`${input.effectiveUntil}T00:00:00Z`) : null;
    if (Number.isNaN(from.getTime()) || from.toISOString().slice(0, 10) !== input.effectiveFrom || (until && (Number.isNaN(until.getTime()) || until.toISOString().slice(0, 10) !== input.effectiveUntil))) throw new BadRequestException('Agreement dates must be calendar dates');
    return this.transaction(async (client, context) => {
      await this.lock(client, context.tenant.tenantId);
      if (input.basis === 'FIXED_CLASS' && !input.classId) throw new BadRequestException('Fixed-class agreement requires a class');
      if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) throw new BadRequestException('Effective end must be on or after start');
      const teacher = await client.query('SELECT id FROM teachers WHERE tenant_id=$1 AND id=$2', [context.tenant.tenantId, input.teacherId]);
      if (!teacher.rows[0]) throw new NotFoundException('Teacher not found');
      if (input.classId) { const classRow = await client.query('SELECT id FROM classes WHERE tenant_id=$1 AND id=$2', [context.tenant.tenantId, input.classId]); if (!classRow.rows[0]) throw new NotFoundException('Class not found'); }
      const id = ulid();
      try { await client.query(`INSERT INTO compensation_agreements (id,tenant_id,teacher_id,class_id,basis,rate_vnd,effective_from,effective_until,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, context.tenant.tenantId, input.teacherId, input.classId ?? null, input.basis, BigInt(input.rateVnd), input.effectiveFrom, input.effectiveUntil ?? null, input.effectiveUntil ? 'ENDED' : 'ACTIVE', input.notes ?? null]); } catch (error) { if ((error as { code?: string }).code === 'P0001') throw new ConflictException('Agreement dates overlap'); throw error; }
      const row = await this.findAgreement(client, context.tenant.tenantId, id);
      await this.audit.recordTenant(client, { ...actor(context), action: 'compensation.agreement_created', entityType: 'COMPENSATION_AGREEMENT', entityId: id, after: auditJson(row) });
      return serialize(row);
    });
  }

  async endAgreement(id: string, input: EndCompensationAgreementDto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveUntil)) throw new BadRequestException('Agreement date must be a calendar date');
    const until = new Date(`${input.effectiveUntil}T00:00:00Z`);
    if (Number.isNaN(until.getTime()) || until.toISOString().slice(0, 10) !== input.effectiveUntil) throw new BadRequestException('Agreement date must be a calendar date');
    return this.transaction(async (client, context) => {
      await this.lock(client, context.tenant.tenantId);
      const old = await this.findAgreement(client, context.tenant.tenantId, id, true);
      if (old.status === 'ENDED') throw new ConflictException('Agreement is already ended');
      if (input.effectiveUntil < day(old.effectiveFrom)) throw new BadRequestException('Effective end must be on or after start');
      await client.query(`UPDATE compensation_agreements SET status='ENDED', effective_until=$1, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$2 AND id=$3`, [input.effectiveUntil, context.tenant.tenantId, id]);
      const row = await this.findAgreement(client, context.tenant.tenantId, id);
      await this.audit.recordTenant(client, { ...actor(context), action: 'compensation.agreement_ended', entityType: 'COMPENSATION_AGREEMENT', entityId: id, before: auditJson(old), after: auditJson(row) });
      return serialize(row);
    });
  }

  async replaceAgreement(id: string, input: CreateCompensationAgreementDto) {
    return this.transaction(async (client, context) => {
      await this.lock(client, context.tenant.tenantId);
      const old = await this.findAgreement(client, context.tenant.tenantId, id, true);
      if (input.teacherId !== old.teacherId || (input.classId ?? null) !== old.classId || input.basis !== old.basis) throw new BadRequestException('Replacement must keep the agreement scope and basis');
      if (input.effectiveFrom <= day(old.effectiveFrom)) throw new BadRequestException('Replacement must start after the existing agreement');
      const replacementEnd = new Date(`${input.effectiveFrom}T00:00:00Z`); replacementEnd.setUTCDate(replacementEnd.getUTCDate() - 1); const endDate = replacementEnd.toISOString().slice(0, 10);
      await client.query(`UPDATE compensation_agreements SET status='ENDED', effective_until=$1, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$2 AND id=$3`, [endDate, context.tenant.tenantId, id]);
      const newId = ulid(); await client.query(`INSERT INTO compensation_agreements (id,tenant_id,teacher_id,class_id,basis,rate_vnd,effective_from,effective_until,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [newId, context.tenant.tenantId, input.teacherId, input.classId ?? null, input.basis, BigInt(input.rateVnd), input.effectiveFrom, input.effectiveUntil ?? null, input.effectiveUntil ? 'ENDED' : 'ACTIVE', input.notes ?? null]);
      const created = await this.findAgreement(client, context.tenant.tenantId, newId); await this.audit.recordTenant(client, { ...actor(context), action: 'compensation.agreement_replaced', entityType: 'COMPENSATION_AGREEMENT', entityId: newId, before: { id: old.id, effectiveUntil: endDate }, after: auditJson(created) }); return serialize(created);
    });
  }

  async periods() { const { tenant, pool } = this.context(); const result = await pool.query(`SELECT id,tenant_id AS "tenantId",period_start::text AS "periodStart",period_end::text AS "periodEnd",status,generated_at AS "generatedAt",finalized_at AS "finalizedAt",finalized_by_user_id AS "finalizedByUserId",created_at AS "createdAt",updated_at AS "updatedAt" FROM compensation_periods WHERE tenant_id=$1 ORDER BY period_start DESC,id DESC`, [tenant.tenantId]); return result.rows.map((row) => serialize(row)); }
  async period(id: string) { const { tenant, pool } = this.context(); const result = await pool.query(`SELECT id,tenant_id AS "tenantId",period_start::text AS "periodStart",period_end::text AS "periodEnd",status,generated_at AS "generatedAt",finalized_at AS "finalizedAt",finalized_by_user_id AS "finalizedByUserId",created_at AS "createdAt",updated_at AS "updatedAt" FROM compensation_periods WHERE tenant_id=$1 AND id=$2`, [tenant.tenantId, id]); if (!result.rows[0]) throw new NotFoundException('Compensation period not found'); return serialize(result.rows[0]); }
  async createPeriod(input: CreateCompensationPeriodDto) { if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)) throw new BadRequestException('Compensation period must use calendar dates'); const start = new Date(`${input.periodStart}T00:00:00Z`); const end = new Date(`${input.periodEnd}T00:00:00Z`); if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== input.periodStart || Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== input.periodEnd) throw new BadRequestException('Compensation period must use calendar dates'); if (input.periodEnd < input.periodStart) throw new BadRequestException('Period end must be on or after start'); const context = this.context(); const id = ulid(); try { await context.pool.query('INSERT INTO compensation_periods (id,tenant_id,period_start,period_end) VALUES ($1,$2,$3,$4)', [id, context.tenant.tenantId, input.periodStart, input.periodEnd]); } catch (error) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Compensation period already exists'); throw error; } return this.period(id); }

  async statements(periodId: string) { const { tenant, pool } = this.context(); const [statements, unresolved] = await Promise.all([pool.query(`SELECT s.id,s.period_id AS "periodId",s.teacher_id AS "teacherId",t.code AS "teacherCode",t.name AS "teacherName",s.earnings_vnd AS "earningsVnd",s.adjustments_vnd AS "adjustmentsVnd",s.payable_vnd AS "payableVnd" FROM teacher_compensation_statements s JOIN teachers t ON t.tenant_id=s.tenant_id AND t.id=s.teacher_id WHERE s.tenant_id=$1 AND s.period_id=$2 ORDER BY t.name,t.id`, [tenant.tenantId, periodId]), pool.query(`SELECT u.id,u.session_id AS "sessionId",u.teacher_id AS "teacherId",t.code AS "teacherCode",t.name AS "teacherName",c.code AS "classCode",c.name AS "className",u.work_date::text AS "workDate",u.reason_code AS "reasonCode",u.description FROM unresolved_compensation u LEFT JOIN teachers t ON t.tenant_id=u.tenant_id AND t.id=u.teacher_id JOIN classes c ON c.tenant_id=u.tenant_id AND c.id=u.class_id WHERE u.tenant_id=$1 AND u.period_id=$2 ORDER BY u.work_date,u.id`, [tenant.tenantId, periodId])]); return { statements: statements.rows.map((row) => serialize(row)), unresolved: unresolved.rows.map((row) => serialize(row)) }; }
  private async readStatement(client: Pick<PoolClient, 'query'>, tenantId: string, id: string) {
    const statement = await client.query(`SELECT s.id,s.period_id AS "periodId",p.status AS "periodStatus",s.teacher_id AS "teacherId",t.code AS "teacherCode",t.name AS "teacherName",s.earnings_vnd AS "earningsVnd",s.adjustments_vnd AS "adjustmentsVnd",s.payable_vnd AS "payableVnd" FROM teacher_compensation_statements s JOIN compensation_periods p ON p.tenant_id=s.tenant_id AND p.id=s.period_id JOIN teachers t ON t.tenant_id=s.tenant_id AND t.id=s.teacher_id WHERE s.tenant_id=$1 AND s.id=$2`, [tenantId, id]);
    if (!statement.rows[0]) throw new NotFoundException('Compensation statement not found');
    const [items, adjustments] = await Promise.all([
      client.query(`SELECT id,source_kind AS "sourceKind",work_date::text AS "workDate",start_time AS "startTime",end_time AS "endTime",duration_minutes AS "durationMinutes",basis,rate_vnd AS "rateVnd",amount_vnd AS "amountVnd",class_code AS "classCode",class_name AS "className",description FROM compensation_items WHERE tenant_id=$1 AND statement_id=$2 ORDER BY work_date,id`, [tenantId, id]),
      client.query(`SELECT id,amount_vnd AS "amountVnd",reason,created_at AS "createdAt" FROM compensation_adjustments WHERE tenant_id=$1 AND statement_id=$2 ORDER BY created_at,id`, [tenantId, id]),
    ]);
    return serialize({ ...statement.rows[0], items: items.rows, adjustments: adjustments.rows });
  }

  async statement(id: string) { const { tenant, pool } = this.context(); return this.readStatement(pool, tenant.tenantId, id); }

  private async recompute(client: PoolClient, tenantId: string, periodId: string) { await client.query(`UPDATE teacher_compensation_statements s SET earnings_vnd=COALESCE((SELECT sum(i.amount_vnd) FROM compensation_items i WHERE i.tenant_id=s.tenant_id AND i.statement_id=s.id),0), adjustments_vnd=COALESCE((SELECT sum(a.amount_vnd) FROM compensation_adjustments a WHERE a.tenant_id=s.tenant_id AND a.statement_id=s.id),0), payable_vnd=COALESCE((SELECT sum(i.amount_vnd) FROM compensation_items i WHERE i.tenant_id=s.tenant_id AND i.statement_id=s.id),0)+COALESCE((SELECT sum(a.amount_vnd) FROM compensation_adjustments a WHERE a.tenant_id=s.tenant_id AND a.statement_id=s.id),0) WHERE s.tenant_id=$1 AND s.period_id=$2`, [tenantId, periodId]); }

  async generate(periodId: string) {
    return this.transaction(async (client, context) => {
      const tenantId = context.tenant.tenantId; await this.lock(client, tenantId);
      const period = await client.query<{ periodStart: string; periodEnd: string; status: string; generatedAt: Date | null }>('SELECT period_start::text AS "periodStart",period_end::text AS "periodEnd",status,generated_at AS "generatedAt" FROM compensation_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, periodId]);
      if (!period.rows[0]) throw new NotFoundException('Compensation period not found'); if (period.rows[0].status !== 'DRAFT') throw new ConflictException('Finalized compensation cannot be regenerated');
      const sessions = await client.query(`SELECT s.id AS "sessionId",s.teacher_id AS "teacherId",s.class_id AS "classId",s.session_date::text AS "workDate",s.start_time AS "startTime",s.end_time AS "endTime",t.code AS "teacherCode",t.name AS "teacherName",c.code AS "classCode",c.name AS "className" FROM attendance_sessions s JOIN classes c ON c.tenant_id=s.tenant_id AND c.id=s.class_id LEFT JOIN teachers t ON t.tenant_id=s.tenant_id AND t.id=s.teacher_id WHERE s.tenant_id=$1 AND s.status='COMPLETED' AND s.session_date BETWEEN $2 AND $3 ORDER BY s.session_date,s.id`, [tenantId, period.rows[0].periodStart, period.rows[0].periodEnd]);
      const agreements = await client.query<Agreement>(`${agreementSelect} WHERE a.tenant_id=$1 AND a.effective_from <= $3 AND (a.effective_until IS NULL OR a.effective_until >= $2) ORDER BY a.teacher_id,a.class_id NULLS LAST,a.effective_from DESC,a.id DESC`, [tenantId, period.rows[0].periodStart, period.rows[0].periodEnd]);
      await client.query('DELETE FROM compensation_items i USING teacher_compensation_statements s WHERE i.tenant_id=$1 AND i.statement_id=s.id AND s.period_id=$2', [tenantId, periodId]); await client.query('DELETE FROM unresolved_compensation WHERE tenant_id=$1 AND period_id=$2', [tenantId, periodId]);
      const generated: Array<Record<string, unknown>> = []; const unresolved: Array<Record<string, unknown>> = [];
      for (const session of sessions.rows) {
        if (!session.teacherId) { unresolved.push({ sessionId: session.sessionId, teacherId: null, classId: session.classId, workDate: session.workDate, reasonCode: 'MISSING_TEACHER', description: 'Completed session has no actual teacher' }); continue; }
        const date = day(session.workDate); const agreement = agreements.rows.find((item) => item.teacherId === session.teacherId && (item.classId === session.classId || item.classId === null) && day(item.effectiveFrom) <= date && (!item.effectiveUntil || day(item.effectiveUntil) >= date));
        if (!agreement) { unresolved.push({ sessionId: session.sessionId, teacherId: session.teacherId, classId: session.classId, workDate: session.workDate, reasonCode: 'MISSING_AGREEMENT', description: 'No applicable compensation agreement' }); continue; }
        if (agreement.basis === 'FIXED_CLASS') continue;
        const minutes = durationMinutes(String(session.startTime).slice(0, 5), String(session.endTime).slice(0, 5)); generated.push({ ...session, agreementId: agreement.id, basis: agreement.basis, rateVnd: BigInt(agreement.rateVnd), amountVnd: calculateAmount(BigInt(agreement.rateVnd), agreement.basis, minutes), durationMinutes: minutes, sourceKind: 'SESSION' });
      }
      const fixed = await client.query(`${agreementSelect} WHERE a.tenant_id=$1 AND a.basis='FIXED_CLASS' AND a.effective_from <= $3 AND (a.effective_until IS NULL OR a.effective_until >= $2) AND c.completed_on BETWEEN $2 AND $3`, [tenantId, period.rows[0].periodStart, period.rows[0].periodEnd]);
      for (const item of fixed.rows) generated.push({ ...item, teacherId: item.teacherId, classId: item.classId, workDate: item.completedOn, rateVnd: BigInt(item.rateVnd), amountVnd: BigInt(item.rateVnd), sourceKind: 'FIXED_CLASS', durationMinutes: null, sessionId: null, startTime: null, endTime: null });
      const teacherIds = [...new Set(generated.map((item) => item.teacherId as string).concat(unresolved.filter((item) => item.teacherId).map((item) => item.teacherId as string)))];
      for (const teacherId of teacherIds) {
        const statementId = ulid(); await client.query('INSERT INTO teacher_compensation_statements (id,tenant_id,period_id,teacher_id) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,period_id,teacher_id) DO NOTHING', [statementId, tenantId, periodId, teacherId]); const statement = await client.query<{ id: string }>('SELECT id FROM teacher_compensation_statements WHERE tenant_id=$1 AND period_id=$2 AND teacher_id=$3', [tenantId, periodId, teacherId]);
        for (const item of generated.filter((value) => value.teacherId === teacherId)) await client.query(`INSERT INTO compensation_items (id,tenant_id,statement_id,teacher_id,class_id,session_id,agreement_id,source_kind,work_date,start_time,end_time,duration_minutes,basis,rate_vnd,amount_vnd,teacher_code,teacher_name,class_code,class_name,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [ulid(), tenantId, statement.rows[0].id, item.teacherId, item.classId, item.sessionId ?? null, item.agreementId, item.sourceKind, item.workDate, item.startTime, item.endTime, item.durationMinutes, item.basis, item.rateVnd, item.amountVnd, item.teacherCode, item.teacherName, item.classCode, item.className, item.sourceKind === 'SESSION' ? 'Completed session compensation' : 'Completed class compensation']);
      }
      for (const item of unresolved) await client.query('INSERT INTO unresolved_compensation (id,tenant_id,period_id,teacher_id,class_id,session_id,work_date,reason_code,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [ulid(), tenantId, periodId, item.teacherId, item.classId, item.sessionId, item.workDate, item.reasonCode, item.description]);
      await this.recompute(client, tenantId, periodId); await client.query('DELETE FROM teacher_compensation_statements WHERE tenant_id=$1 AND period_id=$2 AND NOT EXISTS (SELECT 1 FROM compensation_items i WHERE i.tenant_id=teacher_compensation_statements.tenant_id AND i.statement_id=teacher_compensation_statements.id) AND NOT EXISTS (SELECT 1 FROM compensation_adjustments a WHERE a.tenant_id=teacher_compensation_statements.tenant_id AND a.statement_id=teacher_compensation_statements.id)', [tenantId, periodId]);
      await client.query('UPDATE compensation_periods SET generated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2', [tenantId, periodId]);
      await this.audit.recordTenant(client, { ...actor(context), action: period.rows[0].generatedAt ? 'compensation.period_regenerated' : 'compensation.period_generated', entityType: 'COMPENSATION_PERIOD', entityId: periodId, after: { generatedItems: generated.length, unresolved: unresolved.length } }); return { periodId, generatedItems: generated.length, unresolved: unresolved.length };
    });
  }

  async addAdjustment(periodId: string, teacherId: string, input: CreateCompensationAdjustmentDto) { return this.transaction(async (client, context) => { const tenantId = context.tenant.tenantId; await this.lock(client, tenantId); const period = await client.query<{ status: string }>('SELECT status FROM compensation_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, periodId]); if (!period.rows[0]) throw new NotFoundException('Compensation period not found'); if (period.rows[0].status !== 'DRAFT') throw new ConflictException('Finalized compensation is immutable'); const teacher = await client.query('SELECT 1 FROM teachers WHERE tenant_id=$1 AND id=$2', [tenantId, teacherId]); if (!teacher.rows[0]) throw new NotFoundException('Teacher not found'); const statementId = ulid(); await client.query('INSERT INTO teacher_compensation_statements (id,tenant_id,period_id,teacher_id) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,period_id,teacher_id) DO NOTHING', [statementId, tenantId, periodId, teacherId]); const statement = await client.query<{ id: string }>('SELECT id FROM teacher_compensation_statements WHERE tenant_id=$1 AND period_id=$2 AND teacher_id=$3', [tenantId, periodId, teacherId]); await client.query('INSERT INTO compensation_adjustments (id,tenant_id,statement_id,amount_vnd,reason,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6)', [ulid(), tenantId, statement.rows[0].id, BigInt(input.amountVnd), input.reason, context.actorUserId ?? null]); await this.recompute(client, tenantId, periodId); await this.audit.recordTenant(client, { ...actor(context), action: 'compensation.adjustment_added', entityType: 'COMPENSATION_PERIOD', entityId: periodId, after: { teacherId, amountVnd: input.amountVnd, reason: input.reason } }); return this.readStatement(client, tenantId, statement.rows[0].id); }); }
  async removeAdjustment(id: string) { return this.transaction(async (client, context) => { const tenantId = context.tenant.tenantId; await this.lock(client, tenantId); const row = await client.query<{ statementId: string; periodId: string; amountVnd: bigint }>('SELECT a.statement_id AS "statementId",s.period_id AS "periodId",a.amount_vnd AS "amountVnd" FROM compensation_adjustments a JOIN teacher_compensation_statements s ON s.tenant_id=a.tenant_id AND s.id=a.statement_id WHERE a.tenant_id=$1 AND a.id=$2 FOR UPDATE', [tenantId, id]); if (!row.rows[0]) throw new NotFoundException('Compensation adjustment not found'); const status = await client.query<{ status: string }>('SELECT status FROM compensation_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, row.rows[0].periodId]); if (status.rows[0]?.status !== 'DRAFT') throw new ConflictException('Finalized compensation is immutable'); await client.query('DELETE FROM compensation_adjustments WHERE tenant_id=$1 AND id=$2', [tenantId, id]); await this.recompute(client, tenantId, row.rows[0].periodId); await this.audit.recordTenant(client, { ...actor(context), action: 'compensation.adjustment_removed', entityType: 'COMPENSATION_ADJUSTMENT', entityId: id, after: { amountVnd: row.rows[0].amountVnd.toString() } }); return { id, deleted: true }; }); }
  private async assertDraftCanonical(client: PoolClient, tenantId: string, periodId: string, periodStart: string, periodEnd: string) {
    const agreement = `(SELECT a.id, a.teacher_id, a.class_id, a.basis, a.rate_vnd
      FROM compensation_agreements a
      WHERE a.tenant_id = $1 AND a.teacher_id = s.teacher_id
        AND (a.class_id = s.class_id OR a.class_id IS NULL)
        AND a.effective_from <= s.session_date
        AND (a.effective_until IS NULL OR a.effective_until >= s.session_date)
      ORDER BY (a.class_id IS NULL), a.effective_from DESC, a.id DESC LIMIT 1)`;
    const expectedSessions = await client.query(`
      SELECT s.id AS "sessionId", s.teacher_id AS "teacherId", s.class_id AS "classId",
        a.id AS "agreementId", a.basis, a.rate_vnd AS "rateVnd",
        ((EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60)::INTEGER) AS "durationMinutes",
        CASE WHEN a.basis = 'PER_HOUR'
          THEN (a.rate_vnd * ((EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60)::BIGINT) + 30) / 60
          ELSE a.rate_vnd END AS "amountVnd",
        s.session_date::text AS "workDate", s.start_time AS "startTime", s.end_time AS "endTime"
      FROM attendance_sessions s
      LEFT JOIN LATERAL ${agreement} a ON TRUE
      WHERE s.tenant_id = $1 AND s.status = 'COMPLETED'
        AND s.session_date BETWEEN $2 AND $3 AND s.teacher_id IS NOT NULL
        AND a.id IS NOT NULL AND a.basis <> 'FIXED_CLASS'
    `, [tenantId, periodStart, periodEnd]);
    const actualSessions = await client.query(`
      SELECT i.session_id AS "sessionId", i.teacher_id AS "teacherId", i.class_id AS "classId",
        i.agreement_id AS "agreementId", i.basis, i.rate_vnd AS "rateVnd",
        i.duration_minutes AS "durationMinutes", i.amount_vnd AS "amountVnd",
        i.work_date::text AS "workDate", i.start_time AS "startTime", i.end_time AS "endTime"
      FROM compensation_items i
      JOIN teacher_compensation_statements s ON s.tenant_id = i.tenant_id AND s.id = i.statement_id
      WHERE i.tenant_id = $1 AND s.period_id = $2 AND i.source_kind = 'SESSION'
    `, [tenantId, periodId]);
    const expectedUnresolved = await client.query(`
      SELECT s.id AS "sessionId", s.teacher_id AS "teacherId", s.class_id AS "classId",
        s.session_date::text AS "workDate",
        CASE WHEN s.teacher_id IS NULL THEN 'MISSING_TEACHER' ELSE 'MISSING_AGREEMENT' END AS "reasonCode"
      FROM attendance_sessions s
      LEFT JOIN LATERAL ${agreement} a ON TRUE
      WHERE s.tenant_id = $1 AND s.status = 'COMPLETED'
        AND s.session_date BETWEEN $2 AND $3
        AND (s.teacher_id IS NULL OR a.id IS NULL)
    `, [tenantId, periodStart, periodEnd]);
    const actualUnresolved = await client.query(`
      SELECT session_id AS "sessionId", teacher_id AS "teacherId", class_id AS "classId",
        work_date::text AS "workDate", reason_code AS "reasonCode"
      FROM unresolved_compensation WHERE tenant_id = $1 AND period_id = $2
    `, [tenantId, periodId]);
    const expectedFixed = await client.query(`
      SELECT a.id AS "agreementId", a.teacher_id AS "teacherId", a.class_id AS "classId",
        c.completed_on::text AS "workDate", a.rate_vnd AS "rateVnd"
      FROM compensation_agreements a JOIN classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
      WHERE a.tenant_id = $1 AND a.basis = 'FIXED_CLASS'
        AND c.completed_on BETWEEN $2 AND $3
        AND a.effective_from <= c.completed_on
        AND (a.effective_until IS NULL OR a.effective_until >= c.completed_on)
    `, [tenantId, periodStart, periodEnd]);
    const actualFixed = await client.query(`
      SELECT i.agreement_id AS "agreementId", i.teacher_id AS "teacherId", i.class_id AS "classId",
        i.work_date::text AS "workDate", i.rate_vnd AS "rateVnd"
      FROM compensation_items i
      JOIN teacher_compensation_statements s ON s.tenant_id = i.tenant_id AND s.id = i.statement_id
      WHERE i.tenant_id = $1 AND s.period_id = $2 AND i.source_kind = 'FIXED_CLASS'
    `, [tenantId, periodId]);
    const date = (value: unknown) => day(value);
    const time = (value: unknown) => value == null ? null : String(value).slice(0, 5);
    const compare = (left: unknown[], right: unknown[]) => JSON.stringify(left.map((row) => JSON.stringify(row)).sort()) === JSON.stringify(right.map((row) => JSON.stringify(row)).sort());
    const sessionKey = (row: QueryResultRow) => ({ sessionId: row.sessionId, teacherId: row.teacherId, classId: row.classId, agreementId: row.agreementId, basis: row.basis, rateVnd: String(row.rateVnd), durationMinutes: Number(row.durationMinutes), amountVnd: String(row.amountVnd), workDate: date(row.workDate), startTime: time(row.startTime), endTime: time(row.endTime) });
    const unresolvedKey = (row: QueryResultRow) => ({ sessionId: row.sessionId, teacherId: row.teacherId ?? null, classId: row.classId, workDate: date(row.workDate), reasonCode: row.reasonCode });
    const fixedKey = (row: QueryResultRow) => ({ agreementId: row.agreementId, teacherId: row.teacherId, classId: row.classId, workDate: date(row.workDate), rateVnd: String(row.rateVnd) });
    if (!compare(expectedSessions.rows.map(sessionKey), actualSessions.rows.map(sessionKey)) || !compare(expectedUnresolved.rows.map(unresolvedKey), actualUnresolved.rows.map(unresolvedKey)) || !compare(expectedFixed.rows.map(fixedKey), actualFixed.rows.map(fixedKey))) {
      throw new ConflictException('Compensation sources changed; regenerate before finalization');
    }
  }

  async finalize(periodId: string) { return this.transaction(async (client, context) => { const tenantId = context.tenant.tenantId; await this.lock(client, tenantId); const period = await client.query<{ status: string; generatedAt: Date | null; periodStart: string; periodEnd: string }>('SELECT status,period_start::text AS "periodStart",period_end::text AS "periodEnd",generated_at AS "generatedAt" FROM compensation_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, periodId]); if (!period.rows[0]) throw new NotFoundException('Compensation period not found'); if (period.rows[0].status !== 'DRAFT') throw new ConflictException('Compensation period is already finalized'); if (!period.rows[0].generatedAt) throw new ConflictException('Generate the period before finalization'); const unresolved = await client.query('SELECT 1 FROM unresolved_compensation WHERE tenant_id=$1 AND period_id=$2 LIMIT 1', [tenantId, periodId]); if (unresolved.rows[0]) throw new ConflictException('Resolve all compensation issues before finalization'); await this.assertDraftCanonical(client, tenantId, periodId, String(period.rows[0].periodStart), String(period.rows[0].periodEnd)); const negative = await client.query('SELECT 1 FROM teacher_compensation_statements WHERE tenant_id=$1 AND period_id=$2 AND payable_vnd<0 LIMIT 1', [tenantId, periodId]); if (negative.rows[0]) throw new ConflictException('Payable total cannot be negative'); await client.query(`UPDATE compensation_periods SET status='FINALIZED',finalized_at=CURRENT_TIMESTAMP,finalized_by_user_id=$3,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`, [tenantId, periodId, context.actorUserId ?? null]); await this.audit.recordTenant(client, { ...actor(context), action: 'compensation.period_finalized', entityType: 'COMPENSATION_PERIOD', entityId: periodId, after: { status: 'FINALIZED' } }); return { periodId, status: 'FINALIZED' }; }); }
}
