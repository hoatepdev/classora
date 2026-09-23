-- LOCAL-07: attendance state/history and explicit makeup lifecycle.

CREATE TABLE attendance_sheets (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  session_id CHAR(26) NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED')),
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ,
  locked_by_user_id CHAR(26),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_sheets_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT attendance_sheets_tenant_session_key UNIQUE (tenant_id, session_id),
  CONSTRAINT attendance_sheets_tenant_session_fkey FOREIGN KEY (tenant_id, session_id) REFERENCES attendance_sessions (tenant_id, id),
  CONSTRAINT attendance_sheets_locked_fields_check CHECK (
    (status = 'OPEN' AND locked_at IS NULL AND locked_by_user_id IS NULL)
    OR status = 'LOCKED'
  )
);
CREATE INDEX attendance_sheets_tenant_status_idx ON attendance_sheets (tenant_id, status, session_id);

ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_status_check,
  ADD COLUMN enrollment_id CHAR(26),
  ADD COLUMN source TEXT NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN makeup_booking_id CHAR(26);

-- Convert legacy values before PostgreSQL validates the replacement constraint.
UPDATE attendance_records SET status = 'ABSENT_UNEXCUSED' WHERE status = 'ABSENT';
UPDATE attendance_records SET status = 'ABSENT_EXCUSED' WHERE status = 'EXCUSED';

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_check CHECK (status IN ('UNMARKED', 'PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'ONLINE', 'MAKEUP')),
  ADD CONSTRAINT attendance_records_source_check CHECK (source IN ('REGULAR', 'MAKEUP')),
  ADD CONSTRAINT attendance_records_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE attendance_corrections (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  attendance_record_id CHAR(26) NOT NULL,
  before_status TEXT NOT NULL,
  after_status TEXT NOT NULL,
  before_note TEXT,
  after_note TEXT,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  actor_user_id CHAR(26),
  actor_membership_id CHAR(26),
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_corrections_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT attendance_corrections_tenant_record_fkey FOREIGN KEY (tenant_id, attendance_record_id) REFERENCES attendance_records (tenant_id, id)
);
CREATE INDEX attendance_corrections_tenant_record_created_idx ON attendance_corrections (tenant_id, attendance_record_id, created_at, id);

CREATE TABLE makeup_entitlements (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  source_attendance_record_id CHAR(26) NOT NULL,
  source_session_id CHAR(26) NOT NULL,
  source_enrollment_id CHAR(26),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED', 'USED', 'EXPIRED', 'REVOKED')),
  expires_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT makeup_entitlements_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT makeup_entitlements_tenant_id_id_student_key UNIQUE (tenant_id, id, student_id),
  CONSTRAINT makeup_entitlements_source_key UNIQUE (tenant_id, source_attendance_record_id),
  CONSTRAINT makeup_entitlements_tenant_student_fkey FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT makeup_entitlements_tenant_record_fkey FOREIGN KEY (tenant_id, source_attendance_record_id) REFERENCES attendance_records (tenant_id, id),
  CONSTRAINT makeup_entitlements_tenant_session_fkey FOREIGN KEY (tenant_id, source_session_id) REFERENCES attendance_sessions (tenant_id, id),
  CONSTRAINT makeup_entitlements_tenant_enrollment_fkey FOREIGN KEY (tenant_id, source_enrollment_id) REFERENCES enrollments (tenant_id, id)
);
CREATE INDEX makeup_entitlements_student_status_expiry_idx ON makeup_entitlements (tenant_id, student_id, status, expires_at, id);
CREATE INDEX makeup_entitlements_source_session_idx ON makeup_entitlements (tenant_id, source_session_id, id);

CREATE TABLE makeup_bookings (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  entitlement_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  destination_session_id CHAR(26) NOT NULL,
  status TEXT NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'USED', 'CANCELLED')),
  booked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT makeup_bookings_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT makeup_bookings_entitlement_student_fkey FOREIGN KEY (tenant_id, entitlement_id, student_id) REFERENCES makeup_entitlements (tenant_id, id, student_id),
  CONSTRAINT makeup_bookings_tenant_entitlement_fkey FOREIGN KEY (tenant_id, entitlement_id) REFERENCES makeup_entitlements (tenant_id, id),
  CONSTRAINT makeup_bookings_tenant_student_fkey FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT makeup_bookings_tenant_session_fkey FOREIGN KEY (tenant_id, destination_session_id) REFERENCES attendance_sessions (tenant_id, id)
);
CREATE UNIQUE INDEX makeup_bookings_active_entitlement_key ON makeup_bookings (tenant_id, entitlement_id) WHERE status = 'BOOKED';
CREATE UNIQUE INDEX makeup_bookings_active_student_session_key ON makeup_bookings (tenant_id, student_id, destination_session_id) WHERE status = 'BOOKED';
ALTER TABLE makeup_bookings
  ADD CONSTRAINT makeup_bookings_tenant_destination_student_key UNIQUE (tenant_id, id, destination_session_id, student_id);
CREATE INDEX makeup_bookings_destination_status_idx ON makeup_bookings (tenant_id, destination_session_id, status, id);
CREATE INDEX makeup_bookings_student_status_idx ON makeup_bookings (tenant_id, student_id, status, booked_at, id);

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_tenant_enrollment_fkey FOREIGN KEY (tenant_id, enrollment_id) REFERENCES enrollments (tenant_id, id),
  ADD CONSTRAINT attendance_records_tenant_makeup_booking_fkey FOREIGN KEY (tenant_id, makeup_booking_id) REFERENCES makeup_bookings (tenant_id, id),
  ADD CONSTRAINT attendance_records_makeup_booking_match_fkey FOREIGN KEY (tenant_id, makeup_booking_id, session_id, student_id) REFERENCES makeup_bookings (tenant_id, id, destination_session_id, student_id),
  ADD CONSTRAINT attendance_records_makeup_fields_check CHECK (
    (source = 'REGULAR' AND makeup_booking_id IS NULL AND status <> 'MAKEUP')
    OR (source = 'MAKEUP' AND makeup_booking_id IS NOT NULL AND status IN ('UNMARKED', 'MAKEUP', 'ABSENT_UNEXCUSED'))
  );
CREATE INDEX attendance_records_session_status_idx ON attendance_records (tenant_id, session_id, status, id);
CREATE INDEX attendance_records_student_status_idx ON attendance_records (tenant_id, student_id, status, session_id, id);

-- Compatibility-created sessions without a schedule remain unique occurrences.
CREATE UNIQUE INDEX attendance_sessions_manual_occurrence_key
  ON attendance_sessions (tenant_id, class_id, session_date, start_time, end_time)
  WHERE schedule_pattern_id IS NULL AND manual_override = TRUE AND rescheduled_from_id IS NULL;

-- Preserve existing occurrence history: scheduled sessions remain open; completed rows are historical.
INSERT INTO attendance_sheets (id, tenant_id, session_id, status, initialized_at, locked_at)
SELECT substr(md5(a.id || ':attendance-sheet'), 1, 26), a.tenant_id, a.id,
       CASE WHEN a.status = 'COMPLETED' THEN 'LOCKED' ELSE 'OPEN' END,
       a.created_at,
       CASE WHEN a.status = 'COMPLETED' THEN a.updated_at ELSE NULL END
FROM attendance_sessions a;

-- The application creates a sheet before adding records for new attendance workflows.
ALTER TABLE attendance_records ALTER COLUMN status SET DEFAULT 'UNMARKED';
