CREATE TABLE "tenants" (
  "id" CHAR(26) NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "domain" TEXT,
  "db_name" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");
CREATE UNIQUE INDEX "tenants_db_name_key" ON "tenants"("db_name");

INSERT INTO "tenants" ("id", "name", "slug", "db_name")
VALUES ('01JHZX3V8Q9K5M2N7R4T6W1Y0A', 'Demo', 'demo', 'classora_tenant_demo');
