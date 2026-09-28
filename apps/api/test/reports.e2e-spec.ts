import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';

const ids = {
  owner: '01JHZX3V8Q9K5M2N7R4T6W1Y0B',
  accountant: '01JHZX3V8Q9K5M2N7R4T6W1Y0C',
  sale: '01JHZX3V8Q9K5M2N7R4T6W1Y0D',
  teacher: '01JHZX3V8Q9K5M2N7R4T6W1Y0E',
  portalOnly: '01JHZX3V8Q9K5M2N7R4T6W1Y0G',
};
const tenant = { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0A', slug: 'alpha', dbName: 'classora_tenant_alpha' };
const roles: Record<string, string> = {
  [ids.owner]: 'OWNER',
  [ids.accountant]: 'ACCOUNTANT',
  [ids.sale]: 'SALE',
  [ids.teacher]: 'TEACHER',
};

function user(id: string) {
  return { id, email: `${id}@example.test`, name: id, status: 'ACTIVE' };
}

describe('reports authorization and catalog', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const query = vi.fn(async () => ({ rows: [] }));
  const pool = { query } as unknown as Pool;
  const database = {
    user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => user(where.id)) },
    tenant: { findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => where.slug === tenant.slug ? { ...tenant, name: 'Alpha' } : null) },
    tenantMembership: {
      findUnique: vi.fn(async ({ where }: { where: { tenantId_userId: { userId: string } } }) => {
        const role = roles[where.tenantId_userId.userId];
        return role ? { id: `membership-${role}`, role } : null;
      }),
      findMany: vi.fn(async () => []),
    },
  };
  const connections = { getConnection: vi.fn(async () => pool), releaseConnection: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ControlDatabaseService)
      .useValue(database)
      .overrideProvider(TenantConnectionManager)
      .useValue(connections)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => vi.clearAllMocks());

  const token = (id: string) => jwt.signAsync({ sub: id });
  const get = async (id: string, path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${await token(id)}`).set('Host', `${tenant.slug}.classora.io.vn`);

  it('filters the fixed catalog by domain permissions', async () => {
    const owner = await get(ids.owner, '/reports/catalog');
    const accountant = await get(ids.accountant, '/reports/catalog');
    const sale = await get(ids.sale, '/reports/catalog');
    const teacher = await get(ids.teacher, '/reports/catalog');

    expect(owner.status).toBe(200);
    expect(owner.body).toHaveLength(11);
    expect(accountant.body.map((item: { key: string }) => item.key)).toEqual(['finance', 'receivables', 'payments']);
    expect(sale.body.map((item: { key: string }) => item.key)).toEqual(['crm']);
    expect(teacher.body.map((item: { key: string }) => item.key)).toEqual(['attendance', 'progress']);
  });

  it('denies portal-only identities at the staff route boundary', async () => {
    const response = await get(ids.portalOnly, '/reports/catalog');
    expect(response.status).toBe(403);
  });

  it('denies unauthorized report and CSV calls before tenant SQL', async () => {
    const report = await get(ids.sale, '/reports/finance?from=2026-09-01&to=2026-09-30');
    const csv = await get(ids.sale, '/reports/finance/export.csv?from=2026-09-01&to=2026-09-30');

    expect(report.status).toBe(403);
    expect(csv.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unknown reports and invalid ranges without SQL', async () => {
    const unknown = await get(ids.owner, '/reports/not-real?from=2026-09-01&to=2026-09-30');
    const reversed = await get(ids.owner, '/reports/attendance?from=2026-10-01&to=2026-09-30');
    const unbounded = await get(ids.owner, '/reports/attendance?from=2024-01-01&to=2026-09-30');
    const tooLarge = await get(ids.owner, '/reports/attendance?from=2026-09-01&to=2026-09-30&pageSize=201');

    expect(unknown.status).toBe(404);
    expect(reversed.status).toBe(400);
    expect(unbounded.status).toBe(400);
    expect(tooLarge.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
