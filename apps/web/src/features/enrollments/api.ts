import { api } from "../../lib/api.js";
import type { ClassStudentEnrollment, Enrollment, EnrollmentEvent, StudentClassEnrollment } from "./types.js";

const enrollmentQueryKey = () => ["enrollments", window.location.hostname] as const;

export const classEnrollmentQueryKey = (classId: string) =>
  [...enrollmentQueryKey(), "class", classId] as const;

export const studentEnrollmentQueryKey = (studentId: string) =>
  [...enrollmentQueryKey(), "student", studentId] as const;

export async function listClassEnrollments(classId: string) {
  return (await api.get<ClassStudentEnrollment[]>(`/classes/${classId}/students`)).data;
}

export async function listStudentEnrollments(studentId: string) {
  return (await api.get<StudentClassEnrollment[]>(`/students/${studentId}/classes`)).data;
}

export async function createEnrollment(input: { studentId: string; classId: string; status?: "PENDING" | "TRIAL" | "ACTIVE"; notes?: string }) {
  return (await api.post<Enrollment>("/enrollments", input)).data;
}

export async function withdrawEnrollment(id: string, reason?: string) {
  return transitionEnrollment(id, "withdraw", reason);
}

export async function transitionEnrollment(
  id: string,
  action: "activate" | "trial" | "pause" | "resume" | "withdraw" | "complete" | "cancel",
  reason?: string,
) {
  return (await api.post<Enrollment>(`/enrollments/${id}/${action}`, reason ? { reason } : {})).data;
}

export async function getEnrollmentHistory(id: string) {
  return (await api.get<EnrollmentEvent[]>(`/enrollments/${id}/history`)).data;
}

export async function transferEnrollment(id: string, destinationClassId: string, reason?: string) {
  return (await api.post<Enrollment>(`/enrollments/${id}/transfer`, { destinationClassId, ...(reason ? { reason } : {}) })).data;
}

export async function reenrollEnrollment(id: string, input: { studentId: string; classId: string; status?: "PENDING" | "TRIAL" | "ACTIVE"; notes?: string }) {
  return (await api.post<Enrollment>(`/enrollments/${id}/reenroll`, input)).data;
}
