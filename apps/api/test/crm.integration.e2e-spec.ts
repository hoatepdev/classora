import dotenv from 'dotenv';
dotenv.config({ override: true });

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { escapeIdentifier, Pool } from 'pg';
import { ulid } from 'ulid';
import { deployTenantSchema } from '../src/database/tenant-migrations.js';
import { postgresConfig } from '../src/config.js';
import { AuditService } from '../src/audit/audit.service.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantContextService, type TenantContext } from '../src/tenant/tenant-context.service.js';
import type { ResolvedTenant } from '../src/tenant/tenant-resolver.service.js';
import { AttendanceService } from '../src/attendance/attendance.service.js';
import { EnrollmentsService } from '../src/enrollments/enrollments.service.js';
import { StudentsService } from '../src/students/students.service.js';
import { StudentRelationshipsService } from '../src/students/relationships.service.js';
import { CrmService } from '../src/crm/crm.service.js';
import { CrmTrialsService } from '../src/crm/crm-trials.service.js';
import { CrmConversionService } from '../src/crm/crm-conversion.service.js';

const enabled = process.env.B5_TEST_DATABASE === '1';

describe.skipIf(!enabled)('LOCAL-10 CRM hard gates (real PostgreSQL)', () => {
  let admin: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let dbNameA = '';
  let dbNameB = '';
  let tenantContext: TenantContextService;
  let crmA: CrmService;
  let trialsA: CrmTrialsService;
  let conversionA: CrmConversionService;
  let attendanceA: AttendanceService;
  let enrollmentsA: EnrollmentsService;
  const tenantA = { tenantId: ulid(), tenantSlug: 'local10-a', dbName: '' };
  const tenantB = { tenantId: ulid(), tenantSlug: 'local10-b', dbName: '' };
  const membershipA = ulid();
  const membershipB = ulid();
  const fixture = {
    courseId: '', levelId: '', branchId: '', classA: '', classB: '', classCapacityOne: '', otherTenantCourseId: '', otherTenantSessionId: '',
    sessionA1: '', sessionA2: '', sessionA3: '', sessionCapacityOne: '', studentDuplicate: '',
  };

  const run = <T>(tenant: ResolvedTenant, pool: Pool, callback: () => Promise<T>) =>
    tenantContext.run<T>({ tenant, pool } as TenantContext, callback);
  const runA = <T>(callback: () => Promise<T>) => run(tenantA as ResolvedTenant, poolA, callback);
  const runB = <T>(callback: () => Promise<T>) => run(tenantB as ResolvedTenant, poolB, callback);

  const query = (pool: Pool, text: string, values?: unknown[]) => pool.query(text, values);

  const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  async function insertSession(pool: Pool, tenantId: string, id: string, classId: string, days: number, startTime = '18:00') {
    await query(pool, `INSERT INTO attendance_sessions (id, tenant_id, class_id, session_date, start_time, end_time, status) VALUES ($1,$2,$3,$4::date,$5::time,'20:00'::time,'SCHEDULED')`, [id, tenantId, classId, futureDate(days), startTime]);
  }

  async function seed(pool: Pool, tenantId: string, code: string) {
    const courseId = ulid();
    const levelId = ulid();
    const branchId = ulid();
    const classA = ulid();
    const classB = ulid();
    const classCapacityOne = ulid();
    await query(pool, `INSERT INTO courses (id, tenant_id, code, name) VALUES ($1,$2,$3,$4)`, [courseId, tenantId, `COURSE-${code}`, `IELTS ${code}`]);
    await query(pool, `INSERT INTO course_levels (id, tenant_id, course_id, code, name) VALUES ($1,$2,$3,$4,'Level 1')`, [levelId, tenantId, courseId, `LEVEL-${code}`]);
    await query(pool, `INSERT INTO branches (id, tenant_id, code, name) VALUES ($1,$2,$3,$4)`, [branchId, tenantId, `BRANCH-${code}`, `Branch ${code}`]);
    await query(pool, `INSERT INTO classes (id, tenant_id, course_id, course_level_id, branch_id, capacity, code, name) VALUES ($1,$2,$3,$4,$5,20,$6,'Class A')`, [classA, tenantId, courseId, levelId, branchId, `CLASS-${code}-A`]);
    await query(pool, `INSERT INTO classes (id, tenant_id, course_id, course_level_id, branch_id, capacity, code, name) VALUES ($1,$2,$3,$4,$5,20,$6,'Class B')`, [classB, tenantId, courseId, levelId, branchId, `CLASS-${code}-B`]);
    await query(pool, `INSERT INTO classes (id, tenant_id, course_id, course_level_id, branch_id, capacity, code, name) VALUES ($1,$2,$3,$4,$5,1,$6,'Capacity One')`, [classCapacityOne, tenantId, courseId, levelId, branchId, `CLASS-${code}-C1`]);
    return { courseId, levelId, branchId, classA, classB, classCapacityOne };
  }

  async function newLead(input: Record<string, unknown> = {}) {
    return runA(() => crmA.create({
      studentName: `An ${ulid().slice(-4)}`,
      studentPhone: '0900111222',
      guardianName: `Lan ${ulid().slice(-4)}`,
      guardianPhone: '0900333444',
      source: 'FACEBOOK',
      campaign: 'autumn-2026',
      interestedCourseId: fixture.courseId,
      nextFollowUpAt: new Date(Date.now() - 86_400_000).toISOString(),
      ...input,
    }));
  }

  const qualify = async (leadId: string) => {
    await runA(() => crmA.contact(leadId));
    return runA(() => crmA.qualify(leadId));
  };

  const bookTrial = async (leadId: string, sessionId: string, overrides: Record<string, unknown> = {}) =>
    runA(() => trialsA.book(leadId, { sessionId, createStudent: true, createGuardian: true, guardianRelationship: 'MOTHER', ...overrides }));

  let freshSessionDay = 30;
  const freshSession = async (classId: string, startTime = '18:00') => {
    freshSessionDay += 1;
    const id = ulid();
    await insertSession(poolA, tenantA.tenantId, id, classId, freshSessionDay, startTime);
    return id;
  };

  const runAttendance = async (sessionId: string, studentId: string, status: 'PRESENT' | 'ABSENT_EXCUSED') => {
    const detail = await runA(() => attendanceA.initialize(sessionId));
    const record = detail.records.find((row) => row.studentId === studentId);
    if (!record) throw new Error('trial student missing from roster');
    for (const row of detail.records) {
      await runA(() => attendanceA.updateRecord(row.id, { status: row.studentId === studentId ? status : 'PRESENT' }));
    }
    return runA(() => attendanceA.finalize(sessionId));
  };

  beforeAll(async () => {
    const config = postgresConfig();
    admin = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    const runId = `${Date.now()}_${process.pid}`;
    dbNameA = `classora_local10_${runId}_a`;
    dbNameB = `classora_local10_${runId}_b`;
    tenantA.dbName = dbNameA;
    tenantB.dbName = dbNameB;
    for (const dbName of [dbNameA, dbNameB]) {
      await admin.query(`CREATE DATABASE ${escapeIdentifier(dbName)}`);
      await deployTenantSchema(dbName);
    }
    const connection = { host: config.host, port: config.port, user: config.user, password: config.password };
    poolA = new Pool({ ...connection, database: dbNameA, max: 12 });
    poolB = new Pool({ ...connection, database: dbNameB, max: 12 });

    const seededA = await seed(poolA, tenantA.tenantId, 'A');
    fixture.courseId = seededA.courseId;
    fixture.levelId = seededA.levelId;
    fixture.branchId = seededA.branchId;
    fixture.classA = seededA.classA;
    fixture.classB = seededA.classB;
    fixture.classCapacityOne = seededA.classCapacityOne;
    fixture.sessionA1 = ulid();
    fixture.sessionA2 = ulid();
    fixture.sessionA3 = ulid();
    fixture.sessionCapacityOne = ulid();
    await insertSession(poolA, tenantA.tenantId, fixture.sessionA1, fixture.classA, 7);
    await insertSession(poolA, tenantA.tenantId, fixture.sessionA2, fixture.classA, 14);
    await insertSession(poolA, tenantA.tenantId, fixture.sessionA3, fixture.classB, 7);
    await insertSession(poolA, tenantA.tenantId, fixture.sessionCapacityOne, fixture.classCapacityOne, 7, '19:00');

    const seededB = await seed(poolB, tenantB.tenantId, 'B');
    fixture.otherTenantCourseId = seededB.courseId;
    fixture.otherTenantSessionId = ulid();
    await insertSession(poolB, tenantB.tenantId, fixture.otherTenantSessionId, seededB.classA, 7);

    tenantContext = new TenantContextService();
    const audit = new AuditService({} as ControlDatabaseService, tenantContext);
    const control = {
      tenantMembership: {
        findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
          (where.id === membershipA && where.tenantId === tenantA.tenantId) || (where.id === membershipB && where.tenantId === tenantB.tenantId)
            ? { status: 'ACTIVE' }
            : null,
        findMany: async ({ where }: { where: { tenantId: string } }) =>
          where.tenantId === tenantA.tenantId ? [{ id: membershipA, role: 'SALE', user: { name: 'Sale A' } }] : [{ id: membershipB, role: 'SALE', user: { name: 'Sale B' } }],
      },
    } as unknown as ControlDatabaseService;
    const studentsService = new StudentsService(tenantContext, audit);
    const relationshipsService = new StudentRelationshipsService(tenantContext, audit);
    const enrollmentsService = new EnrollmentsService(tenantContext, audit);
    attendanceA = new AttendanceService(tenantContext, audit);
    enrollmentsA = enrollmentsService;
    crmA = new CrmService(tenantContext, audit, control, studentsService, relationshipsService, enrollmentsService);
    trialsA = new CrmTrialsService(tenantContext, audit, crmA, enrollmentsService);
    conversionA = new CrmConversionService(tenantContext, audit, crmA, enrollmentsService);

    const duplicateStudent = await runA(() => studentsService.create({ code: `DUP${ulid().slice(-5)}`, fullName: 'Existing Student', phone: '0900333444' }));
    fixture.studentDuplicate = duplicateStudent.id;
  }, 120_000);

  afterAll(async () => {
    for (const pool of [poolA, poolB, admin]) if (pool) await pool.end().catch(() => undefined);
    const config = postgresConfig();
    const cleanup = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    for (const dbName of [dbNameA, dbNameB].filter(Boolean)) {
      await cleanup.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)} WITH (FORCE)`).catch(() => undefined);
    }
    await cleanup.end().catch(() => undefined);
  });

  it('runs the full lead → trial → attendance → same-class conversion path', async () => {
    const lead = await newLead({ assignedMembershipId: membershipA });
    expect(lead).toMatchObject({ status: 'NEW', studentName: lead.studentName, source: 'FACEBOOK' });
    const auditRows = await query(poolA, `SELECT action FROM audit_events WHERE tenant_id=$1 AND entity_type='LEAD' AND entity_id=$2`, [tenantA.tenantId, lead.id]);
    expect(auditRows.rows.map((row) => row.action)).toContain('lead.created');

    await expect(runA(() => crmA.list({ followUp: 'OVERDUE' }))).resolves.toMatchObject({ data: expect.arrayContaining([expect.objectContaining({ id: lead.id })]) });

    await qualify(lead.id);
    const booked = await bookTrial(lead.id, fixture.sessionA1);
    expect(booked.status).toBe('TRIAL_BOOKED');
    const booking = booked.trialBookings[0];
    expect(booking).toMatchObject({ status: 'BOOKED', sessionStatus: 'SCHEDULED', classCode: expect.any(String) });

    const links = await query(poolA, `SELECT sg.relationship FROM student_guardians sg WHERE sg.tenant_id=$1 AND sg.student_id=$2`, [tenantA.tenantId, booking.studentId]);
    expect(links.rows[0]).toMatchObject({ relationship: 'MOTHER' });
    const enrollment = await query(poolA, `SELECT status FROM enrollments WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, booking.trialEnrollmentId]);
    expect(enrollment.rows[0].status).toBe('TRIAL');

    const finalized = await runAttendance(fixture.sessionA1, booking.studentId, 'PRESENT');
    const trialRecord = finalized.records.find((row) => row.studentId === booking.studentId);
    expect(trialRecord?.status).toBe('PRESENT');

    await runA(() => trialsA.outcome(booking.id, { outcome: 'ENROLL' }));
    const afterOutcome = await runA(() => crmA.get(lead.id));
    expect(afterOutcome.trialBookings[0]).toMatchObject({ status: 'COMPLETED', outcome: 'ENROLL' });
    expect(afterOutcome.status).toBe('TRIAL_COMPLETED');

    const converted = await runA(() => conversionA.convert(lead.id, { classId: fixture.classA }));
    expect(converted.status).toBe('WON');
    expect(converted.conversion).toMatchObject({ conversionMode: 'TRIAL_PROMOTED', studentId: booking.studentId, enrollmentId: booking.trialEnrollmentId });
    const promoted = await query(poolA, `SELECT status FROM enrollments WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, booking.trialEnrollmentId]);
    expect(promoted.rows[0].status).toBe('ACTIVE');
    await expect(runA(() => conversionA.convert(lead.id, { classId: fixture.classA, studentId: booking.studentId }))).rejects.toThrow('already converted');

    const studentCount = await query(poolA, `SELECT COUNT(*)::int AS count FROM students WHERE tenant_id=$1 AND full_name=$2`, [tenantA.tenantId, lead.studentName]);
    expect(studentCount.rows[0].count).toBe(1);
    const operational = await query(poolA, `SELECT COUNT(*)::int AS count FROM enrollments WHERE tenant_id=$1 AND student_id=$2 AND status IN ('PENDING','TRIAL','ACTIVE','PAUSED')`, [tenantA.tenantId, booking.studentId]);
    expect(operational.rows[0].count).toBe(1);
  });

  it('keeps a no-show trial out of makeup entitlements and follows up', async () => {
    const lead = await newLead();
    await qualify(lead.id);
    const booked = await bookTrial(lead.id, fixture.sessionA2);
    const booking = booked.trialBookings[0];
    await runAttendance(fixture.sessionA2, booking.studentId, 'ABSENT_EXCUSED');
    const entitlements = await query(poolA, `SELECT COUNT(*)::int AS count FROM makeup_entitlements WHERE tenant_id=$1 AND student_id=$2`, [tenantA.tenantId, booking.studentId]);
    expect(entitlements.rows[0].count).toBe(0);

    const after = await runA(() => trialsA.outcome(booking.id, { outcome: 'FOLLOW_UP' }));
    expect(after.trialBookings[0].status).toBe('NO_SHOW');
    expect(after.status).toBe('QUALIFIED');
  });

  it('converts a different-class trial while preserving trial history', async () => {
    const lead = await newLead();
    await qualify(lead.id);
    const booked = await bookTrial(lead.id, fixture.sessionA3);
    const booking = booked.trialBookings[0];
    await runAttendance(fixture.sessionA3, booking.studentId, 'PRESENT');
    await runA(() => trialsA.outcome(booking.id, { outcome: 'ENROLL' }));

    const converted = await runA(() => conversionA.convert(lead.id, { classId: fixture.classA }));
    expect(converted.conversion).toMatchObject({ conversionMode: 'TRIAL_REENROLLED' });
    const trialRow = await query(poolA, `SELECT status, class_id AS "classId" FROM enrollments WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, booking.trialEnrollmentId]);
    expect(trialRow.rows[0]).toMatchObject({ status: 'WITHDRAWN', classId: fixture.classB });
    const finalRow = await query(poolA, `SELECT status, class_id AS "classId", source_enrollment_id AS "sourceEnrollmentId" FROM enrollments WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, converted.conversion.enrollmentId]);
    expect(finalRow.rows[0]).toMatchObject({ status: 'ACTIVE', classId: fixture.classA, sourceEnrollmentId: booking.trialEnrollmentId });
  });

  it('converts directly without a trial and requires an explicit duplicate decision', async () => {
    const lead = await newLead({ guardianPhone: '0900333444' });
    await qualify(lead.id);

    const duplicates = await runA(() => crmA.duplicates(lead.id));
    expect(duplicates).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'STUDENT', id: fixture.studentDuplicate })]));

    await expect(runA(() => conversionA.convert(lead.id, { classId: fixture.classA }))).rejects.toThrow('Choose an existing Student');
    const converted = await runA(() => conversionA.convert(lead.id, { classId: fixture.classA, studentId: fixture.studentDuplicate }));
    expect(converted.conversion).toMatchObject({ conversionMode: 'DIRECT', studentId: fixture.studentDuplicate });
    expect(converted.convertedEnrollmentId).toBe(converted.conversion.enrollmentId);
  });

  it('loses a lead safely, cancelling its active trial and preserving records', async () => {
    const lead = await newLead();
    await qualify(lead.id);
    const booked = await bookTrial(lead.id, await freshSession(fixture.classA));
    const booking = booked.trialBookings[0];

    const lost = await runA(() => crmA.lost(lead.id, { reason: 'PRICE', detail: 'Too expensive' }));
    expect(lost.status).toBe('LOST');
    expect(lost.trialBookings[0]).toMatchObject({ status: 'CANCELLED' });
    const enrollment = await query(poolA, `SELECT status FROM enrollments WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, booking.trialEnrollmentId]);
    expect(enrollment.rows[0].status).toBe('WITHDRAWN');
    const student = await query(poolA, `SELECT COUNT(*)::int AS count FROM students WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, booking.studentId]);
    expect(student.rows[0].count).toBe(1);
    const events = await query(poolA, `SELECT type FROM lead_events WHERE tenant_id=$1 AND lead_id=$2`, [tenantA.tenantId, lead.id]);
    expect(events.rows.map((row) => row.type)).toContain('LOST');
  });

  it('cancels and rebooks a trial while preserving both bookings', async () => {
    const lead = await newLead();
    await qualify(lead.id);
    const first = await bookTrial(lead.id, await freshSession(fixture.classA));
    const firstBooking = first.trialBookings[0];
    const cancelled = await runA(() => trialsA.cancel(firstBooking.id, { reason: 'Parent reschedule' }));
    expect(cancelled.status).toBe('QUALIFIED');
    expect(cancelled.trialBookings[0]).toMatchObject({ status: 'CANCELLED' });
    await expect(runA(() => trialsA.outcome(firstBooking.id, { outcome: 'ENROLL' }))).rejects.toThrow('requires a booked trial');

    const second = await bookTrial(lead.id, await freshSession(fixture.classA));
    expect(second.status).toBe('TRIAL_BOOKED');
    const bookings = await query(poolA, `SELECT status FROM trial_bookings WHERE tenant_id=$1 AND lead_id=$2 ORDER BY booked_at`, [tenantA.tenantId, lead.id]);
    expect(bookings.rows.map((row) => row.status)).toEqual(['CANCELLED', 'BOOKED']);
  });

  it('rejects double conversion, double booking, and the last-seat race coherently', async () => {
    const convertLead = await newLead();
    await qualify(convertLead.id);
    const results = await Promise.allSettled([
      runA(() => conversionA.convert(convertLead.id, { classId: fixture.classA, createStudent: true })),
      runA(() => conversionA.convert(convertLead.id, { classId: fixture.classA, createStudent: true })),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const studentRows = await query(poolA, `SELECT COUNT(*)::int AS count FROM students WHERE tenant_id=$1 AND full_name=$2`, [tenantA.tenantId, convertLead.studentName]);
    expect(studentRows.rows[0].count).toBe(1);

    const bookingLead = await newLead();
    await qualify(bookingLead.id);
    const bookingSession = await freshSession(fixture.classA);
    const bookingResults = await Promise.allSettled([
      runA(() => trialsA.book(bookingLead.id, { sessionId: bookingSession, createStudent: true })),
      runA(() => trialsA.book(bookingLead.id, { sessionId: bookingSession, createStudent: true })),
    ]);
    expect(bookingResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(bookingResults.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const seatLeads = [await newLead(), await newLead()];
    for (const lead of seatLeads) await qualify(lead.id);
    const seatSession = await freshSession(fixture.classCapacityOne, '19:00');
    const seatResults = await Promise.allSettled(seatLeads.map((lead) =>
      runA(() => trialsA.book(lead.id, { sessionId: seatSession, createStudent: true })),
    ));
    expect(seatResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(seatResults.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const operational = await query(poolA, `SELECT COUNT(*)::int AS count FROM enrollments WHERE tenant_id=$1 AND class_id=$2 AND status IN ('PENDING','TRIAL','ACTIVE','PAUSED')`, [tenantA.tenantId, fixture.classCapacityOne]);
    expect(operational.rows[0].count).toBe(1);

    const raceLead = await newLead();
    await qualify(raceLead.id);
    const raceResults = await Promise.allSettled([
      runA(() => conversionA.convert(raceLead.id, { classId: fixture.classB, createStudent: true })),
      runA(() => crmA.lost(raceLead.id, { reason: 'NOT_INTERESTED' })),
    ]);
    expect(raceResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const raceLeadRow = await query(poolA, `SELECT status FROM leads WHERE tenant_id=$1 AND id=$2`, [tenantA.tenantId, raceLead.id]);
    expect(['WON', 'LOST']).toContain(raceLeadRow.rows[0].status);
    if (raceLeadRow.rows[0].status === 'WON') {
      const raceEnrollments = await query(poolA, `SELECT COUNT(*)::int AS count FROM enrollments WHERE tenant_id=$1 AND student_id=(SELECT converted_student_id FROM leads WHERE id=$2) AND status IN ('PENDING','TRIAL','ACTIVE','PAUSED')`, [tenantA.tenantId, raceLead.id]);
      expect(raceEnrollments.rows[0].count).toBe(1);
    }
  });

  it('fails every cross-tenant CRM attack safely', async () => {
    const lead = await newLead();
    await qualify(lead.id);

    await expect(newLead({ interestedCourseId: fixture.otherTenantCourseId })).rejects.toThrow('Course not found');
    await expect(newLead({ assignedMembershipId: membershipB })).rejects.toThrow('not an active member');
    await expect(runA(() => trialsA.book(lead.id, { sessionId: fixture.otherTenantSessionId, createStudent: true }))).rejects.toThrow('Session not found');
    await expect(runA(() => conversionA.convert(lead.id, { classId: fixture.otherTenantSessionId, createStudent: true }))).rejects.toThrow('Class not found');

    const betaLead = await runB(() => crmA.create({ studentName: 'Beta Lead', source: 'WALK_IN' }));
    await runB(() => crmA.contact(betaLead.id));
    await runB(() => crmA.qualify(betaLead.id));
    await expect(runA(() => crmA.get(betaLead.id))).rejects.toThrow('Lead not found');
    await expect(runA(() => crmA.update(betaLead.id, { studentPhone: '0888' }))).rejects.toThrow('Lead not found');
    await expect(runA(() => crmA.lost(betaLead.id, { reason: 'PRICE' }))).rejects.toThrow('Lead not found');

    const alphaStudents = await query(poolA, `SELECT id FROM students WHERE tenant_id=$1 LIMIT 1`, [tenantA.tenantId]);
    await expect(runB(() => conversionA.convert(betaLead.id, { classId: fixture.classA, studentId: alphaStudents.rows[0].id }))).rejects.toThrow('Student not found');
    await expect(runA(() => conversionA.convert(lead.id, { classId: fixture.classA, studentId: betaLead.id }))).rejects.toThrow('Student not found');

    const alphaLeads = await query(poolA, `SELECT COUNT(*)::int AS count FROM leads WHERE tenant_id=$1`, [tenantA.tenantId]);
    const betaLeads = await query(poolB, `SELECT COUNT(*)::int AS count FROM leads WHERE tenant_id=$1`, [tenantB.tenantId]);
    expect(alphaLeads.rows[0].count).toBeGreaterThan(0);
    expect(betaLeads.rows[0].count).toBe(1);
  });

  it('serves bounded trial-session lookups and CRM lookups', async () => {
    const sessions = await runA(() => crmA.lookupTrialSessions({ courseId: fixture.courseId }));
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((session) => session.sessionDate >= new Date().toISOString().slice(0, 10))).toBe(true);
    await expect(runA(() => crmA.lookupTrialSessions({ from: '2020-01-01', to: '2020-02-01' }))).rejects.toThrow('cannot start in the past');
    await expect(runA(() => crmA.lookupTrialSessions({ from: futureDate(1), to: futureDate(90) }))).rejects.toThrow('60 days');

    const courses = await runA(() => crmA.lookupCourses());
    expect(courses[0]).toMatchObject({ name: expect.stringContaining('IELTS') });
    expect(courses[0].levels[0]).toMatchObject({ name: 'Level 1' });
    const assignees = await runA(() => crmA.lookupAssignees());
    expect(assignees).toEqual([expect.objectContaining({ membershipId: membershipA })]);
    const branches = await runA(() => crmA.lookupBranches());
    expect(branches.length).toBeGreaterThan(0);
    const classes = await runA(() => crmA.lookupClasses());
    expect(classes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Class A' })]));
  });

  it('keeps enrollment history intact after CRM transitions', async () => {
    const lead = await newLead();
    await qualify(lead.id);
    const sessionId = await freshSession(fixture.classA);
    const booked = await bookTrial(lead.id, sessionId);
    const booking = booked.trialBookings[0];
    await runAttendance(sessionId, booking.studentId, 'PRESENT');
    await runA(() => trialsA.outcome(booking.id, { outcome: 'ENROLL' }));
    await runA(() => conversionA.convert(lead.id, { classId: fixture.classA }));

    const history = await query(poolA, `SELECT type FROM enrollment_events WHERE tenant_id=$1 AND enrollment_id=$2 ORDER BY occurred_at`, [tenantA.tenantId, booking.trialEnrollmentId]);
    expect(history.rows.map((row) => row.type)).toEqual(expect.arrayContaining(['ENROLLED', 'TRIAL_STARTED', 'ACTIVATED']));
    const attendanceHistory = await runA(() => enrollmentsA.listClasses(booking.studentId));
    expect(attendanceHistory[0].status).toBe('ACTIVE');
  });
});
