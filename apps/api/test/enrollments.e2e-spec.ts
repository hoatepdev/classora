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
  status: 'PENDING' | 'TRIAL' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'WITHDRAWN' | 'CANCELLED';
  enrolledAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  pauseStartedAt: Date | null;
  expectedEndDate: string | null;
  sourceEnrollmentId: string | null;
  notes: string | null;
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
    [ids.classId, { id: ids.classId, tenantId, code: 'CLS001', name: 'English Beginner', status: 'ACTIVE', capacity: null }],
  ]);
  const enrollments = new Map<string, EnrollmentRecord>();
  const events: unknown[] = [];
  const auditEvents: unknown[] = [];
  const now = () => new Date('2026-09-15T00:00:00.000Z');

  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    if (sql.includes('SELECT status FROM students')) {
      const [requestedTenantId, requestedStudentId] = values as string[];
      const student = students.get(requestedStudentId);
      return student?.tenantId === requestedTenantId ? { rows: [{ status: 'ACTIVE' }] } : { rows: [] };
    }

    if (sql.includes('SELECT status FROM classes')) {
      const [requestedTenantId, requestedClassId] = values as string[];
      const classRecord = classes.get(requestedClassId);
      return classRecord?.tenantId === requestedTenantId ? { rows: [{ status: classRecord.status }] } : { rows: [] };
    }

    if (sql.includes('SELECT capacity FROM classes')) {
      const [requestedTenantId, requestedClassId] = values as string[];
      const classRecord = classes.get(requestedClassId);
      return classRecord?.tenantId === requestedTenantId ? { rows: [{ capacity: classRecord.capacity }] } : { rows: [] };
    }

    if (sql.includes('SELECT COUNT(*)')) {
      const [requestedTenantId, requestedClassId, excludedId] = values as string[];
      const count = [...enrollments.values()].filter((row) =>
        row.tenantId === requestedTenantId && row.classId === requestedClassId &&
        ['PENDING', 'TRIAL', 'ACTIVE', 'PAUSED'].includes(row.status) && row.id !== excludedId,
      ).length;
      return { rows: [{ count: String(count) }] };
    }

    if (sql.includes('INSERT INTO enrollment_events')) {
      events.push(values);
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO audit_events')) {
      auditEvents.push(values);
      return { rows: [] };
    }

    if (sql.includes('SELECT') && sql.includes('FROM enrollments e') && sql.includes('FOR UPDATE')) {
      const [, id] = values as string[];
      const enrollment = enrollments.get(id);
      return { rows: enrollment ? [enrollment] : [] };
    }

    if (sql.includes('INSERT INTO enrollments')) {
      const [id, requestedTenantId, requestedStudentId, requestedClassId, requestedStatus, enrolledAt, startedAt, , sourceEnrollmentId, notes] = values as (string | Date | null)[];
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
      if (existing && ['PENDING', 'TRIAL', 'ACTIVE', 'PAUSED'].includes(existing.status)) return { rows: [] };
      const enrollment: EnrollmentRecord = {
        id: id as string,
        tenantId: requestedTenantId as string,
        studentId: requestedStudentId as string,
        classId: requestedClassId as string,
        status: (requestedStatus as EnrollmentRecord['status']) ?? 'PENDING',
        enrolledAt: enrolledAt ? new Date(enrolledAt) : now(),
        startedAt: startedAt ? new Date(startedAt) : null,
        endedAt: null,
        pauseStartedAt: null,
        expectedEndDate: null,
        sourceEnrollmentId: sourceEnrollmentId as string | null,
        notes: notes as string | null,
        createdAt: now(),
        updatedAt: now(),
      };
      enrollments.set(id, enrollment);
      return { rows: [enrollment] };
    }

    if (sql.includes('UPDATE enrollments')) {
      const [requestedTenantId, id, nextStatus, effectiveAt] = values as (string | Date | null)[];
      const enrollment = enrollments.get(id as string);
      if (!enrollment || enrollment.tenantId !== requestedTenantId) return { rows: [] };
      if (typeof nextStatus === 'string') enrollment.status = nextStatus as EnrollmentRecord['status'];
      if (enrollment.status === 'WITHDRAWN' || enrollment.status === 'COMPLETED' || enrollment.status === 'CANCELLED') enrollment.endedAt = effectiveAt ? new Date(effectiveAt) : now();
      enrollment.updatedAt = now();
      return { rows: [enrollment] };
    }

    if (sql.includes('FROM enrollments e WHERE e.tenant_id=$1 AND e.id=$2')) {
      const [requestedTenantId, id] = values;
      const enrollment = enrollments.get(id as string);
      return { rows: enrollment?.tenantId === requestedTenantId ? [enrollment] : [] };
    }

    if (sql.includes('SELECT 1 FROM enrollments')) {
      const [requestedTenantId, id] = values;
      const enrollment = enrollments.get(id as string);
      return { rows: enrollment?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('FROM enrollment_events')) {
      return { rows: [] };
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

    if (sql.includes('FROM enrollments e') && (sql.includes('e.class_id = $2') || sql.includes('e.class_id=$2'))) {
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

    if (sql.includes('FROM enrollments e') && (sql.includes('e.student_id = $2') || sql.includes('e.student_id=$2'))) {
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

  const client = { query, release: vi.fn() };
  return { pool: { query, connect: vi.fn(async () => client) } as unknown as Pool, query, client, enrollments };
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
      .send({ studentId, classId, status: 'ACTIVE' })
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

    await authorized('post', `/enrollments/${enrollment.id}/reenroll`)
      .send({ studentId, classId, status: 'ACTIVE' })
      .expect(409);

    await authorized('post', `/enrollments/${enrollment.id}/withdraw`)
      .send({ reason: 'Student request' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('WITHDRAWN'));

    await authorized('get', `/students/${studentId}/classes`)
      .expect(200)
      .expect(({ body }) => expect(body[0].status).toBe('WITHDRAWN'));

    await authorized('post', `/enrollments/${enrollment.id}/withdraw`)
      .send({ reason: 'Duplicate withdrawal' })
      .expect(409);

    await authorized('post', `/enrollments/${enrollment.id}/reenroll`)
      .send({ studentId: records.beta.studentId, classId, status: 'ACTIVE' })
      .expect(400);

    await authorized('post', `/enrollments/${enrollment.id}/reenroll`)
      .send({ studentId, classId, status: 'ACTIVE' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).not.toBe(enrollment.id);
        expect(body.status).toBe('ACTIVE');
        expect(body.sourceEnrollmentId).toBe(enrollment.id);
      });
  });

  it('rejects invalid IDs, state, missing records, and client tenant selectors', async () => {
    await authorized('post', '/enrollments')
      .send({ studentId: 'bad-id', classId })
      .expect(400);
    await authorized('post', '/enrollments')
      .send({ studentId, classId, tenantId: tenants.beta.id })
      .expect(400);
    await authorized('post', '/enrollments')
      .send({ studentId, classId, sourceEnrollmentId: [...alpha.enrollments.values()][0].id })
      .expect(400);
    await authorized('post', `/enrollments/${[...alpha.enrollments.values()][0].id}/activate`)
      .send({})
      .expect(409);
    await authorized('post', '/enrollments/not-an-id/withdraw')
      .send({})
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
    await authorized('post', `/enrollments/${alphaEnrollment.id}/withdraw`, 'beta')
      .send({})
      .expect(404);

    expect(alpha.enrollments.get(alphaEnrollment.id)?.status).toBe('WITHDRAWN');
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.beta.dbName);
  });

  it('allows matching Student and Class codes in separate tenant databases', async () => {
    await authorized('post', '/enrollments', 'beta')
      .send({ ...records.beta, status: 'ACTIVE' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.tenantId).toBe(tenants.beta.id);
        expect(body.studentId).toBe(records.beta.studentId);
        expect(body.classId).toBe(records.beta.classId);
      });

    expect(beta.enrollments).toHaveLength(1);
    expect(alpha.enrollments).toHaveLength(2);
    expect(connections.releaseConnection).toHaveBeenCalledWith(tenants.beta.dbName, beta.pool);
  });
});
