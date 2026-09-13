import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { ulid } from 'ulid';
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
  constructor(private readonly tenantContext: TenantContextService) {}

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
    const { tenant, pool } = this.tenantContext.get();
    try {
      const result = await pool.query<StudentRow>(
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
        [
          ulid(),
          tenant.tenantId,
          input.code.toUpperCase(),
          input.fullName,
          input.phone ?? null,
          input.email ?? null,
          input.dateOfBirth ?? null,
          input.status ?? StudentStatus.ACTIVE,
        ],
      );
      return serialize(result.rows[0]);
    } catch (error) {
      if (isStudentCodeConflict(error)) throw new ConflictException('Student code already exists');
      throw error;
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

    const { tenant, pool } = this.tenantContext.get();
    try {
      const result = await pool.query<StudentRow>(
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
      if (!student) throw new NotFoundException('Student not found');
      return serialize(student);
    } catch (error) {
      if (isStudentCodeConflict(error)) throw new ConflictException('Student code already exists');
      throw error;
    }
  }
}
