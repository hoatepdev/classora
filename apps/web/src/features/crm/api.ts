import { api } from "@/lib/api";
import type {
  CrmAssigneeLookup,
  CrmBranchLookup,
  CrmClassLookup,
  CrmCourseLookup,
  CrmTrialSession,
  GuardianRelationship,
  Lead,
  LeadDetail,
  LeadDuplicateCandidate,
  LeadListFilters,
  LostReason,
  TrialOutcomeValue,
} from "./types.js";

export type LeadListResponse = { data: Lead[]; nextCursor: string | null };
export const leadQueryKey = (filters?: LeadListFilters) => ["leads", window.location.hostname, filters ?? {}] as const;

export async function listLeads(filters: LeadListFilters = {}) {
  return (await api.get<LeadListResponse>("/leads", { params: filters })).data;
}

export async function getLead(id: string) {
  return (await api.get<LeadDetail>(`/leads/${id}`)).data;
}

export async function createLead(input: Record<string, unknown>) {
  return (await api.post<LeadDetail>("/leads", input)).data;
}

export async function updateLead(id: string, input: Record<string, unknown>) {
  return (await api.patch<LeadDetail>(`/leads/${id}`, input)).data;
}

export async function contactLead(id: string) {
  return (await api.post<LeadDetail>(`/leads/${id}/contact`)).data;
}

export async function qualifyLead(id: string) {
  return (await api.post<LeadDetail>(`/leads/${id}/qualify`)).data;
}

export async function lostLead(id: string, input: { reason: LostReason; detail?: string | null }) {
  return (await api.post<LeadDetail>(`/leads/${id}/lost`, input)).data;
}

export async function convertLead(id: string, input: { classId: string; studentId?: string; createStudent?: boolean; guardianId?: string; createGuardian?: boolean; guardianRelationship?: GuardianRelationship }) {
  return (await api.post<LeadDetail & { conversion: LeadDetail["conversion"] }>(`/leads/${id}/convert`, input)).data;
}

export async function addLeadNote(id: string, content: string) {
  return (await api.post(`/leads/${id}/notes`, { content })).data;
}

export async function leadDuplicates(id: string) {
  return (await api.get<LeadDuplicateCandidate[]>(`/leads/${id}/duplicates`)).data;
}

export async function bookTrial(leadId: string, input: { sessionId: string; studentId?: string; createStudent?: boolean; guardianId?: string; createGuardian?: boolean; guardianRelationship?: GuardianRelationship }) {
  return (await api.post<LeadDetail>(`/leads/${leadId}/trial-bookings`, input)).data;
}

export async function cancelTrialBooking(bookingId: string, reason?: string | null) {
  return (await api.post(`/trial-bookings/${bookingId}/cancel`, { reason: reason ?? null })).data;
}

export async function recordTrialOutcome(bookingId: string, input: { outcome: TrialOutcomeValue; lostReason?: LostReason; lostDetail?: string | null; notes?: string | null }) {
  return (await api.post(`/trial-bookings/${bookingId}/outcome`, input)).data;
}

export async function lookupCrmCourses() {
  return (await api.get<CrmCourseLookup[]>("/crm/lookups/courses")).data;
}

export async function lookupCrmBranches() {
  return (await api.get<CrmBranchLookup[]>("/crm/lookups/branches")).data;
}

export async function lookupCrmClasses() {
  return (await api.get<CrmClassLookup[]>("/crm/lookups/classes")).data;
}

export async function lookupCrmAssignees() {
  return (await api.get<CrmAssigneeLookup[]>("/crm/lookups/assignees")).data;
}

export async function lookupTrialSessions(params: { courseId?: string; courseLevelId?: string; branchId?: string } = {}) {
  return (await api.get<CrmTrialSession[]>("/crm/trial-sessions", { params })).data;
}
