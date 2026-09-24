export type CompensationBasis = "PER_SESSION" | "PER_HOUR" | "FIXED_CLASS";
export type CompensationAgreement = {
  id: string;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  classId: string | null;
  classCode: string | null;
  className: string | null;
  basis: CompensationBasis;
  rateVnd: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: "ACTIVE" | "ENDED";
  notes: string | null;
};
export type CompensationReferences = {
  teachers: Array<{ id: string; code: string; name: string }>;
  classes: Array<{ id: string; code: string; name: string }>;
};
export type CompensationAgreementInput = {
  teacherId: string;
  classId?: string | null;
  basis: CompensationBasis;
  rateVnd: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  notes?: string | null;
};
export type CompensationPeriod = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "FINALIZED";
  generatedAt: string | null;
  finalizedAt: string | null;
};
export type CompensationStatement = {
  id: string;
  periodId: string;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  earningsVnd: string;
  adjustmentsVnd: string;
  payableVnd: string;
};
export type CompensationItem = {
  id: string;
  sourceKind: "SESSION" | "FIXED_CLASS";
  workDate: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  basis: CompensationBasis;
  rateVnd: string;
  amountVnd: string;
  classCode: string;
  className: string;
  description: string;
};
export type CompensationAdjustment = { id: string; amountVnd: string; reason: string; createdAt: string };
export type CompensationUnresolved = {
  id: string;
  sessionId: string;
  teacherId: string | null;
  teacherCode: string | null;
  teacherName: string | null;
  classCode: string;
  className: string;
  workDate: string;
  reasonCode: "MISSING_TEACHER" | "MISSING_AGREEMENT";
  description: string;
};
export type CompensationStatementDetail = CompensationStatement & { periodStatus: "DRAFT" | "FINALIZED"; items: CompensationItem[]; adjustments: CompensationAdjustment[] };
export type CompensationTeacherSummary = { teacher: { id: string; code: string; name: string }; agreements: CompensationAgreement[]; statements: Array<Pick<CompensationStatement, "id" | "periodId" | "earningsVnd" | "adjustmentsVnd" | "payableVnd"> & { periodStart: string; periodEnd: string }> };
