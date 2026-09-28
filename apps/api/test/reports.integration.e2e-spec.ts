import dotenv from 'dotenv';
dotenv.config({ override: true });

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { escapeIdentifier, Pool } from 'pg';
import { ulid } from 'ulid';
import { permissionsForRole } from '../src/authorization/permissions.js';
import { postgresConfig } from '../src/config.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { deployTenantSchema } from '../src/database/tenant-migrations.js';
import { ReportsService } from '../src/reports/reports.service.js';
import { TenantContextService, type TenantContext } from '../src/tenant/tenant-context.service.js';

const enabled = process.env.B5_TEST_DATABASE === '1';

const keys = ['students-enrollments','attendance','class-utilization','teacher-workload','progress','reenrollment','finance','receivables','payments','crm','branches'] as const;

describe.skipIf(!enabled)('LOCAL-15 reports integration (real PostgreSQL)', () => {
  let admin: Pool;
  let pool: Pool;
  let tenantContext: TenantContextService;
  let reports: ReportsService;
  let dbName = '';
  const tenant = { tenantId: ulid(), tenantSlug: 'local15', dbName: '' };
  const ids = {
    branch: ulid(), teacherA: ulid(), teacherB: ulid(), class: ulid(), unlimitedClass: ulid(), student: ulid(),
    enrollment: ulid(), completed: ulid(), destination: ulid(), transferred: ulid(),
    session60: ulid(), session90: ulid(), cancelled: ulid(), openSession: ulid(),
    invoice: ulid(), payment: ulid(), paymentAllocation: ulid(), reversal: ulid(),
  };
  const date = { from: '2026-09-01', to: '2026-09-30' };

  const context = (): TenantContext => ({
    tenant: tenant as never,
    pool,
    actorUserId: ulid(),
    actorMembershipId: ulid(),
    actorName: 'Tester',
    actorEmail: 'tester@example.com',
    requestId: 'reports-integration',
  });
  const run = <T>(work: () => Promise<T>) => tenantContext.run(context(), work);

  beforeAll(async () => {
    const config = postgresConfig();
    dbName = `classora_local15_${Date.now()}_${process.pid}`;
    tenant.dbName = dbName;
    admin = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    await admin.query(`CREATE DATABASE ${escapeIdentifier(dbName)}`);
    await deployTenantSchema(dbName);
    pool = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: dbName, max: 10 });
    tenantContext = new TenantContextService();
    const control = { tenantMembership: { findMany: vi.fn(async () => []) } } as unknown as ControlDatabaseService;
    reports = new ReportsService(tenantContext, control);

    await pool.query(`INSERT INTO branches (id,tenant_id,code,name) VALUES ($1,$2,'B1','Chi nhánh Một')`, [ids.branch, tenant.tenantId]);
    await pool.query(`INSERT INTO teachers (id,tenant_id,code,name) VALUES ($1,$2,'TA','Giáo viên A'),($3,$2,'TB','Giáo viên B')`, [ids.teacherA, tenant.tenantId, ids.teacherB]);
    await pool.query(`INSERT INTO classes (id,tenant_id,code,name,status,branch_id,primary_teacher_id,capacity) VALUES
      ($1,$2,'C1','Lớp có sức chứa','ACTIVE',$3,$4,10),($5,$2,'C2','Lớp không giới hạn','ACTIVE',$3,$4,NULL)`,
      [ids.class, tenant.tenantId, ids.branch, ids.teacherA, ids.unlimitedClass]);
    await pool.query(`INSERT INTO students (id,tenant_id,code,full_name,status,created_at) VALUES ($1,$2,'S1','=SUM(1+1)','ACTIVE','2026-09-05T03:00:00Z')`, [ids.student, tenant.tenantId]);

    await pool.query(`INSERT INTO enrollments (id,tenant_id,student_id,class_id,status,enrolled_at,started_at) VALUES
      ($1,$2,$3,$4,'ACTIVE','2026-09-01T03:00:00Z','2026-09-01T03:00:00Z'),
      ($5,$2,$3,$4,'COMPLETED','2026-01-01T03:00:00Z','2026-01-01T03:00:00Z'),
      ($6,$2,$3,$7,'ACTIVE','2026-09-20T03:00:00Z','2026-09-20T03:00:00Z'),
      ($8,$2,$3,$7,'WITHDRAWN','2026-09-10T03:00:00Z','2026-09-10T03:00:00Z')`,
      [ids.enrollment, tenant.tenantId, ids.student, ids.class, ids.completed, ids.destination, ids.unlimitedClass, ids.transferred]);
    await pool.query(`UPDATE enrollments SET source_enrollment_id=$1 WHERE tenant_id=$2 AND id=$3`, [ids.completed, tenant.tenantId, ids.destination]);
    await pool.query(`INSERT INTO enrollment_events (id,tenant_id,enrollment_id,type,from_status,to_status,from_class_id,to_class_id,occurred_at) VALUES
      ($1,$2,$3,'COMPLETED','ACTIVE','COMPLETED',$4,$4,'2026-09-10T03:00:00Z'),
      ($5,$2,$6,'REENROLLED','COMPLETED','ACTIVE',$4,$7,'2026-09-20T03:00:00Z'),
      ($8,$2,$9,'TRANSFERRED','ACTIVE','WITHDRAWN',$4,$7,'2026-09-15T03:00:00Z')`,
      [ulid(), tenant.tenantId, ids.completed, ids.class, ulid(), ids.destination, ids.unlimitedClass, ulid(), ids.transferred]);

    for (let index = 0; index < 9; index += 1) {
      const studentId = ulid();
      const sourceId = ulid();
      await pool.query(`INSERT INTO students (id,tenant_id,code,full_name,status,created_at) VALUES ($1,$2,$3,$4,'ACTIVE','2026-08-01T03:00:00Z')`, [studentId, tenant.tenantId, `CO${index}`, `Cohort ${index + 2}`]);
      await pool.query(`INSERT INTO enrollments (id,tenant_id,student_id,class_id,status,enrolled_at,started_at) VALUES ($1,$2,$3,$4,'COMPLETED','2026-01-01T03:00:00Z','2026-01-01T03:00:00Z')`, [sourceId, tenant.tenantId, studentId, ids.class]);
      await pool.query(`INSERT INTO enrollment_events (id,tenant_id,enrollment_id,type,from_status,to_status,from_class_id,to_class_id,occurred_at) VALUES ($1,$2,$3,'COMPLETED','ACTIVE','COMPLETED',$4,$4,'2026-09-10T03:00:00Z')`, [ulid(), tenant.tenantId, sourceId, ids.class]);
      if (index < 7) {
        await pool.query(`INSERT INTO enrollments (id,tenant_id,student_id,class_id,status,enrolled_at,started_at) VALUES ($1,$2,$3,$4,'ACTIVE','2026-09-01T03:00:00Z','2026-09-01T03:00:00Z')`, [ulid(), tenant.tenantId, studentId, ids.class]);
      }
      if (index < 3) {
        const destinationId = ulid();
        await pool.query(`INSERT INTO enrollments (id,tenant_id,student_id,class_id,status,enrolled_at,started_at,source_enrollment_id) VALUES ($1,$2,$3,$4,'ACTIVE','2026-09-20T03:00:00Z','2026-09-20T03:00:00Z',$5)`, [destinationId, tenant.tenantId, studentId, ids.unlimitedClass, sourceId]);
        await pool.query(`INSERT INTO enrollment_events (id,tenant_id,enrollment_id,type,from_status,to_status,from_class_id,to_class_id,occurred_at) VALUES ($1,$2,$3,'REENROLLED','COMPLETED','ACTIVE',$4,$5,'2026-09-20T03:00:00Z')`, [ulid(), tenant.tenantId, destinationId, ids.class, ids.unlimitedClass]);
      }
    }

    await pool.query(`INSERT INTO attendance_sessions (id,tenant_id,class_id,teacher_id,branch_id,session_date,start_time,end_time,status) VALUES
      ($1,$2,$3,$4,$5,'2026-09-05','08:00','09:00','COMPLETED'),
      ($6,$2,$3,$4,$5,'2026-09-06','08:00','09:30','COMPLETED'),
      ($7,$2,$3,$8,$5,'2026-09-07','08:00','09:00','CANCELLED'),
      ($9,$2,$3,$4,$5,'2026-09-08','08:00','09:00','SCHEDULED')`,
      [ids.session60, tenant.tenantId, ids.class, ids.teacherB, ids.branch, ids.session90, ids.cancelled, ids.teacherA, ids.openSession]);
    const locked1 = ulid(), locked2 = ulid(), open = ulid();
    await pool.query(`INSERT INTO attendance_sheets (id,tenant_id,session_id,status) VALUES ($1,$2,$3,'LOCKED'),($4,$2,$5,'LOCKED'),($6,$2,$7,'OPEN')`,
      [locked1, tenant.tenantId, ids.session60, locked2, ids.session90, open, ids.openSession]);
    await pool.query(`INSERT INTO attendance_records (id,tenant_id,session_id,student_id,enrollment_id,status) VALUES
      ($1,$2,$3,$4,$5,'PRESENT'),($6,$2,$7,$4,$5,'ABSENT_UNEXCUSED'),($8,$2,$9,$4,$5,'PRESENT')`,
      [ulid(), tenant.tenantId, ids.session60, ids.student, ids.enrollment, ulid(), ids.session90, ulid(), ids.openSession]);
    const assessment = ulid();
    await pool.query(`INSERT INTO assessments (id,tenant_id,class_id,type,title,scoring_mode,max_score,assessment_date,status,published_at,published_by_user_id) VALUES ($1,$2,$3,'TEST','LOCAL-15 Test','SIMPLE',10,'2026-09-12','PUBLISHED','2026-09-12T03:00:00Z',$4)`, [assessment, tenant.tenantId, ids.class, ulid()]);
    await pool.query(`INSERT INTO assessment_results (id,tenant_id,assessment_id,student_id,enrollment_id,score,status) VALUES ($1,$2,$3,$4,$5,8,'GRADED')`, [ulid(), tenant.tenantId, assessment, ids.student, ids.enrollment]);

    for (let index = 0; index < 10; index += 1) {
      const leadId = ulid();
      const status = index < 4 ? 'WON' : index < 6 ? 'LOST' : 'NEW';
      await pool.query(`INSERT INTO leads (id,tenant_id,status,student_name,preferred_branch_id,source,won_at,lost_at,lost_reason,converted_student_id,converted_enrollment_id,created_at) VALUES
        ($1,$2,$3,$4,$5,'REFERRAL',$6::timestamptz,$7::timestamptz,$8,$9,$10,'2026-09-05T03:00:00Z')`,
        [leadId, tenant.tenantId, status, `Lead ${index + 1}`, ids.branch, status === 'WON' ? '2026-09-20T03:00:00Z' : null, status === 'LOST' ? '2026-09-20T03:00:00Z' : null, status === 'LOST' ? 'PRICE' : null, status === 'WON' ? ids.student : null, status === 'WON' ? ids.destination : null]);
      await pool.query(`INSERT INTO lead_events (id,tenant_id,lead_id,type,from_status,to_status,occurred_at) VALUES ($1,$2,$3,'CREATED',NULL,'NEW','2026-09-05T03:00:00Z')`, [ulid(), tenant.tenantId, leadId]);
      if (status === 'WON') await pool.query(`INSERT INTO lead_events (id,tenant_id,lead_id,type,from_status,to_status,occurred_at) VALUES ($1,$2,$3,'CONVERTED','QUALIFIED','WON','2026-09-20T03:00:00Z')`, [ulid(), tenant.tenantId, leadId]);
      if (status === 'LOST') await pool.query(`INSERT INTO lead_events (id,tenant_id,lead_id,type,from_status,to_status,occurred_at) VALUES ($1,$2,$3,'LOST','QUALIFIED','LOST','2026-09-20T03:00:00Z')`, [ulid(), tenant.tenantId, leadId]);
    }

    await pool.query(`INSERT INTO invoices (id,tenant_id,invoice_number,student_id,enrollment_id,status,issue_date,due_date,subtotal_vnd,discount_vnd,total_vnd,created_at) VALUES
      ($1,$2,'INV-LOCAL15',$3,$4,'ISSUED','2026-09-01','2026-09-01',1000000,0,1000000,'2026-09-01T03:00:00Z')`,
      [ids.invoice, tenant.tenantId, ids.student, ids.enrollment]);
    await pool.query(`INSERT INTO invoice_status_history (id,tenant_id,invoice_id,status,effective_at) VALUES
      ($1,$2,$3,'DRAFT','2026-08-31T03:00:00Z'),($4,$2,$3,'ISSUED','2026-09-01T03:00:00Z')`, [ulid(), tenant.tenantId, ids.invoice, ulid()]);
    await pool.query(`INSERT INTO payments (id,tenant_id,invoice_id,student_id,amount_vnd,method,reference,received_at,created_at) VALUES
      ($1,$2,$3,$4,400000,'CASH','LOCAL15','2026-09-10T03:00:00Z','2026-09-10T03:00:00Z')`, [ids.payment, tenant.tenantId, ids.invoice, ids.student]);
    await pool.query(`INSERT INTO payment_allocations (id,tenant_id,payment_id,invoice_id,amount_vnd,created_at) VALUES
      ($1,$2,$3,$4,400000,'2026-09-10T03:00:00Z')`, [ids.paymentAllocation, tenant.tenantId, ids.payment, ids.invoice]);
    await pool.query(`INSERT INTO payment_reversals (id,tenant_id,payment_id,idempotency_key,reason,created_at) VALUES
      ($1,$2,$3,'LOCAL15-REV','post-cutoff','2026-10-05T03:00:00Z')`, [ids.reversal, tenant.tenantId, ids.payment]);
    for (const daysOverdue of [0, 1, 30, 31, 60, 61]) {
      const invoiceId = ulid();
      const due = new Date('2026-09-30T00:00:00Z');
      due.setUTCDate(due.getUTCDate() - daysOverdue);
      const dueDate = due.toISOString().slice(0, 10);
      await pool.query(`INSERT INTO invoices (id,tenant_id,invoice_number,student_id,enrollment_id,status,issue_date,due_date,subtotal_vnd,discount_vnd,total_vnd,created_at) VALUES ($1,$2,$3,$4,$5,'ISSUED','2026-09-01',$6::date,100000,0,100000,'2026-09-01T03:00:00Z')`, [invoiceId, tenant.tenantId, `AGE-${daysOverdue}`, ids.student, ids.enrollment, dueDate]);
      await pool.query(`INSERT INTO invoice_status_history (id,tenant_id,invoice_id,status,effective_at) VALUES ($1,$2,$3,'ISSUED','2026-09-01T03:00:00Z')`, [ulid(), tenant.tenantId, invoiceId]);
    }
    const foreignTenantId = ulid();
    const foreignStudent = ulid();
    const foreignClass = ulid();
    await pool.query(`INSERT INTO students (id,tenant_id,code,full_name,status,created_at) VALUES ($1,$2,'FOREIGN','Foreign Student','ACTIVE','2026-09-05T03:00:00Z')`, [foreignStudent, foreignTenantId]);
    await pool.query(`INSERT INTO classes (id,tenant_id,code,name,status,capacity) VALUES ($1,$2,'FOREIGN','Foreign Class','ACTIVE',10)`, [foreignClass, foreignTenantId]);
    await pool.query(`INSERT INTO leads (id,tenant_id,status,student_name,source,created_at) VALUES ($1,$2,'NEW','Foreign Lead','OTHER','2026-09-05T03:00:00Z')`, [ulid(), foreignTenantId]);
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it('executes every fixed report without invalid numeric states', async () => {
    const permissions = permissionsForRole('OWNER');
    for (const key of keys) {
      let result: Awaited<ReturnType<ReportsService['run']>>;
      try {
        result = await run(() => reports.run(key, { from: '2026-09-01', to: '2026-09-30', page: 1, pageSize: 50 }, permissions));
      } catch (error) {
        throw new Error(`${key}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      expect(result.report).toBe(key);
      expect(result.businessTimezone).toBe('Asia/Ho_Chi_Minh');
      expect(Array.isArray(result.rows)).toBe(true);
      expect(JSON.stringify(result)).not.toContain('NaN');
    }
  });

  it('uses finalized attendance and actual session teachers', async () => {
    const result = await run(() => reports.run('attendance', { ...date, page: 1, pageSize: 50 }, permissionsForRole('OWNER')));
    expect(result.summary).toMatchObject({ sessionsFinalized: 2, records: 2, attended: 1, absent: 1, attendanceRate: 50 });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.teacher === 'Giáo viên B')).toBe(true);
  });

  it('measures delivered workload and class occupancy without fabricating unlimited percentages', async () => {
    const permissions = permissionsForRole('OWNER');
    const [workload, utilization] = await run(() => Promise.all([
      reports.run('teacher-workload', { ...date, page: 1, pageSize: 50 }, permissions),
      reports.run('class-utilization', { ...date, page: 1, pageSize: 50 }, permissions),
    ]));
    const teacherB = workload.rows.find((row) => row.teacherId === ids.teacherB);
    expect(teacherB).toMatchObject({ completedSessions: 2, teachingMinutes: 150, teachingHours: 2.5, classesTaught: 1 });
    const teacherA = workload.rows.find((row) => row.teacherId === ids.teacherA);
    expect(teacherA).toMatchObject({ completedSessions: 0, cancelledSessions: 1 });
    expect(utilization.rows.find((row) => row.classId === ids.class)).toMatchObject({ capacity: 10, operational: 8, occupancyPct: 80 });
    expect(utilization.rows.find((row) => row.classId === ids.unlimitedClass)?.occupancyPct).toBeNull();
  });

  it('counts only explicit post-completion reenrollment events', async () => {
    const result = await run(() => reports.run('reenrollment', { ...date, page: 1, pageSize: 50 }, permissionsForRole('OWNER')));
    expect(result.summary).toMatchObject({ cohortSize: 10, reEnrolled: 4, reEnrollmentRate: 40 });
    expect(result.rows).toHaveLength(10);
  });

  it('reuses published graded progress and locked attendance formulas', async () => {
    const result = await run(() => reports.run('progress', { ...date, page: 1, pageSize: 50, studentId: ids.student }, permissionsForRole('OWNER')));
    const row = result.rows.find((item) => item.studentId === ids.student && item.classId === ids.class);
    expect(row).toMatchObject({ gradedCount: 1, average: 80, attendanceRate: 50 });
  });

  it('computes a related CRM cohort instead of mixing period events', async () => {
    const result = await run(() => reports.run('crm', { ...date, page: 1, pageSize: 50 }, permissionsForRole('OWNER')));
    expect(result.summary).toMatchObject({ cohortSize: 10, won: 4, lost: 2, active: 4, cohortWonRate: 40 });
  });

  it('preserves historical finance before a later reversal and assigns it to the deterministic branch', async () => {
    const permissions = permissionsForRole('OWNER');
    const [finance, aging, payments, branches] = await run(() => Promise.all([
      reports.run('finance', { ...date, page: 1, pageSize: 50 }, permissions),
      reports.run('receivables', { ...date, page: 1, pageSize: 50 }, permissions),
      reports.run('payments', { ...date, page: 1, pageSize: 50 }, permissions),
      reports.run('branches', { ...date, page: 1, pageSize: 50 }, permissions),
    ]));
    expect(finance.summary).toMatchObject({ grossBilledVnd: '1600000', collectedVnd: '400000', outstandingAsOfToVnd: '1200000' });
    expect(aging.rows.find((row) => row.invoiceNumber === 'INV-LOCAL15')).toMatchObject({ outstandingVnd: '600000', bucket: '1-30', daysOverdue: 29 });
    const agingBoundaries = Object.fromEntries(aging.rows.filter((row) => String(row.invoiceNumber).startsWith('AGE-')).map((row) => [row.invoiceNumber, row.bucket]));
    expect(agingBoundaries).toMatchObject({ 'AGE-0': 'Current', 'AGE-1': '1-30', 'AGE-30': '1-30', 'AGE-31': '31-60', 'AGE-60': '31-60', 'AGE-61': '61+' });
    expect(payments.rows[0]).toMatchObject({ amountVnd: '400000', allocatedVnd: '400000', unallocatedVnd: '0', status: 'RECORDED' });
    expect(branches.rows.find((row) => row.branchId === ids.branch)).toMatchObject({ billedVnd: '1600000', outstandingVnd: '1200000' });
  });

  it('never includes rows from a different tenant id', async () => {
    const permissions = permissionsForRole('OWNER');
    const [students, crm, classes] = await run(() => Promise.all([
      reports.run('students-enrollments', { ...date, page: 1, pageSize: 50 }, permissions),
      reports.run('crm', { ...date, page: 1, pageSize: 50 }, permissions),
      reports.run('class-utilization', { ...date, page: 1, pageSize: 50 }, permissions),
    ]));
    expect(JSON.stringify([students, crm, classes])).not.toContain('Foreign');
    expect(students.summary.newStudents).toBe(1);
    expect(crm.summary.cohortSize).toBe(10);
    expect(classes.rows.some((row) => row.class === 'Foreign Class')).toBe(false);
  });

  it('exports the same filtered rows and neutralizes spreadsheet formulas', async () => {
    const response = { set: vi.fn() } as never;
    const permissions = permissionsForRole('OWNER');
    const csv = await run(() => reports.exportCsv('students-enrollments', { ...date, page: 1, pageSize: 50 }, permissions, response));
    const branchCsv = await run(() => reports.exportCsv('branches', { ...date, page: 1, pageSize: 50 }, permissions, response));
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain("'=SUM(1+1)");
    expect(branchCsv).toContain('Chi nhánh Một');
    expect(response.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' }));
  });
});
