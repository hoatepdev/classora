import { api } from "@/lib/api";
import type { DataTransferType, ExportTypeDefinition, ImportBatch, ImportRow, ImportRowFilter, ImportTypeDefinition, Page } from "./types";

const tenantKey = () => window.location.hostname;
export const importTypesQueryKey = () => ["data-transfer", "import-types", tenantKey()] as const;
export const exportTypesQueryKey = () => ["data-transfer", "export-types", tenantKey()] as const;
export const importHistoryQueryKey = () => ["data-transfer", "batches", tenantKey()] as const;
export const importBatchQueryKey = (id: string | undefined) => ["data-transfer", "batch", tenantKey(), id] as const;
export const importRowsQueryKey = (id: string | undefined, page: number, filter: ImportRowFilter) => ["data-transfer", "rows", tenantKey(), id, page, filter] as const;

export async function getImportTypes() {
  return (await api.get<ImportTypeDefinition[]>("/data/import/types")).data;
}

export async function getExportTypes() {
  return (await api.get<ExportTypeDefinition[]>("/data/export/types")).data;
}

export async function getImportHistory(page = 1, pageSize = 20) {
  return (await api.get<Page<ImportBatch>>("/data/import/batches", { params: { page, pageSize } })).data;
}

export async function getImportBatch(id: string) {
  return (await api.get<ImportBatch>(`/data/import/batches/${id}`)).data;
}

export async function getImportRows(id: string, page: number, filter: ImportRowFilter) {
  return (await api.get<Page<ImportRow>>(`/data/import/batches/${id}/rows`, { params: { page, pageSize: 50, filter } })).data;
}

export async function uploadImport(type: DataTransferType, file: File) {
  const body = new FormData();
  body.set("type", type);
  body.set("file", file);
  return (await api.post<ImportBatch>("/data/import/batches", body)).data;
}

export async function updateImportMapping(id: string, fields: Record<string, string | null>) {
  return (await api.put<ImportBatch>(`/data/import/batches/${id}/mapping`, { fields })).data;
}

export async function validateImport(id: string) {
  return (await api.post<ImportBatch>(`/data/import/batches/${id}/validate`)).data;
}

export async function confirmImport(id: string) {
  return (await api.post<ImportBatch>(`/data/import/batches/${id}/confirm`)).data;
}

export async function cancelImport(id: string) {
  return (await api.post<ImportBatch>(`/data/import/batches/${id}/cancel`)).data;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function responseFileName(disposition: string | undefined, fallback: string) {
  return disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

export async function downloadImportTemplate(type: DataTransferType) {
  const response = await api.get<Blob>(`/data/import/templates/${type}.csv`, { responseType: "blob" });
  downloadBlob(response.data, responseFileName(response.headers["content-disposition"], `import-template-${type.toLowerCase()}.csv`));
}

export async function downloadImportErrors(id: string) {
  const response = await api.get<Blob>(`/data/import/batches/${id}/errors.csv`, { responseType: "blob" });
  downloadBlob(response.data, responseFileName(response.headers["content-disposition"], `import-errors-${id}.csv`));
}

export async function downloadEntityExport(type: DataTransferType, filters: Record<string, string>) {
  const response = await api.get<Blob>(`/data/export/${type}.csv`, { params: filters, responseType: "blob" });
  downloadBlob(response.data, responseFileName(response.headers["content-disposition"], `export-${type.toLowerCase()}.csv`));
}
