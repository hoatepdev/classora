import { api } from "../../lib/api.js";
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionDetail,
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

export async function completeAttendanceSession(id: string) {
  return (await api.patch<AttendanceSession>(`/attendance-sessions/${id}`, { status: "COMPLETED" })).data;
}

export async function listClassAttendanceSessions(classId: string) {
  return (await api.get<ClassAttendanceSession[]>(`/classes/${classId}/attendance-sessions`)).data;
}

export async function updateAttendanceRecord(id: string, input: UpdateAttendanceRecordInput) {
  return (await api.patch<AttendanceRecord>(`/attendance-records/${id}`, input)).data;
}

export async function listStudentAttendance(studentId: string) {
  return (await api.get<StudentAttendanceRecord[]>(`/students/${studentId}/attendance`)).data;
}
