export type ClassStatus = "ACTIVE" | "DISABLED";

export type Class = {
  id: string;
  tenantId: string;
  courseId: string | null;
  courseCode: string | null;
  courseName: string | null;
  code: string;
  name: string;
  description: string | null;
  status: ClassStatus;
  createdAt: string;
  updatedAt: string;
};

export type ClassInput = {
  courseId: string;
  code: string;
  name: string;
  description?: string | null;
  status: ClassStatus;
};
