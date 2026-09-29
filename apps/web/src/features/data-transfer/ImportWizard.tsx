import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api";
import {
  cancelImport,
  confirmImport,
  downloadImportErrors,
  downloadImportTemplate,
  getImportBatch,
  getImportRows,
  importBatchQueryKey,
  importHistoryQueryKey,
  importRowsQueryKey,
  updateImportMapping,
  uploadImport,
  validateImport,
} from "./api";
import type { DataTransferType, ImportBatch, ImportRowFilter, ImportTypeDefinition } from "./types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const steps = ["Loại dữ liệu", "Tải CSV", "Ánh xạ", "Xác thực", "Xem trước", "Xác nhận", "Kết quả"];

const statusLabels: Record<ImportBatch["status"], string> = {
  UPLOADED: "Đã tải lên",
  VALIDATED: "Đã xác thực",
  COMPLETED: "Hoàn tất",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
};

function stepFor(batch: ImportBatch | undefined) {
  if (!batch) return 1;
  if (batch.status === "UPLOADED") return 3;
  if (batch.status === "VALIDATED") return 5;
  return 7;
}

function issueBadge(status: string) {
  if (status === "VALID" || status === "IMPORTED") return <Badge variant="active">{status === "VALID" ? "Hợp lệ" : "Đã nhập"}</Badge>;
  if (status === "PENDING") return <Badge variant="info">Chờ xử lý</Badge>;
  return <Badge variant="danger">{status === "FAILED" ? "Thất bại" : "Có lỗi"}</Badge>;
}

function formatValue(value: unknown) {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.join(" | ");
  return String(value);
}

export function ImportWizard({ types, initialBatchId, onClose }: {
  types: ImportTypeDefinition[];
  initialBatchId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<DataTransferType>(types[0]?.type ?? "STUDENTS");
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState<string>();
  const [batchId, setBatchId] = useState(initialBatchId);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState<ImportRowFilter>("ALL");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string>();
  const [downloadPending, setDownloadPending] = useState(false);

  const batchQuery = useQuery({
    queryKey: importBatchQueryKey(batchId),
    queryFn: () => getImportBatch(batchId!),
    enabled: Boolean(batchId),
  });
  const batch = batchQuery.data;
  const definition = types.find((item) => item.type === (batch?.type ?? selectedType));
  const currentStep = stepFor(batch);
  const rowsQuery = useQuery({
    queryKey: importRowsQueryKey(batchId, page, filter),
    queryFn: () => getImportRows(batchId!, page, filter),
    enabled: Boolean(batchId && batch && batch.status !== "UPLOADED"),
  });
  const warningRowsQuery = useQuery({
    queryKey: importRowsQueryKey(batchId, 1, "WARNINGS"),
    queryFn: () => getImportRows(batchId!, 1, "WARNINGS"),
    enabled: Boolean(batchId && batch?.status === "VALIDATED"),
  });

  useEffect(() => {
    if (batch?.mapping.fields) setMapping(batch.mapping.fields);
  }, [batch?.id, batch?.updatedAt]);

  const refresh = async (id = batchId) => {
    if (id) await queryClient.invalidateQueries({ queryKey: importBatchQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: importHistoryQueryKey() });
    await queryClient.invalidateQueries({ queryKey: ["data-transfer", "rows"] });
  };

  const upload = useMutation({
    mutationFn: () => uploadImport(selectedType, file!),
    onSuccess: async (created) => {
      setBatchId(created.id);
      setActionError(undefined);
      queryClient.setQueryData(importBatchQueryKey(created.id), created);
      await refresh(created.id);
    },
    onError: (error) => setActionError(getApiErrorMessage(error, "Không thể tải tệp CSV.")),
  });
  const saveMapping = useMutation({
    mutationFn: () => updateImportMapping(batchId!, mapping),
    onSuccess: async (updated) => { queryClient.setQueryData(importBatchQueryKey(updated.id), updated); setActionError(undefined); await refresh(updated.id); },
    onError: (error) => setActionError(getApiErrorMessage(error, "Không thể lưu ánh xạ.")),
  });
  const validate = useMutation({
    mutationFn: () => validateImport(batchId!),
    onSuccess: async (updated) => { queryClient.setQueryData(importBatchQueryKey(updated.id), updated); setFilter(updated.invalidRows ? "ERRORS" : "ALL"); setPage(1); setActionError(undefined); await refresh(updated.id); },
    onError: (error) => setActionError(getApiErrorMessage(error, "Không thể xác thực tệp CSV.")),
  });
  const confirm = useMutation({
    mutationFn: () => confirmImport(batchId!),
    onSuccess: async (updated) => { queryClient.setQueryData(importBatchQueryKey(updated.id), updated); setActionError(undefined); await refresh(updated.id); },
    onError: async (error) => { setActionError(getApiErrorMessage(error, "Import thất bại; không có dữ liệu từng phần được lưu.")); await refresh(); },
  });
  const cancel = useMutation({
    mutationFn: () => cancelImport(batchId!),
    onSuccess: async (updated) => { queryClient.setQueryData(importBatchQueryKey(updated.id), updated); setActionError(undefined); await refresh(updated.id); },
    onError: (error) => setActionError(getApiErrorMessage(error, "Không thể hủy lô import.")),
  });

  const requiredMapped = useMemo(() => definition?.fields.filter((field) => field.required).every((field) => Object.values(mapping).includes(field.key)) ?? false, [definition, mapping]);
  const totalPages = Math.max(1, Math.ceil((rowsQuery.data?.total ?? 0) / 50));

  function chooseFile(next: File | undefined) {
    setFile(next);
    setFileError(undefined);
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".csv")) setFileError("Chỉ chấp nhận tệp .csv.");
    else if (next.size > MAX_FILE_BYTES) setFileError("Tệp vượt quá giới hạn 5 MiB.");
  }

  if (batchQuery.isPending && batchId) return <LoadingState label="Đang tải lô import" />;
  if (batchQuery.isError) return <ErrorState title="Không thể tải lô import" message={getApiErrorMessage(batchQuery.error, "Kiểm tra kết nối và thử lại.")} onRetry={() => void batchQuery.refetch()} />;

  return <section aria-labelledby="import-wizard-title" className="grid gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="import-wizard-title" className="m-0 text-lg font-semibold text-[#0f172a]">Import dữ liệu</h2>
        <p className="mt-1 mb-0 text-sm text-[#64748b]">CSV → Ánh xạ → Xác thực → Xem trước → Ghi dữ liệu nghiệp vụ</p>
      </div>
      <Button type="button" variant="secondary" onClick={onClose}><ArrowLeft size={16} aria-hidden="true" />Lịch sử import</Button>
    </div>

    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Các bước import">
      {steps.map((label, index) => {
        const number = index + 1;
        const active = number === currentStep || (batch?.status === "VALIDATED" && number === 6);
        const complete = number < currentStep;
        return <li key={label} className={`rounded-lg border px-3 py-2 text-xs font-medium ${active ? "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]" : complete ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" : "border-[#e2e8f0] bg-white text-[#64748b]"}`}>
          <span className="mr-1.5 tabular-nums">{number}.</span>{label}
        </li>;
      })}
    </ol>

    {actionError && <div role="alert" className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b42318]">{actionError}</div>}

    {!batch && <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {types.map((item) => <button key={item.type} type="button" onClick={() => setSelectedType(item.type)} className={`rounded-xl border bg-white p-4 text-left transition-colors ${selectedType === item.type ? "border-[#60a5fa] ring-2 ring-[#dbeafe]" : "border-[#e2e8f0] hover:border-[#cbd5e1]"}`}>
          <strong className="block text-sm text-[#0f172a]">{item.label}</strong>
          <span className="mt-1.5 block text-xs leading-5 text-[#64748b]">{item.dependsOn}</span>
        </button>)}
      </div>
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="import-file" className="mb-2 block text-sm font-medium text-[#334155]">Tệp CSV</label>
            <input id="import-file" type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0])} className="input block w-full text-sm" />
            <p className="mt-2 mb-0 text-xs text-[#64748b]">UTF-8 · tối đa 5 MiB · 5.000 dòng · 100 cột. Tệp chỉ được xử lý trong bộ nhớ.</p>
            {file && !fileError && <p className="mt-2 mb-0 text-sm text-[#334155]">{file.name} · {new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(file.size / 1024)} KiB</p>}
            {fileError && <p role="alert" className="mt-2 mb-0 text-sm text-[#b42318]">{fileError}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={downloadPending} onClick={async () => { setDownloadPending(true); try { await downloadImportTemplate(selectedType); } catch (error) { setActionError(getApiErrorMessage(error, "Không thể tải mẫu CSV.")); } finally { setDownloadPending(false); } }}><Download size={16} aria-hidden="true" />Tải mẫu</Button>
            <Button type="button" disabled={!file || Boolean(fileError) || upload.isPending} onClick={() => upload.mutate()}><Upload size={16} aria-hidden="true" />{upload.isPending ? "Đang tải…" : "Tải lên"}</Button>
          </div>
        </div>
      </div>
    </>}

    {batch?.status === "UPLOADED" && definition && <div className="grid gap-4">
      {batch.duplicateWarning && <div className="flex gap-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]"><AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" /><span>Tệp này trùng dấu vân tay với một lô trước. Bạn vẫn có thể tiếp tục nếu đây là lần nhập hợp lệ.</span></div>}
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-5">
        <h3 className="m-0 text-base font-semibold text-[#0f172a]">Ánh xạ cột</h3>
        <p className="mt-1 mb-4 text-sm text-[#64748b]">Mỗi trường Classora chỉ được nhận dữ liệu từ một cột CSV. Cột không dùng có thể để “Bỏ qua”.</p>
        <Table className="min-w-[640px]">
          <TableHeader><TableRow><TableHead>Cột CSV</TableHead><TableHead>Trường Classora</TableHead><TableHead>Yêu cầu</TableHead></TableRow></TableHeader>
          <TableBody>{batch.mapping.sourceHeaders.map((header) => {
            const target = mapping[header] ?? "";
            const field = definition.fields.find((item) => item.key === target);
            return <TableRow key={header}><TableCell className="font-medium text-[#0f172a]">{header}</TableCell><TableCell><select aria-label={`Ánh xạ cột ${header}`} className="input min-w-56" value={target ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value || null }))}><option value="">Bỏ qua</option>{definition.fields.map((item) => <option key={item.key} value={item.key}>{item.label} ({item.key})</option>)}</select></TableCell><TableCell>{field?.required ? <Badge variant="warning">Bắt buộc</Badge> : field ? <Badge variant="info">Tùy chọn</Badge> : <span className="text-[#94a3b8]">Bỏ qua</span>}</TableCell></TableRow>;
          })}</TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Hủy lô</Button>
        <Button type="button" variant="secondary" disabled={!requiredMapped || saveMapping.isPending} onClick={() => saveMapping.mutate()}>{saveMapping.isPending ? "Đang lưu…" : "Lưu ánh xạ"}</Button>
        <Button type="button" disabled={!requiredMapped || validate.isPending || saveMapping.isPending} onClick={async () => { await saveMapping.mutateAsync(); validate.mutate(); }}>{validate.isPending ? "Đang xác thực…" : "Lưu và xác thực"}</Button>
      </div>
    </div>}

    {batch?.status === "VALIDATED" && <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ label: "Tổng dòng", value: batch.totalRows }, { label: "Hợp lệ", value: batch.validRows }, { label: "Lỗi", value: batch.invalidRows }, { label: "Cảnh báo", value: warningRowsQuery.data?.total ?? 0 }].map((item) => <div key={item.label} className="rounded-xl border border-[#e2e8f0] bg-white p-4"><p className="m-0 text-xs text-[#64748b]">{item.label}</p><p className="mt-1 mb-0 text-2xl font-bold tabular-nums text-[#0f172a]">{item.value}</p></div>)}
      </div>
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">{(["ALL", "ERRORS", "WARNINGS", "VALID"] as ImportRowFilter[]).map((item) => <Button key={item} type="button" size="sm" variant={filter === item ? "default" : "secondary"} onClick={() => { setFilter(item); setPage(1); }}>{item === "ALL" ? "Tất cả" : item === "ERRORS" ? "Lỗi" : item === "WARNINGS" ? "Cảnh báo" : "Hợp lệ"}</Button>)}</div>
          {batch.invalidRows > 0 && <Button type="button" variant="secondary" onClick={() => void downloadImportErrors(batch.id)}><Download size={16} aria-hidden="true" />Tải CSV lỗi</Button>}
        </div>
        {rowsQuery.isPending ? <LoadingState label="Đang tải bản xem trước" /> : rowsQuery.isError ? <ErrorState title="Không thể tải bản xem trước" message={getApiErrorMessage(rowsQuery.error, "Kiểm tra kết nối và thử lại.")} onRetry={() => void rowsQuery.refetch()} /> : <>
          <Table className="min-w-[900px]"><TableHeader><TableRow><TableHead>Dòng</TableHead><TableHead>Khóa nguồn</TableHead><TableHead>Trạng thái</TableHead><TableHead>Dữ liệu chuẩn hóa</TableHead><TableHead>Lỗi / cảnh báo</TableHead></TableRow></TableHeader><TableBody>{rowsQuery.data?.data.map((row) => <TableRow key={row.id}><TableCell className="tabular-nums">{row.rowNumber}</TableCell><TableCell>{row.sourceKey ?? "—"}</TableCell><TableCell>{issueBadge(row.status)}</TableCell><TableCell><dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">{Object.entries(row.normalizedData ?? {}).map(([key, value]) => <div key={key} className="contents"><dt className="font-medium text-[#64748b]">{key}</dt><dd className="m-0 max-w-72 truncate text-[#334155]" title={formatValue(value)}>{formatValue(value)}</dd></div>)}</dl></TableCell><TableCell><div className="grid max-w-96 gap-1 text-xs">{row.errors.map((issue, index) => <span key={`e-${index}`} className="text-[#b42318]"><strong>{issue.code}</strong> · {issue.field}: {issue.message}</span>)}{row.warnings.map((issue, index) => <span key={`w-${index}`} className="text-[#92400e]"><strong>{issue.code}</strong> · {issue.field}: {issue.message}</span>)}{!row.errors.length && !row.warnings.length && <span className="text-[#64748b]">Không có vấn đề</span>}</div></TableCell></TableRow>)}</TableBody></Table>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-[#64748b]">{rowsQuery.data?.total ?? 0} dòng · Trang {page}/{totalPages}</span><div className="flex gap-2"><Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Trang trước</Button><Button type="button" size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Trang sau</Button></div></div>
        </>}
      </div>
      {batch.invalidRows > 0 ? <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-5"><h3 className="m-0 font-semibold text-[#b42318]">Chưa thể xác nhận</h3><p className="mt-1 mb-4 text-sm text-[#7f1d1d]">Lô có {batch.invalidRows} dòng lỗi. LOCAL-16 không nhập riêng các dòng hợp lệ; hãy tải CSV lỗi, sửa nguồn rồi tạo lô mới.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => void downloadImportErrors(batch.id)}><Download size={16} aria-hidden="true" />Tải CSV lỗi</Button><Button type="button" variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Hủy lô</Button></div></div> : <div className="flex flex-col gap-4 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="m-0 font-semibold text-[#1e3a8a]">Sẵn sàng import {batch.validRows} {definition?.label}</h3><p className="mt-1 mb-0 text-sm text-[#1e40af]">Đây là thao tác ghi dữ liệu hàng loạt. Hệ thống sẽ kiểm tra lại dữ liệu thay đổi và rollback toàn bộ nếu có xung đột.</p></div><ConfirmDialog trigger={<Button type="button" disabled={confirm.isPending}>{confirm.isPending ? "Đang import…" : "Xác nhận import"}</Button>} title={`Import ${batch.validRows} ${definition?.label}?`} description="Hệ thống sẽ kiểm tra lại quan hệ, mã trùng và sức chứa trước khi ghi. Nếu một dòng thất bại, toàn bộ lô sẽ rollback." confirmLabel="Import dữ liệu" pending={confirm.isPending} onConfirm={() => confirm.mutateAsync()} /></div>}
    </div>}

    {batch && ["COMPLETED", "FAILED", "CANCELLED"].includes(batch.status) && <div className={`rounded-xl border bg-white p-6 ${batch.status === "COMPLETED" ? "border-[#bbf7d0]" : batch.status === "FAILED" ? "border-[#fecaca]" : "border-[#e2e8f0]"}`}>
      <div className="flex items-start gap-4">{batch.status === "COMPLETED" ? <CheckCircle2 className="shrink-0 text-[#15803d]" size={30} aria-hidden="true" /> : <AlertTriangle className={`shrink-0 ${batch.status === "FAILED" ? "text-[#b42318]" : "text-[#64748b]"}`} size={30} aria-hidden="true" />}<div className="min-w-0"><Badge variant={batch.status === "COMPLETED" ? "active" : batch.status === "FAILED" ? "danger" : "inactive"}>{statusLabels[batch.status]}</Badge><h3 className="mt-3 mb-0 text-xl font-semibold text-[#0f172a]">{batch.fileName}</h3><p className="mt-1 mb-0 text-sm text-[#64748b]">Batch ID: <span className="font-mono text-xs">{batch.id}</span></p></div></div>
      <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-[#f1f5f9] py-5 text-sm sm:grid-cols-4"><div><dt className="text-[#64748b]">Loại</dt><dd className="mt-1 font-medium text-[#0f172a]">{definition?.label ?? batch.type}</dd></div><div><dt className="text-[#64748b]">Tổng dòng</dt><dd className="mt-1 font-medium tabular-nums text-[#0f172a]">{batch.totalRows}</dd></div><div><dt className="text-[#64748b]">Đã import</dt><dd className="mt-1 font-medium tabular-nums text-[#0f172a]">{batch.importedRows}</dd></div><div><dt className="text-[#64748b]">Thời điểm</dt><dd className="mt-1 font-medium text-[#0f172a]">{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(batch.completedAt ?? batch.updatedAt))}</dd></div></dl>
      {batch.failure && <div role="alert" className="mt-5 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b42318]"><strong>{batch.failure.code}</strong>{batch.failure.rowNumber ? ` · Dòng ${batch.failure.rowNumber}` : ""}: {batch.failure.message}</div>}
      <div className="mt-5 flex flex-wrap gap-2">{(batch.status === "FAILED" || batch.invalidRows > 0) && <Button type="button" variant="secondary" onClick={() => void downloadImportErrors(batch.id)}><Download size={16} aria-hidden="true" />Tải CSV lỗi</Button>}<Button type="button" onClick={() => { setBatchId(undefined); setFile(undefined); setMapping({}); setActionError(undefined); }}>Tạo lô mới</Button></div>
    </div>}

    {batch && <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748b]"><FileSpreadsheet size={15} aria-hidden="true" /><span>{batch.fileName}</span><span>·</span><span>{batch.totalRows} dòng</span><span>·</span><span>{statusLabels[batch.status]}</span></div>}
  </section>;
}
