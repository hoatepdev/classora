import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ulid } from 'ulid';
import type { Pool, PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import { CommunicationService } from '../communication/communication.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { CreatePricingPlanDto } from './dto/create-pricing-plan.dto.js';
import type { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import type { CreateDiscountDto, DisableDiscountDto } from './dto/create-discount.dto.js';
import type { CreateEnrollmentDiscountDto, CreateEnrollmentPricingDto } from './dto/create-enrollment-pricing.dto.js';
import type { AllocatePaymentBatchDto, RecordPaymentDto, ReversePaymentDto } from './dto/record-payment.dto.js';
import type { InvoiceCommandDto } from './dto/invoice-command.dto.js';
import { ledgerCreditSql, ledgerPaidSql } from './billing-ledger.js';

const money = (value: string | undefined, positive = false) => {
  if (!value || !/^\d+$/.test(value) || (positive ? BigInt(value) <= 0n : BigInt(value) < 0n)) throw new BadRequestException('VND amounts must be integer strings');
  return value;
};
const asAmount = (value: unknown) => BigInt(String(value ?? 0));
const asOfTimestamp = (value?: string) => {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException('asOf must be a valid ISO date-time');
  return parsed.toISOString();
};
const actor = (context: ReturnType<TenantContextService['get']>) => ({ tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId, actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId });
const serialize = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : v]));
const isUniqueViolation = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
type InvoiceRead = Record<string, unknown> & { status: string; total_vnd: unknown; credit_vnd: unknown; paid_vnd: unknown; due_date: unknown };
const invoiceSelect = `SELECT i.*, s.full_name AS "studentName", i.total_vnd AS "totalVnd", i.student_id AS "studentId", i.status AS "status", i.due_date AS "dueDate", ${ledgerPaidSql} AS paid_vnd, ${ledgerCreditSql} AS credit_vnd FROM invoices i LEFT JOIN students s ON s.tenant_id = i.tenant_id AND s.id = i.student_id`;
const invoiceSelectAt = (asOfPlaceholder: string) => `WITH historical_refunds AS (
  SELECT pa.tenant_id, pa.invoice_id, SUM(ra.amount_vnd) AS amount_vnd
  FROM refund_allocations ra
  JOIN payment_allocations pa ON pa.tenant_id = ra.tenant_id AND pa.id = ra.payment_allocation_id
  JOIN refunds rf ON rf.tenant_id = ra.tenant_id AND rf.id = ra.refund_id
  WHERE ra.created_at <= ${asOfPlaceholder}::timestamptz
    AND NOT EXISTS (SELECT 1 FROM payment_reversals pr
      WHERE pr.tenant_id = rf.tenant_id AND pr.payment_id = rf.payment_id
        AND pr.created_at <= ${asOfPlaceholder}::timestamptz)
  GROUP BY pa.tenant_id, pa.invoice_id
), historical_gross_paid AS (
  SELECT pa.tenant_id, pa.invoice_id, SUM(pa.amount_vnd) AS amount_vnd
  FROM payment_allocations pa
  JOIN payments p ON p.tenant_id = pa.tenant_id AND p.id = pa.payment_id
  WHERE pa.created_at <= ${asOfPlaceholder}::timestamptz
    AND NOT EXISTS (SELECT 1 FROM payment_reversals pr
      WHERE pr.tenant_id = p.tenant_id AND pr.payment_id = p.id
        AND pr.created_at <= ${asOfPlaceholder}::timestamptz)
  GROUP BY pa.tenant_id, pa.invoice_id
), historical_paid AS (
  SELECT gp.tenant_id, gp.invoice_id, gp.amount_vnd - COALESCE(hr.amount_vnd, 0) AS amount_vnd
  FROM historical_gross_paid gp
  LEFT JOIN historical_refunds hr ON hr.tenant_id = gp.tenant_id AND hr.invoice_id = gp.invoice_id
), historical_credit AS (
  SELECT cn.tenant_id, cn.invoice_id, SUM(cn.amount_vnd) AS amount_vnd
  FROM credit_notes cn
  WHERE cn.status = 'ISSUED' AND cn.issued_at <= ${asOfPlaceholder}::timestamptz
    AND NOT EXISTS (SELECT 1 FROM credit_note_voids cv
      WHERE cv.tenant_id = cn.tenant_id AND cv.credit_note_id = cn.id
        AND cv.created_at <= ${asOfPlaceholder}::timestamptz)
  GROUP BY cn.tenant_id, cn.invoice_id
), historical_status AS (
  SELECT DISTINCT ON (h.tenant_id, h.invoice_id)
         h.tenant_id, h.invoice_id, h.status
  FROM invoice_status_history h
  WHERE h.effective_at <= ${asOfPlaceholder}::timestamptz
  ORDER BY h.tenant_id, h.invoice_id, h.effective_at DESC, h.id DESC
)
SELECT i.*, s.full_name AS "studentName", i.total_vnd AS "totalVnd", i.student_id AS "studentId", i.status AS "status", i.due_date AS "dueDate",
       COALESCE(hp.amount_vnd, 0) AS paid_vnd, COALESCE(hc.amount_vnd, 0) AS credit_vnd, hs.status AS "statusAt"
FROM invoices i
LEFT JOIN students s ON s.tenant_id = i.tenant_id AND s.id = i.student_id
LEFT JOIN historical_paid hp ON hp.tenant_id = i.tenant_id AND hp.invoice_id = i.id
LEFT JOIN historical_credit hc ON hc.tenant_id = i.tenant_id AND hc.invoice_id = i.id
LEFT JOIN historical_status hs ON hs.tenant_id = i.tenant_id AND hs.invoice_id = i.id`;
const invoiceResponse = (row: InvoiceRead, asOf?: string) => {
  const totalVnd = asAmount(row.total_vnd);
  const creditVnd = asAmount(row.credit_vnd);
  const paidVnd = asAmount(row.paid_vnd);
  const historicalStatus = (row as InvoiceRead & { statusAt?: string | null }).statusAt;
  const status = historicalStatus ?? (asOf ? 'DRAFT' : row.status);
  return {
    ...serialize(row),
    status,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    totalVnd: totalVnd.toString(),
    paidVnd: paidVnd.toString(),
    creditVnd: creditVnd.toString(),
    outstandingVnd: (totalVnd - creditVnd - paidVnd).toString(),
    effectiveStatus: effectiveStatus(status, row.total_vnd, row.credit_vnd, row.paid_vnd, row.due_date, asOf ? new Date(asOf).getTime() : Date.now()),
  };
};

@Injectable()
export class BillingService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly communication: CommunicationService,
  ) {}

  async plans() {
    const { tenant, pool } = this.tenantContext.get();
    return (await pool.query(`SELECT id,tenant_id AS "tenantId",code,name,amount_vnd AS "amountVnd",billing_period AS "billingPeriod",status,created_at AS "createdAt",updated_at AS "updatedAt" FROM pricing_plans WHERE tenant_id=$1 ORDER BY name,id`, [tenant.tenantId])).rows.map(serialize);
  }

  async createPlan(input: CreatePricingPlanDto) {
    const c = this.tenantContext.get(); const amount = money(input.amountVnd); const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(`INSERT INTO pricing_plans (id,tenant_id,code,name,amount_vnd,billing_period) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,tenant_id AS "tenantId",code,name,amount_vnd AS "amountVnd",billing_period AS "billingPeriod",status,created_at AS "createdAt",updated_at AS "updatedAt"`, [ulid(), c.tenant.tenantId, input.code.trim(), input.name.trim(), amount, input.billingPeriod ?? 'ONE_TIME']);
      await this.audit.recordTenant(client, {...actor(c), action:'billing.pricing_plan_created', entityType:'PricingPlan', entityId:r.rows[0].id, after:serialize(r.rows[0])});
      await client.query('COMMIT'); return serialize(r.rows[0]);
    } catch (e) { await client.query('ROLLBACK').catch(()=>undefined); if (String(e).includes('pricing_plans_tenant_code_key')) throw new ConflictException('Pricing plan code already exists'); throw e; } finally { client.release(); }
  }

  async invoices(studentId?: string, asOf?: string) {
    const { tenant, pool } = this.tenantContext.get();
    const asOfValue = asOfTimestamp(asOf);
    const values: unknown[] = [tenant.tenantId];
    const filter = studentId ? ' AND i.student_id=$2' : '';
    if (studentId) values.push(studentId);
    if (asOfValue) values.push(asOfValue);
    const historicalCreatedFilter = asOfValue ? ` AND i.created_at <= $${values.length}::timestamptz` : '';
    const select = asOfValue ? invoiceSelectAt(`$${values.length}`) : invoiceSelect;
    const r = await pool.query<InvoiceRead>(`${select} WHERE i.tenant_id=$1${filter}${historicalCreatedFilter} ORDER BY i.created_at DESC,i.id DESC`, values);
    return r.rows.map((row) => invoiceResponse(row, asOf));
  }

  async studentBilling(studentId: string) {
    const { tenant, pool } = this.tenantContext.get();
    const student = await pool.query(`SELECT id, full_name AS "fullName" FROM students WHERE tenant_id=$1 AND id=$2`, [tenant.tenantId, studentId]);
    if (!student.rows[0]) throw new NotFoundException('Student not found');
    const invoicesResult = await pool.query<InvoiceRead>(`${invoiceSelect} WHERE i.tenant_id=$1 AND i.student_id=$2 ORDER BY i.created_at DESC, i.id DESC`, [tenant.tenantId, studentId]);
    const paymentsResult = await pool.query(`
      SELECT p.id, p.amount_vnd AS "amountVnd", p.method, p.reference,
             p.received_at AS "receivedAt", p.invoice_id AS "invoiceId",
             COALESCE((SELECT SUM(pa.amount_vnd) FROM payment_allocations pa
                       WHERE pa.tenant_id=p.tenant_id AND pa.payment_id=p.id), 0) AS "allocatedVnd",
             COALESCE((SELECT SUM(r.amount_vnd - COALESCE((SELECT SUM(ra.amount_vnd) FROM refund_allocations ra
                       WHERE ra.tenant_id=r.tenant_id AND ra.refund_id=r.id), 0)) FROM refunds r
                       WHERE r.tenant_id=p.tenant_id AND r.payment_id=p.id), 0) AS "refundedVnd",
             CASE WHEN EXISTS (SELECT 1 FROM payment_reversals pr
                               WHERE pr.tenant_id=p.tenant_id AND pr.payment_id=p.id)
                  THEN 'REVERSED' ELSE 'RECORDED' END AS status
      FROM payments p
      WHERE p.tenant_id=$1 AND p.student_id=$2
      ORDER BY p.received_at DESC, p.id DESC`, [tenant.tenantId, studentId]);
    const availableCredit = paymentsResult.rows.reduce((sum, row) => {
      if (row.status === 'REVERSED') return sum;
      return sum + asAmount(row.amountVnd) - asAmount(row.allocatedVnd) - asAmount(row.refundedVnd);
    }, 0n);
    return {
      student: serialize(student.rows[0]),
      invoices: invoicesResult.rows.map((row) => invoiceResponse(row)),
      payments: paymentsResult.rows.map(serialize),
      availableCreditVnd: availableCredit.toString(),
    };
  }

  async customerCredit(studentId?: string) {
    const { tenant, pool } = this.tenantContext.get();
    const values: unknown[] = [tenant.tenantId];
    const filter = studentId ? ' AND p.student_id=$2' : '';
    if (studentId) values.push(studentId);
    const result = await pool.query(`
      SELECT p.student_id AS "studentId", s.full_name AS "studentName",
             SUM(p.amount_vnd) - SUM(COALESCE((SELECT SUM(pa.amount_vnd) FROM payment_allocations pa
                 WHERE pa.tenant_id=p.tenant_id AND pa.payment_id=p.id), 0))
             - SUM(COALESCE((SELECT SUM(r.amount_vnd - COALESCE((SELECT SUM(ra.amount_vnd) FROM refund_allocations ra
                 WHERE ra.tenant_id=r.tenant_id AND ra.refund_id=r.id), 0)) FROM refunds r
                 WHERE r.tenant_id=p.tenant_id AND r.payment_id=p.id), 0)) AS "availableCreditVnd"
      FROM payments p
      JOIN students s ON s.tenant_id=p.tenant_id AND s.id=p.student_id
      WHERE p.tenant_id=$1 AND p.student_id IS NOT NULL${filter}
        AND NOT EXISTS (SELECT 1 FROM payment_reversals pr
                        WHERE pr.tenant_id=p.tenant_id AND pr.payment_id=p.id)
      GROUP BY p.student_id, s.full_name
      HAVING SUM(p.amount_vnd) - SUM(COALESCE((SELECT SUM(pa.amount_vnd) FROM payment_allocations pa
                 WHERE pa.tenant_id=p.tenant_id AND pa.payment_id=p.id), 0))
             - SUM(COALESCE((SELECT SUM(r.amount_vnd - COALESCE((SELECT SUM(ra.amount_vnd) FROM refund_allocations ra
                 WHERE ra.tenant_id=r.tenant_id AND ra.refund_id=r.id), 0)) FROM refunds r
                 WHERE r.tenant_id=p.tenant_id AND r.payment_id=p.id), 0)) > 0
      ORDER BY s.full_name, p.student_id`, values);
    return result.rows.map(serialize);
  }

  async payments() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query(`
      SELECT p.id, p.tenant_id AS "tenantId", p.invoice_id AS "invoiceId",
             p.student_id AS "studentId", s.full_name AS "studentName",
             i.invoice_number AS "invoiceNumber", p.amount_vnd AS "amountVnd",
             p.method, p.reference, p.note, p.received_at AS "receivedAt",
             p.created_at AS "createdAt",
             CASE WHEN EXISTS (
               SELECT 1 FROM payment_reversals pr
               WHERE pr.tenant_id = p.tenant_id AND pr.payment_id = p.id
             ) THEN 'REVERSED' ELSE 'RECORDED' END AS status
      FROM payments p
      LEFT JOIN students s ON s.tenant_id = p.tenant_id AND s.id = p.student_id
      LEFT JOIN invoices i ON i.tenant_id = p.tenant_id AND i.id = p.invoice_id
      WHERE p.tenant_id = $1
      ORDER BY p.received_at DESC, p.id DESC`, [tenant.tenantId]);
    return result.rows.map(serialize);
  }

  async receivables() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<InvoiceRead>(`
      ${invoiceSelect}
      WHERE i.tenant_id = $1 AND i.status = 'ISSUED'
      ORDER BY i.due_date ASC NULLS LAST, i.id DESC`, [tenant.tenantId]);
    return result.rows
      .map((row) => {
        const outstanding = asAmount(row.total_vnd) - asAmount(row.credit_vnd) - asAmount(row.paid_vnd);
        const dueDate = row.due_date ? new Date(String(row.due_date)) : undefined;
        const daysOverdue = dueDate && dueDate.getTime() < Date.now()
          ? Math.floor((Date.now() - dueDate.getTime()) / 86_400_000)
          : 0;
        return {
          ...serialize(row),
          id: row.id,
          studentName: row.studentName,
          invoiceId: row.id,
          invoiceNumber: row.invoice_number,
          dueAt: row.due_date,
          status: effectiveStatus(row.status, row.total_vnd, row.credit_vnd, row.paid_vnd, row.due_date),
          amount: outstanding.toString(),
          daysOverdue,
          effectiveStatus: effectiveStatus(row.status, row.total_vnd, row.credit_vnd, row.paid_vnd, row.due_date),
        };
      })
      .filter((row) => BigInt(row.amount) > 0n);
  }

  async discounts() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query(`
      SELECT id, tenant_id AS "tenantId", code, name, kind AS type, value,
             max_amount_vnd AS "maxAmountVnd", status,
             effective_from AS "startsAt", effective_until AS "endsAt",
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM discounts WHERE tenant_id = $1 ORDER BY name, id`, [tenant.tenantId]);
    return result.rows.map(serialize);
  }

  async createDiscount(input: CreateDiscountDto) {
    const c = this.tenantContext.get();
    const value = BigInt(money(input.value));
    if (input.kind === 'PERCENTAGE' && value > 100n) throw new BadRequestException('Percentage discount must be between 0 and 100');
    if (input.effectiveFrom && input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) throw new BadRequestException('Discount end date must not precede start date');
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        INSERT INTO discounts (id,tenant_id,code,name,kind,value,max_amount_vnd,effective_from,effective_until)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date)
        RETURNING id, tenant_id AS "tenantId", code, name, kind AS type, value,
                  max_amount_vnd AS "maxAmountVnd", status,
                  effective_from AS "startsAt", effective_until AS "endsAt",
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
        [ulid(), c.tenant.tenantId, input.code.trim(), input.name.trim(), input.kind, value.toString(), input.maxAmountVnd ? money(input.maxAmountVnd) : null, input.effectiveFrom ?? null, input.effectiveUntil ?? null],
      );
      await this.audit.recordTenant(client, {...actor(c), action: 'billing.discount_created', entityType: 'Discount', entityId: result.rows[0].id, after: serialize(result.rows[0])});
      await client.query('COMMIT');
      return serialize(result.rows[0]);
    } catch (e) { await client.query('ROLLBACK').catch(() => undefined); if (String(e).includes('discounts_tenant_code_key')) throw new ConflictException('Discount code already exists'); throw e; }
    finally { client.release(); }
  }

  async disableDiscount(id: string, input: DisableDiscountDto) {
    const c = this.tenantContext.get();
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`UPDATE discounts SET status='DISABLED', updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE' RETURNING id, tenant_id AS "tenantId", code, name, kind AS type, value, max_amount_vnd AS "maxAmountVnd", status, effective_from AS "startsAt", effective_until AS "endsAt", created_at AS "createdAt", updated_at AS "updatedAt"`, [c.tenant.tenantId, id]);
      if (!result.rows[0]) throw new NotFoundException('Active discount not found');
      await this.audit.recordTenant(client, {...actor(c), action: 'billing.discount_disabled', entityType: 'Discount', entityId: id, reason: input.reason?.trim(), after: serialize(result.rows[0])});
      await client.query('COMMIT');
      return serialize(result.rows[0]);
    } catch (e) { await client.query('ROLLBACK').catch(() => undefined); throw e; }
    finally { client.release(); }
  }

  async enrollmentPricing(enrollmentId?: string) {
    const { tenant, pool } = this.tenantContext.get();
    const values: unknown[] = [tenant.tenantId];
    const filter = enrollmentId ? ' AND ep.enrollment_id=$2' : '';
    if (enrollmentId) values.push(enrollmentId);
    const result = await pool.query(`SELECT ep.id, ep.tenant_id AS "tenantId", ep.enrollment_id AS "enrollmentId", ep.pricing_plan_id AS "pricingPlanId", ep.amount_vnd AS "amountVnd", ep.currency, ep.effective_from AS "effectiveFrom", ep.effective_until AS "effectiveUntil", ep.locked_at AS "lockedAt", ep.created_at AS "createdAt" FROM enrollment_pricing ep WHERE ep.tenant_id=$1${filter} ORDER BY ep.effective_from DESC, ep.id DESC`, values);
    return result.rows.map(serialize);
  }

  async createEnrollmentPricing(enrollmentId: string, input: CreateEnrollmentPricingDto) {
    const c = this.tenantContext.get();
    const amount = money(input.amountVnd);
    if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) throw new BadRequestException('Pricing end date must not precede start date');
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const enrollment = await client.query<{studentId:string}>('SELECT student_id AS "studentId" FROM enrollments WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [c.tenant.tenantId, enrollmentId]);
      if (!enrollment.rows[0]) throw new NotFoundException('Enrollment not found');
      if (input.pricingPlanId && !(await client.query('SELECT 1 FROM pricing_plans WHERE tenant_id=$1 AND id=$2', [c.tenant.tenantId, input.pricingPlanId])).rows[0]) throw new NotFoundException('Pricing plan not found');
      const locked = await client.query('SELECT 1 FROM invoices i WHERE i.tenant_id=$1 AND i.enrollment_id=$2 AND i.status IN (\'ISSUED\',\'VOID\')', [c.tenant.tenantId, enrollmentId]);
      if (locked.rows[0]) throw new ConflictException('Enrollment pricing is locked after invoicing');
      const result = await client.query(`INSERT INTO enrollment_pricing (id,tenant_id,enrollment_id,pricing_plan_id,amount_vnd,effective_from,effective_until) VALUES ($1,$2,$3,$4,$5,$6::date,$7::date) RETURNING id,tenant_id AS "tenantId",enrollment_id AS "enrollmentId",pricing_plan_id AS "pricingPlanId",amount_vnd AS "amountVnd",currency,effective_from AS "effectiveFrom",effective_until AS "effectiveUntil",locked_at AS "lockedAt",created_at AS "createdAt"`, [ulid(), c.tenant.tenantId, enrollmentId, input.pricingPlanId ?? null, amount, input.effectiveFrom, input.effectiveUntil ?? null]);
      await this.audit.recordTenant(client, {...actor(c), action: 'billing.enrollment_pricing_created', entityType: 'EnrollmentPricing', entityId: result.rows[0].id, after: serialize(result.rows[0])});
      await client.query('COMMIT');
      return serialize(result.rows[0]);
    } catch (e) { await client.query('ROLLBACK').catch(() => undefined); throw e; }
    finally { client.release(); }
  }

  async enrollmentDiscounts(enrollmentId?: string) {
    const { tenant, pool } = this.tenantContext.get();
    const values: unknown[] = [tenant.tenantId];
    const filter = enrollmentId ? ' AND ed.enrollment_id=$2' : '';
    if (enrollmentId) values.push(enrollmentId);
    const result = await pool.query(`SELECT ed.id, ed.tenant_id AS "tenantId", ed.enrollment_id AS "enrollmentId", ed.discount_id AS "discountId", d.code AS "discountCode", d.name AS "discountName", ed.amount_vnd AS "amountVnd", ed.applied_at AS "appliedAt", ed.created_at AS "createdAt" FROM enrollment_discounts ed JOIN discounts d ON d.tenant_id=ed.tenant_id AND d.id=ed.discount_id WHERE ed.tenant_id=$1${filter} ORDER BY ed.applied_at DESC, ed.id DESC`, values);
    return result.rows.map(serialize);
  }

  async createEnrollmentDiscount(enrollmentId: string, input: CreateEnrollmentDiscountDto) {
    const c = this.tenantContext.get();
    const amount = money(input.amountVnd);
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const enrollment = await client.query<{studentId:string}>('SELECT student_id AS "studentId" FROM enrollments WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [c.tenant.tenantId, enrollmentId]);
      if (!enrollment.rows[0]) throw new NotFoundException('Enrollment not found');
      const discount = await client.query('SELECT 1 FROM discounts WHERE tenant_id=$1 AND id=$2 AND status=\'ACTIVE\'', [c.tenant.tenantId, input.discountId]);
      if (!discount.rows[0]) throw new NotFoundException('Active discount not found');
      if ((await client.query('SELECT 1 FROM invoices i WHERE i.tenant_id=$1 AND i.enrollment_id=$2 AND i.status IN (\'ISSUED\',\'VOID\')', [c.tenant.tenantId, enrollmentId])).rows[0]) throw new ConflictException('Enrollment discounts are locked after invoicing');
      const result = await client.query(`INSERT INTO enrollment_discounts (id,tenant_id,enrollment_id,discount_id,amount_vnd,applied_at) VALUES ($1,$2,$3,$4,$5,$6::date) RETURNING id,tenant_id AS "tenantId",enrollment_id AS "enrollmentId",discount_id AS "discountId",amount_vnd AS "amountVnd",applied_at AS "appliedAt",created_at AS "createdAt"`, [ulid(), c.tenant.tenantId, enrollmentId, input.discountId, amount, input.appliedAt ?? new Date().toISOString().slice(0,10)]);
      await this.audit.recordTenant(client, {...actor(c), action: 'billing.enrollment_discount_applied', entityType: 'EnrollmentDiscount', entityId: result.rows[0].id, after: serialize(result.rows[0])});
      await client.query('COMMIT');
      return serialize(result.rows[0]);
    } catch (e) { await client.query('ROLLBACK').catch(() => undefined); throw e; }
    finally { client.release(); }
  }

  async refunds() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query(`
      SELECT r.id, r.payment_id AS "paymentId", p.student_id AS "studentId",
             s.full_name AS "studentName", r.amount_vnd AS "amount",
             r.created_at AS "requestedAt", r.reason, 'REFUNDED' AS status
      FROM refunds r
      JOIN payments p ON p.tenant_id = r.tenant_id AND p.id = r.payment_id
      LEFT JOIN students s ON s.tenant_id = p.tenant_id AND s.id = p.student_id
      WHERE r.tenant_id = $1 ORDER BY r.created_at DESC, r.id DESC`, [tenant.tenantId]);
    return result.rows.map(serialize);
  }

  async creditNotes(invoiceId?: string) {
    const { tenant, pool } = this.tenantContext.get();
    const values: unknown[] = [tenant.tenantId];
    const filter = invoiceId ? ' AND cn.invoice_id = $2' : '';
    if (invoiceId) values.push(invoiceId);
    const result = await pool.query(`
      SELECT cn.id, cn.tenant_id AS "tenantId", cn.credit_note_number AS "creditNoteNumber",
             cn.invoice_id AS "invoiceId", i.invoice_number AS "invoiceNumber",
             i.student_id AS "studentId", s.full_name AS "studentName",
             cn.amount_vnd AS "amountVnd", cn.reason,
             CASE WHEN EXISTS (SELECT 1 FROM credit_note_voids cv WHERE cv.tenant_id=cn.tenant_id AND cv.credit_note_id=cn.id)
                  THEN 'VOID' ELSE cn.status END AS status,
             cn.issued_at AS "issuedAt", cn.created_at AS "createdAt"
      FROM credit_notes cn
      JOIN invoices i ON i.tenant_id = cn.tenant_id AND i.id = cn.invoice_id
      LEFT JOIN students s ON s.tenant_id = cn.tenant_id AND s.id = i.student_id
      WHERE cn.tenant_id = $1${filter}
      ORDER BY cn.created_at DESC, cn.id DESC`, values);
    return result.rows.map(serialize);
  }

  async createCreditNote(invoiceId: string, input: CreateCreditNoteDto) {
    const c = this.tenantContext.get();
    const amount = BigInt(money(input.amountVnd, true));
    const reason = input.reason.trim();
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const duplicate = await client.query<{ id: string; creditNoteNumber: string | null; invoiceId: string; amountVnd: string; reason: string; status: string; issuedAt: Date | null; createdAt: Date }>(`
        SELECT id, credit_note_number AS "creditNoteNumber", invoice_id AS "invoiceId",
               amount_vnd AS "amountVnd", reason,
               CASE WHEN EXISTS (
                 SELECT 1 FROM credit_note_voids cv
                 WHERE cv.tenant_id=credit_notes.tenant_id AND cv.credit_note_id=credit_notes.id
               ) THEN 'VOID' ELSE status END AS status,
               issued_at AS "issuedAt", created_at AS "createdAt"
        FROM credit_notes WHERE tenant_id=$1 AND idempotency_key=$2
        FOR UPDATE`,
        [c.tenant.tenantId, input.idempotencyKey],
      );
      if (duplicate.rows[0]) {
        const existing = duplicate.rows[0];
        if (existing.invoiceId !== invoiceId || String(existing.amountVnd) !== amount.toString() || existing.reason !== reason) throw new ConflictException('Idempotency key is already used with different credit note details');
        await client.query('COMMIT');
        return serialize(existing);
      }
      const invoice = await client.query<{ total_vnd: string; credit_vnd: string; paid_vnd: string; status: string }>(
        `${invoiceSelect} WHERE i.tenant_id=$1 AND i.id=$2 FOR UPDATE OF i`,
        [c.tenant.tenantId, invoiceId],
      );
      if (!invoice.rows[0]) throw new NotFoundException('Invoice not found');
      if (invoice.rows[0].status !== 'ISSUED') throw new ConflictException('Only issued invoices can receive credit notes');
      const available = asAmount(invoice.rows[0].total_vnd) - asAmount(invoice.rows[0].credit_vnd) - asAmount(invoice.rows[0].paid_vnd);
      if (amount > available) throw new ConflictException('Credit note exceeds invoice balance');
      const id = ulid();
      const result = await client.query(
        `INSERT INTO credit_notes
         (id,tenant_id,credit_note_number,invoice_id,amount_vnd,reason,status,issued_at,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',NULL,$7)
         RETURNING id, credit_note_number AS "creditNoteNumber", invoice_id AS "invoiceId",
                   amount_vnd AS "amountVnd", reason, status, issued_at AS "issuedAt", created_at AS "createdAt"`,
        [id, c.tenant.tenantId, null, invoiceId, amount.toString(), reason, input.idempotencyKey],
      );
      await this.audit.recordTenant(client, {
        ...actor(c), action: 'billing.credit_note_created', entityType: 'CreditNote', entityId: id,
        reason, after: { invoiceId, amountVnd: amount.toString(), status: 'DRAFT' },
      });
      await client.query('COMMIT');
      return serialize(result.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isUniqueViolation(e)) {
        const existing = await c.pool.query<{ id: string; creditNoteNumber: string | null; invoiceId: string; amountVnd: string; reason: string; status: string; issuedAt: Date | null; createdAt: Date }>(`
          SELECT id, credit_note_number AS "creditNoteNumber", invoice_id AS "invoiceId",
                 amount_vnd AS "amountVnd", reason,
                 CASE WHEN EXISTS (
                   SELECT 1 FROM credit_note_voids cv
                   WHERE cv.tenant_id=credit_notes.tenant_id AND cv.credit_note_id=credit_notes.id
                 ) THEN 'VOID' ELSE status END AS status,
                 issued_at AS "issuedAt", created_at AS "createdAt"
          FROM credit_notes WHERE tenant_id=$1 AND idempotency_key=$2`,
          [c.tenant.tenantId, input.idempotencyKey],
        );
        if (existing.rows[0]) {
          const row = existing.rows[0];
          if (row.invoiceId !== invoiceId || String(row.amountVnd) !== amount.toString() || row.reason !== reason) {
            throw new ConflictException('Idempotency key is already used with different credit note details');
          }
          return serialize(row);
        }
      }
      throw e;
    } finally { client.release(); }
  }

  async issueCreditNote(id: string) {
    const c = this.tenantContext.get();
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const note = await client.query<{ invoiceId: string; amountVnd: string; reason: string; status: string }>(
        `SELECT invoice_id AS "invoiceId", amount_vnd AS "amountVnd", reason, status
         FROM credit_notes WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [c.tenant.tenantId, id],
      );
      if (!note.rows[0]) throw new NotFoundException('Credit note not found');
      if (note.rows[0].status !== 'DRAFT') {
        if (note.rows[0].status === 'ISSUED') {
          const voided = await client.query(
            'SELECT 1 FROM credit_note_voids WHERE tenant_id=$1 AND credit_note_id=$2',
            [c.tenant.tenantId, id],
          );
          if (voided.rows[0]) throw new ConflictException('Voided credit notes cannot be issued');
          await client.query('COMMIT');
          return this.creditNotes(note.rows[0].invoiceId).then((rows) => rows.find((row) => row.id === id));
        }
        throw new ConflictException('Only draft credit notes can be issued');
      }
      const invoice = await client.query<{ total_vnd: string; credit_vnd: string; paid_vnd: string; status: string }>(
        `${invoiceSelect} WHERE i.tenant_id=$1 AND i.id=$2 FOR UPDATE OF i`,
        [c.tenant.tenantId, note.rows[0].invoiceId],
      );
      if (!invoice.rows[0]) throw new NotFoundException('Invoice not found');
      if (invoice.rows[0].status !== 'ISSUED') throw new ConflictException('Only issued invoices can receive credit notes');
      const available = asAmount(invoice.rows[0].total_vnd) - asAmount(invoice.rows[0].credit_vnd) - asAmount(invoice.rows[0].paid_vnd);
      if (asAmount(note.rows[0].amountVnd) > available) throw new ConflictException('Credit note exceeds invoice balance');
      const sequence = await client.query<{ nextValue: string }>(
        `INSERT INTO billing_sequences (tenant_id,sequence_key,next_value)
         VALUES ($1,'CREDIT_NOTE',2)
         ON CONFLICT (tenant_id,sequence_key) DO UPDATE
         SET next_value=billing_sequences.next_value+1,updated_at=CURRENT_TIMESTAMP
         RETURNING next_value-1 AS "nextValue"`,
        [c.tenant.tenantId],
      );
      const number = `CN-${String(sequence.rows[0].nextValue).padStart(8, '0')}`;
      await client.query(
        `UPDATE credit_notes
         SET credit_note_number=$3,status='ISSUED',issued_at=CURRENT_TIMESTAMP
         WHERE tenant_id=$1 AND id=$2`,
        [c.tenant.tenantId, id, number],
      );
      await this.audit.recordTenant(client, {
        ...actor(c), action: 'billing.credit_note_issued', entityType: 'CreditNote', entityId: id,
        reason: note.rows[0].reason, after: { invoiceId: note.rows[0].invoiceId, creditNoteNumber: number, amountVnd: note.rows[0].amountVnd },
      });
      await client.query('COMMIT');
      return this.creditNotes(note.rows[0].invoiceId).then((rows) => rows.find((row) => row.id === id));
    } catch (e) { await client.query('ROLLBACK').catch(() => undefined); throw e; }
    finally { client.release(); }
  }

  async voidCreditNote(id: string, input: { reason: string; idempotencyKey: string }) {
    const c = this.tenantContext.get();
    const reason = input.reason.trim();
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const note = await client.query<{ id: string; invoiceId: string; status: string }>(
        `SELECT id, invoice_id AS "invoiceId", status
         FROM credit_notes WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [c.tenant.tenantId, id],
      );
      if (!note.rows[0]) throw new NotFoundException('Credit note not found');
      if (note.rows[0].status !== 'ISSUED') throw new ConflictException('Only issued credit notes can be voided');
      const duplicate = await client.query<{ id: string; idempotencyKey: string; reason: string }>(
        `SELECT id, idempotency_key AS "idempotencyKey", reason
         FROM credit_note_voids WHERE tenant_id=$1 AND credit_note_id=$2`,
        [c.tenant.tenantId, id],
      );
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].idempotencyKey === input.idempotencyKey && duplicate.rows[0].reason === reason) {
          await client.query('COMMIT');
          return { id, status: 'VOID' };
        }
        throw new ConflictException('Credit note is already void');
      }
      const voidId = ulid();
      await client.query(
        `INSERT INTO credit_note_voids
         (id,tenant_id,credit_note_id,reason,actor_user_id,actor_membership_id,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [voidId, c.tenant.tenantId, id, reason, c.actorUserId ?? null, c.actorMembershipId ?? null, input.idempotencyKey],
      );
      await this.audit.recordTenant(client, {
        ...actor(c), action: 'billing.credit_note_voided', entityType: 'CreditNote', entityId: id,
        reason, after: { status: 'VOID' },
      });
      await client.query('COMMIT');
      return { id, status: 'VOID' };
    } catch (e) { await client.query('ROLLBACK').catch(() => undefined); throw e; }
    finally { client.release(); }
  }

  async overview() {
    const [invoices, payments] = await Promise.all([this.invoices(), this.payments()]);
    const invoiceRows = invoices as unknown as Array<InvoiceRead & { effectiveStatus: string }>;

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const outstanding = invoiceRows.reduce((sum, row) => sum + asAmount(row.total_vnd) - asAmount(row.credit_vnd) - asAmount(row.paid_vnd), 0n);
    const dueThisPeriod = invoiceRows
      .filter((row) => String(row.due_date ?? '').startsWith(period))
      .reduce((sum, row) => sum + asAmount(row.total_vnd) - asAmount(row.credit_vnd) - asAmount(row.paid_vnd), 0n);
    const overdue = invoiceRows
      .filter((row) => effectiveStatus(String(row.status), row.total_vnd, row.credit_vnd, row.paid_vnd, row.due_date) === 'OVERDUE')
      .reduce((sum, row) => sum + asAmount(row.total_vnd) - asAmount(row.credit_vnd) - asAmount(row.paid_vnd), 0n);
    const collected = payments
      .filter((row) => String(row.receivedAt).startsWith(period))
      .reduce((sum, row) => sum + asAmount(row.amountVnd), 0n);
    return {
      currency: 'VND',
      outstanding: outstanding.toString(),
      overdue: overdue.toString(),
      collectedThisPeriod: collected.toString(),
      dueThisPeriod: dueThisPeriod.toString(),
      recentInvoices: invoices.slice(0, 5),
      recentPayments: payments.slice(0, 5),
    };
  }

  async createInvoice(input: CreateInvoiceDto) {
    const c = this.tenantContext.get();
    if (input.enrollmentId && input.pricingPlanId) throw new BadRequestException('Invoice cannot specify both enrollment and pricing plan');
    const discount = BigInt(money(input.discountVnd ?? '0'));
    const client = await c.pool.connect();
    const id = ulid();
    try {
      await client.query('BEGIN');
      await this.requireStudent(client, c.tenant.tenantId, input.studentId);
      if (input.enrollmentId) await this.requireEnrollment(client, c.tenant.tenantId, input.enrollmentId, input.studentId);
      if (input.pricingPlanId && !(await client.query("SELECT 1 FROM pricing_plans WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'", [c.tenant.tenantId, input.pricingPlanId])).rows[0]) throw new BadRequestException('Pricing plan not found or inactive');

      type InvoiceItemInput = { description: string; q: string; unit: string; amount: bigint; enrollmentId?: string };
      let items: InvoiceItemInput[] = (input.items ?? []).map((item) => {
        const q = money(item.quantity, true); const unit = money(item.unitAmountVnd);
        return { description: item.description.trim(), q, unit, amount: BigInt(q) * BigInt(unit), enrollmentId: item.enrollmentId };
      });
      for (const item of items) if (item.enrollmentId) await this.requireEnrollment(client, c.tenant.tenantId, item.enrollmentId, input.studentId);

      if (input.enrollmentId && items.length === 0) {
        const pricing = await client.query<{ amountVnd: string; pricingPlanId: string | null }>(
          `SELECT ep.amount_vnd AS "amountVnd", ep.pricing_plan_id AS "pricingPlanId"
           FROM enrollment_pricing ep
           WHERE ep.tenant_id=$1 AND ep.enrollment_id=$2
             AND ep.effective_from <= COALESCE($3::date, CURRENT_DATE)
             AND (ep.effective_until IS NULL OR ep.effective_until >= COALESCE($3::date, CURRENT_DATE))
           ORDER BY ep.effective_from DESC, ep.id DESC LIMIT 1`,
          [c.tenant.tenantId, input.enrollmentId, input.issueDate ?? null],
        );
        if (pricing.rows[0]) {
          items = [{ description: 'Học phí theo mức giá ghi danh', q: '1', unit: pricing.rows[0].amountVnd, amount: asAmount(pricing.rows[0].amountVnd), enrollmentId: input.enrollmentId }];
          if (!input.pricingPlanId && pricing.rows[0].pricingPlanId) input = { ...input, pricingPlanId: pricing.rows[0].pricingPlanId };
        }
      }
      if (input.pricingPlanId && items.length === 0) {
        const plan = await client.query<{ name: string; amountVnd: string }>('SELECT name, amount_vnd AS "amountVnd" FROM pricing_plans WHERE tenant_id=$1 AND id=$2', [c.tenant.tenantId, input.pricingPlanId]);
        if (plan.rows[0]) items = [{ description: plan.rows[0].name, q: '1', unit: plan.rows[0].amountVnd, amount: asAmount(plan.rows[0].amountVnd), enrollmentId: input.enrollmentId }];
      }
      if (items.length === 0) throw new BadRequestException('Invoice requires items or a pricing snapshot');
      const subtotal = items.reduce((sum, item) => sum + item.amount, 0n);
      let enrollmentDiscount = 0n;
      if (input.enrollmentId) {
        const appliedDate = input.issueDate ?? new Date().toISOString().slice(0, 10);
        const discounts = await client.query<{ enrollmentDiscountId: string; discountId: string; code: string; name: string; kind: string; value: string; maxAmountVnd: string | null; appliedAmountVnd: string }>(
          `SELECT ed.id AS "enrollmentDiscountId", d.id AS "discountId", d.code, d.name, d.kind, d.value,
                  d.max_amount_vnd AS "maxAmountVnd", ed.amount_vnd AS "appliedAmountVnd"
           FROM enrollment_discounts ed JOIN discounts d
             ON d.tenant_id=ed.tenant_id AND d.id=ed.discount_id
           WHERE ed.tenant_id=$1 AND ed.enrollment_id=$2 AND ed.applied_at <= $3::date
             AND d.status='ACTIVE'
             AND (d.effective_from IS NULL OR d.effective_from <= $3::date)
             AND (d.effective_until IS NULL OR d.effective_until >= $3::date)
           ORDER BY ed.applied_at, ed.id`,
          [c.tenant.tenantId, input.enrollmentId, appliedDate],
        );
        for (const row of discounts.rows) {
          const applied = BigInt(row.appliedAmountVnd);
          if (row.maxAmountVnd !== null && applied > BigInt(row.maxAmountVnd)) {
            throw new ConflictException('Enrollment discount exceeds its maximum amount');
          }
          enrollmentDiscount += applied;
        }
      }
      const totalDiscount = discount + enrollmentDiscount;
      if (totalDiscount > subtotal) throw new BadRequestException('Discount exceeds subtotal');

      await client.query(`INSERT INTO invoices (id,tenant_id,invoice_number,student_id,enrollment_id,pricing_plan_id,status,issue_date,due_date,subtotal_vnd,discount_vnd,total_vnd,notes) VALUES ($1,$2,NULL,$3,$4,$5,'DRAFT',$6::date,$7::date,$8,$9,$10,$11)`, [id, c.tenant.tenantId, input.studentId, input.enrollmentId ?? null, input.pricingPlanId ?? null, input.issueDate ?? null, input.dueDate ?? null, subtotal.toString(), totalDiscount.toString(), (subtotal - totalDiscount).toString(), input.notes ?? null]);
      if (input.enrollmentId) {
        const snapshots = await client.query<{ enrollmentDiscountId: string; discountId: string; code: string; name: string; kind: string; value: string; maxAmountVnd: string | null; appliedAmountVnd: string }>(
          `SELECT ed.id AS "enrollmentDiscountId", d.id AS "discountId", d.code, d.name, d.kind, d.value,
                  d.max_amount_vnd AS "maxAmountVnd", ed.amount_vnd AS "appliedAmountVnd"
           FROM enrollment_discounts ed JOIN discounts d
             ON d.tenant_id=ed.tenant_id AND d.id=ed.discount_id
           WHERE ed.tenant_id=$1 AND ed.enrollment_id=$2 AND ed.applied_at <= COALESCE($3::date, CURRENT_DATE)
             AND d.status='ACTIVE'
             AND (d.effective_from IS NULL OR d.effective_from <= COALESCE($3::date, CURRENT_DATE))
             AND (d.effective_until IS NULL OR d.effective_until >= COALESCE($3::date, CURRENT_DATE))
           ORDER BY ed.applied_at, ed.id`,
          [c.tenant.tenantId, input.enrollmentId, input.issueDate ?? null],
        );
        for (const snapshot of snapshots.rows) {
          const applied = BigInt(snapshot.appliedAmountVnd);
          if (snapshot.maxAmountVnd !== null && applied > BigInt(snapshot.maxAmountVnd)) {
            throw new ConflictException('Enrollment discount exceeds its maximum amount');
          }
          await client.query(
            `INSERT INTO invoice_discount_snapshots
             (id,tenant_id,invoice_id,enrollment_discount_id,discount_id,code,name,kind,value,max_amount_vnd,amount_vnd)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [ulid(), c.tenant.tenantId, id, snapshot.enrollmentDiscountId, snapshot.discountId, snapshot.code, snapshot.name, snapshot.kind, snapshot.value, snapshot.maxAmountVnd, applied],
          );
        }
      }
      await client.query(`INSERT INTO invoice_status_history (id,tenant_id,invoice_id,status,effective_at) VALUES ($1,$2,$3,'DRAFT',CURRENT_TIMESTAMP)`, [ulid(), c.tenant.tenantId, id]);
      for (const item of items) await client.query(`INSERT INTO invoice_items (id,tenant_id,invoice_id,enrollment_id,description,quantity,unit_amount_vnd,amount_vnd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [ulid(), c.tenant.tenantId, id, item.enrollmentId ?? input.enrollmentId ?? null, item.description, item.q, item.unit, item.amount.toString()]);
      await this.audit.recordTenant(client, { ...actor(c), action: 'billing.invoice_created', entityType: 'Invoice', entityId: id, after: { studentId: input.studentId, totalVnd: (subtotal - totalDiscount).toString(), discountVnd: totalDiscount.toString() } });
      await client.query('COMMIT');
      return this.invoice(id);
    } catch (e) { await client.query('ROLLBACK').catch(() => undefined); throw e; } finally { client.release(); }
  }

  async issue(id: string, input: InvoiceCommandDto = {}) { return this.command(id, 'ISSUED', 'billing.invoice_issued', input.reason); }
  async void(id: string, input: InvoiceCommandDto = {}) { return this.command(id, 'VOID', 'billing.invoice_voided', input.reason); }

  async recordPayment(invoiceId: string, input: RecordPaymentDto) {
    const c = this.tenantContext.get();
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await this.idempotentPayment(client, c.tenant.tenantId, input.idempotencyKey);
      if (existing) {
        this.assertPaymentIdempotency(existing, invoiceId, input);
        await client.query('COMMIT');
        return this.payment(existing.id);
      }
      const inv = await client.query<{ totalVnd: string; status: string; studentId: string; credit_vnd: string; paid_vnd: string }>(
        `${invoiceSelect} WHERE i.tenant_id=$1 AND i.id=$2 FOR UPDATE OF i`,
        [c.tenant.tenantId, invoiceId],
      );
      if (!inv.rows[0]) throw new NotFoundException('Invoice not found');
      if (inv.rows[0].status !== 'ISSUED') throw new ConflictException('Only issued invoices can receive payments');
      if (input.studentId && input.studentId !== inv.rows[0].studentId) throw new BadRequestException('Payment student does not match invoice');
      const outstanding = asAmount(inv.rows[0].totalVnd) - asAmount(inv.rows[0].credit_vnd) - asAmount(inv.rows[0].paid_vnd);
      const amount = BigInt(money(input.amountVnd, true));
      if (amount > outstanding) throw new ConflictException('Payment exceeds invoice balance');
      const id = await this.insertPayment(client, c, input, invoiceId, input.studentId ?? inv.rows[0].studentId);
      await this.insertAllocation(client, c.tenant.tenantId, id, invoiceId, input.amountVnd);
      await this.audit.recordTenant(client, { ...actor(c), action: 'billing.payment_recorded', entityType: 'Payment', entityId: id, after: { invoiceId, amountVnd: input.amountVnd } });
      const dispatch = await this.communication.dispatchWithinTransaction(client, { eventType: 'PAYMENT_RECEIVED', sourceEntityId: id });
      await client.query('COMMIT');
      await this.communication.deliver(dispatch.messageIds);
      return this.payment(id);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (this.isPaymentIdempotencyViolation(e)) {
        const existing = await this.idempotentPayment(c.pool, c.tenant.tenantId, input.idempotencyKey);
        if (existing) {
          this.assertPaymentIdempotency(existing, invoiceId, input);
          return this.payment(existing.id);
        }
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async recordUnallocatedPayment(input: RecordPaymentDto) {
    const c = this.tenantContext.get();
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await this.idempotentPayment(client, c.tenant.tenantId, input.idempotencyKey);
      if (existing) {
        this.assertPaymentIdempotency(existing, null, input);
        await client.query('COMMIT');
        return this.payment(existing.id);
      }
      const id = await this.insertPayment(client, c, input, null, input.studentId ?? null);
      await this.audit.recordTenant(client, { ...actor(c), action: 'billing.payment_recorded', entityType: 'Payment', entityId: id, after: { amountVnd: input.amountVnd, unallocated: true } });
      await client.query('COMMIT');
      return this.payment(id);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (this.isPaymentIdempotencyViolation(e)) {
        const existing = await this.idempotentPayment(c.pool, c.tenant.tenantId, input.idempotencyKey);
        if (existing) {
          this.assertPaymentIdempotency(existing, null, input);
          return this.payment(existing.id);
        }
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async allocatePayment(paymentId: string, input: AllocatePaymentBatchDto) {
    const c = this.tenantContext.get();
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const payment = await client.query<{ amountVnd: string; studentId: string | null }>(
        `SELECT amount_vnd AS "amountVnd", student_id AS "studentId"
         FROM payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [c.tenant.tenantId, paymentId],
      );
      if (!payment.rows[0]) throw new NotFoundException('Payment not found');
      if ((await client.query(
        'SELECT 1 FROM payment_reversals WHERE tenant_id=$1 AND payment_id=$2',
        [c.tenant.tenantId, paymentId],
      )).rows[0]) throw new ConflictException('Reversed payments cannot be allocated');
      if (!input.allocations?.length) throw new BadRequestException('At least one allocation is required');
      const invoiceIds = input.allocations.map((item) => item.invoiceId);
      if (new Set(invoiceIds).size !== invoiceIds.length) {
        throw new BadRequestException('Each invoice may appear only once per allocation');
      }
      const duplicate = await client.query<{ amountVnd: string; invoiceId: string }>(
        `SELECT amount_vnd AS "amountVnd", invoice_id AS "invoiceId"
         FROM payment_allocations
         WHERE tenant_id=$1 AND payment_id=$2 AND idempotency_key=$3`,
        [c.tenant.tenantId, paymentId, input.idempotencyKey],
      );
      if (duplicate.rows[0]) {
        const same = duplicate.rows.length === input.allocations.length && input.allocations.every((item) =>
          duplicate.rows.some((row) => row.invoiceId === item.invoiceId && String(row.amountVnd) === item.amountVnd),
        );
        if (!same) throw new ConflictException('Idempotency key is already used with different allocation details');
        await client.query('COMMIT');
        return this.payment(paymentId);
      }
      const total = input.allocations.reduce((sum, item) => sum + BigInt(money(item.amountVnd, true)), 0n);
      const allocated = await client.query<{ sum: string }>(
        `SELECT COALESCE(SUM(amount_vnd),0)::text AS sum
         FROM payment_allocations WHERE tenant_id=$1 AND payment_id=$2`,
        [c.tenant.tenantId, paymentId],
      );
      if (asAmount(allocated.rows[0].sum) + total > asAmount(payment.rows[0].amountVnd)) {
        throw new ConflictException('Payment allocations exceed payment amount');
      }
      // Lock invoices in a stable order so different payments cannot deadlock on a shared batch.
      for (const item of [...input.allocations].sort((left, right) => left.invoiceId.localeCompare(right.invoiceId))) {
        const inv = await client.query<{ studentId: string; totalVnd: string; credit_vnd: string; paid_vnd: string; status: string }>(
          `${invoiceSelect} WHERE i.tenant_id=$1 AND i.id=$2 FOR UPDATE OF i`,
          [c.tenant.tenantId, item.invoiceId],
        );
        if (!inv.rows[0]) throw new NotFoundException('Invoice not found');
        if (inv.rows[0].status !== 'ISSUED') throw new ConflictException('Only issued invoices can receive payments');
        if (payment.rows[0].studentId && payment.rows[0].studentId !== inv.rows[0].studentId) throw new ConflictException('Payment student does not match invoice');
        const due = asAmount(inv.rows[0].totalVnd) - asAmount(inv.rows[0].credit_vnd) - asAmount(inv.rows[0].paid_vnd);
        if (BigInt(item.amountVnd) > due) throw new ConflictException('Payment exceeds invoice balance');
        await this.insertAllocation(client, c.tenant.tenantId, paymentId, item.invoiceId, item.amountVnd, input.idempotencyKey);
      }
      await this.audit.recordTenant(client, { ...actor(c), action: 'billing.payment_allocated', entityType: 'Payment', entityId: paymentId, after: { allocations: input.allocations } });
      await client.query('COMMIT');
      return this.payment(paymentId);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async reversePayment(id: string, input: ReversePaymentDto) { const c=this.tenantContext.get(); const client=await c.pool.connect(); try { await client.query('BEGIN'); const r=await client.query<{invoiceId:string|null;amountVnd:string}>(`SELECT invoice_id AS "invoiceId",amount_vnd AS "amountVnd" FROM payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[c.tenant.tenantId,id]); if(!r.rows[0]) throw new NotFoundException('Payment not found'); const existing=await client.query<{id:string;idempotency_key:string}>(`SELECT id,idempotency_key FROM payment_reversals WHERE tenant_id=$1 AND payment_id=$2`,[c.tenant.tenantId,id]); if(existing.rows[0]) { if (existing.rows[0].idempotency_key === input.idempotencyKey) { await client.query('COMMIT'); return {id:existing.rows[0].id,status:'REVERSED'}; } throw new ConflictException('Payment is already reversed'); } const reversalId=ulid(); await client.query(`INSERT INTO payment_reversals (id,tenant_id,payment_id,reason,actor_user_id,actor_membership_id,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[reversalId,c.tenant.tenantId,id,input.reason.trim(),c.actorUserId??null,c.actorMembershipId??null,input.idempotencyKey]); await this.audit.recordTenant(client,{...actor(c),action:'billing.payment_reversed',entityType:'PaymentReversal',entityId:reversalId,reason:input.reason.trim(),after:{paymentId:id,amountVnd:r.rows[0].amountVnd}}); await client.query('COMMIT'); return {id:reversalId,paymentId:id,status:'REVERSED'}; }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();} }

  async refundPayment(id: string, input: { amountVnd: string; reason: string; idempotencyKey: string }) {
    const c = this.tenantContext.get();
    const amount = BigInt(money(input.amountVnd, true));
    const client = await c.pool.connect();
    try {
      await client.query('BEGIN');
      const payment = await client.query<{ amountVnd: string }>(
        `SELECT amount_vnd AS "amountVnd" FROM payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [c.tenant.tenantId, id],
      );
      if (!payment.rows[0]) throw new NotFoundException('Payment not found');

      const existing = await client.query<{ id: string; amountVnd: string; reason: string }>(
        `SELECT id, amount_vnd AS "amountVnd", reason
         FROM refunds
         WHERE tenant_id=$1 AND payment_id=$2 AND idempotency_key=$3`,
        [c.tenant.tenantId, id, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (String(existing.rows[0].amountVnd) !== amount.toString() || existing.rows[0].reason !== input.reason.trim()) {
          throw new ConflictException('Idempotency key is already used with different refund details');
        }
        await client.query('COMMIT');
        return this.refund(existing.rows[0].id);
      }
      if ((await client.query(
        `SELECT 1 FROM payment_reversals WHERE tenant_id=$1 AND payment_id=$2`,
        [c.tenant.tenantId, id],
      )).rows[0]) throw new ConflictException('Reversed payments cannot be refunded');

      const prior = await client.query<{ sum: string }>(
        `SELECT COALESCE(SUM(amount_vnd), 0)::text AS sum
         FROM refunds WHERE tenant_id=$1 AND payment_id=$2`,
        [c.tenant.tenantId, id],
      );
      if (asAmount(prior.rows[0].sum) + amount > asAmount(payment.rows[0].amountVnd)) {
        throw new ConflictException('Refund exceeds payment');
      }

      const refundId = ulid();
      await client.query(
        `INSERT INTO refunds
         (id,tenant_id,payment_id,amount_vnd,reason,actor_user_id,actor_membership_id,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [refundId, c.tenant.tenantId, id, amount.toString(), input.reason.trim(), c.actorUserId ?? null, c.actorMembershipId ?? null, input.idempotencyKey],
      );

      let remaining = amount;
      const allocations = await client.query<{ id: string; amountVnd: string; refundedVnd: string }>(
        `SELECT pa.id, pa.amount_vnd AS "amountVnd",
                COALESCE((SELECT SUM(ra.amount_vnd) FROM refund_allocations ra
                          WHERE ra.tenant_id=pa.tenant_id AND ra.payment_allocation_id=pa.id), 0)::text AS "refundedVnd"
         FROM payment_allocations pa
         WHERE pa.tenant_id=$1 AND pa.payment_id=$2
         ORDER BY pa.created_at, pa.id
         FOR UPDATE`,
        [c.tenant.tenantId, id],
      );
      for (const allocation of allocations.rows) {
        const available = asAmount(allocation.amountVnd) - asAmount(allocation.refundedVnd);
        const allocationAmount = available < remaining ? available : remaining;
        if (allocationAmount <= 0n) continue;
        await client.query(
          `INSERT INTO refund_allocations (id,tenant_id,refund_id,payment_allocation_id,amount_vnd)
           VALUES ($1,$2,$3,$4,$5)`,
          [ulid(), c.tenant.tenantId, refundId, allocation.id, allocationAmount.toString()],
        );
        remaining -= allocationAmount;
        if (remaining === 0n) break;
      }
      if (remaining > 0n) {
        const allocatedTotal = await client.query<{ sum: string }>(
          `SELECT COALESCE(SUM(amount_vnd), 0)::text AS sum
           FROM payment_allocations WHERE tenant_id=$1 AND payment_id=$2`,
          [c.tenant.tenantId, id],
        );
        const priorUnallocated = await client.query<{ sum: string }>(
          `SELECT COALESCE(SUM(r.amount_vnd - COALESCE((SELECT SUM(ra.amount_vnd) FROM refund_allocations ra
                             WHERE ra.tenant_id=r.tenant_id AND ra.refund_id=r.id), 0)), 0)::text AS sum
           FROM refunds r
           WHERE r.tenant_id=$1 AND r.payment_id=$2 AND r.id <> $3`,
          [c.tenant.tenantId, id, refundId],
        );
        const unallocated = asAmount(payment.rows[0].amountVnd) - asAmount(allocatedTotal.rows[0].sum) - asAmount(priorUnallocated.rows[0].sum);
        if (remaining > unallocated) throw new ConflictException('Refund exceeds available payment balance');
        // Unallocated refunds intentionally have no refund_allocations row; they reduce customer credit only.
      }

      await this.audit.recordTenant(client, {
        ...actor(c), action: 'billing.payment_refunded', entityType: 'Refund', entityId: refundId,
        reason: input.reason.trim(), after: { paymentId: id, amountVnd: amount.toString() },
      });
      await client.query('COMMIT');
      return this.refund(refundId);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isUniqueViolation(e)) {
        const existing = await c.pool.query<{ id: string; amountVnd: string; reason: string }>(
          `SELECT id, amount_vnd AS "amountVnd", reason
           FROM refunds
           WHERE tenant_id=$1 AND payment_id=$2 AND idempotency_key=$3`,
          [c.tenant.tenantId, id, input.idempotencyKey],
        );
        if (existing.rows[0]) {
          if (String(existing.rows[0].amountVnd) !== amount.toString() || existing.rows[0].reason !== input.reason.trim()) {
            throw new ConflictException('Idempotency key is already used with different refund details');
          }
          return this.refund(existing.rows[0].id);
        }
      }
      throw e;
    } finally { client.release(); }
  }

  async invoice(id: string, asOf?: string) {
    const { tenant, pool } = this.tenantContext.get();
    const asOfValue = asOfTimestamp(asOf);
    const values: unknown[] = [tenant.tenantId, id];
    if (asOfValue) values.push(asOfValue);
    const select = asOfValue ? invoiceSelectAt('$3') : invoiceSelect;
    const result = await pool.query<InvoiceRead>(`${select} WHERE i.tenant_id=$1 AND i.id=$2`, values);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Invoice not found');
    return invoiceResponse(row, asOf);
  }
  private async payment(id:string){const {tenant,pool}=this.tenantContext.get();const r=await pool.query(`SELECT p.id,p.tenant_id AS "tenantId",p.invoice_id AS "invoiceId",p.student_id AS "studentId",s.full_name AS "studentName",i.invoice_number AS "invoiceNumber",p.amount_vnd AS "amountVnd",p.method,p.reference,p.note,p.received_at AS "receivedAt",p.created_at AS "createdAt",CASE WHEN EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.tenant_id=p.tenant_id AND pr.payment_id=p.id) THEN 'REVERSED' ELSE 'RECORDED' END AS status FROM payments p LEFT JOIN students s ON s.tenant_id=p.tenant_id AND s.id=p.student_id LEFT JOIN invoices i ON i.tenant_id=p.tenant_id AND i.id=p.invoice_id WHERE p.tenant_id=$1 AND p.id=$2`,[tenant.tenantId,id]);if(!r.rows[0])throw new NotFoundException('Payment not found');return serialize(r.rows[0]);}
  private async refund(id:string){const {tenant,pool}=this.tenantContext.get();const r=await pool.query(`SELECT r.id,r.payment_id AS "paymentId",p.student_id AS "studentId",s.full_name AS "studentName",r.amount_vnd AS amount,r.created_at AS "requestedAt",r.reason,'REFUNDED' AS status FROM refunds r JOIN payments p ON p.tenant_id=r.tenant_id AND p.id=r.payment_id LEFT JOIN students s ON s.tenant_id=p.tenant_id AND s.id=p.student_id WHERE r.tenant_id=$1 AND r.id=$2`,[tenant.tenantId,id]);if(!r.rows[0])throw new NotFoundException('Refund not found');return serialize(r.rows[0]);}
  private async command(id:string,status:string,action:string,reason?:string){const c=this.tenantContext.get();const client=await c.pool.connect();try{await client.query('BEGIN');const q=await client.query(`${invoiceSelect} WHERE i.tenant_id=$1 AND i.id=$2 FOR UPDATE OF i`,[c.tenant.tenantId,id]);const row=q.rows[0];if(!row)throw new NotFoundException('Invoice not found');if(status==='ISSUED'&&row.status!=='DRAFT')throw new ConflictException('Only draft invoices can be issued');if(status==='VOID'&&row.status!=='ISSUED')throw new ConflictException('Only issued invoices can be voided');if(status==='VOID'&&asAmount(row.paid_vnd)>0n)throw new ConflictException('Only unpaid invoices can be voided');let number=row.invoice_number;if(status==='ISSUED'){if(row.enrollment_id){await client.query('SELECT id FROM enrollments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[c.tenant.tenantId,row.enrollment_id]);await client.query('UPDATE enrollment_pricing SET locked_at=COALESCE(locked_at,CURRENT_TIMESTAMP) WHERE tenant_id=$1 AND enrollment_id=$2 AND locked_at IS NULL',[c.tenant.tenantId,row.enrollment_id]);}const sequence=await client.query<{nextValue:string}>(`INSERT INTO billing_sequences (tenant_id,sequence_key,next_value) VALUES ($1,'INVOICE',2) ON CONFLICT (tenant_id,sequence_key) DO UPDATE SET next_value=billing_sequences.next_value+1,updated_at=CURRENT_TIMESTAMP RETURNING next_value-1 AS "nextValue"`,[c.tenant.tenantId]);number=`INV-${String(sequence.rows[0].nextValue).padStart(8,'0')}`;}await client.query(`UPDATE invoices SET status=$3,invoice_number=COALESCE($4,invoice_number),issue_date=COALESCE(issue_date,CURRENT_DATE),voided_at=CASE WHEN $3='VOID' THEN CURRENT_TIMESTAMP ELSE voided_at END,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,[c.tenant.tenantId,id,status,number]);await client.query(`INSERT INTO invoice_status_history (id,tenant_id,invoice_id,status,effective_at) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)`,[ulid(),c.tenant.tenantId,id,status]);await this.audit.recordTenant(client,{...actor(c),action,entityType:'Invoice',entityId:id,after:{status,invoiceNumber:number},reason});await client.query('COMMIT');return this.invoice(id);}catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}}
  private assertPaymentIdempotency(existing: { invoiceId: string | null; amountVnd: string; studentId: string | null; method: string }, invoiceId: string | null, input: RecordPaymentDto) {
    const studentMismatch = input.studentId !== undefined && (existing.studentId ?? null) !== input.studentId;
    if (existing.invoiceId !== invoiceId || String(existing.amountVnd) !== input.amountVnd || existing.method !== input.method || studentMismatch) {
      throw new ConflictException('Idempotency key is already used with different payment details');
    }
  }

  private isPaymentIdempotencyViolation(error: unknown) {
    return isUniqueViolation(error);
  }

  private async insertPayment(client: PoolClient, c: ReturnType<TenantContextService['get']>, input: RecordPaymentDto, invoiceId: string | null = null, studentId: string | null = input.studentId ?? null) { const id=ulid(); if (studentId) await this.requireStudent(client, c.tenant.tenantId, studentId); await client.query(`INSERT INTO payments (id,tenant_id,invoice_id,student_id,amount_vnd,method,reference,note,received_at,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,c.tenant.tenantId,invoiceId,studentId,input.amountVnd,input.method,input.reference??null,input.note??null,input.receivedAt??new Date(),input.idempotencyKey]); return id; }
  private async idempotentPayment(client: Pool | PoolClient, tenantId:string, key:string) { const r=await client.query(`SELECT id,invoice_id AS "invoiceId",amount_vnd AS "amountVnd",student_id AS "studentId",method FROM payments WHERE tenant_id=$1 AND idempotency_key=$2`,[tenantId,key]); return r.rows[0]; }
  private async insertAllocation(client:PoolClient, tenantId:string, paymentId:string, invoiceId:string, amount:string, idempotencyKey?:string) { await client.query(`INSERT INTO payment_allocations (id,tenant_id,payment_id,invoice_id,amount_vnd,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6)`,[ulid(),tenantId,paymentId,invoiceId,amount,idempotencyKey??null]); }
  private async requireStudent(client:PoolClient,tenantId:string,id:string){if(!(await client.query('SELECT 1 FROM students WHERE tenant_id=$1 AND id=$2',[tenantId,id])).rows[0])throw new NotFoundException('Student not found');}
  private async requireEnrollment(client:PoolClient,tenantId:string,id:string,studentId:string){if(!(await client.query('SELECT 1 FROM enrollments WHERE tenant_id=$1 AND id=$2 AND student_id=$3',[tenantId,id,studentId])).rows[0])throw new BadRequestException('Enrollment does not belong to student');}
}
function effectiveStatus(status:string,total:unknown,credit:unknown,paid:unknown,dueDate:unknown,now=Date.now()){if(status==='VOID')return 'VOID';const netDue=asAmount(total)-asAmount(credit);const collected=asAmount(paid);if(collected>=netDue)return 'PAID';if(collected>0n)return 'PARTIALLY_PAID';if(status==='ISSUED'&&dueDate&&new Date(String(dueDate)).getTime()<now)return 'OVERDUE';return status;}
