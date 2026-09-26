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
