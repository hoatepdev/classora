import { api } from "@/lib/api";

export type PortalStudent = { id: string; code: string; fullName: string; canViewBilling: boolean };
export type PortalMe = {
  user: { id: string; email: string; name: string };
  subjects: Array<{ type: "GUARDIAN" | "STUDENT"; id: string; name: string }>;
  students: PortalStudent[];
  portalType: "GUARDIAN" | "STUDENT";
};
export type PortalProfile = PortalStudent & { status: string; dateOfBirth: string | null; school: string | null; enrollments: Array<Record<string, string | null>> };
export type PortalSession = { date: string; startTime: string; endTime: string; status: string; className: string; courseName: string | null; levelName: string | null; teacherName: string | null; roomName: string | null; branchName: string | null };
export type PortalAttendance = { data: Array<{ status: string; source: string; date: string; startTime: string; endTime: string; className: string }>; summary: { attended: number; absent: number; late: number; total: number; percentage: number | null }; nextCursor: string | null };
export type PortalMakeup = Array<{ status: string; expiresAt: string; sourceDate: string; sourceClassName: string; destinationDate: string | null; destinationStartTime: string | null; destinationClassName: string | null }>;
export type PortalBilling = { invoices: Array<{ invoiceNumber: string; issueDate: string; dueDate: string; effectiveStatus: string; totalVnd: string; paidVnd: string; creditVnd: string; outstandingVnd: string; items: Array<{ description: string; quantity: string; amountVnd: string }> }>; payments: Array<{ amountVnd: string; method: string; receivedAt: string }>; refunds: Array<{ amountVnd: string; refundedAt: string }> };
export type PortalNotifications = { data: Array<{ eventType: string; subject: string | null; body: string; createdAt: string }>; nextCursor: string | null };

export const portalMeKey = () => ["portal", "me", window.location.hostname] as const;
export const getPortalMe = async () => (await api.get<PortalMe>("/portal/me")).data;
export const getPortalProfile = async (id: string) => (await api.get<PortalProfile>(`/portal/students/${id}`)).data;
export const getPortalSchedule = async (id: string, from: string, to: string) => (await api.get<PortalSession[]>(`/portal/students/${id}/schedule`, { params: { from, to } })).data;
export const getPortalAttendance = async (id: string) => (await api.get<PortalAttendance>(`/portal/students/${id}/attendance`)).data;
export const getPortalMakeup = async (id: string) => (await api.get<PortalMakeup>(`/portal/students/${id}/makeup`)).data;
export const getPortalBilling = async (id: string) => (await api.get<PortalBilling>(`/portal/students/${id}/billing`)).data;
export const getPortalNotifications = async () => (await api.get<PortalNotifications>("/portal/notifications")).data;
