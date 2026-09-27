import dotenv from 'dotenv';
// Test setup defaults POSTGRES_* for mock-based specs; real integration values
// come from apps/api/.env and must win over those defaults.
dotenv.config({ override: true });

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { escapeIdentifier, Pool } from 'pg';
import { ulid } from 'ulid';
import { deployTenantSchema } from '../src/database/tenant-migrations.js';
import { postgresConfig } from '../src/config.js';
import { AuditService } from '../src/audit/audit.service.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { BillingService } from '../src/billing/billing.service.js';
import { CommunicationService } from '../src/communication/communication.service.js';
import { DashboardService } from '../src/dashboard/dashboard.service.js';
import { dashboardBusinessClock, hcmDate } from '../src/dashboard/business-clock.js';
import { permissionsForRole } from '../src/authorization/permissions.js';
import { TenantContextService, type TenantContext } from '../src/tenant/tenant-context.service.js';

const enabled = process.env.B5_TEST_DATABASE === '1';

describe.skipIf(!enabled)('LOCAL-14 dashboard integration (real PostgreSQL)', () => {
  let admin: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let tenantContext: TenantContextService;
  let dashboard: DashboardService;
  let billing: BillingService;
  const names = { a: '', b: '' };
  const ta = { tenantId: ulid(), tenantSlug: 'local14-a', dbName: '' };
  const tb = { tenantId: ulid(), tenantSlug: 'local14-b', dbName: '' };
  const clock = dashboardBusinessClock();
  const day = (offset: number) => hcmDate(new Date(clock.localDayStart.getTime() + offset * 24 * 60 * 60_000));
  const ids = {
    s1: ulid(), s2: ulid(), c1: ulid(), c2: ulid(),
    se1: ulid(), se2: ulid(), se3: ulid(), se4: ulid(), se5: ulid(), se6: ulid(),
    ar1: ulid(), ar2: ulid(),
    l1: ulid(), l2: ulid(), l3: ulid(), l4: ulid(), l5: ulid(),
    e1: ulid(), e5: ulid(),
    as1: ulid(), as2: ulid(), pr1: ulid(), pr2: ulid(),
    p1: ulid(), p2: ulid(), st1: ulid(), t1: ulid(),
    cm1: ulid(), cm2: ulid(), inv1: ulid(), pm1: ulid(), pa1: ulid(),
    bStudent: ulid(), bClass: ulid(), bSession: ulid(), bLead: ulid(),
  };

  const context = (tenant: typeof ta, pool: Pool): TenantContext => ({
    tenant: tenant as never,
    pool,
    actorUserId: ulid(),
    actorMembershipId: ulid(),
    actorName: 'Tester',
    actorEmail: 'tester@example.com',
    requestId: 'test',
  });
  const runA = <T>(work: () => Promise<T>) => tenantContext.run(context(ta, poolA), work);
  const runB = <T>(work: () => Promise<T>) => tenantContext.run(context(tb, poolB), work);

  beforeAll(async () => {
    const config = postgresConfig();
    const runId = `${Date.now()}_${process.pid}`;
    names.a = `classora_local14_${runId}_a`;
    names.b = `classora_local14_${runId}_b`;
    ta.dbName = names.a;
    tb.dbName = names.b;
    admin = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    for (const name of Object.values(names)) {
      await admin.query(`CREATE DATABASE ${escapeIdentifier(name)}`);
      await deployTenantSchema(name);
    }
    const base = { host: config.host, port: config.port, user: config.user, password: config.password };
    poolA = new Pool({ ...base, database: names.a, max: 10 });
    poolB = new Pool({ ...base, database: names.b, max: 5 });
    tenantContext = new TenantContextService();
    const control = { tenantMembership: { findMany: vi.fn(async () => []) } } as unknown as ControlDatabaseService;
    const audit = new AuditService({} as ControlDatabaseService, tenantContext);
    const communication = new CommunicationService(tenantContext, audit);
    billing = new BillingService(tenantContext, audit, communication);
    dashboard = new DashboardService(tenantContext, control, billing);

    await poolA.query(`INSERT INTO students (id,tenant_id,code,full_name,status) VALUES ($1,$2,'S1','Student One','ACTIVE'),($3,$2,'S2','Student Two','DISABLED')`, [ids.s1, ta.tenantId, ids.s2]);
    await poolA.query(`INSERT INTO classes (id,tenant_id,code,name,status,completed_on) VALUES ($1,$2,'C1','Class One','ACTIVE',NULL),($3,$2,'C2','Class Two','COMPLETED',$4::date)`, [ids.c1, ta.tenantId, ids.c2, day(-1)]);    await poolA.query(
      `INSERT INTO attendance_sessions (id,tenant_id,class_id,session_date,start_time,end_time,status) VALUES
       ($1,$2,$3,$4::date,'08:00','09:30','COMPLETED'),
       ($5,$2,$3,$4::date,'00:01','00:02','SCHEDULED'),
       ($6,$2,$3,$4::date,'23:00','23:59:59','SCHEDULED'),
       ($7,$2,$3,$8::date,'10:00','11:30','SCHEDULED'),
       ($9,$2,$3,$10::date,'18:00','19:30','COMPLETED'),
       ($11,$2,$3,$4::date,'12:00','13:00','CANCELLED')`,
      [ids.se1, ta.tenantId, ids.c1, day(0), ids.se2, ids.se3, ids.se4, day(1), ids.se5, day(-1), ids.se6],
    );
    await poolA.query(`INSERT INTO attendance_sheets (id,tenant_id,session_id,status) VALUES ($1,$2,$3,'LOCKED'),($4,$2,$5,'OPEN')`, [ulid(), ta.tenantId, ids.se1, ulid(), ids.se2]);
    await poolA.query(`INSERT INTO attendance_records (id,tenant_id,session_id,student_id,status) VALUES ($1,$2,$3,$4,'ABSENT_EXCUSED'),($5,$2,$6,$4,'ABSENT_EXCUSED')`, [ids.ar1, ta.tenantId, ids.se1, ids.s1, ids.ar2, ids.se5]);
    await poolA.query(`INSERT INTO makeup_entitlements (id,tenant_id,student_id,source_attendance_record_id,source_session_id,status,expires_at) VALUES ($1,$2,$3,$4,$5,'AVAILABLE',$6::date),($7,$2,$3,$8,$9,'AVAILABLE',$10::date)`, [ulid(), ta.tenantId, ids.s1, ids.ar1, ids.se1, day(1), ulid(), ids.ar2, ids.se5, day(-1)]);

    await poolA.query(
      `INSERT INTO leads (id,tenant_id,status,student_name,next_follow_up_at) VALUES
       ($1,$2,'CONTACTED','Lead Overdue',$3::timestamptz),
       ($4,$2,'NEW','Lead Today',$5::timestamptz),
       ($6,$2,'QUALIFIED','Lead Later',$7::timestamptz)`,
      [ids.l1, ta.tenantId, new Date(clock.localDayStart.getTime() - 2 * 60 * 60_000), ids.l2, new Date(clock.localDayStart.getTime() + 2 * 60 * 60_000), ids.l3, clock.localDayEnd],
    );
    await poolA.query(`INSERT INTO enrollments (id,tenant_id,student_id,class_id,status) VALUES ($1,$2,$3,$4,'ACTIVE'),($5,$2,$3,$6,'TRIAL')`, [ids.e1, ta.tenantId, ids.s1, ids.c1, ids.e5, ids.c2]);
    await poolA.query(`INSERT INTO leads (id,tenant_id,status,student_name,converted_student_id,converted_enrollment_id,won_at) VALUES ($1,$2,'WON','Lead Won',$3,$4,$5::timestamptz)`, [ids.l4, ta.tenantId, ids.s1, ids.e1, clock.localMonthStart]);
    await poolA.query(`INSERT INTO leads (id,tenant_id,status,student_name,lost_reason,lost_at) VALUES ($1,$2,'LOST','Lead Lost','PRICE',$3::timestamptz)`, [ids.l5, ta.tenantId, clock.localDayStart]);
    await poolA.query(`INSERT INTO trial_bookings (id,tenant_id,lead_id,session_id,student_id,trial_enrollment_id,status) VALUES ($1,$2,$3,$4,$5,$6,'BOOKED'),($7,$2,$8,$9,$5,$6,'BOOKED')`, [ulid(), ta.tenantId, ids.l3, ids.se3, ids.s1, ids.e5, ulid(), ids.l1, ids.se4]);

    await poolA.query(`INSERT INTO assessments (id,tenant_id,class_id,type,title,scoring_mode,max_score,status,published_at,published_by_user_id) VALUES ($1,$2,$3,'QUIZ','Draft Quiz','SIMPLE',10,'DRAFT',NULL,NULL),($4,$2,$3,'QUIZ','Published Quiz','SIMPLE',10,'PUBLISHED',$5::timestamptz,$6)`, [ids.as1, ta.tenantId, ids.c1, ids.as2, clock.localDayStart, ulid()]);
    await poolA.query(`INSERT INTO progress_reports (id,tenant_id,student_id,enrollment_id,class_id,title,period_start,period_end,status,published_at,published_by_user_id,snapshot) VALUES ($1,$2,$3,$4,$5,'Draft Report',$6::date,$7::date,'DRAFT',NULL,NULL,NULL),($8,$2,$3,$4,$5,'Published Report',$6::date,$7::date,'PUBLISHED',$9::timestamptz,$10,'{}'::jsonb)`, [ids.pr1, ta.tenantId, ids.s1, ids.e1, ids.c1, day(-30), day(0), ids.pr2, clock.localDayStart, ulid()]);

    await poolA.query(`INSERT INTO teachers (id,tenant_id,code,name) VALUES ($1,$2,'T1','Teacher One')`, [ids.t1, ta.tenantId]);
    await poolA.query(`INSERT INTO compensation_periods (id,tenant_id,period_start,period_end,status,finalized_at,finalized_by_user_id) VALUES ($1,$2,$3::date,$4::date,'DRAFT',NULL,NULL),($5,$2,$6::date,$7::date,'FINALIZED',$8::timestamptz,$9)`, [ids.p1, ta.tenantId, day(-30), day(-1), ids.p2, day(-60), day(-31), clock.localDayStart, ulid()]);
    await poolA.query(`INSERT INTO teacher_compensation_statements (id,tenant_id,period_id,teacher_id,payable_vnd) VALUES ($1,$2,$3,$4,5000000)`, [ids.st1, ta.tenantId, ids.p2, ids.t1]);
    await poolA.query(`INSERT INTO unresolved_compensation (id,tenant_id,period_id,class_id,session_id,work_date,reason_code,description) VALUES ($1,$2,$3,$4,$5,$6::date,'MISSING_TEACHER','missing teacher')`, [ulid(), ta.tenantId, ids.p1, ids.c1, ids.se5, day(-1)]);

    await poolA.query(`INSERT INTO communication_messages (id,tenant_id,event_type,channel,recipient_type,body,dedupe_key,status,sent_at) VALUES ($1,$2,'SESSION_REMINDER','IN_APP','STUDENT','body','dk1','FAILED',NULL),($3,$2,'PAYMENT_RECEIVED','IN_APP','STUDENT','body','dk2','SENT',$4::timestamptz)`, [ids.cm1, ta.tenantId, ids.cm2, clock.localDayStart]);

    await poolA.query(`INSERT INTO invoices (id,tenant_id,invoice_number,student_id,status,issue_date,due_date,subtotal_vnd,discount_vnd,total_vnd) VALUES ($1,$2,'INV-001',$3,'ISSUED',$4::date,$5::date,1000000,0,1000000)`, [ids.inv1, ta.tenantId, ids.s1, day(-10), day(-1)]);
    await poolA.query(`INSERT INTO payments (id,tenant_id,invoice_id,amount_vnd,method,received_at) VALUES ($1,$2,$3,400000,'CASH',$4::timestamptz)`, [ids.pm1, ta.tenantId, ids.inv1, clock.now]);
    await poolA.query(`INSERT INTO payment_allocations (id,tenant_id,payment_id,invoice_id,amount_vnd) VALUES ($1,$2,$3,$4,400000)`, [ids.pa1, ta.tenantId, ids.pm1, ids.inv1]);
  }, 180_000);

  afterAll(async () => {
    for (const pool of [poolA, poolB, admin]) await pool?.end().catch(() => undefined);
    const config = postgresConfig();
    const cleanup = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    for (const name of Object.values(names)) await cleanup.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(name)} WITH (FORCE)`).catch(() => undefined);
    await cleanup.end().catch(() => undefined);
  });

  it('projects the full academic section from authoritative rows', async () => {
    const snapshot = await runA(() => dashboard.snapshot(permissionsForRole('OWNER')));
    expect(snapshot.businessDate).toBe(clock.businessDate);
    const academic = snapshot.sections.academic;
    expect(academic.activeStudentCount).toBe(1);
    expect(academic.activeClassCount).toBe(1);
    expect(academic.sessionsToday).toMatchObject({ total: 4, scheduled: 2, completed: 1, cancelled: 1, rescheduled: 0 });
    expect(academic.pendingAttendanceCount).toBe(2);
    expect(academic.availableMakeupCount).toBe(1);
    expect(academic.draftAssessmentCount).toBe(1);
    expect(academic.draftProgressReportCount).toBe(1);
    const upcomingIds = academic.upcomingSessions.map((session: { id: string }) => session.id).sort();
    expect(upcomingIds).toEqual([ids.se3, ids.se4].sort());
  });

  it('reuses the authoritative billing calculations verbatim', async () => {
    const [snapshot, overview, receivables] = await runA(async () => {
      const result = await Promise.all([dashboard.snapshot(permissionsForRole('OWNER')), billing.overview(), billing.receivables()]);
      return result;
    });
    const billingSection = snapshot.sections.finance.billing;
    expect(billingSection.outstandingVnd).toBe(overview.outstanding);
    expect(billingSection.overdueVnd).toBe(overview.overdue);
    expect(billingSection.collectedThisMonthVnd).toBe(overview.collectedThisPeriod);
    expect(billingSection.outstandingVnd).toBe('600000');
    const overdue = snapshot.sections.finance.overdueReceivables;
    expect(overdue).toHaveLength(1);
    expect(overdue[0].invoiceId).toBe(ids.inv1);
    expect(overdue[0].outstandingVnd).toBe('600000');
    expect(overdue[0].daysOverdue).toBeGreaterThanOrEqual(1);
    expect(receivables.some((row: { invoiceId: string }) => row.invoiceId === ids.inv1)).toBe(true);
  });

  it('projects compensation from stored statement truth', async () => {
    const snapshot = await runA(() => dashboard.snapshot(permissionsForRole('ACCOUNTANT')));
    expect(snapshot.sections.academic).toBeUndefined();
    expect(snapshot.sections.growth).toBeUndefined();
    expect(snapshot.sections.finance.compensation).toEqual({ draftPeriodCount: 1, unresolvedIssueCount: 1, latestFinalizedPayableVnd: '5000000' });
  });

  it('classifies CRM follow-ups and trials by Vietnam-local day bounds', async () => {
    const snapshot = await runA(() => dashboard.snapshot(permissionsForRole('SALE')));
    expect(snapshot.sections.academic).toBeUndefined();
    expect(snapshot.sections.finance).toBeUndefined();
    const growth = snapshot.sections.growth;
    expect(growth.activeLeadCount).toBe(3);
    expect(growth.pipeline).toEqual({ NEW: 1, CONTACTED: 1, QUALIFIED: 1, TRIAL_BOOKED: 0, TRIAL_COMPLETED: 0 });
    expect(growth.overdueFollowUpCount).toBe(1);
    expect(growth.followUpsTodayCount).toBe(1);
    expect(growth.upcomingTrialCount).toBe(2);
    expect(growth.wonThisMonthCount).toBe(1);
    expect(growth.followUps.map((row: { leadId: string }) => row.leadId).sort()).toEqual([ids.l1, ids.l2].sort());
  });

  it('derives a bounded permission-aware attention feed', async () => {
    const snapshot = await runA(() => dashboard.snapshot(permissionsForRole('OWNER')));
    const types = snapshot.sections.attention.map((item: { type: string }) => item.type);
    expect(types).toContain('PENDING_ATTENDANCE');
    expect(types).toContain('OVERDUE_INVOICE');
    expect(types).toContain('OVERDUE_FOLLOW_UP');
    expect(types).toContain('FAILED_COMMUNICATION');
    expect(types).toContain('UNRESOLVED_COMPENSATION');
    expect(types).toContain('DRAFT_PROGRESS_REPORT');
    expect(snapshot.sections.attention.length).toBeLessThanOrEqual(12);
    for (const item of snapshot.sections.attention) {
      expect(item.href.startsWith('/')).toBe(true);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(item.date)).toBe(true);
    }
  });

  it('renders a valid zero state for an empty tenant', async () => {
    const snapshot = await runB(() => dashboard.snapshot(permissionsForRole('OWNER')));
    expect(snapshot.sections.academic).toMatchObject({ activeStudentCount: 0, activeClassCount: 0, pendingAttendanceCount: 0, availableMakeupCount: 0, draftAssessmentCount: 0, draftProgressReportCount: 0 });
    expect(snapshot.sections.academic.sessionsToday.total).toBe(0);
    expect(snapshot.sections.finance.billing).toMatchObject({ outstandingVnd: '0', overdueVnd: '0' });
    expect(snapshot.sections.growth.activeLeadCount).toBe(0);
    expect(snapshot.sections.attention).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain('NaN');
  });

  it('never counts another tenant across the isolation boundary', async () => {
    await poolB.query(`INSERT INTO students (id,tenant_id,code,full_name,status) VALUES ($1,$2,'BX','Cross Student','ACTIVE')`, [ids.bStudent, tb.tenantId]);
    await poolB.query(`INSERT INTO classes (id,tenant_id,code,name,status) VALUES ($1,$2,'BC','Cross Class','ACTIVE')`, [ids.bClass, tb.tenantId]);
    await poolB.query(`INSERT INTO attendance_sessions (id,tenant_id,class_id,session_date,start_time,end_time,status) VALUES ($1,$2,$3,$4::date,'09:00','10:00','SCHEDULED')`, [ids.bSession, tb.tenantId, ids.bClass, day(0)]);
    await poolB.query(`INSERT INTO leads (id,tenant_id,status,student_name) VALUES ($1,$2,'NEW','Cross Lead')`, [ids.bLead, tb.tenantId]);
    const [snapshotA, snapshotB] = await Promise.all([
      runA(() => dashboard.snapshot(permissionsForRole('OWNER'))),
      runB(() => dashboard.snapshot(permissionsForRole('OWNER'))),
    ]);
    expect(snapshotA.sections.academic.activeStudentCount).toBe(1);
    expect(snapshotA.sections.academic.sessionsToday.total).toBe(4);
    expect(snapshotA.sections.growth.activeLeadCount).toBe(3);
    expect(snapshotB.sections.academic.activeStudentCount).toBe(1);
    expect(snapshotB.sections.academic.sessionsToday.total).toBe(1);
    expect(snapshotB.sections.growth.activeLeadCount).toBe(1);
    expect(snapshotA.sections.academic.upcomingSessions.some((session: { id: string }) => session.id === ids.bSession)).toBe(false);
    expect(snapshotA.sections.growth.followUps.some((row: { leadId: string }) => row.leadId === ids.bLead)).toBe(false);
  });
});
