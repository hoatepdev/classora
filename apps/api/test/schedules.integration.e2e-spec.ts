import dotenv from 'dotenv';
// Test setup defaults POSTGRES_* for mock-based specs; real integration values
// come from apps/api/.env and must win over those defaults.
dotenv.config({ override: true });

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { escapeIdentifier, Pool } from 'pg';
import { ulid } from 'ulid';
import { deployTenantSchema } from '../src/database/tenant-migrations.js';
import { postgresConfig } from '../src/config.js';
import { AuditService } from '../src/audit/audit.service.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { SchedulesService } from '../src/schedules/schedules.service.js';
import { TenantContextService, type TenantContext } from '../src/tenant/tenant-context.service.js';
import type { ResolvedTenant } from '../src/tenant/tenant-resolver.service.js';

const enabled = process.env.B5_TEST_DATABASE === '1';

describe.skipIf(!enabled)('LOCAL-06 schedules integration (real PostgreSQL)', () => {
  let admin: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let dbNameA: string;
  let dbNameB: string;
  let tenantContext: TenantContextService;
  let service: SchedulesService;
  const tenantA = { tenantId: ulid(), tenantSlug: 'local06-a', dbName: '' };
  const tenantB = { tenantId: ulid(), tenantSlug: 'local06-b', dbName: '' };

  const run = <T>(tenant: ResolvedTenant, pool: Pool, callback: () => Promise<T>) =>
    tenantContext.run<T>({ tenant, pool } as TenantContext, callback);

  const query = <T>(text: string, values?: unknown[]) => poolA.query<T>(text, values);

  async function seedBranch(code: string) {
    const id = ulid();
    await query('INSERT INTO branches (id, tenant_id, code, name) VALUES ($1, $2, $3, $4)', [id, tenantA.tenantId, code, `Branch ${code}`]);
    return id;
  }

  async function seedTeacher(code: string, branchIds: string[]) {
    const id = ulid();
    await query('INSERT INTO teachers (id, tenant_id, code, name) VALUES ($1, $2, $3, $4)', [id, tenantA.tenantId, code, `Teacher ${code}`]);
    for (const branchId of branchIds) {
      await query('INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id) VALUES ($1, $2, $3, $4)', [ulid(), tenantA.tenantId, id, branchId]);
    }
    return id;
  }

  async function seedRoom(branchId: string, code: string) {
    const id = ulid();
    await query('INSERT INTO rooms (id, tenant_id, branch_id, code, name) VALUES ($1, $2, $3, $4, $5)', [id, tenantA.tenantId, branchId, code, `Room ${code}`]);
    return id;
  }

  async function seedClass(options: { code: string; branchId: string; startDate?: string; expectedEndDate?: string }) {
    const id = ulid();
    await query(
      `INSERT INTO classes (id, tenant_id, branch_id, code, name, start_date, expected_end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, 'ACTIVE')`,
      [id, tenantA.tenantId, options.branchId, options.code, `Class ${options.code}`, options.startDate ?? null, options.expectedEndDate ?? null],
    );
    return id;
  }

  async function seedStudent(code: string, classId: string, status = 'ACTIVE') {
    const id = ulid();
    await query('INSERT INTO students (id, tenant_id, code, full_name) VALUES ($1, $2, $3, $4)', [id, tenantA.tenantId, code, `Student ${code}`]);
    await query('INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ($1, $2, $3, $4, $5)', [ulid(), tenantA.tenantId, id, classId, status]);
    return id;
  }

  const countSessions = async (where: string, values: unknown[]) => {
    const result = await query<{ count: string }>(`SELECT count(*)::text AS count FROM attendance_sessions WHERE ${where}`, values);
    return Number(result.rows[0].count);
  };

  beforeAll(async () => {
    const config = postgresConfig();
    admin = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    const runId = `${Date.now()}_${process.pid}`;
    dbNameA = `classora_local06_${runId}_a`;
    dbNameB = `classora_local06_${runId}_b`;
    tenantA.dbName = dbNameA;
    tenantB.dbName = dbNameB;
    for (const dbName of [dbNameA, dbNameB]) {
      await admin.query(`CREATE DATABASE ${escapeIdentifier(dbName)}`);
      await deployTenantSchema(dbName);
    }
    poolA = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: dbNameA, max: 10 });
    poolB = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: dbNameB, max: 5 });
    tenantContext = new TenantContextService();
    // recordTenant only uses the pool client; the control-database dependency is unused on this path.
    const audit = new AuditService({} as ControlDatabaseService, tenantContext);
    service = new SchedulesService(tenantContext, audit);
  }, 120_000);

  afterAll(async () => {
    for (const pool of [poolA, poolB, admin]) {
      if (pool) await pool.end().catch(() => undefined);
    }
    const config = postgresConfig();
    const cleanup = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    for (const dbName of [dbNameA, dbNameB].filter(Boolean)) {
      await cleanup.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)} WITH (FORCE)`).catch(() => undefined);
    }
    await cleanup.end().catch(() => undefined);
  });

  it('generates sessions with roster materialization and branch snapshots, then reruns idempotently', async () => {
    const branchId = await seedBranch('GEN-B1');
    const teacherId = await seedTeacher('GEN-T1', [branchId]);
    const roomId = await seedRoom(branchId, 'GEN-R1');
    const classId = await seedClass({ code: 'GEN-C1', branchId, startDate: '2026-01-01' });
    await seedStudent('GEN-S1', classId);
    await seedStudent('GEN-S2', classId);
    await seedStudent('GEN-S3', classId, 'WITHDRAWN');

    const pattern = await run(tenantA, poolA, () => service.create({
      classId,
      teacherId,
      roomId,
      dayOfWeek: 'MONDAY',
      startTime: '18:00',
      endTime: '20:00',
      effectiveFrom: '2026-01-01',
      effectiveUntil: '2026-03-31',
    }));

    const first = await run(tenantA, poolA, () => service.generate(classId, { from: '2026-01-01', to: '2026-01-31' }));
    expect(first.inserted).toBe(4);

    const sessions = await query<{ id: string; sessionDate: string; branchId: string; teacherId: string; roomId: string; status: string; manualOverride: boolean }>(
      `SELECT id, session_date::text AS "sessionDate", branch_id AS "branchId", teacher_id AS "teacherId", room_id AS "roomId", status, manual_override AS "manualOverride"
       FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2 ORDER BY session_date`,
      [tenantA.tenantId, classId],
    );
    expect(sessions.rows.map((row) => row.sessionDate)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
    for (const row of sessions.rows) {
      expect(row.branchId).toBe(branchId);
      expect(row.teacherId).toBe(teacherId);
      expect(row.roomId).toBe(roomId);
      expect(row.status).toBe('SCHEDULED');
      expect(row.manualOverride).toBe(false);
      const roster = await query<{ studentId: string }>(
        'SELECT student_id AS "studentId" FROM attendance_records WHERE tenant_id = $1 AND session_id = $2 ORDER BY student_id',
        [tenantA.tenantId, row.id],
      );
      expect(roster.rows).toHaveLength(2);
    }

    const rerun = await run(tenantA, poolA, () => service.generate(classId, { from: '2026-01-01', to: '2026-01-31' }));
    expect(rerun.inserted).toBe(0);
    expect(await countSessions('tenant_id = $1 AND schedule_pattern_id = $2', [tenantA.tenantId, pattern.id])).toBe(4);
  }, 120_000);

  it('clamps generation to the class lifecycle', async () => {
    const branchId = await seedBranch('GEN-B2');
    const teacherId = await seedTeacher('GEN-T2', [branchId]);
    const classId = await seedClass({ code: 'GEN-C2', branchId, startDate: '2026-01-01', expectedEndDate: '2026-01-09' });
    await run(tenantA, poolA, () => service.create({ classId, teacherId, dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '11:00' }));
    const result = await run(tenantA, poolA, () => service.generate(classId, { from: '2026-01-01', to: '2026-01-31' }));
    expect(result.inserted).toBe(1);
    expect(await countSessions('tenant_id = $1 AND class_id = $2 AND session_date = $3', [tenantA.tenantId, classId, '2026-01-05'])).toBe(1);
  });

  it('skips tenant-wide and branch-scoped exclusions but not other-branch ones', async () => {
    const branchId = await seedBranch('GEN-B3');
    const otherBranchId = await seedBranch('GEN-B4');
    const teacherId = await seedTeacher('GEN-T3', [branchId]);
    const classId = await seedClass({ code: 'GEN-C3', branchId });
    await run(tenantA, poolA, () => service.create({ classId, teacherId, branchId, dayOfWeek: 'WEDNESDAY', startTime: '10:00', endTime: '12:00' }));
    await run(tenantA, poolA, () => service.createExclusion({ date: '2026-01-07', branchId: null, reason: 'tenant holiday' }));
    await run(tenantA, poolA, () => service.createExclusion({ date: '2026-01-14', branchId, reason: 'branch maintenance' }));
    await run(tenantA, poolA, () => service.createExclusion({ date: '2026-01-21', branchId: otherBranchId, reason: 'other branch only' }));

    const result = await run(tenantA, poolA, () => service.generate(classId, { from: '2026-01-01', to: '2026-01-31' }));
    // 01-07 (tenant-wide) and 01-14 (own branch) are skipped; 01-21 (other branch) and 01-28 are generated.
    expect(result.inserted).toBe(2);
    expect(await countSessions('tenant_id = $1 AND class_id = $2 AND session_date = $3', [tenantA.tenantId, classId, '2026-01-21'])).toBe(1);
    expect(await query<{ count: string }>(
      'SELECT count(*)::text AS count FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2 AND session_date = ANY($3::date[])',
      [tenantA.tenantId, classId, ['2026-01-07', '2026-01-14']],
    )).toMatchObject({ rows: [{ count: '0' }] });

    await expect(run(tenantA, poolA, () => service.createExclusion({ date: '2026-01-07', branchId: null, reason: 'duplicate' })))
      .rejects.toThrow(/already exists/);
  });

  it('protects manually overridden occurrences from regeneration', async () => {
    const branchId = await seedBranch('GEN-B5');
    const teacherId = await seedTeacher('GEN-T5', [branchId]);
    const classId = await seedClass({ code: 'GEN-C5', branchId });
    await run(tenantA, poolA, () => service.create({ classId, teacherId, dayOfWeek: 'MONDAY', startTime: '18:00', endTime: '20:00' }));
    await run(tenantA, poolA, () => service.generate(classId, { from: '2026-01-01', to: '2026-01-31' }));
    const sessions = await query<{ id: string; sessionDate: string }>(
      'SELECT id, session_date::text AS "sessionDate" FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2 ORDER BY session_date',
      [tenantA.tenantId, classId],
    );

    const overridden = await run(tenantA, poolA, () => service.updateSession(sessions.rows[0].id, { startTime: '19:00', endTime: '21:00' }));
    expect(overridden.manualOverride).toBe(true);
    expect(overridden.sourceSessionDate).toBe(sessions.rows[0].sessionDate);
    expect(overridden.sourceStartTime).toBe('18:00');

    const rerun = await run(tenantA, poolA, () => service.generate(classId, { from: '2026-01-01', to: '2026-01-31' }));
    expect(rerun.inserted).toBe(0);
    expect(await countSessions('tenant_id = $1 AND class_id = $2', [tenantA.tenantId, classId])).toBe(sessions.rows.length);
  });

  it('enforces half-open class, teacher, and room conflicts while allowing adjacent sessions', async () => {
    const branchId = await seedBranch('GEN-B6');
    const teacher1 = await seedTeacher('GEN-T6', [branchId]);
    const teacher2 = await seedTeacher('GEN-T7', [branchId]);
    const room1 = await seedRoom(branchId, 'GEN-R6');
    const class1 = await seedClass({ code: 'GEN-C6', branchId });
    const pattern1 = await run(tenantA, poolA, () => service.create({ classId: class1, teacherId: teacher1, roomId: room1, dayOfWeek: 'WEDNESDAY', startTime: '18:00', endTime: '19:00' }));

    // Adjacent half-open interval [19:00, 21:00) does not conflict.
    await run(tenantA, poolA, () => service.create({ classId: class1, teacherId: teacher2, dayOfWeek: 'WEDNESDAY', startTime: '19:00', endTime: '21:00' }));
    await run(tenantA, poolA, () => service.generate(class1, { from: '2026-01-01', to: '2026-01-31' }));
    // Tenant-wide exclusions from the exclusions test above skip 01-07/01-14; 01-28 is a clean Wednesday.
    expect(await countSessions('tenant_id = $1 AND class_id = $2 AND session_date = $3', [tenantA.tenantId, class1, '2026-01-28'])).toBe(2);

    // Class overlap.
    await expect(run(tenantA, poolA, () => service.create({ classId: class1, teacherId: teacher2, dayOfWeek: 'WEDNESDAY', startTime: '18:30', endTime: '19:30' })))
      .rejects.toThrow(/Class already has an overlapping schedule/);

    // Teacher overlap through session generation: the source pattern is disabled after
    // generation, so the pattern check passes but its live sessions still hold the slot.
    const class2 = await seedClass({ code: 'GEN-C7', branchId });
    await run(tenantA, poolA, () => service.update(pattern1.id, { status: 'DISABLED' }));
    await run(tenantA, poolA, () => service.create({ classId: class2, teacherId: teacher1, dayOfWeek: 'WEDNESDAY', startTime: '18:30', endTime: '19:30' }));
    await expect(run(tenantA, poolA, () => service.generate(class2, { from: '2026-01-01', to: '2026-01-31' })))
      .rejects.toThrow(/Teacher already has an overlapping session/);
    expect(await countSessions('tenant_id = $1 AND class_id = $2', [tenantA.tenantId, class2])).toBe(0);

    // Room overlap through session generation.
    const teacher3 = await seedTeacher('GEN-T8', [branchId]);
    const class3 = await seedClass({ code: 'GEN-C8', branchId });
    await run(tenantA, poolA, () => service.create({ classId: class3, teacherId: teacher3, roomId: room1, dayOfWeek: 'WEDNESDAY', startTime: '18:30', endTime: '19:30' }));
    await expect(run(tenantA, poolA, () => service.generate(class3, { from: '2026-01-01', to: '2026-01-31' })))
      .rejects.toThrow(/Room already has an overlapping session/);
  });

  it('completes, cancels, and frees conflict slots for terminal sessions', async () => {
    const branchId = await seedBranch('GEN-B7');
    const teacherId = await seedTeacher('GEN-T9', [branchId]);
    const classId = await seedClass({ code: 'GEN-C9', branchId });
    await run(tenantA, poolA, () => service.create({ classId, teacherId, dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '10:00' }));
    await run(tenantA, poolA, () => service.generate(classId, { from: '2026-01-01', to: '2026-01-31' }));
    const sessions = await query<{ id: string; sessionDate: string }>(
      'SELECT id, session_date::text AS "sessionDate" FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2 ORDER BY session_date',
      [tenantA.tenantId, classId],
    );

    await query("UPDATE attendance_records SET status = 'PRESENT' WHERE tenant_id = $1 AND session_id = $2", [tenantA.tenantId, sessions.rows[0].id]);
    await query("UPDATE attendance_sheets SET status = 'LOCKED', locked_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND session_id = $2", [tenantA.tenantId, sessions.rows[0].id]);
    const completed = await run(tenantA, poolA, () => service.completeSession(sessions.rows[0].id));
    expect(completed.status).toBe('COMPLETED');
    const cancelled = await run(tenantA, poolA, () => service.cancelSession(sessions.rows[1].id, 'trainer sick'));
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellationReason).toBe('trainer sick');
    await expect(run(tenantA, poolA, () => service.completeSession(sessions.rows[1].id))).rejects.toThrow(/Session is not scheduled/);

    // Probe the freed and occupied slots through the same class/teacher's later sessions
    // (01-19 and 01-26 are still SCHEDULED); conflicts apply across shared resources only.
    const [intoCancelledSource, intoCompletedSource] = sessions.rows.slice(2);

    // The cancelled session no longer blocks its slot.
    const movedIntoCancelled = await run(tenantA, poolA, () => service.rescheduleSession(intoCancelledSource.id, {
      sessionDate: sessions.rows[1].sessionDate,
      startTime: '08:30',
      endTime: '09:30',
    }));
    expect(movedIntoCancelled.status).toBe('SCHEDULED');

    // A completed session still consumes its slot.
    await expect(run(tenantA, poolA, () => service.rescheduleSession(intoCompletedSource.id, {
      sessionDate: sessions.rows[0].sessionDate,
      startTime: '08:30',
      endTime: '09:30',
    }))).rejects.toThrow(/overlapping session/);
  });

  it('reschedules as a replacement that copies the roster and preserves history', async () => {
    const branchId = await seedBranch('GEN-B8');
    const teacherId = await seedTeacher('GEN-T10', [branchId]);
    const roomId = await seedRoom(branchId, 'GEN-R8');
    const classId = await seedClass({ code: 'GEN-C11', branchId });
    const studentId = await seedStudent('GEN-S8', classId);
    await run(tenantA, poolA, () => service.create({ classId, teacherId, roomId, dayOfWeek: 'MONDAY', startTime: '14:00', endTime: '16:00' }));
    await run(tenantA, poolA, () => service.generate(classId, { from: '2026-01-01', to: '2026-01-31' }));
    const original = (await query<{ id: string }>(
      'SELECT id FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2 ORDER BY session_date LIMIT 1',
      [tenantA.tenantId, classId],
    )).rows[0];
    await query("UPDATE attendance_records SET status = 'ABSENT_UNEXCUSED', note = 'moved' WHERE tenant_id = $1 AND session_id = $2", [tenantA.tenantId, original.id]);

    const replacement = await run(tenantA, poolA, () => service.rescheduleSession(original.id, {
      sessionDate: '2026-01-10',
      startTime: '09:00',
      endTime: '11:00',
      reason: 'room flood',
    }));
    expect(replacement.id).not.toBe(original.id);
    expect(replacement.rescheduledFromId).toBe(original.id);
    expect(replacement.sessionDate).toBe('2026-01-10');
    expect(replacement.manualOverride).toBe(true);

    const history = await query<{ status: string; rescheduleReason: string | null }>(
      'SELECT status, reschedule_reason AS "rescheduleReason" FROM attendance_sessions WHERE tenant_id = $1 AND id = $2',
      [tenantA.tenantId, original.id],
    );
    expect(history.rows[0].status).toBe('RESCHEDULED');
    expect(history.rows[0].rescheduleReason).toBe('room flood');

    const roster = await query<{ studentId: string; status: string; note: string | null }>(
      'SELECT student_id AS "studentId", status, note FROM attendance_records WHERE tenant_id = $1 AND session_id = $2',
      [tenantA.tenantId, replacement.id],
    );
    expect(roster.rows).toEqual([{ studentId, status: 'ABSENT_UNEXCUSED', note: 'moved' }]);

    await expect(run(tenantA, poolA, () => service.rescheduleSession(original.id, { sessionDate: '2026-01-11', startTime: '09:00', endTime: '11:00' })))
      .rejects.toThrow(/Only scheduled sessions can be rescheduled/);
  });

  it('bounds calendar queries and applies filters including operational student enrollment', async () => {
    const branchId = await seedBranch('GEN-B9');
    const teacherId = await seedTeacher('GEN-T11', [branchId]);
    const classId = await seedClass({ code: 'GEN-C12', branchId });
    const activeStudent = await seedStudent('GEN-S9', classId);
    const endedStudent = await seedStudent('GEN-S10', classId, 'WITHDRAWN');
    await run(tenantA, poolA, () => service.create({ classId, teacherId, dayOfWeek: 'MONDAY', startTime: '16:00', endTime: '17:00' }));
    await run(tenantA, poolA, () => service.generate(classId, { from: '2026-02-02', to: '2026-02-02' }));

    await expect(run(tenantA, poolA, () => service.listSessions({ from: '2026-01-01', to: '2027-01-03' })))
      .rejects.toThrow(/cannot exceed 366 days/);

    const calendar = await run(tenantA, poolA, () => service.listSessions({ from: '2026-02-01', to: '2026-02-28', classId }));
    expect(calendar).toHaveLength(1);
    expect(calendar[0].classCode).toMatch(/^GEN-C12$/);
    expect(calendar[0].teacherName).toContain('GEN-T11');

    expect(await run(tenantA, poolA, () => service.listSessions({ from: '2026-02-01', to: '2026-02-28', classId, studentId: activeStudent }))).toHaveLength(1);
    expect(await run(tenantA, poolA, () => service.listSessions({ from: '2026-02-01', to: '2026-02-28', classId, studentId: endedStudent }))).toHaveLength(0);
    expect(await run(tenantA, poolA, () => service.listSessions({ from: '2026-02-01', to: '2026-02-28', classId, status: 'CANCELLED' }))).toHaveLength(0);
    expect(await run(tenantA, poolA, () => service.listSessions({ from: '2026-03-01', to: '2026-03-31', classId }))).toHaveLength(0);
  });

  it('rejects guessed identifiers from another tenant', async () => {
    const branchId = await seedBranch('GEN-B10');
    const teacherId = await seedTeacher('GEN-T12', [branchId]);
    const classId = await seedClass({ code: 'GEN-C13', branchId });
    await run(tenantA, poolA, () => service.create({ classId, teacherId, dayOfWeek: 'MONDAY', startTime: '06:00', endTime: '07:00' }));
    await run(tenantA, poolA, () => service.generate(classId, { from: '2026-02-02', to: '2026-02-02' }));
    const foreign = (await query<{ id: string }>('SELECT id FROM attendance_sessions WHERE tenant_id = $1 LIMIT 1', [tenantA.tenantId])).rows[0].id;

    expect(await countSessions("tenant_id = $1", [tenantB.tenantId])).toBe(0);
    await expect(run(tenantB, poolB, () => service.getSession(foreign))).rejects.toThrow(/Session not found/);
    await expect(run(tenantB, poolB, () => service.generate(classId, { from: '2026-02-02', to: '2026-02-02' }))).rejects.toThrow(/Class not found/);
    await expect(run(tenantB, poolB, () => service.listSessions({ from: '2026-02-01', to: '2026-02-28' }))).resolves.toHaveLength(0);
    await expect(run(tenantB, poolB, () => service.cancelSession(foreign, 'cross tenant'))).rejects.toThrow(/Session not found/);
  });

  it('races duplicate generation to an idempotent outcome without partial state', async () => {
    const branchId = await seedBranch('GEN-B11');
    const teacherId = await seedTeacher('GEN-T13', [branchId]);
    const classId = await seedClass({ code: 'GEN-C14', branchId });
    await seedStudent('GEN-S14', classId);
    await run(tenantA, poolA, () => service.create({ classId, teacherId, dayOfWeek: 'MONDAY', startTime: '13:00', endTime: '14:00' }));

    const [first, second] = await Promise.all([
      run(tenantA, poolA, () => service.generate(classId, { from: '2026-03-02', to: '2026-03-02' })),
      run(tenantA, poolA, () => service.generate(classId, { from: '2026-03-02', to: '2026-03-02' })),
    ]);
    expect(first.inserted + second.inserted).toBe(1);
    expect(await countSessions('tenant_id = $1 AND class_id = $2', [tenantA.tenantId, classId])).toBe(1);
    const records = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM attendance_records r
       JOIN attendance_sessions s ON s.tenant_id = r.tenant_id AND s.id = r.session_id
       WHERE r.tenant_id = $1 AND s.class_id = $2`,
      [tenantA.tenantId, classId],
    );
    expect(Number(records.rows[0].count)).toBe(1);
  });

  it('races teacher-slot reschedules so exactly one wins and the loser keeps its original row', async () => {
    const branchId = await seedBranch('GEN-B12');
    const teacherId = await seedTeacher('GEN-T14', [branchId]);
    const class1 = await seedClass({ code: 'GEN-C15', branchId });
    const class2 = await seedClass({ code: 'GEN-C16', branchId });
    // Adjacent weekly patterns (07:00-08:00 / 08:00-09:00) are legal to create;
    // the session-level conflict is exercised through concurrent reschedules.
    await run(tenantA, poolA, () => service.create({ classId: class1, teacherId, dayOfWeek: 'MONDAY', startTime: '07:00', endTime: '08:00' }));
    await run(tenantA, poolA, () => service.create({ classId: class2, teacherId, dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '09:00' }));
    await run(tenantA, poolA, () => service.generate(class1, { from: '2026-04-06', to: '2026-04-06' }));
    await run(tenantA, poolA, () => service.generate(class2, { from: '2026-04-06', to: '2026-04-06' }));
    const original1 = (await query<{ id: string }>(
      'SELECT id FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2',
      [tenantA.tenantId, class1],
    )).rows[0].id;
    const original2 = (await query<{ id: string }>(
      'SELECT id FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2',
      [tenantA.tenantId, class2],
    )).rows[0].id;

    const results = await Promise.allSettled([
      run(tenantA, poolA, () => service.rescheduleSession(original1, { sessionDate: '2026-04-13', startTime: '09:00', endTime: '10:00' })),
      run(tenantA, poolA, () => service.rescheduleSession(original2, { sessionDate: '2026-04-13', startTime: '09:30', endTime: '10:30' })),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/overlapping session/);

    const rows = await query<{ classId: string; id: string; status: string }>(
      'SELECT class_id AS "classId", id, status FROM attendance_sessions WHERE tenant_id = $1 AND class_id IN ($2, $3) ORDER BY class_id, status',
      [tenantA.tenantId, class1, class2],
    );
    // Winner: original RESCHEDULED + replacement SCHEDULED. Loser: original untouched SCHEDULED.
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.filter((row) => row.status === 'SCHEDULED')).toHaveLength(2);
    expect(rows.rows.filter((row) => row.status === 'RESCHEDULED')).toHaveLength(1);
  });

  it('races room-slot reschedules so exactly one wins', async () => {
    const branchId = await seedBranch('GEN-B14');
    const room = await seedRoom(branchId, 'GEN-R14');
    const teacher1 = await seedTeacher('GEN-T16', [branchId]);
    const teacher2 = await seedTeacher('GEN-T17', [branchId]);
    const class1 = await seedClass({ code: 'GEN-C18', branchId });
    const class2 = await seedClass({ code: 'GEN-C19', branchId });
    await run(tenantA, poolA, () => service.create({ classId: class1, teacherId: teacher1, roomId: room, dayOfWeek: 'MONDAY', startTime: '11:00', endTime: '12:00' }));
    await run(tenantA, poolA, () => service.create({ classId: class2, teacherId: teacher2, roomId: room, dayOfWeek: 'MONDAY', startTime: '12:00', endTime: '13:00' }));
    await run(tenantA, poolA, () => service.generate(class1, { from: '2026-05-04', to: '2026-05-04' }));
    await run(tenantA, poolA, () => service.generate(class2, { from: '2026-05-04', to: '2026-05-04' }));
    const original1 = (await query<{ id: string }>(
      'SELECT id FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2',
      [tenantA.tenantId, class1],
    )).rows[0].id;
    const original2 = (await query<{ id: string }>(
      'SELECT id FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2',
      [tenantA.tenantId, class2],
    )).rows[0].id;

    const results = await Promise.allSettled([
      run(tenantA, poolA, () => service.rescheduleSession(original1, { sessionDate: '2026-05-11', startTime: '14:00', endTime: '15:00' })),
      run(tenantA, poolA, () => service.rescheduleSession(original2, { sessionDate: '2026-05-11', startTime: '14:30', endTime: '15:30' })),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.message).toMatch(/overlapping session/);
  });

  it('races reschedules of the same session so exactly one replacement exists', async () => {
    const branchId = await seedBranch('GEN-B13');
    const teacherId = await seedTeacher('GEN-T15', [branchId]);
    const classId = await seedClass({ code: 'GEN-C17', branchId });
    await run(tenantA, poolA, () => service.create({ classId, teacherId, dayOfWeek: 'MONDAY', startTime: '05:00', endTime: '06:00' }));
    await run(tenantA, poolA, () => service.generate(classId, { from: '2026-04-06', to: '2026-04-06' }));
    const original = (await query<{ id: string }>(
      'SELECT id FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2',
      [tenantA.tenantId, classId],
    )).rows[0];

    const results = await Promise.allSettled([
      run(tenantA, poolA, () => service.rescheduleSession(original.id, { sessionDate: '2026-04-07', startTime: '05:00', endTime: '06:00' })),
      run(tenantA, poolA, () => service.rescheduleSession(original.id, { sessionDate: '2026-04-08', startTime: '05:00', endTime: '06:00' })),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/Only scheduled sessions can be rescheduled/);

    const rows = await query<{ status: string }>(
      'SELECT status FROM attendance_sessions WHERE tenant_id = $1 AND class_id = $2 ORDER BY status',
      [tenantA.tenantId, classId],
    );
    expect(rows.rows.map((row) => row.status).sort()).toEqual(['RESCHEDULED', 'SCHEDULED']);
  });
});
