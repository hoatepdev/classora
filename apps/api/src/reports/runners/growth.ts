import type { ReportContext, ReportResult, ReportRow } from '../report-filters.js';
import { pageParams, round2, serialize } from '../report-filters.js';
import { CSV_ROW_CAP } from '../report-csv.js';

// Cohort semantics: leads created in the window, evaluated at the report end
// boundary via lead_events reconstruction (CREATED writes to_status='NEW'), so
// an unrelated older lead won in the same period never enters the cohort math.
const statusAtSql = (param: string) => `COALESCE((SELECT ev.to_status FROM lead_events ev
  WHERE ev.tenant_id=l.tenant_id AND ev.lead_id=l.id AND ev.occurred_at < ${param}::timestamptz
  ORDER BY ev.occurred_at DESC, ev.id DESC LIMIT 1), 'NEW')`;

export async function crmPipelineReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope, database } = ctx;
  const f = scope.filters;
  const base = `
    FROM leads l
    WHERE l.tenant_id=$1 AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz
      AND ($4::text IS NULL OR l.source=$4)
      AND ($5::text IS NULL OR l.assigned_membership_id=$5)
      AND ($6::text IS NULL OR l.preferred_branch_id=$6)`;
  const values = [tenantId, scope.fromTs, scope.toTs, f.source ?? null, f.salesOwnerId ?? null, f.branchId ?? null];

  const { limit, offset } = pageParams(ctx);
  const [summary, bySource, byOwner, trials, detail] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS cohort,
             COUNT(*) FILTER (WHERE t.status_at='WON')::int AS won,
             COUNT(*) FILTER (WHERE t.status_at='LOST')::int AS lost,
             COUNT(*) FILTER (WHERE t.status_at NOT IN ('WON','LOST'))::int AS active,
             COUNT(*) FILTER (WHERE t.status_at='NEW')::int AS s_new,
             COUNT(*) FILTER (WHERE t.status_at='CONTACTED')::int AS s_contacted,
             COUNT(*) FILTER (WHERE t.status_at='QUALIFIED')::int AS s_qualified,
             COUNT(*) FILTER (WHERE t.status_at='TRIAL_BOOKED')::int AS s_trial_booked,
             COUNT(*) FILTER (WHERE t.status_at='TRIAL_COMPLETED')::int AS s_trial_completed
      FROM (SELECT ${statusAtSql('$3')} AS status_at ${base}) t`,
      values),
    pool.query(`
      SELECT l.source AS "source", COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ${statusAtSql('$3')}='WON')::int AS won,
             COUNT(*) FILTER (WHERE ${statusAtSql('$3')}='LOST')::int AS lost
      ${base} GROUP BY l.source ORDER BY total DESC, l.source`,
      values),
    pool.query(`
      SELECT l.assigned_membership_id AS "salesOwnerId", COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ${statusAtSql('$3')}='WON')::int AS won,
             COUNT(*) FILTER (WHERE ${statusAtSql('$3')}='LOST')::int AS lost
      ${base} GROUP BY l.assigned_membership_id ORDER BY total DESC${ctx.mode === 'export' ? ` LIMIT ${CSV_ROW_CAP + 1}` : ''}`,
      values),
    pool.query(`
      SELECT COUNT(*) FILTER (WHERE tb.status IN ('COMPLETED','NO_SHOW') AND tb.completed_at < $3::timestamptz AND tb.status='COMPLETED')::int AS completed,
             COUNT(*) FILTER (WHERE tb.status='NO_SHOW' AND tb.completed_at < $3::timestamptz)::int AS no_show,
             COUNT(*) FILTER (WHERE tb.status='CANCELLED' AND tb.cancelled_at < $3::timestamptz)::int AS cancelled,
             COUNT(*) FILTER (WHERE NOT ((tb.status IN ('COMPLETED','NO_SHOW') AND tb.completed_at < $3::timestamptz) OR (tb.status='CANCELLED' AND tb.cancelled_at < $3::timestamptz)))::int AS booked
      FROM trial_bookings tb
      JOIN leads l ON l.tenant_id=tb.tenant_id AND l.id=tb.lead_id
      WHERE tb.tenant_id=$1 AND tb.booked_at < $3::timestamptz
        AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz
        AND ($4::text IS NULL OR l.source=$4)
        AND ($5::text IS NULL OR l.assigned_membership_id=$5)
        AND ($6::text IS NULL OR l.preferred_branch_id=$6)`,
      values),
    pool.query(`
      SELECT l.student_name AS "lead", l.id AS "leadId", l.student_phone AS "phone",
             ${statusAtSql('$3')} AS "status", l.source AS "source",
             l.assigned_membership_id AS "salesOwnerId", l.created_at AS "createdAt",
             l.won_at AS "wonAt", l.lost_at AS "lostAt", COUNT(*) OVER()::int AS "__total"
      ${base}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $7 OFFSET $8`,
      [...values, limit, offset]),
  ]);

  const ownerIds = byOwner.rows.map((row) => row.salesOwnerId).filter(Boolean);
  const memberships = ownerIds.length
    ? await database.tenantMembership.findMany({ where: { tenantId, id: { in: ownerIds as string[] } }, select: { id: true, user: { select: { name: true } } } })
    : [];
  const names = new Map(memberships.map((membership) => [membership.id, membership.user?.name ?? null]));

  const s = summary.rows[0] ?? {};
  const cohort = Number(s.cohort ?? 0);
  const won = Number(s.won ?? 0);
  const rows = detail.rows.map((row) => serialize({ ...row, salesOwner: row.salesOwnerId ? names.get(row.salesOwnerId) ?? null : null })) as ReportRow[];
  const sourceColumns = [
    { key: 'source', label: 'Nguồn' },
    { key: 'total', label: 'Tiềm năng' },
    { key: 'won', label: 'Thắng' },
    { key: 'lost', label: 'Thua' },
    { key: 'wonRate', label: 'Tỷ lệ thắng (%)' },
  ];
  return {
    summary: {
      cohortSize: cohort,
      won,
      lost: Number(s.lost ?? 0),
      active: Number(s.active ?? 0),
      // Cohort won rate: cohort members WON by the report end / cohort size.
      cohortWonRate: cohort === 0 ? null : round2((won * 100) / cohort),
      pipeline: {
        NEW: Number(s.s_new ?? 0),
        CONTACTED: Number(s.s_contacted ?? 0),
        QUALIFIED: Number(s.s_qualified ?? 0),
        TRIAL_BOOKED: Number(s.s_trial_booked ?? 0),
        TRIAL_COMPLETED: Number(s.s_trial_completed ?? 0),
      },
      trialsBooked: Number(trials.rows[0]?.booked ?? 0),
      trialsCompleted: Number(trials.rows[0]?.completed ?? 0),
      trialsNoShow: Number(trials.rows[0]?.no_show ?? 0),
      trialsCancelled: Number(trials.rows[0]?.cancelled ?? 0),
    },
    breakdowns: [
      {
        name: 'Theo nguồn',
        columns: sourceColumns,
        rows: bySource.rows.map((row) => ({ source: row.source, total: row.total, won: row.won, lost: row.lost, wonRate: row.total === 0 ? null : round2((row.won * 100) / row.total) })),
      },
      {
        name: 'Theo người phụ trách',
        columns: [{ key: 'salesOwner', label: 'Người phụ trách' }, ...sourceColumns.slice(1, 4)],
        // Factual counts only — never a staff ranking.
        rows: byOwner.rows.map((row) => ({ salesOwner: row.salesOwnerId ? names.get(row.salesOwnerId) ?? '(không rõ)' : '(chưa gán)', total: row.total, won: row.won, lost: row.lost })),
      },
    ],
    columns: [
      { key: 'lead', label: 'Tiềm năng' },
      { key: 'phone', label: 'Điện thoại' },
      { key: 'status', label: 'Trạng thái' },
      { key: 'source', label: 'Nguồn' },
      { key: 'salesOwner', label: 'Người phụ trách' },
      { key: 'createdAt', label: 'Ngày tạo' },
      { key: 'wonAt', label: 'Ngày thắng' },
      { key: 'lostAt', label: 'Ngày thua' },
    ],
    rows,
    paginated: true,
    total: cohort,
  };
}
