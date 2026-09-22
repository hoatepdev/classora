-- LOCAL-06 evolves the existing Schedule and AttendanceSession rows in place.
-- IDs and AttendanceRecord links are preserved; only domain names/columns change.

ALTER TABLE schedules
  ADD COLUMN branch_id CHAR(26),
  ADD COLUMN room_id CHAR(26),
  ADD COLUMN effective_from DATE,
  ADD COLUMN effective_until DATE,
  ADD COLUMN legacy_room TEXT;

UPDATE schedules s
SET branch_id = c.branch_id,
    effective_from = c.start_date,
    effective_until = c.expected_end_date,
    legacy_room = s.room
FROM classes c
WHERE c.id = s.class_id AND c.tenant_id = s.tenant_id;

-- Only exact code/name matches in the class branch are deterministic. Unmatched
-- legacy text remains in legacy_room and is intentionally not guessed.
UPDATE schedules s
SET room_id = r.id
FROM rooms r
WHERE r.tenant_id = s.tenant_id
  AND r.branch_id = s.branch_id
  AND (r.code = s.room OR r.name = s.room)
  AND s.room IS NOT NULL
  AND (
    SELECT count(*) FROM rooms candidate
    WHERE candidate.tenant_id = s.tenant_id
      AND candidate.branch_id = s.branch_id
      AND (candidate.code = s.room OR candidate.name = s.room)
  ) = 1;

DROP INDEX IF EXISTS schedules_active_identity_key;

CREATE UNIQUE INDEX schedules_active_identity_key
  ON schedules (tenant_id, class_id, teacher_id, day_of_week, start_time, end_time)
  WHERE status = 'ACTIVE';

ALTER TABLE schedules
  DROP CONSTRAINT schedules_class_id_fkey,
  DROP CONSTRAINT schedules_teacher_id_fkey,
  DROP CONSTRAINT schedules_time_order_check,
  ADD CONSTRAINT schedules_tenant_id_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT schedules_tenant_class_fkey FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id),
  ADD CONSTRAINT schedules_tenant_teacher_fkey FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id),
  ADD CONSTRAINT schedules_tenant_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
  ADD CONSTRAINT schedules_tenant_room_fkey FOREIGN KEY (tenant_id, room_id) REFERENCES rooms (tenant_id, id),
  ADD CONSTRAINT schedules_time_order_check CHECK (start_time < end_time),
  ADD CONSTRAINT schedules_effective_date_order_check CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_from <= effective_until);

ALTER TABLE schedules RENAME COLUMN room TO legacy_room_source;
ALTER TABLE schedules DROP COLUMN legacy_room;

ALTER TABLE attendance_sessions
  RENAME COLUMN schedule_id TO schedule_pattern_id;
ALTER TABLE attendance_records
  RENAME COLUMN attendance_session_id TO session_id;

ALTER TABLE attendance_sessions
  ADD COLUMN room_id CHAR(26),
  ADD COLUMN branch_id CHAR(26),
  ADD COLUMN manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN rescheduled_from_id CHAR(26),
  ADD COLUMN cancellation_reason TEXT,
  ADD COLUMN reschedule_reason TEXT,
  ADD COLUMN source_session_date DATE,
  ADD COLUMN source_start_time TIME(0),
  ADD COLUMN source_end_time TIME(0);

ALTER TABLE attendance_sessions DROP CONSTRAINT attendance_sessions_status_check;

UPDATE attendance_sessions a
SET room_id = s.room_id,
    branch_id = s.branch_id
FROM schedules s
WHERE s.tenant_id = a.tenant_id AND s.id = a.schedule_pattern_id;
UPDATE attendance_sessions a
SET branch_id = c.branch_id
FROM classes c
WHERE c.tenant_id = a.tenant_id AND c.id = a.class_id AND a.branch_id IS NULL;

UPDATE attendance_sessions SET status = 'SCHEDULED' WHERE status = 'OPEN';

ALTER TABLE attendance_sessions
  DROP CONSTRAINT attendance_sessions_class_id_fkey,
  DROP CONSTRAINT attendance_sessions_schedule_id_fkey,
  DROP CONSTRAINT attendance_sessions_teacher_id_fkey,
  DROP CONSTRAINT attendance_sessions_occurrence_key,
  DROP CONSTRAINT attendance_sessions_time_order_check,
  ADD CONSTRAINT attendance_sessions_status_check CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED')),
  ADD CONSTRAINT attendance_sessions_tenant_id_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT attendance_sessions_tenant_class_fkey FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id),
  ADD CONSTRAINT attendance_sessions_tenant_pattern_fkey FOREIGN KEY (tenant_id, schedule_pattern_id) REFERENCES schedules (tenant_id, id),
  ADD CONSTRAINT attendance_sessions_tenant_teacher_fkey FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id),
  ADD CONSTRAINT attendance_sessions_tenant_room_fkey FOREIGN KEY (tenant_id, room_id) REFERENCES rooms (tenant_id, id),
  ADD CONSTRAINT attendance_sessions_tenant_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
  ADD CONSTRAINT attendance_sessions_tenant_rescheduled_from_fkey FOREIGN KEY (tenant_id, rescheduled_from_id) REFERENCES attendance_sessions (tenant_id, id),
  ADD CONSTRAINT attendance_sessions_time_order_check CHECK (start_time < end_time),
  ADD CONSTRAINT attendance_sessions_not_self_rescheduled_check CHECK (rescheduled_from_id IS NULL OR rescheduled_from_id <> id),
  ADD CONSTRAINT attendance_sessions_reschedule_source_check CHECK (
    (rescheduled_from_id IS NULL AND source_session_date IS NULL AND source_start_time IS NULL AND source_end_time IS NULL)
    OR (rescheduled_from_id IS NOT NULL AND source_session_date IS NOT NULL AND source_start_time IS NOT NULL AND source_end_time IS NOT NULL)
  );

ALTER TABLE attendance_sessions ALTER COLUMN status SET DEFAULT 'SCHEDULED';

ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_session_id_fkey,
  DROP CONSTRAINT attendance_records_student_id_fkey,
  ADD CONSTRAINT attendance_records_tenant_session_fkey FOREIGN KEY (tenant_id, session_id) REFERENCES attendance_sessions (tenant_id, id),
  ADD CONSTRAINT attendance_records_tenant_student_fkey FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id);

-- A generated occurrence is unique by pattern/date/time. Manual overrides and
-- reschedules use their own rows and are not silently collapsed.
CREATE UNIQUE INDEX attendance_sessions_generated_occurrence_key
  ON attendance_sessions (tenant_id, schedule_pattern_id, session_date, start_time, end_time)
  WHERE schedule_pattern_id IS NOT NULL AND manual_override = FALSE AND rescheduled_from_id IS NULL;

CREATE TABLE schedule_exclusions (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  date DATE NOT NULL,
  branch_id CHAR(26),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT schedule_exclusions_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT schedule_exclusions_tenant_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)
);
-- PostgreSQL UNIQUE treats NULLs as distinct; coalesce makes tenant-wide exclusions unique too.
CREATE UNIQUE INDEX schedule_exclusions_scope_key
  ON schedule_exclusions (tenant_id, date, COALESCE(branch_id, '00000000000000000000000000'::char(26)));
CREATE INDEX schedule_exclusions_tenant_date_idx ON schedule_exclusions (tenant_id, date, branch_id);

CREATE INDEX schedules_tenant_branch_day_time_idx
  ON schedules (tenant_id, branch_id, day_of_week, start_time, id);
CREATE INDEX attendance_sessions_tenant_date_time_idx
  ON attendance_sessions (tenant_id, session_date, start_time, end_time, id);
CREATE INDEX attendance_sessions_tenant_teacher_date_time_idx
  ON attendance_sessions (tenant_id, teacher_id, session_date, start_time, end_time, id);
CREATE INDEX attendance_sessions_tenant_room_date_time_idx
  ON attendance_sessions (tenant_id, room_id, session_date, start_time, end_time, id);
CREATE INDEX attendance_sessions_tenant_class_date_time_idx
  ON attendance_sessions (tenant_id, class_id, session_date, start_time, end_time, id);

DROP INDEX IF EXISTS attendance_sessions_schedule_date_key;
