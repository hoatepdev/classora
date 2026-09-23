import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import {
  type CreateScheduleDto,
  DayOfWeek,
  ScheduleStatus,
} from './dto/create-schedule.dto.js';
import type { UpdateScheduleDto } from './dto/update-schedule.dto.js';
import type { CalendarQueryDto } from './dto/calendar-query.dto.js';
import { SessionStatus } from './dto/calendar-query.dto.js';
import type { GenerateSessionsDto } from './dto/generate-sessions.dto.js';
import type { UpdateSessionDto } from './dto/update-session.dto.js';
import type { CreateScheduleExclusionDto, UpdateScheduleExclusionDto } from './dto/create-schedule-exclusion.dto.js';

type ScheduleRow = QueryResultRow & {
  id: string;
  tenantId: string;
  classId: string;
  teacherId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  branchId: string | null;
  roomId: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  legacyRoomSource: string | null;
  status: ScheduleStatus;
  createdAt: Date;
  updatedAt: Date;
};

type ClassScheduleRow = ScheduleRow & {
  teacherCode: string;
  teacherName: string;
};

type TeacherScheduleRow = ScheduleRow & {
  classCode: string;
  className: string;
};

type ConflictRow = QueryResultRow & {
  classId: string;
  teacherId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
};

type SessionRow = QueryResultRow & {
  id: string;
  tenantId: string;
  classId: string;
  schedulePatternId: string | null;
  teacherId: string | null;
  roomId: string | null;
  branchId: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  manualOverride: boolean;
  rescheduledFromId: string | null;
  cancellationReason: string | null;
  rescheduleReason: string | null;
  sourceSessionDate: string | null;
  sourceStartTime: string | null;
  sourceEndTime: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ScheduleExclusionRow = QueryResultRow & {
  id: string;
  tenantId: string;
  date: string;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
};

const exclusionColumns = `
  e.id,
  e.tenant_id AS "tenantId",
  e.date::text AS "date",
  e.branch_id AS "branchId",
  b.code AS "branchCode",
  b.name AS "branchName",
  e.reason,
  e.created_at AS "createdAt",
  e.updated_at AS "updatedAt"
`;

function serializeExclusion(row: ScheduleExclusionRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const sessionColumns = `
  a.id,
  a.tenant_id AS "tenantId",
  a.class_id AS "classId",
  a.schedule_pattern_id AS "schedulePatternId",
  a.teacher_id AS "teacherId",
  a.room_id AS "roomId",
  a.branch_id AS "branchId",
  a.session_date::text AS "sessionDate",
  a.start_time::text AS "startTime",
  a.end_time::text AS "endTime",
  a.status,
  a.manual_override AS "manualOverride",
  a.rescheduled_from_id AS "rescheduledFromId",
  a.cancellation_reason AS "cancellationReason",
  a.reschedule_reason AS "rescheduleReason",
  a.source_session_date::text AS "sourceSessionDate",
  a.source_start_time::text AS "sourceStartTime",
  a.source_end_time::text AS "sourceEndTime",
  a.created_at AS "createdAt",
  a.updated_at AS "updatedAt"
`;

function serializeSession(row: SessionRow) {
  return {
    ...row,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    sourceStartTime: row.sourceStartTime?.slice(0, 5),
    sourceEndTime: row.sourceEndTime?.slice(0, 5),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function maxDate(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1)!;
}

function minDate(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(0)!;
}

function datesForWeekday(from: string, to: string, day: DayOfWeek) {
  const target = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].indexOf(day);
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const offset = (target - ((current.getUTCDay() + 6) % 7) + 7) % 7;
  current.setUTCDate(current.getUTCDate() + offset);
  const dates: string[] = [];
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 7);
  }
  return dates;
}

const scheduleColumns = `
  s.id,
  s.tenant_id AS "tenantId",
  s.class_id AS "classId",
  s.teacher_id AS "teacherId",
  s.day_of_week AS "dayOfWeek",
  s.start_time::text AS "startTime",
  s.end_time::text AS "endTime",
  s.branch_id AS "branchId",
  s.room_id AS "roomId",
  s.effective_from::text AS "effectiveFrom",
  s.effective_until::text AS "effectiveUntil",
  s.legacy_room_source AS "legacyRoomSource",
  s.status,
  s.created_at AS "createdAt",
  s.updated_at AS "updatedAt"
`;

const dayOrder = `CASE s.day_of_week
  WHEN 'MONDAY' THEN 1
  WHEN 'TUESDAY' THEN 2
  WHEN 'WEDNESDAY' THEN 3
  WHEN 'THURSDAY' THEN 4
  WHEN 'FRIDAY' THEN 5
  WHEN 'SATURDAY' THEN 6
  WHEN 'SUNDAY' THEN 7
END`;

function serialize<T extends ScheduleRow>(row: T) {
  return {
    ...row,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function databaseConstraint(error: unknown) {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    !('constraint' in error)
  ) {
    return undefined;
  }
  return { code: error.code, constraint: error.constraint };
}

function mapDatabaseError(error: unknown): never {
  const databaseError = databaseConstraint(error);
  if (databaseError?.code === '23503') {
    if (
      databaseError.constraint === 'schedules_class_id_fkey' ||
      databaseError.constraint === 'schedules_tenant_class_fkey'
    ) {
      throw new NotFoundException('Class not found');
    }
    if (
      databaseError.constraint === 'schedules_teacher_id_fkey' ||
      databaseError.constraint === 'schedules_tenant_teacher_fkey'
    ) {
      throw new NotFoundException('Teacher not found');
    }
    if (databaseError.constraint === 'schedules_tenant_branch_fkey') {
      throw new NotFoundException('Branch not found');
    }
    if (databaseError.constraint === 'schedules_tenant_room_fkey') {
      throw new NotFoundException('Room not found');
    }
  }
  if (
    databaseError?.code === '23505' &&
    databaseError.constraint === 'schedules_active_identity_key'
  ) {
    throw new ConflictException('An identical active schedule already exists.');
  }
  if (
    databaseError?.code === '23505' &&
    databaseError.constraint === 'schedule_exclusions_scope_key'
  ) {
    throw new ConflictException('A schedule exclusion already exists for this date and branch scope.');
  }
  if (
    databaseError?.code === '23503' &&
    databaseError.constraint === 'schedule_exclusions_tenant_branch_fkey'
  ) {
    throw new NotFoundException('Branch not found');
  }
  if (
    databaseError?.code === '23514' &&
    databaseError.constraint === 'schedules_time_order_check'
  ) {
    throw new BadRequestException('Start time must be earlier than end time.');
  }
  throw error;
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<ScheduleRow>(
      `SELECT ${scheduleColumns} FROM schedules s WHERE s.tenant_id = $1 AND s.id = $2`,
      [tenant.tenantId, id],
    );
    const schedule = result.rows[0];
    if (!schedule) throw new NotFoundException('Schedule not found');
    return serialize(schedule);
  }

  async create(input: CreateScheduleDto) {
    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockTenantSchedules(client, tenant.tenantId);
      this.validateTimeRange(input.startTime, input.endTime);
      const effectiveBranchId = await this.ensureResourcesExist(
        client,
        tenant.tenantId,
        input.classId,
        input.teacherId,
        input.branchId ?? null,
        input.roomId ?? null,
      );
      await this.ensurePatternDates(
        client,
        tenant.tenantId,
        input.classId,
        input.effectiveFrom ?? null,
        input.effectiveUntil ?? null,
      );
      await this.ensureNoConflict(client, tenant.tenantId, {
        classId: input.classId,
        teacherId: input.teacherId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        status: input.status ?? ScheduleStatus.ACTIVE,
      });
      const result = await client.query<ScheduleRow>(
        `INSERT INTO schedules AS s
          (id, tenant_id, class_id, teacher_id, branch_id, room_id, day_of_week, start_time, end_time, effective_from, effective_until, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::time, $9::time, $10::date, $11::date, $12)
         RETURNING ${scheduleColumns}`,
        [
          ulid(),
          tenant.tenantId,
          input.classId,
          input.teacherId,
          effectiveBranchId,
          input.roomId ?? null,
          input.dayOfWeek,
          input.startTime,
          input.endTime,
          input.effectiveFrom ?? null,
          input.effectiveUntil ?? null,
          input.status ?? ScheduleStatus.ACTIVE,
        ],
      );
      const created = serialize(result.rows[0]);
      const { actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
      await this.audit.recordTenant(client, {
        tenantId: tenant.tenantId,
        actorUserId,
        actorMembershipId,
        actorName,
        actorEmail,
        requestId,
        action: 'schedule.pattern.created',
        entityType: 'SchedulePattern',
        entityId: created.id,
        after: created,
      });
      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      return mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async update(id: string, input: UpdateScheduleDto) {
    const fields: Array<keyof UpdateScheduleDto> = [
      'teacherId',
      'dayOfWeek',
      'startTime',
      'endTime',
      'branchId',
      'roomId',
      'effectiveFrom',
      'effectiveUntil',
      'status',
    ];
    if (!fields.some((field) => Object.hasOwn(input, field) && input[field] !== undefined)) {
      throw new BadRequestException('At least one field is required');
    }

    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockTenantSchedules(client, tenant.tenantId);
      const existing = await client.query<ScheduleRow>(
        `SELECT ${scheduleColumns} FROM schedules s WHERE s.tenant_id = $1 AND s.id = $2`,
        [tenant.tenantId, id],
      );
      const schedule = existing.rows[0];
      if (!schedule) throw new NotFoundException('Schedule not found');

      const effective = {
        classId: schedule.classId,
        teacherId: input.teacherId ?? schedule.teacherId,
        dayOfWeek: input.dayOfWeek ?? schedule.dayOfWeek,
        startTime: input.startTime ?? schedule.startTime.slice(0, 5),
        endTime: input.endTime ?? schedule.endTime.slice(0, 5),
        branchId: input.branchId !== undefined ? input.branchId : schedule.branchId,
        roomId: input.roomId !== undefined ? input.roomId : schedule.roomId,
        effectiveFrom: input.effectiveFrom !== undefined ? input.effectiveFrom : schedule.effectiveFrom,
        effectiveUntil: input.effectiveUntil !== undefined ? input.effectiveUntil : schedule.effectiveUntil,
        status: input.status ?? schedule.status,
      };
      this.validateTimeRange(effective.startTime, effective.endTime);
      await this.ensurePatternDates(
        client,
        tenant.tenantId,
        effective.classId,
        effective.effectiveFrom ?? null,
        effective.effectiveUntil ?? null,
      );
      if (
        input.teacherId !== undefined ||
        input.branchId !== undefined ||
        input.roomId !== undefined ||
        schedule.branchId !== null ||
        schedule.roomId !== null
      ) {
        await this.ensureResourcesExist(
          client,
          tenant.tenantId,
          effective.classId,
          effective.teacherId,
          effective.branchId ?? null,
          effective.roomId ?? null,
        );
      }
      await this.ensureNoConflict(client, tenant.tenantId, effective, id);

      const result = await client.query<ScheduleRow>(
        `UPDATE schedules AS s
         SET teacher_id = $3,
             branch_id = $4,
             room_id = $5,
             day_of_week = $6,
             start_time = $7::time,
             end_time = $8::time,
             effective_from = $9::date,
             effective_until = $10::date,
             status = $11,
             updated_at = CURRENT_TIMESTAMP
         WHERE s.tenant_id = $1 AND s.id = $2
         RETURNING ${scheduleColumns}`,
        [
          tenant.tenantId,
          id,
          effective.teacherId,
          effective.branchId ?? null,
          effective.roomId ?? null,
          effective.dayOfWeek,
          effective.startTime,
          effective.endTime,
          effective.effectiveFrom ?? null,
          effective.effectiveUntil ?? null,
          effective.status,
        ],
      );
      const updated = serialize(result.rows[0]);
      const { actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
      await this.audit.recordTenant(client, {
        tenantId: tenant.tenantId,
        actorUserId,
        actorMembershipId,
        actorName,
        actorEmail,
        requestId,
        action: 'schedule.pattern.updated',
        entityType: 'SchedulePattern',
        entityId: updated.id,
        after: updated,
      });
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      return mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async listForClass(classId: string) {
    const { tenant, pool } = this.tenantContext.get();
    const classRecord = await pool.query(
      'SELECT 1 FROM classes WHERE tenant_id = $1 AND id = $2',
      [tenant.tenantId, classId],
    );
    if (!classRecord.rows[0]) throw new NotFoundException('Class not found');

    const result = await pool.query<ClassScheduleRow>(
      `SELECT ${scheduleColumns}, t.code AS "teacherCode", t.name AS "teacherName"
       FROM schedules s
       JOIN teachers t ON t.id = s.teacher_id AND t.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1 AND s.class_id = $2
       ORDER BY ${dayOrder}, s.start_time ASC, s.id ASC`,
      [tenant.tenantId, classId],
    );
    return result.rows.map(serialize);
  }

  async listForTeacher(teacherId: string) {
    const { tenant, pool } = this.tenantContext.get();
    const teacher = await pool.query(
      'SELECT 1 FROM teachers WHERE tenant_id = $1 AND id = $2',
      [tenant.tenantId, teacherId],
    );
    if (!teacher.rows[0]) throw new NotFoundException('Teacher not found');

    const result = await pool.query<TeacherScheduleRow>(
      `SELECT ${scheduleColumns}, c.code AS "classCode", c.name AS "className"
       FROM schedules s
       JOIN classes c ON c.id = s.class_id AND c.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1 AND s.teacher_id = $2
       ORDER BY ${dayOrder}, s.start_time ASC, s.id ASC`,
      [tenant.tenantId, teacherId],
    );
    return result.rows.map(serialize);
  }

  async listExclusions() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<ScheduleExclusionRow>(
      `SELECT ${exclusionColumns}
       FROM schedule_exclusions e
       LEFT JOIN branches b ON b.tenant_id = e.tenant_id AND b.id = e.branch_id
       WHERE e.tenant_id = $1
       ORDER BY e.date ASC, e.branch_id NULLS FIRST, e.id ASC`,
      [tenant.tenantId],
    );
    return result.rows.map(serializeExclusion);
  }

  async createExclusion(input: CreateScheduleExclusionDto) {
    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockTenantSchedules(client, tenant.tenantId);
      await this.ensureExclusionBranch(client, tenant.tenantId, input.branchId ?? null);
      const id = ulid();
      await client.query(
        `INSERT INTO schedule_exclusions (id, tenant_id, date, branch_id, reason)
         VALUES ($1, $2, $3::date, $4, $5)`,
        [id, tenant.tenantId, input.date, input.branchId ?? null, input.reason],
      );
      const createdRow = await this.getExclusion(client, tenant.tenantId, id);
      if (!createdRow) throw new Error('Created schedule exclusion could not be read');
      const created = serializeExclusion(createdRow);
      await this.auditExclusion(client, 'schedule.exclusion.created', created);
      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      return mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async updateExclusion(id: string, input: UpdateScheduleExclusionDto) {
    if (input.date === undefined && input.branchId === undefined && input.reason === undefined) {
      throw new BadRequestException('At least one field is required');
    }

    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockTenantSchedules(client, tenant.tenantId);
      const currentResult = await client.query<ScheduleExclusionRow>(
        `SELECT ${exclusionColumns}
         FROM schedule_exclusions e
         LEFT JOIN branches b ON b.tenant_id = e.tenant_id AND b.id = e.branch_id
         WHERE e.tenant_id = $1 AND e.id = $2
         FOR UPDATE OF e`,
        [tenant.tenantId, id],
      );
      const current = currentResult.rows[0];
      if (!current) throw new NotFoundException('Schedule exclusion not found');

      const date = input.date ?? current.date;
      const branchId = input.branchId !== undefined ? input.branchId : current.branchId;
      const reason = input.reason ?? current.reason;
      await this.ensureExclusionBranch(client, tenant.tenantId, branchId);
      await client.query(
        `UPDATE schedule_exclusions AS e
         SET date = $3::date, branch_id = $4, reason = $5, updated_at = CURRENT_TIMESTAMP
         WHERE e.tenant_id = $1 AND e.id = $2`,
        [tenant.tenantId, id, date, branchId, reason],
      );
      const updatedRow = await this.getExclusion(client, tenant.tenantId, id);
      if (!updatedRow) throw new Error('Updated schedule exclusion could not be read');
      const updated = serializeExclusion(updatedRow);
      await this.auditExclusion(client, 'schedule.exclusion.updated', updated, current, input.reason);
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      return mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async deleteExclusion(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockTenantSchedules(client, tenant.tenantId);
      const currentResult = await client.query<ScheduleExclusionRow>(
        `SELECT ${exclusionColumns}
         FROM schedule_exclusions e
         LEFT JOIN branches b ON b.tenant_id = e.tenant_id AND b.id = e.branch_id
         WHERE e.tenant_id = $1 AND e.id = $2
         FOR UPDATE OF e`,
        [tenant.tenantId, id],
      );
      const current = currentResult.rows[0];
      if (!current) throw new NotFoundException('Schedule exclusion not found');
      await client.query(
        'DELETE FROM schedule_exclusions WHERE tenant_id = $1 AND id = $2',
        [tenant.tenantId, id],
      );
      await this.auditExclusion(client, 'schedule.exclusion.deleted', undefined, current);
      await client.query('COMMIT');
      return { id, deleted: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async generate(classId: string, input: GenerateSessionsDto) {
    const { tenant, pool } = this.tenantContext.get();
    this.validateDateRange(input.from, input.to);
    const client = await pool.connect();
    let inserted = 0;
    try {
      await client.query('BEGIN');
      await this.lockTenantSchedules(client, tenant.tenantId);
      const classResult = await client.query<{ branchId: string | null; startDate: string | null; expectedEndDate: string | null }>(
        `SELECT branch_id AS "branchId", start_date::text AS "startDate", expected_end_date::text AS "expectedEndDate"
         FROM classes WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
        [tenant.tenantId, classId],
      );
      const classRow = classResult.rows[0];
      if (!classRow) throw new NotFoundException('Class not found');
      const eligibleStudents = await client.query<{ studentId: string; enrollmentId: string }>(
        `SELECT id AS "enrollmentId", student_id AS "studentId"
         FROM enrollments
         WHERE tenant_id = $1 AND class_id = $2 AND status IN ('TRIAL', 'ACTIVE')
         ORDER BY student_id`,
        [tenant.tenantId, classId],
      );
      const patterns = await client.query<ScheduleRow>(
        `SELECT ${scheduleColumns} FROM schedules s
         WHERE s.tenant_id = $1 AND s.class_id = $2 AND s.status = 'ACTIVE'
           AND (s.effective_from IS NULL OR s.effective_from <= $4::date)
           AND (s.effective_until IS NULL OR s.effective_until >= $3::date)
         ORDER BY ${dayOrder}, s.start_time, s.id`,
        [tenant.tenantId, classId, input.from, input.to],
      );
      for (const pattern of patterns.rows) {
        const from = maxDate(input.from, pattern.effectiveFrom, classRow.startDate);
        const to = minDate(input.to, pattern.effectiveUntil, classRow.expectedEndDate);
        if (from > to) continue;
        for (const date of datesForWeekday(from, to, pattern.dayOfWeek)) {
          const existingGenerated = await client.query(
            `SELECT 1 FROM attendance_sessions
             WHERE tenant_id = $1 AND schedule_pattern_id = $2 AND session_date = $3::date
               AND start_time = $4::time AND end_time = $5::time
               AND manual_override = FALSE AND rescheduled_from_id IS NULL`,
            [tenant.tenantId, pattern.id, date, pattern.startTime, pattern.endTime],
          );
          if (existingGenerated.rows[0]) continue;
          const manualOverride = await client.query(
            `SELECT 1 FROM attendance_sessions
             WHERE tenant_id = $1 AND schedule_pattern_id = $2
               AND manual_override = TRUE AND rescheduled_from_id IS NULL
               AND (session_date = $3::date OR source_session_date = $3::date)`,
            [tenant.tenantId, pattern.id, date],
          );
          if (manualOverride.rows[0]) continue;
          const excluded = await client.query(
            `SELECT 1 FROM schedule_exclusions
             WHERE tenant_id = $1 AND date = $2::date AND (branch_id IS NULL OR branch_id = $3)`,
            [tenant.tenantId, date, pattern.branchId ?? classRow.branchId],
          );
          if (excluded.rows[0]) continue;
          const conflict = await this.sessionConflict(client, tenant.tenantId, {
            classId,
            teacherId: pattern.teacherId,
            roomId: pattern.roomId,
            sessionDate: date,
            startTime: pattern.startTime.slice(0, 5),
            endTime: pattern.endTime.slice(0, 5),
          });
          if (conflict) {
            const samePattern = await client.query(
              `SELECT 1 FROM attendance_sessions
               WHERE tenant_id = $1 AND schedule_pattern_id = $2 AND session_date = $3::date
                 AND start_time = $4::time AND end_time = $5::time`,
              [tenant.tenantId, pattern.id, date, pattern.startTime, pattern.endTime],
            );
            if (!samePattern.rows[0]) throw new ConflictException(conflict);
          }
          const sessionId = ulid();
          const result = await client.query(
            `INSERT INTO attendance_sessions
              (id, tenant_id, class_id, schedule_pattern_id, room_id, teacher_id, branch_id, session_date, start_time, end_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::time, $10::time)
             ON CONFLICT DO NOTHING`,
            [sessionId, tenant.tenantId, classId, pattern.id, pattern.roomId, pattern.teacherId, pattern.branchId ?? classRow.branchId, date, pattern.startTime, pattern.endTime],
          );
          if (result.rowCount) {
            inserted += result.rowCount;
            await client.query(
              'INSERT INTO attendance_sheets (id, tenant_id, session_id) VALUES ($1, $2, $3)',
              [ulid(), tenant.tenantId, sessionId],
            );
            if (eligibleStudents.rows.length > 0) {
              const values: unknown[] = [];
              const tuples = eligibleStudents.rows.map(({ studentId, enrollmentId }, index) => {
                const offset = index * 6;
                values.push(ulid(), tenant.tenantId, sessionId, studentId, enrollmentId, 'UNMARKED');
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, 'REGULAR')`;
              });
              await client.query(
                `INSERT INTO attendance_records (id, tenant_id, session_id, student_id, enrollment_id, status, source)
                 VALUES ${tuples.join(', ')}`,
                values,
              );
            }
          }
        }
      }
      const context = this.tenantContext.get();
      await this.audit.recordTenant(client, {
        tenantId: tenant.tenantId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.actorMembershipId,
        actorName: context.actorName,
        actorEmail: context.actorEmail,
        requestId: context.requestId,
        action: 'schedule.sessions.generated',
        entityType: 'Session',
        metadata: { classId, from: input.from, to: input.to, inserted },
      });
      await client.query('COMMIT');
      return { classId, from: input.from, to: input.to, inserted };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listSessions(input: CalendarQueryDto) {
    const { tenant, pool } = this.tenantContext.get();
    this.validateDateRange(input.from, input.to);
    const values: unknown[] = [tenant.tenantId, input.from, input.to];
    const conditions = [
      'a.tenant_id = $1',
      'a.session_date >= $2::date',
      'a.session_date <= $3::date',
    ];
    const add = (condition: string, value: unknown) => { values.push(value); conditions.push(condition.replace('$VALUE', `$${values.length}`)); };
    if (input.classId) add('a.class_id = $VALUE', input.classId);
    if (input.teacherId) add('a.teacher_id = $VALUE', input.teacherId);
    if (input.roomId) add('a.room_id = $VALUE', input.roomId);
    if (input.branchId) add('a.branch_id = $VALUE', input.branchId);
    if (input.studentId) add("EXISTS (SELECT 1 FROM enrollments e WHERE e.tenant_id = a.tenant_id AND e.class_id = a.class_id AND e.student_id = $VALUE AND e.status IN ('PENDING', 'TRIAL', 'ACTIVE', 'PAUSED'))", input.studentId);
    if (input.makeupEntitlementId) add(`EXISTS (
      SELECT 1 FROM makeup_entitlements me
      JOIN attendance_sessions source_session ON source_session.tenant_id = me.tenant_id AND source_session.id = me.source_session_id
      JOIN classes source_class ON source_class.tenant_id = source_session.tenant_id AND source_class.id = source_session.class_id
      WHERE me.tenant_id = a.tenant_id AND me.id = $VALUE
        AND a.session_date <= me.expires_at
        AND c.course_id IS NOT DISTINCT FROM source_class.course_id
        AND (source_class.course_level_id IS NULL OR c.course_level_id = source_class.course_level_id)
    )`, input.makeupEntitlementId);
    if (input.status) add('a.status = $VALUE', input.status);
    const result = await pool.query<SessionRow>(
      `SELECT ${sessionColumns}, c.code AS "classCode", c.name AS "className",
          t.code AS "teacherCode", t.name AS "teacherName",
          r.code AS "roomCode", r.name AS "roomName",
          a.branch_id AS "branchId",
          b.code AS "branchCode", b.name AS "branchName"
       FROM attendance_sessions a
       JOIN classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
       LEFT JOIN schedules s ON s.tenant_id = a.tenant_id AND s.id = a.schedule_pattern_id
       LEFT JOIN teachers t ON t.tenant_id = a.tenant_id AND t.id = a.teacher_id
       LEFT JOIN rooms r ON r.tenant_id = a.tenant_id AND r.id = a.room_id
       LEFT JOIN branches b ON b.tenant_id = a.tenant_id AND b.id = a.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.session_date, a.start_time, a.id`,
      values,
    );
    return result.rows.map(serializeSession);
  }

  async getSession(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<SessionRow>(
      `SELECT ${sessionColumns}, c.code AS "classCode", c.name AS "className",
          t.code AS "teacherCode", t.name AS "teacherName",
          r.code AS "roomCode", r.name AS "roomName",
          a.branch_id AS "branchId", b.code AS "branchCode", b.name AS "branchName"
       FROM attendance_sessions a
       JOIN classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
       LEFT JOIN teachers t ON t.tenant_id = a.tenant_id AND t.id = a.teacher_id
       LEFT JOIN rooms r ON r.tenant_id = a.tenant_id AND r.id = a.room_id
       LEFT JOIN branches b ON b.tenant_id = a.tenant_id AND b.id = a.branch_id
       WHERE a.tenant_id = $1 AND a.id = $2`,
      [tenant.tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException('Session not found');
    return serializeSession(result.rows[0]);
  }

  async updateSession(id: string, input: UpdateSessionDto) {
    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockTenantSchedules(client, tenant.tenantId);
      const current = await client.query<SessionRow>(
        `SELECT ${sessionColumns} FROM attendance_sessions a WHERE a.tenant_id = $1 AND a.id = $2 FOR UPDATE`,
        [tenant.tenantId, id],
      );
      const session = current.rows[0];
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== SessionStatus.SCHEDULED) throw new ConflictException('Only scheduled sessions can be changed.');
      const effective = {
        teacherId: input.teacherId !== undefined ? input.teacherId : session.teacherId,
        roomId: input.roomId !== undefined ? input.roomId : session.roomId,
        sessionDate: input.sessionDate ?? session.sessionDate,
        startTime: input.startTime ?? session.startTime.slice(0, 5),
        endTime: input.endTime ?? session.endTime.slice(0, 5),
      };
      this.validateTimeRange(effective.startTime, effective.endTime);
      await this.ensureSessionResources(client, tenant.tenantId, session.classId, effective.teacherId, effective.roomId);
      const conflict = await this.sessionConflict(client, tenant.tenantId, { ...effective, classId: session.classId }, id);
      if (conflict) throw new ConflictException(conflict);
      const result = await client.query<SessionRow>(
        `UPDATE attendance_sessions AS a SET teacher_id = $3, room_id = $4, session_date = $5::date,
          start_time = $6::time, end_time = $7::time, manual_override = TRUE,
          source_session_date = COALESCE(source_session_date, session_date),
          source_start_time = COALESCE(source_start_time, start_time),
          source_end_time = COALESCE(source_end_time, end_time),
          updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2 RETURNING ${sessionColumns}`,
        [tenant.tenantId, id, effective.teacherId, effective.roomId, effective.sessionDate, effective.startTime, effective.endTime],
      );
      await this.auditSession(client, 'schedule.session.updated', result.rows[0], session);
      await client.query('COMMIT');
      return serializeSession(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rescheduleSession(id: string, input: { sessionDate: string; startTime: string; endTime: string; reason?: string }) {
    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockTenantSchedules(client, tenant.tenantId);
      const current = await client.query<SessionRow>(`SELECT ${sessionColumns} FROM attendance_sessions a WHERE a.tenant_id = $1 AND a.id = $2 FOR UPDATE`, [tenant.tenantId, id]);
      const original = current.rows[0];
      if (!original) throw new NotFoundException('Session not found');
      if (original.status !== SessionStatus.SCHEDULED) throw new ConflictException('Only scheduled sessions can be rescheduled.');
      this.validateTimeRange(input.startTime, input.endTime);
      const conflict = await this.sessionConflict(client, tenant.tenantId, {
        classId: original.classId,
        teacherId: original.teacherId,
        roomId: original.roomId,
        sessionDate: input.sessionDate,
        startTime: input.startTime,
        endTime: input.endTime,
      }, id);
      if (conflict) throw new ConflictException(conflict);
      const roster = await client.query<{
        studentId: string;
        enrollmentId: string | null;
        status: string;
        note: string | null;
        source: 'REGULAR' | 'MAKEUP';
        makeupBookingId: string | null;
      }>(
        `SELECT student_id AS "studentId", enrollment_id AS "enrollmentId", status, note, source, makeup_booking_id AS "makeupBookingId"
         FROM attendance_records
         WHERE tenant_id = $1 AND session_id = $2
         ORDER BY student_id`,
        [tenant.tenantId, original.id],
      );
      const makeupBookings = await client.query<{ id: string; entitlementId: string; studentId: string }>(
        `SELECT id, entitlement_id AS "entitlementId", student_id AS "studentId" FROM makeup_bookings
         WHERE tenant_id = $1 AND destination_session_id = $2 AND status = 'BOOKED'
         FOR UPDATE`,
        [tenant.tenantId, original.id],
      );
      const replacementId = ulid();
      const replacement = await client.query<SessionRow>(
        `INSERT INTO attendance_sessions AS a
          (id, tenant_id, class_id, schedule_pattern_id, room_id, teacher_id, branch_id, session_date, start_time, end_time, manual_override, rescheduled_from_id, reschedule_reason, source_session_date, source_start_time, source_end_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::time, $10::time, TRUE, $11, $12, $13::date, $14::time, $15::time)
         RETURNING ${sessionColumns}`,
        [replacementId, tenant.tenantId, original.classId, original.schedulePatternId, original.roomId, original.teacherId, original.branchId, input.sessionDate, input.startTime, input.endTime, original.id, input.reason ?? null, original.sessionDate, original.startTime, original.endTime],
      );
      await client.query(
        'INSERT INTO attendance_sheets (id, tenant_id, session_id) VALUES ($1, $2, $3)',
        [ulid(), tenant.tenantId, replacementId],
      );
      for (const booking of makeupBookings.rows) {
        // Move the dependent attendance rows before changing the booking destination;
        // the composite foreign key requires both values to agree at every statement.
        await client.query(
          `DELETE FROM attendance_records
           WHERE tenant_id = $1 AND makeup_booking_id = $2 AND session_id = $3`,
          [tenant.tenantId, booking.id, id],
        );
        await client.query(
          `UPDATE makeup_bookings SET destination_session_id = $3, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1 AND id = $2 AND status = 'BOOKED'`,
          [tenant.tenantId, booking.id, replacementId],
        );
      }
      if (roster.rows.length > 0) {
        const values: unknown[] = [];
        const tuples = roster.rows.map(({ studentId, enrollmentId, status, note, source, makeupBookingId }, index) => {
          const offset = index * 9;
          values.push(ulid(), tenant.tenantId, replacementId, studentId, enrollmentId, status, note, source, makeupBookingId);
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
        });
        await client.query(
          `INSERT INTO attendance_records (id, tenant_id, session_id, student_id, enrollment_id, status, note, source, makeup_booking_id)
           VALUES ${tuples.join(', ')}`,
          values,
        );
      }
      const updated = await client.query<SessionRow>(
        `UPDATE attendance_sessions AS a SET status = 'RESCHEDULED', reschedule_reason = $3, updated_at = CURRENT_TIMESTAMP
         WHERE a.tenant_id = $1 AND a.id = $2 RETURNING ${sessionColumns}`,
        [tenant.tenantId, id, input.reason ?? null],
      );
      await this.auditSession(client, 'schedule.session.rescheduled', replacement.rows[0], updated.rows[0], input.reason);
      await client.query('COMMIT');
      return serializeSession(replacement.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelSession(id: string, reason: string) {
    return this.changeSessionStatus(id, SessionStatus.CANCELLED, reason, 'schedule.session.cancelled');
  }

  async completeSession(id: string) {
    return this.changeSessionStatus(id, SessionStatus.COMPLETED, undefined, 'schedule.session.completed');
  }

  private async changeSessionStatus(id: string, status: SessionStatus, reason: string | undefined, action: string) {
    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockTenantSchedules(client, tenant.tenantId);
      const current = await client.query<SessionRow>(`SELECT ${sessionColumns} FROM attendance_sessions a WHERE a.tenant_id = $1 AND a.id = $2 FOR UPDATE`, [tenant.tenantId, id]);
      const session = current.rows[0];
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== SessionStatus.SCHEDULED) throw new ConflictException('Session is not scheduled.');
      if (status === SessionStatus.COMPLETED) {
        const attendance = await client.query<{ status: string }>(
          'SELECT status FROM attendance_sheets WHERE tenant_id = $1 AND session_id = $2 FOR UPDATE',
          [tenant.tenantId, id],
        );
        if (attendance.rows[0]?.status !== 'LOCKED') {
          throw new ConflictException('Attendance must be finalized before completing the session.');
        }
      }
      const result = await client.query<SessionRow>(
        `UPDATE attendance_sessions AS a SET status = $3, cancellation_reason = $4, updated_at = CURRENT_TIMESTAMP
         WHERE a.tenant_id = $1 AND a.id = $2 RETURNING ${sessionColumns}`,
        [tenant.tenantId, id, status, status === SessionStatus.CANCELLED ? reason ?? null : null],
      );
      if (status === SessionStatus.CANCELLED) {
        await client.query(
          `UPDATE makeup_bookings b
           SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE b.tenant_id = $1 AND b.destination_session_id = $2 AND b.status = 'BOOKED'`,
          [tenant.tenantId, id],
        );
        await client.query(
          `UPDATE makeup_entitlements e
           SET status = CASE WHEN CURRENT_DATE > e.expires_at THEN 'EXPIRED' ELSE 'AVAILABLE' END, updated_at = CURRENT_TIMESTAMP
           WHERE e.tenant_id = $1 AND e.status = 'BOOKED'
             AND EXISTS (SELECT 1 FROM makeup_bookings b WHERE b.tenant_id = e.tenant_id AND b.entitlement_id = e.id AND b.destination_session_id = $2 AND b.status = 'CANCELLED')`,
          [tenant.tenantId, id],
        );
        await client.query(
          `WITH restored AS (
            UPDATE attendance_records SET status = 'UNMARKED', source = 'REGULAR', makeup_booking_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE tenant_id = $1 AND session_id = $2 AND source = 'MAKEUP' AND enrollment_id IS NOT NULL
          )
          DELETE FROM attendance_records WHERE tenant_id = $1 AND session_id = $2 AND source = 'MAKEUP' AND enrollment_id IS NULL`,
          [tenant.tenantId, id],
        );
      }
      await this.auditSession(client, action, result.rows[0], session, reason);
      await client.query('COMMIT');
      return serializeSession(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private validateDateRange(from: string, to: string) {
    if (from > to) throw new BadRequestException('The date range is inverted.');
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new BadRequestException('Invalid date range.');
    if ((end - start) / 86_400_000 > 366) throw new BadRequestException('The date range cannot exceed 366 days.');
  }

  private async getExclusion(client: PoolClient, tenantId: string, id: string) {
    const result = await client.query<ScheduleExclusionRow>(
      `SELECT ${exclusionColumns}
       FROM schedule_exclusions e
       LEFT JOIN branches b ON b.tenant_id = e.tenant_id AND b.id = e.branch_id
       WHERE e.tenant_id = $1 AND e.id = $2`,
      [tenantId, id],
    );
    return result.rows[0];
  }

  private async ensureExclusionBranch(client: PoolClient, tenantId: string, branchId: string | null) {
    if (!branchId) return;
    const result = await client.query<{ status: string }>(
      'SELECT status FROM branches WHERE tenant_id = $1 AND id = $2',
      [tenantId, branchId],
    );
    if (!result.rows[0]) throw new NotFoundException('Branch not found');
    if (result.rows[0].status === 'DISABLED') throw new ConflictException('Branch is disabled');
  }

  private async auditExclusion(
    client: PoolClient,
    action: string,
    after?: ReturnType<typeof serializeExclusion>,
    before?: ScheduleExclusionRow,
    reason?: string,
  ) {
    const context = this.tenantContext.get();
    await this.audit.recordTenant(client, {
      tenantId: context.tenant.tenantId,
      actorUserId: context.actorUserId,
      actorMembershipId: context.actorMembershipId,
      actorName: context.actorName,
      actorEmail: context.actorEmail,
      requestId: context.requestId,
      action,
      entityType: 'ScheduleExclusion',
      entityId: after?.id ?? before?.id ?? null,
      before: before ? serializeExclusion(before) : undefined,
      after,
      reason,
    });
  }

  private async sessionConflict(client: PoolClient, tenantId: string, candidate: { classId: string; teacherId: string | null; roomId: string | null; sessionDate: string; startTime: string; endTime: string }, excludedId?: string) {
    const result = await client.query<{ classId: string; teacherId: string | null; roomId: string | null }>(
      `SELECT class_id AS "classId", teacher_id AS "teacherId", room_id AS "roomId"
       FROM attendance_sessions
       WHERE tenant_id = $1 AND session_date = $2::date
         AND status IN ('SCHEDULED', 'COMPLETED')
         AND (class_id = $3 OR ($4::char(26) IS NOT NULL AND teacher_id = $4) OR ($5::char(26) IS NOT NULL AND room_id = $5))
         AND start_time < $7::time AND end_time > $6::time
         AND ($8::char(26) IS NULL OR id <> $8)
       LIMIT 1`,
      [tenantId, candidate.sessionDate, candidate.classId, candidate.teacherId, candidate.roomId, candidate.startTime, candidate.endTime, excludedId ?? null],
    );
    const conflict = result.rows[0];
    if (!conflict) return undefined;
    if (conflict.classId === candidate.classId) return 'Class already has an overlapping session.';
    if (candidate.teacherId && conflict.teacherId === candidate.teacherId) return 'Teacher already has an overlapping session.';
    return 'Room already has an overlapping session.';
  }

  private async ensureSessionResources(client: PoolClient, tenantId: string, classId: string, teacherId: string | null, roomId: string | null) {
    const classResult = await client.query<{ branchId: string | null }>('SELECT branch_id AS "branchId" FROM classes WHERE tenant_id = $1 AND id = $2', [tenantId, classId]);
    if (!classResult.rows[0]) throw new NotFoundException('Class not found');
    const branchId = classResult.rows[0].branchId;
    if (teacherId) {
      const teacher = await client.query<{ status: string }>('SELECT status FROM teachers WHERE tenant_id = $1 AND id = $2', [tenantId, teacherId]);
      if (!teacher.rows[0]) throw new NotFoundException('Teacher not found');
      if (teacher.rows[0].status === 'DISABLED') throw new ConflictException('Teacher is disabled');
      if (branchId && !(await client.query('SELECT 1 FROM teacher_branches WHERE tenant_id=$1 AND teacher_id=$2 AND branch_id=$3', [tenantId, teacherId, branchId])).rows[0]) throw new BadRequestException('Teacher is not assigned to the class branch.');
    }
    if (roomId) {
      const room = await client.query<{ branchId: string; status: string }>('SELECT branch_id AS "branchId", status FROM rooms WHERE tenant_id = $1 AND id = $2', [tenantId, roomId]);
      if (!room.rows[0]) throw new NotFoundException('Room not found');
      if (branchId && room.rows[0].branchId !== branchId) throw new BadRequestException('Room does not belong to the class branch.');
      if (room.rows[0].status === 'DISABLED') throw new ConflictException('Room is disabled');
    }
  }

  private async auditSession(client: PoolClient, action: string, after: SessionRow, before?: SessionRow, reason?: string) {
    const context = this.tenantContext.get();
    await this.audit.recordTenant(client, {
      tenantId: context.tenant.tenantId,
      actorUserId: context.actorUserId,
      actorMembershipId: context.actorMembershipId,
      actorName: context.actorName,
      actorEmail: context.actorEmail,
      requestId: context.requestId,
      action,
      entityType: 'Session',
      entityId: after.id,
      before: before ? serializeSession(before) : undefined,
      after: serializeSession(after),
      reason,
    });
  }

  private validateTimeRange(startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be earlier than end time.');
    }
  }

  private async lockTenantSchedules(client: PoolClient, tenantId: string) {
    // ponytail: serializes schedule writes per tenant; use ordered resource locks if contention appears.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [tenantId]);
  }

  private async ensurePatternDates(
    client: PoolClient,
    tenantId: string,
    classId: string,
    effectiveFrom: string | null,
    effectiveUntil: string | null,
  ) {
    if (effectiveFrom && effectiveUntil && effectiveFrom > effectiveUntil) {
      throw new BadRequestException('Effective start date must be on or before the effective end date.');
    }

    const result = await client.query<{ startDate: string | null; expectedEndDate: string | null }>(
      `SELECT start_date::text AS "startDate", expected_end_date::text AS "expectedEndDate"
       FROM classes
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, classId],
    );
    const classRow = result.rows[0];
    if (!classRow) throw new NotFoundException('Class not found');
    if (effectiveFrom && classRow.expectedEndDate && effectiveFrom > classRow.expectedEndDate) {
      throw new BadRequestException('Schedule effective dates do not overlap the class lifecycle.');
    }
    if (effectiveUntil && classRow.startDate && effectiveUntil < classRow.startDate) {
      throw new BadRequestException('Schedule effective dates do not overlap the class lifecycle.');
    }
  }

  private async ensureResourcesExist(
    client: PoolClient,
    tenantId: string,
    classId: string,
    teacherId: string,
    branchId: string | null,
    roomId: string | null,
  ) {
    const result = await client.query<{ classExists: boolean; teacherExists: boolean }>(
      `SELECT
         EXISTS (SELECT 1 FROM classes WHERE tenant_id = $1 AND id = $2) AS "classExists",
         EXISTS (SELECT 1 FROM teachers WHERE tenant_id = $1 AND id = $3) AS "teacherExists"`,
      [tenantId, classId, teacherId],
    );
    if (!result.rows[0]?.classExists) throw new NotFoundException('Class not found');
    if (!result.rows[0].teacherExists) throw new NotFoundException('Teacher not found');

    const classResult = await client.query<{ branchId: string | null }>(
      'SELECT branch_id AS "branchId" FROM classes WHERE tenant_id = $1 AND id = $2',
      [tenantId, classId],
    );
    const classBranchId = classResult.rows[0]?.branchId ?? null;
    if (branchId && classBranchId && branchId !== classBranchId) {
      throw new BadRequestException('Schedule branch does not match the class branch.');
    }
    const effectiveBranchId = branchId ?? classBranchId;
    if (branchId) {
      const branch = await client.query<{ status: string }>(
        'SELECT status FROM branches WHERE tenant_id = $1 AND id = $2',
        [tenantId, branchId],
      );
      if (!branch.rows[0]) throw new NotFoundException('Branch not found');
      if (branch.rows[0].status === 'DISABLED') throw new ConflictException('Branch is disabled');
    }
    if (roomId) {
      const room = await client.query<{ branchId: string; status: string }>(
        'SELECT branch_id AS "branchId", status FROM rooms WHERE tenant_id = $1 AND id = $2',
        [tenantId, roomId],
      );
      if (!room.rows[0]) throw new NotFoundException('Room not found');
      if (effectiveBranchId && room.rows[0].branchId !== effectiveBranchId) {
        throw new BadRequestException('Room does not belong to the schedule branch.');
      }
      if (room.rows[0].status === 'DISABLED') throw new ConflictException('Room is disabled');
    }
    if (effectiveBranchId) {
      const assignment = await client.query(
        'SELECT 1 FROM teacher_branches WHERE tenant_id = $1 AND teacher_id = $2 AND branch_id = $3',
        [tenantId, teacherId, effectiveBranchId],
      );
      if (!assignment.rows[0]) throw new BadRequestException('Teacher is not assigned to the schedule branch.');
    }
    return effectiveBranchId;
  }

  private async ensureNoConflict(
    client: PoolClient,
    tenantId: string,
    schedule: {
      classId: string;
      teacherId: string;
      dayOfWeek: DayOfWeek;
      startTime: string;
      endTime: string;
      status: ScheduleStatus;
    },
    excludedId?: string,
  ) {
    if (schedule.status === ScheduleStatus.DISABLED) return;

    const result = await client.query<ConflictRow>(
      `SELECT
         class_id AS "classId",
         teacher_id AS "teacherId",
         day_of_week AS "dayOfWeek",
         start_time::text AS "startTime",
         end_time::text AS "endTime"
       FROM schedules
       WHERE tenant_id = $1
         AND status = 'ACTIVE'
         AND day_of_week = $2
         AND (class_id = $3 OR teacher_id = $4)
         AND start_time < $6::time
         AND end_time > $5::time
         AND ($7::char(26) IS NULL OR id <> $7)
       ORDER BY (class_id = $3) DESC
       LIMIT 1`,
      [
        tenantId,
        schedule.dayOfWeek,
        schedule.classId,
        schedule.teacherId,
        schedule.startTime,
        schedule.endTime,
        excludedId ?? null,
      ],
    );
    const conflict = result.rows[0];
    if (!conflict) return;

    const exactDuplicate =
      conflict.classId === schedule.classId &&
      conflict.teacherId === schedule.teacherId &&
      conflict.startTime.slice(0, 5) === schedule.startTime &&
      conflict.endTime.slice(0, 5) === schedule.endTime;
    if (exactDuplicate) {
      throw new ConflictException('An identical active schedule already exists.');
    }
    if (conflict.classId === schedule.classId) {
      throw new ConflictException('Class already has an overlapping schedule at this time.');
    }
    throw new ConflictException('Teacher already has an overlapping schedule at this time.');
  }
}
