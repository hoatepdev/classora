import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, History, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can, currentMembership } from "@/auth/permissions";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api";
import { downloadEntityExport, exportTypesQueryKey, getExportTypes, getImportHistory, getImportTypes, importHistoryQueryKey, importTypesQueryKey } from "./api";
import { ImportWizard } from "./ImportWizard";
import type { DataTransferType, ExportTypeDefinition, ImportBatch } from "./types";

type Tab = "IMPORT" | "EXPORT";

const status: Record<ImportBatch["status"], { label: string; variant: "info" | "active" | "danger" | "inactive" }> = {
  UPLOADED: { label: "Đã tải lên", variant: "info" },
  VALIDATED: { label: "Đã xác thực", variant: "info" },
  COMPLETED: { label: "Hoàn tất", variant: "active" },
  FAILED: { label: "Thất bại", variant: "danger" },
  CANCELLED: { label: "Đã hủy", variant: "inactive" },
};

function ExportWorkspace({ types }: { types: ExportTypeDefinition[] }) {
  const [type, setType] = useState<DataTransferType>(types[0]?.type ?? "STUDENTS");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const definition = types.find((item) => item.type === type) ?? types[0];

  if (!definition) return <EmptyState icon={Download} title="Không có loại dữ liệu được phép kết xuất" description="Tài khoản cần data.export và quyền đọc miền dữ liệu tương ứng." />;

  const updateType = (next: DataTransferType) => { setType(next); setFilters({}); setError(undefined); };
  return <section className="grid gap-5" aria-labelledby="export-title">
    <div><h2 id="export-title" className="m-0 text-lg font-semibold text-[#0f172a]">Kết xuất dữ liệu</h2><p className="mt-1 mb-0 text-sm text-[#64748b]">Kết xuất các trường được cho phép của dữ liệu nghiệp vụ, không phải báo cáo phân tích.</p></div>
    {error && <div role="alert" className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b42318]">{error}</div>}
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-medium text-[#334155]">Loại dữ liệu<select className="input" value={definition.type} onChange={(event) => updateType(event.target.value as DataTransferType)}>{types.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select></label>
        {definition.filters.includes("status") && <label className="grid gap-2 text-sm font-medium text-[#334155]">Trạng thái<select className="input" value={filters.status ?? ""} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Tất cả</option>{definition.statusValues?.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
        {definition.filters.includes("branchId") && <label className="grid gap-2 text-sm font-medium text-[#334155]">ID chi nhánh<input className="input" value={filters.branchId ?? ""} onChange={(event) => setFilters((current) => ({ ...current, branchId: event.target.value.trim() }))} placeholder="ULID chi nhánh" /></label>}
        {definition.filters.includes("courseId") && <label className="grid gap-2 text-sm font-medium text-[#334155]">ID khóa học<input className="input" value={filters.courseId ?? ""} onChange={(event) => setFilters((current) => ({ ...current, courseId: event.target.value.trim() }))} placeholder="ULID khóa học" /></label>}
        {definition.filters.includes("classId") && <label className="grid gap-2 text-sm font-medium text-[#334155]">ID lớp học<input className="input" value={filters.classId ?? ""} onChange={(event) => setFilters((current) => ({ ...current, classId: event.target.value.trim() }))} placeholder="ULID lớp học" /></label>}
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-[#f1f5f9] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="m-0 max-w-3xl text-xs leading-5 text-[#64748b]">CSV UTF-8 có BOM, giới hạn 50.000 dòng và bảo vệ công thức bảng tính. Ghi danh lịch sử có thể được kết xuất nhưng chỉ PENDING/TRIAL/ACTIVE có thể import an toàn.</p><Button type="button" disabled={pending} onClick={async () => { setPending(true); setError(undefined); try { await downloadEntityExport(definition.type, Object.fromEntries(Object.entries(filters).filter(([, value]) => value))); } catch (nextError) { setError(getApiErrorMessage(nextError, "Không thể kết xuất CSV.")); } finally { setPending(false); } }}><Download size={16} aria-hidden="true" />{pending ? "Đang kết xuất…" : "Kết xuất CSV"}</Button></div>
    </div>
    <div className="rounded-xl border border-[#dbeafe] bg-[#f8fbff] p-5 text-sm text-[#475569]"><strong className="text-[#0f172a]">Phân biệt dữ liệu và báo cáo</strong><p className="mt-2 mb-0 leading-6">CSV trong Báo cáo là tổng hợp phân tích. CSV tại đây là dữ liệu thực thể theo danh sách trường cố định. Kết xuất không phải bản sao lưu và import không tái tạo lịch sử đã hoàn tất; backup/restore cơ sở dữ liệu vẫn là cơ chế khôi phục.</p></div>
  </section>;
}

export function DataTransferPage() {
  const [tab, setTab] = useState<Tab>("IMPORT");
  const [activeBatchId, setActiveBatchId] = useState<string>();
  const [wizardOpen, setWizardOpen] = useState(false);
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = currentMembership(user.data, tenant.data?.tenantId);
  const canImport = can(membership, "data.import");
  const canExport = can(membership, "data.export");
  useEffect(() => {
    if (!canImport && canExport) setTab("EXPORT");
  }, [canImport, canExport]);
  const importTypes = useQuery({ queryKey: importTypesQueryKey(), queryFn: getImportTypes, enabled: canImport });
  const exportTypes = useQuery({ queryKey: exportTypesQueryKey(), queryFn: getExportTypes, enabled: canExport });
  const history = useQuery({ queryKey: importHistoryQueryKey(), queryFn: () => getImportHistory(), enabled: canImport && !wizardOpen });

  const loading = user.isPending || tenant.isPending || (canImport && importTypes.isPending) || (canExport && exportTypes.isPending);
  const queryError = user.error ?? tenant.error ?? importTypes.error ?? exportTypes.error;
  if (loading) return <PageContainer><PageHeader title="Dữ liệu" description="Đang tải quyền và danh mục dữ liệu." /><LoadingState label="Đang tải không gian dữ liệu" /></PageContainer>;
  if (queryError) return <PageContainer><PageHeader title="Dữ liệu" description="Không thể tải không gian dữ liệu." /><ErrorState title="Không thể tải dữ liệu" message={getApiErrorMessage(queryError, "Kiểm tra kết nối và thử lại.")} /></PageContainer>;

  return <PageContainer>
    <PageHeader title="Dữ liệu" description="Import an toàn qua quy tắc nghiệp vụ hiện có và kết xuất CSV theo danh sách trường được phép." />
    <div className="mb-6 flex gap-2 border-b border-[#e2e8f0]" role="tablist" aria-label="Import và Export">
      {canImport && <button type="button" role="tab" aria-selected={tab === "IMPORT"} onClick={() => { setTab("IMPORT"); setWizardOpen(false); }} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === "IMPORT" ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-[#64748b] hover:text-[#0f172a]"}`}><Upload className="mr-2 inline" size={16} aria-hidden="true" />Import</button>}
      {canExport && <button type="button" role="tab" aria-selected={tab === "EXPORT"} onClick={() => { setTab("EXPORT"); setWizardOpen(false); }} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === "EXPORT" ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-[#64748b] hover:text-[#0f172a]"}`}><Download className="mr-2 inline" size={16} aria-hidden="true" />Export</button>}
    </div>

    {tab === "IMPORT" && canImport && (wizardOpen ? <ImportWizard types={importTypes.data ?? []} initialBatchId={activeBatchId} onClose={() => { setWizardOpen(false); setActiveBatchId(undefined); }} /> : <section aria-labelledby="history-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="history-title" className="m-0 text-lg font-semibold text-[#0f172a]">Lịch sử import</h2><p className="mt-1 mb-0 text-sm text-[#64748b]">Lô hoàn tất là bằng chứng vận hành chỉ đọc; tệp CSV gốc không được lưu.</p></div><Button type="button" onClick={() => { setActiveBatchId(undefined); setWizardOpen(true); }}><Upload size={16} aria-hidden="true" />Tạo lô import</Button></div>
      {history.isPending ? <LoadingState label="Đang tải lịch sử import" /> : history.isError ? <ErrorState title="Không thể tải lịch sử" message={getApiErrorMessage(history.error, "Kiểm tra kết nối và thử lại.")} onRetry={() => void history.refetch()} /> : !history.data?.data.length ? <EmptyState icon={History} title="Chưa có lô import" description="Tải CSV đầu tiên để bắt đầu quy trình ánh xạ và xác thực." action={<Button type="button" onClick={() => setWizardOpen(true)}>Tạo lô import</Button>} /> : <Table className="min-w-[900px]"><TableHeader><TableRow><TableHead>Tệp</TableHead><TableHead>Loại</TableHead><TableHead>Trạng thái</TableHead><TableHead>Dòng</TableHead><TableHead>Hợp lệ / Lỗi</TableHead><TableHead>Người tạo</TableHead><TableHead>Ngày tạo</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{history.data.data.map((batch) => <TableRow key={batch.id}><TableCell><span className="block max-w-52 truncate font-medium text-[#0f172a]" title={batch.fileName}>{batch.fileName}</span><span className="font-mono text-[11px] text-[#94a3b8]">{batch.id}</span></TableCell><TableCell>{importTypes.data?.find((item) => item.type === batch.type)?.label ?? batch.type}</TableCell><TableCell><Badge variant={status[batch.status].variant}>{status[batch.status].label}</Badge></TableCell><TableCell className="tabular-nums">{batch.totalRows}</TableCell><TableCell className="tabular-nums"><span className="text-[#15803d]">{batch.validRows}</span> / <span className={batch.invalidRows ? "text-[#b42318]" : "text-[#64748b]"}>{batch.invalidRows}</span></TableCell><TableCell>{batch.createdByName ?? "—"}</TableCell><TableCell className="whitespace-nowrap">{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(batch.createdAt))}</TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="secondary" onClick={() => { setActiveBatchId(batch.id); setWizardOpen(true); }}>{batch.status === "UPLOADED" ? "Tiếp tục" : "Xem"}</Button></TableCell></TableRow>)}</TableBody></Table>}
    </section>)}

    {tab === "EXPORT" && canExport && <ExportWorkspace types={exportTypes.data ?? []} />}
    {!canImport && !canExport && <EmptyState icon={FileSpreadsheet} title="Không có quyền quản lý dữ liệu" description="Tài khoản cần data.import hoặc data.export." />}
  </PageContainer>;
}
