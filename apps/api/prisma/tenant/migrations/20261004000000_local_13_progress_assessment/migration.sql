-- LOCAL-13: academic progress and assessment.
-- Assessments belong to a Class; Course/CourseLevel are derived through the Class.
-- Scores use NUMERIC(8,2) and are exchanged as exact decimal strings, never floats.
-- Published academic history is immutable: corrections append revisions, they never rewrite.

CREATE TABLE assessments (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  class_id CHAR(26) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('QUIZ', 'TEST', 'EXAM', 'HOMEWORK', 'PROJECT', 'ORAL', 'OTHER')),
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description TEXT,
  scoring_mode TEXT NOT NULL CHECK (scoring_mode IN ('SIMPLE', 'RUBRIC')),
  max_score NUMERIC(8,2) NOT NULL CHECK (max_score > 0),
  assessment_date DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  published_at TIMESTAMPTZ,
  published_by_user_id CHAR(26),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assessments_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT assessments_published_requires_publication_check CHECK (status = 'DRAFT' OR (published_at IS NOT NULL AND published_by_user_id IS NOT NULL)),
  CONSTRAINT assessments_class_fk FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id)
);
CREATE INDEX assessments_tenant_class_date_idx ON assessments (tenant_id, class_id, assessment_date, status, id);

CREATE TABLE assessment_criteria (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  assessment_id CHAR(26) NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  description TEXT,
  max_score NUMERIC(8,2) NOT NULL CHECK (max_score > 0),
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assessment_criteria_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT assessment_criteria_tenant_assessment_order_key UNIQUE (tenant_id, assessment_id, display_order),
  CONSTRAINT assessment_criteria_assessment_fk FOREIGN KEY (tenant_id, assessment_id) REFERENCES assessments (tenant_id, id)
);
CREATE INDEX assessment_criteria_tenant_assessment_idx ON assessment_criteria (tenant_id, assessment_id, display_order, id);

CREATE TABLE assessment_results (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  assessment_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  enrollment_id CHAR(26) NOT NULL,
  score NUMERIC(8,2) CHECK (score >= 0),
  status TEXT NOT NULL CHECK (status IN ('GRADED', 'EXEMPT')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assessment_results_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT assessment_results_tenant_assessment_student_key UNIQUE (tenant_id, assessment_id, student_id),
  CONSTRAINT assessment_results_assessment_fk FOREIGN KEY (tenant_id, assessment_id) REFERENCES assessments (tenant_id, id),
  CONSTRAINT assessment_results_student_fk FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT assessment_results_enrollment_fk FOREIGN KEY (tenant_id, enrollment_id) REFERENCES enrollments (tenant_id, id),
  CONSTRAINT assessment_results_score_status_check CHECK ((status = 'GRADED' AND score IS NOT NULL) OR (status = 'EXEMPT' AND score IS NULL))
);
CREATE INDEX assessment_results_tenant_student_idx ON assessment_results (tenant_id, student_id, id);
CREATE INDEX assessment_results_tenant_assessment_idx ON assessment_results (tenant_id, assessment_id, id);

CREATE TABLE assessment_criterion_results (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  assessment_result_id CHAR(26) NOT NULL,
  criterion_id CHAR(26) NOT NULL,
  score NUMERIC(8,2) NOT NULL CHECK (score >= 0),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assessment_criterion_results_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT assessment_criterion_results_tenant_result_criterion_key UNIQUE (tenant_id, assessment_result_id, criterion_id),
  CONSTRAINT assessment_criterion_results_result_fk FOREIGN KEY (tenant_id, assessment_result_id) REFERENCES assessment_results (tenant_id, id),
  CONSTRAINT assessment_criterion_results_criterion_fk FOREIGN KEY (tenant_id, criterion_id) REFERENCES assessment_criteria (tenant_id, id)
);
CREATE INDEX assessment_criterion_results_tenant_result_idx ON assessment_criterion_results (tenant_id, assessment_result_id, id);

CREATE TABLE assessment_result_revisions (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  assessment_result_id CHAR(26) NOT NULL,
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  actor_user_id CHAR(26),
  actor_membership_id CHAR(26),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assessment_result_revisions_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT assessment_result_revisions_result_fk FOREIGN KEY (tenant_id, assessment_result_id) REFERENCES assessment_results (tenant_id, id)
);
CREATE INDEX assessment_result_revisions_tenant_result_idx ON assessment_result_revisions (tenant_id, assessment_result_id, created_at, id);

CREATE TABLE progress_notes (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  enrollment_id CHAR(26),
  class_id CHAR(26),
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  author_user_id CHAR(26),
  author_membership_id CHAR(26),
  author_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT progress_notes_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT progress_notes_student_fk FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT progress_notes_enrollment_fk FOREIGN KEY (tenant_id, enrollment_id) REFERENCES enrollments (tenant_id, id),
  CONSTRAINT progress_notes_class_fk FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id)
);
CREATE INDEX progress_notes_tenant_student_idx ON progress_notes (tenant_id, student_id, created_at, id);

CREATE TABLE progress_reports (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  enrollment_id CHAR(26) NOT NULL,
  class_id CHAR(26) NOT NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
  teacher_comment TEXT,
  strengths TEXT,
  areas_for_improvement TEXT,
  next_steps TEXT,
  snapshot JSONB,
  supersedes_report_id CHAR(26),
  published_at TIMESTAMPTZ,
  published_by_user_id CHAR(26),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT progress_reports_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT progress_reports_period_check CHECK (period_end >= period_start),
  CONSTRAINT progress_reports_published_requires_publication_check CHECK (status <> 'PUBLISHED' OR (published_at IS NOT NULL AND snapshot IS NOT NULL)),
  CONSTRAINT progress_reports_student_fk FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT progress_reports_enrollment_fk FOREIGN KEY (tenant_id, enrollment_id) REFERENCES enrollments (tenant_id, id),
  CONSTRAINT progress_reports_class_fk FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id),
  CONSTRAINT progress_reports_supersedes_fk FOREIGN KEY (tenant_id, supersedes_report_id) REFERENCES progress_reports (tenant_id, id)
);
CREATE UNIQUE INDEX progress_reports_tenant_enrollment_period_published_key
  ON progress_reports (tenant_id, enrollment_id, period_start, period_end)
  WHERE status = 'PUBLISHED';
CREATE UNIQUE INDEX progress_reports_one_replacement_key
  ON progress_reports (tenant_id, supersedes_report_id)
  WHERE supersedes_report_id IS NOT NULL;
CREATE INDEX progress_reports_tenant_student_idx ON progress_reports (tenant_id, student_id, status, created_at, id);
CREATE INDEX progress_reports_tenant_enrollment_idx ON progress_reports (tenant_id, enrollment_id, status, id);

-- Published academic history and private staff notes are append-only. Application
-- transactions may correct results through a revision and replace reports through
-- a superseding row, but direct destructive mutation is rejected by PostgreSQL.
CREATE FUNCTION protect_progress_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'progress_notes' THEN RAISE EXCEPTION 'progress_notes is append-only' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER progress_notes_append_only BEFORE UPDATE OR DELETE ON progress_notes FOR EACH ROW EXECUTE FUNCTION protect_progress_append_only();
CREATE TRIGGER result_revisions_append_only BEFORE UPDATE OR DELETE ON assessment_result_revisions FOR EACH ROW EXECUTE FUNCTION protect_progress_append_only();


CREATE FUNCTION validate_assessment_result_graph() RETURNS trigger AS $$
DECLARE assessment_class CHAR(26); assessment_max NUMERIC(8,2); enrollment_student CHAR(26); enrollment_class CHAR(26); enrollment_status TEXT;
BEGIN
  SELECT class_id,max_score INTO assessment_class,assessment_max FROM assessments WHERE tenant_id=NEW.tenant_id AND id=NEW.assessment_id;
  SELECT student_id,class_id,status INTO enrollment_student,enrollment_class,enrollment_status FROM enrollments WHERE tenant_id=NEW.tenant_id AND id=NEW.enrollment_id;
  IF enrollment_status = 'TRIAL' THEN RAISE EXCEPTION 'trial enrollments cannot be graded' USING ERRCODE='23514'; END IF;
  IF enrollment_student IS DISTINCT FROM NEW.student_id OR enrollment_class IS DISTINCT FROM assessment_class THEN
    RAISE EXCEPTION 'assessment result enrollment graph is invalid' USING ERRCODE='23514';
  END IF;
  IF NEW.status='GRADED' AND NEW.score > assessment_max THEN RAISE EXCEPTION 'assessment score exceeds maximum' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER assessment_result_graph_check AFTER INSERT OR UPDATE ON assessment_results DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION validate_assessment_result_graph();

CREATE FUNCTION validate_criterion_result_graph() RETURNS trigger AS $$
DECLARE criterion_assessment CHAR(26); criterion_max NUMERIC(8,2); result_assessment CHAR(26);
BEGIN
  SELECT assessment_id,max_score INTO criterion_assessment,criterion_max FROM assessment_criteria WHERE tenant_id=NEW.tenant_id AND id=NEW.criterion_id;
  SELECT assessment_id INTO result_assessment FROM assessment_results WHERE tenant_id=NEW.tenant_id AND id=NEW.assessment_result_id;
  IF criterion_assessment IS DISTINCT FROM result_assessment THEN RAISE EXCEPTION 'criterion does not belong to result assessment' USING ERRCODE='23514'; END IF;
  IF NEW.score > criterion_max THEN RAISE EXCEPTION 'criterion score exceeds maximum' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER criterion_result_graph_check AFTER INSERT OR UPDATE ON assessment_criterion_results DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION validate_criterion_result_graph();


CREATE FUNCTION validate_progress_context_graph() RETURNS trigger AS $$
DECLARE enrollment_student CHAR(26); enrollment_class CHAR(26);
BEGIN
  IF NEW.enrollment_id IS NOT NULL THEN
    SELECT student_id,class_id INTO enrollment_student,enrollment_class FROM enrollments WHERE tenant_id=NEW.tenant_id AND id=NEW.enrollment_id;
    IF enrollment_student IS DISTINCT FROM NEW.student_id OR (NEW.class_id IS NOT NULL AND enrollment_class IS DISTINCT FROM NEW.class_id) THEN
      RAISE EXCEPTION 'progress enrollment context is invalid' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER progress_note_context_check AFTER INSERT OR UPDATE ON progress_notes DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION validate_progress_context_graph();
CREATE CONSTRAINT TRIGGER progress_report_context_check AFTER INSERT OR UPDATE ON progress_reports DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION validate_progress_context_graph();
