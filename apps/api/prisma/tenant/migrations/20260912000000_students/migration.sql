-- Baseline tenant schema. Databases migrated by the retired runner adopt it
-- with `prisma migrate resolve`, so this DDL only runs on empty databases.

CREATE TABLE students (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  date_of_birth DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT students_tenant_id_code_key UNIQUE (tenant_id, code)
);

CREATE INDEX students_tenant_id_full_name_id_idx
  ON students (tenant_id, full_name, id);
