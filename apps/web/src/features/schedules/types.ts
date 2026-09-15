export const dayOfWeeks = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type DayOfWeek = (typeof dayOfWeeks)[number];
export type ScheduleStatus = "ACTIVE" | "DISABLED";

export type Schedule = {
  id: string;
  tenantId: string;
  classId: string;
  teacherId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  room: string | null;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
};

export type ClassSchedule = Schedule & {
  teacherCode: string;
  teacherName: string;
};

export type TeacherSchedule = Schedule & {
  classCode: string;
  className: string;
};

export type CreateScheduleInput = {
  classId: string;
  teacherId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  room?: string | null;
  status?: ScheduleStatus;
};

export type UpdateScheduleInput = Partial<Omit<CreateScheduleInput, "classId">>;
