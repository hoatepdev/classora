CREATE TABLE enrollments (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  class_id CHAR(26) NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'WITHDRAWN')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students (id),
  CONSTRAINT enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes (id),
  CONSTRAINT enrollments_tenant_id_student_id_class_id_key UNIQUE (tenant_id, student_id, class_id)
);

CREATE INDEX enrollments_tenant_id_class_id_enrolled_at_id_idx
  ON enrollments (tenant_id, class_id, enrolled_at, id);
