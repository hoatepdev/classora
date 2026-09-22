import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { CourseLevelStatus, type CreateCourseLevelDto } from './dto/create-course-level.dto.js';
import { CourseStatus, type CreateCourseDto } from './dto/create-course.dto.js';
import type { UpdateCourseLevelDto } from './dto/update-course-level.dto.js';
import type { UpdateCourseDto } from './dto/update-course.dto.js';

 type CourseLevelRow = QueryResultRow & {
  id: string;
  tenantId: string;
  courseId: string;
  code: string;
  name: string;
  displayOrder: number;
  description: string | null;
  status: CourseLevelStatus;
  createdAt: Date;
  updatedAt: Date;
};

const selectCourseLevel = `
  SELECT id, tenant_id AS "tenantId", course_id AS "courseId", code, name,
    display_order AS "displayOrder", description, status,
    created_at AS "createdAt", updated_at AS "updatedAt"
  FROM course_levels
`;

const serializeLevel = (row: CourseLevelRow) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const levelSnapshot = (row: CourseLevelRow) => ({
  courseId: row.courseId,
  code: row.code,
  name: row.name,
  displayOrder: row.displayOrder,
  description: row.description,
  status: row.status,
});

function isCourseLevelConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505' &&
    'constraint' in error && error.constraint === 'course_levels_tenant_id_course_id_code_key';
}

function actor(context: ReturnType<TenantContextService['get']>) {
  return {
    tenantId: context.tenant.tenantId,
    actorUserId: context.actorUserId,
    actorMembershipId: context.actorMembershipId,
    actorName: context.actorName,
    actorEmail: context.actorEmail,
    requestId: context.requestId,
  };
}

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

const courseSnapshot = (row: CourseRow) => ({ code: row.code, name: row.name, description: row.description, status: row.status });

@Injectable()
export class CoursesService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private async ensureCourse(client: PoolClient, tenantId: string, courseId: string) {
    const result = await client.query('SELECT id FROM courses WHERE tenant_id = $1 AND id = $2 FOR SHARE', [tenantId, courseId]);
    if (!result.rows[0]) throw new NotFoundException('Course not found');
  }

  async listLevels(courseId: string) {
    const { tenant, pool } = this.tenantContext.get();
    const course = await pool.query('SELECT id FROM courses WHERE tenant_id = $1 AND id = $2', [tenant.tenantId, courseId]);
    if (!course.rows[0]) throw new NotFoundException('Course not found');
    const result = await pool.query<CourseLevelRow>(`${selectCourseLevel} WHERE tenant_id = $1 AND course_id = $2 ORDER BY display_order, name, id`, [tenant.tenantId, courseId]);
    return result.rows.map(serializeLevel);
  }

  async createLevel(courseId: string, input: CreateCourseLevelDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      await this.ensureCourse(client, context.tenant.tenantId, courseId);
      const inserted = await client.query<CourseLevelRow>(
        `INSERT INTO course_levels (id, tenant_id, course_id, code, name, display_order, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, tenant_id AS "tenantId", course_id AS "courseId", code, name,
           display_order AS "displayOrder", description, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [ulid(), context.tenant.tenantId, courseId, input.code.toUpperCase(), input.name, input.displayOrder ?? 0, input.description ?? null, input.status ?? CourseLevelStatus.ACTIVE],
      );
      const row = inserted.rows[0];
      await this.audit.recordTenant(client, { ...actor(context), action: 'course_level.created', entityType: 'COURSE_LEVEL', entityId: row.id, after: levelSnapshot(row) });
      await client.query('COMMIT');
      return serializeLevel(row);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isCourseLevelConflict(error)) throw new ConflictException('Course level code already exists');
      throw error;
    } finally { client.release(); }
  }

  async updateLevel(courseId: string, levelId: string, input: UpdateCourseLevelDto) {
    const columns: Array<[keyof UpdateCourseLevelDto, string, (value: never) => unknown]> = [
      ['code', 'code', (value: string) => value.toUpperCase()],
      ['name', 'name', (value: string) => value],
      ['displayOrder', 'display_order', (value: number) => value],
      ['description', 'description', (value: string | null) => value],
      ['status', 'status', (value: CourseLevelStatus) => value],
    ];
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [property, column, transform] of columns) {
      if (!Object.hasOwn(input, property) || input[property] === undefined) continue;
      values.push(transform(input[property] as never));
      fields.push(`${column} = $${values.length + 3}`);
    }
    if (!fields.length) throw new BadRequestException('At least one field is required');
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const old = await client.query<CourseLevelRow>(`${selectCourseLevel} WHERE tenant_id = $1 AND course_id = $2 AND id = $3 FOR UPDATE`, [context.tenant.tenantId, courseId, levelId]);
      if (!old.rows[0]) throw new NotFoundException('Course level not found');
      const result = await client.query<CourseLevelRow>(
        `UPDATE course_levels SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND course_id = $2 AND id = $3
         RETURNING id, tenant_id AS "tenantId", course_id AS "courseId", code, name, display_order AS "displayOrder", description, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [context.tenant.tenantId, courseId, levelId, ...values],
      );
      const row = result.rows[0];
      await this.audit.recordTenant(client, { ...actor(context), action: 'course_level.updated', entityType: 'COURSE_LEVEL', entityId: levelId, before: levelSnapshot(old.rows[0]), after: levelSnapshot(row) });
      await client.query('COMMIT');
      return serializeLevel(row);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isCourseLevelConflict(error)) throw new ConflictException('Course level code already exists');
      throw error;
    } finally { client.release(); }
  }

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
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<CourseRow>(
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
          context.tenant.tenantId,
          input.code.toUpperCase(),
          input.name,
          input.description ?? null,
          input.status ?? CourseStatus.ACTIVE,
        ],
      );
      const row = result.rows[0];
      await this.audit.recordTenant(client, { ...actor(context), action: 'course.created', entityType: 'COURSE', entityId: row.id, after: courseSnapshot(row) });
      await client.query('COMMIT');
      return serialize(row);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isCourseCodeConflict(error)) throw new ConflictException('Course code already exists');
      throw error;
    } finally { client.release(); }
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

    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const old = await client.query<CourseRow>(`${selectCourse} WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [context.tenant.tenantId, id]);
      if (!old.rows[0]) throw new NotFoundException('Course not found');
      const result = await client.query<CourseRow>(
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
        [context.tenant.tenantId, id, ...values],
      );
      const course = result.rows[0];
      await this.audit.recordTenant(client, { ...actor(context), action: 'course.updated', entityType: 'COURSE', entityId: id, before: courseSnapshot(old.rows[0]), after: courseSnapshot(course) });
      await client.query('COMMIT');
      return serialize(course);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isCourseCodeConflict(error)) throw new ConflictException('Course code already exists');
      throw error;
    } finally { client.release(); }
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
