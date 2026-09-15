CREATE TABLE schedules (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  class_id CHAR(26) NOT NULL,
  teacher_id CHAR(26) NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')),
  start_time TIME(0) NOT NULL,
  end_time TIME(0) NOT NULL,
  room TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT schedules_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes (id),
  CONSTRAINT schedules_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers (id),
  CONSTRAINT schedules_time_order_check CHECK (start_time < end_time)
);

CREATE UNIQUE INDEX schedules_active_identity_key
  ON schedules (tenant_id, class_id, teacher_id, day_of_week, start_time, end_time)
  WHERE status = 'ACTIVE';

CREATE INDEX schedules_tenant_id_class_id_day_of_week_start_time_id_idx
  ON schedules (tenant_id, class_id, day_of_week, start_time, id);

CREATE INDEX schedules_tenant_id_teacher_id_day_of_week_start_time_id_idx
  ON schedules (tenant_id, teacher_id, day_of_week, start_time, id);
