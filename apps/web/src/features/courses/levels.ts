import { api } from "../../lib/api.js";

export type CourseLevel = { id: string; courseId: string; code: string; name: string; description: string | null; displayOrder: number; status: "ACTIVE" | "DISABLED" };
export type CourseLevelInput = { code: string; name: string; description?: string | null; displayOrder: number; status: "ACTIVE" | "DISABLED" };
export const courseLevelQueryKey = (courseId: string) => ["courses", window.location.hostname, courseId, "levels"] as const;
export async function listCourseLevels(courseId: string) { return (await api.get<CourseLevel[]>(`/courses/${courseId}/levels`)).data; }
export async function createCourseLevel(courseId: string, input: CourseLevelInput) { return (await api.post<CourseLevel>(`/courses/${courseId}/levels`, input)).data; }
export async function updateCourseLevel(courseId: string, levelId: string, input: CourseLevelInput) { return (await api.patch<CourseLevel>(`/courses/${courseId}/levels/${levelId}`, input)).data; }
export async function deleteCourseLevel(courseId: string, levelId: string) { await api.delete(`/courses/${courseId}/levels/${levelId}`); }
