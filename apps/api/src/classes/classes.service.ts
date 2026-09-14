import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { ClassStatus, type CreateClassDto } from './dto/create-class.dto.js';
import type { UpdateClassDto } from './dto/update-class.dto.js';

type ClassRow = QueryResultRow & {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  status: ClassStatus;
  createdAt: Date;
  updatedAt: Date;
};

const selectClass = `
  SELECT
    id,
    tenant_id AS "tenantId",
    code,
    name,
    description,
    status,
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM classes
`;

function serialize(row: ClassRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isClassCodeConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'classes_tenant_id_code_key'
  );
}

@Injectable()
export class ClassesService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async list() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<ClassRow>(
      `${selectClass} WHERE tenant_id = $1 ORDER BY name ASC, id ASC`,
      [tenant.tenantId],
    );
    return result.rows.map(serialize);
  }

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<ClassRow>(
      `${selectClass} WHERE tenant_id = $1 AND id = $2`,
      [tenant.tenantId, id],
    );
    const classRecord = result.rows[0];
    if (!classRecord) throw new NotFoundException('Class not found');
    return serialize(classRecord);
  }

  async create(input: CreateClassDto) {
    const { tenant, pool } = this.tenantContext.get();
    try {
      const result = await pool.query<ClassRow>(
        `INSERT INTO classes
          (id, tenant_id, code, name, description, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING
           id,
           tenant_id AS "tenantId",
           code,
           name,
           description,
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [
          ulid(),
          tenant.tenantId,
          input.code.toUpperCase(),
          input.name,
          input.description ?? null,
          input.status ?? ClassStatus.ACTIVE,
        ],
      );
      return serialize(result.rows[0]);
    } catch (error) {
      if (isClassCodeConflict(error)) throw new ConflictException('Class code already exists');
      throw error;
    }
  }

  async update(id: string, input: UpdateClassDto) {
    const fields: string[] = [];
    const values: unknown[] = [];
    const columns: Array<[keyof UpdateClassDto, string, (value: never) => unknown]> = [
      ['code', 'code', (value: string) => value.toUpperCase()],
      ['name', 'name', (value: string) => value],
      ['description', 'description', (value: string | null) => value],
      ['status', 'status', (value: ClassStatus) => value],
    ];

    for (const [property, column, transform] of columns) {
      if (!Object.hasOwn(input, property) || input[property] === undefined) continue;
      values.push(transform(input[property] as never));
      fields.push(`${column} = $${values.length + 2}`);
    }
    if (fields.length === 0) throw new BadRequestException('At least one field is required');

    const { tenant, pool } = this.tenantContext.get();
    try {
      const result = await pool.query<ClassRow>(
        `UPDATE classes
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2
         RETURNING
           id,
           tenant_id AS "tenantId",
           code,
           name,
           description,
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [tenant.tenantId, id, ...values],
      );
      const classRecord = result.rows[0];
      if (!classRecord) throw new NotFoundException('Class not found');
      return serialize(classRecord);
    } catch (error) {
      if (isClassCodeConflict(error)) throw new ConflictException('Class code already exists');
      throw error;
    }
  }
}
