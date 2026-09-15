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
const activeCourseId = '01JHZX3V8Q9K5M2N7R4T6W1Y0E';
const disabledCourseId = '01JHZX3V8Q9K5M2N7R4T6W1Y0F';
const betaCourseId = '01JHZX3V8Q9K5M2N7R4T6W1Y0G';

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
  status: 'ACTIVE' | 'DISABLED';
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

function classPool() {
  const rows = new Map<string, ClassRecord>();
  const courses = new Map<string, CourseRecord>();
  const withCourse = (record: ClassRecord) => {
    const course = record.courseId ? courses.get(record.courseId) : undefined;
    return {
      ...record,
      courseCode: course?.code ?? null,
      courseName: course?.name ?? null,
    };
  };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('SELECT status FROM courses')) {
      const [tenantId, id] = values;
      const course = courses.get(id as string);
      return { rows: course?.tenantId === tenantId ? [{ status: course.status }] : [] };
    }

    if (sql.includes('SELECT course_id AS "courseId" FROM classes')) {
      const [tenantId, id] = values;
      const record = rows.get(id as string);
      return { rows: record?.tenantId === tenantId ? [{ courseId: record.courseId }] : [] };
    }

    if (sql.includes('INSERT INTO classes')) {
      const now = new Date('2026-09-14T00:00:00.000Z');
      const classRecord: ClassRecord = {
        id: values[0] as string,
        tenantId: values[1] as string,
        courseId: values[2] as string,
        code: values[3] as string,
        name: values[4] as string,
        description: values[5] as string | null,
        status: values[6] as ClassRecord['status'],
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
      return { rows: [withCourse(classRecord)] };
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
        course_id: 'courseId',
      };
      assignments.forEach((assignment, index) => {
        classRecord[propertyByColumn[assignment.split(' = ')[0]]] = updates[index] as never;
      });
      classRecord.updatedAt = new Date('2026-09-14T01:00:00.000Z');
      return { rows: [withCourse(classRecord)] };
    }

    if (sql.includes('AND c.id = $2')) {
      const [tenantId, id] = values;
      const classRecord = rows.get(id as string);
      return { rows: classRecord?.tenantId === tenantId ? [withCourse(classRecord)] : [] };
    }

    return {
      rows: [...rows.values()]
        .filter((classRecord) => classRecord.tenantId === values[0])
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map(withCourse),
    };
  });

  return { pool: { query } as unknown as Pool, query, rows, courses };
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
    alpha.courses.set(activeCourseId, {
      id: activeCourseId,
      tenantId: tenants.alpha.id,
      code: 'IELTS-FND',
      name: 'IELTS Foundation',
      status: 'ACTIVE',
    });
    alpha.courses.set(disabledCourseId, {
      id: disabledCourseId,
      tenantId: tenants.alpha.id,
      code: 'OLD',
      name: 'Disabled Course',
      status: 'DISABLED',
    });
    beta.courses.set(betaCourseId, {
      id: betaCourseId,
      tenantId: tenants.beta.id,
      code: 'IELTS-FND',
      name: 'Beta IELTS',
      status: 'ACTIVE',
    });

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
      .send({ courseId: activeCourseId, code: ' cls001 ', name: ' English Beginner ', description: '' })
      .expect(201);

    expect(created.body).toMatchObject({
      tenantId: tenants.alpha.id,
      courseId: activeCourseId,
      courseCode: 'IELTS-FND',
      courseName: 'IELTS Foundation',
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
      .send({ courseId: activeCourseId, code: 'CLS002', name: 'Class', tenantId: tenants.beta.id })
      .expect(400);

    const existing = [...alpha.rows.values()][0];
    await authorized('patch', `/classes/${existing.id}`).send({}).expect(400);
  });

  it('maps the Class code constraint to conflict', async () => {
    await authorized('post', '/classes')
      .send({ courseId: activeCourseId, code: 'cls001', name: 'Duplicate' })
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
      .send({ courseId: betaCourseId, code: ' cls001 ', name: 'Beta English' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.tenantId).toBe(tenants.beta.id);
        expect(body.code).toBe('CLS001');
      });
  });

  it('requires an active Course from the same tenant and preserves disabled existing assignments', async () => {
    await authorized('post', '/classes')
      .send({ code: 'MISSING', name: 'Missing Course' })
      .expect(400);
    await authorized('post', '/classes')
      .send({ courseId: '01JHZX3V8Q9K5M2N7R4T6W1Y0H', code: 'UNKNOWN', name: 'Unknown Course' })
      .expect(404);
    await authorized('post', '/classes')
      .send({ courseId: disabledCourseId, code: 'DISABLED', name: 'Disabled Course' })
      .expect(409);
    await authorized('post', '/classes', 'beta')
      .send({ courseId: activeCourseId, code: 'CROSS', name: 'Cross Tenant Course' })
      .expect(404);

    const created = await authorized('post', '/classes')
      .send({ courseId: activeCourseId, code: 'MOVE', name: 'Move Me' })
      .expect(201);
    await authorized('patch', `/classes/${created.body.id}`)
      .send({ courseId: disabledCourseId })
      .expect(409);

    alpha.rows.get(created.body.id)!.courseId = disabledCourseId;
    await authorized('patch', `/classes/${created.body.id}`)
      .send({ name: 'Still Editable' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.courseId).toBe(disabledCourseId);
        expect(body.name).toBe('Still Editable');
      });
  });

  it('keeps migrated Classes without a Course readable', async () => {
    const now = new Date('2026-09-14T00:00:00.000Z');
    const id = '01JHZX3V8Q9K5M2N7R4T6W1Y0J';
    alpha.rows.set(id, {
      id,
      tenantId: tenants.alpha.id,
      courseId: null,
      code: 'LEGACY',
      name: 'Legacy Class',
      description: null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    await authorized('get', `/classes/${id}`).expect(200).expect(({ body }) => {
      expect(body).toMatchObject({ courseId: null, courseCode: null, courseName: null });
    });
  });

  it('validates IDs, required fields, status, and non-nullable patches', async () => {
    await authorized('post', '/classes')
      .send({ courseId: '', code: '', name: '', status: 'UNKNOWN' })
      .expect(400);
    await authorized('get', '/classes/not-an-id').expect(400);

    const existing = [...alpha.rows.values()][0];
    for (const field of ['courseId', 'code', 'name', 'status']) {
      await authorized('patch', `/classes/${existing.id}`)
        .send({ [field]: null })
        .expect(400);
    }
  });
});
