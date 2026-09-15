CREATE TABLE attendance_sessions (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  class_id CHAR(26) NOT NULL,
  schedule_id CHAR(26),
  teacher_id CHAR(26),
  session_date DATE NOT NULL,
  start_time TIME(0) NOT NULL,
  end_time TIME(0) NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_sessions_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes (id),
  CONSTRAINT attendance_sessions_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules (id),
  CONSTRAINT attendance_sessions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers (id),
  CONSTRAINT attendance_sessions_time_order_check CHECK (start_time < end_time),
  CONSTRAINT attendance_sessions_occurrence_key UNIQUE (tenant_id, class_id, session_date, start_time, end_time)
);

CREATE UNIQUE INDEX attendance_sessions_schedule_date_key
  ON attendance_sessions (tenant_id, schedule_id, session_date)
  WHERE schedule_id IS NOT NULL;

CREATE INDEX attendance_sessions_tenant_id_class_id_session_date_id_idx
  ON attendance_sessions (tenant_id, class_id, session_date, id);

CREATE TABLE attendance_records (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  attendance_session_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_records_session_id_fkey FOREIGN KEY (attendance_session_id) REFERENCES attendance_sessions (id),
  CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES students (id),
  CONSTRAINT attendance_records_session_student_key UNIQUE (tenant_id, attendance_session_id, student_id)
);

CREATE INDEX attendance_records_tenant_id_student_id_id_idx
  ON attendance_records (tenant_id, student_id, id);
