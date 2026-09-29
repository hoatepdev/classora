export type DataTransferType = "STUDENTS" | "TEACHERS" | "COURSES" | "COURSE_LEVELS" | "CLASSES" | "ENROLLMENTS";
export type ImportBatchStatus = "UPLOADED" | "VALIDATED" | "COMPLETED" | "FAILED" | "CANCELLED";
export type ImportRowStatus = "PENDING" | "VALID" | "INVALID" | "IMPORTED" | "SKIPPED" | "FAILED";
export type ImportRowFilter = "ALL" | "ERRORS" | "WARNINGS" | "VALID";

export type ImportFieldDefinition = {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "email" | "date" | "datetime" | "integer" | "enum" | "code" | "codeList";
  allowedValues?: string[];
  example: string;
};

export type ImportTypeDefinition = {
  type: DataTransferType;
  label: string;
  dependsOn: string;
  identityFields: string[];
  fields: ImportFieldDefinition[];
};

export type ImportMapping = {
  sourceHeaders: string[];
  fields: Record<string, string | null>;
};

export type ImportIssue = { code: string; field: string; message: string; rowNumber?: number };

export type ImportBatch = {
  id: string;
  tenantId: string;
  type: DataTransferType;
  status: ImportBatchStatus;
  fileName: string;
  fileSha256: string;
  mapping: ImportMapping;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  failure: ImportIssue | null;
  createdByName: string | null;
  validatedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  duplicateWarning?: boolean;
};

export type ImportRow = {
  id: string;
  rowNumber: number;
  sourceData: Record<string, string>;
  normalizedData: Record<string, unknown> | null;
  status: ImportRowStatus;
  action: "CREATE" | "SKIP" | "ERROR";
  errors: ImportIssue[];
  warnings: ImportIssue[];
  targetEntityId: string | null;
  sourceKey: string | null;
};

export type Page<T> = { data: T[]; total: number; page: number; pageSize: number; filter?: ImportRowFilter };

export type ExportTypeDefinition = {
  type: DataTransferType;
  label: string;
  filters: Array<"status" | "branchId" | "courseId" | "classId">;
  statusValues?: string[];
  columns: Array<{ key: string; label: string }>;
};
