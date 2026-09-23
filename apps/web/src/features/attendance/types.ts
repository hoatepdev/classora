export const attendanceStatuses = ["UNMARKED", "PRESENT", "LATE", "ABSENT_EXCUSED", "ABSENT_UNEXCUSED", "ONLINE", "MAKEUP"] as const;

export type AttendanceStatus = (typeof attendanceStatuses)[number];
export type AttendanceSheetStatus = "OPEN" | "LOCKED";
export type AttendanceSessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";

export type AttendanceRecord = {
  id: string;
  tenantId: string;
  attendanceSessionId: string;
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  source: "REGULAR" | "MAKEUP";
  enrollmentId?: string | null;
  makeupBookingId?: string | null;
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
  attendanceStatus: AttendanceSheetStatus;
  records: SessionAttendanceRecord[];
};

export type AttendanceCorrection = {
  id: string;
  attendanceRecordId: string;
  beforeStatus: AttendanceStatus;
  afterStatus: AttendanceStatus;
  beforeNote: string | null;
  afterNote: string | null;
  reason: string;
  actorUserId: string | null;
  actorMembershipId: string | null;
  requestId: string | null;
  createdAt: string;
};

export type MakeupEntitlement = {
  id: string;
  studentId: string;
  sourceAttendanceRecordId: string;
  sourceSessionId: string;
  sourceEnrollmentId: string | null;
  status: "AVAILABLE" | "BOOKED" | "USED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  bookingId?: string | null;
  bookingDestinationSessionId?: string | null;
  bookingStatus?: "BOOKED" | "USED" | "CANCELLED" | null;
  createdAt: string;
  updatedAt: string;
};

export type MakeupBooking = {
  id: string;
  entitlementId: string;
  studentId: string;
  destinationSessionId: string;
  status: "BOOKED" | "USED" | "CANCELLED";
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
