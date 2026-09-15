export type CourseStatus = "ACTIVE" | "DISABLED";

export type Course = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
};

export type CourseInput = {
  code: string;
  name: string;
  description?: string | null;
  status: CourseStatus;
};

export type CourseClass = {
  id: string;
  tenantId: string;
  courseId: string;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  updatedAt: string;
};
