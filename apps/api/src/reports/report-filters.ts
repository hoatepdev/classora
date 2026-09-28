import { BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import { CSV_ROW_CAP } from './report-csv.js';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ZONE_OFFSET = '+07:00'; // Asia/Ho_Chi_Minh has been fixed UTC+7 since 1976 — no DST.

export const REPORT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const MAX_RANGE_MONTHS = 24;

export class ReportQueryDto {
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  from?: string;

  @IsDateString({ strict: true, strictSeparator: true })
  to!: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 50;

  @IsOptional()
  @Matches(ulidPattern)
  branchId?: string;

  @IsOptional()
  @Matches(ulidPattern)
  courseId?: string;

  @IsOptional()
  @Matches(ulidPattern)
  courseLevelId?: string;

  @IsOptional()
  @Matches(ulidPattern)
  classId?: string;

  @IsOptional()
  @Matches(ulidPattern)
  teacherId?: string;

  @IsOptional()
  @Matches(ulidPattern)
  studentId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  salesOwnerId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  status?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  source?: string;
}

export type ReportFilterKey = 'branchId' | 'courseId' | 'courseLevelId' | 'classId' | 'teacherId' | 'studentId' | 'salesOwnerId' | 'status' | 'source';

export type ReportScope = {
  from: string | null;
  to: string;
  // Half-open [fromTs, toTs) in Asia/Ho_Chi_Minh local time for TIMESTAMPTZ columns.
  fromTs: string | null;
  toTs: string;
  page: number;
  pageSize: number;
  filters: Partial<Record<ReportFilterKey, string>>;
};

export function addDay(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function exceedsMonthLimit(from: string, to: string, months: number): boolean {
  const limit = new Date(`${from}T00:00:00Z`);
  limit.setUTCMonth(limit.getUTCMonth() + months);
  return new Date(`${to}T00:00:00Z`).getTime() > limit.getTime();
}

const ENROLLMENT_STATUSES = ['PENDING', 'TRIAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'WITHDRAWN', 'CANCELLED'];
const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'ONLINE', 'MAKEUP'];
const PAYMENT_STATUSES = ['RECORDED', 'REVERSED'];
const LEAD_SOURCES = ['REFERRAL', 'FACEBOOK', 'GOOGLE', 'WALK_IN', 'EXISTING_CUSTOMER', 'OTHER'];

export function allowedStatusValues(reportKey: string): string[] {
  if (reportKey === 'attendance') return ATTENDANCE_STATUSES;
  if (reportKey === 'students-enrollments') return ENROLLMENT_STATUSES;
  if (reportKey === 'payments') return PAYMENT_STATUSES;
  return [];
}

export function allowedSourceValues(reportKey: string): string[] {
  if (reportKey === 'crm') return LEAD_SOURCES;
  return [];
}

// Central range + relationship validation. All lookups are tenant-scoped, so a
// cross-tenant id reads as not-found and is rejected without leakage.
export async function validateReportScope(
  pool: Pool,
  tenantId: string,
  query: ReportQueryDto,
  reportKey: string,
  allowedFilters: ReportFilterKey[],
  requiresFrom: boolean,
): Promise<ReportScope> {
  const from = query.from ?? null;
  const to = query.to;
  if (requiresFrom && !from) throw new BadRequestException('from is required');
  if (from) {
    if (from > to) throw new BadRequestException('from must not be after to');
    if (exceedsMonthLimit(from, to, MAX_RANGE_MONTHS)) throw new BadRequestException(`Khoảng thời gian tối đa ${MAX_RANGE_MONTHS} tháng`);
  }

  const provided = Object.entries({
    branchId: query.branchId,
    courseId: query.courseId,
    courseLevelId: query.courseLevelId,
    classId: query.classId,
    teacherId: query.teacherId,
    studentId: query.studentId,
    salesOwnerId: query.salesOwnerId,
    status: query.status,
    source: query.source,
  }).filter(([, value]) => value !== undefined) as [ReportFilterKey, string][];

  for (const [key, value] of provided) {
    if (!allowedFilters.includes(key)) throw new BadRequestException(`Bộ lọc ${key} không áp dụng cho báo cáo này`);
    if (key === 'status') {
      const allowed = allowedStatusValues(reportKey);
      if (allowed.length === 0 || !allowed.includes(value)) throw new BadRequestException('Giá trị status không hợp lệ');
    }
    if (key === 'source') {
      const allowed = allowedSourceValues(reportKey);
      if (allowed.length === 0 || !allowed.includes(value)) throw new BadRequestException('Giá trị source không hợp lệ');
    }
  }

  const filters = Object.fromEntries(provided) as Partial<Record<ReportFilterKey, string>>;
  await validateRelationships(pool, tenantId, query);

  return {
    from,
    to,
    fromTs: from ? `${from}T00:00:00${ZONE_OFFSET}` : null,
    toTs: `${addDay(to, 1)}T00:00:00${ZONE_OFFSET}`,
    page: query.page,
    pageSize: query.pageSize,
    filters,
  };
}

async function validateRelationships(pool: Pool, tenantId: string, query: ReportQueryDto) {
  const { branchId, courseId, courseLevelId, classId, teacherId, studentId } = query;
  if (!branchId && !courseId && !courseLevelId && !classId && !teacherId && !studentId) return;

  const result = await pool.query<{
    branchMissing: boolean;
    courseMissing: boolean;
    levelMissing: boolean;
    levelCourseMismatch: boolean;
    classMissing: boolean;
    classBranchMismatch: boolean;
    classCourseMismatch: boolean;
    classLevelMismatch: boolean;
    teacherMissing: boolean;
    studentMissing: boolean;
  }>(
    `SELECT
      $2::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE tenant_id=$1 AND id=$2) AS "branchMissing",
      $3::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM courses WHERE tenant_id=$1 AND id=$3) AS "courseMissing",
      $4::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM course_levels WHERE tenant_id=$1 AND id=$4) AS "levelMissing",
      $4::text IS NOT NULL AND $3::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM course_levels WHERE tenant_id=$1 AND id=$4 AND course_id=$3) AS "levelCourseMismatch",
      $5::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes WHERE tenant_id=$1 AND id=$5) AS "classMissing",
      $5::text IS NOT NULL AND $2::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes WHERE tenant_id=$1 AND id=$5 AND branch_id=$2) AS "classBranchMismatch",
      $5::text IS NOT NULL AND $3::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes WHERE tenant_id=$1 AND id=$5 AND course_id=$3) AS "classCourseMismatch",
      $5::text IS NOT NULL AND $4::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes WHERE tenant_id=$1 AND id=$5 AND course_level_id=$4) AS "classLevelMismatch",
      $6::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM teachers WHERE tenant_id=$1 AND id=$6) AS "teacherMissing",
      $7::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students WHERE tenant_id=$1 AND id=$7) AS "studentMissing"`,
    [tenantId, branchId ?? null, courseId ?? null, courseLevelId ?? null, classId ?? null, teacherId ?? null, studentId ?? null],
  );
  const row = result.rows[0];
  if (!row) throw new BadRequestException('Bộ lọc không hợp lệ');
  const messages: Record<string, string> = {
    branchMissing: 'Chi nhánh không tồn tại',
    courseMissing: 'Khóa học không tồn tại',
    levelMissing: 'Cấp độ không tồn tại',
    levelCourseMismatch: 'Cấp độ không thuộc khóa học đã chọn',
    classMissing: 'Lớp học không tồn tại',
    classBranchMismatch: 'Lớp học không thuộc chi nhánh đã chọn',
    classCourseMismatch: 'Lớp học không thuộc khóa học đã chọn',
    classLevelMismatch: 'Lớp học không thuộc cấp độ đã chọn',
    teacherMissing: 'Giáo viên không tồn tại',
    studentMissing: 'Học viên không tồn tại',
  };
  for (const [key, message] of Object.entries(messages)) {
    if (row[key as keyof typeof row]) throw new BadRequestException(message);
  }
}

export const serialize = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : v]));

export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, unknown>;
export type ReportBreakdown = { name: string; columns: ReportColumn[]; rows: ReportRow[] };
export type ReportResult = {
  summary: ReportRow;
  breakdowns?: ReportBreakdown[];
  columns: ReportColumn[];
  rows: ReportRow[];
  paginated: boolean;
  total?: number;
};
export type ReportContext = {
  pool: Pool;
  tenantId: string;
  scope: ReportScope;
  permissions: string[];
  mode: 'screen' | 'export';
  database: import('../database/control-database.service.js').ControlDatabaseService;
};

export function pageParams(ctx: ReportContext) {
  return ctx.mode === 'export'
    ? { limit: CSV_ROW_CAP + 1, offset: 0 }
    : { limit: ctx.scope.pageSize, offset: (ctx.scope.page - 1) * ctx.scope.pageSize };
}

export const rate = (attended: number, total: number): number | null =>
  total === 0 ? null : Math.round((attended * 10000) / total) / 100;

export const round2 = (value: number): number => Math.round(value * 100) / 100;
