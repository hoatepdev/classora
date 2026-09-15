export const attendanceStatuses = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

export type AttendanceStatus = (typeof attendanceStatuses)[number];
export type AttendanceSessionStatus = "OPEN" | "COMPLETED";

export type AttendanceRecord = {
  id: string;
  tenantId: string;
  attendanceSessionId: string;
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionAttendanceRecord = AttendanceRecord & {
  studentCode: string;
  studentFullName: string;
};

export type AttendanceSession = {
  id: string;
  tenantId: string;
  classId: string;
  scheduleId: string | null;
  teacherId: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: AttendanceSessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceSessionDetail = AttendanceSession & {
  classCode: string;
  className: string;
  teacherCode: string | null;
  teacherName: string | null;
  records: SessionAttendanceRecord[];
};

export type ClassAttendanceSession = Omit<AttendanceSessionDetail, "records"> & {
  recordCount: number;
};

export type StudentAttendanceRecord = AttendanceRecord & {
  classId: string;
  classCode: string;
  className: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  sessionStatus: AttendanceSessionStatus;
};

export type CreateAttendanceSessionInput = {
  classId: string;
  scheduleId?: string;
  teacherId?: string;
  sessionDate: string;
  startTime?: string;
  endTime?: string;
};

export type UpdateAttendanceRecordInput = {
  status?: AttendanceStatus;
  note?: string | null;
};
