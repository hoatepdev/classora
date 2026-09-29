import dotenv from 'dotenv'; dotenv.config({ override: true });
import { escapeIdentifier, Pool } from 'pg';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { postgresConfig } from '../src/config.js';
import { deployTenantSchema } from '../src/database/tenant-migrations.js';
import { TenantContextService, type TenantContext } from '../src/tenant/tenant-context.service.js';
import { AuditService } from '../src/audit/audit.service.js';
import { StudentsService } from '../src/students/students.service.js';
import { TeachersService } from '../src/teachers/teachers.service.js';
import { CoursesService } from '../src/courses/courses.service.js';
import { ClassesService } from '../src/classes/classes.service.js';
import { EnrollmentsService } from '../src/enrollments/enrollments.service.js';
import { DataTransferImportService } from '../src/data-transfer/data-transfer-import.service.js';
import { DataTransferExportService } from '../src/data-transfer/data-transfer-export.service.js';
import { permissionsForRole } from '../src/authorization/permissions.js';

const enabled = process.env.B5_TEST_DATABASE === '1';
const OWNER = permissionsForRole('OWNER');

function csvFile(headers: string[], rows: string[][]): Buffer {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  return Buffer.from(`﻿${[headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`, 'utf-8');
}

describe.skipIf(!enabled)('LOCAL-16 import/export hard gates (real PostgreSQL)', () => {
  let admin: Pool, a: Pool, b: Pool;
  let context: TenantContextService;
  let imports: DataTransferImportService;
  let exports: DataTransferExportService;
  let studentsService: StudentsService;
  const names = { a: '', b: '' };
  const ids = { ta: ulid(), tb: ulid(), owner: ulid() };
  const metaA = { tenantId: ids.ta, tenantSlug: 'data-a', dbName: '' };
  const metaB = { tenantId: ids.tb, tenantSlug: 'data-b', dbName: '' };
  const ctx = (pool: Pool, meta: typeof metaA) => ({ tenant: meta, pool, actorUserId: ids.owner, actorMembershipId: ulid(), actorName: 'Owner' }) as TenantContext;
  const runA = <T,>(fn: () => Promise<T>) => context.run<T>(ctx(a, metaA), fn);
  const runB = <T,>(fn: () => Promise<T>) => context.run<T>(ctx(b, metaB), fn);
  const uploadA = (type: string, headers: string[], rows: string[][]) =>
    runA(() => imports.upload(type, { originalname: `${type.toLowerCase()}.csv`, buffer: csvFile(headers, rows) }, OWNER));
  const count = async (pool: Pool, sql: string, values: unknown[] = []) => Number((await pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c ${sql}`, values)).rows[0].c);

  beforeAll(async () => {
    const config = postgresConfig();
    const runId = `${Date.now()}_${process.pid}`;
    names.a = `classora_local16_${runId}_a`;
    names.b = `classora_local16_${runId}_b`;
    metaA.dbName = names.a;
    metaB.dbName = names.b;
    admin = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase });
    for (const name of Object.values(names)) await admin.query(`CREATE DATABASE ${escapeIdentifier(name)}`);
    await deployTenantSchema(names.a);
    await deployTenantSchema(names.b);
    const base = { host: config.host, port: config.port, user: config.user, password: config.password };
    a = new Pool({ ...base, database: names.a, max: 12 });
    b = new Pool({ ...base, database: names.b, max: 4 });

    // Shared fixtures in tenant A: two branches, a room, a teacher on HN.
    await a.query(`INSERT INTO branches (id, tenant_id, code, name) VALUES ($1,$2,'HN','Hà Nội'), ($3,$2,'HCM','TP.HCM')`, [ulid(), ids.ta, ulid()]);
    await a.query(`INSERT INTO rooms (id, tenant_id, branch_id, code, name) VALUES ($1,$2,(SELECT id FROM branches WHERE tenant_id=$2 AND code='HN'),'R101','Phòng R101')`, [ulid(), ids.ta]);
    await a.query(`INSERT INTO teachers (id, tenant_id, code, name) VALUES ($1,$2,'T101','Giáo viên A')`, [ulid(), ids.ta]);
    await a.query(`INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id) SELECT $1,$2,t.id,br.id FROM teachers t, branches br WHERE t.tenant_id=$2 AND t.code='T101' AND br.tenant_id=$2 AND br.code='HN'`, [ulid(), ids.ta]);
    // Tenant B owns a code that tenant A must never resolve.
    await b.query(`INSERT INTO branches (id, tenant_id, code, name) VALUES ($1,$2,'BB','Chi nhánh B')`, [ulid(), ids.tb]);

    context = new TenantContextService();
    const audit = new AuditService(undefined as never, context);
    const teachers = new TeachersService(context, audit);
    const courses = new CoursesService(context, audit);
    const classes = new ClassesService(context, audit);
    const enrollments = new EnrollmentsService(context, audit);
    studentsService = new StudentsService(context, audit);
    imports = new DataTransferImportService(context, audit, studentsService, teachers, courses, classes, enrollments);
    exports = new DataTransferExportService(context);
  }, 180000);

  afterAll(async () => {
    for (const pool of [a, b, admin]) await pool?.end().catch(() => undefined);
    const config = postgresConfig();
    const cleanup = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase });
    for (const name of Object.values(names)) await cleanup.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(name)} WITH (FORCE)`).catch(() => undefined);
    await cleanup.end();
  });

  it('imports students end-to-end: dry-run validation writes nothing, confirm is atomic and audited', async () => {
    const upload = await uploadA('STUDENTS', ['code', 'fullName', 'phone'], [
      ['SA1', 'Nguyễn Văn A, Jr.', '0981000001'],
      ['SA2', 'Trần Thị B', '0981000002'],
      ['SA3', 'Lê Văn C', ''],
    ]);
    expect(upload.status).toBe('UPLOADED');
    expect(upload.mapping.fields).toEqual({ code: 'code', fullName: 'fullName', phone: 'phone' });
    expect(upload.duplicateWarning).toBe(false);

    const validated = await runA(() => imports.validate(upload.id, OWNER));
    expect(validated.status).toBe('VALIDATED');
    expect(validated.validRows).toBe(3);
    expect(validated.invalidRows).toBe(0);
    expect(await count(a, 'FROM students WHERE tenant_id=$1 AND code LIKE $2', [ids.ta, 'SA%'])).toBe(0);

    const completed = await runA(() => imports.confirm(upload.id, OWNER));
    expect(completed.status).toBe('COMPLETED');
    expect(completed.importedRows).toBe(3);
    const students = await a.query<{ code: string; full_name: string }>(`SELECT code, full_name FROM students WHERE tenant_id=$1 AND code LIKE $2 ORDER BY code`, [ids.ta, 'SA%']);
    expect(students.rows.map((row) => row.full_name)).toContain('Nguyễn Văn A, Jr.');

    const actions = await a.query<{ action: string }>(`SELECT action FROM audit_events WHERE tenant_id=$1 AND entity_type='STUDENT' AND entity_id IN (SELECT id FROM students WHERE tenant_id=$1 AND code LIKE 'SA%')`, [ids.ta]);
    expect(actions.rows).toHaveLength(3);
    const batchActions = await a.query<{ action: string }>(`SELECT action FROM audit_events WHERE tenant_id=$1 AND entity_type='IMPORT_BATCH' AND entity_id=$2 ORDER BY action`, [ids.ta, upload.id]);
    expect(batchActions.rows.map((row) => row.action).sort()).toEqual(['data_import.completed', 'data_import.created', 'data_import.validated']);
    expect(JSON.stringify(batchActions.rows)).not.toContain('0981000001');

    const again = await runA(() => imports.confirm(upload.id, OWNER));
    expect(again.status).toBe('COMPLETED');
    expect(await count(a, 'FROM students WHERE tenant_id=$1 AND code LIKE $2', [ids.ta, 'SA%'])).toBe(3);
  });

  it('blocks duplicates, missing required fields and malformed values without writing', async () => {
    const upload = await uploadA('STUDENTS', ['code', 'fullName', 'email', 'gender', 'dateOfBirth'], [
      ['SD1', 'Dup One', 'd1@example.com', 'FEMALE', '2010-01-01'],
      ['sd1', 'Dup Two', 'd2@example.com', 'FEMALE', '2010-01-01'],
      ['SA1', 'Existing', '', '', ''],
      ['', 'No Code', '', '', ''],
      ['SF1', 'Bad Email', 'not-an-email', '', ''],
      ['SG1', 'Bad Gender', '', 'UNKNOWN_X', ''],
      ['SH1', 'Bad Date', '', '', '31-12-2010'],
    ]);
    const validated = await runA(() => imports.validate(upload.id, OWNER));
    expect(validated.validRows).toBe(1);
    expect(validated.invalidRows).toBe(6);
    const rows = await runA(() => imports.rows(upload.id, { page: 1, pageSize: 50, filter: 'ERRORS' }, OWNER));
    const codes = rows.data.flatMap((row: { errors: Array<{ code: string }> }) => row.errors.map((error) => error.code));
    expect(codes).toContain('DUPLICATE_IN_FILE');
    expect(codes).toContain('ALREADY_EXISTS');
    expect(codes).toContain('REQUIRED');
    expect(codes).toContain('INVALID_FORMAT');
    await expect(runA(() => imports.confirm(upload.id, OWNER))).rejects.toBeInstanceOf(ConflictException);
    expect(await count(a, 'FROM students WHERE tenant_id=$1 AND code IN ($2,$3,$4)', [ids.ta, 'SD1', 'SF1', 'SG1'])).toBe(0);

    const errorCsv = await runA(() => imports.errorCsv(upload.id, OWNER));
    expect(errorCsv.csv).toContain('rowNumber,sourceKey,field,errorCode,message');
    expect(errorCsv.csv).toContain('DUPLICATE_IN_FILE');
  });

  it('invalidates prior validation when mapping changes and supports cancel', async () => {
    const upload = await uploadA('STUDENTS', ['mã', 'tên'], [['SI1', 'Học viên I1']]);
    expect(upload.mapping.fields).toEqual({ 'mã': null, 'tên': null });
    await expect(runA(() => imports.validate(upload.id, OWNER))).rejects.toBeInstanceOf(BadRequestException);

    const mapped = await runA(() => imports.updateMapping(upload.id, { 'mã': 'code', 'tên': 'fullName' }, OWNER));
    expect(mapped.status).toBe('UPLOADED');
    const remappedRows = await runA(() => imports.rows(upload.id, { page: 1, pageSize: 10, filter: 'ALL' }, OWNER));
    expect(remappedRows.data[0].status).toBe('PENDING');
    const validated = await runA(() => imports.validate(upload.id, OWNER));
    expect(validated.status).toBe('VALIDATED');
    expect(validated.validRows).toBe(1);

    await expect(runA(() => imports.updateMapping(upload.id, { 'mã': 'code', 'tên': 'phone' }, OWNER))).rejects.toThrow(BadRequestException);
    await expect(runA(() => imports.updateMapping(upload.id, { 'mã': 'code', 'tên': 'code' }, OWNER))).rejects.toThrow(BadRequestException);

    const cancelled = await runA(() => imports.cancel(upload.id, OWNER));
    expect(cancelled.status).toBe('CANCELLED');
    await expect(runA(() => imports.validate(upload.id, OWNER))).rejects.toBeInstanceOf(ConflictException);
    await expect(runA(() => imports.confirm(upload.id, OWNER))).rejects.toBeInstanceOf(ConflictException);
  });

  it('imports teachers with pipe-delimited branch codes through existing TeacherBranch semantics', async () => {
    const upload = await uploadA('TEACHERS', ['code', 'name', 'specialties', 'branchCodes'], [
      ['T201', 'Giáo viên 201', 'IELTS|TOEIC', 'HN|HCM'],
      ['T202', 'Giáo viên 202', '', 'HN'],
    ]);
    await runA(() => imports.validate(upload.id, OWNER));
    await runA(() => imports.confirm(upload.id, OWNER));
    expect(await count(a, 'FROM teacher_branches tb JOIN teachers t ON t.tenant_id=tb.tenant_id AND t.id=tb.teacher_id WHERE tb.tenant_id=$1 AND t.code IN ($2,$3)', [ids.ta, 'T201', 'T202'])).toBe(3);
    expect(await count(a, "FROM audit_events WHERE tenant_id=$1 AND action='teacher.branch_assigned'", [ids.ta])).toBeGreaterThanOrEqual(3);

    const bad = await uploadA('TEACHERS', ['code', 'name', 'branchCodes'], [['T203', 'Giáo viên 203', 'XX']]);
    const validated = await runA(() => imports.validate(bad.id, OWNER));
    expect(validated.invalidRows).toBe(1);
    const rows = await runA(() => imports.rows(bad.id, { page: 1, pageSize: 10, filter: 'ERRORS' }, OWNER));
    expect(JSON.stringify(rows.data)).toContain('NOT_FOUND');
    expect(JSON.stringify(rows.data)).toContain('XX');
  });

  it('imports courses, course levels and classes with tenant-scoped relationship resolution', async () => {
    const courses = await uploadA('COURSES', ['code', 'name'], [['C1', 'Tiếng Anh người lớn'], ['C2', 'Tiếng Nhật']]);
    await runA(() => imports.validate(courses.id, OWNER));
    await runA(() => imports.confirm(courses.id, OWNER));

    const levels = await uploadA('COURSE_LEVELS', ['courseCode', 'code', 'name', 'displayOrder'], [
      ['C1', 'L1', 'Cấp độ 1', '1'],
      ['C1', 'L2', 'Cấp độ 2', '2'],
      ['C2', 'J1', 'Sơ cấp', '1'],
    ]);
    const validatedLevels = await runA(() => imports.validate(levels.id, OWNER));
    expect(validatedLevels.validRows).toBe(3);
    await runA(() => imports.confirm(levels.id, OWNER));

    const classes = await uploadA('CLASSES', ['code', 'name', 'courseCode', 'courseLevelCode', 'branchCode', 'defaultRoomCode', 'primaryTeacherCode', 'capacity'], [
      ['K1', 'Lớp buổi tối', 'C1', 'L1', 'HN', 'R101', 'T101', '2'],
    ]);
    const validatedClasses = await runA(() => imports.validate(classes.id, OWNER));
    expect(validatedClasses.validRows).toBe(1);
    await runA(() => imports.confirm(classes.id, OWNER));
    const classRow = (await a.query<{ id: string; course_id: string; branch_id: string; course_level_id: string; default_room_id: string; primary_teacher_id: string }>(`SELECT id, course_id, branch_id, course_level_id, default_room_id, primary_teacher_id FROM classes WHERE tenant_id=$1 AND code='K1'`, [ids.ta])).rows[0];
    expect(classRow.course_id).toBeTruthy();
    expect(classRow.course_level_id).toBeTruthy();
    expect(classRow.default_room_id).toBeTruthy();
    expect(classRow.primary_teacher_id).toBeTruthy();

    // Wrong course-level ownership, a room outside the branch, and codes that
    // exist only in tenant B are all rejected.
    const invalid = await uploadA('CLASSES', ['code', 'name', 'courseCode', 'courseLevelCode', 'branchCode', 'defaultRoomCode'], [
      ['KX1', 'Sai cấp độ', 'C2', 'L1', 'HN', ''],
      ['KX2', 'Sai phòng', 'C1', 'L1', 'HCM', 'R101'],
      ['KX3', 'Chi nhánh khác tenant', 'C1', '', 'BB', ''],
    ]);
    const validatedInvalid = await runA(() => imports.validate(invalid.id, OWNER));
    expect(validatedInvalid.validRows).toBe(0);
    const errorRows = await runA(() => imports.rows(invalid.id, { page: 1, pageSize: 10, filter: 'ERRORS' }, OWNER));
    const serialized = JSON.stringify(errorRows.data);
    expect(serialized).toContain('INVALID_RELATION');
    expect(serialized).toContain('NOT_FOUND');
    expect(await count(a, "FROM classes WHERE tenant_id=$1 AND code LIKE 'KX%'", [ids.ta])).toBe(0);
  });

  it('imports enrollments with capacity, lifecycle history, audit and uniqueness', async () => {
    const upload = await uploadA('ENROLLMENTS', ['studentCode', 'classCode', 'status'], [
      ['SA1', 'K1', 'ACTIVE'],
      ['SA2', 'K1', 'ACTIVE'],
    ]);
    await runA(() => imports.validate(upload.id, OWNER));
    await runA(() => imports.confirm(upload.id, OWNER));
    expect(await count(a, "FROM enrollment_events WHERE tenant_id=$1 AND type IN ('ENROLLED','ACTIVATED')", [ids.ta])).toBeGreaterThanOrEqual(4);
    expect(await count(a, "FROM audit_events WHERE tenant_id=$1 AND action='enrollment.created'", [ids.ta])).toBeGreaterThanOrEqual(2);

    const full = await uploadA('ENROLLMENTS', ['studentCode', 'classCode', 'status'], [['SA3', 'K1', 'ACTIVE']]);
    const validatedFull = await runA(() => imports.validate(full.id, OWNER));
    expect(validatedFull.invalidRows).toBe(1);
    const rows = await runA(() => imports.rows(full.id, { page: 1, pageSize: 10, filter: 'ERRORS' }, OWNER));
    expect(JSON.stringify(rows.data)).toContain('CAPACITY_CONFLICT');

    const history = await uploadA('ENROLLMENTS', ['studentCode', 'classCode', 'status'], [['SA3', 'K1', 'COMPLETED']]);
    const validatedHistory = await runA(() => imports.validate(history.id, OWNER));
    expect(validatedHistory.invalidRows).toBe(1);
    const historyRows = await runA(() => imports.rows(history.id, { page: 1, pageSize: 10, filter: 'ERRORS' }, OWNER));
    expect(JSON.stringify(historyRows.data)).toContain('INVALID_FORMAT');

    const duplicate = await uploadA('ENROLLMENTS', ['studentCode', 'classCode', 'status'], [['SA1', 'K1', 'PENDING']]);
    const validatedDuplicate = await runA(() => imports.validate(duplicate.id, OWNER));
    expect(validatedDuplicate.invalidRows).toBe(1);
    const duplicateRows = await runA(() => imports.rows(duplicate.id, { page: 1, pageSize: 10, filter: 'ERRORS' }, OWNER));
    expect(JSON.stringify(duplicateRows.data)).toContain('ALREADY_EXISTS');
  });

  it('rolls back the whole batch when confirm hits a stale duplicate code', async () => {
    const upload = await uploadA('STUDENTS', ['code', 'fullName'], [['SB1', 'Học viên B1'], ['SB2', 'Học viên B2']]);
    await runA(() => imports.validate(upload.id, OWNER));
    await a.query(`INSERT INTO students (id, tenant_id, code, full_name) VALUES ($1,$2,'SB1','Được tạo thủ công')`, [ulid(), ids.ta]);
    await expect(runA(() => imports.confirm(upload.id, OWNER))).rejects.toBeInstanceOf(ConflictException);
    const failed = await runA(() => imports.get(upload.id, OWNER));
    expect(failed.status).toBe('FAILED');
    expect(failed.failure?.code).toBe('ALREADY_EXISTS');
    expect(failed.failure?.rowNumber).toBe(1);
    expect(await count(a, "FROM students WHERE tenant_id=$1 AND code='SB2'", [ids.ta])).toBe(0);
    await expect(runA(() => imports.confirm(upload.id, OWNER))).rejects.toBeInstanceOf(ConflictException);
    await expect(runA(() => imports.updateMapping(upload.id, {}, OWNER))).rejects.toBeInstanceOf(ConflictException);
  });

  it('rolls back when class capacity changed between validation and confirm', async () => {
    await a.query(`INSERT INTO classes (id, tenant_id, course_id, code, name, capacity) SELECT $1,$2,c.id,'K2','Lớp sức chứa 1',1 FROM courses c WHERE c.tenant_id=$2 AND c.code='C1'`, [ulid(), ids.ta]);
    const upload = await uploadA('ENROLLMENTS', ['studentCode', 'classCode', 'status'], [['SB1', 'K2', 'ACTIVE']]);
    const validated = await runA(() => imports.validate(upload.id, OWNER));
    expect(validated.validRows).toBe(1);
    await a.query(`INSERT INTO enrollments (id, tenant_id, student_id, class_id, status) SELECT $1,$2,s.id,c.id,'ACTIVE' FROM students s, classes c WHERE s.tenant_id=$2 AND s.code='SA3' AND c.tenant_id=$2 AND c.code='K2'`, [ulid(), ids.ta]);
    await expect(runA(() => imports.confirm(upload.id, OWNER))).rejects.toBeInstanceOf(ConflictException);
    const failed = await runA(() => imports.get(upload.id, OWNER));
    expect(failed.status).toBe('FAILED');
    expect(failed.failure?.code).toBe('CAPACITY_CONFLICT');
    expect(await count(a, "FROM enrollments e JOIN students s ON s.tenant_id=e.tenant_id AND s.id=e.student_id WHERE e.tenant_id=$1 AND s.code='SB1'", [ids.ta])).toBe(0);
  });

  it('confirming the same batch concurrently imports each entity exactly once', async () => {
    const upload = await uploadA('STUDENTS', ['code', 'fullName'], [['SC1', 'C1'], ['SC2', 'C2'], ['SC3', 'C3']]);
    await runA(() => imports.validate(upload.id, OWNER));
    const results = await Promise.allSettled([runA(() => imports.confirm(upload.id, OWNER)), runA(() => imports.confirm(upload.id, OWNER))]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await count(a, "FROM students WHERE tenant_id=$1 AND code LIKE 'SC%'", [ids.ta])).toBe(3);
    const batch = await runA(() => imports.get(upload.id, OWNER));
    expect(batch.status).toBe('COMPLETED');
    expect(batch.importedRows).toBe(3);
  });

  it('never resolves cross-tenant codes and exports tenant data only', async () => {
    const cross = await uploadA('ENROLLMENTS', ['studentCode', 'classCode'], [['XB1', 'K1']]);
    const validated = await runA(() => imports.validate(cross.id, OWNER));
    expect(validated.invalidRows).toBe(1);
    const rows = await runA(() => imports.rows(cross.id, { page: 1, pageSize: 10, filter: 'ERRORS' }, OWNER));
    expect(JSON.stringify(rows.data)).toContain('NOT_FOUND');
    expect(JSON.stringify(rows.data)).not.toContain('Chi nhánh B');

    await runA(() => studentsService.create({ code: 'SF1', fullName: '=HYPERLINK("http://example.test")' }));
    const exported = await runA(() => exports.exportCsv('STUDENTS', {}, OWNER));
    expect(exported.csv).toContain('code,fullName,phone,email');
    expect(exported.csv).toContain('Nguyễn Văn A, Jr.');
    expect(exported.csv).toContain("'=HYPERLINK");
    expect(exported.csv).not.toContain('tenant');
    expect(exported.csv.split('\r\n')[0].split(',')).not.toContain('tenantId');

    const filtered = await runA(() => exports.exportCsv('STUDENTS', { status: 'DISABLED' }, OWNER));
    expect(filtered.csv).not.toContain('SA1');
    await expect(runA(() => exports.exportCsv('STUDENTS', { courseId: ulid() }, OWNER))).rejects.toBeInstanceOf(BadRequestException);

    const classExport = await runA(() => exports.exportCsv('CLASSES', {}, OWNER));
    expect(classExport.csv).toContain('courseCode,courseLevelCode,branchCode,defaultRoomCode,primaryTeacherCode');
    expect(classExport.csv).toContain('C1,L1,HN,R101,T101');
  });

  it('enforces data.import/export composed with target domain permissions', async () => {
    await expect(runA(() => imports.upload('STUDENTS', { originalname: 's.csv', buffer: csvFile(['code'], [['SX1']]) }, ['data.import']))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runA(() => imports.upload('TEACHERS', { originalname: 't.csv', buffer: csvFile(['code', 'name'], [['T900', 'X']]) }, ['data.import', 'student.write']))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runA(() => exports.exportCsv('STUDENTS', {}, ['data.export']))).rejects.toBeInstanceOf(ForbiddenException);

    expect((await runA(() => imports.types(['data.import', 'student.write']))).map((type) => type.type)).toEqual(['STUDENTS']);
    expect((await runA(() => exports.types(['data.export', 'student.read', 'course.read']))).map((type) => type.type)).toEqual(['STUDENTS', 'COURSES', 'COURSE_LEVELS']);
    expect((await runB(() => exports.types([])))).toEqual([]);

    const history = await runA(() => imports.list({ page: 1, pageSize: 50 }, ['data.import', 'student.write']));
    expect(history.data.every((batch) => batch.type === 'STUDENTS')).toBe(true);
  });

  it('warns on duplicate file hash without blocking a legitimate re-upload', async () => {
    const first = await uploadA('STUDENTS', ['code', 'fullName'], [['SZ1', 'Z1']]);
    expect(first.duplicateWarning).toBe(false);
    const second = await uploadA('STUDENTS', ['code', 'fullName'], [['SZ1', 'Z1']]);
    expect(second.duplicateWarning).toBe(true);
    await runA(() => imports.cancel(first.id, OWNER));
    await runA(() => imports.cancel(second.id, OWNER));
    const third = await uploadA('STUDENTS', ['code', 'fullName'], [['SZ1', 'Z1']]);
    expect(third.duplicateWarning).toBe(true);
  });
});
