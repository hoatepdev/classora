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
export type SessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";

export type Schedule = {
  id: string;
  tenantId: string;
  classId: string;
  teacherId: string;
  branchId: string | null;
  roomId: string | null;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  legacyRoomSource: string | null;
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
  branchId?: string | null;
  roomId?: string | null;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  status?: ScheduleStatus;
};

export type UpdateScheduleInput = Partial<Omit<CreateScheduleInput, "classId">>;

export type Session = {
  id: string;
  tenantId: string;
  classId: string;
  classCode?: string;
  className?: string;
  schedulePatternId: string | null;
  teacherId: string | null;
  teacherCode?: string | null;
  teacherName?: string | null;
  roomId: string | null;
  roomCode?: string | null;
  roomName?: string | null;
  branchId?: string | null;
  branchCode?: string | null;
  branchName?: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  manualOverride: boolean;
  rescheduledFromId: string | null;
  cancellationReason: string | null;
  rescheduleReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarFilters = {
  from: string;
  to: string;
  classId?: string;
  teacherId?: string;
  roomId?: string;
  branchId?: string;
  studentId?: string;
  makeupEntitlementId?: string;
  status?: SessionStatus;
};

export type ScheduleExclusion = {
  id: string;
  tenantId: string;
  date: string;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateScheduleExclusionInput = {
  date: string;
  branchId?: string | null;
  reason: string;
};

export type UpdateScheduleExclusionInput = Partial<CreateScheduleExclusionInput>;
