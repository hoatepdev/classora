CREATE TABLE branches (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT branches_tenant_id_code_key UNIQUE (tenant_id, code)
);

CREATE INDEX branches_tenant_id_name_id_idx ON branches (tenant_id, name, id);

CREATE TABLE rooms (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  branch_id CHAR(26) NOT NULL REFERENCES branches(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rooms_tenant_id_branch_id_code_key UNIQUE (tenant_id, branch_id, code)
);

CREATE INDEX rooms_tenant_id_branch_id_name_id_idx ON rooms (tenant_id, branch_id, name, id);

CREATE TABLE course_levels (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  course_id CHAR(26) NOT NULL REFERENCES courses(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT course_levels_tenant_id_course_id_code_key UNIQUE (tenant_id, course_id, code)
);

CREATE INDEX course_levels_tenant_id_course_id_order_id_idx
  ON course_levels (tenant_id, course_id, display_order, id);

ALTER TABLE teachers ADD COLUMN specialties TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE teacher_branches (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  teacher_id CHAR(26) NOT NULL REFERENCES teachers(id),
  branch_id CHAR(26) NOT NULL REFERENCES branches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT teacher_branches_tenant_teacher_branch_key UNIQUE (tenant_id, teacher_id, branch_id)
);

CREATE INDEX teacher_branches_tenant_branch_teacher_idx
  ON teacher_branches (tenant_id, branch_id, teacher_id);

ALTER TABLE classes
  ADD COLUMN branch_id CHAR(26) REFERENCES branches(id),
  ADD COLUMN course_level_id CHAR(26) REFERENCES course_levels(id),
  ADD COLUMN default_room_id CHAR(26) REFERENCES rooms(id),
  ADD COLUMN primary_teacher_id CHAR(26) REFERENCES teachers(id),
  ADD COLUMN capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  ADD COLUMN start_date DATE,
  ADD COLUMN expected_end_date DATE,
  ADD CONSTRAINT classes_date_order_check CHECK (
    start_date IS NULL OR expected_end_date IS NULL OR start_date <= expected_end_date
  );

CREATE INDEX classes_tenant_id_branch_id_status_name_id_idx
  ON classes (tenant_id, branch_id, status, name, id);
CREATE INDEX classes_tenant_id_course_level_id_name_id_idx
  ON classes (tenant_id, course_level_id, name, id);
CREATE INDEX classes_tenant_id_primary_teacher_id_name_id_idx
  ON classes (tenant_id, primary_teacher_id, name, id);

-- Every new relationship includes tenant_id so a copied identifier cannot cross tenant boundaries.
ALTER TABLE branches ADD CONSTRAINT branches_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE courses ADD CONSTRAINT courses_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE teachers ADD CONSTRAINT teachers_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE classes ADD CONSTRAINT classes_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE course_levels ADD CONSTRAINT course_levels_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE rooms ADD CONSTRAINT rooms_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE rooms DROP CONSTRAINT rooms_branch_id_fkey;
ALTER TABLE rooms ADD CONSTRAINT rooms_tenant_branch_fkey
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id);

ALTER TABLE course_levels DROP CONSTRAINT course_levels_course_id_fkey;
ALTER TABLE course_levels ADD CONSTRAINT course_levels_tenant_course_fkey
  FOREIGN KEY (tenant_id, course_id) REFERENCES courses (tenant_id, id);

ALTER TABLE teacher_branches DROP CONSTRAINT teacher_branches_teacher_id_fkey;
ALTER TABLE teacher_branches DROP CONSTRAINT teacher_branches_branch_id_fkey;
ALTER TABLE teacher_branches ADD CONSTRAINT teacher_branches_tenant_teacher_fkey
  FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id);
ALTER TABLE teacher_branches ADD CONSTRAINT teacher_branches_tenant_branch_fkey
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id);

ALTER TABLE classes DROP CONSTRAINT classes_course_level_id_fkey;
ALTER TABLE classes DROP CONSTRAINT classes_default_room_id_fkey;
ALTER TABLE classes DROP CONSTRAINT classes_primary_teacher_id_fkey;
ALTER TABLE classes DROP CONSTRAINT classes_branch_id_fkey;
ALTER TABLE classes ADD CONSTRAINT classes_tenant_course_level_fkey
  FOREIGN KEY (tenant_id, course_level_id) REFERENCES course_levels (tenant_id, id);
ALTER TABLE classes ADD CONSTRAINT classes_tenant_room_fkey
  FOREIGN KEY (tenant_id, default_room_id) REFERENCES rooms (tenant_id, id);
ALTER TABLE classes ADD CONSTRAINT classes_tenant_teacher_fkey
  FOREIGN KEY (tenant_id, primary_teacher_id) REFERENCES teachers (tenant_id, id);
ALTER TABLE classes ADD CONSTRAINT classes_tenant_branch_fkey
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id);

-- Replace the legacy single-column Course FK now that the additive migration has tenant-aware keys.
ALTER TABLE classes DROP CONSTRAINT classes_course_id_fkey;
ALTER TABLE classes ADD CONSTRAINT classes_tenant_course_fkey
  FOREIGN KEY (tenant_id, course_id) REFERENCES courses (tenant_id, id);
