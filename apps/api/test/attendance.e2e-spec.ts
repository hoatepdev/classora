import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { expect, vi } from 'vitest';
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
    teacher: '01JHZX3V8Q9K5M2N7R4T6W1Y1C',
    schedule: '01JHZX3V8Q9K5M2N7R4T6W1Y1D',
    studentA: '01JHZX3V8Q9K5M2N7R4T6W1Y1E',
    studentB: '01JHZX3V8Q9K5M2N7R4T6W1Y1F',
    studentC: '01JHZX3V8Q9K5M2N7R4T6W1Y1G',
  },
  beta: {
    classA: '01JHZX3V8Q9K5M2N7R4T6W1Y2A',
    classB: '01JHZX3V8Q9K5M2N7R4T6W1Y2B',
    teacher: '01JHZX3V8Q9K5M2N7R4T6W1Y2C',
    schedule: '01JHZX3V8Q9K5M2N7R4T6W1Y2D',
    studentA: '01JHZX3V8Q9K5M2N7R4T6W1Y2E',
    studentB: '01JHZX3V8Q9K5M2N7R4T6W1Y2F',
    studentC: '01JHZX3V8Q9K5M2N7R4T6W1Y2G',
  },
};

type SessionRecord = {
  id: string;
  tenantId: string;
  classId: string;
  scheduleId: string | null;
  teacherId: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';
  createdAt: Date;
  updatedAt: Date;
};

type AttendanceRecord = {
  id: string;
  tenantId: string;
  attendanceSessionId: string;
  studentId: string;
  status: 'UNMARKED' | 'PRESENT' | 'LATE' | 'ABSENT_EXCUSED' | 'ABSENT_UNEXCUSED' | 'ONLINE' | 'MAKEUP';
  note: string | null;
  source: 'REGULAR' | 'MAKEUP';
  makeupBookingId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AttendanceSheet = { id: string; tenantId: string; sessionId: string; status: 'OPEN' | 'LOCKED' };

function attendancePool(tenantId: string, tenantIds: (typeof ids)[keyof typeof ids]) {
  const classes = new Map([
    [tenantIds.classA, { id: tenantIds.classA, tenantId, code: 'CLS001', name: 'English Beginner' }],
    [tenantIds.classB, { id: tenantIds.classB, tenantId, code: 'CLS002', name: 'IELTS Foundation' }],
  ]);
  const teachers = new Map([
    [tenantIds.teacher, { id: tenantIds.teacher, tenantId, code: 'T001', name: 'Nguyen Van A' }],
  ]);
  const students = new Map([
    [tenantIds.studentA, { id: tenantIds.studentA, tenantId, code: 'ST001', fullName: 'Student A' }],
    [tenantIds.studentB, { id: tenantIds.studentB, tenantId, code: 'ST002', fullName: 'Student B' }],
    [tenantIds.studentC, { id: tenantIds.studentC, tenantId, code: 'ST003', fullName: 'Student C' }],
  ]);
  const schedules = new Map([
    [tenantIds.schedule, {
      id: tenantIds.schedule,
      tenantId,
      classId: tenantIds.classA,
      teacherId: tenantIds.teacher,
      startTime: '18:00',
      endTime: '20:00',
      status: 'ACTIVE',
      effectiveFrom: null,
      effectiveUntil: null,
    }],
  ]);
  const enrollments = new Map([
    [tenantIds.studentA, 'ACTIVE'],
    [tenantIds.studentB, 'ACTIVE'],
    [tenantIds.studentC, 'WITHDRAWN'],
  ]);
  const sessions = new Map<string, SessionRecord>();
  const records = new Map<string, AttendanceRecord>();
  const sheets = new Map<string, AttendanceSheet>();
  const now = () => new Date('2026-09-15T00:00:00.000Z');

  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.includes('pg_advisory_xact_lock')) {
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO audit_events')) {
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO attendance_sessions')) {
      const [id, requestedTenantId, classId, scheduleId, teacherId, sessionDate, startTime, endTime] = values as Array<string | null>;
      const duplicate = [...sessions.values()].find((session) =>
        session.tenantId === requestedTenantId &&
        (scheduleId
          ? session.scheduleId === scheduleId && session.sessionDate === sessionDate
          : session.classId === classId && session.sessionDate === sessionDate && session.startTime === startTime && session.endTime === endTime),
      );
      if (duplicate) {
        throw Object.assign(new Error('duplicate occurrence'), {
          code: '23505',
          constraint: scheduleId ? 'attendance_sessions_schedule_date_key' : 'attendance_sessions_occurrence_key',
        });
      }
      const session: SessionRecord = {
        id: id!, tenantId: requestedTenantId!, classId: classId!, scheduleId, teacherId,
        sessionDate: sessionDate!, startTime: startTime!, endTime: endTime!, status: 'SCHEDULED',
        createdAt: now(), updatedAt: now(),
      };
      sessions.set(session.id, session);
      return { rows: [session] };
    }

    if (sql.includes('INSERT INTO attendance_sheets')) {
      const locked = sql.includes("'LOCKED'");
      const [id, requestedTenantId, sessionId] = (locked ? [values[0], values[1], values[2]] : values) as string[];
      const existing = sheets.get(sessionId);
      const sheet: AttendanceSheet = { id: existing?.id ?? id, tenantId: requestedTenantId, sessionId, status: locked ? 'LOCKED' : 'OPEN' };
      sheets.set(sessionId, sheet);
      return { rows: [sheet] };
    }

    if (sql.includes('FROM makeup_bookings') && sql.includes('destination_session_id=$2')) {
      return { rows: [] };
    }

    if (sql.includes('SELECT id,status FROM attendance_sheets')) {
      const [requestedTenantId, sessionId] = values;
      const sheet = sheets.get(sessionId as string);
      return { rows: sheet?.tenantId === requestedTenantId ? [sheet] : [] };
    }

    if (sql.includes('SELECT status FROM attendance_sheets')) {
      const [requestedTenantId, sessionId] = values;
      const sheet = sheets.get(sessionId as string);
      return { rows: sheet?.tenantId === requestedTenantId ? [sheet] : [] };
    }

    if (sql.includes('INSERT INTO attendance_records')) {
      const [id, requestedTenantId, attendanceSessionId, studentId, enrollmentId] = values as string[];
      const duplicate = [...records.values()].find((record) =>
        record.tenantId === requestedTenantId &&
        record.attendanceSessionId === attendanceSessionId &&
        record.studentId === studentId,
      );
      if (duplicate) {
        if (sql.includes('ON CONFLICT')) return { rows: [] };
        throw Object.assign(new Error('duplicate student'), {
          code: '23505', constraint: 'attendance_records_session_student_key',
        });
      }
      records.set(id, {
        id, tenantId: requestedTenantId, attendanceSessionId, studentId,
        status: 'UNMARKED', note: null, source: sql.includes("'MAKEUP'") ? 'MAKEUP' : 'REGULAR', makeupBookingId: null,
        createdAt: now(), updatedAt: now(),
      });
      return { rows: [] };
    }

    if (sql.includes('FROM enrollments') && sql.includes("status IN ('TRIAL','ACTIVE')")) {
      const [requestedTenantId, classId] = values;
      if (requestedTenantId !== tenantId || classId !== tenantIds.classA) return { rows: [] };
      return {
        rows: [...enrollments.entries()]
          .filter(([, status]) => status === 'ACTIVE' || status === 'TRIAL')
          .map(([studentId]) => ({ studentId, enrollmentId: studentId })),
      };
    }

    if (sql.includes('FROM schedules') && sql.includes('class_id AS "classId"')) {
      const [requestedTenantId, scheduleId] = values;
      const schedule = schedules.get(scheduleId as string);
      return { rows: schedule?.tenantId === requestedTenantId ? [schedule] : [] };
    }

    if (sql.includes('SELECT 1 FROM classes')) {
      const [requestedTenantId, classId] = values;
      const row = classes.get(classId as string);
      return { rows: row?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('SELECT 1 FROM teachers')) {
      const [requestedTenantId, teacherId] = values;
      const row = teachers.get(teacherId as string);
      return { rows: row?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('SELECT 1 FROM students')) {
      const [requestedTenantId, studentId] = values;
      const row = students.get(studentId as string);
      return { rows: row?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes("UPDATE attendance_sheets SET")) {
      const [requestedTenantId, sessionId] = values.slice(0, 2);
      const sheet = sheets.get(sessionId as string);
      if (sheet?.tenantId !== requestedTenantId) return { rows: [] };
      sheet.status = 'LOCKED';
      return { rows: [sheet] };
    }

    if (sql.includes('UPDATE attendance_sessions')) {
      const [requestedTenantId, sessionId] = values;
      const session = sessions.get(sessionId as string);
      if (session?.tenantId !== requestedTenantId || session.status !== 'SCHEDULED') return { rows: [] };
      session.status = 'COMPLETED';
      session.updatedAt = now();
      return { rows: [session], rowCount: 1 };
    }

    if (sql.includes('UPDATE attendance_records SET')) {
      const [requestedTenantId, recordId, ...updates] = values;
      const record = records.get(recordId as string);
      if (record?.tenantId !== requestedTenantId) return { rows: [] };
      let updateIndex = 0;
      if (sql.includes('status=$3')) record.status = updates[updateIndex++] as AttendanceRecord['status'];
      if (sql.includes(`note=$${updateIndex + 3}`)) record.note = updates[updateIndex] as string | null;
      record.updatedAt = now();
      return { rows: [record] };
    }

    if (sql.includes('SELECT 1 FROM attendance_sessions')) {
      const [requestedTenantId, sessionId] = values;
      const session = sessions.get(sessionId as string);
      return { rows: session?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('FOR UPDATE OF a')) {
      const [requestedTenantId, recordId] = values;
      const record = records.get(recordId as string);
      const session = record && sessions.get(record.attendanceSessionId);
      if (sql.includes('JOIN attendance_sheets')) {
        return { rows: record?.tenantId === requestedTenantId && session ? [{ ...record, sessionId: record.attendanceSessionId, sessionStatus: session.status, source: record.source, makeupBookingId: record.makeupBookingId }] : [] };
      }
      return { rows: record?.tenantId === requestedTenantId && session ? [{ sessionStatus: session.status }] : [] };
    }

    if (sql.includes('SELECT 1 FROM attendance_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE')) {
      const [requestedTenantId, recordId] = values;
      const record = records.get(recordId as string);
      return { rows: record?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('UPDATE attendance_records')) {
      const [requestedTenantId, recordId, ...updates] = values;
      const record = records.get(recordId as string);
      if (record?.tenantId !== requestedTenantId) return { rows: [] };
      let updateIndex = 0;
      if (sql.includes('status = $3') || sql.includes('status=$3')) record.status = updates[updateIndex++] as AttendanceRecord['status'];
      if (sql.includes(`note = $${updateIndex + 3}`)) record.note = updates[updateIndex] as string | null;
      record.updatedAt = now();
      return { rows: [record] };
    }

    if (sql.includes('a.status AS "sessionStatus"') && sql.includes('r.student_id=$2')) {
      const [requestedTenantId, studentId] = values;
      return {
        rows: [...records.values()]
          .filter((record) => record.tenantId === requestedTenantId && record.studentId === studentId)
          .map((record) => {
            const session = sessions.get(record.attendanceSessionId)!;
            const classRecord = classes.get(session.classId)!;
            return { ...record, classId: session.classId, classCode: classRecord.code, className: classRecord.name, sessionDate: session.sessionDate, startTime: session.startTime, endTime: session.endTime, sessionStatus: session.status };
          }),
      };
    }

    if (sql.includes('JOIN students s') && sql.includes('session_id=$2')) {
      const [requestedTenantId, sessionId] = values;
      return {
        rows: [...records.values()]
          .filter((record) => record.tenantId === requestedTenantId && record.attendanceSessionId === sessionId)
          .map((record) => ({ ...record, studentCode: students.get(record.studentId)!.code, studentFullName: students.get(record.studentId)!.fullName })),
      };
    }

    if (sql.includes('FROM attendance_sessions a') && (sql.includes('a.id=$2') || sql.includes('a.id=$2 FOR UPDATE'))) {
      const [requestedTenantId, sessionId] = values;
      const session = sessions.get(sessionId as string);
      if (session?.tenantId !== requestedTenantId) return { rows: [] };
      const classRecord = classes.get(session.classId)!;
      const teacher = session.teacherId ? teachers.get(session.teacherId) : undefined;
      return { rows: [{
        ...session,
        classCode: classRecord.code,
        className: classRecord.name,
        teacherCode: teacher?.code ?? null,
        teacherName: teacher?.name ?? null,
        attendanceStatus: sheets.get(session.id)?.status ?? 'OPEN',
      }] };
    }

    if (sql.includes('FROM attendance_records') && sql.includes("status='ABSENT_EXCUSED'") && sql.includes("source='REGULAR'")) {
      const [requestedTenantId, sessionId] = values;
      return {
        rows: [...records.values()]
          .filter((record) => record.tenantId === requestedTenantId && record.attendanceSessionId === sessionId && record.status === 'ABSENT_EXCUSED' && record.source === 'REGULAR')
          .map((record) => ({ recordId: record.id, studentId: record.studentId, enrollmentId: record.studentId, sessionDate: sessions.get(record.attendanceSessionId)!.sessionDate })),
      };
    }

    if (sql.includes('FROM attendance_records') && sql.includes('LIMIT 1') && sql.includes('status')) {
      const [requestedTenantId, sessionId, status] = values;
      const found = [...records.values()].some((record) => record.tenantId === requestedTenantId && record.attendanceSessionId === sessionId && record.status === status);
      return { rows: found ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('COUNT(r.id)::int')) {
      const [requestedTenantId, classId] = values;
      return {
        rows: [...sessions.values()]
          .filter((session) => session.tenantId === requestedTenantId && session.classId === classId)
          .map((session) => {
            const classRecord = classes.get(session.classId)!;
            const teacher = session.teacherId ? teachers.get(session.teacherId) : undefined;
            return {
              ...session,
              classCode: classRecord.code,
              className: classRecord.name,
              teacherCode: teacher?.code ?? null,
              teacherName: teacher?.name ?? null,
              recordCount: [...records.values()].filter((record) => record.attendanceSessionId === session.id).length,
            };
          }),
      };
    }

    if (sql.includes('a.status AS "sessionStatus"') && sql.includes('r.student_id=$2')) {
      const [requestedTenantId, studentId] = values;
      return {
        rows: [...records.values()]
          .filter((record) => record.tenantId === requestedTenantId && record.studentId === studentId)
          .map((record) => {
            const session = sessions.get(record.attendanceSessionId)!;
            const classRecord = classes.get(session.classId)!;
            return {
              ...record,
              classId: session.classId,
              classCode: classRecord.code,
              className: classRecord.name,
              sessionDate: session.sessionDate,
              startTime: session.startTime,
              endTime: session.endTime,
              sessionStatus: session.status,
            };
          }),
      };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  return {
    pool: { query, connect: vi.fn(async () => client) } as unknown as Pool,
    enrollments,
    sessions,
    records,
  };
}

describe('attendance', () => {
  let app: INestApplication;
  let token: string;
  const alpha = attendancePool(tenants.alpha.id, ids.alpha);
  const beta = attendancePool(tenants.beta.id, ids.beta);
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

  const create = (overrides: Record<string, unknown> = {}, tenant = 'alpha') =>
    authorized('post', '/attendance-sessions', tenant).send({
      classId: ids[tenant as keyof typeof ids].classA,
      scheduleId: ids[tenant as keyof typeof ids].schedule,
      sessionDate: '2026-09-15',
      ...overrides,
    });

  it('snapshots active enrollments and keeps history stable', async () => {
    const created = await create().expect(201);
    expect(created.body).toMatchObject({
      classId: ids.alpha.classA,
      scheduleId: ids.alpha.schedule,
      teacherId: ids.alpha.teacher,
      sessionDate: '2026-09-15',
      startTime: '18:00',
      endTime: '20:00',
      status: 'SCHEDULED',
    });
    expect(created.body.records.map((record: AttendanceRecord) => record.studentId)).toEqual([
      ids.alpha.studentA,
      ids.alpha.studentB,
    ]);
    expect(created.body.records.every((record: AttendanceRecord) => record.status === 'UNMARKED')).toBe(true);

    alpha.enrollments.set(ids.alpha.studentA, 'WITHDRAWN');
    alpha.enrollments.set(ids.alpha.studentC, 'ACTIVE');

    await authorized('get', `/attendance-sessions/${created.body.id}`).expect(200).expect(({ body }) => {
      expect(body.records.map((record: AttendanceRecord) => record.studentId)).toEqual([
        ids.alpha.studentA,
        ids.alpha.studentB,
      ]);
    });
    await create({ sessionDate: '2026-09-22' }).expect(201).expect(({ body }) => {
      expect(body.records.map((record: AttendanceRecord) => record.studentId)).toEqual([
        ids.alpha.studentB,
        ids.alpha.studentC,
      ]);
    });
  });

  it('updates attendance, normalizes notes, and exposes both histories', async () => {
    const session = [...alpha.sessions.values()][0];
    const record = [...alpha.records.values()].find((item) =>
      item.attendanceSessionId === session.id && item.studentId === ids.alpha.studentA,
    )!;

    await authorized('patch', `/attendance-records/${record.id}`)
      .send({ status: 'ABSENT_UNEXCUSED' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ABSENT_UNEXCUSED'));
    await authorized('patch', `/attendance-records/${record.id}`)
      .send({ status: 'LATE', note: ' 15 minutes ' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'LATE', note: '15 minutes' }));
    await authorized('patch', `/attendance-records/${record.id}`)
      .send({ note: '   ' })
      .expect(200)
      .expect(({ body }) => expect(body.note).toBeNull());

    await authorized('get', `/classes/${ids.alpha.classA}/attendance-sessions`)
      .expect(200)
      .expect(({ body }) => expect(body[0]).toHaveProperty('recordCount'));
    await authorized('get', `/students/${ids.alpha.studentA}/attendance`)
      .expect(200)
      .expect(({ body }) => expect(body[0]).toMatchObject({ classCode: 'CLS001', studentId: ids.alpha.studentA }));
  });

  it('prevents duplicate occurrences and validates creation references', async () => {
    await create().expect(409);
    await create({ scheduleId: undefined, sessionDate: '2026-09-17', startTime: '18:00', endTime: '20:00' }).expect(201);
    await create({ scheduleId: undefined, sessionDate: '2026-09-17', startTime: '18:00', endTime: '20:00' }).expect(409);
    await create({ scheduleId: ids.alpha.schedule, classId: ids.alpha.classB, sessionDate: '2026-09-18' }).expect(400);
    await create({ scheduleId: undefined, sessionDate: '2026-09-19' }).expect(400);
    await create({ scheduleId: undefined, sessionDate: '2026-09-19', startTime: '20:00', endTime: '18:00' }).expect(400);
    await create({ tenantId: tenants.beta.id, sessionDate: '2026-09-20' }).expect(400);
  });

  it('finalizes a session and rejects later edits', async () => {
    const session = [...alpha.sessions.values()][0];
    const record = [...alpha.records.values()].find((item) => item.attendanceSessionId === session.id)!;
    for (const item of [...alpha.records.values()].filter((entry) => entry.attendanceSessionId === session.id)) {
      await authorized('patch', `/attendance-records/${item.id}`).send({ status: 'PRESENT' }).expect(200);
      const stored = alpha.records.get(item.id);
      if (stored) stored.status = 'PRESENT';
    }
    expect([...alpha.records.values()].filter((item) => item.attendanceSessionId === session.id).map((item) => item.status)).toEqual(['PRESENT', 'PRESENT']);
    await authorized('post', `/attendance-sessions/${session.id}/finalize`).expect(200);
    await authorized('patch', `/attendance-records/${record.id}`)
      .send({ status: 'ABSENT_EXCUSED' })
      .expect(409);
  });

  it('fails guessed cross-tenant IDs safely', async () => {
    const session = [...alpha.sessions.values()][0];
    const record = [...alpha.records.values()].find((item) => item.attendanceSessionId === session.id)!;
    await authorized('get', `/attendance-sessions/${session.id}`, 'beta').expect(404);
    await authorized('post', `/attendance-sessions/${session.id}/finalize`, 'beta').expect(404);
    await authorized('patch', `/attendance-records/${record.id}`, 'beta').send({ status: 'ABSENT_UNEXCUSED' }).expect(404);
    await authorized('get', `/classes/${ids.alpha.classA}/attendance-sessions`, 'beta').expect(404);
    await authorized('get', `/students/${ids.alpha.studentA}/attendance`, 'beta').expect(404);
    await create({ classId: ids.alpha.classA, sessionDate: '2026-09-20' }, 'beta').expect(404);
    await create({ scheduleId: ids.alpha.schedule, sessionDate: '2026-09-20' }, 'beta').expect(404);
    await create({ scheduleId: undefined, classId: ids.beta.classA, teacherId: ids.alpha.teacher, startTime: '18:00', endTime: '20:00', sessionDate: '2026-09-20' }, 'beta').expect(404);
    expect(record.status).not.toBe('ABSENT_UNEXCUSED');
  });

  it('rejects invalid record updates and unauthenticated access', async () => {
    const record = [...alpha.records.values()][0];
    await authorized('patch', `/attendance-records/${record.id}`).send({}).expect(400);
    await authorized('patch', `/attendance-records/${record.id}`).send({ status: 'UNKNOWN' }).expect(400);
    connections.getConnection.mockClear();
    await request(app.getHttpServer())
      .get(`/classes/${ids.alpha.classA}/attendance-sessions`)
      .set('Host', 'alpha.classora.io.vn')
      .expect(401);
    expect(connections.getConnection).not.toHaveBeenCalled();
  });
});
