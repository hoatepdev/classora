export type ClassStatus = "ACTIVE" | "DISABLED";

export type Class = {
  id: string;
  tenantId: string;
  courseId: string | null;
  courseCode: string | null;
  courseName: string | null;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
  courseLevelId: string | null;
  courseLevelCode: string | null;
  courseLevelName: string | null;
  defaultRoomId: string | null;
  defaultRoomCode: string | null;
  defaultRoomName: string | null;
  primaryTeacherId: string | null;
  primaryTeacherName: string | null;
  capacity: number | null;
  startDate: string | null;
  endDate: string | null;
  code: string;
  name: string;
  description: string | null;
  status: ClassStatus;
  createdAt: string;
  updatedAt: string;
};

export type ClassInput = {
  courseId: string;
  branchId?: string | null;
  courseLevelId?: string | null;
  defaultRoomId?: string | null;
  primaryTeacherId?: string | null;
  capacity?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  code: string;
  name: string;
  description?: string | null;
  status: ClassStatus;
};
