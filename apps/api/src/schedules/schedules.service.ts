import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import {
  type CreateScheduleDto,
  DayOfWeek,
  ScheduleStatus,
} from './dto/create-schedule.dto.js';
import type { UpdateScheduleDto } from './dto/update-schedule.dto.js';

type ScheduleRow = QueryResultRow & {
  id: string;
  tenantId: string;
  classId: string;
  teacherId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  room: string | null;
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

const scheduleColumns = `
  s.id,
  s.tenant_id AS "tenantId",
  s.class_id AS "classId",
  s.teacher_id AS "teacherId",
  s.day_of_week AS "dayOfWeek",
  s.start_time::text AS "startTime",
  s.end_time::text AS "endTime",
  s.room,
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
    if (databaseError.constraint === 'schedules_class_id_fkey') {
      throw new NotFoundException('Class not found');
    }
    if (databaseError.constraint === 'schedules_teacher_id_fkey') {
      throw new NotFoundException('Teacher not found');
    }
  }
  if (
    databaseError?.code === '23505' &&
    databaseError.constraint === 'schedules_active_identity_key'
  ) {
    throw new ConflictException('An identical active schedule already exists.');
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
  constructor(private readonly tenantContext: TenantContextService) {}

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
      await this.ensureResourcesExist(client, tenant.tenantId, input.classId, input.teacherId);
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
          (id, tenant_id, class_id, teacher_id, day_of_week, start_time, end_time, room, status)
         VALUES ($1, $2, $3, $4, $5, $6::time, $7::time, $8, $9)
         RETURNING ${scheduleColumns}`,
        [
          ulid(),
          tenant.tenantId,
          input.classId,
          input.teacherId,
          input.dayOfWeek,
          input.startTime,
          input.endTime,
          input.room ?? null,
          input.status ?? ScheduleStatus.ACTIVE,
        ],
      );
      await client.query('COMMIT');
      return serialize(result.rows[0]);
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
      'room',
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
        room: input.room !== undefined ? input.room : schedule.room,
        status: input.status ?? schedule.status,
      };
      this.validateTimeRange(effective.startTime, effective.endTime);
      if (input.teacherId !== undefined) {
        await this.ensureResourcesExist(client, tenant.tenantId, effective.classId, effective.teacherId);
      }
      await this.ensureNoConflict(client, tenant.tenantId, effective, id);

      const result = await client.query<ScheduleRow>(
        `UPDATE schedules AS s
         SET teacher_id = $3,
             day_of_week = $4,
             start_time = $5::time,
             end_time = $6::time,
             room = $7,
             status = $8,
             updated_at = CURRENT_TIMESTAMP
         WHERE s.tenant_id = $1 AND s.id = $2
         RETURNING ${scheduleColumns}`,
        [
          tenant.tenantId,
          id,
          effective.teacherId,
          effective.dayOfWeek,
          effective.startTime,
          effective.endTime,
          effective.room,
          effective.status,
        ],
      );
      await client.query('COMMIT');
      return serialize(result.rows[0]);
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

  private validateTimeRange(startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be earlier than end time.');
    }
  }

  private async lockTenantSchedules(client: PoolClient, tenantId: string) {
    // ponytail: serializes schedule writes per tenant; use ordered resource locks if contention appears.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [tenantId]);
  }

  private async ensureResourcesExist(
    client: PoolClient,
    tenantId: string,
    classId: string,
    teacherId: string,
  ) {
    const result = await client.query<{ classExists: boolean; teacherExists: boolean }>(
      `SELECT
         EXISTS (SELECT 1 FROM classes WHERE tenant_id = $1 AND id = $2) AS "classExists",
         EXISTS (SELECT 1 FROM teachers WHERE tenant_id = $1 AND id = $3) AS "teacherExists"`,
      [tenantId, classId, teacherId],
    );
    if (!result.rows[0]?.classExists) throw new NotFoundException('Class not found');
    if (!result.rows[0].teacherExists) throw new NotFoundException('Teacher not found');
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
