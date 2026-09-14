import { api } from "../../lib/api.js";
import type { Class, ClassInput } from "./types.js";

export const classQueryKey = () => ["classes", window.location.hostname] as const;

export async function listClasses() {
  return (await api.get<Class[]>("/classes")).data;
}

export async function getClass(id: string) {
  return (await api.get<Class>(`/classes/${id}`)).data;
}

export async function createClass(input: ClassInput) {
  return (await api.post<Class>("/classes", input)).data;
}

export async function updateClass(id: string, input: ClassInput) {
  return (await api.patch<Class>(`/classes/${id}`, input)).data;
}
