import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { BillingService } from '../billing/billing.service.js';
import { ControlDatabaseService } from '../database/control-database.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { dashboardBusinessClock, hcmDate, type DashboardBusinessClock } from './business-clock.js';
import { PERMISSIONS, type Permission } from '../authorization/permissions.js';

type Pool = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };
type Row = QueryResultRow & Record<string, any>;
type Attention = { type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; title: string; description: string; date: string; href: string };

const has = (permissions: readonly Permission[], permission: Permission) => permissions.includes(permission);
const serialize = (value: any): any => value instanceof Date ? value.toISOString() : typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(serialize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)])) : value;
const time = (value: unknown) => String(value ?? '').slice(0, 5);
const date = (value: unknown) => String(value ?? '').slice(0, 10);

@Injectable()
export class DashboardService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly database: ControlDatabaseService,
    private readonly billing: BillingService,
  ) {}

  async snapshot(permissions: readonly Permission[]) {
    const { tenant, pool } = this.tenantContext.get();
    const clock = dashboardBusinessClock();
    const academicAllowed = has(permissions, PERMISSIONS.STUDENT_READ) || has(permissions, PERMISSIONS.CLASS_READ) || has(permissions, PERMISSIONS.SCHEDULE_READ) || has(permissions, PERMISSIONS.ATTENDANCE_READ) || has(permissions, PERMISSIONS.PROGRESS_READ);
    const financeAllowed = has(permissions, PERMISSIONS.BILLING_READ) || has(permissions, PERMISSIONS.COMPENSATION_READ);
    const growthAllowed = has(permissions, PERMISSIONS.CRM_READ);
    const [academicData, financeData, growthData, communicationAttention] = await Promise.all([
      academicAllowed ? this.academic(pool, tenant.tenantId, clock, permissions) : undefined,
      financeAllowed ? this.finance(pool, tenant.tenantId, clock, permissions) : undefined,
      growthAllowed ? this.growth(pool, tenant.tenantId, clock) : undefined,
      has(permissions, PERMISSIONS.COMMUNICATION_READ) ? this.failedCommunication(pool, tenant.tenantId) : Promise.resolve([] as Attention[]),
    ]);
    const sections: Record<string, any> = { attention: [] };
    if (academicData) sections.academic = academicData.section;
    if (financeData) sections.finance = financeData.section;
    if (growthData) sections.growth = growthData.section;
    sections.attention = [
      ...(academicData?.attention ?? []),
      ...(financeData?.attention ?? []),
      ...(growthData?.attention ?? []),
      ...communicationAttention,
    ].sort((left, right) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[left.severity] - { HIGH: 0, MEDIUM: 1, LOW: 2 }[right.severity]) || left.date.localeCompare(right.date)).slice(0, 12);
    return serialize({ generatedAt: clock.now, businessDate: clock.businessDate, sections });
  }

  private async academic(pool: Pool, tenantId: string, clock: DashboardBusinessClock, permissions: readonly Permission[]) {
    const section: Record<string, any> = {};
    const attention: Attention[] = [];
    const queries: Promise<any>[] = [];
    const keys: string[] = [];
    if (has(permissions, PERMISSIONS.STUDENT_READ)) {
      keys.push('students');
      queries.push(pool.query(`SELECT COUNT(*)::int AS count FROM students WHERE tenant_id=$1 AND status='ACTIVE'`, [tenantId]));
    }
    if (has(permissions, PERMISSIONS.CLASS_READ)) {
      keys.push('classes');
      queries.push(pool.query(`SELECT COUNT(*)::int AS count FROM classes WHERE tenant_id=$1 AND status='ACTIVE'`, [tenantId]));
    }
    if (has(permissions, PERMISSIONS.SCHEDULE_READ)) {
      keys.push('sessions', 'upcoming');
      queries.push(pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='SCHEDULED')::int AS scheduled, COUNT(*) FILTER (WHERE status='COMPLETED')::int AS completed, COUNT(*) FILTER (WHERE status='CANCELLED')::int AS cancelled, COUNT(*) FILTER (WHERE status='RESCHEDULED')::int AS rescheduled FROM attendance_sessions WHERE tenant_id=$1 AND session_date=$2::date`, [tenantId, clock.businessDate]));
      queries.push(pool.query(`SELECT a.id, a.session_date::text AS date, a.start_time::text AS "startTime", a.end_time::text AS "endTime", a.class_id AS "classId", c.name AS "className", t.name AS "teacherName", r.name AS "roomName", b.name AS "branchName", a.status FROM attendance_sessions a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id LEFT JOIN teachers t ON t.tenant_id=a.tenant_id AND t.id=a.teacher_id LEFT JOIN rooms r ON r.tenant_id=a.tenant_id AND r.id=a.room_id LEFT JOIN branches b ON b.tenant_id=a.tenant_id AND b.id=a.branch_id WHERE a.tenant_id=$1 AND a.status='SCHEDULED' AND (a.session_date + a.start_time) >= ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') ORDER BY a.session_date,a.start_time,a.id LIMIT 6`, [tenantId, clock.now]));
    }
    if (has(permissions, PERMISSIONS.ATTENDANCE_READ)) {
      keys.push('pending', 'makeups');
      queries.push(pool.query(`SELECT COUNT(*) OVER()::int AS total, a.id, a.session_date::text AS date, a.end_time::text AS "endTime", c.name AS "className" FROM attendance_sessions a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id LEFT JOIN attendance_sheets sh ON sh.tenant_id=a.tenant_id AND sh.session_id=a.id WHERE a.tenant_id=$1 AND a.status NOT IN ('CANCELLED','RESCHEDULED') AND (a.session_date + a.end_time) <= ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') AND (sh.id IS NULL OR sh.status='OPEN') ORDER BY a.session_date DESC,a.end_time DESC,a.id DESC LIMIT 12`, [tenantId, clock.now]));
      queries.push(pool.query(`SELECT COUNT(*)::int AS count FROM makeup_entitlements WHERE tenant_id=$1 AND status='AVAILABLE' AND expires_at >= $2::date`, [tenantId, clock.businessDate]));
    }
    if (has(permissions, PERMISSIONS.PROGRESS_READ)) {
      keys.push('assessments', 'reports');
      queries.push(pool.query(`SELECT COUNT(*) OVER()::int AS total, a.id, a.title, a.class_id AS "classId", c.name AS "className" FROM assessments a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id WHERE a.tenant_id=$1 AND a.status='DRAFT' ORDER BY a.created_at DESC,a.id DESC LIMIT 12`, [tenantId]));
      queries.push(pool.query(`SELECT COUNT(*) OVER()::int AS total, r.id, r.title, r.student_id AS "studentId", s.full_name AS "studentName" FROM progress_reports r JOIN students s ON s.tenant_id=r.tenant_id AND s.id=r.student_id WHERE r.tenant_id=$1 AND r.status='DRAFT' ORDER BY r.created_at DESC,r.id DESC LIMIT 12`, [tenantId]));
    }
    const results = await Promise.all(queries);
    const byKey = Object.fromEntries(keys.map((key, index) => [key, results[index].rows]));
    if (byKey.students) section.activeStudentCount = byKey.students[0]?.count ?? 0;
    if (byKey.classes) section.activeClassCount = byKey.classes[0]?.count ?? 0;
    if (byKey.sessions) section.sessionsToday = byKey.sessions[0] ?? { total: 0, scheduled: 0, completed: 0, cancelled: 0, rescheduled: 0 };
    if (byKey.upcoming) section.upcomingSessions = byKey.upcoming.map((row: Row) => ({ ...row, date: date(row.date), startTime: time(row.startTime), endTime: time(row.endTime) }));
    if (byKey.pending) {
      section.pendingAttendanceCount = byKey.pending[0]?.total ?? 0;
      for (const row of byKey.pending.slice(0, 4)) attention.push({ type: 'PENDING_ATTENDANCE', severity: 'HIGH', title: 'Điểm danh chưa hoàn tất', description: `${row.className} · kết thúc ${time(row.endTime)} ngày ${date(row.date)}`, date: date(row.date), href: `/attendance-sessions/${row.id}` });
    }
    if (byKey.makeups) section.availableMakeupCount = byKey.makeups[0]?.count ?? 0;
    if (byKey.assessments) {
      section.draftAssessmentCount = byKey.assessments[0]?.total ?? 0;
      for (const row of byKey.assessments.slice(0, 4)) attention.push({ type: 'DRAFT_ASSESSMENT', severity: 'LOW', title: 'Đánh giá còn bản nháp', description: `${row.title} · ${row.className}`, date: clock.businessDate, href: `/classes/${row.classId}` });
    }
    if (byKey.reports) {
      section.draftProgressReportCount = byKey.reports[0]?.total ?? 0;
      for (const row of byKey.reports.slice(0, 4)) attention.push({ type: 'DRAFT_PROGRESS_REPORT', severity: 'MEDIUM', title: 'Báo cáo tiến độ còn bản nháp', description: `${row.title} · ${row.studentName}`, date: clock.businessDate, href: `/students/${row.studentId}` });
    }
    return { section, attention };
  }

  private async finance(pool: Pool, tenantId: string, clock: DashboardBusinessClock, permissions: readonly Permission[]) {
    const section: Record<string, any> = {};
    const attention: Attention[] = [];
    if (has(permissions, PERMISSIONS.BILLING_READ)) {
      // Reuse the authoritative LOCAL-08 calculations verbatim so dashboard
      // numbers can never drift from /billing/overview and /receivables.
      // ponytail: overview()/receivables() load all invoice/payment rows and
      // reduce in JS, and their period is a UTC month rather than this clock's
      // Vietnam month. Acceptable at current tenant scale; replace with a
      // bounded SQL aggregate in billing-ledger.ts when invoice volume makes
      // dashboard refresh measurably slow.
      const [overview, receivables] = await Promise.all([this.billing.overview(), this.billing.receivables()]);
      section.billing = { outstandingVnd: String(overview.outstanding), overdueVnd: String(overview.overdue), collectedThisMonthVnd: String(overview.collectedThisPeriod) };
      const overdue = receivables
        .filter((row: any) => Number(row.daysOverdue) > 0)
        .sort((left: any, right: any) => Number(right.daysOverdue) - Number(left.daysOverdue))
        .slice(0, 5)
        .map((row: any) => ({ invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber, studentId: row.studentId, studentName: row.studentName, dueDate: hcmDate(row.dueAt instanceof Date ? row.dueAt : new Date(row.dueAt)), outstandingVnd: String(row.amount), daysOverdue: Number(row.daysOverdue) }));
      section.overdueReceivables = overdue;
      for (const row of overdue.slice(0, 4)) attention.push({ type: 'OVERDUE_INVOICE', severity: 'HIGH', title: 'Hóa đơn quá hạn', description: `${row.invoiceNumber} · còn ${row.outstandingVnd} VND · quá hạn ${row.daysOverdue} ngày`, date: row.dueDate, href: '/billing/receivables' });
    }
    if (has(permissions, PERMISSIONS.COMPENSATION_READ)) {
      const result = await pool.query(`SELECT (SELECT COUNT(*)::int FROM compensation_periods WHERE tenant_id=$1 AND status='DRAFT') AS "draftPeriodCount", (SELECT COUNT(*)::int FROM unresolved_compensation WHERE tenant_id=$1) AS "unresolvedIssueCount", COALESCE((SELECT SUM(s.payable_vnd) FROM teacher_compensation_statements s JOIN compensation_periods p ON p.tenant_id=s.tenant_id AND p.id=s.period_id WHERE s.tenant_id=$1 AND p.status='FINALIZED' AND p.period_end=(SELECT MAX(period_end) FROM compensation_periods WHERE tenant_id=$1 AND status='FINALIZED')),0) AS "latestFinalizedPayableVnd"`, [tenantId]);
      const row = result.rows[0] ?? { draftPeriodCount: 0, unresolvedIssueCount: 0, latestFinalizedPayableVnd: 0 };
      section.compensation = { draftPeriodCount: Number(row.draftPeriodCount), unresolvedIssueCount: Number(row.unresolvedIssueCount), latestFinalizedPayableVnd: String(row.latestFinalizedPayableVnd) };
      if (section.compensation.unresolvedIssueCount > 0) attention.push({ type: 'UNRESOLVED_COMPENSATION', severity: 'MEDIUM', title: 'Thù lao còn vướng mắc cấu hình', description: `${section.compensation.unresolvedIssueCount} mục chưa xử lý`, date: clock.businessDate, href: '/billing/compensation' });
    }
    return { section, attention };
  }

  private async growth(pool: Pool, tenantId: string, clock: DashboardBusinessClock) {
    const [counts, followUps, trialCount, trials] = await Promise.all([
      // Follow-up day buckets mirror the CRM list filters, with the shared
      // Vietnam-local day bounds instead of database CURRENT_TIMESTAMP.
      pool.query(`SELECT COUNT(*) FILTER (WHERE status NOT IN ('WON','LOST'))::int AS "activeLeadCount", COUNT(*) FILTER (WHERE status='NEW')::int AS "NEW", COUNT(*) FILTER (WHERE status='CONTACTED')::int AS "CONTACTED", COUNT(*) FILTER (WHERE status='QUALIFIED')::int AS "QUALIFIED", COUNT(*) FILTER (WHERE status='TRIAL_BOOKED')::int AS "TRIAL_BOOKED", COUNT(*) FILTER (WHERE status='TRIAL_COMPLETED')::int AS "TRIAL_COMPLETED", COUNT(*) FILTER (WHERE next_follow_up_at < $2::timestamptz)::int AS "overdueFollowUpCount", COUNT(*) FILTER (WHERE next_follow_up_at >= $3::timestamptz AND next_follow_up_at < $4::timestamptz)::int AS "followUpsTodayCount", COUNT(*) FILTER (WHERE status='WON' AND won_at >= $5::timestamptz AND won_at < $6::timestamptz)::int AS "wonThisMonthCount" FROM leads WHERE tenant_id=$1`, [tenantId, clock.localDayStart, clock.localDayStart, clock.localDayEnd, clock.localMonthStart, clock.localMonthEnd]),
      pool.query(`SELECT l.id AS "leadId", l.student_name AS "studentName", l.status, l.assigned_membership_id AS "assignedMembershipId", l.next_follow_up_at AS "nextFollowUpAt" FROM leads l WHERE l.tenant_id=$1 AND l.next_follow_up_at IS NOT NULL AND l.next_follow_up_at < $2::timestamptz ORDER BY l.next_follow_up_at,l.id LIMIT 12`, [tenantId, clock.localDayEnd]),
      pool.query(`SELECT COUNT(*)::int AS count FROM trial_bookings t JOIN attendance_sessions a ON a.tenant_id=t.tenant_id AND a.id=t.session_id WHERE t.tenant_id=$1 AND t.status='BOOKED' AND a.status='SCHEDULED' AND (a.session_date + a.start_time) >= ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')`, [tenantId, clock.now]),
      pool.query(`SELECT t.id,t.lead_id AS "leadId",l.student_name AS "leadName",t.session_id AS "sessionId",a.session_date::text AS "sessionDate",a.start_time::text AS "startTime",c.name AS "className",t.status FROM trial_bookings t JOIN leads l ON l.tenant_id=t.tenant_id AND l.id=t.lead_id JOIN attendance_sessions a ON a.tenant_id=t.tenant_id AND a.id=t.session_id JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id WHERE t.tenant_id=$1 AND t.status='BOOKED' AND a.status='SCHEDULED' AND (a.session_date + a.start_time) >= ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') ORDER BY a.session_date,a.start_time,t.id LIMIT 12`, [tenantId, clock.now]),
    ]);
    const membershipIds = followUps.rows.map((row) => row.assignedMembershipId).filter(Boolean);
    const memberships = membershipIds.length ? await this.database.tenantMembership.findMany({ where: { tenantId, id: { in: membershipIds } }, select: { id: true, user: { select: { name: true } } } }) : [];
    const names = new Map(memberships.map((membership) => [membership.id, membership.user?.name ?? null]));
    const c = counts.rows[0] ?? {};
    const followUpRows = followUps.rows.map((row) => ({ leadId: row.leadId, studentName: row.studentName, status: row.status, assigneeName: names.get(row.assignedMembershipId) ?? null, nextFollowUpAt: row.nextFollowUpAt instanceof Date ? row.nextFollowUpAt.toISOString() : row.nextFollowUpAt }));
    const section = {
      activeLeadCount: Number(c.activeLeadCount ?? 0),
      pipeline: { NEW: Number(c.NEW ?? 0), CONTACTED: Number(c.CONTACTED ?? 0), QUALIFIED: Number(c.QUALIFIED ?? 0), TRIAL_BOOKED: Number(c.TRIAL_BOOKED ?? 0), TRIAL_COMPLETED: Number(c.TRIAL_COMPLETED ?? 0) },
      overdueFollowUpCount: Number(c.overdueFollowUpCount ?? 0),
      followUpsTodayCount: Number(c.followUpsTodayCount ?? 0),
      upcomingTrialCount: Number(trialCount.rows[0]?.count ?? 0),
      wonThisMonthCount: Number(c.wonThisMonthCount ?? 0),
      followUps: followUpRows,
      trials: trials.rows.map((row) => ({ ...row, sessionDate: date(row.sessionDate), startTime: time(row.startTime) })),
    };
    const attention: Attention[] = followUpRows
      .filter((row) => new Date(row.nextFollowUpAt).getTime() < clock.localDayStart.getTime())
      .slice(0, 4)
      .map((row) => ({ type: 'OVERDUE_FOLLOW_UP', severity: 'MEDIUM', title: 'Theo dõi tiềm năng quá hạn', description: `Liên hệ lại ${row.studentName}`, date: hcmDate(row.nextFollowUpAt), href: `/leads/${row.leadId}` }));
    return { section, attention };
  }

  private async failedCommunication(pool: Pool, tenantId: string): Promise<Attention[]> {
    const result = await pool.query(`SELECT id,created_at AS date,event_type AS "eventType" FROM communication_messages WHERE tenant_id=$1 AND status='FAILED' ORDER BY created_at DESC,id DESC LIMIT 4`, [tenantId]);
    return result.rows.map((row) => ({ type: 'FAILED_COMMUNICATION', severity: 'MEDIUM', title: 'Gửi thông báo thất bại', description: `Sự kiện ${row.eventType}`, date: hcmDate(row.date), href: `/communications/${row.id}` }));
  }
}
