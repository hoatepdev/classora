import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import type { ReplaceTeacherBranchesDto } from './dto/replace-teacher-branches.dto.js';
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
  specialties: string[];
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
    specialties,
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

const snapshot = (row: TeacherRow) => ({ code: row.code, name: row.name, phone: row.phone, email: row.email, note: row.note, specialties: row.specialties, status: row.status });

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

@Injectable()
export class TeachersService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  async replaceBranches(id: string, input: ReplaceTeacherBranchesDto) {
    const context = this.tenantContext.get();
    const branchIds = [...new Set(input.branchIds)];
    if (branchIds.length !== input.branchIds.length) throw new BadRequestException('Duplicate branch IDs are not allowed');
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const teacher = await client.query<TeacherRow>('SELECT id, tenant_id AS "tenantId", code, name, phone, email, note, specialties, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM teachers WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [context.tenant.tenantId, id]);
      if (!teacher.rows[0]) throw new NotFoundException('Teacher not found');
      const branches = await client.query<{ id: string }>('SELECT id FROM branches WHERE tenant_id = $1 AND id = ANY($2::char(26)[])', [context.tenant.tenantId, branchIds]);
      if (branches.rows.length !== branchIds.length) throw new NotFoundException('Branch not found');
      const current = await client.query<{ branchId: string }>('SELECT branch_id AS "branchId" FROM teacher_branches WHERE tenant_id = $1 AND teacher_id = $2', [context.tenant.tenantId, id]);
      const existing = new Set(current.rows.map((row) => row.branchId));
      const requested = new Set(branchIds);
      await client.query('DELETE FROM teacher_branches WHERE tenant_id = $1 AND teacher_id = $2', [context.tenant.tenantId, id]);
      if (branchIds.length) await client.query('INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id) SELECT * FROM UNNEST($1::char(26)[], $2::char(26)[], $3::char(26)[], $4::char(26)[])', [branchIds.map(() => ulid()), branchIds.map(() => context.tenant.tenantId), branchIds.map(() => id), branchIds]);
      for (const branchId of branchIds) {
        if (!existing.has(branchId)) await this.audit.recordTenant(client, { tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId, actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId, action: 'teacher.branch_assigned', entityType: 'TEACHER_BRANCH', entityId: id, after: { teacherId: id, branchId } });
      }
      for (const branchId of existing) {
        if (!requested.has(branchId)) await this.audit.recordTenant(client, { tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId, actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId, action: 'teacher.branch_unassigned', entityType: 'TEACHER_BRANCH', entityId: id, before: { teacherId: id, branchId } });
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
    return this.get(id);
  }

  async listBranches(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query('SELECT b.id, b.tenant_id AS "tenantId", b.code, b.name, b.address, b.phone, b.email, b.status, b.notes, b.created_at AS "createdAt", b.updated_at AS "updatedAt" FROM teacher_branches tb JOIN branches b ON b.tenant_id = tb.tenant_id AND b.id = tb.branch_id WHERE tb.tenant_id = $1 AND tb.teacher_id = $2 ORDER BY b.name, b.id', [tenant.tenantId, id]);
    if (!result.rows.length) {
      const teacher = await pool.query('SELECT 1 FROM teachers WHERE tenant_id = $1 AND id = $2', [tenant.tenantId, id]);
      if (!teacher.rows[0]) throw new NotFoundException('Teacher not found');
    }
    return result.rows;
  }

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
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<TeacherRow>(
        `INSERT INTO teachers
          (id, tenant_id, code, name, phone, email, note, status, specialties)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING
           id,
           tenant_id AS "tenantId",
           code,
           name,
           phone,
           email,
           note,
           specialties,
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [
          ulid(),
          context.tenant.tenantId,
          input.code.toUpperCase(),
          input.name,
          input.phone ?? null,
          input.email ?? null,
          input.note ?? null,
          input.status ?? TeacherStatus.ACTIVE,
          input.specialties ?? [],
        ],
      );
      const row = result.rows[0];
      await this.audit.recordTenant(client, { ...actor(context), action: 'teacher.created', entityType: 'TEACHER', entityId: row.id, after: snapshot(row) });
      await client.query('COMMIT');
      return serialize(row);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isTeacherCodeConflict(error)) throw new ConflictException('Teacher code already exists');
      throw error;
    } finally { client.release(); }
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
      ['specialties', 'specialties', (value: string[]) => value.map((item) => item.trim()).filter(Boolean)],
      ['status', 'status', (value: TeacherStatus) => value],
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
      const old = await client.query<TeacherRow>(`${selectTeacher} WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [context.tenant.tenantId, id]);
      if (!old.rows[0]) throw new NotFoundException('Teacher not found');
      const result = await client.query<TeacherRow>(
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
           specialties,
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [context.tenant.tenantId, id, ...values],
      );
      const teacher = result.rows[0];
      await this.audit.recordTenant(client, { ...actor(context), action: 'teacher.updated', entityType: 'TEACHER', entityId: id, before: snapshot(old.rows[0]), after: snapshot(teacher) });
      await client.query('COMMIT');
      return serialize(teacher);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isTeacherCodeConflict(error)) throw new ConflictException('Teacher code already exists');
      throw error;
    } finally { client.release(); }
  }
}
