import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { ClassStatus, type CreateClassDto } from './dto/create-class.dto.js';
import type { UpdateClassDto } from './dto/update-class.dto.js';

type ClassRow = QueryResultRow & {
  id: string;
  tenantId: string;
  courseId: string | null;
  courseCode: string | null;
  courseName: string | null;
  code: string;
  name: string;
  description: string | null;
  status: ClassStatus;
  createdAt: Date;
  updatedAt: Date;
};

const classColumns = `
  c.id,
  c.tenant_id AS "tenantId",
  c.course_id AS "courseId",
  course.code AS "courseCode",
  course.name AS "courseName",
  c.code,
  c.name,
  c.description,
  c.status,
  c.created_at AS "createdAt",
  c.updated_at AS "updatedAt"
`;

const selectClass = `
  SELECT ${classColumns}
  FROM classes c
  LEFT JOIN courses course ON course.id = c.course_id AND course.tenant_id = c.tenant_id
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
      `${selectClass} WHERE c.tenant_id = $1 ORDER BY c.name ASC, c.id ASC`,
      [tenant.tenantId],
    );
    return result.rows.map(serialize);
  }

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<ClassRow>(
      `${selectClass} WHERE c.tenant_id = $1 AND c.id = $2`,
      [tenant.tenantId, id],
    );
    const classRecord = result.rows[0];
    if (!classRecord) throw new NotFoundException('Class not found');
    return serialize(classRecord);
  }

  async create(input: CreateClassDto) {
    const { tenant, pool } = this.tenantContext.get();
    const client = await pool.connect();
    let id: string;
    try {
      await client.query('BEGIN');
      await this.ensureActiveCourse(client, tenant.tenantId, input.courseId);
      id = ulid();
      await client.query(
        `INSERT INTO classes
          (id, tenant_id, course_id, code, name, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          tenant.tenantId,
          input.courseId,
          input.code.toUpperCase(),
          input.name,
          input.description ?? null,
          input.status ?? ClassStatus.ACTIVE,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isClassCodeConflict(error)) throw new ConflictException('Class code already exists');
      throw error;
    } finally {
      client.release();
    }
    return this.get(id);
  }

  async update(id: string, input: UpdateClassDto) {
    const fields: string[] = [];
    const values: unknown[] = [];
    const columns: Array<[keyof UpdateClassDto, string, (value: never) => unknown]> = [
      ['courseId', 'course_id', (value: string) => value],
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ courseId: string | null }>(
        `SELECT course_id AS "courseId"
         FROM classes
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenant.tenantId, id],
      );
      if (!existing.rows[0]) throw new NotFoundException('Class not found');
      if (input.courseId !== undefined && input.courseId !== existing.rows[0].courseId) {
        await this.ensureActiveCourse(client, tenant.tenantId, input.courseId);
      }

      await client.query(
        `UPDATE classes
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2`,
        [tenant.tenantId, id, ...values],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isClassCodeConflict(error)) throw new ConflictException('Class code already exists');
      throw error;
    } finally {
      client.release();
    }
    return this.get(id);
  }

  private async ensureActiveCourse(client: PoolClient, tenantId: string, courseId: string) {
    const result = await client.query(
      `SELECT status
       FROM courses
       WHERE tenant_id = $1 AND id = $2
       FOR SHARE`,
      [tenantId, courseId],
    );
    const course = result.rows[0];
    if (!course) throw new NotFoundException('Course not found');
    if (course.status === 'DISABLED') throw new ConflictException('Course is disabled');
  }
}
