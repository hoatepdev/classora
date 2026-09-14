import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';

const user = {
  id: '01JHZX3V8Q9K5M2N7R4T6W1Y0B',
  email: 'owner@example.com',
  name: 'Owner',
  status: 'ACTIVE' as const,
};
const tenants = {
  alpha: {
    id: '01JHZX3V8Q9K5M2N7R4T6W1Y0A',
    slug: 'alpha',
    dbName: 'classora_tenant_alpha',
  },
  beta: {
    id: '01JHZX3V8Q9K5M2N7R4T6W1Y0C',
    slug: 'beta',
    dbName: 'classora_tenant_beta',
  },
};

type ClassRecord = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
};

function classPool() {
  const rows = new Map<string, ClassRecord>();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('INSERT INTO classes')) {
      const now = new Date('2026-09-14T00:00:00.000Z');
      const classRecord: ClassRecord = {
        id: values[0] as string,
        tenantId: values[1] as string,
        code: values[2] as string,
        name: values[3] as string,
        description: values[4] as string | null,
        status: values[5] as ClassRecord['status'],
        createdAt: now,
        updatedAt: now,
      };
      if (
        [...rows.values()].some(
          (row) => row.tenantId === classRecord.tenantId && row.code === classRecord.code,
        )
      ) {
        throw Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'classes_tenant_id_code_key',
        });
      }
      rows.set(classRecord.id, classRecord);
      return { rows: [classRecord] };
    }

    if (sql.includes('UPDATE classes')) {
      const [tenantId, id, ...updates] = values as [string, string, ...unknown[]];
      const classRecord = rows.get(id);
      if (!classRecord || classRecord.tenantId !== tenantId) return { rows: [] };
      const assignments = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(', updated_at')).split(', ');
      const propertyByColumn: Record<string, keyof ClassRecord> = {
        code: 'code',
        name: 'name',
        description: 'description',
        status: 'status',
      };
      assignments.forEach((assignment, index) => {
        classRecord[propertyByColumn[assignment.split(' = ')[0]]] = updates[index] as never;
      });
      classRecord.updatedAt = new Date('2026-09-14T01:00:00.000Z');
      return { rows: [classRecord] };
    }

    if (sql.includes('AND id = $2')) {
      const [tenantId, id] = values;
      const classRecord = rows.get(id as string);
      return { rows: classRecord?.tenantId === tenantId ? [classRecord] : [] };
    }

    return {
      rows: [...rows.values()]
        .filter((classRecord) => classRecord.tenantId === values[0])
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    };
  });

  return { pool: { query } as unknown as Pool, query, rows };
}

describe('classes', () => {
  let app: INestApplication;
  let token: string;
  const alpha = classPool();
  const beta = classPool();
  const pools = new Map([
    [tenants.alpha.dbName, alpha.pool],
    [tenants.beta.dbName, beta.pool],
  ]);
  const connections = {
    getConnection: vi.fn(async (dbName: string) => pools.get(dbName)),
    releaseConnection: vi.fn(),
  };
  const database = {
    user: { findUnique: vi.fn(async () => user) },
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { slug: keyof typeof tenants } }) => {
        const tenant = tenants[where.slug];
        return tenant ? { ...tenant, name: tenant.slug } : null;
      }),
    },
    tenantMembership: {
      findUnique: vi.fn(async () => ({ id: '01JHZX3V8Q9K5M2N7R4T6W1Y0D', role: 'OWNER' })),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ControlDatabaseService)
      .useValue(database)
      .overrideProvider(TenantConnectionManager)
      .useValue(connections)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    token = await app.get(JwtService).signAsync({ sub: user.id });
  });

  afterAll(() => app.close());
  beforeEach(() => vi.clearAllMocks());

  const authorized = (method: 'get' | 'post' | 'patch', path: string, tenant = 'alpha') =>
    request(app.getHttpServer())
      [method](path)
      .set('Host', `${tenant}.classora.io.vn`)
      .set('Authorization', `Bearer ${token}`);

  it('does not give unauthenticated requests a tenant pool', async () => {
    await request(app.getHttpServer())
      .get('/classes')
      .set('Host', 'alpha.classora.io.vn')
      .expect(401);

    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it('creates, lists, gets, and edits a Class in the trusted tenant', async () => {
    const created = await authorized('post', '/classes')
      .send({ code: ' cls001 ', name: ' English Beginner ', description: '' })
      .expect(201);

    expect(created.body).toMatchObject({
      tenantId: tenants.alpha.id,
      code: 'CLS001',
      name: 'English Beginner',
      description: null,
      status: 'ACTIVE',
    });
    expect(created.body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    await authorized('get', '/classes').expect(200).expect(({ body }) => {
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(created.body.id);
    });

    await authorized('get', `/classes/${created.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(created.body.id));

    await authorized('patch', `/classes/${created.body.id}`)
      .send({ name: ' English Elementary ', description: '   ', status: 'DISABLED' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('English Elementary');
        expect(body.description).toBeNull();
        expect(body.status).toBe('DISABLED');
      });

    expect(alpha.query.mock.calls.some(([, values]) => values?.includes(tenants.alpha.id))).toBe(true);
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.alpha.dbName);
    expect(connections.releaseConnection).toHaveBeenCalledWith(tenants.alpha.dbName, alpha.pool);
  });

  it('rejects client tenant selectors and empty patches', async () => {
    await authorized('post', '/classes')
      .send({ code: 'CLS002', name: 'Class', tenantId: tenants.beta.id })
      .expect(400);

    const existing = [...alpha.rows.values()][0];
    await authorized('patch', `/classes/${existing.id}`).send({}).expect(400);
  });

  it('maps the Class code constraint to conflict', async () => {
    await authorized('post', '/classes')
      .send({ code: 'cls001', name: 'Duplicate' })
      .expect(409);
  });

  it('cannot list, read, or patch a Class through another tenant pool', async () => {
    const alphaClass = [...alpha.rows.values()][0];

    await authorized('get', '/classes', 'beta')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual([]));
    await authorized('get', `/classes/${alphaClass.id}`, 'beta').expect(404);
    await authorized('patch', `/classes/${alphaClass.id}`, 'beta')
      .send({ name: 'Changed' })
      .expect(404);

    expect(alpha.rows.get(alphaClass.id)?.name).toBe('English Elementary');
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.beta.dbName);
  });

  it('allows the same code in separate tenant databases', async () => {
    await authorized('post', '/classes', 'beta')
      .send({ code: ' cls001 ', name: 'Beta English' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.tenantId).toBe(tenants.beta.id);
        expect(body.code).toBe('CLS001');
      });
  });

  it('validates IDs, required fields, status, and non-nullable patches', async () => {
    await authorized('post', '/classes')
      .send({ code: '', name: '', status: 'UNKNOWN' })
      .expect(400);
    await authorized('get', '/classes/not-an-id').expect(400);

    const existing = [...alpha.rows.values()][0];
    for (const field of ['code', 'name', 'status']) {
      await authorized('patch', `/classes/${existing.id}`)
        .send({ [field]: null })
        .expect(400);
    }
  });
});
