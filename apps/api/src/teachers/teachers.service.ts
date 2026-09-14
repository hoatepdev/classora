import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { type CreateTeacherDto, TeacherStatus } from './dto/create-teacher.dto.js';
import type { UpdateTeacherDto } from './dto/update-teacher.dto.js';

type TeacherRow = QueryResultRow & {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  status: TeacherStatus;
  createdAt: Date;
  updatedAt: Date;
};

const selectTeacher = `
  SELECT
    id,
    tenant_id AS "tenantId",
    code,
    name,
    phone,
    email,
    note,
    status,
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM teachers
`;

function serialize(row: TeacherRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isTeacherCodeConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'teachers_tenant_id_code_key'
  );
}

@Injectable()
export class TeachersService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async list() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<TeacherRow>(
      `${selectTeacher} WHERE tenant_id = $1 ORDER BY name ASC, id ASC`,
      [tenant.tenantId],
    );
    return result.rows.map(serialize);
  }

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<TeacherRow>(
      `${selectTeacher} WHERE tenant_id = $1 AND id = $2`,
      [tenant.tenantId, id],
    );
    const teacher = result.rows[0];
    if (!teacher) throw new NotFoundException('Teacher not found');
    return serialize(teacher);
  }

  async create(input: CreateTeacherDto) {
    const { tenant, pool } = this.tenantContext.get();
    try {
      const result = await pool.query<TeacherRow>(
        `INSERT INTO teachers
          (id, tenant_id, code, name, phone, email, note, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING
           id,
           tenant_id AS "tenantId",
           code,
           name,
           phone,
           email,
           note,
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [
          ulid(),
          tenant.tenantId,
          input.code.toUpperCase(),
          input.name,
          input.phone ?? null,
          input.email ?? null,
          input.note ?? null,
          input.status ?? TeacherStatus.ACTIVE,
        ],
      );
      return serialize(result.rows[0]);
    } catch (error) {
      if (isTeacherCodeConflict(error)) throw new ConflictException('Teacher code already exists');
      throw error;
    }
  }

  async update(id: string, input: UpdateTeacherDto) {
    const fields: string[] = [];
    const values: unknown[] = [];
    const columns: Array<[keyof UpdateTeacherDto, string, (value: never) => unknown]> = [
      ['code', 'code', (value: string) => value.toUpperCase()],
      ['name', 'name', (value: string) => value],
      ['phone', 'phone', (value: string | null) => value],
      ['email', 'email', (value: string | null) => value],
      ['note', 'note', (value: string | null) => value],
      ['status', 'status', (value: TeacherStatus) => value],
    ];

    for (const [property, column, transform] of columns) {
      if (!Object.hasOwn(input, property) || input[property] === undefined) continue;
      values.push(transform(input[property] as never));
      fields.push(`${column} = $${values.length + 2}`);
    }
    if (fields.length === 0) throw new BadRequestException('At least one field is required');

    const { tenant, pool } = this.tenantContext.get();
    try {
      const result = await pool.query<TeacherRow>(
        `UPDATE teachers
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2
         RETURNING
           id,
           tenant_id AS "tenantId",
           code,
           name,
           phone,
           email,
           note,
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [tenant.tenantId, id, ...values],
      );
      const teacher = result.rows[0];
      if (!teacher) throw new NotFoundException('Teacher not found');
      return serialize(teacher);
    } catch (error) {
      if (isTeacherCodeConflict(error)) throw new ConflictException('Teacher code already exists');
      throw error;
    }
  }
}
