CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');

ALTER TYPE "TenantRole" RENAME TO "TenantRole_old";
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'CENTER_ADMIN', 'ACADEMIC_MANAGER', 'ACCOUNTANT', 'SALE', 'STAFF', 'TEACHER');
ALTER TABLE "tenant_memberships" ALTER COLUMN "role" TYPE "TenantRole" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'CENTER_ADMIN'::"TenantRole"
    ELSE "role"::text::"TenantRole"
  END
);
DROP TYPE "TenantRole_old";

ALTER TABLE "tenant_memberships"
  ADD COLUMN "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "disabled_at" TIMESTAMPTZ,
  ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "tenant_memberships_tenant_id_status_idx" ON "tenant_memberships"("tenant_id", "status");

CREATE TABLE "tenant_invitations" (
  "id" CHAR(26) NOT NULL,
  "tenant_id" CHAR(26) NOT NULL,
  "email" TEXT NOT NULL,
  "role" "TenantRole" NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "accepted_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_by_id" CHAR(26) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tenant_invitations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tenant_invitations_token_hash_key" ON "tenant_invitations"("token_hash");
CREATE INDEX "tenant_invitations_tenant_id_email_expires_at_idx" ON "tenant_invitations"("tenant_id", "email", "expires_at");
CREATE INDEX "tenant_invitations_tenant_id_revoked_at_accepted_at_idx" ON "tenant_invitations"("tenant_id", "revoked_at", "accepted_at");
