CREATE TABLE "audit_events" (
  "id" CHAR(26) NOT NULL,
  "tenant_id" CHAR(26) NOT NULL,
  "actor_user_id" CHAR(26),
  "actor_membership_id" CHAR(26),
  "actor_name" TEXT,
  "actor_email" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" CHAR(26),
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT,
  "request_id" TEXT,
  "metadata" JSONB,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "audit_events_tenant_id_occurred_at_id_idx" ON "audit_events"("tenant_id", "occurred_at", "id");
CREATE INDEX "audit_events_tenant_id_actor_user_id_occurred_at_id_idx" ON "audit_events"("tenant_id", "actor_user_id", "occurred_at", "id");
CREATE INDEX "audit_events_tenant_id_action_occurred_at_id_idx" ON "audit_events"("tenant_id", "action", "occurred_at", "id");
CREATE INDEX "audit_events_tenant_id_entity_type_occurred_at_id_idx" ON "audit_events"("tenant_id", "entity_type", "occurred_at", "id");
CREATE INDEX "audit_events_tenant_id_entity_id_occurred_at_id_idx" ON "audit_events"("tenant_id", "entity_id", "occurred_at", "id");

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TRIGGER audit_events_no_truncate
BEFORE TRUNCATE ON "audit_events"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_event_mutation();
