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
  alpha: { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0A', slug: 'alpha', dbName: 'classora_tenant_alpha' },
  beta: { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0C', slug: 'beta', dbName: 'classora_tenant_beta' },
};
const ids = {
  alpha: {
    classA: '01JHZX3V8Q9K5M2N7R4T6W1Y1A',
    classB: '01JHZX3V8Q9K5M2N7R4T6W1Y1B',
    teacherA: '01JHZX3V8Q9K5M2N7R4T6W1Y1C',
    teacherB: '01JHZX3V8Q9K5M2N7R4T6W1Y1D',
  },
  beta: {
    classA: '01JHZX3V8Q9K5M2N7R4T6W1Y2A',
    classB: '01JHZX3V8Q9K5M2N7R4T6W1Y2B',
    teacherA: '01JHZX3V8Q9K5M2N7R4T6W1Y2C',
    teacherB: '01JHZX3V8Q9K5M2N7R4T6W1Y2D',
  },
};

type ScheduleRecord = {
  id: string;
  tenantId: string;
  classId: string;
  teacherId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
};

function schedulePool(tenantId: string, tenantIds: (typeof ids)[keyof typeof ids]) {
  const classes = new Map([
    [tenantIds.classA, { id: tenantIds.classA, tenantId, code: 'CLS001', name: 'English Beginner' }],
    [tenantIds.classB, { id: tenantIds.classB, tenantId, code: 'CLS002', name: 'IELTS Foundation' }],
  ]);
  const teachers = new Map([
    [tenantIds.teacherA, { id: tenantIds.teacherA, tenantId, code: 'T001', name: 'Nguyen Van A' }],
    [tenantIds.teacherB, { id: tenantIds.teacherB, tenantId, code: 'T002', name: 'Tran Thi B' }],
  ]);
  const schedules = new Map<string, ScheduleRecord>();
  const now = () => new Date('2026-09-15T00:00:00.000Z');

  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.includes('pg_advisory_xact_lock')) {
      return { rows: [] };
    }

    if (sql.includes('FROM schedules') && sql.includes("status = 'ACTIVE'") && sql.includes('LIMIT 1')) {
      const [requestedTenantId, dayOfWeek, classId, teacherId, startTime, endTime, excludedId] = values as Array<string | null>;
      const conflict = [...schedules.values()].find((row) =>
        row.tenantId === requestedTenantId &&
        row.status === 'ACTIVE' &&
        row.dayOfWeek === dayOfWeek &&
        (row.classId === classId || row.teacherId === teacherId) &&
        row.startTime < endTime! &&
        row.endTime > startTime! &&
        row.id !== excludedId,
      );
      return { rows: conflict ? [conflict] : [] };
    }

    if (sql.includes('EXISTS (SELECT 1 FROM classes')) {
      const [requestedTenantId, classId, teacherId] = values;
      const classRecord = classes.get(classId as string);
      const teacher = teachers.get(teacherId as string);
      return {
        rows: [{
          classExists: classRecord?.tenantId === requestedTenantId,
          teacherExists: teacher?.tenantId === requestedTenantId,
        }],
      };
    }

    if (sql.includes('INSERT INTO schedules')) {
      const [id, requestedTenantId, classId, teacherId, dayOfWeek, startTime, endTime, room, status] = values as string[];
      if (!classes.has(classId)) {
        throw Object.assign(new Error('missing class'), { code: '23503', constraint: 'schedules_class_id_fkey' });
      }
      if (!teachers.has(teacherId)) {
        throw Object.assign(new Error('missing teacher'), { code: '23503', constraint: 'schedules_teacher_id_fkey' });
      }
      const schedule: ScheduleRecord = {
        id,
        tenantId: requestedTenantId,
        classId,
        teacherId,
        dayOfWeek,
        startTime,
        endTime,
        room: room ?? null,
        status: status as ScheduleRecord['status'],
        createdAt: now(),
        updatedAt: now(),
      };
      schedules.set(id, schedule);
      return { rows: [schedule] };
    }

    if (sql.includes('UPDATE schedules')) {
      const [requestedTenantId, id, teacherId, dayOfWeek, startTime, endTime, room, status] = values as string[];
      const schedule = schedules.get(id);
      if (schedule?.tenantId !== requestedTenantId) return { rows: [] };
      if (!teachers.has(teacherId)) {
        throw Object.assign(new Error('missing teacher'), { code: '23503', constraint: 'schedules_teacher_id_fkey' });
      }
      Object.assign(schedule, { teacherId, dayOfWeek, startTime, endTime, room: room ?? null, status, updatedAt: now() });
      return { rows: [schedule] };
    }

    if (sql.includes('SELECT 1 FROM classes')) {
      const [requestedTenantId, id] = values;
      const row = classes.get(id as string);
      return { rows: row?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('SELECT 1 FROM teachers')) {
      const [requestedTenantId, id] = values;
      const row = teachers.get(id as string);
      return { rows: row?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('JOIN teachers')) {
      const [requestedTenantId, classId] = values;
      return {
        rows: [...schedules.values()]
          .filter((row) => row.tenantId === requestedTenantId && row.classId === classId)
          .map((row) => ({ ...row, teacherCode: teachers.get(row.teacherId)!.code, teacherName: teachers.get(row.teacherId)!.name })),
      };
    }

    if (sql.includes('JOIN classes')) {
      const [requestedTenantId, teacherId] = values;
      return {
        rows: [...schedules.values()]
          .filter((row) => row.tenantId === requestedTenantId && row.teacherId === teacherId)
          .map((row) => ({ ...row, classCode: classes.get(row.classId)!.code, className: classes.get(row.classId)!.name })),
      };
    }

    if (sql.includes('FROM schedules s') && sql.includes('s.id = $2')) {
      const [requestedTenantId, id] = values;
      const schedule = schedules.get(id as string);
      return { rows: schedule?.tenantId === requestedTenantId ? [schedule] : [] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  return { pool: { query, connect: vi.fn(async () => client) } as unknown as Pool, schedules };
}

describe('schedules', () => {
  let app: INestApplication;
  let token: string;
  const alpha = schedulePool(tenants.alpha.id, ids.alpha);
  const beta = schedulePool(tenants.beta.id, ids.beta);
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
    tenantMembership: { findUnique: vi.fn(async () => ({ id: '01JHZX3V8Q9K5M2N7R4T6W1Y0D', role: 'OWNER' })) },
  };

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
    token = await app.get(JwtService).signAsync({ sub: user.id });
  });

  afterAll(() => app.close());
  beforeEach(() => vi.clearAllMocks());

  const authorized = (method: 'get' | 'post' | 'patch', path: string, tenant = 'alpha') =>
    request(app.getHttpServer())
      [method](path)
      .set('Host', `${tenant}.classora.io.vn`)
      .set('Authorization', `Bearer ${token}`);

  const create = (overrides: Record<string, unknown> = {}, tenant = 'alpha') => authorized('post', '/schedules', tenant).send({
    classId: ids[tenant as keyof typeof ids].classA,
    teacherId: ids[tenant as keyof typeof ids].teacherA,
    dayOfWeek: 'MONDAY',
    startTime: '18:00',
    endTime: '20:00',
    room: ' Room 201 ',
    ...overrides,
  });

  it('creates a schedule and exposes both sides of the relationship', async () => {
    const created = await create().expect(201);
    expect(created.body).toMatchObject({
      tenantId: tenants.alpha.id,
      classId: ids.alpha.classA,
      teacherId: ids.alpha.teacherA,
      dayOfWeek: 'MONDAY',
      startTime: '18:00',
      endTime: '20:00',
      room: 'Room 201',
      status: 'ACTIVE',
    });
    expect(created.body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    await authorized('get', `/schedules/${created.body.id}`).expect(200);
    await authorized('get', `/classes/${ids.alpha.classA}/schedules`).expect(200).expect(({ body }) => {
      expect(body[0]).toMatchObject({ id: created.body.id, teacherCode: 'T001', teacherName: 'Nguyen Van A' });
    });
    await authorized('get', `/teachers/${ids.alpha.teacherA}/schedules`).expect(200).expect(({ body }) => {
      expect(body[0]).toMatchObject({ id: created.body.id, classCode: 'CLS001', className: 'English Beginner' });
    });
  });

  it('rejects invalid inputs and empty updates', async () => {
    await create({ dayOfWeek: 'FUNDAY' }).expect(400);
    await create({ startTime: '24:00' }).expect(400);
    await create({ startTime: '18:00', endTime: '17:00' }).expect(400);
    await create({ startTime: '18:00', endTime: '18:00' }).expect(400);
    await create({ tenantId: tenants.beta.id }).expect(400);
    await authorized('patch', `/schedules/${[...alpha.schedules.keys()][0]}`).send({}).expect(400);
  });

  it('rejects exact duplicates and Teacher overlap variants', async () => {
    await create().expect(409);
    for (const [startTime, endTime] of [['19:00', '21:00'], ['17:00', '19:00'], ['18:30', '19:30'], ['17:00', '21:00']]) {
      await create({ classId: ids.alpha.classB, startTime, endTime }).expect(409);
    }
  });

  it('rejects Class overlap and allows adjacency and non-conflicting resources', async () => {
    await create({ teacherId: ids.alpha.teacherB, startTime: '19:00', endTime: '21:00' }).expect(409);
    await create({ classId: ids.alpha.classB, teacherId: ids.alpha.teacherB }).expect(201);
    await create({ classId: ids.alpha.classB, startTime: '16:00', endTime: '18:00' }).expect(201);
    await create({ classId: ids.alpha.classB, startTime: '20:00', endTime: '22:00' }).expect(201);
  });

  it('lets disabled schedules release their slot', async () => {
    const created = await create({ dayOfWeek: 'TUESDAY', room: ' Room 203 ' }).expect(201);
    expect(created.body.room).toBe('Room 203');
    await authorized('patch', `/schedules/${created.body.id}`)
      .send({ status: 'DISABLED' })
      .expect(200)
      .expect(({ body }) => expect(body.room).toBe('Room 203'));
    await create({ dayOfWeek: 'TUESDAY' }).expect(201);
    await authorized('patch', `/schedules/${created.body.id}`)
      .send({ status: 'ACTIVE' })
      .expect(409);

    await create({ dayOfWeek: 'WEDNESDAY', status: 'DISABLED', room: '   ' })
      .expect(201)
      .expect(({ body }) => expect(body.room).toBeNull());
  });

  it('excludes itself on update and rejects an update into another active slot', async () => {
    const first = [...alpha.schedules.values()].find((row) => row.classId === ids.alpha.classA && row.dayOfWeek === 'MONDAY')!;
    await authorized('patch', `/schedules/${first.id}`).send({ room: 'Room 202' }).expect(200);
    const tuesday = [...alpha.schedules.values()].find((row) => row.dayOfWeek === 'TUESDAY' && row.status === 'ACTIVE')!;
    await authorized('patch', `/schedules/${tuesday.id}`).send({ dayOfWeek: 'MONDAY' }).expect(409);
  });

  it('rejects missing resources and cross-tenant guessed IDs', async () => {
    const missing = '01JHZX3V8Q9K5M2N7R4T6W9Z9Z';
    await create({ classId: missing, dayOfWeek: 'WEDNESDAY' }).expect(404);
    await create({ teacherId: missing, dayOfWeek: 'WEDNESDAY' }).expect(404);

    const schedule = [...alpha.schedules.values()][0];
    await authorized('get', `/schedules/${schedule.id}`, 'beta').expect(404);
    await authorized('patch', `/schedules/${schedule.id}`, 'beta').send({ room: 'Other tenant' }).expect(404);
    await authorized('get', `/classes/${ids.alpha.classA}/schedules`, 'beta').expect(404);
    await authorized('get', `/teachers/${ids.alpha.teacherA}/schedules`, 'beta').expect(404);
    await create({ classId: ids.alpha.classA }, 'beta').expect(404);
    await create({ teacherId: ids.alpha.teacherA }, 'beta').expect(404);
    expect(alpha.schedules.get(schedule.id)?.room).not.toBe('Other tenant');
  });

  it('rejects unauthenticated access before acquiring a tenant pool', async () => {
    await request(app.getHttpServer())
      .get(`/classes/${ids.alpha.classA}/schedules`)
      .set('Host', 'alpha.classora.io.vn')
      .expect(401);
    expect(connections.getConnection).not.toHaveBeenCalled();
  });
});
