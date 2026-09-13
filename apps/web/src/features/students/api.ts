import { api } from "../../lib/api.js";
import type { Student, StudentInput } from "./types.js";

export const studentQueryKey = () => ["students", window.location.hostname] as const;

export async function listStudents() {
  return (await api.get<Student[]>("/students")).data;
}

export async function getStudent(id: string) {
  return (await api.get<Student>(`/students/${id}`)).data;
}

export async function createStudent(input: StudentInput) {
  return (await api.post<Student>("/students", input)).data;
}

export async function updateStudent(id: string, input: StudentInput) {
  return (await api.patch<Student>(`/students/${id}`, input)).data;
}
