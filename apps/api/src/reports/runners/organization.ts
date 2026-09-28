import { PERMISSIONS } from '../../authorization/permissions.js';
import { invoiceSelectAt } from '../../billing/billing-ledger.js';
import { assertExportBounds } from '../report-csv.js';
import type { ReportColumn, ReportContext, ReportResult, ReportRow } from '../report-filters.js';
import { rate } from '../report-filters.js';

const big = (value: unknown) => BigInt(String(value ?? 0));
const has = (permissions: string[], permission: string) => permissions.includes(permission);
const UNASSIGNED = { id: null, name: 'Chưa phân chi nhánh' };
const ATTENDED = `('PRESENT','LATE','ONLINE','MAKEUP')`;
const ABSENT = `('ABSENT_EXCUSED','ABSENT_UNEXCUSED')`;

// Deterministic money attribution: invoice → enrollment → class → branch, or
// all invoice items resolving to the same branch. Mixed/unknown ownership stays
// Unassigned — never guessed, and payments are never split across branches.
const branchJoin = `
  FROM invoices i
  LEFT JOIN enrollments e ON e.tenant_id=i.tenant_id AND e.id=i.enrollment_id
  LEFT JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN COUNT(*) > 0 AND COUNT(DISTINCT c2.branch_id)=1 AND COUNT(*) FILTER (WHERE c2.branch_id IS NULL)=0
      THEN MIN(c2.branch_id)
      ELSE NULL
    END AS branch_id
    FROM invoice_items ii
    JOIN enrollments e2 ON e2.tenant_id=ii.tenant_id AND e2.id=ii.enrollment_id
    JOIN classes c2 ON c2.tenant_id=e2.tenant_id AND c2.id=e2.class_id
    WHERE ii.tenant_id=i.tenant_id AND ii.invoice_id=i.id
  ) item_branch ON i.enrollment_id IS NULL`;

export async function branchSummaryReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope, permissions } = ctx;
  const canClass = has(permissions, PERMISSIONS.CLASS_READ);
  const canEnrollment = has(permissions, PERMISSIONS.ENROLLMENT_READ);
  const canSchedule = has(permissions, PERMISSIONS.SCHEDULE_READ);
  const canAttendance = has(permissions, PERMISSIONS.ATTENDANCE_READ);
  const canCrm = has(permissions, PERMISSIONS.CRM_READ);
  const canFinance = has(permissions, PERMISSIONS.BILLING_READ) && has(permissions, PERMISSIONS.REPORT_FINANCE);

  if (ctx.mode === 'export') {
    const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM branches WHERE tenant_id=$1`, [tenantId]);
    assertExportBounds(Number(count.rows[0]?.count ?? 0) + 1); // + Unassigned row
  }

  const queries: Promise<void>[] = [];
  const rows = new Map<string, ReportRow>();
  const ensure = (id: string | null, name: string): ReportRow => {
    const key = id ?? '__unassigned__';
    let row = rows.get(key);
    if (!row) {
      row = { branchId: id, branch: name };
      rows.set(key, row);
    } else if (id && name !== UNASSIGNED.name) {
      row.branch = name;
    }
    return row;
  };

  queries.push(
    pool.query<{ id: string; name: string }>('SELECT id, name FROM branches WHERE tenant_id=$1 ORDER BY name, id', [tenantId]).then((result) => {
      for (const branch of result.rows) ensure(branch.id, branch.name);
    }),
  );
  if (canClass) {
    queries.push(
      pool.query<{ branch_id: string | null; count: number }>(
        `SELECT c.branch_id, COUNT(*)::int AS count FROM classes c WHERE c.tenant_id=$1 AND c.status='ACTIVE' GROUP BY c.branch_id`,
        [tenantId],
      ).then((result) => {
        for (const row of result.rows) ensure(row.branch_id, UNASSIGNED.name).activeClasses = Number(row.count);
      }),
    );
  }
  if (canEnrollment) {
    queries.push(
      pool.query<{ branch_id: string | null; count: number }>(
        `SELECT c.branch_id, COUNT(*)::int AS count FROM enrollments e JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
         WHERE e.tenant_id=$1 AND e.status IN ('PENDING','TRIAL','ACTIVE','PAUSED') GROUP BY c.branch_id`,
        [tenantId],
      ).then((result) => {
        for (const row of result.rows) ensure(row.branch_id, UNASSIGNED.name).operationalEnrollments = Number(row.count);
      }),
    );
  }
  if (canSchedule) {
    queries.push(
      pool.query<{ branch_id: string | null; count: number }>(
        `SELECT a.branch_id, COUNT(*)::int AS count FROM attendance_sessions a
         WHERE a.tenant_id=$1 AND a.status='COMPLETED' AND a.session_date >= $2::date AND a.session_date <= $3::date GROUP BY a.branch_id`,
        [tenantId, scope.from, scope.to],
      ).then((result) => {
        for (const row of result.rows) ensure(row.branch_id, UNASSIGNED.name).completedSessions = Number(row.count);
      }),
    );
  }
  if (canAttendance) {
    queries.push(
      pool.query<{ branch_id: string | null; attended: number; absent: number }>(
        `SELECT a.branch_id,
                COUNT(*) FILTER (WHERE r.status IN ${ATTENDED})::int AS attended,
                COUNT(*) FILTER (WHERE r.status IN ${ABSENT})::int AS absent
         FROM attendance_records r
         JOIN attendance_sheets sh ON sh.tenant_id=r.tenant_id AND sh.session_id=r.session_id AND sh.status='LOCKED'
         JOIN attendance_sessions a ON a.tenant_id=r.tenant_id AND a.id=r.session_id
         WHERE r.tenant_id=$1 AND a.session_date >= $2::date AND a.session_date <= $3::date AND r.status <> 'UNMARKED'
         GROUP BY a.branch_id`,
        [tenantId, scope.from, scope.to],
      ).then((result) => {
        for (const row of result.rows) ensure(row.branch_id, UNASSIGNED.name).attendanceRate = rate(Number(row.attended), Number(row.attended) + Number(row.absent));
      }),
    );
  }
  if (canCrm) {
    queries.push(
      pool.query<{ branch_id: string | null; total: number; won: number; trials: number }>(
        `SELECT l.preferred_branch_id AS branch_id, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE l.won_at IS NOT NULL AND l.won_at < $3::timestamptz)::int AS won,
                (SELECT COUNT(*)::int FROM trial_bookings tb JOIN leads l2 ON l2.tenant_id=tb.tenant_id AND l2.id=tb.lead_id
                 WHERE tb.tenant_id=$1 AND l2.preferred_branch_id IS NOT DISTINCT FROM l.preferred_branch_id
                   AND l2.created_at >= $2::timestamptz AND l2.created_at < $3::timestamptz
                   AND tb.status='COMPLETED' AND tb.completed_at < $3::timestamptz)::int AS trials
         FROM leads l
         WHERE l.tenant_id=$1 AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz
         GROUP BY l.preferred_branch_id`,
        [tenantId, scope.fromTs, scope.toTs],
      ).then((result) => {
        for (const row of result.rows) {
          const target = ensure(row.branch_id, UNASSIGNED.name);
          target.leadsCreated = Number(row.total);
          target.wonCount = Number(row.won);
          target.trialsCompleted = Number(row.trials);
        }
      }),
    );
  }
  if (canFinance) {
    const issuedInWindow = `EXISTS (SELECT 1 FROM invoice_status_history h WHERE h.tenant_id=i.tenant_id AND h.invoice_id=i.id AND h.status='ISSUED'
      AND h.effective_at >= $2::timestamptz AND h.effective_at < $3::timestamptz)
      AND COALESCE((SELECT hs.status FROM invoice_status_history hs WHERE hs.tenant_id=i.tenant_id AND hs.invoice_id=i.id
        AND hs.effective_at < $3::timestamptz ORDER BY hs.effective_at DESC, hs.id DESC LIMIT 1), i.status) <> 'VOID'`;
    queries.push(
      pool.query<{ branch_id: string | null; total: string }>(
        `SELECT COALESCE(c.branch_id, item_branch.branch_id) AS branch_id, SUM(i.total_vnd)::text AS total ${branchJoin}
         WHERE i.tenant_id=$1 AND ${issuedInWindow} GROUP BY COALESCE(c.branch_id, item_branch.branch_id)`,
        [tenantId, scope.fromTs, scope.toTs],
      ).then((result) => {
        for (const row of result.rows) ensure(row.branch_id, UNASSIGNED.name).billedVnd = row.total;
      }),
    );
    queries.push(
      pool.query<{ branch_id: string | null; total: string }>(
        `SELECT COALESCE(c.branch_id, item_branch.branch_id) AS branch_id, SUM(inv.total_vnd - COALESCE(inv.paid_vnd,0) - COALESCE(inv.credit_vnd,0)) FILTER (WHERE inv.total_vnd - COALESCE(inv.paid_vnd,0) - COALESCE(inv.credit_vnd,0) > 0)::text AS total
         FROM (${invoiceSelectAt('$2', '<')}) inv
         LEFT JOIN enrollments e ON e.tenant_id=inv.tenant_id AND e.id=inv.enrollment_id
         LEFT JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
         LEFT JOIN LATERAL (
           SELECT CASE
             WHEN COUNT(*) > 0 AND COUNT(DISTINCT c2.branch_id)=1 AND COUNT(*) FILTER (WHERE c2.branch_id IS NULL)=0
             THEN MIN(c2.branch_id)
             ELSE NULL
           END AS branch_id
           FROM invoice_items ii
           JOIN enrollments e2 ON e2.tenant_id=ii.tenant_id AND e2.id=ii.enrollment_id
           JOIN classes c2 ON c2.tenant_id=e2.tenant_id AND c2.id=e2.class_id
           WHERE ii.tenant_id=inv.tenant_id AND ii.invoice_id=inv.id
         ) item_branch ON inv.enrollment_id IS NULL
         WHERE inv.tenant_id=$1 AND inv.created_at < $2::timestamptz AND COALESCE(inv."statusAt", inv.status)='ISSUED'
         GROUP BY COALESCE(c.branch_id, item_branch.branch_id)`,
        [tenantId, scope.toTs],
      ).then((result) => {
        for (const row of result.rows) ensure(row.branch_id, UNASSIGNED.name).outstandingVnd = row.total;
      }),
    );
  }
  await Promise.all(queries);

  const columns: ReportColumn[] = [{ key: 'branch', label: 'Chi nhánh' }];
  if (canClass) columns.push({ key: 'activeClasses', label: 'Lớp đang hoạt động' });
  if (canEnrollment) columns.push({ key: 'operationalEnrollments', label: 'Học viên đang học' });
  if (canSchedule) columns.push({ key: 'completedSessions', label: 'Buổi hoàn thành' });
  if (canAttendance) columns.push({ key: 'attendanceRate', label: 'Tỷ lệ chuyên cần (%)' });
  if (canCrm) columns.push({ key: 'leadsCreated', label: 'Tiềm năng mới' }, { key: 'wonCount', label: 'Thắng' }, { key: 'trialsCompleted', label: 'Học thử hoàn thành' });
  if (canFinance) columns.push({ key: 'billedVnd', label: 'Đã lập hóa đơn' }, { key: 'outstandingVnd', label: 'Còn phải thu' });

  const list = [...rows.values()].sort((a, b) => (a.branchId === null ? 1 : b.branchId === null ? -1 : String(a.branch).localeCompare(String(b.branch))));
  for (const row of list) {
    if (canClass) row.activeClasses ??= 0;
    if (canEnrollment) row.operationalEnrollments ??= 0;
    if (canSchedule) row.completedSessions ??= 0;
    if (canAttendance && row.attendanceRate === undefined) row.attendanceRate = null;
    if (canCrm) {
      row.leadsCreated ??= 0;
      row.wonCount ??= 0;
      row.trialsCompleted ??= 0;
    }
    if (canFinance) {
      row.billedVnd ??= '0';
      row.outstandingVnd ??= '0';
    }
  }

  const sumMoney = (key: string) => list.reduce((total, row) => total + big(row[key]), 0n).toString();
  const summary: ReportRow = { branches: list.filter((row) => row.branchId !== null).length };
  if (canFinance) {
    summary.billedVnd = sumMoney('billedVnd');
    summary.outstandingVnd = sumMoney('outstandingVnd');
  }
  return {
    summary,
    columns,
    rows: list,
    paginated: false,
  };
}
