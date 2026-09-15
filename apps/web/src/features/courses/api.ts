import { api } from "../../lib/api.js";
import type { Course, CourseClass, CourseInput } from "./types.js";

export const courseQueryKey = () => ["courses", window.location.hostname] as const;
export const courseClassQueryKey = (courseId: string) => [...courseQueryKey(), courseId, "classes"] as const;

export async function listCourses() {
  return (await api.get<Course[]>("/courses")).data;
}

export async function getCourse(id: string) {
  return (await api.get<Course>(`/courses/${id}`)).data;
}

export async function listCourseClasses(id: string) {
  return (await api.get<CourseClass[]>(`/courses/${id}/classes`)).data;
}

export async function createCourse(input: CourseInput) {
  return (await api.post<Course>("/courses", input)).data;
}

export async function updateCourse(id: string, input: CourseInput) {
  return (await api.patch<Course>(`/courses/${id}`, input)).data;
}
