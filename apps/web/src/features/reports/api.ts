import { api } from "@/lib/api";
import type { ReportCatalogItem, ReportFilters, ReportResponse } from "./types";

export const reportCatalogQueryKey = () => ["reports", "catalog", window.location.hostname] as const;
export const reportQueryKey = (key: string, filters: ReportFilters) => ["reports", key, window.location.hostname, filters] as const;

export async function getReportCatalog() {
  return (await api.get<ReportCatalogItem[]>("/reports/catalog")).data;
}

export async function getReport(key: string, filters: ReportFilters) {
  return (await api.get<ReportResponse>(`/reports/${key}`, { params: filters })).data;
}

function filename(disposition: string | undefined, fallback: string) {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? fallback;
}

export async function downloadReportCsv(key: string, filters: ReportFilters) {
  const { page: _page, pageSize: _pageSize, ...params } = filters;
  const response = await api.get<Blob>(`/reports/${key}/export.csv`, { params, responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename(response.headers["content-disposition"], `report-${key}_${filters.from}_${filters.to}.csv`);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
