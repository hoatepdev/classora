ALTER TABLE enrollments
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN ended_at TIMESTAMPTZ,
  ADD COLUMN pause_started_at TIMESTAMPTZ,
  ADD COLUMN expected_end_date DATE,
  ADD COLUMN source_enrollment_id CHAR(26),
  ADD COLUMN notes TEXT;

ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_status_check;
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_tenant_id_student_id_class_id_key;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_status_check
  CHECK (status IN ('PENDING', 'TRIAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'WITHDRAWN', 'CANCELLED'));
ALTER TABLE enrollments ADD CONSTRAINT enrollments_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE enrollments ADD CONSTRAINT enrollments_tenant_student_fkey
  FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id);
ALTER TABLE enrollments ADD CONSTRAINT enrollments_tenant_class_fkey
  FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id);
ALTER TABLE enrollments ADD CONSTRAINT enrollments_tenant_source_fkey
  FOREIGN KEY (tenant_id, source_enrollment_id) REFERENCES enrollments (tenant_id, id);

CREATE UNIQUE INDEX enrollments_operational_student_class_key
  ON enrollments (tenant_id, student_id, class_id)
  WHERE status IN ('PENDING', 'TRIAL', 'ACTIVE', 'PAUSED');
CREATE INDEX enrollments_tenant_student_dates_idx
  ON enrollments (tenant_id, student_id, enrolled_at DESC, id DESC);

CREATE TABLE enrollment_events (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  enrollment_id CHAR(26) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ENROLLED', 'ACTIVATED', 'TRIAL_STARTED', 'PAUSED', 'RESUMED', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED', 'CANCELLED', 'REENROLLED')),
  from_status TEXT,
  to_status TEXT,
  from_class_id CHAR(26),
  to_class_id CHAR(26),
  reason TEXT,
  metadata JSONB,
  actor_user_id CHAR(26),
  actor_membership_id CHAR(26),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT enrollment_events_tenant_enrollment_fkey
    FOREIGN KEY (tenant_id, enrollment_id) REFERENCES enrollments (tenant_id, id)
);
CREATE INDEX enrollment_events_tenant_enrollment_occurred_idx
  ON enrollment_events (tenant_id, enrollment_id, occurred_at, id);
CREATE INDEX enrollment_events_tenant_occurred_idx
  ON enrollment_events (tenant_id, occurred_at, id);
