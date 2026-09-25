import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { type CreateStudentDto, StudentStatus } from './dto/create-student.dto.js';
import type { StudentQueryDto } from './dto/student-query.dto.js';
import type { CreateGuardianDto, CreateNoteDto, CreateTagDto, LinkGuardianDto, UpdateGuardianDto } from './dto/guardian.dto.js';
import type { UpdateStudentDto } from './dto/update-student.dto.js';

type StudentRow = QueryResultRow & {
  id: string;
  tenantId: string;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  status: StudentStatus;
  gender: string | null;
  address: string | null;
  school: string | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const selectStudent = `
  SELECT
    id,
    tenant_id AS "tenantId",
    code,
    full_name AS "fullName",
    phone,
    email,
    date_of_birth::text AS "dateOfBirth",
    status,
    gender,
    address,
    school,
    source,
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM students
`;

function serialize(row: StudentRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isStudentCodeConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'students_tenant_id_code_key'
  );
}

type StudentCursor = { fullName: string; id: string };

function decodeCursor(value: string | undefined): StudentCursor | undefined {
  if (!value) return undefined;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as StudentCursor;
    if (!cursor || typeof cursor.fullName !== 'string' || typeof cursor.id !== 'string') throw new Error();
    return cursor;
  } catch {
    throw new BadRequestException('Invalid student cursor');
  }
}

function encodeCursor(cursor: StudentCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

@Injectable()
export class StudentsService {
  constructor(private readonly tenantContext: TenantContextService, private readonly audit: AuditService) {}

  async list(query: StudentQueryDto) {
    const { tenant, pool } = this.tenantContext.get();
    const values: unknown[] = [tenant.tenantId];
    const conditions = ['tenant_id = $1'];
    if (query.status) {
      values.push(query.status);
      conditions.push(`status = $${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      conditions.push(`(full_name ILIKE $${values.length} OR code ILIKE $${values.length} OR phone ILIKE $${values.length} OR email ILIKE $${values.length})`);
    }
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      values.push(cursor.fullName, cursor.id);
      conditions.push(`(full_name, id) > ($${values.length - 1}, $${values.length})`);
    }
    const limit = query.limit ?? 50;
    const result = await pool.query<StudentRow>(
      `${selectStudent} WHERE ${conditions.join(' AND ')} ORDER BY full_name ASC, id ASC LIMIT ${limit + 1}`,
      values,
    );
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map(serialize),
      nextCursor: result.rows.length > limit && last ? encodeCursor({ fullName: last.fullName, id: last.id }) : null,
    };
  }

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<StudentRow>(
      `${selectStudent} WHERE tenant_id = $1 AND id = $2`,
      [tenant.tenantId, id],
    );
    const student = result.rows[0];
    if (!student) throw new NotFoundException('Student not found');
    return serialize(student);
  }

  async create(input: CreateStudentDto) {
    const { pool } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const student = await this.createInTransaction(client, input);
      await client.query('COMMIT');
      return student;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isStudentCodeConflict(error)) throw new ConflictException('Student code already exists');
      throw error;
    } finally {
      client.release?.();
    }
  }

  async createInTransaction(client: PoolClient, input: CreateStudentDto) {
    const { tenant, actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
    const result = await client.query<StudentRow>(
      `INSERT INTO students
        (id, tenant_id, code, full_name, phone, email, date_of_birth, status, gender, address, school, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING
         id,
         tenant_id AS "tenantId",
         code,
         full_name AS "fullName",
         phone,
         email,
         date_of_birth::text AS "dateOfBirth",
         status,
         gender,
         address,
         school,
         source,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [ulid(), tenant.tenantId, input.code.toUpperCase(), input.fullName, input.phone ?? null, input.email?.toLowerCase() ?? null, input.dateOfBirth ?? null, input.status ?? StudentStatus.ACTIVE, input.gender ?? null, input.address ?? null, input.school ?? null, input.source ?? null],
    );
    const student = result.rows[0];
    const snapshot = (row: StudentRow) => ({ code: row.code, fullName: row.fullName, phone: row.phone, email: row.email, dateOfBirth: row.dateOfBirth, status: row.status, gender: row.gender, address: row.address, school: row.school, source: row.source });
    await this.audit.recordTenant(client, {
      tenantId: tenant.tenantId, actorUserId, actorMembershipId, actorName, actorEmail, requestId,
      action: 'student.created', entityType: 'STUDENT', entityId: student.id,
      after: snapshot(student),
    });
    return serialize(student);
  }

  async update(id: string, input: UpdateStudentDto) {
    const fields: string[] = [];
    const values: unknown[] = [];
    const columns: Array<[keyof UpdateStudentDto, string, (value: never) => unknown]> = [
      ['code', 'code', (value: string) => value.toUpperCase()],
      ['fullName', 'full_name', (value: string) => value],
      ['phone', 'phone', (value: string | null) => value],
      ['email', 'email', (value: string | null) => value?.toLowerCase() ?? null],
      ['dateOfBirth', 'date_of_birth', (value: string | null) => value],
      ['status', 'status', (value: StudentStatus) => value],
      ['gender', 'gender', (value: string | null) => value],
      ['address', 'address', (value: string | null) => value],
      ['school', 'school', (value: string | null) => value],
      ['source', 'source', (value: string | null) => value],
    ];

    for (const [property, column, transform] of columns) {
      if (!Object.hasOwn(input, property) || input[property] === undefined) continue;
      values.push(transform(input[property] as never));
      fields.push(`${column} = $${values.length + 2}`);
    }
    if (fields.length === 0) throw new BadRequestException('At least one field is required');

    const { tenant, pool, actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<StudentRow>(`${selectStudent} WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenant.tenantId, id]);
      const beforeRow = existing.rows[0];
      if (!beforeRow) throw new NotFoundException('Student not found');
      const result = await client.query<StudentRow>(
        `UPDATE students
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2
         RETURNING
           id,
           tenant_id AS "tenantId",
           code,
           full_name AS "fullName",
           phone,
           email,
           date_of_birth::text AS "dateOfBirth",
           status,
           gender,
           address,
           school,
           source,
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [tenant.tenantId, id, ...values],
      );
      const student = result.rows[0];
      const snapshot = (row: StudentRow) => ({ code: row.code, fullName: row.fullName, phone: row.phone, email: row.email, dateOfBirth: row.dateOfBirth, status: row.status, gender: row.gender, address: row.address, school: row.school, source: row.source });
      const before = snapshot(beforeRow);
      const after = snapshot(student);
      const changedBefore: Record<string, unknown> = {};
      const changedAfter: Record<string, unknown> = {};
      for (const key of Object.keys(after) as Array<keyof typeof after>) if (before[key] !== after[key]) { changedBefore[key] = before[key]; changedAfter[key] = after[key]; }
      await this.audit.recordTenant(client, {
        tenantId: tenant.tenantId, actorUserId, actorMembershipId, actorName, actorEmail, requestId,
        action: 'student.updated', entityType: 'STUDENT', entityId: student.id, before: changedBefore, after: changedAfter,
      });
      await client.query('COMMIT');
      return serialize(student);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isStudentCodeConflict(error)) throw new ConflictException('Student code already exists');
      throw error;
    } finally {
      client.release?.();
    }
  }
}
