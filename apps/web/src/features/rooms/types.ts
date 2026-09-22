export type RoomStatus = "ACTIVE" | "DISABLED";

export type Room = {
  id: string;
  tenantId: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  code: string;
  name: string;
  capacity: number | null;
  notes: string | null;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
};

export type RoomInput = {
  branchId?: string | null;
  code: string;
  name: string;
  capacity?: number | null;
  notes?: string | null;
  status: RoomStatus;
};
