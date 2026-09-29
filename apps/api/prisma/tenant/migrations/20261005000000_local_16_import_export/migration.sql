-- LOCAL-16: staged CSV import/export evidence.
-- ImportBatch/ImportRow persist mapping, dry-run validation results, and
-- confirmation history. The original CSV bytes are never stored.

CREATE TABLE import_batches (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('STUDENTS', 'TEACHERS', 'COURSES', 'COURSE_LEVELS', 'CLASSES', 'ENROLLMENTS')),
  status TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED', 'VALIDATED', 'COMPLETED', 'FAILED', 'CANCELLED')),
  file_name TEXT NOT NULL CHECK (length(btrim(file_name)) > 0),
  file_sha256 CHAR(64) NOT NULL,
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  imported_rows INTEGER NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  failure JSONB,
  created_by_user_id CHAR(26),
  created_by_membership_id CHAR(26),
  created_by_name TEXT,
  validated_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT import_batches_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT import_batches_counts_check CHECK (valid_rows + invalid_rows <= total_rows AND imported_rows <= valid_rows),
  CONSTRAINT import_batches_failed_shape_check CHECK (status <> 'FAILED' OR failure IS NOT NULL)
);
CREATE INDEX import_batches_tenant_created_idx ON import_batches (tenant_id, created_at, id);
CREATE INDEX import_batches_tenant_status_idx ON import_batches (tenant_id, status, created_at, id);
CREATE INDEX import_batches_tenant_hash_idx ON import_batches (tenant_id, file_sha256);

CREATE TABLE import_rows (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  batch_id CHAR(26) NOT NULL,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  source_data JSONB NOT NULL,
  normalized_data JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALID', 'INVALID', 'IMPORTED', 'SKIPPED', 'FAILED')),
  action TEXT NOT NULL DEFAULT 'CREATE' CHECK (action IN ('CREATE', 'SKIP', 'ERROR')),
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_entity_id CHAR(26),
  source_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT import_rows_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT import_rows_batch_row_key UNIQUE (batch_id, row_number),
  CONSTRAINT import_rows_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES import_batches (tenant_id, id)
);
CREATE INDEX import_rows_batch_status_idx ON import_rows (batch_id, status, row_number);
