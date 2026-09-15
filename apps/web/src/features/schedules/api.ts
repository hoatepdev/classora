import { api } from "../../lib/api.js";
import type { ClassSchedule, CreateScheduleInput, Schedule, TeacherSchedule, UpdateScheduleInput } from "./types.js";

const scheduleQueryKey = () => ["schedules", window.location.hostname] as const;

export const classScheduleQueryKey = (classId: string) =>
  [...scheduleQueryKey(), "class", classId] as const;

export const teacherScheduleQueryKey = (teacherId: string) =>
  [...scheduleQueryKey(), "teacher", teacherId] as const;

export async function listClassSchedules(classId: string) {
  return (await api.get<ClassSchedule[]>(`/classes/${classId}/schedules`)).data;
}

export async function listTeacherSchedules(teacherId: string) {
  return (await api.get<TeacherSchedule[]>(`/teachers/${teacherId}/schedules`)).data;
}

export async function createSchedule(input: CreateScheduleInput) {
  return (await api.post<Schedule>("/schedules", input)).data;
}

export async function updateSchedule(id: string, input: UpdateScheduleInput) {
  return (await api.patch<Schedule>(`/schedules/${id}`, input)).data;
}
