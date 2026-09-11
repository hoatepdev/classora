CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

CREATE TABLE "users" (
  "id" CHAR(26) NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_memberships" (
  "id" CHAR(26) NOT NULL,
  "tenant_id" CHAR(26) NOT NULL,
  "user_id" CHAR(26) NOT NULL,
  "role" "TenantRole" NOT NULL,

  CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key"
  ON "tenant_memberships"("tenant_id", "user_id");
CREATE INDEX "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

ALTER TABLE "tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
