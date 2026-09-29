import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import type { CreateClassDto } from '../classes/dto/create-class.dto.js';
import { ClassesService } from '../classes/classes.service.js';
import type { CreateCourseLevelDto } from '../courses/dto/create-course-level.dto.js';
import type { CreateCourseDto } from '../courses/dto/create-course.dto.js';
import { CoursesService } from '../courses/courses.service.js';
import type { CreateEnrollmentDto } from '../enrollments/dto/create-enrollment.dto.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import type { CreateStudentDto } from '../students/dto/create-student.dto.js';
import { StudentsService } from '../students/students.service.js';
import type { CreateTeacherDto } from '../teachers/dto/create-teacher.dto.js';
import { TeachersService } from '../teachers/teachers.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { toCsv } from '../csv.js';
import { IMPORT_CATALOG, IMPORT_TYPES, importTypeDefinition, type ImportType, type ImportTypeDefinition } from './data-transfer.catalog.js';
import { parseImportCsv, suggestMapping } from './data-transfer.parser.js';
import { buildReverseMap, ImportRowValidator, type ImportMapping, type RowIssue, type StagedRow, type ValidatedRow } from './import-validation.js';

type BatchFailure = { code: string; message: string; rowNumber?: number };

type BatchRow = QueryResultRow & {
  id: string;
  tenantId: string;
  type: ImportType;
  status: 'UPLOADED' | 'VALIDATED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  fileName: string;
  fileSha256: string;
  mapping: ImportMapping;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  failure: BatchFailure | null;
  createdByUserId: string | null;
  createdByMembershipId: string | null;
  createdByName: string | null;
  validatedAt: Date | null;
  confirmedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const selectBatch = `SELECT id, tenant_id AS "tenantId", type, status, file_name AS "fileName", file_sha256 AS "fileSha256",
  mapping, total_rows AS "totalRows", valid_rows AS "validRows", invalid_rows AS "invalidRows", imported_rows AS "importedRows",
  failure, created_by_user_id AS "createdByUserId", created_by_membership_id AS "createdByMembershipId", created_by_name AS "createdByName",
  validated_at AS "validatedAt", confirmed_at AS "confirmedAt", completed_at AS "completedAt", cancelled_at AS "cancelledAt",
  created_at AS "createdAt", updated_at AS "updatedAt" FROM import_batches`;

function serializeBatch(row: BatchRow) {
  return {
    ...row,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function pgConstraint(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'constraint' in error ? String(error.constraint) : undefined;
}

function classifyConfirmError(error: unknown): BatchFailure {
  const message = error instanceof Error ? error.message : 'Import thất bại';
  const constraint = pgConstraint(error);
  if (constraint?.includes('_key')) return { code: 'ALREADY_EXISTS', message: 'Mã bản ghi đã tồn tại (xung đột dữ liệu)' };
  const name = (error as { name?: string }).name;
  const status = (error as { status?: number }).status;
  if (name === 'NotFoundException' || status === 404) return { code: 'NOT_FOUND', message };
  if (name === 'BadRequestException' || status === 400) return { code: 'INVALID_FORMAT', message };
  if (name === 'ConflictException' || status === 409) {
    if (/capacity|sĩ số/i.test(message)) return { code: 'CAPACITY_CONFLICT', message };
    if (/already exists|đã tồn tại|already has|đã có/i.test(message)) return { code: 'ALREADY_EXISTS', message };
    return { code: 'INVALID_RELATION', message };
  }
  return { code: 'IMPORT_FAILED', message: 'Import thất bại do xung đột dữ liệu; hãy xác thực lại lô' };
}

const CHUNK = 500;

@Injectable()
export class DataTransferImportService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly students: StudentsService,
    private readonly teachers: TeachersService,
    private readonly courses: CoursesService,
    private readonly classes: ClassesService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  types(permissions: string[]) {
    return IMPORT_TYPES
      .filter((type) => permissions.includes(IMPORT_CATALOG[type].writePermission))
      .sort((a, b) => IMPORT_CATALOG[a].order - IMPORT_CATALOG[b].order)
      .map((type) => {
        const definition = IMPORT_CATALOG[type];
        return {
          type,
          label: definition.label,
          dependsOn: definition.dependsOn,
          identityFields: [...definition.identityFields],
          fields: definition.fields.map(({ key, label, required, type: fieldType, allowedValues, example }) => ({ key, label, required, type: fieldType, allowedValues: allowedValues ? [...allowedValues] : undefined, example })),
        };
      });
  }

  template(type: string, permissions: string[]) {
    const definition = importTypeDefinition(type);
    this.requireTypePermission(definition, permissions);
    return toCsv(definition.fields.map((field) => field.key), []);
  }

  async upload(type: string, file: { originalname?: string; buffer: Buffer }, permissions: string[]) {
    const definition = importTypeDefinition(type);
    this.requireTypePermission(definition, permissions);
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu tệp CSV');
    const fileName = (file.originalname ?? '').trim();
    if (!fileName || fileName.length > 255) throw new BadRequestException('Tên tệp không hợp lệ');
    if (!/\.csv$/i.test(fileName)) throw new BadRequestException('Tệp phải có phần mở rộng .csv');

    const parsed = parseImportCsv(file.buffer);
    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const mapping: ImportMapping = {
      sourceHeaders: parsed.headers,
      fields: suggestMapping(parsed.headers, definition.fields.map((field) => field.key)),
    };
    const { tenant, pool, actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
    const duplicate = await pool.query(
      'SELECT 1 FROM import_batches WHERE tenant_id=$1 AND file_sha256=$2 LIMIT 1',
      [tenant.tenantId, fileSha256],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = ulid();
      await client.query(
        `INSERT INTO import_batches (id, tenant_id, type, status, file_name, file_sha256, mapping, total_rows, created_by_user_id, created_by_membership_id, created_by_name)
         VALUES ($1,$2,$3,'UPLOADED',$4,$5,$6::jsonb,$7,$8,$9,$10)`,
        [id, tenant.tenantId, definition.type, fileName, fileSha256, JSON.stringify(mapping), parsed.rows.length, actorUserId ?? null, actorMembershipId ?? null, actorName ?? null],
      );
      await this.insertStagedRows(client, tenant.tenantId, id, parsed.headers, parsed.rows);
      await this.audit.recordTenant(client, {
        tenantId: tenant.tenantId, actorUserId, actorMembershipId, actorName, actorEmail, requestId,
        action: 'data_import.created', entityType: 'IMPORT_BATCH', entityId: id,
        metadata: { type: definition.type, totalRows: parsed.rows.length, fileSha256 },
      });
      await client.query('COMMIT');
      const batch = await this.get(id, permissions);
      return { ...batch, mapping, duplicateWarning: duplicate.rows.length > 0 };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertStagedRows(client: PoolClient, tenantId: string, batchId: string, headers: string[], rows: string[][]) {
    for (let offset = 0; offset < rows.length; offset += CHUNK) {
      const chunk = rows.slice(offset, offset + CHUNK).map((cells, index) => ({
        id: ulid(),
        row_number: offset + index + 1,
        source_data: Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? ''])),
      }));
      await client.query(
        `INSERT INTO import_rows (id, tenant_id, batch_id, row_number, source_data)
         SELECT d.id, $1, $2, d.row_number, d.source_data FROM jsonb_to_recordset($3::jsonb) AS d(id char(26), row_number integer, source_data jsonb)`,
        [tenantId, batchId, JSON.stringify(chunk)],
      );
    }
  }

  async list(query: { page: number; pageSize: number }, permissions: string[]) {
    const { tenant, pool } = this.tenantContext.get();
    const allowed = IMPORT_TYPES.filter((type) => permissions.includes(IMPORT_CATALOG[type].writePermission));
    if (!allowed.length) return { data: [], total: 0, page: query.page, pageSize: query.pageSize };
    const total = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM import_batches WHERE tenant_id=$1 AND type = ANY($2::text[])', [tenant.tenantId, allowed]);
    const result = await pool.query<BatchRow>(
      `${selectBatch} WHERE tenant_id=$1 AND type = ANY($2::text[]) ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [tenant.tenantId, allowed, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { data: result.rows.map(serializeBatch), total: Number(total.rows[0].count), page: query.page, pageSize: query.pageSize };
  }

  private async loadBatch(scope: { query: PoolClient['query'] }, tenantId: string, id: string, lock: boolean): Promise<BatchRow> {
    const result = await scope.query<BatchRow>(
      `${selectBatch} WHERE tenant_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException('Import batch not found');
    return result.rows[0];
  }

  async get(id: string, permissions: string[]) {
    const { tenant, pool } = this.tenantContext.get();
    const batch = await this.loadBatch(pool, tenant.tenantId, id, false);
    this.requireTypePermission(IMPORT_CATALOG[batch.type], permissions);
    return serializeBatch(batch);
  }

  async rows(id: string, query: { page: number; pageSize: number; filter: 'ALL' | 'ERRORS' | 'WARNINGS' | 'VALID' }, permissions: string[]) {
    const { tenant, pool } = this.tenantContext.get();
    const batch = await this.loadBatch(pool, tenant.tenantId, id, false);
    this.requireTypePermission(IMPORT_CATALOG[batch.type], permissions);
    const conditions: string[] = ['r.tenant_id=$1', 'r.batch_id=$2'];
    if (query.filter === 'ERRORS') conditions.push("(r.errors <> '[]'::jsonb OR r.status = 'FAILED')");
    if (query.filter === 'WARNINGS') conditions.push("r.warnings <> '[]'::jsonb");
    if (query.filter === 'VALID') conditions.push("r.status = 'VALID'");
    const where = conditions.join(' AND ');
    const total = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM import_rows r WHERE ${where}`, [tenant.tenantId, id]);
    const result = await pool.query(
      `SELECT r.id, r.row_number AS "rowNumber", r.source_data AS "sourceData", r.normalized_data AS "normalizedData",
        r.status, r.action, r.errors, r.warnings, r.target_entity_id AS "targetEntityId", r.source_key AS "sourceKey"
       FROM import_rows r WHERE ${where} ORDER BY r.row_number LIMIT $3 OFFSET $4`,
      [tenant.tenantId, id, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { data: result.rows, total: Number(total.rows[0].count), page: query.page, pageSize: query.pageSize, filter: query.filter };
  }

  async updateMapping(id: string, fields: Record<string, string | null>, permissions: string[]) {
    const definitionOf = (type: ImportType) => IMPORT_CATALOG[type];
    const { tenant, pool, actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const batch = await this.loadBatch(client, tenant.tenantId, id, true);
      const definition = definitionOf(batch.type);
      this.requireTypePermission(definition, permissions);
      if (batch.status !== 'UPLOADED' && batch.status !== 'VALIDATED') {
        throw new ConflictException(`Không thể sửa ánh xạ của lô ${batch.status}`);
      }
      const knownFields = new Set(definition.fields.map((field) => field.key));
      const next: Record<string, string | null> = {};
      for (const header of batch.mapping.sourceHeaders) next[header] = null;
      const usedTargets = new Set<string>();
      for (const [header, target] of Object.entries(fields)) {
        if (!batch.mapping.sourceHeaders.includes(header)) throw new BadRequestException(`Cột nguồn không tồn tại: ${header}`);
        if (target === null || target === undefined) { next[header] = null; continue; }
        if (!knownFields.has(target)) throw new BadRequestException(`Trường đích không hợp lệ: ${target}`);
        if (usedTargets.has(target)) throw new BadRequestException(`Trường ${target} được ánh xạ từ nhiều cột`);
        usedTargets.add(target);
        next[header] = target;
      }
      for (const field of definition.fields) {
        if (field.required && ![...Object.values(next)].includes(field.key)) {
          throw new BadRequestException(`Thiếu ánh xạ cho trường bắt buộc ${field.key}`);
        }
      }
      const changed = JSON.stringify(next) !== JSON.stringify(batch.mapping.fields);
      if (changed) {
        const merged: ImportMapping = { sourceHeaders: batch.mapping.sourceHeaders, fields: next };
        await client.query(
          `UPDATE import_batches SET mapping=$3::jsonb, status='UPLOADED', valid_rows=0, invalid_rows=0, imported_rows=0,
            validated_at=NULL, confirmed_at=NULL, completed_at=NULL, failure=NULL, updated_at=CURRENT_TIMESTAMP
           WHERE tenant_id=$1 AND id=$2`,
          [tenant.tenantId, id, JSON.stringify(merged)],
        );
        await client.query(
          `UPDATE import_rows SET normalized_data=NULL, status='PENDING', action='CREATE', errors='[]'::jsonb, warnings='[]'::jsonb,
            target_entity_id=NULL, source_key=NULL, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND batch_id=$2`,
          [tenant.tenantId, id],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return this.get(id, permissions);
  }

  private async runValidation(client: PoolClient, tenantId: string, definition: ImportTypeDefinition, mapping: ImportMapping, staged: StagedRow[]): Promise<ValidatedRow[]> {
    const reverse = buildReverseMap(mapping);
    for (const field of definition.fields) {
      if (field.required && !reverse.has(field.key)) throw new BadRequestException(`Thiếu ánh xạ cho trường bắt buộc ${field.key}`);
    }
    const validator = new ImportRowValidator(client, tenantId, definition);
    await validator.load(staged, reverse);
    const inFileKeys = new Map<string, number>();
    const validated = staged.map((row) => validator.validateRow(row, reverse, inFileKeys));
    for (const [rowNumber, error] of validator.capacityDemandErrors(validated)) {
      const row = validated.find((item) => item.rowNumber === rowNumber)!;
      row.errors.push(error);
      row.status = 'INVALID';
    }
    return validated;
  }

  private async persistValidation(client: PoolClient, tenantId: string, batchId: string, validated: ValidatedRow[]) {
    for (let offset = 0; offset < validated.length; offset += CHUNK) {
      const chunk = validated.slice(offset, offset + CHUNK).map((row) => ({
        row_number: row.rowNumber,
        normalized: row.normalized,
        status: row.status,
        action: row.status === 'VALID' ? 'CREATE' : 'ERROR',
        errors: row.errors,
        warnings: row.warnings,
        source_key: row.sourceKey || null,
      }));
      await client.query(
        `UPDATE import_rows r SET normalized_data=d.normalized, status=d.status, action=d.action, errors=d.errors,
          warnings=d.warnings, source_key=d.source_key, updated_at=CURRENT_TIMESTAMP
         FROM jsonb_to_recordset($3::jsonb) AS d(row_number integer, normalized jsonb, status text, action text, errors jsonb, warnings jsonb, source_key text)
         WHERE r.tenant_id=$1 AND r.batch_id=$2 AND r.row_number=d.row_number`,
        [tenantId, batchId, JSON.stringify(chunk)],
      );
    }
  }

  async validate(id: string, permissions: string[]) {
    const { tenant, pool, actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const batch = await this.loadBatch(client, tenant.tenantId, id, true);
      const definition = IMPORT_CATALOG[batch.type];
      this.requireTypePermission(definition, permissions);
      if (batch.status !== 'UPLOADED' && batch.status !== 'VALIDATED') {
        throw new ConflictException(`Không thể xác thực lô ${batch.status}`);
      }
      const staged = await this.loadStagedRows(client, tenant.tenantId, id);
      const validated = await this.runValidation(client, tenant.tenantId, definition, batch.mapping, staged);
      const validRows = validated.filter((row) => row.status === 'VALID').length;
      const invalidRows = validated.length - validRows;
      await this.persistValidation(client, tenant.tenantId, id, validated);
      await client.query(
        `UPDATE import_batches SET status='VALIDATED', valid_rows=$3, invalid_rows=$4, imported_rows=0, validated_at=CURRENT_TIMESTAMP, failure=NULL, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
        [tenant.tenantId, id, validRows, invalidRows],
      );
      await this.audit.recordTenant(client, {
        tenantId: tenant.tenantId, actorUserId, actorMembershipId, actorName, actorEmail, requestId,
        action: 'data_import.validated', entityType: 'IMPORT_BATCH', entityId: id,
        metadata: { type: batch.type, totalRows: validated.length, validRows, invalidRows },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return this.get(id, permissions);
  }

  private async loadStagedRows(client: PoolClient, tenantId: string, batchId: string): Promise<StagedRow[]> {
    const result = await client.query<{ rowNumber: number; sourceData: Record<string, string> }>(
      'SELECT row_number AS "rowNumber", source_data AS "sourceData" FROM import_rows WHERE tenant_id=$1 AND batch_id=$2 ORDER BY row_number',
      [tenantId, batchId],
    );
    return result.rows;
  }

  async confirm(id: string, permissions: string[]) {
    const { tenant, pool, actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const batch = await this.loadBatch(client, tenant.tenantId, id, true);
      const definition = IMPORT_CATALOG[batch.type];
      this.requireTypePermission(definition, permissions);
      if (batch.status === 'COMPLETED') {
        await client.query('COMMIT');
        return this.get(id, permissions);
      }
      if (batch.status !== 'VALIDATED') throw new ConflictException(`Không thể xác nhận lô ${batch.status}`);
      if (batch.invalidRows > 0) throw new ConflictException('Lô còn dòng lỗi; hãy sửa tệp và xác thực lại');

      const staged = await this.loadStagedRows(client, tenant.tenantId, id);
      const validated = await this.runValidation(client, tenant.tenantId, definition, batch.mapping, staged);
      const invalid = validated.find((row) => row.status === 'INVALID');
      if (invalid) {
        const issue: RowIssue = invalid.errors[0] ?? { code: 'IMPORT_FAILED', field: '', message: 'Dữ liệu đã thay đổi' };
        await this.failBatch(client, tenant.tenantId, batch.id, definition.type, { ...issue, rowNumber: invalid.rowNumber }, invalid.rowNumber, { actorUserId, actorMembershipId, actorName, actorEmail, requestId });
        await client.query('COMMIT');
        throw new ConflictException(`Dòng ${invalid.rowNumber}: ${issue.message}`);
      }

      if (definition.type === 'ENROLLMENTS') {
        const classIds = [...new Set(validated.map((row) => row.resolved.classId).filter((classId): classId is string => Boolean(classId)))].sort();
        if (classIds.length) {
          await client.query('SELECT id FROM classes WHERE tenant_id=$1 AND id=ANY($2::char(26)[]) ORDER BY id FOR UPDATE', [tenant.tenantId, classIds]);
        }
      }

      await client.query('SAVEPOINT confirm_write');
      let failedRowNumber: number | undefined;
      try {
        const imported: Array<{ rowNumber: number; targetId: string }> = [];
        for (const row of validated) {
          failedRowNumber = row.rowNumber;
          const targetId = await this.writeRow(client, definition, row);
          imported.push({ rowNumber: row.rowNumber, targetId });
        }
        failedRowNumber = undefined;
        await client.query(
          `UPDATE import_rows r SET status='IMPORTED', target_entity_id=d.target_id, updated_at=CURRENT_TIMESTAMP
           FROM jsonb_to_recordset($3::jsonb) AS d(row_number integer, target_id char(26))
           WHERE r.tenant_id=$1 AND r.batch_id=$2 AND r.row_number=d.row_number`,
          [tenant.tenantId, id, JSON.stringify(imported)],
        );
        await client.query(
          `UPDATE import_batches SET status='COMPLETED', imported_rows=$3, confirmed_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
          [tenant.tenantId, id, imported.length],
        );
        await this.audit.recordTenant(client, {
          tenantId: tenant.tenantId, actorUserId, actorMembershipId, actorName, actorEmail, requestId,
          action: 'data_import.completed', entityType: 'IMPORT_BATCH', entityId: id,
          metadata: { type: definition.type, totalRows: imported.length, importedRows: imported.length },
        });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT confirm_write').catch(() => undefined);
        const failure = classifyConfirmError(error);
        await this.failBatch(client, tenant.tenantId, id, definition.type, failedRowNumber ? { ...failure, rowNumber: failedRowNumber } : failure, failedRowNumber, { actorUserId, actorMembershipId, actorName, actorEmail, requestId });
        await client.query('COMMIT');
        throw new ConflictException(failedRowNumber ? `Dòng ${failedRowNumber}: ${failure.message}` : failure.message);
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return this.get(id, permissions);
  }

  private async writeRow(client: PoolClient, definition: ImportTypeDefinition, row: ValidatedRow): Promise<string> {
    switch (definition.type) {
      case 'STUDENTS': {
        const student = await this.students.createInTransaction(client, row.dto as unknown as CreateStudentDto);
        return student.id;
      }
      case 'TEACHERS': {
        const teacher = await this.teachers.createInTransaction(client, row.dto as unknown as CreateTeacherDto);
        if (row.resolved.branchIds?.length) await this.teachers.replaceBranchesInTransaction(client, teacher.id, row.resolved.branchIds);
        return teacher.id;
      }
      case 'COURSES': {
        const course = await this.courses.createInTransaction(client, row.dto as unknown as CreateCourseDto);
        return course.id;
      }
      case 'COURSE_LEVELS': {
        const level = await this.courses.createLevelInTransaction(client, row.resolved.courseId!, row.dto as unknown as CreateCourseLevelDto);
        return level.id;
      }
      case 'CLASSES': {
        return this.classes.createInTransaction(client, row.dto as unknown as CreateClassDto);
      }
      case 'ENROLLMENTS': {
        const enrollment = await this.enrollments.createInTransaction(client, row.dto as unknown as CreateEnrollmentDto);
        return enrollment.id;
      }
    }
  }

  private async failBatch(
    client: PoolClient,
    tenantId: string,
    batchId: string,
    type: ImportType,
    failure: BatchFailure,
    rowNumber: number | undefined,
    actor: { actorUserId?: string; actorMembershipId?: string; actorName?: string; actorEmail?: string; requestId?: string },
  ) {
    if (rowNumber !== undefined) {
      await client.query(
        `UPDATE import_rows SET status='FAILED', action='ERROR', errors=$4::jsonb, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND batch_id=$2 AND row_number=$3`,
        [tenantId, batchId, rowNumber, JSON.stringify([failure])],
      );
    }
    await client.query(
      `UPDATE import_batches SET status='FAILED', imported_rows=0, failure=$3::jsonb, confirmed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
      [tenantId, batchId, JSON.stringify(failure)],
    );
    await this.audit.recordTenant(client, {
      tenantId, ...actor,
      action: 'data_import.failed', entityType: 'IMPORT_BATCH', entityId: batchId,
      metadata: { type, failure },
    });
  }

  async cancel(id: string, permissions: string[]) {
    const { tenant, pool, actorUserId, actorMembershipId, actorName, actorEmail, requestId } = this.tenantContext.get();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const batch = await this.loadBatch(client, tenant.tenantId, id, true);
      this.requireTypePermission(IMPORT_CATALOG[batch.type], permissions);
      if (batch.status !== 'UPLOADED' && batch.status !== 'VALIDATED') {
        throw new ConflictException(`Không thể hủy lô ${batch.status}`);
      }
      await client.query(`UPDATE import_batches SET status='CANCELLED', cancelled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`, [tenant.tenantId, id]);
      await this.audit.recordTenant(client, {
        tenantId: tenant.tenantId, actorUserId, actorMembershipId, actorName, actorEmail, requestId,
        action: 'data_import.cancelled', entityType: 'IMPORT_BATCH', entityId: id,
        metadata: { type: batch.type },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return this.get(id, permissions);
  }

  async errorCsv(id: string, permissions: string[]) {
    const { tenant, pool } = this.tenantContext.get();
    const batch = await this.loadBatch(pool, tenant.tenantId, id, false);
    this.requireTypePermission(IMPORT_CATALOG[batch.type], permissions);
    const result = await pool.query<{ rowNumber: number; sourceKey: string | null; errors: RowIssue[] }>(
      `SELECT row_number AS "rowNumber", source_key AS "sourceKey", errors FROM import_rows
       WHERE tenant_id=$1 AND batch_id=$2 AND (errors <> '[]'::jsonb OR status='FAILED') ORDER BY row_number`,
      [tenant.tenantId, id],
    );
    const lines: unknown[][] = [];
    for (const row of result.rows) {
      for (const error of row.errors) lines.push([row.rowNumber, row.sourceKey ?? '', error.field, error.code, error.message]);
    }
    return { fileName: `import-errors-${id}.csv`, csv: toCsv(['rowNumber', 'sourceKey', 'field', 'errorCode', 'message'], lines) };
  }

  private requireTypePermission(definition: ImportTypeDefinition, permissions: string[]) {
    if (!permissions.includes(definition.writePermission)) throw new ForbiddenException();
  }
}
