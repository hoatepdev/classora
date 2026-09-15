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

type CourseRecord = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
};

type ClassRecord = {
  id: string;
  tenantId: string;
  courseId: string | null;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
};

function coursePool() {
  const rows = new Map<string, CourseRecord>();
  const classes = new Map<string, ClassRecord>();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('INSERT INTO courses')) {
      const now = new Date('2026-09-15T00:00:00.000Z');
      const course: CourseRecord = {
        id: values[0] as string,
        tenantId: values[1] as string,
        code: values[2] as string,
        name: values[3] as string,
        description: values[4] as string | null,
        status: values[5] as CourseRecord['status'],
        createdAt: now,
        updatedAt: now,
      };
      if ([...rows.values()].some((row) => row.tenantId === course.tenantId && row.code === course.code)) {
        throw Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'courses_tenant_id_code_key',
        });
      }
      rows.set(course.id, course);
      return { rows: [course] };
    }

    if (sql.includes('UPDATE courses')) {
      const [tenantId, id, ...updates] = values as [string, string, ...unknown[]];
      const course = rows.get(id);
      if (!course || course.tenantId !== tenantId) return { rows: [] };
      const assignments = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(', updated_at')).split(', ');
      const propertyByColumn: Record<string, keyof CourseRecord> = {
        code: 'code',
        name: 'name',
        description: 'description',
        status: 'status',
      };
      assignments.forEach((assignment, index) => {
        course[propertyByColumn[assignment.split(' = ')[0]]] = updates[index] as never;
      });
      course.updatedAt = new Date('2026-09-15T01:00:00.000Z');
      return { rows: [course] };
    }

    if (sql.includes('FROM classes')) {
      return {
        rows: [...classes.values()]
          .filter((record) => record.tenantId === values[0] && record.courseId === values[1])
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
      };
    }

    if (sql.includes('AND id = $2')) {
      const [tenantId, id] = values;
      const course = rows.get(id as string);
      return { rows: course?.tenantId === tenantId ? [course] : [] };
    }

    return {
      rows: [...rows.values()]
        .filter((course) => course.tenantId === values[0])
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    };
  });
  return { pool: { query } as unknown as Pool, query, rows, classes };
}

describe('courses', () => {
  let app: INestApplication;
  let token: string;
  const alpha = coursePool();
  const beta = coursePool();
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
  beforeEach(() => {
    vi.clearAllMocks();
    alpha.rows.clear();
    alpha.classes.clear();
    beta.rows.clear();
    beta.classes.clear();
  });

  const authorized = (method: 'get' | 'post' | 'patch', path: string, tenant = 'alpha') =>
    request(app.getHttpServer())
      [method](path)
      .set('Host', `${tenant}.classora.io.vn`)
      .set('Authorization', `Bearer ${token}`);

  const createCourse = (tenant = 'alpha', code = 'IELTS-FND') =>
    authorized('post', '/courses', tenant).send({ code, name: 'IELTS Foundation' });

  it('does not give unauthenticated requests a tenant pool', async () => {
    await request(app.getHttpServer())
      .get('/courses')
      .set('Host', 'alpha.classora.io.vn')
      .expect(401);

    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it('creates, lists, gets, edits, and disables a normalized Course', async () => {
    const created = await authorized('post', '/courses')
      .send({ code: ' ielts-fnd ', name: ' IELTS Foundation ', description: '   ' })
      .expect(201);

    expect(created.body).toMatchObject({
      tenantId: tenants.alpha.id,
      code: 'IELTS-FND',
      name: 'IELTS Foundation',
      description: null,
      status: 'ACTIVE',
    });
    expect(created.body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    await authorized('get', '/courses').expect(200).expect(({ body }) => {
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(created.body.id);
    });
    await authorized('get', `/courses/${created.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(created.body.id));
    await authorized('patch', `/courses/${created.body.id}`)
      .send({ name: ' IELTS Foundation 1 ', description: ' Preparation ', status: 'DISABLED' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('IELTS Foundation 1');
        expect(body.description).toBe('Preparation');
        expect(body.status).toBe('DISABLED');
      });
  });

  it('rejects normalized duplicate codes, invalid input, tenant selectors, and empty patches', async () => {
    const created = await createCourse().expect(201);
    await createCourse('alpha', ' ielts-fnd ').expect(409);
    await authorized('post', '/courses')
      .send({ code: '', name: '', status: 'UNKNOWN' })
      .expect(400);
    await authorized('post', '/courses')
      .send({ code: 'OTHER', name: 'Other', tenantId: tenants.beta.id })
      .expect(400);
    await authorized('get', '/courses/not-an-id').expect(400);
    await authorized('patch', `/courses/${created.body.id}`).send({}).expect(400);
    for (const field of ['code', 'name', 'status']) {
      await authorized('patch', `/courses/${created.body.id}`).send({ [field]: null }).expect(400);
    }
  });

  it('lists Classes belonging to a Course after the Course is disabled', async () => {
    const created = await createCourse().expect(201);
    const now = new Date('2026-09-15T00:00:00.000Z');
    alpha.classes.set('01JHZX3V8Q9K5M2N7R4T6W1Y0E', {
      id: '01JHZX3V8Q9K5M2N7R4T6W1Y0E',
      tenantId: tenants.alpha.id,
      courseId: created.body.id,
      code: 'CLS001',
      name: 'Evening T2/T4',
      description: null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    alpha.classes.set('01JHZX3V8Q9K5M2N7R4T6W1Y0F', {
      id: '01JHZX3V8Q9K5M2N7R4T6W1Y0F',
      tenantId: tenants.alpha.id,
      courseId: null,
      code: 'LEGACY',
      name: 'Legacy Class',
      description: null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    await authorized('patch', `/courses/${created.body.id}`).send({ status: 'DISABLED' }).expect(200);

    await authorized('get', `/courses/${created.body.id}/classes`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ code: 'CLS001', courseId: created.body.id });
      });
  });

  it('isolates Course reads, writes, relationships, and code uniqueness by tenant database', async () => {
    const alphaCourse = await createCourse().expect(201);

    await authorized('get', '/courses', 'beta').expect(200).expect([]);
    await authorized('get', `/courses/${alphaCourse.body.id}`, 'beta').expect(404);
    await authorized('patch', `/courses/${alphaCourse.body.id}`, 'beta')
      .send({ name: 'Changed' })
      .expect(404);
    await authorized('get', `/courses/${alphaCourse.body.id}/classes`, 'beta').expect(404);
    await createCourse('beta').expect(201).expect(({ body }) => {
      expect(body.tenantId).toBe(tenants.beta.id);
      expect(body.code).toBe('IELTS-FND');
    });

    expect(alpha.rows.get(alphaCourse.body.id)?.name).toBe('IELTS Foundation');
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.beta.dbName);
  });
});
