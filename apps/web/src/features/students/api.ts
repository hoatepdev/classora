import { api } from "../../lib/api.js";
import type { Student, StudentInput } from "./types.js";

export type Guardian = { id: string; tenantId: string; fullName: string; phone: string | null; email: string | null; address: string | null; notes: string | null; createdAt: string; updatedAt: string; relationship?: string; isPrimaryContact?: boolean; isBillingContact?: boolean };
export type StudentNote = { id: string; studentId: string; content: string; authorName: string | null; createdAt: string };
export type StudentTag = { id: string; name: string };

export type StudentListResponse = { data: Student[]; nextCursor: string | null };
export type StudentListFilters = { search?: string; status?: Student["status"]; limit?: number; cursor?: string };
export const studentQueryKey = (filters?: StudentListFilters) => ["students", window.location.hostname, filters ?? {}] as const;

export async function listStudents(filters: StudentListFilters = {}) {
  return (await api.get<StudentListResponse>("/students", { params: filters })).data;
}

export async function getStudent(id: string) {
  return (await api.get<Student>(`/students/${id}`)).data;
}

export type StudentBillingInvoice = {
  id: string;
  invoiceNumber: string | null;
  effectiveStatus: string;
  dueDate: string | null;
  totalVnd: string;
  paidVnd: string;
  creditVnd: string;
  outstandingVnd: string;
};
export type StudentBillingPayment = {
  id: string;
  amountVnd: string;
  method: string;
  receivedAt: string;
  invoiceId: string | null;
  status: string;
};
export type StudentBilling = {
  student: { id: string; fullName: string };
  invoices: StudentBillingInvoice[];
  payments: StudentBillingPayment[];
  availableCreditVnd: string;
};
export async function getStudentBilling(id: string) {
  return (await api.get<StudentBilling>(`/students/${id}/billing`)).data;
}

export async function createStudent(input: StudentInput) {
  return (await api.post<Student>("/students", input)).data;
}

export async function updateStudent(id: string, input: StudentInput) {
  return (await api.patch<Student>(`/students/${id}`, input)).data;
}
export async function listGuardians(search = "") { return (await api.get<Guardian[]>("/guardians", { params: { search: search || undefined } })).data; }
export async function createGuardian(input: Partial<Guardian> & { fullName: string }) { return (await api.post<Guardian>("/guardians", input)).data; }
export async function createAndLinkGuardian(studentId: string, input: Partial<Guardian> & { fullName: string; relationship?: string; isPrimaryContact?: boolean; isBillingContact?: boolean }) { return (await api.post(`/students/${studentId}/guardians`, input)).data; }
export async function listStudentGuardians(id: string) { return (await api.get<Guardian[]>(`/students/${id}/guardians`)).data; }
export async function listStudentNotes(id: string) { return (await api.get<StudentNote[]>(`/students/${id}/notes`)).data; }
export async function listStudentTags(id: string) { return (await api.get<StudentTag[]>(`/students/${id}/tags`)).data; }
export type StudentActivity = { id: string; action: string; entityType: string; entityId: string | null; before: unknown; after: unknown; actorName: string | null; occurredAt: string };
export async function listStudentActivity(id: string) { return (await api.get<StudentActivity[]>(`/students/${id}/activity`)).data; }
export async function addStudentNote(id: string, content: string) { return (await api.post<StudentNote>(`/students/${id}/notes`, { content })).data; }
export async function addStudentTag(id: string, name: string) { return (await api.post<StudentTag>(`/students/${id}/tags`, { name })).data; }
export async function removeStudentTag(studentId: string, tagId: string) { return (await api.delete(`/students/${studentId}/tags/${tagId}`)).data; }
export async function linkGuardian(studentId: string, guardianId: string, input: { relationship?: string; isPrimaryContact?: boolean; isBillingContact?: boolean }) { return (await api.post(`/students/${studentId}/guardians/${guardianId}`, input)).data; }
export async function updateGuardianLink(studentId: string, guardianId: string, input: { relationship?: string; isPrimaryContact?: boolean; isBillingContact?: boolean }) { return (await api.patch(`/students/${studentId}/guardians/${guardianId}`, input)).data; }
export async function unlinkGuardian(studentId: string, guardianId: string) { return (await api.delete(`/students/${studentId}/guardians/${guardianId}`)).data; }
export async function updateGuardian(id: string, input: Partial<Guardian>) { return (await api.patch<Guardian>(`/guardians/${id}`, input)).data; }
