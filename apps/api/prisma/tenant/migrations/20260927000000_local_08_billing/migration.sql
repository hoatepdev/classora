-- LOCAL-08: tenant-scoped tuition plans, invoices, immutable payment ledger.

CREATE TABLE pricing_plans (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_vnd BIGINT NOT NULL CHECK (amount_vnd >= 0),
  billing_period TEXT NOT NULL DEFAULT 'ONE_TIME' CHECK (billing_period IN ('ONE_TIME','MONTHLY','TERM')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pricing_plans_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT pricing_plans_tenant_code_key UNIQUE (tenant_id, code)
);
CREATE INDEX pricing_plans_tenant_status_idx ON pricing_plans (tenant_id, status, name, id);

ALTER TABLE enrollments ADD COLUMN pricing_plan_id CHAR(26);
ALTER TABLE enrollments ADD CONSTRAINT enrollments_tenant_pricing_plan_fkey
  FOREIGN KEY (tenant_id, pricing_plan_id) REFERENCES pricing_plans (tenant_id, id);
CREATE INDEX enrollments_tenant_pricing_plan_idx ON enrollments (tenant_id, pricing_plan_id, id);

CREATE TABLE invoices (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  invoice_number TEXT NOT NULL,
  student_id CHAR(26) NOT NULL,
  enrollment_id CHAR(26),
  pricing_plan_id CHAR(26),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','VOID')),
  issue_date DATE,
  due_date DATE,
  subtotal_vnd BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_vnd >= 0),
  discount_vnd BIGINT NOT NULL DEFAULT 0 CHECK (discount_vnd >= 0),
  total_vnd BIGINT NOT NULL DEFAULT 0 CHECK (total_vnd >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_at TIMESTAMPTZ,
  CONSTRAINT invoices_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT invoices_tenant_number_key UNIQUE (tenant_id, invoice_number),
  CONSTRAINT invoices_total_check CHECK (discount_vnd <= subtotal_vnd AND total_vnd = subtotal_vnd - discount_vnd),
  CONSTRAINT invoices_tenant_student_fkey FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT invoices_tenant_enrollment_fkey FOREIGN KEY (tenant_id, enrollment_id) REFERENCES enrollments (tenant_id, id),
  CONSTRAINT invoices_tenant_plan_fkey FOREIGN KEY (tenant_id, pricing_plan_id) REFERENCES pricing_plans (tenant_id, id)
);
CREATE INDEX invoices_tenant_student_date_idx ON invoices (tenant_id, student_id, issue_date DESC, id DESC);
CREATE INDEX invoices_tenant_status_due_idx ON invoices (tenant_id, status, due_date, id);

CREATE TABLE invoice_items (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  invoice_id CHAR(26) NOT NULL,
  enrollment_id CHAR(26),
  description TEXT NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_vnd BIGINT NOT NULL CHECK (unit_amount_vnd >= 0),
  amount_vnd BIGINT NOT NULL CHECK (amount_vnd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT invoice_items_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT invoice_items_tenant_invoice_fkey FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoices (tenant_id, id),
  CONSTRAINT invoice_items_tenant_enrollment_fkey FOREIGN KEY (tenant_id, enrollment_id) REFERENCES enrollments (tenant_id, id),
  CONSTRAINT invoice_items_amount_check CHECK (amount_vnd = quantity * unit_amount_vnd)
);
CREATE INDEX invoice_items_tenant_invoice_idx ON invoice_items (tenant_id, invoice_id, id);

-- A payment row is immutable. Corrections are append-only reversal rows.
CREATE TABLE payments (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  invoice_id CHAR(26) NOT NULL,
  amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
  method TEXT NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER','CARD','OTHER')),
  reference TEXT,
  note TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payments_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT payments_tenant_invoice_fkey FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoices (tenant_id, id)
);
CREATE INDEX payments_tenant_invoice_date_idx ON payments (tenant_id, invoice_id, received_at, id);

CREATE TABLE payment_reversals (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  payment_id CHAR(26) NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  actor_user_id CHAR(26),
  actor_membership_id CHAR(26),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payment_reversals_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT payment_reversals_tenant_payment_fkey FOREIGN KEY (tenant_id, payment_id) REFERENCES payments (tenant_id, id),
  CONSTRAINT payment_reversals_one_per_payment_key UNIQUE (tenant_id, payment_id)
);
CREATE INDEX payment_reversals_tenant_payment_idx ON payment_reversals (tenant_id, payment_id, id);
