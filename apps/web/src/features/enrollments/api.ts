import { api } from "../../lib/api.js";
import type { ClassStudentEnrollment, Enrollment, StudentClassEnrollment } from "./types.js";

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

export async function createEnrollment(input: { studentId: string; classId: string }) {
  return (await api.post<Enrollment>("/enrollments", input)).data;
}

export async function withdrawEnrollment(id: string) {
  return (await api.patch<Enrollment>(`/enrollments/${id}`, { status: "WITHDRAWN" })).data;
}
