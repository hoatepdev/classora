import { api } from "../../lib/api.js";
import type {
  CalendarFilters,
  ClassSchedule,
  CreateScheduleExclusionInput,
  CreateScheduleInput,
  Schedule,
  ScheduleExclusion,
  Session,
  TeacherSchedule,
  UpdateScheduleExclusionInput,
  UpdateScheduleInput,
} from "./types.js";

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

export const sessionCalendarQueryKey = (filters: CalendarFilters) =>
  [...scheduleQueryKey(), "sessions", filters] as const;

export async function listSessions(filters: CalendarFilters) {
  return (await api.get<Session[]>("/sessions", { params: filters })).data;
}

export const upcomingSessionQueryKey = (filters: CalendarFilters) =>
  [...scheduleQueryKey(), "upcoming", filters] as const;

export async function listUpcomingSessions(filters: CalendarFilters) {
  return listSessions(filters);
}

export const scheduleExclusionQueryKey = () =>
  [...scheduleQueryKey(), "exclusions"] as const;

export async function listScheduleExclusions() {
  return (await api.get<ScheduleExclusion[]>("/schedule-exclusions")).data;
}

export async function createScheduleExclusion(input: CreateScheduleExclusionInput) {
  return (await api.post<ScheduleExclusion>("/schedule-exclusions", input)).data;
}

export async function updateScheduleExclusion(id: string, input: UpdateScheduleExclusionInput) {
  return (await api.patch<ScheduleExclusion>(`/schedule-exclusions/${id}`, input)).data;
}

export async function deleteScheduleExclusion(id: string) {
  return (await api.delete<{ id: string; deleted: boolean }>(`/schedule-exclusions/${id}`)).data;
}
