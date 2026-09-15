import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import type { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto.js';
import {
  AttendanceRecordStatus,
  type UpdateAttendanceRecordDto,
} from './dto/update-attendance-record.dto.js';
import {
  AttendanceSessionStatus,
  type UpdateAttendanceSessionDto,
} from './dto/update-attendance-session.dto.js';

type SessionRow = QueryResultRow & {
  id: string;
  tenantId: string;
  classId: string;
  scheduleId: string | null;
  teacherId: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: AttendanceSessionStatus;
  createdAt: Date;
  updatedAt: Date;
};

type SessionDetailRow = SessionRow & {
  classCode: string;
  className: string;
  teacherCode: string | null;
  teacherName: string | null;
};

type SessionListRow = SessionDetailRow & { recordCount: number };

type RecordRow = QueryResultRow & {
  id: string;
  tenantId: string;
  attendanceSessionId: string;
  studentId: string;
  status: AttendanceRecordStatus;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SessionRecordRow = RecordRow & {
  studentCode: string;
  studentFullName: string;
};

type StudentHistoryRow = RecordRow & {
  classId: string;
  classCode: string;
  className: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  sessionStatus: AttendanceSessionStatus;
};

type ScheduleRow = QueryResultRow & {
  classId: string;
  teacherId: string;
  startTime: string;
  endTime: string;
};

const sessionColumns = `
  a.id,
  a.tenant_id AS "tenantId",
  a.class_id AS "classId",
  a.schedule_id AS "scheduleId",
  a.teacher_id AS "teacherId",
  a.session_date::text AS "sessionDate",
  a.start_time::text AS "startTime",
  a.end_time::text AS "endTime",
  a.status,
  a.created_at AS "createdAt",
  a.updated_at AS "updatedAt"
`;

const recordColumns = `
  r.id,
  r.tenant_id AS "tenantId",
  r.attendance_session_id AS "attendanceSessionId",
  r.student_id AS "studentId",
  r.status,
  r.note,
  r.created_at AS "createdAt",
  r.updated_at AS "updatedAt"
`;

function serializeSession<T extends SessionRow>(row: T) {
  return {
    ...row,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRecord<T extends RecordRow>(row: T) {
  return {
    ...row,
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
    if (databaseError.constraint === 'attendance_sessions_class_id_fkey') {
      throw new NotFoundException('Class not found');
    }
    if (databaseError.constraint === 'attendance_sessions_schedule_id_fkey') {
      throw new NotFoundException('Schedule not found');
    }
    if (databaseError.constraint === 'attendance_sessions_teacher_id_fkey') {
      throw new NotFoundException('Teacher not found');
    }
    if (databaseError.constraint === 'attendance_records_student_id_fkey') {
      throw new NotFoundException('Student not found');
    }
  }
  if (
    databaseError?.code === '23505' &&
    (databaseError.constraint === 'attendance_sessions_occurrence_key' ||
      databaseError.constraint === 'attendance_sessions_schedule_date_key')
  ) {
    throw new ConflictException('An attendance session already exists for this occurrence.');
  }
  if (
    databaseError?.code === '23505' &&
    databaseError.constraint === 'attendance_records_session_student_key'
  ) {
    throw new ConflictException('Student already has an attendance record for this session.');
  }
  if (
    databaseError?.code === '23514' &&
    databaseError.constraint === 'attendance_sessions_time_order_check'
  ) {
    throw new BadRequestException('Start time must be earlier than end time.');
  }
  throw error;
}

@Injectable()
export class AttendanceService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(input: CreateAttendanceSessionDto) {
    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    let sessionId: string;

    try {
      await client.query('BEGIN');
      // ponytail: serializes occurrence creation with schedule writes; use narrower locks if contention appears.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [tenant.tenantId]);

      const occurrence = await this.resolveOccurrence(client, tenant.tenantId, input);
      sessionId = ulid();
      await client.query<SessionRow>(
        `INSERT INTO attendance_sessions AS a
          (id, tenant_id, class_id, schedule_id, teacher_id, session_date, start_time, end_time)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::time, $8::time)
         RETURNING ${sessionColumns}`,
        [
          sessionId,
          tenant.tenantId,
          input.classId,
          input.scheduleId ?? null,
          occurrence.teacherId,
          input.sessionDate,
          occurrence.startTime,
          occurrence.endTime,
        ],
      );

      const eligible = await client.query<{ studentId: string }>(
        `SELECT student_id AS "studentId"
         FROM enrollments
         WHERE tenant_id = $1 AND class_id = $2 AND status = 'ACTIVE'
         ORDER BY student_id`,
        [tenant.tenantId, input.classId],
      );
      if (eligible.rows.length > 0) {
        const values: unknown[] = [];
        const tuples = eligible.rows.map(({ studentId }, index) => {
          const offset = index * 4;
          values.push(ulid(), tenant.tenantId, sessionId, studentId);
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
        });
        await client.query(
          `INSERT INTO attendance_records
            (id, tenant_id, attendance_session_id, student_id)
           VALUES ${tuples.join(', ')}`,
          values,
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      return mapDatabaseError(error);
    } finally {
      client.release();
    }

    return this.get(sessionId);
  }

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const sessionResult = await pool.query<SessionDetailRow>(
      `SELECT ${sessionColumns},
         c.code AS "classCode",
         c.name AS "className",
         t.code AS "teacherCode",
         t.name AS "teacherName"
       FROM attendance_sessions a
       JOIN classes c ON c.id = a.class_id AND c.tenant_id = a.tenant_id
       LEFT JOIN teachers t ON t.id = a.teacher_id AND t.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND a.id = $2`,
      [tenant.tenantId, id],
    );
    const session = sessionResult.rows[0];
    if (!session) throw new NotFoundException('Attendance session not found');

    const records = await pool.query<SessionRecordRow>(
      `SELECT ${recordColumns},
         s.code AS "studentCode",
         s.full_name AS "studentFullName"
       FROM attendance_records r
       JOIN students s ON s.id = r.student_id AND s.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1 AND r.attendance_session_id = $2
       ORDER BY s.full_name ASC, r.id ASC`,
      [tenant.tenantId, id],
    );
    return {
      ...serializeSession(session),
      records: records.rows.map(serializeRecord),
    };
  }

  async complete(id: string, _input: UpdateAttendanceSessionDto) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<SessionRow>(
      `UPDATE attendance_sessions AS a
       SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
       WHERE a.tenant_id = $1 AND a.id = $2 AND a.status = 'OPEN'
       RETURNING ${sessionColumns}`,
      [tenant.tenantId, id],
    );
    if (result.rows[0]) return serializeSession(result.rows[0]);

    const existing = await pool.query(
      'SELECT 1 FROM attendance_sessions WHERE tenant_id = $1 AND id = $2',
      [tenant.tenantId, id],
    );
    if (!existing.rows[0]) throw new NotFoundException('Attendance session not found');
    throw new ConflictException('Attendance session is already completed.');
  }

  async updateRecord(id: string, input: UpdateAttendanceRecordDto) {
    if (input.status === undefined && input.note === undefined) {
      throw new BadRequestException('At least one field is required');
    }

    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ sessionStatus: AttendanceSessionStatus }>(
        `SELECT a.status AS "sessionStatus"
         FROM attendance_records r
         JOIN attendance_sessions a
           ON a.id = r.attendance_session_id AND a.tenant_id = r.tenant_id
         WHERE r.tenant_id = $1 AND r.id = $2
         FOR UPDATE OF a`,
        [tenant.tenantId, id],
      );
      if (!existing.rows[0]) throw new NotFoundException('Attendance record not found');
      if (existing.rows[0].sessionStatus === AttendanceSessionStatus.COMPLETED) {
        throw new ConflictException('Completed attendance cannot be edited.');
      }

      const fields: string[] = [];
      const values: unknown[] = [tenant.tenantId, id];
      if (input.status !== undefined) {
        values.push(input.status);
        fields.push(`status = $${values.length}`);
      }
      if (input.note !== undefined) {
        values.push(input.note);
        fields.push(`note = $${values.length}`);
      }
      const result = await client.query<RecordRow>(
        `UPDATE attendance_records AS r
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE r.tenant_id = $1 AND r.id = $2
         RETURNING ${recordColumns}`,
        values,
      );
      await client.query('COMMIT');
      return serializeRecord(result.rows[0]);
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

    const result = await pool.query<SessionListRow>(
      `SELECT ${sessionColumns},
         c.code AS "classCode",
         c.name AS "className",
         t.code AS "teacherCode",
         t.name AS "teacherName",
         COUNT(r.id)::int AS "recordCount"
       FROM attendance_sessions a
       JOIN classes c ON c.id = a.class_id AND c.tenant_id = a.tenant_id
       LEFT JOIN teachers t ON t.id = a.teacher_id AND t.tenant_id = a.tenant_id
       LEFT JOIN attendance_records r
         ON r.attendance_session_id = a.id AND r.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND a.class_id = $2
       GROUP BY a.id, c.code, c.name, t.code, t.name
       ORDER BY a.session_date DESC, a.start_time DESC, a.id DESC`,
      [tenant.tenantId, classId],
    );
    return result.rows.map(serializeSession);
  }

  async listForStudent(studentId: string) {
    const { tenant, pool } = this.tenantContext.get();
    const student = await pool.query(
      'SELECT 1 FROM students WHERE tenant_id = $1 AND id = $2',
      [tenant.tenantId, studentId],
    );
    if (!student.rows[0]) throw new NotFoundException('Student not found');

    const result = await pool.query<StudentHistoryRow>(
      `SELECT ${recordColumns},
         a.class_id AS "classId",
         c.code AS "classCode",
         c.name AS "className",
         a.session_date::text AS "sessionDate",
         a.start_time::text AS "startTime",
         a.end_time::text AS "endTime",
         a.status AS "sessionStatus"
       FROM attendance_records r
       JOIN attendance_sessions a
         ON a.id = r.attendance_session_id AND a.tenant_id = r.tenant_id
       JOIN classes c ON c.id = a.class_id AND c.tenant_id = a.tenant_id
       WHERE r.tenant_id = $1 AND r.student_id = $2
       ORDER BY a.session_date DESC, a.start_time DESC, r.id DESC`,
      [tenant.tenantId, studentId],
    );
    return result.rows.map((row) => ({
      ...serializeRecord(row),
      startTime: row.startTime.slice(0, 5),
      endTime: row.endTime.slice(0, 5),
    }));
  }

  private async resolveOccurrence(
    client: PoolClient,
    tenantId: string,
    input: CreateAttendanceSessionDto,
  ) {
    const classRecord = await client.query(
      'SELECT 1 FROM classes WHERE tenant_id = $1 AND id = $2',
      [tenantId, input.classId],
    );
    if (!classRecord.rows[0]) throw new NotFoundException('Class not found');

    if (input.scheduleId) {
      const result = await client.query<ScheduleRow>(
        `SELECT
           class_id AS "classId",
           teacher_id AS "teacherId",
           start_time::text AS "startTime",
           end_time::text AS "endTime"
         FROM schedules
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.scheduleId],
      );
      const schedule = result.rows[0];
      if (!schedule) throw new NotFoundException('Schedule not found');
      if (schedule.classId !== input.classId) {
        throw new BadRequestException('Schedule does not belong to this class.');
      }
      return {
        teacherId: schedule.teacherId,
        startTime: schedule.startTime.slice(0, 5),
        endTime: schedule.endTime.slice(0, 5),
      };
    }

    if (!input.startTime || !input.endTime) {
      throw new BadRequestException('Start time and end time are required without a schedule.');
    }
    if (input.startTime >= input.endTime) {
      throw new BadRequestException('Start time must be earlier than end time.');
    }
    if (input.teacherId) {
      const teacher = await client.query(
        'SELECT 1 FROM teachers WHERE tenant_id = $1 AND id = $2',
        [tenantId, input.teacherId],
      );
      if (!teacher.rows[0]) throw new NotFoundException('Teacher not found');
    }
    return {
      teacherId: input.teacherId ?? null,
      startTime: input.startTime,
      endTime: input.endTime,
    };
  }
}
