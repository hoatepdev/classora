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
const records = {
  alpha: {
    studentId: '01JHZX3V8Q9K5M2N7R4T6W1Y1A',
    classId: '01JHZX3V8Q9K5M2N7R4T6W1Y1B',
  },
  beta: {
    studentId: '01JHZX3V8Q9K5M2N7R4T6W1Y2A',
    classId: '01JHZX3V8Q9K5M2N7R4T6W1Y2B',
  },
};

type EnrollmentRecord = {
  id: string;
  tenantId: string;
  studentId: string;
  classId: string;
  status: 'ACTIVE' | 'WITHDRAWN';
  enrolledAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function enrollmentPool(
  tenantId: string,
  ids: { studentId: string; classId: string },
) {
  const students = new Map([
    [ids.studentId, { id: ids.studentId, tenantId, code: 'ST001', fullName: 'Nguyen Van A' }],
  ]);
  const classes = new Map([
    [ids.classId, { id: ids.classId, tenantId, code: 'CLS001', name: 'English Beginner' }],
  ]);
  const enrollments = new Map<string, EnrollmentRecord>();
  const now = () => new Date('2026-09-15T00:00:00.000Z');

  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('INSERT INTO enrollments')) {
      const [id, requestedTenantId, requestedStudentId, requestedClassId] = values as string[];
      if (!students.has(requestedStudentId)) {
        throw Object.assign(new Error('missing student'), {
          code: '23503',
          constraint: 'enrollments_student_id_fkey',
        });
      }
      if (!classes.has(requestedClassId)) {
        throw Object.assign(new Error('missing class'), {
          code: '23503',
          constraint: 'enrollments_class_id_fkey',
        });
      }
      const existing = [...enrollments.values()].find(
        (row) =>
          row.tenantId === requestedTenantId &&
          row.studentId === requestedStudentId &&
          row.classId === requestedClassId,
      );
      if (existing?.status === 'ACTIVE') return { rows: [] };
      if (existing) {
        existing.status = 'ACTIVE';
        existing.enrolledAt = now();
        existing.updatedAt = now();
        return { rows: [existing] };
      }
      const enrollment: EnrollmentRecord = {
        id,
        tenantId: requestedTenantId,
        studentId: requestedStudentId,
        classId: requestedClassId,
        status: 'ACTIVE',
        enrolledAt: now(),
        createdAt: now(),
        updatedAt: now(),
      };
      enrollments.set(id, enrollment);
      return { rows: [enrollment] };
    }

    if (sql.includes('UPDATE enrollments')) {
      const [requestedTenantId, id] = values;
      const enrollment = enrollments.get(id as string);
      if (enrollment?.tenantId !== requestedTenantId || enrollment.status !== 'ACTIVE') {
        return { rows: [] };
      }
      enrollment.status = 'WITHDRAWN';
      enrollment.updatedAt = now();
      return { rows: [enrollment] };
    }

    if (sql.includes('SELECT 1 FROM enrollments')) {
      const [requestedTenantId, id] = values;
      const enrollment = enrollments.get(id as string);
      return { rows: enrollment?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('SELECT 1 FROM classes')) {
      const [requestedTenantId, requestedClassId] = values;
      const classRecord = classes.get(requestedClassId as string);
      return { rows: classRecord?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('SELECT 1 FROM students')) {
      const [requestedTenantId, requestedStudentId] = values;
      const student = students.get(requestedStudentId as string);
      return { rows: student?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('FROM enrollments e') && sql.includes('e.class_id = $2')) {
      const [requestedTenantId, requestedClassId] = values;
      return {
        rows: [...enrollments.values()]
          .filter(
            (row) => row.tenantId === requestedTenantId && row.classId === requestedClassId,
          )
          .map((row) => ({
            ...row,
            studentCode: students.get(row.studentId)!.code,
            studentFullName: students.get(row.studentId)!.fullName,
          })),
      };
    }

    if (sql.includes('FROM enrollments e') && sql.includes('e.student_id = $2')) {
      const [requestedTenantId, requestedStudentId] = values;
      return {
        rows: [...enrollments.values()]
          .filter(
            (row) => row.tenantId === requestedTenantId && row.studentId === requestedStudentId,
          )
          .map((row) => ({
            ...row,
            classCode: classes.get(row.classId)!.code,
            className: classes.get(row.classId)!.name,
          })),
      };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  return { pool: { query } as unknown as Pool, query, enrollments };
}

describe('enrollments', () => {
  let app: INestApplication;
  let token: string;
  const alpha = enrollmentPool(tenants.alpha.id, records.alpha);
  const beta = enrollmentPool(tenants.beta.id, records.beta);
  const { studentId, classId } = records.alpha;
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

  it('enrolls a Student in a Class and exposes both sides of the relationship', async () => {
    const created = await authorized('post', '/enrollments')
      .send({ studentId, classId })
      .expect(201);

    expect(created.body).toMatchObject({
      tenantId: tenants.alpha.id,
      studentId,
      classId,
      status: 'ACTIVE',
    });
    expect(created.body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    await authorized('get', `/classes/${classId}/students`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          id: created.body.id,
          studentId,
          studentCode: 'ST001',
          studentFullName: 'Nguyen Van A',
          status: 'ACTIVE',
        });
      });

    await authorized('get', `/students/${studentId}/classes`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          id: created.body.id,
          classId,
          classCode: 'CLS001',
          className: 'English Beginner',
          status: 'ACTIVE',
        });
      });
  });

  it('rejects unauthenticated access before acquiring a tenant pool', async () => {
    await request(app.getHttpServer())
      .get(`/classes/${classId}/students`)
      .set('Host', 'alpha.classora.io.vn')
      .expect(401);

    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it('rejects a duplicate active enrollment', async () => {
    await authorized('post', '/enrollments').send({ studentId, classId }).expect(409);
  });

  it('withdraws and re-enrolls the canonical Student-Class enrollment', async () => {
    const enrollment = [...alpha.enrollments.values()][0];

    await authorized('patch', `/enrollments/${enrollment.id}`)
      .send({ status: 'WITHDRAWN' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('WITHDRAWN'));

    await authorized('get', `/students/${studentId}/classes`)
      .expect(200)
      .expect(({ body }) => expect(body[0].status).toBe('WITHDRAWN'));

    await authorized('patch', `/enrollments/${enrollment.id}`)
      .send({ status: 'WITHDRAWN' })
      .expect(409);

    await authorized('post', '/enrollments')
      .send({ studentId, classId })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(enrollment.id);
        expect(body.status).toBe('ACTIVE');
      });
  });

  it('rejects invalid IDs, state, missing records, and client tenant selectors', async () => {
    await authorized('post', '/enrollments')
      .send({ studentId: 'bad-id', classId })
      .expect(400);
    await authorized('post', '/enrollments')
      .send({ studentId, classId, tenantId: tenants.beta.id })
      .expect(400);
    await authorized('patch', `/enrollments/${[...alpha.enrollments.values()][0].id}`)
      .send({ status: 'ACTIVE' })
      .expect(400);
    await authorized('patch', '/enrollments/not-an-id')
      .send({ status: 'WITHDRAWN' })
      .expect(400);
    await authorized('get', '/classes/01JHZX3V8Q9K5M2N7R4T6W9Z9Z/students').expect(404);
    await authorized('get', '/students/01JHZX3V8Q9K5M2N7R4T6W9Z9Y/classes').expect(404);
  });

  it('cannot use or access another tenant database records through guessed IDs', async () => {
    const alphaEnrollment = [...alpha.enrollments.values()][0];

    await authorized('post', '/enrollments', 'beta')
      .send({ studentId, classId: records.beta.classId })
      .expect(404);
    await authorized('post', '/enrollments', 'beta')
      .send({ studentId: records.beta.studentId, classId })
      .expect(404);
    await authorized('get', `/classes/${classId}/students`, 'beta').expect(404);
    await authorized('get', `/students/${studentId}/classes`, 'beta').expect(404);
    await authorized('patch', `/enrollments/${alphaEnrollment.id}`, 'beta')
      .send({ status: 'WITHDRAWN' })
      .expect(404);

    expect(alpha.enrollments.get(alphaEnrollment.id)?.status).toBe('ACTIVE');
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.beta.dbName);
  });

  it('allows matching Student and Class codes in separate tenant databases', async () => {
    await authorized('post', '/enrollments', 'beta')
      .send(records.beta)
      .expect(201)
      .expect(({ body }) => {
        expect(body.tenantId).toBe(tenants.beta.id);
        expect(body.studentId).toBe(records.beta.studentId);
        expect(body.classId).toBe(records.beta.classId);
      });

    expect(beta.enrollments).toHaveLength(1);
    expect(alpha.enrollments).toHaveLength(1);
    expect(connections.releaseConnection).toHaveBeenCalledWith(tenants.beta.dbName, beta.pool);
  });
});
