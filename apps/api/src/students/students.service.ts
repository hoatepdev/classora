import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { type CreateStudentDto, StudentStatus } from './dto/create-student.dto.js';
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

@Injectable()
export class StudentsService {
  constructor(private readonly tenantContext: TenantContextService, private readonly audit: AuditService) {}

  async list() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<StudentRow>(
      `${selectStudent} WHERE tenant_id = $1 ORDER BY full_name ASC, id ASC`,
      [tenant.tenantId],
    );
    return result.rows.map(serialize);
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
    const { tenant, pool, actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<StudentRow>(
        `INSERT INTO students
          (id, tenant_id, code, full_name, phone, email, date_of_birth, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING
           id,
           tenant_id AS "tenantId",
           code,
           full_name AS "fullName",
           phone,
           email,
           date_of_birth::text AS "dateOfBirth",
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [ulid(), tenant.tenantId, input.code.toUpperCase(), input.fullName, input.phone ?? null, input.email ?? null, input.dateOfBirth ?? null, input.status ?? StudentStatus.ACTIVE],
      );
      const student = result.rows[0];
      await this.audit.recordTenant(client, {
        tenantId: tenant.tenantId, actorUserId, actorMembershipId, actorName, actorEmail, requestId,
        action: 'student.created', entityType: 'STUDENT', entityId: student.id,
        after: { code: student.code, fullName: student.fullName, phone: student.phone, email: student.email, dateOfBirth: student.dateOfBirth, status: student.status },
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

  async update(id: string, input: UpdateStudentDto) {
    const fields: string[] = [];
    const values: unknown[] = [];
    const columns: Array<[keyof UpdateStudentDto, string, (value: never) => unknown]> = [
      ['code', 'code', (value: string) => value.toUpperCase()],
      ['fullName', 'full_name', (value: string) => value],
      ['phone', 'phone', (value: string | null) => value],
      ['email', 'email', (value: string | null) => value],
      ['dateOfBirth', 'date_of_birth', (value: string | null) => value],
      ['status', 'status', (value: StudentStatus) => value],
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
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [tenant.tenantId, id, ...values],
      );
      const student = result.rows[0];
      const snapshot = (row: StudentRow) => ({ code: row.code, fullName: row.fullName, phone: row.phone, email: row.email, dateOfBirth: row.dateOfBirth, status: row.status });
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
