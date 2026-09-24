import dotenv from 'dotenv';
dotenv.config({ override: true });

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { escapeIdentifier, Pool } from 'pg';
import { ulid } from 'ulid';
import { deployTenantSchema } from '../src/database/tenant-migrations.js';
import { postgresConfig } from '../src/config.js';
import { AuditService } from '../src/audit/audit.service.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantContextService, type TenantContext } from '../src/tenant/tenant-context.service.js';
import type { ResolvedTenant } from '../src/tenant/tenant-resolver.service.js';
import { BillingService } from '../src/billing/billing.service.js';

const enabled = process.env.B5_TEST_DATABASE === '1';

type Fixture = {
  studentId: string;
  enrollmentId: string;
  planId: string;
};

describe.skipIf(!enabled)('LOCAL-08 billing hard gates (real PostgreSQL)', () => {
  let admin: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let dbNameA = '';
  let dbNameB = '';
  let tenantContext: TenantContextService;
  let service: BillingService;
  const tenantA = { tenantId: ulid(), tenantSlug: 'local08-a', dbName: '' };
  const tenantB = { tenantId: ulid(), tenantSlug: 'local08-b', dbName: '' };

  const run = <T>(tenant: ResolvedTenant, pool: Pool, callback: () => Promise<T>) =>
    tenantContext.run<T>({ tenant, pool } as TenantContext, callback);

  const query = (pool: Pool, text: string, values?: unknown[]) => pool.query(text, values);

  async function seed(pool: Pool, tenantId: string, code: string): Promise<Fixture> {
    const studentId = ulid();
    const classId = ulid();
    const enrollmentId = ulid();
    const planId = ulid();
    await query(pool, 'INSERT INTO students (id, tenant_id, code, full_name) VALUES ($1, $2, $3, $4)', [studentId, tenantId, `STUDENT-${code}`, `Student ${code}`]);
    await query(pool, 'INSERT INTO classes (id, tenant_id, code, name) VALUES ($1, $2, $3, $4)', [classId, tenantId, `CLASS-${code}`, `Class ${code}`]);
    await query(pool, 'INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ($1, $2, $3, $4, \'ACTIVE\')', [enrollmentId, tenantId, studentId, classId]);
    await query(pool, 'INSERT INTO pricing_plans (id, tenant_id, code, name, amount_vnd) VALUES ($1, $2, $3, $4, 1000)', [planId, tenantId, `PLAN-${code}`, `Plan ${code}`]);
    return { studentId, enrollmentId, planId };
  }

  async function draftInvoice(tenant: ResolvedTenant, pool: Pool, fixture: Fixture, amount = '1000') {
    return run(tenant, pool, () => service.createInvoice({
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      items: [{ description: 'Tuition', quantity: '1', unitAmountVnd: amount, enrollmentId: fixture.enrollmentId }],
    }));
  }

  async function issue(tenant: ResolvedTenant, pool: Pool, id: string) {
    return run(tenant, pool, () => service.issue(id));
  }

  beforeAll(async () => {
    const config = postgresConfig();
    admin = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    const runId = `${Date.now()}_${process.pid}`;
    dbNameA = `classora_local08_${runId}_a`;
    dbNameB = `classora_local08_${runId}_b`;
    tenantA.dbName = dbNameA;
    tenantB.dbName = dbNameB;
    for (const dbName of [dbNameA, dbNameB]) {
      await admin.query(`CREATE DATABASE ${escapeIdentifier(dbName)}`);
      await deployTenantSchema(dbName);
    }
    const connection = { host: config.host, port: config.port, user: config.user, password: config.password };
    poolA = new Pool({ ...connection, database: dbNameA, max: 12 });
    poolB = new Pool({ ...connection, database: dbNameB, max: 12 });
    tenantContext = new TenantContextService();
    service = new BillingService(tenantContext, new AuditService({} as ControlDatabaseService, tenantContext));
  }, 120_000);

  afterAll(async () => {
    for (const pool of [poolA, poolB, admin]) if (pool) await pool.end().catch(() => undefined);
    const config = postgresConfig();
    const cleanup = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    for (const dbName of [dbNameA, dbNameB].filter(Boolean)) {
      await cleanup.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)} WITH (FORCE)`).catch(() => undefined);
    }
    await cleanup.end().catch(() => undefined);
  });

  it('isolates billing reads and writes across tenant databases', async () => {
    const a = await seed(poolA, tenantA.tenantId, 'A1');
    const b = await seed(poolB, tenantB.tenantId, 'B1');
    const invoice = await draftInvoice(tenantA, poolA, a);
    await issue(tenantA, poolA, invoice.id as string);

    await expect(run(tenantB, poolB, () => service.invoice(invoice.id as string))).rejects.toThrow('Invoice not found');
    await expect(run(tenantB, poolB, () => service.recordPayment(invoice.id as string, {
      amountVnd: '100', method: 'CASH', idempotencyKey: 'cross-tenant-payment',
    }))).rejects.toThrow('Invoice not found');
    await expect(run(tenantB, poolB, () => service.createInvoice({
      studentId: a.studentId,
      items: [{ description: 'Cross tenant', quantity: '1', unitAmountVnd: '100' }],
    }))).rejects.toThrow('Student not found');

    expect((await run(tenantB, poolB, () => service.invoices())).every((row) => row.id !== invoice.id)).toBe(true);
    expect((await run(tenantB, poolB, () => service.customerCredit())).every((row) => row.studentId !== a.studentId)).toBe(true);
    expect(b.studentId).not.toBe(a.studentId);
  });

  it('assigns unique tenant-local invoice numbers under concurrent issue', async () => {
    const fixture = await seed(poolA, tenantA.tenantId, 'NUM');
    const drafts = await Promise.all(Array.from({ length: 4 }, () => draftInvoice(tenantA, poolA, fixture)));
    const issued = await Promise.all(drafts.map((invoice) => issue(tenantA, poolA, invoice.id as string)));
    const numbers = issued.map((invoice) => invoice.invoiceNumber);
    expect(new Set(numbers).size).toBe(4);
    expect(numbers.every((number) => /^INV-\d{8}$/.test(String(number)))).toBe(true);
    const sequenceValues = numbers.map((number) => Number(String(number).slice(4))).sort((left, right) => left - right);
    expect(sequenceValues).toEqual([sequenceValues[0], sequenceValues[0] + 1, sequenceValues[0] + 2, sequenceValues[0] + 3]);
  });

  it('assigns unique tenant-local credit-note numbers under concurrent issue', async () => {
    const fixture = await seed(poolA, tenantA.tenantId, 'CREDIT-NUM');
    const invoice = await draftInvoice(tenantA, poolA, fixture, '1000');
    await issue(tenantA, poolA, invoice.id as string);
    const notes = await Promise.all(Array.from({ length: 4 }, (_, index) => run(tenantA, poolA, () => service.createCreditNote(invoice.id as string, {
      amountVnd: '10', reason: `Credit ${index}`, idempotencyKey: `credit-number-${index}`,
    }))));
    const issued = await Promise.all(notes.map((note) => run(tenantA, poolA, () => service.issueCreditNote(note.id as string))));
    const numbers = issued.map((note) => note?.creditNoteNumber);
    expect(new Set(numbers).size).toBe(4);
    expect(numbers.every((number) => /^CN-\d{8}$/.test(String(number)))).toBe(true);
    const sequenceValues = numbers.map((number) => Number(String(number).slice(3))).sort((left, right) => left - right);
    expect(sequenceValues).toEqual([sequenceValues[0], sequenceValues[0] + 1, sequenceValues[0] + 2, sequenceValues[0] + 3]);
  });

  it('serializes concurrent allocations so payment and invoice balances are never exceeded', async () => {
    const fixture = await seed(poolA, tenantA.tenantId, 'ALLOC');
    const invoice = await draftInvoice(tenantA, poolA, fixture, '100');
    await issue(tenantA, poolA, invoice.id as string);
    const payment = await run(tenantA, poolA, () => service.recordUnallocatedPayment({
      amountVnd: '100', method: 'CASH', studentId: fixture.studentId, idempotencyKey: 'alloc-payment',
    }));
    const results = await Promise.allSettled([
      run(tenantA, poolA, () => service.allocatePayment(payment.id as string, {
        allocations: [{ invoiceId: invoice.id as string, amountVnd: '60' }], idempotencyKey: 'alloc-a',
      })),
      run(tenantA, poolA, () => service.allocatePayment(payment.id as string, {
        allocations: [{ invoiceId: invoice.id as string, amountVnd: '60' }], idempotencyKey: 'alloc-b',
      })),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const totals = await query(poolA, 'SELECT COALESCE(SUM(amount_vnd), 0)::text AS total FROM payment_allocations WHERE tenant_id=$1 AND payment_id=$2', [tenantA.tenantId, payment.id]);
    expect(totals.rows[0].total).toBe('60');

    const sameKeyPayment = await run(tenantA, poolA, () => service.recordUnallocatedPayment({
      amountVnd: '100', method: 'CASH', studentId: fixture.studentId, idempotencyKey: 'alloc-idempotency-payment',
    }));
    const sameKeyInput = {
      allocations: [{ invoiceId: invoice.id as string, amountVnd: '20' }],
      idempotencyKey: 'alloc-idempotency-race',
    };
    const sameKeyResults = await Promise.allSettled([
      run(tenantA, poolA, () => service.allocatePayment(sameKeyPayment.id as string, sameKeyInput)),
      run(tenantA, poolA, () => service.allocatePayment(sameKeyPayment.id as string, sameKeyInput)),
    ]);
    expect(sameKeyResults.every((result) => result.status === 'fulfilled'), JSON.stringify(sameKeyResults)).toBe(true);
    const sameKeyRows = await query(poolA, 'SELECT COUNT(*)::text AS count FROM payment_allocations WHERE tenant_id=$1 AND payment_id=$2 AND idempotency_key=$3', [tenantA.tenantId, sameKeyPayment.id, sameKeyInput.idempotencyKey]);
    expect(sameKeyRows.rows[0].count).toBe('1');
  });

  it('deduplicates concurrent payment creation by idempotency key', async () => {
    const fixture = await seed(poolA, tenantA.tenantId, 'PAYMENT-IDEMPOTENCY');
    const invoice = await draftInvoice(tenantA, poolA, fixture, '1000');
    await issue(tenantA, poolA, invoice.id as string);
    const input = { amountVnd: '100', method: 'CASH' as const, idempotencyKey: 'payment-race' };
    const results = await Promise.allSettled([
      run(tenantA, poolA, () => service.recordPayment(invoice.id as string, input)),
      run(tenantA, poolA, () => service.recordPayment(invoice.id as string, input)),
    ]);
    expect(results.every((result) => result.status === 'fulfilled'), JSON.stringify(results)).toBe(true);
    const payments = await query(poolA, 'SELECT COUNT(*)::text AS count FROM payments WHERE tenant_id=$1 AND idempotency_key=$2', [tenantA.tenantId, input.idempotencyKey]);
    expect(payments.rows[0].count).toBe('1');
    const first = results.find((result) => result.status === 'fulfilled');
    if (first?.status !== 'fulfilled') throw new Error('Payment retry did not return a response');
    expect(first.value).toMatchObject({
      id: expect.any(String),
      invoiceId: invoice.id,
      studentId: fixture.studentId,
      amountVnd: '100',
      method: 'CASH',
      status: 'RECORDED',
    });
  });

  it('keeps credit notes out of paid cash and applies allocated refunds to receivables', async () => {
    const fixture = await seed(poolA, tenantA.tenantId, 'REFUND');
    const invoice = await draftInvoice(tenantA, poolA, fixture, '1000');
    await issue(tenantA, poolA, invoice.id as string);
    const payment = await run(tenantA, poolA, () => service.recordPayment(invoice.id as string, {
      amountVnd: '600', method: 'CASH', idempotencyKey: 'refund-payment',
    }));
    const note = await run(tenantA, poolA, () => service.createCreditNote(invoice.id as string, {
      amountVnd: '200', reason: 'Service credit', idempotencyKey: 'credit-note-create',
    }));
    await run(tenantA, poolA, () => service.issueCreditNote(note.id as string));
    let current = await run(tenantA, poolA, () => service.invoice(invoice.id as string));
    expect(current).toMatchObject({ paidVnd: '600', creditVnd: '200', outstandingVnd: '200' });

    await run(tenantA, poolA, () => service.refundPayment(payment.id as string, {
      amountVnd: '100', reason: 'Cash refund', idempotencyKey: 'refund-100',
    }));
    current = await run(tenantA, poolA, () => service.invoice(invoice.id as string));
    expect(current).toMatchObject({ paidVnd: '500', creditVnd: '200', outstandingVnd: '300' });

    await run(tenantA, poolA, () => service.voidCreditNote(note.id as string, {
      reason: 'Credit reversed', idempotencyKey: 'credit-note-void',
    }));
    current = await run(tenantA, poolA, () => service.invoice(invoice.id as string));
    expect(current).toMatchObject({ paidVnd: '500', creditVnd: '0', outstandingVnd: '500' });
  });

  it('calculates invoice balances as of the requested ledger timestamp', async () => {
    const fixture = await seed(poolA, tenantA.tenantId, 'AS-OF');
    const invoice = await draftInvoice(tenantA, poolA, fixture, '1000');
    await issue(tenantA, poolA, invoice.id as string);

    const beforePayment = await query(poolA, 'SELECT clock_timestamp() AS now');
    const payment = await run(tenantA, poolA, () => service.recordPayment(invoice.id as string, {
      amountVnd: '600', method: 'CASH', idempotencyKey: 'as-of-payment',
    }));
    const beforeCredit = await query(poolA, 'SELECT clock_timestamp() AS now');
    const note = await run(tenantA, poolA, () => service.createCreditNote(invoice.id as string, {
      amountVnd: '200', reason: 'As-of credit', idempotencyKey: 'as-of-credit',
    }));
    await run(tenantA, poolA, () => service.issueCreditNote(note.id as string));
    const beforeRefund = await query(poolA, 'SELECT clock_timestamp() AS now');
    await run(tenantA, poolA, () => service.refundPayment(payment.id as string, {
      amountVnd: '100', reason: 'As-of refund', idempotencyKey: 'as-of-refund',
    }));

    await expect(run(tenantA, poolA, () => service.invoice(invoice.id as string, beforePayment.rows[0].now.toISOString()))).resolves.toMatchObject({
      paidVnd: '0', creditVnd: '0', outstandingVnd: '1000', effectiveStatus: 'ISSUED',
    });
    await expect(run(tenantA, poolA, () => service.invoice(invoice.id as string, beforeCredit.rows[0].now.toISOString()))).resolves.toMatchObject({
      paidVnd: '600', creditVnd: '0', outstandingVnd: '400', effectiveStatus: 'PARTIALLY_PAID',
    });
    await expect(run(tenantA, poolA, () => service.invoice(invoice.id as string, beforeRefund.rows[0].now.toISOString()))).resolves.toMatchObject({
      paidVnd: '600', creditVnd: '200', outstandingVnd: '200', effectiveStatus: 'PARTIALLY_PAID',
    });
    await expect(run(tenantA, poolA, () => service.invoice(invoice.id as string))).resolves.toMatchObject({
      paidVnd: '500', creditVnd: '200', outstandingVnd: '300', effectiveStatus: 'PARTIALLY_PAID',
    });
  });

  it('deduplicates concurrent refunds and reversals', async () => {
    const fixture = await seed(poolA, tenantA.tenantId, 'REFUND-RACE');
    const invoice = await draftInvoice(tenantA, poolA, fixture, '1000');
    await issue(tenantA, poolA, invoice.id as string);
    const payment = await run(tenantA, poolA, () => service.recordPayment(invoice.id as string, {
      amountVnd: '500', method: 'CASH', idempotencyKey: 'refund-race-payment',
    }));
    const refundInput = { amountVnd: '100', reason: 'Race refund', idempotencyKey: 'refund-race' };
    const refunds = await Promise.allSettled([
      run(tenantA, poolA, () => service.refundPayment(payment.id as string, refundInput)),
      run(tenantA, poolA, () => service.refundPayment(payment.id as string, refundInput)),
    ]);
    expect(refunds.every((result) => result.status === 'fulfilled')).toBe(true);
    const refundResult = refunds.find((result) => result.status === 'fulfilled');
    if (refundResult?.status !== 'fulfilled') throw new Error('Refund retry did not return a response');
    expect(refundResult.value).toMatchObject({
      id: expect.any(String),
      paymentId: payment.id,
      studentId: fixture.studentId,
      amount: '100',
      reason: refundInput.reason,
      status: 'REFUNDED',
    });
    const refundRows = await query(poolA, 'SELECT COUNT(*)::text AS count FROM refunds WHERE tenant_id=$1 AND payment_id=$2 AND idempotency_key=$3', [tenantA.tenantId, payment.id, refundInput.idempotencyKey]);
    expect(refundRows.rows[0].count).toBe('1');

    const reversalInput = { reason: 'Race reversal', idempotencyKey: 'reversal-race' };
    const reversals = await Promise.allSettled([
      run(tenantA, poolA, () => service.reversePayment(payment.id as string, reversalInput)),
      run(tenantA, poolA, () => service.reversePayment(payment.id as string, reversalInput)),
    ]);
    expect(reversals.every((result) => result.status === 'fulfilled')).toBe(true);
    const reversalRows = await query(poolA, 'SELECT COUNT(*)::text AS count FROM payment_reversals WHERE tenant_id=$1 AND payment_id=$2', [tenantA.tenantId, payment.id]);
    expect(reversalRows.rows[0].count).toBe('1');
  });

  it('tracks unallocated customer credit and refunds only available credit', async () => {
    const fixture = await seed(poolA, tenantA.tenantId, 'CREDIT');
    const payment = await run(tenantA, poolA, () => service.recordUnallocatedPayment({
      amountVnd: '500', method: 'BANK_TRANSFER', studentId: fixture.studentId, idempotencyKey: 'credit-payment',
    }));
    expect(await run(tenantA, poolA, () => service.customerCredit(fixture.studentId))).toMatchObject([
      { studentId: fixture.studentId, availableCreditVnd: '500' },
    ]);
    await run(tenantA, poolA, () => service.refundPayment(payment.id as string, {
      amountVnd: '200', reason: 'Unused credit', idempotencyKey: 'credit-refund',
    }));
    expect(await run(tenantA, poolA, () => service.customerCredit(fixture.studentId))).toMatchObject([
      { studentId: fixture.studentId, availableCreditVnd: '300' },
    ]);
    await expect(run(tenantA, poolA, () => service.refundPayment(payment.id as string, {
      amountVnd: '301', reason: 'Too much', idempotencyKey: 'credit-refund-too-much',
    }))).rejects.toThrow(/Refund exceeds/);
  });

  it('rejects mutation and truncation of append-only billing ledgers', async () => {
    const fixture = await seed(poolA, tenantA.tenantId, 'APPEND');
    const invoice = await draftInvoice(tenantA, poolA, fixture, '100');
    await issue(tenantA, poolA, invoice.id as string);
    const payment = await run(tenantA, poolA, () => service.recordPayment(invoice.id as string, {
      amountVnd: '100', method: 'CASH', idempotencyKey: 'append-payment',
    }));
    await run(tenantA, poolA, () => service.reversePayment(payment.id as string, {
      reason: 'Append-only probe', idempotencyKey: 'append-reversal',
    }));
    const note = await run(tenantA, poolA, () => service.createCreditNote(invoice.id as string, {
      amountVnd: '1', reason: 'Append-only note', idempotencyKey: 'append-note',
    }));
    await run(tenantA, poolA, () => service.issueCreditNote(note.id as string));
    await run(tenantA, poolA, () => service.voidCreditNote(note.id as string, {
      reason: 'Append-only void', idempotencyKey: 'append-void',
    }));
    const rows = await query(poolA, `
      SELECT 'payments' AS table_name, id FROM payments WHERE tenant_id=$1 AND id=$2
      UNION ALL SELECT 'payment_reversals', id FROM payment_reversals WHERE tenant_id=$1 AND payment_id=$2
      UNION ALL SELECT 'payment_allocations', id FROM payment_allocations WHERE tenant_id=$1 AND payment_id=$2
      UNION ALL SELECT 'refunds', id FROM refunds WHERE tenant_id=$1 AND payment_id=$2
      UNION ALL SELECT 'invoice_status_history', id FROM invoice_status_history WHERE tenant_id=$1 AND invoice_id=$3
      UNION ALL SELECT 'credit_notes', id FROM credit_notes WHERE tenant_id=$1 AND id=$4
      UNION ALL SELECT 'credit_note_voids', id FROM credit_note_voids WHERE tenant_id=$1 AND credit_note_id=$4`,
      [tenantA.tenantId, payment.id, invoice.id, note.id],
    );
    for (const row of rows.rows) {
      await expect(query(poolA, `UPDATE ${row.table_name} SET id=id WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, row.id])).rejects.toThrow();
      await expect(query(poolA, `DELETE FROM ${row.table_name} WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, row.id])).rejects.toThrow();
      await expect(query(poolA, `TRUNCATE ${row.table_name}`)).rejects.toThrow();
    }
  });
});
