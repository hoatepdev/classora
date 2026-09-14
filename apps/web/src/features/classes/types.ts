export type ClassStatus = "ACTIVE" | "DISABLED";

export type Class = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  status: ClassStatus;
  createdAt: string;
  updatedAt: string;
};

export type ClassInput = {
  code: string;
  name: string;
  description?: string | null;
  status: ClassStatus;
};
