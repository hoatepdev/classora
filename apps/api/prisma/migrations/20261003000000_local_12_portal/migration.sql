CREATE TYPE "PortalSubjectType" AS ENUM ('GUARDIAN', 'STUDENT');
CREATE TYPE "PortalAccessStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "portal_accesses" (
  "id" CHAR(26) NOT NULL,
  "tenant_id" CHAR(26) NOT NULL,
  "user_id" CHAR(26) NOT NULL,
  "subject_type" "PortalSubjectType" NOT NULL,
  "subject_id" CHAR(26) NOT NULL,
  "status" "PortalAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "disabled_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_accesses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "portal_accesses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "portal_accesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "portal_accesses_tenant_id_subject_type_subject_id_key" ON "portal_accesses"("tenant_id", "subject_type", "subject_id");
CREATE INDEX "portal_accesses_tenant_id_user_id_status_idx" ON "portal_accesses"("tenant_id", "user_id", "status");
CREATE INDEX "portal_accesses_user_id_idx" ON "portal_accesses"("user_id");

CREATE TABLE "portal_invitations" (
  "id" CHAR(26) NOT NULL,
  "tenant_id" CHAR(26) NOT NULL,
  "subject_type" "PortalSubjectType" NOT NULL,
  "subject_id" CHAR(26) NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "accepted_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_by_id" CHAR(26) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "portal_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "portal_invitations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "portal_invitations_token_hash_key" ON "portal_invitations"("token_hash");
CREATE UNIQUE INDEX "portal_invitations_one_pending_subject_key"
  ON "portal_invitations"("tenant_id", "subject_type", "subject_id")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;
CREATE INDEX "portal_invitations_tenant_subject_expires_idx" ON "portal_invitations"("tenant_id", "subject_type", "subject_id", "expires_at");
CREATE INDEX "portal_invitations_tenant_lifecycle_idx" ON "portal_invitations"("tenant_id", "revoked_at", "accepted_at");
