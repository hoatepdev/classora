-- LOCAL-08: issue-time numbering, customer-linked payments, and ledger invariants.

ALTER TABLE enrollment_pricing ALTER COLUMN locked_at DROP NOT NULL;
ALTER TABLE enrollment_pricing ALTER COLUMN locked_at DROP DEFAULT;
UPDATE enrollment_pricing ep
SET locked_at = CASE
  WHEN EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.tenant_id = ep.tenant_id
      AND i.enrollment_id = ep.enrollment_id
      AND i.status IN ('ISSUED', 'VOID')
  ) THEN ep.locked_at
  ELSE NULL
END;

ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;
ALTER TABLE credit_notes ALTER COLUMN credit_note_number DROP NOT NULL;
ALTER TABLE credit_notes ALTER COLUMN status SET DEFAULT 'DRAFT';
ALTER TABLE credit_notes ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX credit_notes_tenant_idempotency_key_idx ON credit_notes (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE credit_note_voids (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  credit_note_id CHAR(26) NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  actor_user_id CHAR(26),
  actor_membership_id CHAR(26),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT credit_note_voids_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT credit_note_voids_credit_note_fkey FOREIGN KEY (tenant_id, credit_note_id) REFERENCES credit_notes (tenant_id, id),
  CONSTRAINT credit_note_voids_one_per_note_key UNIQUE (tenant_id, credit_note_id),
  CONSTRAINT credit_note_voids_idempotency_key UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX credit_note_voids_lookup_idx ON credit_note_voids (tenant_id, credit_note_id, id);

ALTER TABLE payments ADD COLUMN idempotency_key TEXT;
ALTER TABLE payment_reversals ADD COLUMN idempotency_key TEXT;
ALTER TABLE payment_allocations ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX payments_tenant_idempotency_key_idx ON payments (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX payment_reversals_tenant_idempotency_key_idx ON payment_reversals (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX payment_allocations_tenant_idempotency_key_idx ON payment_allocations (tenant_id, payment_id, invoice_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE billing_sequences (
  tenant_id CHAR(26) NOT NULL,
  sequence_key TEXT NOT NULL,
  next_value BIGINT NOT NULL DEFAULT 1 CHECK (next_value > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT billing_sequences_tenant_key PRIMARY KEY (tenant_id, sequence_key)
);

INSERT INTO billing_sequences (tenant_id, sequence_key, next_value)
SELECT tenant_id, 'INVOICE',
       COALESCE(MAX((substring(invoice_number FROM '^INV-([0-9]+)$'))::BIGINT), 0) + 1
FROM invoices
GROUP BY tenant_id;

INSERT INTO billing_sequences (tenant_id, sequence_key, next_value)
SELECT tenant_id, 'CREDIT_NOTE',
       COALESCE(MAX((substring(credit_note_number FROM '^CN-([0-9]+)$'))::BIGINT), 0) + 1
FROM credit_notes
WHERE credit_note_number IS NOT NULL
GROUP BY tenant_id;

CREATE TABLE invoice_discount_snapshots (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  invoice_id CHAR(26) NOT NULL,
  enrollment_discount_id CHAR(26),
  discount_id CHAR(26),
  code TEXT,
  name TEXT,
  kind TEXT,
  value BIGINT,
  max_amount_vnd BIGINT,
  amount_vnd BIGINT NOT NULL CHECK (amount_vnd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT invoice_discount_snapshots_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT invoice_discount_snapshots_invoice_fkey FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoices (tenant_id, id),
  CONSTRAINT invoice_discount_snapshots_enrollment_discount_fkey FOREIGN KEY (tenant_id, enrollment_discount_id) REFERENCES enrollment_discounts (tenant_id, id),
  CONSTRAINT invoice_discount_snapshots_discount_fkey FOREIGN KEY (tenant_id, discount_id) REFERENCES discounts (tenant_id, id),
  CONSTRAINT invoice_discount_snapshots_kind_check CHECK (kind IS NULL OR kind IN ('PERCENTAGE','FIXED'))
);
CREATE INDEX invoice_discount_snapshots_invoice_idx ON invoice_discount_snapshots (tenant_id, invoice_id, id);

CREATE OR REPLACE FUNCTION prevent_invoice_discount_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'invoice discount snapshots are append-only';
END;
$$;
CREATE TRIGGER invoice_discount_snapshots_append_only
BEFORE UPDATE OR DELETE ON invoice_discount_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_invoice_discount_snapshot_mutation();
CREATE TRIGGER invoice_discount_snapshots_no_truncate
BEFORE TRUNCATE ON invoice_discount_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION prevent_invoice_discount_snapshot_mutation();

CREATE TABLE refund_allocations (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  refund_id CHAR(26) NOT NULL,
  payment_allocation_id CHAR(26) NOT NULL,
  amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT refund_allocations_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT refund_allocations_refund_fkey FOREIGN KEY (tenant_id, refund_id) REFERENCES refunds (tenant_id, id),
  CONSTRAINT refund_allocations_payment_allocation_fkey FOREIGN KEY (tenant_id, payment_allocation_id) REFERENCES payment_allocations (tenant_id, id),
  CONSTRAINT refund_allocations_unique_key UNIQUE (tenant_id, refund_id, payment_allocation_id)
);
CREATE INDEX refund_allocations_invoice_lookup_idx
  ON refund_allocations (tenant_id, payment_allocation_id, id);

WITH refund_ranges AS (
  SELECT r.tenant_id, r.id AS refund_id, r.payment_id, r.amount_vnd,
         COALESCE(SUM(r.amount_vnd) OVER (
           PARTITION BY r.tenant_id, r.payment_id
           ORDER BY r.created_at, r.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0) AS refund_start
  FROM refunds r
), allocation_ranges AS (
  SELECT pa.tenant_id, pa.id AS payment_allocation_id, pa.payment_id, pa.amount_vnd,
         COALESCE(SUM(pa.amount_vnd) OVER (
           PARTITION BY pa.tenant_id, pa.payment_id
           ORDER BY pa.created_at, pa.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0) AS allocation_start
  FROM payment_allocations pa
), matched AS (
  SELECT r.tenant_id, r.refund_id, a.payment_allocation_id,
         GREATEST(
           0::BIGINT,
           LEAST(r.refund_start + r.amount_vnd, a.allocation_start + a.amount_vnd)
           - GREATEST(r.refund_start, a.allocation_start)
         ) AS amount_vnd
  FROM refund_ranges r
  JOIN allocation_ranges a
    ON a.tenant_id = r.tenant_id
   AND a.payment_id = r.payment_id
)
INSERT INTO refund_allocations (id, tenant_id, refund_id, payment_allocation_id, amount_vnd)
SELECT substr(md5(tenant_id || refund_id || payment_allocation_id), 1, 26),
       tenant_id, refund_id, payment_allocation_id, amount_vnd
FROM matched
WHERE amount_vnd > 0;

CREATE OR REPLACE FUNCTION validate_refund_allocation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  refund_amount BIGINT;
  allocated_amount BIGINT;
  payment_allocation_amount BIGINT;
BEGIN
  SELECT amount_vnd INTO refund_amount
  FROM refunds WHERE tenant_id = NEW.tenant_id AND id = NEW.refund_id FOR UPDATE;
  SELECT amount_vnd INTO payment_allocation_amount
  FROM payment_allocations
  WHERE tenant_id = NEW.tenant_id AND id = NEW.payment_allocation_id FOR UPDATE;
  SELECT COALESCE(SUM(amount_vnd), 0) INTO allocated_amount
  FROM refund_allocations
  WHERE tenant_id = NEW.tenant_id
    AND refund_id = NEW.refund_id
    AND id <> NEW.id;
  IF refund_amount IS NULL OR payment_allocation_amount IS NULL
     OR allocated_amount + NEW.amount_vnd > refund_amount THEN
    RAISE EXCEPTION 'refund allocations exceed refund amount';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER refund_allocations_validate
BEFORE INSERT OR UPDATE ON refund_allocations
FOR EACH ROW EXECUTE FUNCTION validate_refund_allocation();

CREATE OR REPLACE FUNCTION prevent_refund_allocation_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'refund allocations are append-only';
END;
$$;
CREATE TRIGGER refund_allocations_append_only
BEFORE UPDATE OR DELETE ON refund_allocations
FOR EACH ROW EXECUTE FUNCTION prevent_refund_allocation_mutation();
CREATE TRIGGER refund_allocations_no_truncate
BEFORE TRUNCATE ON refund_allocations
FOR EACH STATEMENT EXECUTE FUNCTION prevent_refund_allocation_mutation();

ALTER TABLE payments ADD COLUMN student_id CHAR(26);
UPDATE payments p
SET student_id = i.student_id
FROM invoices i
WHERE i.tenant_id = p.tenant_id
  AND i.id = p.invoice_id
  AND p.student_id IS NULL;
ALTER TABLE payments ADD CONSTRAINT payments_tenant_student_fkey
  FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id);
CREATE INDEX payments_tenant_student_date_idx
  ON payments (tenant_id, student_id, received_at, id);

CREATE OR REPLACE FUNCTION prevent_issued_invoice_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('ISSUED', 'VOID') THEN
    IF OLD.status = 'ISSUED'
       AND NEW.status = 'VOID'
       AND NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number
       AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id
       AND NEW.enrollment_id IS NOT DISTINCT FROM OLD.enrollment_id
       AND NEW.pricing_plan_id IS NOT DISTINCT FROM OLD.pricing_plan_id
       AND NEW.issue_date IS NOT DISTINCT FROM OLD.issue_date
       AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
       AND NEW.subtotal_vnd IS NOT DISTINCT FROM OLD.subtotal_vnd
       AND NEW.discount_vnd IS NOT DISTINCT FROM OLD.discount_vnd
       AND NEW.total_vnd IS NOT DISTINCT FROM OLD.total_vnd
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
       AND NEW.voided_at IS DISTINCT FROM OLD.voided_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'issued invoices are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_issued_immutable
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION prevent_issued_invoice_mutation();

CREATE OR REPLACE FUNCTION prevent_issued_invoice_item_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE invoice_status TEXT;
BEGIN
  SELECT status INTO invoice_status
  FROM invoices
  WHERE tenant_id = COALESCE(OLD.tenant_id, NEW.tenant_id)
    AND id = COALESCE(OLD.invoice_id, NEW.invoice_id);
  IF invoice_status IN ('ISSUED', 'VOID') THEN
    RAISE EXCEPTION 'issued invoice items are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER invoice_items_issued_immutable
BEFORE UPDATE OR DELETE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION prevent_issued_invoice_item_mutation();

CREATE OR REPLACE FUNCTION validate_payment_allocation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  payment_amount BIGINT;
  allocated_amount BIGINT;
  invoice_total BIGINT;
  invoice_status TEXT;
  invoice_credit BIGINT;
  invoice_paid BIGINT;
BEGIN
  SELECT amount_vnd INTO payment_amount
  FROM payments
  WHERE tenant_id = NEW.tenant_id AND id = NEW.payment_id
  FOR UPDATE;
  IF payment_amount IS NULL THEN
    RAISE EXCEPTION 'payment not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM payment_reversals
    WHERE tenant_id = NEW.tenant_id AND payment_id = NEW.payment_id
  ) THEN
    RAISE EXCEPTION 'reversed payments cannot receive allocations';
  END IF;

  SELECT COALESCE(SUM(amount_vnd), 0) INTO allocated_amount
  FROM payment_allocations
  WHERE tenant_id = NEW.tenant_id
    AND payment_id = NEW.payment_id
    AND id <> NEW.id;
  IF allocated_amount + NEW.amount_vnd > payment_amount THEN
    RAISE EXCEPTION 'payment allocations exceed payment amount';
  END IF;

  SELECT total_vnd, status INTO invoice_total, invoice_status
  FROM invoices
  WHERE tenant_id = NEW.tenant_id AND id = NEW.invoice_id
  FOR UPDATE;
  IF invoice_total IS NULL THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;
  IF invoice_status <> 'ISSUED' THEN
    RAISE EXCEPTION 'only issued invoices can receive allocations';
  END IF;

  SELECT COALESCE(SUM(cn.amount_vnd), 0) INTO invoice_credit
  FROM credit_notes cn
  WHERE cn.tenant_id = NEW.tenant_id
    AND cn.invoice_id = NEW.invoice_id
    AND cn.status = 'ISSUED'
    AND NOT EXISTS (
      SELECT 1 FROM credit_note_voids cv
      WHERE cv.tenant_id = cn.tenant_id AND cv.credit_note_id = cn.id
    );
  SELECT COALESCE(SUM(pa.amount_vnd), 0) - COALESCE((
    SELECT SUM(ra.amount_vnd)
    FROM refund_allocations ra
    JOIN refunds rf
      ON rf.tenant_id = ra.tenant_id AND rf.id = ra.refund_id
    WHERE ra.tenant_id = NEW.tenant_id
      AND ra.payment_allocation_id IN (
        SELECT existing.id
        FROM payment_allocations existing
        WHERE existing.tenant_id = NEW.tenant_id
          AND existing.invoice_id = NEW.invoice_id
          AND existing.id <> NEW.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM payment_reversals pr
        WHERE pr.tenant_id = rf.tenant_id AND pr.payment_id = rf.payment_id
      )
  ), 0) INTO invoice_paid
  FROM payment_allocations pa
  JOIN payments p ON p.tenant_id = pa.tenant_id AND p.id = pa.payment_id
  WHERE pa.tenant_id = NEW.tenant_id
    AND pa.invoice_id = NEW.invoice_id
    AND pa.id <> NEW.id
    AND NOT EXISTS (
      SELECT 1 FROM payment_reversals pr
      WHERE pr.tenant_id = p.tenant_id AND pr.payment_id = p.id
    );
  IF invoice_paid + NEW.amount_vnd > invoice_total - invoice_credit THEN
    RAISE EXCEPTION 'invoice allocations exceed net due';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_allocations_validate
BEFORE INSERT OR UPDATE ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION validate_payment_allocation();

CREATE OR REPLACE FUNCTION prevent_payment_allocation_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment allocations are append-only';
END;
$$;

CREATE TRIGGER payment_allocations_append_only
BEFORE UPDATE OR DELETE ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION prevent_payment_allocation_mutation();
CREATE TRIGGER payment_allocations_no_truncate
BEFORE TRUNCATE ON payment_allocations
FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_allocation_mutation();

CREATE OR REPLACE FUNCTION validate_refund_allocation_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  refund_amount BIGINT;
  refund_payment_id CHAR(26);
  allocation_payment_id CHAR(26);
  payment_allocation_amount BIGINT;
  refund_total BIGINT;
  allocation_total BIGINT;
BEGIN
  SELECT r.amount_vnd, r.payment_id
    INTO refund_amount, refund_payment_id
  FROM refunds r
  WHERE r.tenant_id = NEW.tenant_id AND r.id = NEW.refund_id
  FOR UPDATE;

  SELECT pa.amount_vnd, pa.payment_id
    INTO payment_allocation_amount, allocation_payment_id
  FROM payment_allocations pa
  WHERE pa.tenant_id = NEW.tenant_id AND pa.id = NEW.payment_allocation_id
  FOR UPDATE;

  SELECT COALESCE(SUM(ra.amount_vnd), 0)
    INTO refund_total
  FROM refund_allocations ra
  WHERE ra.tenant_id = NEW.tenant_id
    AND ra.refund_id = NEW.refund_id
    AND ra.id <> NEW.id;

  SELECT COALESCE(SUM(ra.amount_vnd), 0)
    INTO allocation_total
  FROM refund_allocations ra
  WHERE ra.tenant_id = NEW.tenant_id
    AND ra.payment_allocation_id = NEW.payment_allocation_id
    AND ra.id <> NEW.id;

  IF refund_amount IS NULL
     OR payment_allocation_amount IS NULL
     OR refund_payment_id IS DISTINCT FROM allocation_payment_id
     OR refund_total + NEW.amount_vnd > refund_amount
     OR allocation_total + NEW.amount_vnd > payment_allocation_amount THEN
    RAISE EXCEPTION 'refund allocation exceeds available balance';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refund_allocations_validate ON refund_allocations;
CREATE TRIGGER refund_allocations_validate
BEFORE INSERT OR UPDATE ON refund_allocations
FOR EACH ROW EXECUTE FUNCTION validate_refund_allocation_balance();

CREATE OR REPLACE FUNCTION prevent_financial_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER payment_reversals_append_only
BEFORE UPDATE OR DELETE ON payment_reversals
FOR EACH ROW EXECUTE FUNCTION prevent_financial_ledger_mutation();
CREATE TRIGGER payment_reversals_no_truncate
BEFORE TRUNCATE ON payment_reversals
FOR EACH STATEMENT EXECUTE FUNCTION prevent_financial_ledger_mutation();

CREATE TRIGGER refunds_append_only
BEFORE UPDATE OR DELETE ON refunds
FOR EACH ROW EXECUTE FUNCTION prevent_financial_ledger_mutation();
CREATE TRIGGER refunds_no_truncate
BEFORE TRUNCATE ON refunds
FOR EACH STATEMENT EXECUTE FUNCTION prevent_financial_ledger_mutation();

CREATE OR REPLACE FUNCTION prevent_credit_note_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'DRAFT'
     AND NEW.status = 'ISSUED'
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.credit_note_number IS DISTINCT FROM OLD.credit_note_number
     AND NEW.invoice_id IS NOT DISTINCT FROM OLD.invoice_id
     AND NEW.amount_vnd IS NOT DISTINCT FROM OLD.amount_vnd
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.issued_at IS NOT NULL
     AND NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    THEN RETURN NEW;
  END IF;
  RAISE EXCEPTION 'credit notes are append-only';
END;
$$;
CREATE TRIGGER credit_notes_append_only
BEFORE UPDATE OR DELETE ON credit_notes
FOR EACH ROW EXECUTE FUNCTION prevent_credit_note_mutation();
CREATE TRIGGER credit_notes_no_truncate
BEFORE TRUNCATE ON credit_notes
FOR EACH STATEMENT EXECUTE FUNCTION prevent_financial_ledger_mutation();


CREATE OR REPLACE FUNCTION prevent_enrollment_pricing_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.locked_at IS NULL
     AND NEW.locked_at IS NOT NULL
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.enrollment_id IS NOT DISTINCT FROM OLD.enrollment_id
     AND NEW.pricing_plan_id IS NOT DISTINCT FROM OLD.pricing_plan_id
     AND NEW.amount_vnd IS NOT DISTINCT FROM OLD.amount_vnd
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.effective_from IS NOT DISTINCT FROM OLD.effective_from
     AND NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    THEN RETURN NEW;
  END IF;
  RAISE EXCEPTION 'locked enrollment pricing is immutable';
END;
$$;
CREATE TRIGGER enrollment_pricing_locked_immutable
BEFORE UPDATE OR DELETE ON enrollment_pricing
FOR EACH ROW EXECUTE FUNCTION prevent_enrollment_pricing_mutation();

CREATE TRIGGER credit_note_voids_append_only
BEFORE UPDATE OR DELETE ON credit_note_voids
FOR EACH ROW EXECUTE FUNCTION prevent_financial_ledger_mutation();
CREATE TRIGGER credit_note_voids_no_truncate
BEFORE TRUNCATE ON credit_note_voids
FOR EACH STATEMENT EXECUTE FUNCTION prevent_financial_ledger_mutation();

CREATE TRIGGER invoice_status_history_append_only
BEFORE UPDATE OR DELETE ON invoice_status_history
FOR EACH ROW EXECUTE FUNCTION prevent_financial_ledger_mutation();
CREATE TRIGGER invoice_status_history_no_truncate
BEFORE TRUNCATE ON invoice_status_history
FOR EACH STATEMENT EXECUTE FUNCTION prevent_financial_ledger_mutation();
