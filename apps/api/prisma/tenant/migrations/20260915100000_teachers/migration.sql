CREATE TABLE teachers (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT teachers_tenant_id_code_key UNIQUE (tenant_id, code)
);

CREATE INDEX teachers_tenant_id_name_id_idx
  ON teachers (tenant_id, name, id);
