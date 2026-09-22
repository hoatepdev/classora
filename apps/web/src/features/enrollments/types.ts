export type EnrollmentStatus = "PENDING" | "TRIAL" | "ACTIVE" | "PAUSED" | "COMPLETED" | "WITHDRAWN" | "CANCELLED";

export type Enrollment = {
  id: string;
  tenantId: string;
  studentId: string;
  classId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  pauseStartedAt: string | null;
  expectedEndDate: string | null;
  sourceEnrollmentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClassStudentEnrollment = Enrollment & {
  studentCode: string;
  studentFullName: string;
};

export type StudentClassEnrollment = Enrollment & {
  classCode: string;
  className: string;
};

export type EnrollmentEvent = {
  id: string;
  type: string;
  fromStatus: EnrollmentStatus | null;
  toStatus: EnrollmentStatus | null;
  fromClassId: string | null;
  toClassId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  actorUserId: string | null;
  actorMembershipId: string | null;
  occurredAt: string;
};
