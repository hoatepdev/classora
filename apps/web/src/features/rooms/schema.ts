import { z } from "zod";

export const roomSchema = z.object({
  branchId: z.string().min(1, "Chọn chi nhánh"),
  code: z.string().trim().min(1, "Nhập mã phòng").max(50, "Tối đa 50 ký tự"),
  name: z.string().trim().min(1, "Nhập tên phòng").max(200, "Tối đa 200 ký tự"),
  capacity: z.string().trim().refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) > 0), "Sức chứa phải là số lớn hơn 0"),
  note: z.string().trim().max(1000, "Tối đa 1000 ký tự"),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export type RoomFormValues = z.infer<typeof roomSchema>;
