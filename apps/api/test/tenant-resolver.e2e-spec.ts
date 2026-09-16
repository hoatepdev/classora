import { ExecutionContext, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Pool } from "pg";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { AuthGuard } from "../src/auth/auth.guard.js";
import { ControlDatabaseService } from "../src/database/control-database.service.js";
import { TenantConnectionManager } from "../src/tenant/tenant-connection-manager.service.js";

const tenant = {
  id: "01JHZX3V8Q9K5M2N7R4T6W1Y0A",
  slug: "demo",
  dbName: "classora_tenant_demo",
};

describe("GET /health/tenant", () => {
  let app: INestApplication;
  const query = vi.fn(async () => ({ rows: [{ result: 1 }] }));
  const pool = { query } as unknown as Pool;
  const connections = {
    getConnection: vi.fn(async () => pool),
    releaseConnection: vi.fn(),
  };
  const database = {
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === tenant.slug ? tenant : null,
      ),
    },
    tenantMembership: {
      findUnique: vi.fn(async () => ({ id: "membership-id", role: "OWNER" })),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            id: "user-id",
            email: "owner@example.com",
            name: "Demo Owner",
          };
          return true;
        },
      })
      .overrideProvider(ControlDatabaseService)
      .useValue(database)
      .overrideProvider(TenantConnectionManager)
      .useValue(connections)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  it("returns safe tenant metadata resolved from the hostname", async () => {
    await request(app.getHttpServer())
      .get("/health/tenant")
      .set("Host", "demo.classora.io.vn")
      .expect(200)
      .expect({ tenantId: tenant.id, tenantSlug: tenant.slug });
  });

  it("queries the authorized tenant database", async () => {
    await request(app.getHttpServer())
      .get("/health/tenant/query")
      .set("Host", "demo.classora.io.vn")
      .expect(200)
      .expect({ tenantId: tenant.id, tenantSlug: tenant.slug, result: 1 });

    expect(query).toHaveBeenCalledWith("SELECT 1 AS result");
    expect(connections.getConnection).toHaveBeenCalledWith(tenant.dbName);
    expect(connections.releaseConnection).toHaveBeenCalledWith(
      tenant.dbName,
      pool,
    );
  });

  it.each([
    "api.classora.io.vn",
    "app.classora.io.vn",
    "nested.demo.classora.io.vn",
    "unknown.classora.io.vn",
  ])("rejects the invalid tenant hostname %s", async (hostname) => {
    await request(app.getHttpServer())
      .get("/health/tenant/query")
      .set("Host", hostname)
      .expect(404);
    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it("uses the configured development tenant for non-tenant hostnames", async () => {
    vi.stubEnv("DEV_TENANT_SLUG", tenant.slug);
    await request(app.getHttpServer())
      .get("/health/tenant")
      .set("Host", "localhost:4100")
      .expect(200)
      .expect({ tenantId: tenant.id, tenantSlug: tenant.slug });
  });

  it("rejects non-tenant hostnames without a configured development tenant", async () => {
    vi.stubEnv("DEV_TENANT_SLUG", "");
    await request(app.getHttpServer())
      .get("/health/tenant")
      .set("Host", "localhost:4100")
      .expect(404);
    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it("keeps rejecting non-tenant hostnames in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_TENANT_SLUG", tenant.slug);
    await request(app.getHttpServer())
      .get("/health/tenant")
      .set("Host", "localhost:4100")
      .expect(404);
    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it("keeps rejecting non-tenant hostnames in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await request(app.getHttpServer())
      .get("/health/tenant")
      .set("Host", "localhost:4100")
      .expect(404);
    expect(connections.getConnection).not.toHaveBeenCalled();
  });
});
