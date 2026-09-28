import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PERMISSIONS, type Permission } from '../authorization/permissions.js';
import { ControlDatabaseService } from '../database/control-database.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { assertExportBounds, reportCsv } from './report-csv.js';
import {
  REPORT_TIMEZONE,
  validateReportScope,
  type ReportContext,
  type ReportFilterKey,
  type ReportQueryDto,
  type ReportResult,
} from './report-filters.js';
import { attendanceReport, classUtilizationReport, progressReport, reenrollmentReport, studentsEnrollmentsReport, teacherWorkloadReport } from './runners/academic.js';
import { financialSummaryReport, paymentsReport, receivablesAgingReport } from './runners/finance.js';
import { crmPipelineReport } from './runners/growth.js';
import { branchSummaryReport } from './runners/organization.js';

export type ReportCategory = 'ACADEMIC' | 'FINANCE' | 'GROWTH' | 'ORGANIZATION';

type ReportDef = {
  key: string;
  name: string;
  description: string;
  category: ReportCategory;
  requiredPermissions: Permission[];
  allowedFilters: ReportFilterKey[];
  requiresFrom: boolean;
  run: (ctx: ReportContext) => Promise<ReportResult>;
};

const ACADEMIC_FILTERS: ReportFilterKey[] = ['branchId', 'courseId', 'courseLevelId', 'classId', 'studentId', 'status'];

// Fixed catalog — the only reports that exist. No arbitrary query surface.
const REGISTRY: ReportDef[] = [
  {
    key: 'students-enrollments',
    name: 'Học viên & ghi danh',
    description: 'Học viên mới, diễn biến vòng đời ghi danh trong kỳ và trạng thái tới cuối kỳ.',
    category: 'ACADEMIC',
    requiredPermissions: [PERMISSIONS.STUDENT_READ, PERMISSIONS.ENROLLMENT_READ],
    allowedFilters: ACADEMIC_FILTERS,
    requiresFrom: true,
    run: studentsEnrollmentsReport,
  },
  {
    key: 'attendance',
    name: 'Chuyên cần',
    description: 'Tỷ lệ chuyên cần theo buổi học đã chốt (LOCKED), phân theo lớp, học viên, giáo viên, chi nhánh.',
    category: 'ACADEMIC',
    requiredPermissions: [PERMISSIONS.ATTENDANCE_READ],
    allowedFilters: [...ACADEMIC_FILTERS, 'teacherId'],
    requiresFrom: true,
    run: attendanceReport,
  },
  {
    key: 'class-utilization',
    name: 'Sử dụng lớp học',
    description: 'Tỷ lệ lấp đầy sức chứa và tình hình triển khai buổi học của từng lớp.',
    category: 'ACADEMIC',
    requiredPermissions: [PERMISSIONS.CLASS_READ, PERMISSIONS.ENROLLMENT_READ, PERMISSIONS.SCHEDULE_READ],
    allowedFilters: ['branchId', 'courseId', 'courseLevelId', 'classId'],
    requiresFrom: true,
    run: classUtilizationReport,
  },
  {
    key: 'teacher-workload',
    name: 'Khối lượng giảng dạy',
    description: 'Buổi đã dạy, phút/giờ giảng dạy và số lớp của từng giáo viên theo buổi hoàn thành.',
    category: 'ACADEMIC',
    requiredPermissions: [PERMISSIONS.TEACHER_READ, PERMISSIONS.SCHEDULE_READ],
    allowedFilters: ['branchId', 'courseId', 'classId', 'teacherId'],
    requiresFrom: true,
    run: teacherWorkloadReport,
  },
  {
    key: 'progress',
    name: 'Học tập',
    description: 'Điểm trung bình chuẩn hóa từ bài đánh giá đã phát hành và tỷ lệ chuyên cần theo học viên.',
    category: 'ACADEMIC',
    requiredPermissions: [PERMISSIONS.PROGRESS_READ],
    allowedFilters: ['branchId', 'courseId', 'courseLevelId', 'classId', 'studentId'],
    requiresFrom: true,
    run: progressReport,
  },
  {
    key: 'reenrollment',
    name: 'Ghi danh lại',
    description: 'Tỷ lệ cohort lớp hoàn thành trong kỳ được ghi danh lại trước cuối kỳ (không tính chuyển lớp).',
    category: 'ACADEMIC',
    requiredPermissions: [PERMISSIONS.ENROLLMENT_READ, PERMISSIONS.STUDENT_READ],
    allowedFilters: ['branchId', 'courseId', 'courseLevelId', 'classId', 'studentId'],
    requiresFrom: true,
    run: reenrollmentReport,
  },
  {
    key: 'finance',
    name: 'Tổng quan tài chính',
    description: 'Doanh thu lập hóa đơn, đã thu, hoàn tiền và công nợ tới cuối kỳ theo sổ tài chính.',
    category: 'FINANCE',
    requiredPermissions: [PERMISSIONS.BILLING_READ, PERMISSIONS.REPORT_FINANCE],
    allowedFilters: ['studentId'],
    requiresFrom: true,
    run: financialSummaryReport,
  },
  {
    key: 'receivables',
    name: 'Công nợ theo tuổi',
    description: 'Hóa đơn còn phải thu tại thời điểm cuối kỳ, phân nhóm Current / 1-30 / 31-60 / 61+ ngày.',
    category: 'FINANCE',
    requiredPermissions: [PERMISSIONS.BILLING_READ, PERMISSIONS.REPORT_FINANCE],
    allowedFilters: [],
    requiresFrom: false,
    run: receivablesAgingReport,
  },
  {
    key: 'payments',
    name: 'Thanh toán',
    description: 'Danh sách khoản thu trong kỳ với phân bổ, hoàn tiền và trạng thái đảo ngược tại cuối kỳ.',
    category: 'FINANCE',
    requiredPermissions: [PERMISSIONS.BILLING_READ, PERMISSIONS.REPORT_FINANCE],
    allowedFilters: ['studentId', 'status'],
    requiresFrom: true,
    run: paymentsReport,
  },
  {
    key: 'crm',
    name: 'Vận hành CRM',
    description: 'Cohort tiềm năng tạo trong kỳ, trạng thái tới cuối kỳ, học thử và tỷ lệ thắng.',
    category: 'GROWTH',
    requiredPermissions: [PERMISSIONS.CRM_READ],
    allowedFilters: ['branchId', 'source', 'salesOwnerId'],
    requiresFrom: true,
    run: crmPipelineReport,
  },
  {
    key: 'branches',
    name: 'Tổng quan chi nhánh',
    description: 'Chỉ số học vụ, tăng trưởng và tài chính theo chi nhánh (cột hiển thị theo quyền).',
    category: 'ORGANIZATION',
    requiredPermissions: [PERMISSIONS.BRANCH_READ],
    allowedFilters: [],
    requiresFrom: true,
    run: branchSummaryReport,
  },
];

const BY_KEY = new Map(REGISTRY.map((def) => [def.key, def]));

export type ReportCatalogItem = {
  key: string;
  name: string;
  description: string;
  category: ReportCategory;
  filters: ReportFilterKey[];
  maxRangeMonths: number;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly database: ControlDatabaseService,
  ) {}

  catalog(permissions: string[]): ReportCatalogItem[] {
    return REGISTRY.filter((def) => def.requiredPermissions.every((permission) => permissions.includes(permission))).map((def) => ({
      key: def.key,
      name: def.name,
      description: def.description,
      category: def.category,
      filters: def.allowedFilters,
      maxRangeMonths: 24,
    }));
  }

  async run(key: string, query: ReportQueryDto, permissions: string[]) {
    const result = await this.execute(key, query, permissions, 'screen');
    return {
      report: key,
      generatedAt: new Date().toISOString(),
      businessTimezone: REPORT_TIMEZONE,
      filters: { from: query.from ?? null, to: query.to, ...this.providedFilters(key, query) },
      summary: result.summary,
      breakdowns: result.breakdowns ?? null,
      columns: result.columns,
      rows: result.rows,
      ...(result.paginated ? { page: query.page, pageSize: query.pageSize, total: result.total ?? 0 } : {}),
    };
  }

  async exportCsv(key: string, query: ReportQueryDto, permissions: string[], response: Response): Promise<string> {
    const result = await this.execute(key, query, permissions, 'export');
    const csv = reportCsv(result);
    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${key}_${query.from ?? 'asof'}_${query.to}.csv"`,
      'Cache-Control': 'no-store',
    });
    return csv;
  }

  private providedFilters(key: string, query: ReportQueryDto) {
    const def = BY_KEY.get(key);
    if (!def) return {};
    const values = query as unknown as Record<string, unknown>;
    return Object.fromEntries(def.allowedFilters.map((filter) => [filter, values[filter] ?? null]));
  }

  private async execute(key: string, query: ReportQueryDto, permissions: string[], mode: 'screen' | 'export'): Promise<ReportResult> {
    const def = BY_KEY.get(key);
    if (!def) throw new NotFoundException('Report not found');
    // Authorization decides before any tenant query runs.
    if (!def.requiredPermissions.every((permission) => permissions.includes(permission))) throw new ForbiddenException('Access denied');
    const { tenant, pool } = this.tenantContext.get();
    const scope = await validateReportScope(pool, tenant.tenantId, query, key, def.allowedFilters, def.requiresFrom);
    const result = await def.run({ pool, tenantId: tenant.tenantId, scope, permissions, mode, database: this.database });
    if (mode === 'export') assertExportBounds(result.total ?? result.rows.length);
    return result;
  }
}
