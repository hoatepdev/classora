export type EnrollmentStatus = "ACTIVE" | "WITHDRAWN";

export type Enrollment = {
  id: string;
  tenantId: string;
  studentId: string;
  classId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
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
