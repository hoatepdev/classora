export type TeacherStatus = "ACTIVE" | "DISABLED";

export type Teacher = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  status: TeacherStatus;
  createdAt: string;
  updatedAt: string;
};

export type TeacherInput = {
  code: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  status: TeacherStatus;
};
