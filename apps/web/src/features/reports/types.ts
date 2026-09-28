export type ReportCategory = "ACADEMIC" | "FINANCE" | "GROWTH" | "ORGANIZATION";
export type ReportFilterKey = "branchId" | "courseId" | "courseLevelId" | "classId" | "teacherId" | "studentId" | "salesOwnerId" | "status" | "source";

export type ReportCatalogItem = {
  key: string;
  name: string;
  description: string;
  category: ReportCategory;
  filters: ReportFilterKey[];
  maxRangeMonths: number;
};

export type ReportFilters = {
  from: string;
  to: string;
  page: number;
  pageSize: number;
} & Partial<Record<ReportFilterKey, string>>;

export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, unknown>;
export type ReportBreakdown = { name: string; columns: ReportColumn[]; rows: ReportRow[] };

export type ReportResponse = {
  report: string;
  generatedAt: string;
  businessTimezone: string;
  filters: Record<string, unknown>;
  summary: ReportRow;
  breakdowns: ReportBreakdown[] | null;
  columns: ReportColumn[];
  rows: ReportRow[];
  page?: number;
  pageSize?: number;
  total?: number;
};
