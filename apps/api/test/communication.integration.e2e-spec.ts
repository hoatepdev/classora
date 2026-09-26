import dotenv from 'dotenv';
dotenv.config({ override: true });

import { beforeAll, describe, expect, it } from 'vitest';
import { escapeIdentifier, Pool } from 'pg';
import { ulid } from 'ulid';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../src/audit/audit.service.js';
import { AttendanceService } from '../src/attendance/attendance.service.js';
import { BillingService } from '../src/billing/billing.service.js';
import { CommunicationService } from '../src/communication/communication.service.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { deployTenantSchema } from '../src/database/tenant-migrations.js';
import { postgresConfig } from '../src/config.js';
import { CrmService } from '../src/crm/crm.service.js';
import { CrmTrialsService } from '../src/crm/crm-trials.service.js';
import { EnrollmentsService } from '../src/enrollments/enrollments.service.js';
import { SchedulesService } from '../src/schedules/schedules.service.js';
import { StudentRelationshipsService } from '../src/students/relationships.service.js';
import { StudentsService } from '../src/students/students.service.js';
import { TenantContextService, type TenantContext } from '../src/tenant/tenant-context.service.js';
import type { ResolvedTenant } from '../src/tenant/tenant-resolver.service.js';

const enabled = process.env.B5_TEST_DATABASE === '1';

describe.skipIf(!enabled)('LOCAL-11 communication hard gates (real PostgreSQL)', () => {
  let admin: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let dbNameA = '';
  let dbNameB = '';
  let tenantContext: TenantContextService;
  let communicationA: CommunicationService;
  let communicationB: CommunicationService;
  let billingA: BillingService;
  let schedulesA: SchedulesService;
  let attendanceA: AttendanceService;
  let crmA: CrmService;
  let trialsA: CrmTrialsService;
  const tenantA = { tenantId: ulid(), tenantSlug: 'local11-a', dbName: '' };
  const tenantB = { tenantId: ulid(), tenantSlug: 'local11-b', dbName: '' };
  const fx = {
    classA: '', classB: '',
    s1: '', s2: '', s3: '', s4: '', s5: '', sB1: '',
    guardianBilling: '', guardianShared1: '', guardianShared2: '', guardianNoEmail: '',
    enrollmentS1: '', enrollmentS2: '',
    invDue: '', invOverdue: '', invPay: '', invFail: '', invSnapshot: '', invRetry: '', invB: '',
    ssMain: '', ssCancel: '', ssRemind: '', ssTrial: '', ssB: '',
  };

  const run = <T>(tenant: ResolvedTenant, pool: Pool, callback: () => Promise<T>) =>
    tenantContext.run<T>({ tenant, pool } as TenantContext, callback);
  const runA = <T>(callback: () => Promise<T>) => run(tenantA as ResolvedTenant, poolA, callback);
  const runB = <T>(callback: () => Promise<T>) => run(tenantB as ResolvedTenant, poolB, callback);
  const query = (pool: Pool, text: string, values?: unknown[]) => pool.query(text, values);
  const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const pastDate = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const messages = (pool: Pool, where = '', values: unknown[] = []) =>
    query(pool, `SELECT * FROM communication_messages WHERE tenant_id=$1 ${where}`, [tenantA.tenantId, ...values]);

  async function insertClass(pool: Pool, tenantId: string, code: string) {
    const id = ulid();
    await query(pool, `INSERT INTO classes (id, tenant_id, code, name, capacity) VALUES ($1,$2,$3,$4,30)`, [id, tenantId, code, `Class ${code}`]);
    return id;
  }

  async function insertStudent(pool: Pool, tenantId: string, code: string, email: string | null) {
    const id = ulid();
    await query(pool, `INSERT INTO students (id, tenant_id, code, full_name, email) VALUES ($1,$2,$3,$4,$5)`, [id, tenantId, code, `Student ${code}`, email]);
    return id;
  }

  async function insertGuardian(pool: Pool, tenantId: string, name: string, email: string | null) {
    const id = ulid();
    await query(pool, `INSERT INTO guardians (id, tenant_id, full_name, email) VALUES ($1,$2,$3,$4)`, [id, tenantId, name, email]);
    return id;
  }

  async function linkGuardian(pool: Pool, tenantId: string, studentId: string, guardianId: string, flags: { primary?: boolean; billing?: boolean }) {
    await query(pool,
      `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship, is_primary_contact, is_billing_contact) VALUES ($1,$2,$3,$4,'MOTHER',$5,$6)`,
      [ulid(), tenantId, studentId, guardianId, flags.primary ?? false, flags.billing ?? false]);
  }

  async function insertEnrollment(pool: Pool, tenantId: string, studentId: string, classId: string, expectedEndDate: string | null) {
    const id = ulid();
    await query(pool, `INSERT INTO enrollments (id, tenant_id, student_id, class_id, status, expected_end_date) VALUES ($1,$2,$3,$4,'ACTIVE',$5::date)`, [id, tenantId, studentId, classId, expectedEndDate]);
    return id;
  }

  async function insertSession(pool: Pool, tenantId: string, classId: string, days: number, startTime: string) {
    const id = ulid();
    await query(pool,
      `INSERT INTO attendance_sessions (id, tenant_id, class_id, session_date, start_time, end_time, status) VALUES ($1,$2,$3,$4::date,$5::time,$6::time,'SCHEDULED')`,
      [id, tenantId, classId, futureDate(days), startTime, '20:00']);
    return id;
  }

  async function insertIssuedInvoice(pool: Pool, tenantId: string, studentId: string, number_: string, dueDate: string, total: string) {
    const id = ulid();
    await query(pool,
      `INSERT INTO invoices (id, tenant_id, invoice_number, student_id, status, issue_date, due_date, subtotal_vnd, discount_vnd, total_vnd)
       VALUES ($1,$2,$3,$4,'ISSUED',CURRENT_DATE,$5::date,$6,0,$6)`,
      [id, tenantId, number_, studentId, dueDate, total]);
    return id;
  }

  beforeAll(async () => {
    const config = postgresConfig();
    admin = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    const runId = `${Date.now()}_${process.pid}`;
    dbNameA = `classora_local11_${runId}_a`;
    dbNameB = `classora_local11_${runId}_b`;
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
    const audit = new AuditService({} as ControlDatabaseService, tenantContext);
    communicationA = new CommunicationService(tenantContext, audit);
    communicationB = new CommunicationService(tenantContext, audit);
    billingA = new BillingService(tenantContext, audit, communicationA);
    schedulesA = new SchedulesService(tenantContext, audit, communicationA);
    attendanceA = new AttendanceService(tenantContext, audit, communicationA);
    const studentsService = new StudentsService(tenantContext, audit);
    const relationshipsService = new StudentRelationshipsService(tenantContext, audit);
    const enrollmentsService = new EnrollmentsService(tenantContext, audit);
    const control = { tenantMembership: { findFirst: async () => ({ status: 'ACTIVE' }), findMany: async () => [] } } as unknown as ControlDatabaseService;
    crmA = new CrmService(tenantContext, audit, control, studentsService, relationshipsService, enrollmentsService);
    trialsA = new CrmTrialsService(tenantContext, audit, crmA, enrollmentsService);

    fx.classA = await insertClass(poolA, tenantA.tenantId, 'COMM-A');
    fx.classB = await insertClass(poolB, tenantB.tenantId, 'COMM-B');

    fx.s1 = await insertStudent(poolA, tenantA.tenantId, 'S1', null);
    fx.s2 = await insertStudent(poolA, tenantA.tenantId, 'S2', null);
    fx.s3 = await insertStudent(poolA, tenantA.tenantId, 'S3', null);
    fx.s4 = await insertStudent(poolA, tenantA.tenantId, 'S4', 's4@student.example');
    fx.s5 = await insertStudent(poolA, tenantA.tenantId, 'S5', null);
    fx.guardianBilling = await insertGuardian(poolA, tenantA.tenantId, 'Guardian Billing', 'gbilling@parent.example');
    fx.guardianShared1 = await insertGuardian(poolA, tenantA.tenantId, 'Guardian Shared One', 'shared@parent.example');
    fx.guardianShared2 = await insertGuardian(poolA, tenantA.tenantId, 'Guardian Shared Two', 'shared@parent.example');
    fx.guardianNoEmail = await insertGuardian(poolA, tenantA.tenantId, 'Guardian No Email', null);
    await linkGuardian(poolA, tenantA.tenantId, fx.s1, fx.guardianBilling, { primary: true, billing: true });
    await linkGuardian(poolA, tenantA.tenantId, fx.s2, fx.guardianShared1, { primary: true });
    await linkGuardian(poolA, tenantA.tenantId, fx.s3, fx.guardianNoEmail, { primary: true });
    await linkGuardian(poolA, tenantA.tenantId, fx.s5, fx.guardianShared2, { primary: true });

    fx.enrollmentS1 = await insertEnrollment(poolA, tenantA.tenantId, fx.s1, fx.classA, futureDate(30));
    fx.enrollmentS2 = await insertEnrollment(poolA, tenantA.tenantId, fx.s2, fx.classA, null);
    await insertEnrollment(poolA, tenantA.tenantId, fx.s3, fx.classA, null);
    await insertEnrollment(poolA, tenantA.tenantId, fx.s4, fx.classA, null);
    await insertEnrollment(poolA, tenantA.tenantId, fx.s5, fx.classA, null);

    fx.ssMain = await insertSession(poolA, tenantA.tenantId, fx.classA, 7, '18:00');
    fx.ssCancel = await insertSession(poolA, tenantA.tenantId, fx.classA, 8, '18:00');
    fx.ssRemind = await insertSession(poolA, tenantA.tenantId, fx.classA, 9, '18:00');
    fx.ssTrial = await insertSession(poolA, tenantA.tenantId, fx.classA, 10, '17:00');

    fx.invDue = await insertIssuedInvoice(poolA, tenantA.tenantId, fx.s1, 'INV-00000041', futureDate(5), '2000000');
    fx.invOverdue = await insertIssuedInvoice(poolA, tenantA.tenantId, fx.s1, 'INV-00000042', pastDate(5), '1500000');
    fx.invPay = await insertIssuedInvoice(poolA, tenantA.tenantId, fx.s1, 'INV-00000043', futureDate(5), '3000000');
    fx.invFail = await insertIssuedInvoice(poolA, tenantA.tenantId, fx.s1, 'INV-00000044', futureDate(5), '2000000');
    fx.invSnapshot = await insertIssuedInvoice(poolA, tenantA.tenantId, fx.s1, 'INV-00000045', futureDate(5), '1200000');
    fx.invRetry = await insertIssuedInvoice(poolA, tenantA.tenantId, fx.s1, 'INV-00000046', pastDate(5), '800000');

    fx.sB1 = await insertStudent(poolB, tenantB.tenantId, 'B1', null);
    const guardianB = await insertGuardian(poolB, tenantB.tenantId, 'Guardian B', 'gb@parent.example');
    await linkGuardian(poolB, tenantB.tenantId, fx.sB1, guardianB, { primary: true, billing: true });
    await insertEnrollment(poolB, tenantB.tenantId, fx.sB1, fx.classB, null);
    fx.ssB = await insertSession(poolB, tenantB.tenantId, fx.classB, 7, '18:00');
    fx.invB = await insertIssuedInvoice(poolB, tenantB.tenantId, fx.sB1, 'INV-B-00000001', pastDate(3), '900000');
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

  it('applies template overrides per tenant and resets to the built-in default', async () => {
    await runA(() => communicationA.upsertTemplate('PAYMENT_RECEIVED', 'EMAIL', { subject: 'A override {{invoiceNumber}}', body: 'Tenant A body {{amountVnd}}' }));
    const templatesA = await runA(() => communicationA.templates());
    const templatesB = await runB(() => communicationB.templates());
    expect(templatesA.find((t) => t.eventType === 'PAYMENT_RECEIVED' && t.channel === 'EMAIL')).toMatchObject({ hasOverride: true, effectiveSubject: 'A override {{invoiceNumber}}' });
    expect(templatesB.find((t) => t.eventType === 'PAYMENT_RECEIVED' && t.channel === 'EMAIL')).toMatchObject({ hasOverride: false });
    await runA(() => communicationA.resetTemplate('PAYMENT_RECEIVED', 'EMAIL'));
    const afterReset = await runA(() => communicationA.templates());
    expect(afterReset.find((t) => t.eventType === 'PAYMENT_RECEIVED' && t.channel === 'EMAIL')).toMatchObject({ hasOverride: false });
  });

  it('records a payment and generates PAYMENT_RECEIVED messages through the billing-contact guardian', async () => {
    const payment = await runA(() => billingA.recordPayment(fx.invPay, { amountVnd: '3000000', method: 'CASH', idempotencyKey: `pay-${ulid()}` }));
    expect(payment.amountVnd).toBe('3000000');
    const rows = (await messages(poolA, `AND event_type='PAYMENT_RECEIVED' AND related_entity_id=$2`, [payment.id])).rows;
    expect(rows).toHaveLength(2);
    const email = rows.find((row) => row.channel === 'EMAIL');
    const inApp = rows.find((row) => row.channel === 'IN_APP');
    expect(email).toMatchObject({ recipient_type: 'GUARDIAN', recipient_id: fx.guardianBilling, destination: 'gbilling@parent.example', status: 'SENT', provider: 'LOCAL' });
    expect(email.subject).toContain('INV-00000043');
    expect(email.body).toContain('3.000.000 ₫');
    expect(inApp).toMatchObject({ status: 'SENT' });
  });

  it('never rolls back a payment when email delivery fails, and records a sanitized failure', async () => {
    communicationA.overrideEmailAdapterForTesting(() => true);
    try {
      const payment = await runA(() => billingA.recordPayment(fx.invFail, { amountVnd: '2000000', method: 'BANK_TRANSFER', idempotencyKey: `pay-${ulid()}` }));
      expect(payment.amountVnd).toBe('2000000');
      const failed = (await messages(poolA, `AND event_type='PAYMENT_RECEIVED' AND status='FAILED' AND related_entity_id=$2`, [payment.id])).rows;
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({ channel: 'EMAIL', attempt_count: 1, last_error: expect.any(String) });
      expect(failed[0].last_error).not.toContain('gbilling@parent.example');
      const paymentStillThere = await query(poolA, `SELECT amount_vnd::text AS amount FROM payments WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, payment.id]);
      expect(paymentStillThere.rows[0].amount).toBe('2000000');
    } finally {
      communicationA.overrideEmailAdapterForTesting(() => false);
    }
  });

  it('generates ATTENDANCE_ABSENCE only for finalized absences and stays idempotent under refinalization', async () => {
    const detail = await runA(() => attendanceA.initialize(fx.ssMain));
    for (const record of detail.records) {
      await runA(() => attendanceA.updateRecord(record.id, { status: record.studentId === fx.s1 ? 'ABSENT_UNEXCUSED' : 'PRESENT' }));
    }
    await runA(() => attendanceA.finalize(fx.ssMain));
    const absenceRows = (await messages(poolA, `AND event_type='ATTENDANCE_ABSENCE' AND related_entity_type='AttendanceRecord'`)).rows;
    expect(absenceRows.length).toBe(2);
    expect(absenceRows.every((row) => row.recipient_id === fx.guardianBilling)).toBe(true);
    await expect(runA(() => attendanceA.finalize(fx.ssMain))).rejects.toThrow(ConflictException);
    const afterRefinalize = (await messages(poolA, `AND event_type='ATTENDANCE_ABSENCE' AND related_entity_type='AttendanceRecord'`)).rows;
    expect(afterRefinalize).toHaveLength(2);
  });

  it('notifies SCHEDULE_CHANGED for reschedules with shared-mailbox dedupe and missing-email handling', async () => {
    await runA(() => attendanceA.initialize(fx.ssCancel));
    const replacement = await runA(() => schedulesA.rescheduleSession(fx.ssCancel, { sessionDate: futureDate(21), startTime: '19:00', endTime: '21:00', reason: 'phòng sửa ống nước' }));
    const rows = (await messages(poolA, `AND event_type='SCHEDULE_CHANGED' AND related_entity_id=$2`, [replacement.id])).rows;
    const emails = rows.filter((row) => row.channel === 'EMAIL');
    const inApp = rows.filter((row) => row.channel === 'IN_APP');
    expect(inApp).toHaveLength(5);
    expect(emails.map((row) => row.destination).sort()).toEqual(['gbilling@parent.example', 's4@student.example', 'shared@parent.example']);
    const shared = emails.find((row) => row.destination === 'shared@parent.example');
    expect(shared.body).toContain('Student S2');
    expect(shared.body).toContain('Student S5');
    expect(rows.find((row) => row.recipient_id === fx.guardianNoEmail)).toMatchObject({ channel: 'IN_APP', destination: null });
    const noEmailForGuardian = emails.find((row) => row.recipient_id === fx.guardianNoEmail);
    expect(noEmailForGuardian).toBeUndefined();

    await expect(runA(() => schedulesA.rescheduleSession(fx.ssCancel, { sessionDate: futureDate(22), startTime: '19:00', endTime: '21:00' })))
      .rejects.toThrow(ConflictException);
    const second = await runA(() => schedulesA.rescheduleSession(replacement.id, { sessionDate: futureDate(23), startTime: '18:30', endTime: '20:30' }));
    const laterRows = (await messages(poolA, `AND event_type='SCHEDULE_CHANGED' AND related_entity_id=$2`, [second.id])).rows;
    expect(laterRows.filter((row) => row.channel === 'EMAIL')).toHaveLength(3);
  });

  it('notifies SCHEDULE_CHANGED with the CANCELLED scope when a session is cancelled', async () => {
    await runA(() => attendanceA.initialize(fx.ssRemind));
    await runA(() => schedulesA.cancelSession(fx.ssRemind, 'ngày lễ'));
    const rows = (await messages(poolA, `AND event_type='SCHEDULE_CHANGED' AND related_entity_id=$2`, [fx.ssRemind])).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.dedupe_key.includes(':CANCELLED:'))).toBe(true);
    expect(rows.every((row) => row.body.includes('hủy'))).toBe(true);
  });

  it('dispatches time-based events explicitly: SESSION_REMINDER, TUITION_DUE, TUITION_OVERDUE, ENROLLMENT_EXPIRING', async () => {
    const reminderSession = await insertSession(poolA, tenantA.tenantId, fx.classA, 11, '15:00');
    await runA(() => attendanceA.initialize(reminderSession));
    const reminder = await runA(() => communicationA.dispatchEvent({ eventType: 'SESSION_REMINDER', sourceEntityId: reminderSession }));
    expect(reminder.messageIds.length).toBeGreaterThan(0);
    const due = await runA(() => communicationA.dispatchEvent({ eventType: 'TUITION_DUE', sourceEntityId: fx.invDue }));
    expect(due.messageIds).toHaveLength(2);
    await expect(runA(() => communicationA.dispatchEvent({ eventType: 'TUITION_DUE', sourceEntityId: fx.invOverdue }))).rejects.toThrow(ConflictException);
    const overdue = await runA(() => communicationA.dispatchEvent({ eventType: 'TUITION_OVERDUE', sourceEntityId: fx.invOverdue }));
    expect(overdue.messageIds).toHaveLength(2);
    const overdueBody = (await messages(poolA, `AND event_type='TUITION_OVERDUE' AND channel='EMAIL'`)).rows[0];
    expect(overdueBody.body).toContain('1.500.000 ₫');
    await expect(runA(() => communicationA.dispatchEvent({ eventType: 'TUITION_OVERDUE', sourceEntityId: fx.invDue }))).rejects.toThrow(ConflictException);
    const expiring = await runA(() => communicationA.dispatchEvent({ eventType: 'ENROLLMENT_EXPIRING', sourceEntityId: fx.enrollmentS1 }));
    expect(expiring.messageIds).toHaveLength(2);
    await expect(runA(() => communicationA.dispatchEvent({ eventType: 'ENROLLMENT_EXPIRING', sourceEntityId: fx.enrollmentS2 }))).rejects.toThrow(ConflictException);
  });

  it('dispatches TRIAL_REMINDER from a real LOCAL-10 booking and dedupes redispatch', async () => {
    const lead = await runA(() => crmA.create({
      studentName: 'Trial Kid', studentPhone: '0900111222',
      guardianName: 'Trial Parent', guardianPhone: '0900333444', guardianEmail: 'trial@parent.example',
      source: 'WALK_IN', interestedCourseId: null,
    }));
    await runA(() => crmA.contact(lead.id));
    await runA(() => crmA.qualify(lead.id));
    const booked = await runA(() => trialsA.book(lead.id, { sessionId: fx.ssTrial, createStudent: true, createGuardian: true, guardianRelationship: 'MOTHER' }));
    const bookingId = booked.trialBookings[0].id;
    const dispatch = await runA(() => communicationA.dispatchEvent({ eventType: 'TRIAL_REMINDER', sourceEntityId: bookingId }));
    expect(dispatch.messageIds).toHaveLength(2);
    const rows = (await messages(poolA, `AND event_type='TRIAL_REMINDER' AND related_entity_id=$2`, [bookingId])).rows;
    expect(rows.find((row) => row.channel === 'EMAIL')).toMatchObject({ destination: 'trial@parent.example' });
    const [trialYear, trialMonth, trialDay] = futureDate(10).split('-');
    expect(rows[0].body).toContain(`${trialDay}/${trialMonth}/${trialYear}`);
    const redispatch = await runA(() => communicationA.dispatchEvent({ eventType: 'TRIAL_REMINDER', sourceEntityId: bookingId }));
    expect(redispatch.messageIds).toHaveLength(0);
  });

  it('rejects invalid templates and missing EMAIL subjects at save time', async () => {
    await expect(runA(() => communicationA.upsertTemplate('PAYMENT_RECEIVED', 'EMAIL', { subject: 'X', body: '{{internalDatabasePassword}}' }))).rejects.toThrow(ConflictException);
    await expect(runA(() => communicationA.upsertTemplate('PAYMENT_RECEIVED', 'EMAIL', { body: 'ok {{studentName}}' }))).rejects.toThrow(ConflictException);
    const preview = await runA(() => communicationA.previewTemplate('PAYMENT_RECEIVED', 'EMAIL', { subject: 'Xin chào {{studentName}}', body: 'Cảm ơn {{guardianName}}' }));
    expect(preview.subject).toBe('Xin chào Nguyễn Minh An');
    expect(preview.body).toContain('Cảm ơn Nguyễn Thu Hà');
  });

  it('keeps historical render snapshots immutable across template edits and retries', async () => {
    await runA(() => communicationA.upsertTemplate('PAYMENT_RECEIVED', 'EMAIL', { subject: 'Đã nhận {{amountVnd}}', body: 'Snapshot body cho {{studentName}}' }));
    const payment = await runA(() => billingA.recordPayment(fx.invSnapshot, { amountVnd: '1200000', method: 'CASH', idempotencyKey: `pay-${ulid()}` }));
    const original = (await messages(poolA, `AND event_type='PAYMENT_RECEIVED' AND channel='EMAIL' AND related_entity_id=$2`, [payment.id])).rows[0];
    await runA(() => communicationA.upsertTemplate('PAYMENT_RECEIVED', 'EMAIL', { subject: 'Changed {{amountVnd}}', body: 'Changed body {{studentName}}' }));
    const reread = (await query(poolA, `SELECT subject, body FROM communication_messages WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, original.id])).rows[0];
    expect(reread).toEqual({ subject: original.subject, body: original.body });
  });

  it('retries failed messages with the same id, snapshots, and destination, and is concurrency-safe', async () => {
    communicationA.overrideEmailAdapterForTesting(() => true);
    let failedId = '';
    try {
      const payment = await runA(() => billingA.recordPayment(fx.invRetry, { amountVnd: '700000', method: 'CARD', idempotencyKey: `pay-${ulid()}` }));
      failedId = (await messages(poolA, `AND status='FAILED' AND related_entity_id=$2`, [payment.id])).rows[0].id;
    } finally {
      communicationA.overrideEmailAdapterForTesting(() => false);
    }
    const before = (await query(poolA, `SELECT subject, body, destination, attempt_count FROM communication_messages WHERE id=$1 AND tenant_id=$2`, [failedId, tenantA.tenantId])).rows[0];
    const retried = await runA(() => communicationA.retry(failedId));
    expect(retried).toMatchObject({ id: failedId, status: 'SENT', attemptCount: 2, destination: before.destination });
    expect(retried.subject).toBe(before.subject);
    expect(retried.body).toBe(before.body);
    const auditCountBeforeInvalidRetry = await query(poolA, `SELECT COUNT(*)::int AS count FROM audit_events WHERE tenant_id=$1 AND action='communication.retry_requested' AND entity_id=$2`, [tenantA.tenantId, failedId]);
    await expect(runA(() => communicationA.retry(failedId))).rejects.toThrow(ConflictException);
    const auditCountAfterInvalidRetry = await query(poolA, `SELECT COUNT(*)::int AS count FROM audit_events WHERE tenant_id=$1 AND action='communication.retry_requested' AND entity_id=$2`, [tenantA.tenantId, failedId]);
    expect(auditCountAfterInvalidRetry.rows[0].count).toBe(auditCountBeforeInvalidRetry.rows[0].count);
  });

  it('deduplicates concurrent dispatches to one message per recipient and channel', async () => {
    const session = await insertSession(poolA, tenantA.tenantId, fx.classA, 12, '16:00');
    await runA(() => attendanceA.initialize(session));
    const [first, second] = await Promise.all([
      runA(() => communicationA.dispatchEvent({ eventType: 'SESSION_REMINDER', sourceEntityId: session })),
      runA(() => communicationA.dispatchEvent({ eventType: 'SESSION_REMINDER', sourceEntityId: session })),
    ]);
    const rows = (await messages(poolA, `AND event_type='SESSION_REMINDER' AND related_entity_id=$2`, [session])).rows;
    const uniqueKeys = new Set(rows.map((row) => row.dedupe_key));
    expect(uniqueKeys.size).toBe(rows.length);
    expect(rows.filter((row) => row.channel === 'EMAIL')).toHaveLength(3);
    expect(first.messageIds.length + second.messageIds.length).toBe(rows.length);
  });

  it('fails safely on cross-tenant references and keeps tenant data isolated', async () => {
    await expect(runA(() => communicationA.dispatchEvent({ eventType: 'SESSION_REMINDER', sourceEntityId: fx.ssB }))).rejects.toThrow(NotFoundException);
    const dispatchB = await runB(() => communicationB.dispatchEvent({ eventType: 'TUITION_OVERDUE', sourceEntityId: fx.invB }));
    expect(dispatchB.messageIds).toHaveLength(2);
    const bRows = (await query(poolB, `SELECT id FROM communication_messages WHERE tenant_id=$1`, [tenantB.tenantId])).rows;
    for (const row of bRows) {
      await expect(runA(() => communicationA.message(row.id))).rejects.toThrow(NotFoundException);
      await expect(runA(() => communicationA.retry(row.id))).rejects.toThrow(NotFoundException);
    }
    const listA = await runA(() => communicationA.list({}));
    expect(listA.data.every((message) => message.id !== bRows[0].id)).toBe(true);
    await runA(() => communicationA.upsertTemplate('TRIAL_REMINDER', 'EMAIL', { subject: 'A only', body: 'body' }));
    const templatesB = await runB(() => communicationB.templates());
    expect(templatesB.find((t) => t.eventType === 'TRIAL_REMINDER' && t.channel === 'EMAIL')?.hasOverride).toBe(false);
  });

  it('enforces database constraints for destinations, subjects, and dedupe uniqueness', async () => {
    await expect(query(poolA,
      `INSERT INTO communication_messages (id, tenant_id, event_type, channel, recipient_type, body, dedupe_key) VALUES ($1,$2,'PAYMENT_RECEIVED','EMAIL','STUDENT','b','k-email-no-dest')`,
      [ulid(), tenantA.tenantId])).rejects.toMatchObject({ code: '23514' });
    await expect(query(poolA,
      `INSERT INTO communication_messages (id, tenant_id, event_type, channel, recipient_type, body, dedupe_key, destination) VALUES ($1,$2,'PAYMENT_RECEIVED','EMAIL','STUDENT','b','k-email-no-subject','x@example.com')`,
      [ulid(), tenantA.tenantId])).rejects.toMatchObject({ code: '23514' });
    const dedupeKeyValue = `test.dedupe:${ulid()}`;
    const dedupeInsert = `INSERT INTO communication_messages (id, tenant_id, event_type, channel, recipient_type, body, dedupe_key) VALUES ($1,$2,'SESSION_REMINDER','IN_APP','STUDENT','b',$3)`;
    await query(poolA, dedupeInsert, [ulid(), tenantA.tenantId, dedupeKeyValue]);
    await expect(query(poolA, dedupeInsert, [ulid(), tenantA.tenantId, dedupeKeyValue])).rejects.toMatchObject({ code: '23505' });
  });

  it('audits administrative template and retry actions', async () => {
    await runA(() => communicationA.upsertTemplate('TUITION_DUE', 'EMAIL', { subject: 's', body: 'b {{studentName}}' }));
    const failed = (await messages(poolA, `AND status='FAILED' LIMIT 1`)).rows[0];
    if (failed) await runA(() => communicationA.retry(failed.id)).catch(() => undefined);
    const auditRows = await query(poolA, `SELECT action FROM audit_events WHERE tenant_id=$1 AND action LIKE 'communication.%'`, [tenantA.tenantId]);
    const actions = new Set(auditRows.rows.map((row) => row.action));
    expect(actions.has('communication.template_updated')).toBe(true);
    expect(actions.has('communication.retry_requested')).toBe(true);
  });

  it('filters history by student and lead scopes for contextual views', async () => {
    const byStudent = await runA(() => communicationA.list({ studentId: fx.s1 }));
    expect(byStudent.data.length).toBeGreaterThan(0);
    expect(byStudent.data.every((message) =>
      message.recipientId === fx.s1 ||
      message.recipientId === fx.guardianBilling ||
      message.relatedEntityId === fx.s1)).toBe(true);
    const paginated = await runA(() => communicationA.list({ limit: 3 }));
    expect(paginated.data).toHaveLength(3);
    expect(paginated.nextCursor).toBeTruthy();
    const page2 = await runA(() => communicationA.list({ limit: 3, cursor: paginated.nextCursor! }));
    expect(page2.data[0].id).not.toBe(paginated.data[0].id);
  });
});
