import { api } from "../../lib/api.js";
import type { Teacher, TeacherInput } from "./types.js";

export const teacherQueryKey = () => ["teachers", window.location.hostname] as const;

export async function listTeachers() {
  return (await api.get<Teacher[]>("/teachers")).data;
}

export async function getTeacher(id: string) {
  return (await api.get<Teacher>(`/teachers/${id}`)).data;
}

export async function createTeacher(input: TeacherInput) {
  return (await api.post<Teacher>("/teachers", input)).data;
}

export async function updateTeacher(id: string, input: TeacherInput) {
  return (await api.patch<Teacher>(`/teachers/${id}`, input)).data;
}
