-- LOCAL-10: CRM lead lifecycle, trial bookings over the real Session/Enrollment/Attendance system.
-- Prior migrations remain unchanged; this migration is safe for fresh and LOCAL-09 tenants.

CREATE TABLE leads (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'WON', 'LOST')),
  student_name TEXT NOT NULL CHECK (length(btrim(student_name)) > 0),
  student_phone TEXT,
  student_email TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  source TEXT CHECK (source IN ('REFERRAL', 'FACEBOOK', 'GOOGLE', 'WALK_IN', 'EXISTING_CUSTOMER', 'OTHER')),
  campaign TEXT,
  interested_course_id CHAR(26),
  interested_course_level_id CHAR(26),
  preferred_branch_id CHAR(26),
  assigned_membership_id CHAR(26),
  next_follow_up_at TIMESTAMPTZ,
  converted_student_id CHAR(26),
  converted_guardian_id CHAR(26),
  converted_enrollment_id CHAR(26),
  lost_reason TEXT CHECK (lost_reason IN ('PRICE', 'SCHEDULE', 'NO_RESPONSE', 'COMPETITOR', 'NOT_INTERESTED', 'LOCATION', 'OTHER')),
  lost_reason_detail TEXT,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT leads_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT leads_course_fkey FOREIGN KEY (tenant_id, interested_course_id) REFERENCES courses (tenant_id, id),
  CONSTRAINT leads_course_level_fkey FOREIGN KEY (tenant_id, interested_course_level_id) REFERENCES course_levels (tenant_id, id),
  CONSTRAINT leads_branch_fkey FOREIGN KEY (tenant_id, preferred_branch_id) REFERENCES branches (tenant_id, id),
  CONSTRAINT leads_converted_student_fkey FOREIGN KEY (tenant_id, converted_student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT leads_converted_guardian_fkey FOREIGN KEY (tenant_id, converted_guardian_id) REFERENCES guardians (tenant_id, id),
  CONSTRAINT leads_converted_enrollment_fkey FOREIGN KEY (tenant_id, converted_enrollment_id) REFERENCES enrollments (tenant_id, id),
  CONSTRAINT leads_lost_reason_required_check CHECK (status <> 'LOST' OR lost_reason IS NOT NULL),
  CONSTRAINT leads_won_requires_enrollment_check CHECK (status <> 'WON' OR converted_enrollment_id IS NOT NULL),
  CONSTRAINT leads_won_lost_exclusive_check CHECK (NOT (won_at IS NOT NULL AND lost_at IS NOT NULL)),
  CONSTRAINT leads_lost_fields_check CHECK (
    (status = 'LOST' AND lost_at IS NOT NULL AND won_at IS NULL)
    OR (status = 'WON' AND won_at IS NOT NULL AND lost_at IS NULL)
    OR (status NOT IN ('WON', 'LOST') AND won_at IS NULL AND lost_at IS NULL)
  ),
  CONSTRAINT leads_converted_only_when_done_check CHECK (
    status IN ('WON', 'LOST') OR (converted_student_id IS NULL AND converted_guardian_id IS NULL AND converted_enrollment_id IS NULL)
  ),
  CONSTRAINT leads_course_level_course_match_check CHECK (interested_course_level_id IS NULL OR interested_course_id IS NOT NULL)
);
CREATE INDEX leads_tenant_status_idx ON leads (tenant_id, status, id);
CREATE INDEX leads_tenant_assignee_idx ON leads (tenant_id, assigned_membership_id, status, id);
CREATE INDEX leads_tenant_follow_up_idx ON leads (tenant_id, next_follow_up_at, id);
CREATE INDEX leads_tenant_course_idx ON leads (tenant_id, interested_course_id, id);
CREATE INDEX leads_tenant_branch_idx ON leads (tenant_id, preferred_branch_id, id);
CREATE INDEX leads_tenant_created_idx ON leads (tenant_id, created_at DESC, id DESC);

CREATE TABLE lead_notes (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  lead_id CHAR(26) NOT NULL,
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  author_user_id CHAR(26),
  author_membership_id CHAR(26),
  author_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lead_notes_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT lead_notes_tenant_lead_fkey FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id)
);
CREATE INDEX lead_notes_tenant_lead_timeline_idx ON lead_notes (tenant_id, lead_id, created_at DESC, id DESC);

CREATE TABLE lead_events (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  lead_id CHAR(26) NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'CREATED', 'UPDATED', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'FOLLOW_UP_CHANGED', 'NOTE_ADDED',
    'TRIAL_BOOKED', 'TRIAL_CANCELLED', 'TRIAL_COMPLETED', 'TRIAL_OUTCOME', 'CONVERTED', 'LOST'
  )),
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  metadata JSONB,
  actor_user_id CHAR(26),
  actor_membership_id CHAR(26),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lead_events_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT lead_events_tenant_lead_fkey FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id),
  CONSTRAINT lead_events_status_values_check CHECK (from_status IS NULL OR from_status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'WON', 'LOST')),
  CONSTRAINT lead_events_to_status_values_check CHECK (to_status IS NULL OR to_status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'WON', 'LOST'))
);
CREATE INDEX lead_events_tenant_lead_timeline_idx ON lead_events (tenant_id, lead_id, occurred_at, id);

CREATE TABLE trial_bookings (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  lead_id CHAR(26) NOT NULL,
  session_id CHAR(26) NOT NULL,
  student_id CHAR(26) NOT NULL,
  guardian_id CHAR(26),
  trial_enrollment_id CHAR(26) NOT NULL,
  status TEXT NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'COMPLETED', 'NO_SHOW', 'CANCELLED')),
  outcome TEXT CHECK (outcome IN ('ENROLL', 'FOLLOW_UP', 'LOST')),
  outcome_notes TEXT,
  cancel_reason TEXT,
  booked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT trial_bookings_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT trial_bookings_tenant_lead_fkey FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id),
  CONSTRAINT trial_bookings_tenant_session_fkey FOREIGN KEY (tenant_id, session_id) REFERENCES attendance_sessions (tenant_id, id),
  CONSTRAINT trial_bookings_tenant_student_fkey FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
  CONSTRAINT trial_bookings_tenant_guardian_fkey FOREIGN KEY (tenant_id, guardian_id) REFERENCES guardians (tenant_id, id),
  CONSTRAINT trial_bookings_tenant_enrollment_fkey FOREIGN KEY (tenant_id, trial_enrollment_id) REFERENCES enrollments (tenant_id, id),
  CONSTRAINT trial_bookings_outcome_consistency_check CHECK (outcome IS NULL OR status IN ('COMPLETED', 'NO_SHOW')),
  CONSTRAINT trial_bookings_completed_fields_check CHECK (
    (status = 'BOOKED' AND cancelled_at IS NULL AND completed_at IS NULL)
    OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND completed_at IS NULL)
    OR (status IN ('COMPLETED', 'NO_SHOW') AND completed_at IS NOT NULL AND cancelled_at IS NULL)
  )
);
CREATE UNIQUE INDEX trial_bookings_one_active_per_lead_key ON trial_bookings (tenant_id, lead_id) WHERE status = 'BOOKED';
CREATE INDEX trial_bookings_tenant_lead_status_idx ON trial_bookings (tenant_id, lead_id, status, id);
CREATE INDEX trial_bookings_tenant_session_idx ON trial_bookings (tenant_id, session_id, status, id);
