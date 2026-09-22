export type BranchStatus = "ACTIVE" | "DISABLED";

export type Branch = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: BranchStatus;
  notes: string | null;
  roomCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BranchInput = {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  status: BranchStatus;
  notes?: string | null;
};
