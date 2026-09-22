ALTER TABLE students
  ADD CONSTRAINT students_tenant_id_id_key UNIQUE (tenant_id, id),
  ADD COLUMN gender TEXT,
  ADD COLUMN address TEXT,
  ADD COLUMN school TEXT,
  ADD COLUMN source TEXT;

CREATE TABLE guardians (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT guardians_tenant_id_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX guardians_tenant_id_full_name_id_idx ON guardians (tenant_id, full_name, id);
CREATE INDEX guardians_tenant_id_phone_id_idx ON guardians (tenant_id, phone, id);
CREATE INDEX guardians_tenant_id_email_id_idx ON guardians (tenant_id, email, id);

CREATE TABLE student_guardians (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  guardian_id CHAR(26) NOT NULL,
  relationship TEXT NOT NULL,
  is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
  is_billing_contact BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT student_guardians_tenant_student_guardian_key UNIQUE (tenant_id, student_id, guardian_id),
  CONSTRAINT student_guardians_student_fk FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT student_guardians_guardian_fk FOREIGN KEY (tenant_id, guardian_id) REFERENCES guardians (tenant_id, id)
);

CREATE INDEX student_guardians_tenant_student_primary_idx ON student_guardians (tenant_id, student_id, is_primary_contact, id);
CREATE INDEX student_guardians_tenant_guardian_id_idx ON student_guardians (tenant_id, guardian_id, id);
CREATE UNIQUE INDEX student_guardians_one_primary_idx ON student_guardians (tenant_id, student_id) WHERE is_primary_contact;

CREATE TABLE student_tags (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT student_tags_tenant_id_name_key UNIQUE (tenant_id, name),
  CONSTRAINT student_tags_tenant_id_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX student_tags_tenant_id_name_id_idx ON student_tags (tenant_id, name, id);

CREATE TABLE student_tag_assignments (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  tag_id CHAR(26) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT student_tag_assignments_tenant_student_tag_key UNIQUE (tenant_id, student_id, tag_id),
  CONSTRAINT student_tag_assignments_student_fk FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT student_tag_assignments_tag_fk FOREIGN KEY (tenant_id, tag_id) REFERENCES student_tags (tenant_id, id)
);

CREATE INDEX student_tag_assignments_tenant_student_tag_idx ON student_tag_assignments (tenant_id, student_id, tag_id);

CREATE TABLE student_notes (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  content TEXT NOT NULL,
  author_id CHAR(26),
  author_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT student_notes_student_fk FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id)
);

CREATE INDEX student_notes_tenant_student_created_id_idx ON student_notes (tenant_id, student_id, created_at, id);
CREATE INDEX students_tenant_id_phone_id_idx ON students (tenant_id, phone, id);
CREATE INDEX students_tenant_id_email_id_idx ON students (tenant_id, email, id);
