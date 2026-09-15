CREATE TABLE courses (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT courses_tenant_id_code_key UNIQUE (tenant_id, code)
);

CREATE INDEX courses_tenant_id_name_id_idx
  ON courses (tenant_id, name, id);

ALTER TABLE classes
  ADD COLUMN course_id CHAR(26),
  ADD CONSTRAINT classes_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses (id);

CREATE INDEX classes_tenant_id_course_id_name_id_idx
  ON classes (tenant_id, course_id, name, id);
