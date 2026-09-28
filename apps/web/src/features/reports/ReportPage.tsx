import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileBarChart } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { getApiErrorMessage } from "@/lib/api";
import { downloadReportCsv, getReport, getReportCatalog, reportCatalogQueryKey, reportQueryKey } from "./api";
import { formatReportValue, reportLink } from "./labels";
import { ReportFiltersBar, reportInitialFilters } from "./ReportFilters";
import type { ReportBreakdown, ReportColumn, ReportFilters, ReportRow } from "./types";

function DataGrid({ columns, rows }: { columns: ReportColumn[]; rows: ReportRow[] }) {
  if (!rows.length) return <div className="px-5 py-8 text-center text-sm text-[#64748b]">Không có dữ liệu trong khoảng đã chọn.</div>;
  return <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-sm"><thead><tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">{columns.map((column) => <th key={column.key} className="h-11 px-4 text-left font-semibold whitespace-nowrap text-[#475569]">{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${index}-${String(row.id ?? row.studentId ?? row.classId ?? row.leadId ?? "row")}`} className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc]"><Cells columns={columns} row={row} /></tr>)}</tbody></table></div>;
}

function Cells({ columns, row }: { columns: ReportColumn[]; row: ReportRow }) {
  return <>{columns.map((column) => { const text = formatReportValue(column.key, row[column.key]); const href = reportLink(row, column.key); return <td key={column.key} className="h-12 px-4 whitespace-nowrap text-[#334155]">{href ? <Link to={href} className="font-medium text-[#2563eb] underline-offset-4 hover:underline">{text}</Link> : text}</td>; })}</>;
}

function Summary({ summary }: { summary: ReportRow }) {
  const entries = Object.entries(summary);
  const scalar = entries.filter(([, value]) => typeof value !== "object" || value === null);
  const nested = entries.filter(([, value]) => value && typeof value === "object");
  return <section aria-labelledby="summary-title"><h2 id="summary-title" className="mb-3 text-base font-semibold text-[#0f172a]">Tổng hợp</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{scalar.map(([key, value]) => <div key={key} className="rounded-lg border border-[#e2e8f0] bg-white p-4"><p className="m-0 text-xs font-medium text-[#64748b]">{humanize(key)}</p><p className="mt-2 mb-0 text-xl font-bold tabular-nums text-[#0f172a]">{formatReportValue(key, value)}</p>{typeof value === "number" && /rate|pct/i.test(key) && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]" aria-hidden="true"><div className="h-full bg-[#2563eb]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>}</div>)}</div>{nested.map(([key, value]) => <div key={key} className="mt-4 overflow-hidden rounded-lg border border-[#e2e8f0] bg-white"><div className="border-b border-[#f1f5f9] px-4 py-3 text-sm font-semibold text-[#0f172a]">{humanize(key)}</div><div className="grid gap-px bg-[#f1f5f9] sm:grid-cols-2 lg:grid-cols-4">{Object.entries(value as Record<string, unknown>).map(([child, childValue]) => <div key={child} className="bg-white px-4 py-3"><p className="m-0 text-xs text-[#64748b]">{humanize(child)}</p><p className="mt-1 mb-0 font-semibold tabular-nums text-[#0f172a]">{formatReportValue(child, childValue)}</p></div>)}</div></div>)}</section>;
}

function humanize(key: string) {
  const known: Record<string, string> = { newStudents: "Học viên mới", enrollmentsInPeriod: "Ghi danh trong kỳ", sessionsFinalized: "Buổi đã chốt", records: "Lượt điểm danh", attended: "Đi học", absent: "Vắng", late: "Đi muộn", attendanceRate: "Tỷ lệ chuyên cần", classes: "Số lớp", operationalEnrollments: "Ghi danh vận hành", avgOccupancyPct: "Lấp đầy trung bình", completedSessions: "Buổi hoàn thành", cancelledSessions: "Buổi hủy", teachers: "Giáo viên", teachingMinutes: "Phút giảng dạy", students: "Học viên", gradedAssessments: "Bài đã chấm", avgScore: "Điểm trung bình", publishedReports: "Báo cáo đã phát hành", cohortSize: "Quy mô cohort", reEnrolled: "Đã ghi danh lại", reEnrollmentRate: "Tỷ lệ ghi danh lại", grossBilledVnd: "Tổng lập hóa đơn", creditNotesVnd: "Giảm trừ", netBilledVnd: "Lập hóa đơn thuần", collectedVnd: "Đã thu", refundedVnd: "Đã hoàn", netCashVnd: "Tiền thuần", outstandingAsOfToVnd: "Còn phải thu", totalOutstandingVnd: "Tổng công nợ", invoices: "Hóa đơn", payments: "Thanh toán", amountVnd: "Tổng tiền", effectiveVnd: "Thu hiệu lực", reversedCount: "Đã đảo ngược", won: "Thắng", lost: "Thua", active: "Đang xử lý", cohortWonRate: "Tỷ lệ thắng cohort", trialsBooked: "Học thử đã đặt", trialsCompleted: "Học thử hoàn thành", trialsNoShow: "Vắng học thử", trialsCancelled: "Học thử đã hủy", branches: "Chi nhánh", events: "Sự kiện vòng đời", statusAtEnd: "Trạng thái cuối kỳ", pipeline: "Pipeline" };
  return known[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
}

function Breakdown({ section }: { section: ReportBreakdown }) {
  return <section><h2 className="mb-3 text-base font-semibold text-[#0f172a]">{section.name}</h2><div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white"><DataGrid columns={section.columns} rows={section.rows} /></div></section>;
}

export function ReportPage() {
  const { key = "" } = useParams();
  const catalog = useQuery({ queryKey: reportCatalogQueryKey(), queryFn: getReportCatalog });
  const report = catalog.data?.find((item) => item.key === key);
  const [filters, setFilters] = useState<ReportFilters>(reportInitialFilters);
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const query = useQuery({ queryKey: reportQueryKey(key, filters), queryFn: () => getReport(key, filters), enabled: Boolean(report) });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? filters.pageSize)));
  const description = report?.description ?? "Báo cáo không tồn tại hoặc tài khoản chưa được cấp quyền.";
  const title = report?.name ?? "Báo cáo";
  const secondary = <Button asChild variant="secondary"><Link to="/reports"><ArrowLeft size={17} aria-hidden="true" />Danh mục</Link></Button>;
  const primary = report ? <Button type="button" variant="secondary" disabled={downloading} onClick={async () => { setDownloading(true); setExportError(undefined); try { await downloadReportCsv(key, filters); } catch (error) { setExportError(getApiErrorMessage(error, "Không thể xuất CSV.")); } finally { setDownloading(false); } }}><Download size={17} aria-hidden="true" />{downloading ? "Đang xuất…" : "Xuất CSV"}</Button> : undefined;

  if (catalog.isPending) return <PageContainer><PageHeader title="Báo cáo" description="Đang tải định nghĩa báo cáo." /><LoadingState label="Đang tải báo cáo" /></PageContainer>;
  if (catalog.isError) return <PageContainer><PageHeader title="Báo cáo" description="Không thể tải định nghĩa báo cáo." /><ErrorState title="Không thể tải báo cáo" message={getApiErrorMessage(catalog.error, "Kiểm tra kết nối và thử lại.")} onRetry={() => void catalog.refetch()} /></PageContainer>;
  if (!report) return <PageContainer><PageHeader title={title} description={description} secondaryActions={secondary} /><EmptyState icon={FileBarChart} title="Không tìm thấy báo cáo" description="Báo cáo có thể không tồn tại hoặc tài khoản chưa có quyền truy cập." /></PageContainer>;

  return <PageContainer>
    <PageHeader title={title} description={description} primaryAction={primary} secondaryActions={secondary} />
    {exportError && <p role="alert" className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b42318]">{exportError}</p>}
    <ReportFiltersBar report={report} value={filters} onApply={setFilters} />
    <div className="mt-6 grid grid-cols-1 gap-6">
      {query.isPending && <LoadingState label="Đang lập báo cáo" />}
      {query.isError && <ErrorState title="Không thể lập báo cáo" message={getApiErrorMessage(query.error, "Kiểm tra bộ lọc và thử lại.")} onRetry={() => void query.refetch()} />}
      {query.data && <>
        <Summary summary={query.data.summary} />
        {(query.data.breakdowns ?? []).map((section) => <Breakdown key={section.name} section={section} />)}
        {query.data.columns.length > 0 && <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="m-0 text-base font-semibold text-[#0f172a]">Chi tiết</h2>{query.data.total !== undefined && <span className="text-sm text-[#64748b]">{new Intl.NumberFormat("vi-VN").format(query.data.total)} dòng</span>}</div><div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white"><DataGrid columns={query.data.columns} rows={query.data.rows} /></div>{query.data.page !== undefined && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm text-[#64748b]">Số dòng<select name="pageSize" className="input min-h-9 w-20" value={filters.pageSize} onChange={(event) => setFilters((current) => ({ ...current, pageSize: Number(event.target.value), page: 1 }))}>{[50, 100, 200].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><div className="flex items-center gap-3"><Button type="button" variant="secondary" size="sm" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Trang trước</Button><span className="text-sm tabular-nums text-[#475569]">Trang {filters.page}/{totalPages}</span><Button type="button" variant="secondary" size="sm" disabled={filters.page >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Trang sau</Button></div></div>}</section>}
        <p className="m-0 text-xs text-[#94a3b8]">Tạo lúc {new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(query.data.generatedAt))} · Múi giờ {query.data.businessTimezone}</p>
      </>}
    </div>
  </PageContainer>;
}
