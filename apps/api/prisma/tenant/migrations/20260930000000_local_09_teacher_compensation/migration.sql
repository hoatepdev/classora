-- LOCAL-09: effective-dated teacher compensation and immutable payable history.
-- Prior migrations remain unchanged; this migration is safe for fresh and LOCAL-08 tenants.

ALTER TABLE classes ADD COLUMN completed_on DATE;
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_status_check;
ALTER TABLE classes ADD CONSTRAINT classes_status_check CHECK (status IN ('ACTIVE', 'DISABLED', 'COMPLETED'));
ALTER TABLE classes ADD CONSTRAINT classes_completion_state_check CHECK ((status = 'COMPLETED') = (completed_on IS NOT NULL));
CREATE INDEX classes_tenant_status_completed_on_idx ON classes (tenant_id, status, completed_on, id);

CREATE TABLE compensation_agreements (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  teacher_id CHAR(26) NOT NULL,
  class_id CHAR(26),
  basis TEXT NOT NULL CHECK (basis IN ('PER_SESSION', 'PER_HOUR', 'FIXED_CLASS')),
  rate_vnd BIGINT NOT NULL CHECK (rate_vnd > 0),
  effective_from DATE NOT NULL,
  effective_until DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT compensation_agreements_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT compensation_agreements_teacher_fkey FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id),
  CONSTRAINT compensation_agreements_class_fkey FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id),
  CONSTRAINT compensation_agreements_scope_check CHECK (basis <> 'FIXED_CLASS' OR class_id IS NOT NULL),
  CONSTRAINT compensation_agreements_dates_check CHECK (effective_until IS NULL OR effective_until >= effective_from)
);
CREATE INDEX compensation_agreements_resolution_idx ON compensation_agreements (tenant_id, teacher_id, class_id, effective_from, effective_until, status, id);

CREATE OR REPLACE FUNCTION prevent_compensation_agreement_identity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id OR NEW.teacher_id <> OLD.teacher_id OR NEW.class_id IS DISTINCT FROM OLD.class_id
     OR NEW.basis <> OLD.basis OR NEW.rate_vnd <> OLD.rate_vnd OR NEW.effective_from <> OLD.effective_from THEN
    RAISE EXCEPTION 'compensation agreement identity is immutable';
  END IF;
  IF NEW.status = 'ENDED' AND NEW.effective_until IS NULL THEN
    RAISE EXCEPTION 'ended compensation agreement requires effective_until';
  END IF;
  IF NEW.status = 'ACTIVE' AND NEW.effective_until IS NOT NULL THEN
    RAISE EXCEPTION 'active compensation agreement cannot have effective_until';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER compensation_agreements_identity_guard BEFORE UPDATE ON compensation_agreements FOR EACH ROW EXECUTE FUNCTION prevent_compensation_agreement_identity_mutation();
CREATE OR REPLACE FUNCTION prevent_compensation_agreement_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'compensation agreements cannot be deleted'; END;
$$;
CREATE TRIGGER compensation_agreements_no_delete BEFORE DELETE ON compensation_agreements FOR EACH ROW EXECUTE FUNCTION prevent_compensation_agreement_delete();

CREATE OR REPLACE FUNCTION prevent_compensation_agreement_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(format('compensation-agreement:%s:%s:%s', NEW.tenant_id, NEW.teacher_id, coalesce(NEW.class_id, 'DEFAULT')), 0));
  IF EXISTS (
    SELECT 1 FROM compensation_agreements a
    WHERE a.tenant_id = NEW.tenant_id AND a.teacher_id = NEW.teacher_id
      AND a.class_id IS NOT DISTINCT FROM NEW.class_id AND a.id <> NEW.id
      AND daterange(a.effective_from, coalesce(a.effective_until + 1, 'infinity'::date), '[)')
          && daterange(NEW.effective_from, coalesce(NEW.effective_until + 1, 'infinity'::date), '[)')
  ) THEN RAISE EXCEPTION 'compensation agreement dates overlap'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER compensation_agreements_overlap_guard BEFORE INSERT OR UPDATE ON compensation_agreements FOR EACH ROW EXECUTE FUNCTION prevent_compensation_agreement_overlap();

CREATE TABLE compensation_periods (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED')),
  generated_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  finalized_by_user_id CHAR(26),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT compensation_periods_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT compensation_periods_dates_check CHECK (period_end >= period_start),
  CONSTRAINT compensation_periods_finalized_check CHECK ((status = 'FINALIZED') = (finalized_at IS NOT NULL AND finalized_by_user_id IS NOT NULL))
);
CREATE UNIQUE INDEX compensation_periods_tenant_dates_key ON compensation_periods (tenant_id, period_start, period_end);
CREATE INDEX compensation_periods_lookup_idx ON compensation_periods (tenant_id, status, period_start, period_end, id);

CREATE TABLE teacher_compensation_statements (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  period_id CHAR(26) NOT NULL,
  teacher_id CHAR(26) NOT NULL,
  earnings_vnd BIGINT NOT NULL DEFAULT 0,
  adjustments_vnd BIGINT NOT NULL DEFAULT 0,
  payable_vnd BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT teacher_compensation_statements_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT teacher_compensation_statements_period_teacher_key UNIQUE (tenant_id, period_id, teacher_id),
  CONSTRAINT teacher_compensation_statements_period_fkey FOREIGN KEY (tenant_id, period_id) REFERENCES compensation_periods (tenant_id, id),
  CONSTRAINT teacher_compensation_statements_teacher_fkey FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id)
);
CREATE INDEX teacher_compensation_statements_lookup_idx ON teacher_compensation_statements (tenant_id, period_id, teacher_id, id);

CREATE TABLE compensation_items (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  statement_id CHAR(26) NOT NULL,
  teacher_id CHAR(26) NOT NULL,
  class_id CHAR(26) NOT NULL,
  session_id CHAR(26),
  agreement_id CHAR(26) NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('SESSION', 'FIXED_CLASS')),
  work_date DATE NOT NULL,
  start_time TIME(0),
  end_time TIME(0),
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  basis TEXT NOT NULL CHECK (basis IN ('PER_SESSION', 'PER_HOUR', 'FIXED_CLASS')),
  rate_vnd BIGINT NOT NULL CHECK (rate_vnd > 0),
  amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
  teacher_code TEXT NOT NULL,
  teacher_name TEXT NOT NULL,
  class_code TEXT NOT NULL,
  class_name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT compensation_items_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT compensation_items_statement_fkey FOREIGN KEY (tenant_id, statement_id) REFERENCES teacher_compensation_statements (tenant_id, id),
  CONSTRAINT compensation_items_teacher_fkey FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id),
  CONSTRAINT compensation_items_class_fkey FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id),
  CONSTRAINT compensation_items_session_fkey FOREIGN KEY (tenant_id, session_id) REFERENCES attendance_sessions (tenant_id, id),
  CONSTRAINT compensation_items_agreement_fkey FOREIGN KEY (tenant_id, agreement_id) REFERENCES compensation_agreements (tenant_id, id),
  CONSTRAINT compensation_items_source_shape_check CHECK ((source_kind = 'SESSION' AND session_id IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL AND duration_minutes IS NOT NULL) OR (source_kind = 'FIXED_CLASS' AND session_id IS NULL AND start_time IS NULL AND end_time IS NULL AND duration_minutes IS NULL))
);
CREATE UNIQUE INDEX compensation_items_one_session_source_key ON compensation_items (tenant_id, session_id) WHERE source_kind = 'SESSION';
CREATE UNIQUE INDEX compensation_items_one_fixed_source_key ON compensation_items (tenant_id, agreement_id, class_id) WHERE source_kind = 'FIXED_CLASS';
CREATE INDEX compensation_items_statement_lookup_idx ON compensation_items (tenant_id, statement_id, work_date, id);

CREATE TABLE compensation_adjustments (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  statement_id CHAR(26) NOT NULL,
  amount_vnd BIGINT NOT NULL CHECK (amount_vnd <> 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id CHAR(26),
  CONSTRAINT compensation_adjustments_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT compensation_adjustments_statement_fkey FOREIGN KEY (tenant_id, statement_id) REFERENCES teacher_compensation_statements (tenant_id, id)
);
CREATE INDEX compensation_adjustments_statement_lookup_idx ON compensation_adjustments (tenant_id, statement_id, created_at, id);

CREATE TABLE unresolved_compensation (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  period_id CHAR(26) NOT NULL,
  teacher_id CHAR(26),
  class_id CHAR(26) NOT NULL,
  session_id CHAR(26) NOT NULL,
  work_date DATE NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('MISSING_TEACHER', 'MISSING_AGREEMENT')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unresolved_compensation_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT unresolved_compensation_period_fkey FOREIGN KEY (tenant_id, period_id) REFERENCES compensation_periods (tenant_id, id),
  CONSTRAINT unresolved_compensation_teacher_fkey FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id),
  CONSTRAINT unresolved_compensation_class_fkey FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id),
  CONSTRAINT unresolved_compensation_session_fkey FOREIGN KEY (tenant_id, session_id) REFERENCES attendance_sessions (tenant_id, id),
  CONSTRAINT unresolved_compensation_session_key UNIQUE (tenant_id, session_id)
);
CREATE INDEX unresolved_compensation_period_lookup_idx ON unresolved_compensation (tenant_id, period_id, work_date, id);

CREATE OR REPLACE FUNCTION prevent_finalized_compensation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  period_status TEXT;
  row_tenant_id CHAR(26);
  row_statement_id CHAR(26);
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_tenant_id := OLD.tenant_id;
    row_statement_id := OLD.statement_id;
  ELSE
    row_tenant_id := NEW.tenant_id;
    row_statement_id := NEW.statement_id;
  END IF;
  SELECT p.status INTO period_status
  FROM compensation_periods p
  JOIN teacher_compensation_statements s
    ON s.tenant_id = p.tenant_id AND s.period_id = p.id
  WHERE s.tenant_id = row_tenant_id AND s.id = row_statement_id;
  IF period_status = 'FINALIZED' THEN RAISE EXCEPTION 'finalized compensation is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER compensation_items_finalized_guard BEFORE INSERT OR UPDATE OR DELETE ON compensation_items FOR EACH ROW EXECUTE FUNCTION prevent_finalized_compensation_mutation();
CREATE TRIGGER compensation_adjustments_finalized_guard BEFORE INSERT OR UPDATE OR DELETE ON compensation_adjustments FOR EACH ROW EXECUTE FUNCTION prevent_finalized_compensation_mutation();

CREATE OR REPLACE FUNCTION prevent_finalized_unresolved_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_tenant_id CHAR(26); row_period_id CHAR(26);
BEGIN
  IF TG_OP = 'DELETE' THEN row_tenant_id := OLD.tenant_id; row_period_id := OLD.period_id;
  ELSE row_tenant_id := NEW.tenant_id; row_period_id := NEW.period_id; END IF;
  IF EXISTS (SELECT 1 FROM compensation_periods p WHERE p.tenant_id = row_tenant_id AND p.id = row_period_id AND p.status = 'FINALIZED') THEN RAISE EXCEPTION 'finalized compensation is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER unresolved_finalized_guard BEFORE UPDATE OR DELETE ON unresolved_compensation FOR EACH ROW EXECUTE FUNCTION prevent_finalized_unresolved_mutation();

CREATE OR REPLACE FUNCTION prevent_finalized_statement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM compensation_periods p WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.period_id AND p.status = 'FINALIZED') THEN
    IF NEW.earnings_vnd IS DISTINCT FROM OLD.earnings_vnd
       OR NEW.adjustments_vnd IS DISTINCT FROM OLD.adjustments_vnd
       OR NEW.payable_vnd IS DISTINCT FROM OLD.payable_vnd
       OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
       OR NEW.period_id IS DISTINCT FROM OLD.period_id THEN
      RAISE EXCEPTION 'finalized compensation is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER statements_finalized_guard BEFORE UPDATE ON teacher_compensation_statements FOR EACH ROW EXECUTE FUNCTION prevent_finalized_statement_mutation();
CREATE OR REPLACE FUNCTION prevent_finalized_statement_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM compensation_periods p WHERE p.tenant_id = OLD.tenant_id AND p.id = OLD.period_id AND p.status = 'FINALIZED') THEN RAISE EXCEPTION 'finalized compensation is immutable'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER statements_finalized_delete_guard BEFORE DELETE ON teacher_compensation_statements FOR EACH ROW EXECUTE FUNCTION prevent_finalized_statement_delete();

CREATE OR REPLACE FUNCTION prevent_compensation_period_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'FINALIZED' AND (
    NEW.status <> OLD.status OR NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end
    OR NEW.generated_at IS DISTINCT FROM OLD.generated_at OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
    OR NEW.finalized_by_user_id IS DISTINCT FROM OLD.finalized_by_user_id
  ) THEN RAISE EXCEPTION 'finalized compensation period is immutable'; END IF;
  IF OLD.status = 'DRAFT' AND NEW.status = 'FINALIZED' AND (NEW.finalized_at IS NULL OR NEW.finalized_by_user_id IS NULL) THEN RAISE EXCEPTION 'finalized compensation period requires actor and timestamp'; END IF;
  IF OLD.status = 'FINALIZED' AND NEW.status <> OLD.status THEN RAISE EXCEPTION 'compensation period cannot be reopened'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER compensation_period_mutation_guard BEFORE UPDATE ON compensation_periods FOR EACH ROW EXECUTE FUNCTION prevent_compensation_period_mutation();
CREATE OR REPLACE FUNCTION prevent_compensation_period_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'FINALIZED' THEN RAISE EXCEPTION 'finalized compensation period is immutable'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER compensation_period_delete_guard BEFORE DELETE ON compensation_periods FOR EACH ROW EXECUTE FUNCTION prevent_compensation_period_delete();

CREATE OR REPLACE FUNCTION validate_compensation_item_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  statement_teacher_id CHAR(26);
  session_class_id CHAR(26);
  session_teacher_id CHAR(26);
  session_status TEXT;
  source_date DATE;
  source_start TIME(0);
  source_end TIME(0);
  agreement_teacher_id CHAR(26);
  agreement_class_id CHAR(26);
  agreement_basis TEXT;
  agreement_rate BIGINT;
  agreement_from DATE;
  agreement_until DATE;
  class_completed_on DATE;
BEGIN
  SELECT teacher_id INTO statement_teacher_id
  FROM teacher_compensation_statements
  WHERE tenant_id = NEW.tenant_id AND id = NEW.statement_id;
  IF statement_teacher_id IS NULL OR statement_teacher_id IS DISTINCT FROM NEW.teacher_id THEN
    RAISE EXCEPTION 'compensation item teacher does not match statement';
  END IF;

  SELECT teacher_id, class_id, basis, rate_vnd, effective_from, effective_until
    INTO agreement_teacher_id, agreement_class_id, agreement_basis, agreement_rate, agreement_from, agreement_until
  FROM compensation_agreements
  WHERE tenant_id = NEW.tenant_id AND id = NEW.agreement_id;
  IF agreement_teacher_id IS NULL
     OR agreement_teacher_id IS DISTINCT FROM NEW.teacher_id
     OR (agreement_class_id IS NOT NULL AND agreement_class_id IS DISTINCT FROM NEW.class_id)
     OR agreement_basis IS DISTINCT FROM NEW.basis
     OR agreement_rate IS DISTINCT FROM NEW.rate_vnd
     OR NEW.work_date < agreement_from
     OR (agreement_until IS NOT NULL AND NEW.work_date > agreement_until) THEN
    RAISE EXCEPTION 'compensation item agreement does not match source';
  END IF;

  SELECT completed_on INTO class_completed_on
  FROM classes
  WHERE tenant_id = NEW.tenant_id AND id = NEW.class_id;
  IF NEW.source_kind = 'FIXED_CLASS' THEN
    IF agreement_basis <> 'FIXED_CLASS' OR agreement_class_id IS DISTINCT FROM NEW.class_id
       OR class_completed_on IS NULL OR class_completed_on IS DISTINCT FROM NEW.work_date THEN
      RAISE EXCEPTION 'fixed-class compensation source does not match completed class';
    END IF;
    RETURN NEW;
  END IF;

  SELECT class_id, teacher_id, status, session_date, start_time, end_time
    INTO session_class_id, session_teacher_id, session_status, source_date, source_start, source_end
  FROM attendance_sessions
  WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;
  IF NEW.source_kind <> 'SESSION' OR NEW.session_id IS NULL
     OR session_class_id IS DISTINCT FROM NEW.class_id
     OR session_teacher_id IS DISTINCT FROM NEW.teacher_id
     OR session_status <> 'COMPLETED'
     OR source_date IS DISTINCT FROM NEW.work_date
     OR source_start IS DISTINCT FROM NEW.start_time
     OR source_end IS DISTINCT FROM NEW.end_time
     OR agreement_basis = 'FIXED_CLASS' THEN
    RAISE EXCEPTION 'session compensation source does not match completed session';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER compensation_items_source_guard
BEFORE INSERT OR UPDATE ON compensation_items
FOR EACH ROW EXECUTE FUNCTION validate_compensation_item_source();

CREATE OR REPLACE FUNCTION prevent_compensation_source_claim_conflict() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'compensation_items' THEN
    IF NEW.source_kind = 'SESSION' AND EXISTS (
      SELECT 1 FROM unresolved_compensation u
      WHERE u.tenant_id = NEW.tenant_id AND u.session_id = NEW.session_id
    ) THEN
      RAISE EXCEPTION 'compensation source is already claimed by unresolved work';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM compensation_items i
      WHERE i.tenant_id = NEW.tenant_id AND i.source_kind = 'SESSION' AND i.session_id = NEW.session_id
    ) THEN
      RAISE EXCEPTION 'compensation source is already claimed by payable work';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER compensation_items_source_claim_guard
BEFORE INSERT OR UPDATE ON compensation_items
FOR EACH ROW EXECUTE FUNCTION prevent_compensation_source_claim_conflict();
CREATE TRIGGER unresolved_source_claim_guard
BEFORE INSERT OR UPDATE ON unresolved_compensation
FOR EACH ROW EXECUTE FUNCTION prevent_compensation_source_claim_conflict();

CREATE OR REPLACE FUNCTION validate_unresolved_compensation_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  session_class_id CHAR(26);
  session_teacher_id CHAR(26);
  session_status TEXT;
  source_date DATE;
  range_start DATE;
  range_end DATE;
BEGIN
  SELECT class_id, teacher_id, status, session_date
    INTO session_class_id, session_teacher_id, session_status, source_date
  FROM attendance_sessions
  WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;
  SELECT period_start, period_end INTO range_start, range_end
  FROM compensation_periods
  WHERE tenant_id = NEW.tenant_id AND id = NEW.period_id;
  IF session_class_id IS NULL OR session_class_id IS DISTINCT FROM NEW.class_id
     OR session_status <> 'COMPLETED'
     OR source_date IS DISTINCT FROM NEW.work_date
     OR (NEW.teacher_id IS NOT NULL AND session_teacher_id IS DISTINCT FROM NEW.teacher_id)
     OR range_start IS NULL OR NEW.work_date < range_start OR NEW.work_date > range_end THEN
    RAISE EXCEPTION 'unresolved compensation source does not match completed session';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER unresolved_source_guard
BEFORE INSERT OR UPDATE ON unresolved_compensation
FOR EACH ROW EXECUTE FUNCTION validate_unresolved_compensation_source();
