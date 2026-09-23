import assert from 'node:assert/strict';
import { escapeIdentifier, Pool } from 'pg';
import { deployTenantSchema, tenantDatabaseUrl } from '../dist/database/tenant-migrations.js';
import { postgresConfig } from '../dist/config.js';
import { captureTenantSchemaCatalog } from '../dist/database/tenant-schema-catalog.js';

const LEGACY_PREFIX = 'classora_b5_schema_';
if (process.env.B5_TEST_DATABASE !== '1') {
  throw new Error('B5_TEST_DATABASE=1 is required; this command only runs against disposable PostgreSQL');
}
const config = postgresConfig();
if (!['localhost', '127.0.0.1', 'postgres'].includes(config.host)) {
  throw new Error('B5 schema verification only permits localhost or the disposable Compose postgres host');
}
if (config.controlDatabase === 'postgres' || config.controlDatabase.startsWith('classora_tenant_')) {
  throw new Error('B5 schema verification cannot target a tenant or default database as its admin database');
}
const runId = `${Date.now()}_${process.pid}`;
const databases = new Set();

function adminPool() {
  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.controlDatabase,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
}

function databasePool(dbName) {
  return new Pool({
    connectionString: tenantDatabaseUrl(dbName),
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
}

async function createDatabase(dbName) {
  const pool = adminPool();
  try {
    await pool.query(`CREATE DATABASE ${escapeIdentifier(dbName)}`);
    databases.add(dbName);
  } finally {
    await pool.end();
  }
}

async function dropDatabase(dbName) {
  const pool = adminPool();
  try {
    await pool.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [dbName],
    );
    await pool.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)}`);
  } finally {
    await pool.end();
  }
}

async function execute(dbName, sql) {
  const pool = databasePool(dbName);
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

async function assertStudent360Constraints(dbName, label) {
  const tables = await query(dbName, `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('guardians', 'student_guardians', 'student_tags', 'student_tag_assignments', 'student_notes')
    ORDER BY table_name
  `);
  assert.deepEqual(tables.map(({ table_name }) => table_name), [
    'guardians', 'student_guardians', 'student_notes', 'student_tag_assignments', 'student_tags',
  ], `${label}: Student 360 tables are incomplete`);

  const tenantId = '01J00000000000000000000001';
  const otherTenantId = '01J00000000000000000000002';
  const studentId = '01J00000000000000000000003';
  const guardianId = '01J00000000000000000000004';
  const otherGuardianId = '01J00000000000000000000005';
  const tagId = '01J00000000000000000000006';
  const studentRows = await query(dbName, 'SELECT id FROM students WHERE id = $1', ['01J00000000000000000000000']);
  if (studentRows.length === 0) {
    await execute(dbName, `INSERT INTO students (id, tenant_id, code, full_name) VALUES ('01J00000000000000000000000', '${tenantId}', 'SCHEMA-1', 'Schema Student')`);
  }
  await execute(dbName, `
    INSERT INTO students (id, tenant_id, code, full_name) VALUES ('${studentId}', '${tenantId}', 'SCHEMA-2', 'Schema Student 2');
    INSERT INTO guardians (id, tenant_id, full_name) VALUES ('${guardianId}', '${tenantId}', 'Schema Guardian');
    INSERT INTO guardians (id, tenant_id, full_name) VALUES ('${otherGuardianId}', '${otherTenantId}', 'Other Guardian');
    INSERT INTO student_tags (id, tenant_id, name) VALUES ('${tagId}', '${tenantId}', 'Schema Tag');
  `);
  await assert.rejects(
    () => execute(dbName, `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship) VALUES ('01J00000000000000000000007', '${tenantId}', '${studentId}', '${otherGuardianId}', 'Parent')`),
    undefined,
    `${label}: cross-tenant Guardian relationship was allowed`,
  );
  await execute(dbName, `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship, is_primary_contact) VALUES ('01J00000000000000000000008', '${tenantId}', '${studentId}', '${guardianId}', 'Parent', TRUE)`);
  await assert.rejects(
    () => execute(dbName, `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship, is_primary_contact) VALUES ('01J00000000000000000000009', '${tenantId}', '${studentId}', '${guardianId}', 'Sibling', FALSE)`),
    undefined,
    `${label}: duplicate Guardian relationship was allowed`,
  );
  await execute(dbName, `INSERT INTO guardians (id, tenant_id, full_name) VALUES ('01J0000000000000000000000A', '${tenantId}', 'Second Guardian')`);
  await assert.rejects(
    () => execute(dbName, `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship, is_primary_contact) VALUES ('01J0000000000000000000000B', '${tenantId}', '${studentId}', '01J0000000000000000000000A', 'Parent', TRUE)`),
    undefined,
    `${label}: multiple primary contacts were allowed`,
  );
  await execute(dbName, `INSERT INTO student_tag_assignments (id, tenant_id, student_id, tag_id) VALUES ('01J0000000000000000000000C', '${tenantId}', '${studentId}', '${tagId}')`);
  await assert.rejects(
    () => execute(dbName, `INSERT INTO student_tag_assignments (id, tenant_id, student_id, tag_id) VALUES ('01J0000000000000000000000D', '${tenantId}', '${studentId}', '${tagId}')`),
    undefined,
    `${label}: duplicate tag assignment was allowed`,
  );
}

async function assertAppendOnly(dbName, label) {
  const id = '01J00000000000000000000002';
  const tenantId = '01J00000000000000000000001';
  await execute(dbName, `
    INSERT INTO audit_events (id, tenant_id, action, entity_type)
    VALUES ('${id}', '${tenantId}', 'schema.check', 'TEST')
    ON CONFLICT (id) DO NOTHING
  `);
  await assert.rejects(() => execute(dbName, `UPDATE audit_events SET action = 'mutated' WHERE id = '${id}'`), undefined, `${label}: audit UPDATE was allowed`);
  await assert.rejects(() => execute(dbName, `DELETE FROM audit_events WHERE id = '${id}'`), undefined, `${label}: audit DELETE was allowed`);
  await assert.rejects(() => execute(dbName, `TRUNCATE audit_events`), undefined, `${label}: audit TRUNCATE was allowed`);
  const rows = await query(dbName, 'SELECT action FROM audit_events WHERE id = $1', [id]);
  assert.deepEqual(rows, [{ action: 'schema.check' }], `${label}: append-only row changed`);
}

async function query(dbName, sql, values = []) {
  const pool = databasePool(dbName);
  try {
    return (await pool.query(sql, values)).rows;
  } finally {
    await pool.end();
  }
}

async function createLegacyBaseline(dbName) {
  await execute(
    dbName,
    `
      CREATE TABLE students (
        id CHAR(26) PRIMARY KEY,
        tenant_id CHAR(26) NOT NULL,
        code TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        date_of_birth DATE,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT students_tenant_id_code_key UNIQUE (tenant_id, code)
      );
      CREATE INDEX students_tenant_id_full_name_id_idx
        ON students (tenant_id, full_name, id);
      CREATE TABLE _classora_tenant_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO _classora_tenant_migrations (version, name)
      VALUES (1, 'students');
      INSERT INTO students (id, tenant_id, code, full_name)
      VALUES ('01J00000000000000000000000', '01J00000000000000000000001', 'LEGACY-1', 'Legacy Student');
    `,
  );
}

async function captureCatalog(dbName) {
  const pool = databasePool(dbName);
  try {
    return await captureTenantSchemaCatalog(pool);
  } finally {
    await pool.end();
  }
}

function catalogDiff(expected, actual) {
  const diff = [];
  for (const key of Object.keys(expected)) {
    const left = JSON.stringify(expected[key], null, 2).split('\n');
    const right = JSON.stringify(actual[key], null, 2).split('\n');
    if (JSON.stringify(expected[key]) === JSON.stringify(actual[key])) continue;
    diff.push(`${key}: expected ${left.join(' ')}; actual ${right.join(' ')}`);
  }
  return diff.join('\n');
}

async function assertLocal04Constraints(dbName, label) {
  const tenantId = '01J00000000000000000000001';
  const otherTenantId = '01J00000000000000000000002';
  const courseId = '01J0000000000000000000000E';
  const teacherId = '01J0000000000000000000000F';
  const branchId = '01J0000000000000000000000G';
  const otherBranchId = '01J0000000000000000000000H';
  const otherTeacherId = '01J0000000000000000000000K';
  const otherCourseId = '01J0000000000000000000000M';
  const otherRoomId = '01J0000000000000000000000N';
  const otherLevelId = '01J0000000000000000000000P';
  await execute(dbName, `
    INSERT INTO courses (id, tenant_id, code, name) VALUES ('${courseId}', '${tenantId}', 'SCHEMA-C1', 'Schema Course');
    INSERT INTO teachers (id, tenant_id, code, name) VALUES ('${teacherId}', '${tenantId}', 'SCHEMA-T1', 'Schema Teacher');
    INSERT INTO branches (id, tenant_id, code, name) VALUES ('${branchId}', '${tenantId}', 'SCHEMA-B1', 'Schema Branch');
    INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id) VALUES ('01J0000000000000000000000T', '${tenantId}', '${teacherId}', '${branchId}');
    INSERT INTO rooms (id, tenant_id, branch_id, code, name) VALUES ('01J0000000000000000000000R', '${tenantId}', '${branchId}', 'SCHEMA-R1', 'Schema Room');
    INSERT INTO course_levels (id, tenant_id, course_id, code, name) VALUES ('01J0000000000000000000000S', '${tenantId}', '${courseId}', 'SCHEMA-L1', 'Schema Level');
    INSERT INTO classes (id, tenant_id, course_id, code, name) VALUES ('01J0000000000000000000000V', '${tenantId}', '${courseId}', 'SCHEMA-K1', 'Schema Class');
    INSERT INTO teachers (id, tenant_id, code, name) VALUES ('${otherTeacherId}', '${otherTenantId}', 'SCHEMA-T2', 'Other Teacher');
    INSERT INTO branches (id, tenant_id, code, name) VALUES ('${otherBranchId}', '${otherTenantId}', 'SCHEMA-B2', 'Other Branch');
    INSERT INTO courses (id, tenant_id, code, name) VALUES ('${otherCourseId}', '${otherTenantId}', 'SCHEMA-C2', 'Other Course');
    INSERT INTO rooms (id, tenant_id, branch_id, code, name) VALUES ('${otherRoomId}', '${otherTenantId}', '${otherBranchId}', 'SCHEMA-R2', 'Other Room');
    INSERT INTO course_levels (id, tenant_id, course_id, code, name) VALUES ('${otherLevelId}', '${otherTenantId}', '${otherCourseId}', 'SCHEMA-L2', 'Other Level');
  `);
  const crossTenant = async (sql, message) =>
    assert.rejects(() => execute(dbName, sql), undefined, `${label}: ${message}`);
  await crossTenant(
    `INSERT INTO rooms (id, tenant_id, branch_id, code, name) VALUES ('01J0000000000000000000000W', '${otherTenantId}', '${branchId}', 'X', 'Cross')`,
    'cross-tenant Room → Branch relationship was allowed',
  );
  await crossTenant(
    `INSERT INTO course_levels (id, tenant_id, course_id, code, name) VALUES ('01J0000000000000000000000X', '${otherTenantId}', '${courseId}', 'X', 'Cross')`,
    'cross-tenant CourseLevel → Course relationship was allowed',
  );
  await crossTenant(
    `INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id) VALUES ('01J0000000000000000000000Y', '${otherTenantId}', '${teacherId}', '${otherBranchId}')`,
    'cross-tenant TeacherBranch → Teacher relationship was allowed',
  );
  await crossTenant(
    `INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id) VALUES ('01J0000000000000000000000Z', '${otherTenantId}', '${otherTeacherId}', '${branchId}')`,
    'cross-tenant TeacherBranch → Branch relationship was allowed',
  );
  await crossTenant(
    `INSERT INTO classes (id, tenant_id, course_id, code, name) VALUES ('01J000000000000000000000A0', '${otherTenantId}', '${courseId}', 'X', 'Cross')`,
    'cross-tenant Class → Course relationship was allowed',
  );
  await crossTenant(
    `INSERT INTO classes (id, tenant_id, course_id, branch_id, code, name) VALUES ('01J000000000000000000000A1', '${tenantId}', '${courseId}', '${otherBranchId}', 'X', 'Cross')`,
    'cross-tenant Class → Branch relationship was allowed',
  );
  await crossTenant(
    `INSERT INTO classes (id, tenant_id, course_id, default_room_id, code, name) VALUES ('01J000000000000000000000A2', '${tenantId}', '${courseId}', '${otherRoomId}', 'X', 'Cross')`,
    'cross-tenant Class → Room relationship was allowed',
  );
  await crossTenant(
    `INSERT INTO classes (id, tenant_id, course_id, primary_teacher_id, code, name) VALUES ('01J000000000000000000000A3', '${tenantId}', '${courseId}', '${otherTeacherId}', 'X', 'Cross')`,
    'cross-tenant Class → Teacher relationship was allowed',
  );
  await crossTenant(
    `INSERT INTO classes (id, tenant_id, course_id, course_level_id, code, name) VALUES ('01J000000000000000000000A4', '${tenantId}', '${courseId}', '${otherLevelId}', 'X', 'Cross')`,
    'cross-tenant Class → CourseLevel relationship was allowed',
  );
}

async function assertLocal05Constraints(dbName, label) {
  const tenantId = '01J00000000000000000000001';
  const otherTenantId = '01J00000000000000000000002';
  const studentId = '01J00000000000000000000000';
  const otherStudentId = '01J000000000000000000000B0';
  const otherCourseId = '01J0000000000000000000000M';
  const otherClassId = '01J000000000000000000000B1';
  const classId = '01J0000000000000000000000V';
  await execute(dbName, `
    INSERT INTO students (id, tenant_id, code, full_name) VALUES ('${otherStudentId}', '${otherTenantId}', 'SCHEMA-S2', 'Other Student');
    INSERT INTO classes (id, tenant_id, course_id, code, name) VALUES ('${otherClassId}', '${otherTenantId}', '${otherCourseId}', 'SCHEMA-K2', 'Other Class');
    INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ('01J000000000000000000000B2', '${tenantId}', '${studentId}', '${classId}', 'ACTIVE');
  `);
  const rejects = async (sql, message) => assert.rejects(() => execute(dbName, sql), undefined, `${label}: ${message}`);
  await rejects(
    `INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ('01J000000000000000000000B3', '${tenantId}', '${studentId}', '${classId}', 'ACTIVE')`,
    'duplicate operational Enrollment was allowed',
  );
  await rejects(
    `INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ('01J000000000000000000000B4', '${otherTenantId}', '${studentId}', '${otherClassId}', 'ACTIVE')`,
    'cross-tenant Enrollment → Student relationship was allowed',
  );
  await rejects(
    `INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ('01J000000000000000000000B5', '${tenantId}', '${otherStudentId}', '${classId}', 'ACTIVE')`,
    'cross-tenant Enrollment → Class relationship was allowed',
  );
  await rejects(
    `INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ('01J000000000000000000000B6', '${tenantId}', '${studentId}', '${classId}', 'SUSPENDED')`,
    'invalid Enrollment status was allowed',
  );
  await execute(dbName, `
    INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ('01J000000000000000000000B7', '${otherTenantId}', '${otherStudentId}', '${otherClassId}', 'WITHDRAWN');
    UPDATE enrollments SET status = 'WITHDRAWN' WHERE id = '01J000000000000000000000B2';
  `);
  await execute(dbName, `
    INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ('01J000000000000000000000B8', '${tenantId}', '${studentId}', '${classId}', 'ACTIVE');
    INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) VALUES ('01J000000000000000000000B9', '${tenantId}', '${studentId}', '${classId}', 'WITHDRAWN');
  `);
  await rejects(
    `UPDATE enrollments SET status = 'SUSPENDED' WHERE id = '01J000000000000000000000B8'`,
    'Enrollment status CHECK was not enforced on UPDATE',
  );
  await rejects(
    `INSERT INTO enrollments (id, tenant_id, student_id, class_id, status, source_enrollment_id) VALUES ('01J000000000000000000000BA', '${otherTenantId}', '${otherStudentId}', '${otherClassId}', 'ACTIVE', '01J000000000000000000000B8')`,
    'cross-tenant Enrollment → source Enrollment relationship was allowed',
  );
  await execute(dbName, `
    INSERT INTO enrollments (id, tenant_id, student_id, class_id, status, source_enrollment_id) VALUES ('01J000000000000000000000BB', '${otherTenantId}', '${otherStudentId}', '${otherClassId}', 'ACTIVE', '01J000000000000000000000B7');
    INSERT INTO enrollment_events (id, tenant_id, enrollment_id, type, from_status, to_status) VALUES ('01J000000000000000000000BC', '${otherTenantId}', '01J000000000000000000000BB', 'ENROLLED', NULL, 'ACTIVE');
  `);
  await rejects(
    `INSERT INTO enrollment_events (id, tenant_id, enrollment_id, type) VALUES ('01J000000000000000000000BD', '${tenantId}', '01J000000000000000000000BB', 'ENROLLED')`,
    'cross-tenant EnrollmentEvent → Enrollment relationship was allowed',
  );
  await rejects(
    `INSERT INTO enrollment_events (id, tenant_id, enrollment_id, type) VALUES ('01J000000000000000000000BE', '${otherTenantId}', '01J000000000000000000000BB', 'HACKED')`,
    'invalid EnrollmentEvent type was allowed',
  );
}

async function assertLocal06Constraints(dbName, label) {
  const tenantId = '01J00000000000000000000001';
  const otherTenantId = '01J00000000000000000000002';
  const classId = '01J0000000000000000000000V';
  const teacherId = '01J0000000000000000000000F';
  const branchId = '01J0000000000000000000000G';
  const roomId = '01J0000000000000000000000R';
  const studentId = '01J00000000000000000000000';
  const patternId = '01J000000000000000000000C0';
  const sessionId = '01J000000000000000000000C1';
  const replacementId = '01J000000000000000000000C2';
  const recordId = '01J000000000000000000000C3';
  const exclusionId = '01J000000000000000000000C4';
  const branchExclusionId = '01J000000000000000000000C5';

  await execute(dbName, `
    INSERT INTO schedules
      (id, tenant_id, class_id, teacher_id, branch_id, room_id, day_of_week, start_time, end_time, effective_from, effective_until)
    VALUES
      ('${patternId}', '${tenantId}', '${classId}', '${teacherId}', '${branchId}', '${roomId}', 'MONDAY', '08:00', '09:00', '2030-01-01', '2030-12-31');
    INSERT INTO attendance_sessions
      (id, tenant_id, class_id, schedule_pattern_id, teacher_id, room_id, branch_id, session_date, start_time, end_time, status)
    VALUES
      ('${sessionId}', '${tenantId}', '${classId}', '${patternId}', '${teacherId}', '${roomId}', '${branchId}', '2030-01-07', '08:00', '09:00', 'SCHEDULED');
    INSERT INTO attendance_records (id, tenant_id, session_id, student_id, status)
    VALUES ('${recordId}', '${tenantId}', '${sessionId}', '${studentId}', 'PRESENT');
    INSERT INTO schedule_exclusions (id, tenant_id, date, reason)
    VALUES ('${exclusionId}', '${tenantId}', '2030-01-14', 'Tenant holiday');
    INSERT INTO schedule_exclusions (id, tenant_id, date, branch_id, reason)
    VALUES ('${branchExclusionId}', '${tenantId}', '2030-01-14', '${branchId}', 'Branch closure');
  `);

  const preserved = await query(dbName, `
    SELECT s.id AS "patternId", a.id AS "sessionId", r.session_id AS "recordSessionId"
    FROM schedules s
    JOIN attendance_sessions a ON a.tenant_id = s.tenant_id AND a.schedule_pattern_id = s.id
    JOIN attendance_records r ON r.tenant_id = a.tenant_id AND r.session_id = a.id
    WHERE s.tenant_id = $1 AND s.id = $2
  `, [tenantId, patternId]);
  assert.deepEqual(preserved, [{ patternId, sessionId, recordSessionId: sessionId }], `${label}: Schedule/Session/AttendanceRecord links were not preserved`);

  const rejects = async (sql, message) => assert.rejects(() => execute(dbName, sql), undefined, `${label}: ${message}`);
  await rejects(
    `INSERT INTO schedules (id, tenant_id, class_id, teacher_id, day_of_week, start_time, end_time) VALUES ('01J0000000000000000000C6', '${otherTenantId}', '${classId}', '${teacherId}', 'TUESDAY', '08:00', '09:00')`,
    'cross-tenant SchedulePattern relationships were allowed',
  );
  await rejects(
    `INSERT INTO attendance_sessions (id, tenant_id, class_id, schedule_pattern_id, session_date, start_time, end_time) VALUES ('01J000000000000000000000C7', '${otherTenantId}', '${classId}', '${patternId}', '2030-01-08', '08:00', '09:00')`,
    'cross-tenant Session relationships were allowed',
  );
  await rejects(
    `INSERT INTO attendance_records (id, tenant_id, session_id, student_id) VALUES ('01J000000000000000000000C8', '${otherTenantId}', '${sessionId}', '${studentId}')`,
    'cross-tenant AttendanceRecord relationships were allowed',
  );
  await rejects(
    `INSERT INTO attendance_sessions (id, tenant_id, class_id, schedule_pattern_id, session_date, start_time, end_time) VALUES ('01J000000000000000000000C9', '${tenantId}', '${classId}', '${patternId}', '2030-01-07', '08:00', '09:00')`,
    'duplicate generated Session occurrence was allowed',
  );
  await rejects(
    `INSERT INTO schedule_exclusions (id, tenant_id, date, reason) VALUES ('01J000000000000000000000CA', '${tenantId}', '2030-01-14', 'Duplicate tenant holiday')`,
    'duplicate tenant-wide exclusion was allowed',
  );
  await rejects(
    `INSERT INTO schedule_exclusions (id, tenant_id, date, branch_id, reason) VALUES ('01J000000000000000000000CB', '${tenantId}', '2030-01-14', '${branchId}', 'Duplicate branch closure')`,
    'duplicate branch exclusion was allowed',
  );
  await rejects(
    `INSERT INTO attendance_sessions (id, tenant_id, class_id, schedule_pattern_id, session_date, start_time, end_time, rescheduled_from_id, source_session_date, source_start_time, source_end_time) VALUES ('01J000000000000000000000CC', '${tenantId}', '${classId}', '${patternId}', '2030-01-08', '08:00', '09:00', '01J000000000000000000000CC', '2030-01-07', '08:00', '09:00')`,
    'self-rescheduled Session was allowed',
  );
  await rejects(
    `INSERT INTO attendance_sessions (id, tenant_id, class_id, schedule_pattern_id, session_date, start_time, end_time, rescheduled_from_id) VALUES ('01J000000000000000000000CD', '${tenantId}', '${classId}', '${patternId}', '2030-01-08', '08:00', '09:00', '${sessionId}')`,
    'incomplete reschedule source metadata was allowed',
  );
  await rejects(
    `INSERT INTO attendance_sessions (id, tenant_id, class_id, schedule_pattern_id, session_date, start_time, end_time) VALUES ('01J000000000000000000000CE', '${tenantId}', '${classId}', '${patternId}', '2030-01-08', '09:00', '08:00')`,
    'invalid Session time range was allowed',
  );

  await execute(dbName, `
    INSERT INTO attendance_sessions
      (id, tenant_id, class_id, schedule_pattern_id, teacher_id, room_id, branch_id, session_date, start_time, end_time, manual_override, rescheduled_from_id, reschedule_reason, source_session_date, source_start_time, source_end_time)
    VALUES
      ('${replacementId}', '${tenantId}', '${classId}', '${patternId}', '${teacherId}', '${roomId}', '${branchId}', '2030-01-08', '08:00', '09:00', TRUE, '${sessionId}', 'Moved', '2030-01-07', '08:00', '09:00');
    UPDATE attendance_sessions SET status = 'RESCHEDULED' WHERE tenant_id = '${tenantId}' AND id = '${sessionId}';
  `);
  const history = await query(dbName, `
    SELECT status FROM attendance_sessions WHERE tenant_id = $1 AND id IN ($2, $3) ORDER BY id
  `, [tenantId, sessionId, replacementId]);
  assert.deepEqual(history, [{ status: 'RESCHEDULED' }, { status: 'SCHEDULED' }], `${label}: Session history status was not preserved`);
}

async function assertLocal07Constraints(dbName, label) {
  const tenantId = '01J00000000000000000000001';
  const otherTenantId = '01J00000000000000000000002';
  const classId = '01J0000000000000000000000V';
  const otherClassId = '01J000000000000000000000B1';
  const studentId = '01J00000000000000000000000';
  const otherStudentId = '01J00000000000000000000006';
  const sessionId = '01J000000000000000000000D0';
  const destinationId = '01J000000000000000000000D1';
  const recordId = '01J000000000000000000000D2';
  const entitlementId = '01J000000000000000000000D3';
  const bookingId = '01J000000000000000000000D4';
  const otherSessionId = '01J000000000000000000000D5';

  await execute(dbName, `
    INSERT INTO students (id, tenant_id, code, full_name)
    VALUES ('${otherStudentId}', '${otherTenantId}', 'SCHEMA-S3', 'Other Student');
    INSERT INTO attendance_sessions (id, tenant_id, class_id, session_date, start_time, end_time, status)
    VALUES
      ('${sessionId}', '${tenantId}', '${classId}', '2030-02-01', '08:00', '09:00', 'COMPLETED'),
      ('${destinationId}', '${tenantId}', '${classId}', '2030-02-02', '08:00', '09:00', 'SCHEDULED'),
      ('${otherSessionId}', '${otherTenantId}', '${otherClassId}', '2030-02-02', '08:00', '09:00', 'SCHEDULED');
    INSERT INTO attendance_sheets (id, tenant_id, session_id, status, locked_at)
    VALUES ('01J000000000000000000000D6', '${tenantId}', '${sessionId}', 'LOCKED', CURRENT_TIMESTAMP);
    INSERT INTO attendance_records (id, tenant_id, session_id, student_id, status, source)
    VALUES ('${recordId}', '${tenantId}', '${sessionId}', '${studentId}', 'ABSENT_EXCUSED', 'REGULAR');
    INSERT INTO makeup_entitlements (id, tenant_id, student_id, source_attendance_record_id, source_session_id, expires_at)
    VALUES ('${entitlementId}', '${tenantId}', '${studentId}', '${recordId}', '${sessionId}', '2030-03-01');
    INSERT INTO makeup_bookings (id, tenant_id, entitlement_id, student_id, destination_session_id)
    VALUES ('${bookingId}', '${tenantId}', '${entitlementId}', '${studentId}', '${destinationId}');
    INSERT INTO attendance_sheets (id, tenant_id, session_id)
    VALUES ('01J000000000000000000000D7', '${tenantId}', '${destinationId}');
    INSERT INTO attendance_records (id, tenant_id, session_id, student_id, makeup_booking_id, status, source)
    VALUES ('01J000000000000000000000D8', '${tenantId}', '${destinationId}', '${studentId}', '${bookingId}', 'MAKEUP', 'MAKEUP');
  `);

  const rows = await query(dbName, `
    SELECT e.status AS "entitlementStatus", b.status AS "bookingStatus", r.status AS "attendanceStatus"
    FROM makeup_entitlements e
    JOIN makeup_bookings b ON b.tenant_id = e.tenant_id AND b.entitlement_id = e.id
    JOIN attendance_records r ON r.tenant_id = b.tenant_id AND r.makeup_booking_id = b.id
    WHERE e.tenant_id = $1 AND e.id = $2
  `, [tenantId, entitlementId]);
  assert.deepEqual(rows, [{ entitlementStatus: 'AVAILABLE', bookingStatus: 'BOOKED', attendanceStatus: 'MAKEUP' }], `${label}: makeup rows were not preserved`);

  const rejects = async (sql, message) => assert.rejects(() => execute(dbName, sql), undefined, `${label}: ${message}`);
  await rejects(
    `INSERT INTO attendance_sheets (id, tenant_id, session_id) VALUES ('01J000000000000000000000D9', '${otherTenantId}', '${sessionId}')`,
    'cross-tenant AttendanceSheet relationship was allowed',
  );
  await rejects(
    `INSERT INTO makeup_entitlements (id, tenant_id, student_id, source_attendance_record_id, source_session_id, expires_at) VALUES ('01J000000000000000000000DA', '${otherTenantId}', '${otherStudentId}', '${recordId}', '${sessionId}', '2030-03-01')`,
    'cross-tenant MakeupEntitlement relationship was allowed',
  );
  await rejects(
    `INSERT INTO makeup_bookings (id, tenant_id, entitlement_id, student_id, destination_session_id) VALUES ('01J000000000000000000000DB', '${tenantId}', '${entitlementId}', '${otherStudentId}', '${destinationId}')`,
    'booking student/entitlement integrity was not enforced',
  );
  await rejects(
    `INSERT INTO attendance_records (id, tenant_id, session_id, student_id, makeup_booking_id, status, source) VALUES ('01J000000000000000000000DC', '${tenantId}', '${destinationId}', '${studentId}', '${bookingId}', 'PRESENT', 'MAKEUP')`,
    'invalid MAKEUP attendance status was allowed',
  );
  await rejects(
    `INSERT INTO attendance_records (id, tenant_id, session_id, student_id, makeup_booking_id, status, source) VALUES ('01J000000000000000000000DD', '${tenantId}', '${otherSessionId}', '${studentId}', '${bookingId}', 'MAKEUP', 'MAKEUP')`,
    'booking destination/session integrity was not enforced',
  );
  await rejects(
    `INSERT INTO makeup_bookings (id, tenant_id, entitlement_id, student_id, destination_session_id) VALUES ('01J000000000000000000000DE', '${tenantId}', '${entitlementId}', '${studentId}', '${destinationId}')`,
    'duplicate active entitlement booking was allowed',
  );
}

async function assertBaselineNotRecorded(dbName, label) {
  const rows = await query(
    dbName,
    `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "recorded"`,
  );
  assert.equal(rows[0].recorded, false, `${label}: Prisma baseline was recorded after rejection`);
}

async function verifyDrift(label, mutate) {
  const dbName = `${LEGACY_PREFIX}${runId}_${label}`;
  await createDatabase(dbName);
  await createLegacyBaseline(dbName);
  await mutate(dbName);
  await assert.rejects(
    () => deployTenantSchema(dbName),
    /Tenant database has an unknown schema and cannot be baselined/,
    `${label}: drift was accepted`,
  );
  await assertBaselineNotRecorded(dbName, label);
}

async function main() {
  const fresh = `${LEGACY_PREFIX}${runId}_fresh`;
  const legacy = `${LEGACY_PREFIX}${runId}_legacy`;
  await createDatabase(fresh);
  await createDatabase(legacy);

  await deployTenantSchema(fresh);
  await createLegacyBaseline(legacy);
  await deployTenantSchema(legacy);

  const legacyRows = await query(legacy, 'SELECT code, full_name FROM students');
  assert.deepEqual(legacyRows, [{ code: 'LEGACY-1', full_name: 'Legacy Student' }]);
  const freshCatalog = await captureCatalog(fresh);
  const legacyCatalog = await captureCatalog(legacy);
  assert.deepEqual(
    legacyCatalog,
    freshCatalog,
    `Fresh and legacy-upgraded catalogs differ:\n${catalogDiff(freshCatalog, legacyCatalog)}`,
  );

  const beforeRetry = await captureCatalog(fresh);
  await deployTenantSchema(fresh);
  const afterRetry = await captureCatalog(fresh);
  assert.deepEqual(afterRetry, beforeRetry, 'Rerunning current tenant changed its catalog');
  await deployTenantSchema(legacy);
  assert.deepEqual(await query(legacy, 'SELECT code, full_name FROM students'), legacyRows);
  await assertStudent360Constraints(fresh, 'fresh');
  await assertStudent360Constraints(legacy, 'legacy');
  await assertLocal04Constraints(fresh, 'fresh');
  await assertLocal04Constraints(legacy, 'legacy');
  await assertLocal05Constraints(fresh, 'fresh');
  await assertLocal05Constraints(legacy, 'legacy');
  await assertLocal06Constraints(fresh, 'fresh');
  await assertLocal06Constraints(legacy, 'legacy');
  await assertLocal07Constraints(fresh, 'fresh');
  await assertLocal07Constraints(legacy, 'legacy');
  await assertAppendOnly(fresh, 'fresh');
  await assertAppendOnly(legacy, 'legacy');

  await verifyDrift('missing_column', (dbName) => execute(dbName, 'ALTER TABLE students DROP COLUMN email'));
  await verifyDrift('wrong_type', (dbName) =>
    execute(dbName, 'ALTER TABLE students ALTER COLUMN code TYPE VARCHAR(100)'),
  );
  await verifyDrift('wrong_char_length', (dbName) =>
    execute(dbName, 'ALTER TABLE students ALTER COLUMN tenant_id TYPE CHAR(25) USING substring(tenant_id FROM 1 FOR 25)'),
  );
  await verifyDrift('missing_constraint', (dbName) =>
    execute(dbName, 'ALTER TABLE students DROP CONSTRAINT students_status_check'),
  );
  await verifyDrift('missing_index', (dbName) =>
    execute(dbName, 'DROP INDEX students_tenant_id_full_name_id_idx'),
  );
  await verifyDrift('unexpected_table', (dbName) =>
    execute(dbName, 'CREATE TABLE unexpected_business_table (id INTEGER PRIMARY KEY)'),
  );
  await verifyDrift('incorrect_ledger', (dbName) =>
    execute(dbName, "INSERT INTO _classora_tenant_migrations (version, name) VALUES (2, 'future')"),
  );

  console.log('Tenant schema equivalence passed: fresh, supported legacy, drift rejection, and idempotent rerun.');
}

try {
  await main();
} finally {
  for (const dbName of databases) {
    try {
      await dropDatabase(dbName);
    } catch (error) {
      console.error(`Cleanup failed for disposable database ${dbName}:`, error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
