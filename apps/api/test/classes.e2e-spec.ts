import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuditService } from '../src/audit/audit.service.js';
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
  branchId: string | null;
  courseLevelId: string | null;
  defaultRoomId: string | null;
  primaryTeacherId: string | null;
  capacity: number | null;
  startDate: string | null;
  expectedEndDate: string | null;
  completedOn?: string | null;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'COMPLETED';
  createdAt: Date;
  updatedAt: Date;
};

type RefRecord = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  courseId?: string;
  branchId?: string;
};

function classPool() {
  const rows = new Map<string, ClassRecord>();
  const courses = new Map<string, CourseRecord>();
  const branches = new Map<string, RefRecord>();
  const levels = new Map<string, RefRecord>();
  const rooms = new Map<string, RefRecord>();
  const teachers = new Map<string, RefRecord>();
  const teacherBranches = new Set<string>();
  const futureSessions = new Set<string>();
  const withRefs = (record: ClassRecord) => {
    const course = record.courseId ? courses.get(record.courseId) : undefined;
    const branch = record.branchId ? branches.get(record.branchId) : undefined;
    const level = record.courseLevelId ? levels.get(record.courseLevelId) : undefined;
    const room = record.defaultRoomId ? rooms.get(record.defaultRoomId) : undefined;
    const teacher = record.primaryTeacherId ? teachers.get(record.primaryTeacherId) : undefined;
    return {
      ...record,
      courseCode: course?.code ?? null,
      courseName: course?.name ?? null,
      branchCode: branch?.code ?? null,
      branchName: branch?.name ?? null,
      courseLevelCode: level?.code ?? null,
      courseLevelName: level?.name ?? null,
      defaultRoomCode: room?.code ?? null,
      primaryTeacherCode: teacher?.code ?? null,
      primaryTeacherName: teacher?.name ?? null,
    };
  };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('SELECT status') && sql.includes('FROM courses')) {
      const [tenantId, id] = values;
      const course = courses.get(id as string);
      return { rows: course?.tenantId === tenantId ? [{ status: course.status }] : [] };
    }

    if (sql.includes('FROM course_levels')) {
      const [tenantId, id] = values;
      const level = levels.get(id as string);
      return { rows: level?.tenantId === tenantId ? [{ courseId: level.courseId, status: level.status }] : [] };
    }

    if (sql.includes('FROM rooms')) {
      const [tenantId, id] = values;
      const room = rooms.get(id as string);
      return { rows: room?.tenantId === tenantId ? [{ branchId: room.branchId, status: room.status }] : [] };
    }

    if (sql.includes('FROM teachers')) {
      const [tenantId, id] = values;
      const teacher = teachers.get(id as string);
      return { rows: teacher?.tenantId === tenantId ? [{ status: teacher.status }] : [] };
    }

    if (sql.includes('FROM teacher_branches')) {
      const [tenantId, teacherId, branchId] = values as string[];
      return { rows: teacherBranches.has(`${tenantId}:${teacherId}:${branchId}`) ? [{ ok: 1 }] : [] };
    }

    if (sql.includes('FROM branches')) {
      const [tenantId, id] = values;
      const branch = branches.get(id as string);
      return { rows: branch?.tenantId === tenantId ? [{ status: branch.status }] : [] };
    }

    if (sql.includes('SELECT course_id AS "courseId"') && sql.includes('FROM classes')) {
      const [tenantId, id] = values;
      const record = rows.get(id as string);
      return { rows: record?.tenantId === tenantId ? [{ courseId: record.courseId }] : [] };
    }

    if (sql.includes('INSERT INTO classes')) {
      const now = new Date('2026-09-14T00:00:00.000Z');
      const legacy = values.length <= 7;
      const classRecord: ClassRecord = legacy
        ? {
            id: values[0] as string,
            tenantId: values[1] as string,
            courseId: values[2] as string,
            branchId: null,
            courseLevelId: null,
            defaultRoomId: null,
            primaryTeacherId: null,
            capacity: null,
            startDate: null,
            expectedEndDate: null,
            code: values[3] as string,
            name: values[4] as string,
            description: values[5] as string | null,
            status: values[6] as ClassRecord['status'],
            createdAt: now,
            updatedAt: now,
          }
        : {
            id: values[0] as string,
            tenantId: values[1] as string,
            courseId: values[2] as string,
            branchId: values[3] as string | null,
            courseLevelId: values[4] as string | null,
            defaultRoomId: values[5] as string | null,
            primaryTeacherId: values[6] as string | null,
            code: values[7] as string,
            name: values[8] as string,
            description: values[9] as string | null,
            capacity: values[10] as number | null,
            startDate: values[11] as string | null,
            expectedEndDate: values[12] as string | null,
            status: values[13] as ClassRecord['status'],
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
      return { rows: [withRefs(classRecord)] };
    }

    if (sql.includes('FROM attendance_sessions')) {
      const [tenantId, classId] = values as string[];
      return { rows: futureSessions.has(`${tenantId}:${classId}`) ? [{ ok: 1 }] : [] };
    }

    if (sql.includes("SET status='COMPLETED'")) {
      const [tenantId, id, completedOn] = values as string[];
      const classRecord = rows.get(id);
      if (!classRecord || classRecord.tenantId !== tenantId) return { rows: [] };
      classRecord.status = 'COMPLETED';
      classRecord.completedOn = completedOn;
      classRecord.updatedAt = new Date('2026-09-14T01:00:00.000Z');
      return { rows: [] };
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
        branch_id: 'branchId',
        course_level_id: 'courseLevelId',
        default_room_id: 'defaultRoomId',
        primary_teacher_id: 'primaryTeacherId',
        capacity: 'capacity',
        start_date: 'startDate',
        expected_end_date: 'expectedEndDate',
      };
      assignments.forEach((assignment, index) => {
        classRecord[propertyByColumn[assignment.split(' = ')[0]]] = updates[index] as never;
      });
      classRecord.updatedAt = new Date('2026-09-14T01:00:00.000Z');
      return { rows: [withRefs(classRecord)] };
    }

    if (sql.includes('AND c.id = $2')) {
      const [tenantId, id] = values;
      const classRecord = rows.get(id as string);
      return { rows: classRecord && classRecord.tenantId === tenantId ? [withRefs(classRecord)] : [] };
    }

    return {
      rows: [...rows.values()]
        .filter((classRecord) => classRecord.tenantId === values[0])
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map(withRefs),
    };
  });

  const release = vi.fn();
  const pool = {
    query,
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as Pool;

  return { pool, query, release, rows, courses, branches, levels, rooms, teachers, teacherBranches, futureSessions };
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

    expect(alpha.release.mock.invocationCallOrder.at(-1)).toBeLessThan(
      alpha.query.mock.invocationCallOrder.at(-1)!,
    );
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
    expect(
      alpha.query.mock.calls.some(
        ([sql]) =>
          sql.includes('SELECT status') && sql.includes('FROM courses') && sql.includes('FOR SHARE'),
      ),
    ).toBe(true);
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
      branchId: null,
      courseLevelId: null,
      defaultRoomId: null,
      primaryTeacherId: null,
      capacity: null,
      startDate: null,
      expectedEndDate: null,
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

  it('creates relationship-aware Classes and rejects invalid references', async () => {
    const audit = app.get(AuditService);
    const record = vi.spyOn(audit, 'recordTenant');
    const branchId = '01JHZX3V8Q9K5M2N7R4T6W1Y0K';
    const otherBranchId = '01JHZX3V8Q9K5M2N7R4T6W1Y0L';
    const levelId = '01JHZX3V8Q9K5M2N7R4T6W1Y0M';
    const otherLevelId = '01JHZX3V8Q9K5M2N7R4T6W1Y0N';
    const roomId = '01JHZX3V8Q9K5M2N7R4T6W1Y0P';
    const otherRoomId = '01JHZX3V8Q9K5M2N7R4T6W1Y0Q';
    const teacherId = '01JHZX3V8Q9K5M2N7R4T6W1Y0R';
    const unassignedTeacherId = '01JHZX3V8Q9K5M2N7R4T6W1Y0S';
    const rowsBefore = alpha.rows.size;
    alpha.branches.set(branchId, { id: branchId, tenantId: tenants.alpha.id, code: 'QN1', name: 'Quan 1', status: 'ACTIVE' });
    alpha.branches.set(otherBranchId, { id: otherBranchId, tenantId: tenants.alpha.id, code: 'QN2', name: 'Quan 2', status: 'ACTIVE' });
    alpha.levels.set(levelId, { id: levelId, tenantId: tenants.alpha.id, code: 'B1', name: 'B1', status: 'ACTIVE', courseId: activeCourseId });
    alpha.levels.set(otherLevelId, { id: otherLevelId, tenantId: tenants.alpha.id, code: 'X1', name: 'X1', status: 'ACTIVE', courseId: disabledCourseId });
    alpha.rooms.set(roomId, { id: roomId, tenantId: tenants.alpha.id, code: 'R1', name: 'Room 1', status: 'ACTIVE', branchId });
    alpha.rooms.set(otherRoomId, { id: otherRoomId, tenantId: tenants.alpha.id, code: 'R2', name: 'Room 2', status: 'ACTIVE', branchId: otherBranchId });
    alpha.teachers.set(teacherId, { id: teacherId, tenantId: tenants.alpha.id, code: 'GV1', name: 'Teacher 1', status: 'ACTIVE' });
    alpha.teachers.set(unassignedTeacherId, { id: unassignedTeacherId, tenantId: tenants.alpha.id, code: 'GV2', name: 'Teacher 2', status: 'ACTIVE' });
    alpha.teacherBranches.add(`${tenants.alpha.id}:${teacherId}:${branchId}`);

    const created = await authorized('post', '/classes')
      .send({
        courseId: activeCourseId,
        branchId,
        courseLevelId: levelId,
        defaultRoomId: roomId,
        primaryTeacherId: teacherId,
        capacity: 20,
        startDate: '2026-10-01',
        expectedEndDate: '2027-01-31',
        code: 'REL1',
        name: 'Relational Class',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      branchCode: 'QN1',
      courseLevelCode: 'B1',
      defaultRoomCode: 'R1',
      primaryTeacherCode: 'GV1',
      capacity: 20,
      startDate: '2026-10-01',
      expectedEndDate: '2027-01-31',
    });
    expect(record.mock.calls.some(([, event]) => event.action === 'class.created' && event.entityType === 'CLASS')).toBe(true);

    await authorized('post', '/classes').send({ courseId: activeCourseId, branchId, defaultRoomId: otherRoomId, code: 'BADROOM', name: 'x' }).expect(400);
    await authorized('post', '/classes').send({ courseId: activeCourseId, branchId, courseLevelId: otherLevelId, code: 'BADLEVEL', name: 'x' }).expect(400);
    await authorized('post', '/classes').send({ courseId: activeCourseId, branchId, primaryTeacherId: unassignedTeacherId, code: 'BADTEACHER', name: 'x' }).expect(400);
    await authorized('post', '/classes').send({ courseId: activeCourseId, branchId, capacity: 0, code: 'BADCAP', name: 'x' }).expect(400);
    await authorized('post', '/classes').send({ courseId: activeCourseId, branchId, startDate: '2027-02-01', expectedEndDate: '2027-01-01', code: 'BADDATES', name: 'x' }).expect(400);
    await authorized('post', '/classes').send({ courseId: activeCourseId, branchId: '01JHZX3V8Q9K5M2N7R4T6W1Y0T', code: 'NOBRANCH', name: 'x' }).expect(404);
    await authorized('post', '/classes', 'beta').send({ courseId: activeCourseId, branchId, code: 'CROSS', name: 'x' }).expect(404);
    expect(alpha.rows.size).toBe(rowsBefore + 1);
  });

  it('completes only active Classes without later operational Sessions', async () => {
    const audit = app.get(AuditService);
    const record = vi.spyOn(audit, 'recordTenant');
    const created = await authorized('post', '/classes')
      .send({ courseId: activeCourseId, code: 'DONE1', name: 'Completable', startDate: '2026-09-01' })
      .expect(201);

    record.mockClear();
    await authorized('post', `/classes/${created.body.id}/complete`)
      .send({ completedOn: '2026-09-30' })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'COMPLETED', completedOn: '2026-09-30' }));
    expect(record.mock.calls.some(([, event]) => event.action === 'class.completed')).toBe(true);

    await authorized('patch', `/classes/${created.body.id}`).send({ name: 'Changed' }).expect(409);
    await authorized('post', `/classes/${created.body.id}/complete`).send({ completedOn: '2026-10-01' }).expect(409);
    await authorized('post', `/classes/${created.body.id}/complete`, 'beta').send({ completedOn: '2026-09-30' }).expect(404);

    const blocked = await authorized('post', '/classes')
      .send({ courseId: activeCourseId, code: 'DONE2', name: 'Blocked', startDate: '2026-09-01' })
      .expect(201);
    alpha.futureSessions.add(`${tenants.alpha.id}:${blocked.body.id}`);
    await authorized('post', `/classes/${blocked.body.id}/complete`).send({ completedOn: '2026-09-30' }).expect(409);
    expect(alpha.rows.get(blocked.body.id)?.status).toBe('ACTIVE');
    await authorized('post', `/classes/${blocked.body.id}/complete`).send({ completedOn: '2026-08-31' }).expect(400);
    await authorized('post', `/classes/${blocked.body.id}/complete`).send({ completedOn: '2026-02-30' }).expect(400);
  });

  it('rejects new disabled references and preserves existing disabled ones', async () => {
    const audit = app.get(AuditService);
    const record = vi.spyOn(audit, 'recordTenant');
    const disabledBranchId = '01JHZX3V8Q9K5M2N7R4T6W1Y0Z';
    const disabledRoomId = '01JHZX3V8Q9K5M2N7R4T6W1Y0V';
    const disabledTeacherId = '01JHZX3V8Q9K5M2N7R4T6W1Y0W';
    alpha.branches.set(disabledBranchId, { id: disabledBranchId, tenantId: tenants.alpha.id, code: 'OLDB', name: 'Old Branch', status: 'DISABLED' });
    alpha.rooms.set(disabledRoomId, { id: disabledRoomId, tenantId: tenants.alpha.id, code: 'OLDR', name: 'Old Room', status: 'DISABLED', branchId: disabledBranchId });
    alpha.teachers.set(disabledTeacherId, { id: disabledTeacherId, tenantId: tenants.alpha.id, code: 'OLDT', name: 'Old Teacher', status: 'DISABLED' });

    await authorized('post', '/classes').send({ courseId: activeCourseId, branchId: disabledBranchId, code: 'OFFB', name: 'x' }).expect(409);
    await authorized('post', '/classes').send({ courseId: activeCourseId, branchId: disabledBranchId, defaultRoomId: disabledRoomId, code: 'OFFR', name: 'x' }).expect(409);
    await authorized('post', '/classes').send({ courseId: activeCourseId, branchId: disabledBranchId, primaryTeacherId: disabledTeacherId, code: 'OFFT', name: 'x' }).expect(409);

    const now = new Date('2026-09-14T00:00:00.000Z');
    const id = '01JHZX3V8Q9K5M2N7R4T6W1Y0X';
    alpha.rows.set(id, {
      id,
      tenantId: tenants.alpha.id,
      courseId: activeCourseId,
      branchId: disabledBranchId,
      courseLevelId: null,
      defaultRoomId: disabledRoomId,
      primaryTeacherId: disabledTeacherId,
      capacity: null,
      startDate: null,
      expectedEndDate: null,
      code: 'LEGACY2',
      name: 'Legacy Refs',
      description: null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    record.mockClear();
    await authorized('patch', `/classes/${id}`)
      .send({ name: ' Edited ' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('Edited');
        expect(body.branchCode).toBe('OLDB');
        expect(body.defaultRoomCode).toBe('OLDR');
        expect(body.primaryTeacherId).toBe(disabledTeacherId);
      });
    const update = record.mock.calls.find(([, event]) => event.action === 'class.updated');
    expect(update).toBeTruthy();
    expect((update![1].before as { name?: string }).name).toBe('Legacy Refs');
    expect((update![1].after as { name?: string }).name).toBe('Edited');
  });
});
