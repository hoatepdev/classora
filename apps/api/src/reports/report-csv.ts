import { csvCell } from '../csv.js';

export { assertExportBounds, CSV_ROW_CAP, csvCell, toCsv } from '../csv.js';

const summaryLabels: Record<string, string> = {
  newStudents: 'Học viên mới', enrollmentsInPeriod: 'Ghi danh trong kỳ', events: 'Sự kiện vòng đời', statusAtEnd: 'Trạng thái cuối kỳ',
  sessionsFinalized: 'Buổi đã chốt', records: 'Lượt điểm danh', attended: 'Đi học', absent: 'Vắng', late: 'Đi muộn', attendanceRate: 'Tỷ lệ chuyên cần (%)',
  classes: 'Số lớp', operationalEnrollments: 'Ghi danh vận hành', avgOccupancyPct: 'Lấp đầy trung bình (%)', completedSessions: 'Buổi hoàn thành', cancelledSessions: 'Buổi hủy',
  teachers: 'Giáo viên', teachingMinutes: 'Phút giảng dạy', students: 'Học viên', gradedAssessments: 'Bài đã chấm', avgScore: 'Điểm trung bình (%)', publishedReports: 'Báo cáo đã phát hành',
  cohortSize: 'Quy mô cohort', reEnrolled: 'Đã ghi danh lại', reEnrollmentRate: 'Tỷ lệ ghi danh lại (%)',
  grossBilledVnd: 'Tổng lập hóa đơn (VND)', creditNotesVnd: 'Giảm trừ (VND)', netBilledVnd: 'Lập hóa đơn thuần (VND)', collectedVnd: 'Đã thu (VND)', refundedVnd: 'Đã hoàn (VND)', netCashVnd: 'Tiền thuần (VND)', outstandingAsOfToVnd: 'Còn phải thu cuối kỳ (VND)',
  totalOutstandingVnd: 'Tổng công nợ (VND)', invoices: 'Hóa đơn', payments: 'Thanh toán', amountVnd: 'Tổng tiền (VND)', effectiveVnd: 'Thu hiệu lực (VND)', reversedCount: 'Đã đảo ngược',
  won: 'Thắng', lost: 'Thua', active: 'Đang xử lý', cohortWonRate: 'Tỷ lệ thắng cohort (%)', trialsBooked: 'Học thử đã đặt', trialsCompleted: 'Học thử hoàn thành', trialsNoShow: 'Vắng học thử', trialsCancelled: 'Học thử đã hủy', branches: 'Chi nhánh',
};

function flattenSummary(value: Record<string, unknown>, prefix = ''): unknown[][] {
  return Object.entries(value).flatMap(([key, item]) => {
    const label = prefix ? `${prefix} / ${summaryLabels[key] ?? key}` : summaryLabels[key] ?? key;
    return item && typeof item === 'object' && !Array.isArray(item)
      ? flattenSummary(item as Record<string, unknown>, label)
      : [[label, item]];
  });
}

export function reportCsv(result: {
  summary: Record<string, unknown>;
  breakdowns?: Array<{ name: string; columns: Array<{ key: string; label: string }>; rows: Array<Record<string, unknown>> }>;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
}) {
  const tables: unknown[][] = [['Tổng hợp'], ['Chỉ số', 'Giá trị'], ...flattenSummary(result.summary)];
  for (const breakdown of result.breakdowns ?? []) {
    tables.push([], [breakdown.name], breakdown.columns.map((column) => column.label));
    tables.push(...breakdown.rows.map((row) => breakdown.columns.map((column) => row[column.key] ?? '')));
  }
  if (result.columns.length) {
    tables.push([], ['Chi tiết'], result.columns.map((column) => column.label));
    tables.push(...result.rows.map((row) => result.columns.map((column) => row[column.key] ?? '')));
  }
  return `﻿${tables.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

