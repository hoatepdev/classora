import { api } from "../../lib/api.js";
import type {
  AttendanceCorrection,
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionDetail,
  MakeupBooking,
  MakeupEntitlement,
  ClassAttendanceSession,
  CreateAttendanceSessionInput,
  StudentAttendanceRecord,
  UpdateAttendanceRecordInput,
} from "./types.js";

const attendanceQueryKey = () => ["attendance", window.location.hostname] as const;

export const classAttendanceQueryKey = (classId: string) =>
  [...attendanceQueryKey(), "class", classId] as const;
export const attendanceSessionQueryKey = (sessionId: string) =>
  [...attendanceQueryKey(), "session", sessionId] as const;
export const studentAttendanceQueryKey = (studentId: string) =>
  [...attendanceQueryKey(), "student", studentId] as const;

export async function createAttendanceSession(input: CreateAttendanceSessionInput) {
  return (await api.post<AttendanceSessionDetail>("/attendance-sessions", input)).data;
}

export async function getAttendanceSession(id: string) {
  return (await api.get<AttendanceSessionDetail>(`/attendance-sessions/${id}`)).data;
}

export async function initializeAttendanceSession(id: string) {
  return (await api.post<AttendanceSessionDetail>(`/attendance-sessions/${id}/initialize`)).data;
}

export async function finalizeAttendanceSession(id: string) {
  return (await api.post<AttendanceSessionDetail>(`/attendance-sessions/${id}/finalize`)).data;
}

export async function listClassAttendanceSessions(classId: string) {
  return (await api.get<ClassAttendanceSession[]>(`/classes/${classId}/attendance-sessions`)).data;
}

export async function updateAttendanceRecord(id: string, input: UpdateAttendanceRecordInput) {
  return (await api.patch<AttendanceRecord>(`/attendance-records/${id}`, input)).data;
}

export async function correctAttendanceRecord(id: string, input: { status: AttendanceRecord["status"]; reason: string; note?: string | null }) {
  return (await api.post<AttendanceRecord>(`/attendance-records/${id}/corrections`, input)).data;
}

export async function listAttendanceCorrections(id: string) {
  return (await api.get<AttendanceCorrection[]>(`/attendance-records/${id}/corrections`)).data;
}

export async function listMakeupEntitlements(studentId?: string) {
  return (await api.get<MakeupEntitlement[]>("/makeup-entitlements", { params: studentId ? { studentId } : undefined })).data;
}

export async function bookMakeup(entitlementId: string, destinationSessionId: string) {
  return (await api.post<MakeupBooking>(`/makeup-entitlements/${entitlementId}/bookings`, { destinationSessionId })).data;
}

export async function cancelMakeup(bookingId: string) {
  return (await api.post<MakeupBooking>(`/makeup-bookings/${bookingId}/cancel`)).data;
}

export async function rebookMakeup(bookingId: string, destinationSessionId: string) {
  return (await api.post<MakeupBooking>(`/makeup-bookings/${bookingId}/rebook`, { destinationSessionId })).data;
}

export async function listStudentAttendance(studentId: string) {
  return (await api.get<StudentAttendanceRecord[]>(`/students/${studentId}/attendance`)).data;
}
