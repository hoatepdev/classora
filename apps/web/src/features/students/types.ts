export type StudentStatus = "ACTIVE" | "DISABLED";

export type Student = {
  id: string;
  tenantId: string;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  status: StudentStatus;
  gender: string | null;
  address: string | null;
  school: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudentInput = {
  code: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  status: StudentStatus;
  gender?: string | null;
  address?: string | null;
  school?: string | null;
  source?: string | null;
};
