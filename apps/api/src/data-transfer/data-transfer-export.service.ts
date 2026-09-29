import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { assertExportBounds, CSV_ROW_CAP, toCsv } from '../csv.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { EXPORT_CATALOG, IMPORT_TYPES, type ExportFilter, type ImportType } from './data-transfer.catalog.js';

export type ExportQuery = { status?: string; branchId?: string; courseId?: string; classId?: string };

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const FROM_BY_TYPE: Record<ImportType, string> = {
  STUDENTS: 'FROM students s WHERE s.tenant_id=$1',
  TEACHERS: 'FROM teachers t WHERE t.tenant_id=$1',
  COURSES: 'FROM courses c WHERE c.tenant_id=$1',
  COURSE_LEVELS: `FROM course_levels l JOIN courses course ON course.tenant_id=l.tenant_id AND course.id=l.course_id WHERE l.tenant_id=$1`,
  CLASSES: `FROM classes k
    LEFT JOIN courses course ON course.tenant_id=k.tenant_id AND course.id=k.course_id
    LEFT JOIN course_levels level ON level.tenant_id=k.tenant_id AND level.id=k.course_level_id
    LEFT JOIN branches branch ON branch.tenant_id=k.tenant_id AND branch.id=k.branch_id
    LEFT JOIN rooms room ON room.tenant_id=k.tenant_id AND room.id=k.default_room_id
    LEFT JOIN teachers teacher ON teacher.tenant_id=k.tenant_id AND teacher.id=k.primary_teacher_id
    WHERE k.tenant_id=$1`,
  ENROLLMENTS: `FROM enrollments e
    JOIN students s ON s.tenant_id=e.tenant_id AND s.id=e.student_id
    JOIN classes k ON k.tenant_id=e.tenant_id AND k.id=e.class_id
    WHERE e.tenant_id=$1`,
};

function filterCondition(type: ImportType, filter: ExportFilter, param: string): string {
  const column: Record<ImportType, Partial<Record<ExportFilter, string>>> = {
    STUDENTS: { status: 's.status' },
    TEACHERS: { status: 't.status', branchId: `t.id IN (SELECT teacher_id FROM teacher_branches WHERE tenant_id=$1 AND branch_id=${param})` },
    COURSES: { status: 'c.status' },
    COURSE_LEVELS: { status: 'l.status', courseId: 'l.course_id' },
    CLASSES: { status: 'k.status', branchId: 'k.branch_id', courseId: 'k.course_id' },
    ENROLLMENTS: { status: 'e.status', classId: 'e.class_id' },
  };
  const condition = column[type][filter];
  if (!condition) throw new BadRequestException(`Bộ lọc ${filter} không áp dụng cho loại kết xuất này`);
  return condition.includes('IN (') ? condition : `${condition} = ${param}`;
}

// Fixed, allowlisted entity extracts with portable relationship codes.
// Analytical reporting stays under /reports with its own permissions.
@Injectable()
export class DataTransferExportService {
  constructor(private readonly tenantContext: TenantContextService) {}

  types(permissions: string[]) {
    return IMPORT_TYPES
      .filter((type) => permissions.includes(EXPORT_CATALOG[type].readPermission))
      .map((type) => {
        const definition = EXPORT_CATALOG[type];
        return {
          type,
          label: definition.label,
          filters: [...definition.filters],
          statusValues: definition.statusValues ? [...definition.statusValues] : undefined,
          columns: definition.columns.map((column) => ({ key: column.key, label: column.label })),
        };
      });
  }

  async exportCsv(type: string, query: ExportQuery, permissions: string[]) {
    if (!(type in FROM_BY_TYPE)) throw new BadRequestException('Loại kết xuất không được hỗ trợ');
    const definition = EXPORT_CATALOG[type as ImportType];
    if (!permissions.includes(definition.readPermission)) throw new ForbiddenException();

    const { tenant, pool } = this.tenantContext.get();
    const values: unknown[] = [tenant.tenantId];
    const param = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    const conditions: string[] = [];
    for (const key of ['status', 'branchId', 'courseId', 'classId'] as const) {
      const value = query[key];
      if (value === undefined || value === '') continue;
      if (!definition.filters.includes(key)) throw new BadRequestException(`Bộ lọc ${key} không áp dụng cho loại kết xuất này`);
      if (key === 'status') {
        if (!definition.statusValues?.includes(value)) throw new BadRequestException('Giá trị trạng thái không hợp lệ');
      } else {
        if (!ULID.test(value)) throw new BadRequestException('Bộ lọc không hợp lệ');
        await this.assertFilterExists(pool, tenant.tenantId, key, value);
      }
      conditions.push(filterCondition(type as ImportType, key, param(value)));
    }
    const selection = definition.columns.map((column) => `COALESCE(${column.sql}::text, '') AS "${column.key}"`).join(', ');
    const result = await pool.query<Record<string, string>>(
      `SELECT ${selection} ${FROM_BY_TYPE[type as ImportType]} ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''} ORDER BY 1 LIMIT ${CSV_ROW_CAP + 1}`,
      values,
    );
    assertExportBounds(result.rows.length);
    return {
      fileName: `export-${type.toLowerCase()}.csv`,
      csv: toCsv(definition.columns.map((column) => column.key), result.rows.map((row) => definition.columns.map((column) => row[column.key]))),
    };
  }

  // Entity filter IDs are validated inside the tenant: a foreign or unknown
  // ID is rejected instead of silently exporting an empty file.
  private async assertFilterExists(pool: Pool, tenantId: string, key: string, value: string) {
    const table = key === 'branchId' ? 'branches' : key === 'courseId' ? 'courses' : 'classes';
    const result = await pool.query(`SELECT 1 FROM ${table} WHERE tenant_id=$1 AND id=$2`, [tenantId, value]);
    if (!result.rows.length) throw new NotFoundException('Bộ lọc không hợp lệ');
  }
}
