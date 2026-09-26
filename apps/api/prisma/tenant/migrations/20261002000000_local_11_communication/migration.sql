-- LOCAL-11: communication templates, messages, and delivery lifecycle.
-- Prior migrations remain unchanged; this migration is safe for fresh and LOCAL-10 tenants.
-- Recipient and related-entity references are polymorphic by design (tenant validation
-- happens in the service before insert), so they intentionally carry no foreign keys.

CREATE TABLE communication_templates (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'SESSION_REMINDER', 'SCHEDULE_CHANGED', 'ATTENDANCE_ABSENCE',
    'TUITION_DUE', 'TUITION_OVERDUE', 'PAYMENT_RECEIVED',
    'TRIAL_REMINDER', 'ENROLLMENT_EXPIRING'
  )),
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL')),
  subject TEXT,
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT communication_templates_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT communication_templates_tenant_event_channel_key UNIQUE (tenant_id, event_type, channel),
  CONSTRAINT communication_templates_email_subject_check CHECK (
    channel <> 'EMAIL' OR (subject IS NOT NULL AND length(btrim(subject)) > 0)
  )
);

CREATE TABLE communication_messages (
  id CHAR(26) PRIMARY KEY,
  tenant_id CHAR(26) NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'SESSION_REMINDER', 'SCHEDULE_CHANGED', 'ATTENDANCE_ABSENCE',
    'TUITION_DUE', 'TUITION_OVERDUE', 'PAYMENT_RECEIVED',
    'TRIAL_REMINDER', 'ENROLLMENT_EXPIRING'
  )),
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL')),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('STUDENT', 'GUARDIAN', 'LEAD', 'MEMBERSHIP')),
  recipient_id CHAR(26),
  recipient_name TEXT,
  destination TEXT,
  subject TEXT,
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  related_entity_type TEXT,
  related_entity_id CHAR(26),
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'CANCELLED')),
  provider TEXT,
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  CONSTRAINT communication_messages_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT communication_messages_tenant_dedupe_key UNIQUE (tenant_id, dedupe_key),
  CONSTRAINT communication_messages_email_destination_check CHECK (
    (channel = 'EMAIL') = (destination IS NOT NULL AND length(btrim(destination)) > 0)
  ),
  CONSTRAINT communication_messages_email_subject_check CHECK (channel <> 'EMAIL' OR subject IS NOT NULL),
  CONSTRAINT communication_messages_sent_requires_sent_at_check CHECK (status <> 'SENT' OR sent_at IS NOT NULL)
);
CREATE INDEX communication_messages_tenant_created_idx ON communication_messages (tenant_id, created_at DESC, id DESC);
CREATE INDEX communication_messages_tenant_status_idx ON communication_messages (tenant_id, status, id);
CREATE INDEX communication_messages_tenant_event_idx ON communication_messages (tenant_id, event_type, id);
CREATE INDEX communication_messages_tenant_channel_idx ON communication_messages (tenant_id, channel, id);
CREATE INDEX communication_messages_tenant_recipient_idx ON communication_messages (tenant_id, recipient_type, recipient_id, id);
CREATE INDEX communication_messages_tenant_related_idx ON communication_messages (tenant_id, related_entity_type, related_entity_id, id);
