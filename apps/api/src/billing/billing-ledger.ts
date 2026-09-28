// Effective-ledger SQL shared by billing queries and communication dispatch.
// Kept in its own module to avoid import cycles between services.

export const ledgerPaidSql = `COALESCE((SELECT SUM(pa.amount_vnd)
  FROM payment_allocations pa
  JOIN payments p ON p.tenant_id = pa.tenant_id AND p.id = pa.payment_id
  WHERE pa.tenant_id = i.tenant_id AND pa.invoice_id = i.id
    AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.tenant_id = p.tenant_id AND pr.payment_id = p.id)), 0)
  - COALESCE((SELECT SUM(ra.amount_vnd)
  FROM refund_allocations ra
  JOIN payment_allocations pa
    ON pa.tenant_id = ra.tenant_id AND pa.id = ra.payment_allocation_id
  JOIN refunds rf
    ON rf.tenant_id = ra.tenant_id AND rf.id = ra.refund_id
  WHERE ra.tenant_id = i.tenant_id AND pa.invoice_id = i.id
    AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.tenant_id = rf.tenant_id AND pr.payment_id = rf.payment_id)), 0)`;

export const ledgerCreditSql = `COALESCE((SELECT SUM(cn.amount_vnd) FROM credit_notes cn
  WHERE cn.tenant_id = i.tenant_id AND cn.invoice_id = i.id AND cn.status = 'ISSUED'
    AND NOT EXISTS (SELECT 1 FROM credit_note_voids cv WHERE cv.tenant_id = cn.tenant_id AND cv.credit_note_id = cn.id)), 0)`;

// Historical/as-of ledger projection: every ledger fact uses the caller's
// inclusive or exclusive boundary, so later reversals, refunds, voids, or
// status changes never corrupt an earlier as-of view.
export const invoiceSelectAt = (asOfPlaceholder: string, boundary: '<' | '<=' = '<=') => `WITH historical_refunds AS (
  SELECT pa.tenant_id, pa.invoice_id, SUM(ra.amount_vnd) AS amount_vnd
  FROM refund_allocations ra
  JOIN payment_allocations pa ON pa.tenant_id = ra.tenant_id AND pa.id = ra.payment_allocation_id
  JOIN refunds rf ON rf.tenant_id = ra.tenant_id AND rf.id = ra.refund_id
  WHERE ra.created_at ${boundary} ${asOfPlaceholder}::timestamptz
    AND NOT EXISTS (SELECT 1 FROM payment_reversals pr
      WHERE pr.tenant_id = rf.tenant_id AND pr.payment_id = rf.payment_id
        AND pr.created_at ${boundary} ${asOfPlaceholder}::timestamptz)
  GROUP BY pa.tenant_id, pa.invoice_id
), historical_gross_paid AS (
  SELECT pa.tenant_id, pa.invoice_id, SUM(pa.amount_vnd) AS amount_vnd
  FROM payment_allocations pa
  JOIN payments p ON p.tenant_id = pa.tenant_id AND p.id = pa.payment_id
  WHERE pa.created_at ${boundary} ${asOfPlaceholder}::timestamptz
    AND NOT EXISTS (SELECT 1 FROM payment_reversals pr
      WHERE pr.tenant_id = p.tenant_id AND pr.payment_id = p.id
        AND pr.created_at ${boundary} ${asOfPlaceholder}::timestamptz)
  GROUP BY pa.tenant_id, pa.invoice_id
), historical_paid AS (
  SELECT gp.tenant_id, gp.invoice_id, gp.amount_vnd - COALESCE(hr.amount_vnd, 0) AS amount_vnd
  FROM historical_gross_paid gp
  LEFT JOIN historical_refunds hr ON hr.tenant_id = gp.tenant_id AND hr.invoice_id = gp.invoice_id
), historical_credit AS (
  SELECT cn.tenant_id, cn.invoice_id, SUM(cn.amount_vnd) AS amount_vnd
  FROM credit_notes cn
  WHERE cn.status = 'ISSUED' AND cn.issued_at ${boundary} ${asOfPlaceholder}::timestamptz
    AND NOT EXISTS (SELECT 1 FROM credit_note_voids cv
      WHERE cv.tenant_id = cn.tenant_id AND cv.credit_note_id = cn.id
        AND cv.created_at ${boundary} ${asOfPlaceholder}::timestamptz)
  GROUP BY cn.tenant_id, cn.invoice_id
), historical_status AS (
  SELECT DISTINCT ON (h.tenant_id, h.invoice_id)
         h.tenant_id, h.invoice_id, h.status
  FROM invoice_status_history h
  WHERE h.effective_at ${boundary} ${asOfPlaceholder}::timestamptz
  ORDER BY h.tenant_id, h.invoice_id, h.effective_at DESC, h.id DESC
)
SELECT i.*, s.full_name AS "studentName", i.total_vnd AS "totalVnd", i.student_id AS "studentId", i.due_date AS "dueDate",
       COALESCE(hp.amount_vnd, 0) AS paid_vnd, COALESCE(hc.amount_vnd, 0) AS credit_vnd, COALESCE(hs.status, 'DRAFT') AS "statusAt"
FROM invoices i
LEFT JOIN students s ON s.tenant_id = i.tenant_id AND s.id = i.student_id
LEFT JOIN historical_paid hp ON hp.tenant_id = i.tenant_id AND hp.invoice_id = i.id
LEFT JOIN historical_credit hc ON hc.tenant_id = i.tenant_id AND hc.invoice_id = i.id
LEFT JOIN historical_status hs ON hs.tenant_id = i.tenant_id AND hs.invoice_id = i.id`;

const amount = (value: unknown) => BigInt(String(value ?? 0));

export function invoiceBalance(status: string, total: unknown, credit: unknown, paid: unknown, dueDate: unknown, now = Date.now()) {
  const totalVnd = amount(total);
  const creditVnd = amount(credit);
  const paidVnd = amount(paid);
  const outstandingVnd = totalVnd - creditVnd - paidVnd;
  let effectiveStatus = status;
  if (status === 'VOID') effectiveStatus = 'VOID';
  else if (paidVnd >= totalVnd - creditVnd) effectiveStatus = 'PAID';
  else if (paidVnd > 0n) effectiveStatus = 'PARTIALLY_PAID';
  else if (status === 'ISSUED' && dueDate && new Date(String(dueDate)).getTime() < now) effectiveStatus = 'OVERDUE';
  return { paidVnd: paidVnd.toString(), creditVnd: creditVnd.toString(), outstandingVnd: outstandingVnd.toString(), effectiveStatus };
}
