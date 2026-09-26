import { api } from "@/lib/api";

export type PortalSubjectType = "GUARDIAN" | "STUDENT";
export type PortalAccessRow = { id: string; subjectType: PortalSubjectType; subjectId: string; subjectName: string | null; subjectEmail: string | null; status: "ACTIVE" | "DISABLED"; createdAt: string; user: { id: string; name: string; email: string } };
export type PortalInvitationRow = { id: string; subjectType: PortalSubjectType; subjectId: string; subjectName: string | null; subjectEmail: string | null; email: string; expiresAt: string; createdAt: string };
export type PortalAccessResponse = { accesses: PortalAccessRow[]; invitations: PortalInvitationRow[] };
export type PortalSubjectOption = { id: string; name: string; email: string };
export type PortalInvitationResult = { invitationToken: string; email: string; subjectType: PortalSubjectType; subjectId: string; expiresAt: string };

export const portalAccessKey = () => ["portal-access", window.location.hostname] as const;
export const listPortalAccess = async () => (await api.get<PortalAccessResponse>("/portal-access")).data;
export const searchPortalSubjects = async (type: PortalSubjectType, search: string) => (await api.get<PortalSubjectOption[]>("/portal-access/subjects", { params: { type, search } })).data;
export const invitePortalSubject = async (subjectType: PortalSubjectType, subjectId: string) => (await api.post<PortalInvitationResult>("/portal-access/invitations", { subjectType, subjectId })).data;
export const resendPortalInvitation = async (id: string) => (await api.post<PortalInvitationResult>(`/portal-access/invitations/${id}/resend`)).data;
export const revokePortalInvitation = async (id: string) => (await api.delete(`/portal-access/invitations/${id}`)).data;
export const setPortalAccessStatus = async (id: string, status: "ACTIVE" | "DISABLED") => (await api.patch(`/portal-access/${id}/status`, { status })).data;
export const removePortalAccess = async (id: string) => (await api.delete(`/portal-access/${id}`)).data;
