import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { ClassStatus, type CreateClassDto } from './dto/create-class.dto.js';
import type { UpdateClassDto } from './dto/update-class.dto.js';

type ClassRow = QueryResultRow & {
  id: string; tenantId: string; courseId: string | null; courseCode: string | null; courseName: string | null;
  branchId: string | null; branchCode: string | null; branchName: string | null;
  courseLevelId: string | null; courseLevelCode: string | null; courseLevelName: string | null;
  defaultRoomId: string | null; defaultRoomCode: string | null;
  primaryTeacherId: string | null; primaryTeacherCode: string | null; primaryTeacherName: string | null;
  code: string; name: string; description: string | null; capacity: number | null;
  startDate: Date | string | null; expectedEndDate: Date | string | null; status: ClassStatus;
  createdAt: Date; updatedAt: Date;
};

const columns = `c.id, c.tenant_id AS "tenantId", c.course_id AS "courseId", course.code AS "courseCode", course.name AS "courseName",
  c.branch_id AS "branchId", branch.code AS "branchCode", branch.name AS "branchName",
  c.course_level_id AS "courseLevelId", level.code AS "courseLevelCode", level.name AS "courseLevelName",
  c.default_room_id AS "defaultRoomId", room.code AS "defaultRoomCode",
  c.primary_teacher_id AS "primaryTeacherId", teacher.code AS "primaryTeacherCode", teacher.name AS "primaryTeacherName",
  c.code, c.name, c.description, c.capacity, c.start_date AS "startDate", c.expected_end_date AS "expectedEndDate", c.status,
  c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;
const select = `SELECT ${columns} FROM classes c
  LEFT JOIN courses course ON course.tenant_id = c.tenant_id AND course.id = c.course_id
  LEFT JOIN branches branch ON branch.tenant_id = c.tenant_id AND branch.id = c.branch_id
  LEFT JOIN course_levels level ON level.tenant_id = c.tenant_id AND level.id = c.course_level_id
  LEFT JOIN rooms room ON room.tenant_id = c.tenant_id AND room.id = c.default_room_id
  LEFT JOIN teachers teacher ON teacher.tenant_id = c.tenant_id AND teacher.id = c.primary_teacher_id`;

function dateValue(value: Date | string | null) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
function serialize(row: ClassRow) {
  return { ...row, startDate: dateValue(row.startDate), expectedEndDate: dateValue(row.expectedEndDate), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
const snapshot = (row: ClassRow) => ({ courseId: row.courseId, branchId: row.branchId, courseLevelId: row.courseLevelId, defaultRoomId: row.defaultRoomId, primaryTeacherId: row.primaryTeacherId, code: row.code, name: row.name, description: row.description, capacity: row.capacity, startDate: dateValue(row.startDate), expectedEndDate: dateValue(row.expectedEndDate), status: row.status });
function isClassCodeConflict(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505' && 'constraint' in error && error.constraint === 'classes_tenant_id_code_key'; }
function actor(context: ReturnType<TenantContextService['get']>) { return { tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId, actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId }; }

@Injectable()
export class ClassesService {
  constructor(private readonly tenantContext: TenantContextService, private readonly audit: AuditService) {}

  async list() { const { tenant, pool } = this.tenantContext.get(); const result = await pool.query<ClassRow>(`${select} WHERE c.tenant_id = $1 ORDER BY c.name, c.id`, [tenant.tenantId]); return result.rows.map(serialize); }
  async get(id: string) { const { tenant, pool } = this.tenantContext.get(); const result = await pool.query<ClassRow>(`${select} WHERE c.tenant_id = $1 AND c.id = $2`, [tenant.tenantId, id]); if (!result.rows[0]) throw new NotFoundException('Class not found'); return serialize(result.rows[0]); }

  async create(input: CreateClassDto) {
    const context = this.tenantContext.get(); const client = await context.pool.connect(); let id = ulid();
    try {
      await client.query('BEGIN');
      await this.validateRelationships(client, context.tenant.tenantId, input, true);
      if (!input.branchId && input.courseLevelId === undefined && input.defaultRoomId === undefined && input.primaryTeacherId === undefined && input.capacity === undefined && input.startDate === undefined && input.expectedEndDate === undefined) {
        await client.query(`INSERT INTO classes (id, tenant_id, course_id, code, name, description, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, context.tenant.tenantId, input.courseId, input.code.toUpperCase(), input.name, input.description ?? null, input.status ?? ClassStatus.ACTIVE]);
      } else {
        await client.query(`INSERT INTO classes (id, tenant_id, course_id, branch_id, course_level_id, default_room_id, primary_teacher_id, code, name, description, capacity, start_date, expected_end_date, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [id, context.tenant.tenantId, input.courseId, input.branchId ?? null, input.courseLevelId ?? null, input.defaultRoomId ?? null, input.primaryTeacherId ?? null, input.code.toUpperCase(), input.name, input.description ?? null, input.capacity ?? null, input.startDate ?? null, input.expectedEndDate ?? null, input.status ?? ClassStatus.ACTIVE]);
      }
      const row = await this.lockedRow(client, context.tenant.tenantId, id);
      await this.audit.recordTenant(client, { ...actor(context), action: 'class.created', entityType: 'CLASS', entityId: id, after: snapshot(row) });
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); if (isClassCodeConflict(error)) throw new ConflictException('Class code already exists'); throw error; }
    finally { client.release(); }
    return this.get(id);
  }

  async update(id: string, input: UpdateClassDto) {
    const columns: Array<[keyof UpdateClassDto, string, (value: never) => unknown]> = [
      ['courseId', 'course_id', (value: string) => value], ['branchId', 'branch_id', (value: string) => value], ['courseLevelId', 'course_level_id', (value: string | null) => value], ['defaultRoomId', 'default_room_id', (value: string | null) => value], ['primaryTeacherId', 'primary_teacher_id', (value: string | null) => value],
      ['code', 'code', (value: string) => value.toUpperCase()], ['name', 'name', (value: string) => value], ['description', 'description', (value: string | null) => value], ['capacity', 'capacity', (value: number | null) => value], ['startDate', 'start_date', (value: string | null) => value], ['expectedEndDate', 'expected_end_date', (value: string | null) => value], ['status', 'status', (value: ClassStatus) => value],
    ];
    const fields: string[] = []; const values: unknown[] = [];
    for (const [property, column, transform] of columns) { if (!Object.hasOwn(input, property) || input[property] === undefined) continue; values.push(transform(input[property] as never)); fields.push(`${column} = $${values.length + 2}`); }
    if (!fields.length) throw new BadRequestException('At least one field is required');
    const context = this.tenantContext.get(); const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const old = await this.lockedRow(client, context.tenant.tenantId, id);
      const proposed = {
        ...old,
        ...input,
        courseId: input.courseId ?? old.courseId,
        branchId: input.branchId ?? old.branchId,
        courseLevelId: Object.hasOwn(input, 'courseLevelId') ? input.courseLevelId : old.courseLevelId,
        defaultRoomId: Object.hasOwn(input, 'defaultRoomId') ? input.defaultRoomId : old.defaultRoomId,
        primaryTeacherId: Object.hasOwn(input, 'primaryTeacherId') ? input.primaryTeacherId : old.primaryTeacherId,
        startDate: Object.hasOwn(input, 'startDate') ? input.startDate : old.startDate,
        expectedEndDate: Object.hasOwn(input, 'expectedEndDate') ? input.expectedEndDate : old.expectedEndDate,
      } as CreateClassDto;
      await this.validateRelationships(client, context.tenant.tenantId, proposed, false, old, input);
      if ((input.branchId !== undefined || input.courseLevelId !== undefined) && (await client.query('SELECT 1 FROM enrollments WHERE tenant_id=$1 AND class_id=$2 LIMIT 1', [context.tenant.tenantId, id])).rows[0]) throw new ConflictException('Class academic structure cannot change after enrollment history exists');
      await client.query(`UPDATE classes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND id = $2`, [context.tenant.tenantId, id, ...values]);
      const row = await this.lockedRow(client, context.tenant.tenantId, id);
      await this.audit.recordTenant(client, { ...actor(context), action: 'class.updated', entityType: 'CLASS', entityId: id, before: snapshot(old), after: snapshot(row) });
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); if (isClassCodeConflict(error)) throw new ConflictException('Class code already exists'); throw error; }
    finally { client.release(); }
    return this.get(id);
  }

  private async lockedRow(client: PoolClient, tenantId: string, id: string) {
    const result = await client.query<ClassRow>(`${select} WHERE c.tenant_id = $1 AND c.id = $2 FOR UPDATE OF c`, [tenantId, id]);
    if (!result.rows[0]) throw new NotFoundException('Class not found');
    return result.rows[0];
  }

  private async validateRelationships(client: PoolClient, tenantId: string, input: Partial<CreateClassDto>, creating: boolean, old?: ClassRow, patch?: UpdateClassDto) {
    if (!input.courseId) throw new BadRequestException('Course is required');
    const course = await client.query<{ status: string }>('SELECT status FROM courses WHERE tenant_id = $1 AND id = $2 FOR SHARE', [tenantId, input.courseId]);
    if (!course.rows[0]) throw new NotFoundException('Course not found');
    const courseChanged = creating || patch?.courseId !== undefined;
    if (courseChanged && course.rows[0].status === 'DISABLED') throw new ConflictException('Course is disabled');
    const branch = input.branchId ? await client.query<{ status: string }>('SELECT status FROM branches WHERE tenant_id = $1 AND id = $2 FOR SHARE', [tenantId, input.branchId]) : { rows: [] as { status: string }[] };
    const branchRequired = creating && Boolean(input.branchId);
    if (branchRequired && !branch.rows[0]) throw new NotFoundException('Branch not found');
    const branchChanged = (creating && Boolean(input.branchId)) || patch?.branchId !== undefined;
    if (branchChanged && branch.rows[0]?.status === 'DISABLED') throw new ConflictException('Branch is disabled');
    if (input.courseLevelId) {
      const level = await client.query<{ courseId: string; status: string }>('SELECT course_id AS "courseId", status FROM course_levels WHERE tenant_id = $1 AND id = $2 FOR SHARE', [tenantId, input.courseLevelId]);
      if (!level.rows[0]) throw new NotFoundException('Course level not found');
      if (level.rows[0].courseId !== input.courseId) throw new BadRequestException('Course level does not belong to the selected course');
      if ((creating || patch?.courseLevelId !== undefined) && level.rows[0].status === 'DISABLED') throw new ConflictException('Course level is disabled');
    }
    if (input.defaultRoomId) {
      const room = await client.query<{ branchId: string; status: string }>('SELECT branch_id AS "branchId", status FROM rooms WHERE tenant_id = $1 AND id = $2 FOR SHARE', [tenantId, input.defaultRoomId]);
      if (!room.rows[0]) throw new NotFoundException('Room not found');
      if (room.rows[0].branchId !== input.branchId) throw new BadRequestException('Room does not belong to the selected branch');
      if ((creating || patch?.defaultRoomId !== undefined) && room.rows[0].status === 'DISABLED') throw new ConflictException('Room is disabled');
    }
    if (input.primaryTeacherId) {
      const teacher = await client.query<{ status: string }>('SELECT status FROM teachers WHERE tenant_id = $1 AND id = $2 FOR SHARE', [tenantId, input.primaryTeacherId]);
      if (!teacher.rows[0]) throw new NotFoundException('Teacher not found');
      if ((creating || patch?.primaryTeacherId !== undefined) && teacher.rows[0].status === 'DISABLED') throw new ConflictException('Teacher is disabled');
      if (input.branchId) {
        const assignment = await client.query('SELECT 1 FROM teacher_branches WHERE tenant_id = $1 AND teacher_id = $2 AND branch_id = $3', [tenantId, input.primaryTeacherId, input.branchId]);
        if (!assignment.rows[0]) throw new BadRequestException('Teacher is not assigned to the selected branch');
      }
    }
    const startDate = input.startDate ? String(input.startDate).slice(0, 10) : null;
    const endDate = input.expectedEndDate ? String(input.expectedEndDate).slice(0, 10) : null;
    if (startDate && endDate && startDate > endDate) throw new BadRequestException('Start date must be on or before expected end date');
    void old;
  }
}
