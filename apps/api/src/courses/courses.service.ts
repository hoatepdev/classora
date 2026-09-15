import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { CourseStatus, type CreateCourseDto } from './dto/create-course.dto.js';
import type { UpdateCourseDto } from './dto/update-course.dto.js';

type CourseRow = QueryResultRow & {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  status: CourseStatus;
  createdAt: Date;
  updatedAt: Date;
};

type CourseClassRow = QueryResultRow & {
  id: string;
  tenantId: string;
  courseId: string;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
};

const selectCourse = `
  SELECT
    id,
    tenant_id AS "tenantId",
    code,
    name,
    description,
    status,
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM courses
`;

function serialize<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isCourseCodeConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'courses_tenant_id_code_key'
  );
}

@Injectable()
export class CoursesService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async list() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<CourseRow>(
      `${selectCourse} WHERE tenant_id = $1 ORDER BY name ASC, id ASC`,
      [tenant.tenantId],
    );
    return result.rows.map(serialize);
  }

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<CourseRow>(
      `${selectCourse} WHERE tenant_id = $1 AND id = $2`,
      [tenant.tenantId, id],
    );
    const course = result.rows[0];
    if (!course) throw new NotFoundException('Course not found');
    return serialize(course);
  }

  async create(input: CreateCourseDto) {
    const { tenant, pool } = this.tenantContext.get();
    try {
      const result = await pool.query<CourseRow>(
        `INSERT INTO courses
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
          input.status ?? CourseStatus.ACTIVE,
        ],
      );
      return serialize(result.rows[0]);
    } catch (error) {
      if (isCourseCodeConflict(error)) throw new ConflictException('Course code already exists');
      throw error;
    }
  }

  async update(id: string, input: UpdateCourseDto) {
    const fields: string[] = [];
    const values: unknown[] = [];
    const columns: Array<[keyof UpdateCourseDto, string, (value: never) => unknown]> = [
      ['code', 'code', (value: string) => value.toUpperCase()],
      ['name', 'name', (value: string) => value],
      ['description', 'description', (value: string | null) => value],
      ['status', 'status', (value: CourseStatus) => value],
    ];

    for (const [property, column, transform] of columns) {
      if (!Object.hasOwn(input, property) || input[property] === undefined) continue;
      values.push(transform(input[property] as never));
      fields.push(`${column} = $${values.length + 2}`);
    }
    if (fields.length === 0) throw new BadRequestException('At least one field is required');

    const { tenant, pool } = this.tenantContext.get();
    try {
      const result = await pool.query<CourseRow>(
        `UPDATE courses
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
      const course = result.rows[0];
      if (!course) throw new NotFoundException('Course not found');
      return serialize(course);
    } catch (error) {
      if (isCourseCodeConflict(error)) throw new ConflictException('Course code already exists');
      throw error;
    }
  }

  async listClasses(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const course = await pool.query(
      'SELECT 1 FROM courses WHERE tenant_id = $1 AND id = $2',
      [tenant.tenantId, id],
    );
    if (!course.rows[0]) throw new NotFoundException('Course not found');

    const result = await pool.query<CourseClassRow>(
      `SELECT
         id,
         tenant_id AS "tenantId",
         course_id AS "courseId",
         code,
         name,
         description,
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM classes
       WHERE tenant_id = $1 AND course_id = $2
       ORDER BY name ASC, id ASC`,
      [tenant.tenantId, id],
    );
    return result.rows.map(serialize);
  }
}
