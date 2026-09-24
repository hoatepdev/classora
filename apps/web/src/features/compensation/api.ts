import { api } from "@/lib/api";
import type { CompensationAgreement, CompensationAgreementInput, CompensationPeriod, CompensationReferences, CompensationStatement, CompensationStatementDetail, CompensationTeacherSummary, CompensationUnresolved } from "./types.js";

const key = (resource: string, id = "") => ["compensation", resource, window.location.hostname, id] as const;
export const compensationPeriodsQueryKey = () => key("periods");
export const compensationAgreementsQueryKey = () => key("agreements");
export const compensationPeriodQueryKey = (id: string) => key("period", id);
export const compensationStatementsQueryKey = (id: string) => key("statements", id);
export const compensationStatementQueryKey = (id: string) => key("statement", id);
export const compensationTeacherQueryKey = (id: string) => key("teacher", id);
export const compensationReferencesQueryKey = () => key("references");
export async function listCompensationPeriods() { return (await api.get<CompensationPeriod[]>("/compensation/periods")).data; }
export async function listCompensationAgreements() { return (await api.get<CompensationAgreement[]>("/compensation/agreements")).data; }
export async function getCompensationReferences() { return (await api.get<CompensationReferences>("/compensation/references")).data; }
export async function createCompensationAgreement(input: CompensationAgreementInput) { return (await api.post<CompensationAgreement>("/compensation/agreements", input)).data; }
export async function endCompensationAgreement(id: string, effectiveUntil: string) { return (await api.post<CompensationAgreement>(`/compensation/agreements/${id}/end`, { effectiveUntil })).data; }
export async function replaceCompensationAgreement(id: string, input: CompensationAgreementInput) { return (await api.post<CompensationAgreement>(`/compensation/agreements/${id}/replace`, input)).data; }
export async function getCompensationPeriod(id: string) { return (await api.get<CompensationPeriod>(`/compensation/periods/${id}`)).data; }
export async function listCompensationStatements(id: string) { return (await api.get<{ statements: CompensationStatement[]; unresolved: CompensationUnresolved[] }>(`/compensation/periods/${id}/statements`)).data; }
export async function getCompensationStatement(id: string) { return (await api.get<CompensationStatementDetail>(`/compensation/statements/${id}`)).data; }
export async function getCompensationTeacher(id: string) { return (await api.get<CompensationTeacherSummary>(`/compensation/teachers/${id}`)).data; }
export async function addCompensationAdjustment(periodId: string, teacherId: string, input: { amountVnd: string; reason: string }) { return (await api.post<CompensationStatementDetail>(`/compensation/periods/${periodId}/teachers/${teacherId}/adjustments`, input)).data; }
export async function removeCompensationAdjustment(id: string) { return (await api.delete<{ id: string; deleted: true }>(`/compensation/adjustments/${id}`)).data; }
export async function createCompensationPeriod(input: { periodStart: string; periodEnd: string }) { return (await api.post<CompensationPeriod>("/compensation/periods", input)).data; }
export async function generateCompensationPeriod(id: string, regenerate = false) { return (await api.post(`/compensation/periods/${id}/${regenerate ? "regenerate" : "generate"}`)).data; }
export async function finalizeCompensationPeriod(id: string) { return (await api.post(`/compensation/periods/${id}/finalize`)).data; }
