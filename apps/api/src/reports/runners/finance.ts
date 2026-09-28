import type { ReportContext, ReportResult, ReportRow } from '../report-filters.js';
import { pageParams, serialize } from '../report-filters.js';
import { invoiceSelectAt } from '../../billing/billing-ledger.js';

const big = (value: unknown) => BigInt(String(value ?? 0));

// Monthly buckets are business-local (Asia/Ho_Chi_Minh), not UTC.
const HCM = `AT TIME ZONE 'Asia/Ho_Chi_Minh'`;

export async function financialSummaryReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope } = ctx;
  const student = scope.filters.studentId ?? null;
  const [gross, credits, collected, refunded, invoicesAt, grossByMonth, creditsByMonth, collectedByMonth, refundedByMonth] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(i.total_vnd),0)::text AS total FROM invoices i
       WHERE i.tenant_id=$1 AND i.created_at < $3::timestamptz AND ($4::text IS NULL OR i.student_id=$4)
         AND EXISTS (SELECT 1 FROM invoice_status_history h WHERE h.tenant_id=i.tenant_id AND h.invoice_id=i.id AND h.status='ISSUED'
           AND h.effective_at >= $2::timestamptz AND h.effective_at < $3::timestamptz)
         AND COALESCE((SELECT hs.status FROM invoice_status_history hs WHERE hs.tenant_id=i.tenant_id AND hs.invoice_id=i.id
               AND hs.effective_at < $3::timestamptz ORDER BY hs.effective_at DESC, hs.id DESC LIMIT 1), i.status) <> 'VOID'`,
      [tenantId, scope.fromTs, scope.toTs, student],
    ),
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(cn.amount_vnd),0)::text AS total FROM credit_notes cn
       JOIN invoices i ON i.tenant_id=cn.tenant_id AND i.id=cn.invoice_id
       WHERE cn.tenant_id=$1 AND cn.status='ISSUED' AND cn.issued_at >= $2::timestamptz AND cn.issued_at < $3::timestamptz
         AND ($4::text IS NULL OR i.student_id=$4)
         AND NOT EXISTS (SELECT 1 FROM credit_note_voids cv WHERE cv.tenant_id=cn.tenant_id AND cv.credit_note_id=cn.id AND cv.created_at < $3::timestamptz)`,
      [tenantId, scope.fromTs, scope.toTs, student],
    ),
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(p.amount_vnd),0)::text AS total FROM payments p
       WHERE p.tenant_id=$1 AND p.received_at >= $2::timestamptz AND p.received_at < $3::timestamptz
         AND ($4::text IS NULL OR p.student_id=$4)
         AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.tenant_id=p.tenant_id AND pr.payment_id=p.id AND pr.created_at < $3::timestamptz)`,
      [tenantId, scope.fromTs, scope.toTs, student],
    ),
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(rf.amount_vnd),0)::text AS total FROM refunds rf
       JOIN payments p ON p.tenant_id=rf.tenant_id AND p.id=rf.payment_id
       WHERE rf.tenant_id=$1 AND rf.created_at >= $2::timestamptz AND rf.created_at < $3::timestamptz
         AND ($4::text IS NULL OR p.student_id=$4)
         AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.tenant_id=p.tenant_id AND pr.payment_id=p.id AND pr.created_at < $3::timestamptz)`,
      [tenantId, scope.fromTs, scope.toTs, student],
    ),
    pool.query(`${invoiceSelectAt('$2', '<')} WHERE i.tenant_id=$1 AND i.created_at < $2::timestamptz AND ($3::text IS NULL OR i.student_id=$3)`, [tenantId, scope.toTs, student]),
    pool.query<{ month: string; total: string }>(
      `SELECT to_char(h.effective_at ${HCM}, 'YYYY-MM') AS month, SUM(i.total_vnd)::text AS total FROM invoices i
       JOIN invoice_status_history h ON h.tenant_id=i.tenant_id AND h.invoice_id=i.id AND h.status='ISSUED'
       WHERE i.tenant_id=$1 AND h.effective_at >= $2::timestamptz AND h.effective_at < $3::timestamptz
         AND ($4::text IS NULL OR i.student_id=$4)
         AND COALESCE((SELECT hs.status FROM invoice_status_history hs WHERE hs.tenant_id=i.tenant_id AND hs.invoice_id=i.id
               AND hs.effective_at < $3::timestamptz ORDER BY hs.effective_at DESC, hs.id DESC LIMIT 1), i.status) <> 'VOID'
       GROUP BY 1`,
      [tenantId, scope.fromTs, scope.toTs, student],
    ),
    pool.query<{ month: string; total: string }>(
      `SELECT to_char(cn.issued_at ${HCM}, 'YYYY-MM') AS month, SUM(cn.amount_vnd)::text AS total FROM credit_notes cn
       JOIN invoices i ON i.tenant_id=cn.tenant_id AND i.id=cn.invoice_id
       WHERE cn.tenant_id=$1 AND cn.status='ISSUED' AND cn.issued_at >= $2::timestamptz AND cn.issued_at < $3::timestamptz
         AND ($4::text IS NULL OR i.student_id=$4)
         AND NOT EXISTS (SELECT 1 FROM credit_note_voids cv WHERE cv.tenant_id=cn.tenant_id AND cv.credit_note_id=cn.id AND cv.created_at < $3::timestamptz)
       GROUP BY 1`,
      [tenantId, scope.fromTs, scope.toTs, student],
    ),
    pool.query<{ month: string; total: string }>(
      `SELECT to_char(p.received_at ${HCM}, 'YYYY-MM') AS month, SUM(p.amount_vnd)::text AS total FROM payments p
       WHERE p.tenant_id=$1 AND p.received_at >= $2::timestamptz AND p.received_at < $3::timestamptz
         AND ($4::text IS NULL OR p.student_id=$4)
         AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.tenant_id=p.tenant_id AND pr.payment_id=p.id AND pr.created_at < $3::timestamptz)
       GROUP BY 1`,
      [tenantId, scope.fromTs, scope.toTs, student],
    ),
    pool.query<{ month: string; total: string }>(
      `SELECT to_char(rf.created_at ${HCM}, 'YYYY-MM') AS month, SUM(rf.amount_vnd)::text AS total FROM refunds rf
       JOIN payments p ON p.tenant_id=rf.tenant_id AND p.id=rf.payment_id
       WHERE rf.tenant_id=$1 AND rf.created_at >= $2::timestamptz AND rf.created_at < $3::timestamptz
         AND ($4::text IS NULL OR p.student_id=$4)
         AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.tenant_id=p.tenant_id AND pr.payment_id=p.id AND pr.created_at < $3::timestamptz)
       GROUP BY 1`,
      [tenantId, scope.fromTs, scope.toTs, student],
    ),
  ]);

  let outstanding = 0n;
  for (const row of invoicesAt.rows) {
    if ((row.statusAt ?? row.status) !== 'ISSUED') continue;
    const balance = big(row.total_vnd) - big(row.credit_vnd) - big(row.paid_vnd);
    if (balance > 0n) outstanding += balance;
  }

  const grossTotal = big(gross.rows[0]?.total);
  const creditTotal = big(credits.rows[0]?.total);
  const collectedTotal = big(collected.rows[0]?.total);
  const refundedTotal = big(refunded.rows[0]?.total);

  const months = new Map<string, { gross: bigint; credits: bigint; collected: bigint; refunds: bigint }>();
  const bucket = (month: string) => months.get(month) ?? { gross: 0n, credits: 0n, collected: 0n, refunds: 0n };
  for (const row of grossByMonth.rows) { const b = bucket(row.month); b.gross = big(row.total); months.set(row.month, b); }
  for (const row of creditsByMonth.rows) { const b = bucket(row.month); b.credits = big(row.total); months.set(row.month, b); }
  for (const row of collectedByMonth.rows) { const b = bucket(row.month); b.collected = big(row.total); months.set(row.month, b); }
  for (const row of refundedByMonth.rows) { const b = bucket(row.month); b.refunds = big(row.total); months.set(row.month, b); }

  return {
    summary: {
      grossBilledVnd: grossTotal.toString(),
      creditNotesVnd: creditTotal.toString(),
      netBilledVnd: (grossTotal - creditTotal).toString(),
      collectedVnd: collectedTotal.toString(),
      refundedVnd: refundedTotal.toString(),
      netCashVnd: (collectedTotal - refundedTotal).toString(),
      outstandingAsOfToVnd: outstanding.toString(),
    },
    breakdowns: [{
      name: 'Theo tháng',
      columns: [
        { key: 'month', label: 'Tháng' },
        { key: 'netBilledVnd', label: 'Doanh thu thuần' },
        { key: 'collectedVnd', label: 'Đã thu' },
        { key: 'refundsVnd', label: 'Hoàn tiền' },
      ],
      rows: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, b]) => ({
        month,
        netBilledVnd: (b.gross - b.credits).toString(),
        collectedVnd: b.collected.toString(),
        refundsVnd: b.refunds.toString(),
      })),
    }],
    columns: [],
    rows: [],
    paginated: false,
  };
}

const bucketSql = (alias: string, toParam: string) => `CASE WHEN ${alias}.due_date IS NULL OR (${toParam}::date - ${alias}.due_date) <= 0 THEN 'Current'
  WHEN (${toParam}::date - ${alias}.due_date) <= 30 THEN '1-30'
  WHEN (${toParam}::date - ${alias}.due_date) <= 60 THEN '31-60'
  ELSE '61+' END`;

export async function receivablesAgingReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope } = ctx;
  const { limit, offset } = pageParams(ctx);
  const outstandingExpr = `(inv.total_vnd - COALESCE(inv.paid_vnd,0) - COALESCE(inv.credit_vnd,0))`;
  const where = `inv.tenant_id=$1 AND inv.created_at < $2::timestamptz
    AND COALESCE(inv."statusAt", inv.status) = 'ISSUED'
    AND ${outstandingExpr} > 0`;

  const [buckets, detail] = await Promise.all([
    pool.query<{ bucket: string; count: number; total: string }>(
      `SELECT ${bucketSql('inv', '$3')} AS bucket, COUNT(*)::int AS count, SUM(${outstandingExpr})::text AS total
       FROM (${invoiceSelectAt('$2', '<')}) inv WHERE ${where} GROUP BY 1`,
      [tenantId, scope.toTs, scope.to],
    ),
    pool.query(
      `SELECT inv.invoice_number AS "invoiceNumber", inv."studentName" AS "student", inv.due_date::text AS "dueDate",
              ${outstandingExpr}::text AS "outstandingVnd",
              CASE WHEN inv.due_date IS NULL THEN NULL ELSE ($3::date - inv.due_date) END::int AS "daysOverdue",
              ${bucketSql('inv', '$3')} AS "bucket", COUNT(*) OVER()::int AS "__total"
       FROM (${invoiceSelectAt('$2', '<')}) inv WHERE ${where}
       ORDER BY inv.due_date NULLS FIRST, inv.id
       LIMIT $4 OFFSET $5`,
      [tenantId, scope.toTs, scope.to, limit, offset],
    ),
  ]);

  const rows = detail.rows.map((row) => serialize(row as Record<string, unknown>)) as ReportRow[];
  const summary: ReportRow = { totalOutstandingVnd: '0', invoices: rows.length ? Number(detail.rows[0]?.__total ?? 0) : 0, bucketCurrentVnd: '0', bucket1to30Vnd: '0', bucket31to60Vnd: '0', bucket61plusVnd: '0' };
  let total = 0n;
  for (const row of buckets.rows) {
    total += big(row.total);
    if (row.bucket === 'Current') summary.bucketCurrentVnd = row.total;
    else if (row.bucket === '1-30') summary.bucket1to30Vnd = row.total;
    else if (row.bucket === '31-60') summary.bucket31to60Vnd = row.total;
    else summary.bucket61plusVnd = row.total;
  }
  summary.totalOutstandingVnd = total.toString();
  return {
    summary,
    columns: [
      { key: 'invoiceNumber', label: 'Hóa đơn' },
      { key: 'student', label: 'Học viên' },
      { key: 'dueDate', label: 'Ngày đến hạn' },
      { key: 'outstandingVnd', label: 'Còn phải thu' },
      { key: 'daysOverdue', label: 'Số ngày quá hạn' },
      { key: 'bucket', label: 'Nhóm tuổi nợ' },
    ],
    rows,
    paginated: true,
    total: buckets.rows.reduce((sum, row) => sum + Number(row.count), 0),
  };
}

export async function paymentsReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope } = ctx;
  const f = scope.filters;
  const { limit, offset } = pageParams(ctx);
  const reversedAt = `EXISTS(SELECT 1 FROM payment_reversals pr WHERE pr.tenant_id=p.tenant_id AND pr.payment_id=p.id AND pr.created_at < $3::timestamptz)`;
  const [summary, detail] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(p.amount_vnd),0)::text AS "amountVnd",
             COALESCE(SUM(CASE WHEN ${reversedAt} THEN 0 ELSE p.amount_vnd END),0)::text AS "effectiveVnd",
             COUNT(*) FILTER (WHERE ${reversedAt})::int AS "reversedCount"
      FROM payments p
      WHERE p.tenant_id=$1 AND p.received_at >= $2::timestamptz AND p.received_at < $3::timestamptz
        AND ($4::text IS NULL OR p.student_id=$4)
        AND ($5::text IS NULL OR ${reversedAt} = ($5::text = 'REVERSED'))`,
      [tenantId, scope.fromTs, scope.toTs, f.studentId ?? null, f.status ?? null]),
    pool.query(`
      SELECT p.received_at AS "receivedAt", s.full_name AS "student", p.method AS "method",
             p.amount_vnd::text AS "amountVnd",
             (COALESCE((SELECT SUM(pa.amount_vnd) FROM payment_allocations pa WHERE pa.tenant_id=p.tenant_id AND pa.payment_id=p.id AND pa.created_at < $3::timestamptz),0)
              - COALESCE((SELECT SUM(ra.amount_vnd) FROM refund_allocations ra
                JOIN refunds rf ON rf.tenant_id=ra.tenant_id AND rf.id=ra.refund_id
                JOIN payment_allocations pa ON pa.tenant_id=ra.tenant_id AND pa.id=ra.payment_allocation_id
                WHERE pa.payment_id=p.id AND ra.created_at < $3::timestamptz),0))::text AS "allocatedVnd",
             COALESCE((SELECT SUM(rf.amount_vnd) FROM refunds rf WHERE rf.tenant_id=p.tenant_id AND rf.payment_id=p.id AND rf.created_at < $3::timestamptz),0)::text AS "refundedVnd",
             CASE WHEN ${reversedAt} THEN 'REVERSED' ELSE 'RECORDED' END AS "status",
             p.reference AS "reference", COUNT(*) OVER()::int AS "__total"
      FROM payments p
      LEFT JOIN students s ON s.tenant_id=p.tenant_id AND s.id=p.student_id
      WHERE p.tenant_id=$1 AND p.received_at >= $2::timestamptz AND p.received_at < $3::timestamptz
        AND ($4::text IS NULL OR p.student_id=$4)
        AND ($5::text IS NULL OR ${reversedAt} = ($5::text = 'REVERSED'))
      ORDER BY p.received_at DESC, p.id DESC
      LIMIT $6 OFFSET $7`,
      [tenantId, scope.fromTs, scope.toTs, f.studentId ?? null, f.status ?? null, limit, offset]),
  ]);

  const rows: ReportRow[] = detail.rows.map((row) => {
    const serialized = serialize(row as Record<string, unknown>);
    serialized.unallocatedVnd = (big(row.amountVnd) - big(row.allocatedVnd) - big(row.refundedVnd)).toString();
    return serialized;
  });
  const s = summary.rows[0] ?? {};
  return {
    summary: {
      payments: s.count ?? 0,
      amountVnd: s.amountVnd ?? '0',
      effectiveVnd: s.effectiveVnd ?? '0',
      reversedCount: s.reversedCount ?? 0,
    },
    columns: [
      { key: 'receivedAt', label: 'Ngày thu' },
      { key: 'student', label: 'Học viên' },
      { key: 'method', label: 'Phương thức' },
      { key: 'amountVnd', label: 'Số tiền' },
      { key: 'allocatedVnd', label: 'Đã phân bổ' },
      { key: 'unallocatedVnd', label: 'Chưa phân bổ' },
      { key: 'status', label: 'Trạng thái' },
      { key: 'refundedVnd', label: 'Đã hoàn' },
      { key: 'reference', label: 'Tham chiếu' },
    ],
    rows,
    paginated: true,
    total: Number(s.count ?? 0),
  };
}
