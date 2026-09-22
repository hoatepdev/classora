import { z } from "zod";

export const classSchema = z.object({
  courseId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Chọn khóa học"),
  branchId: z.string(),
  courseLevelId: z.string(),
  defaultRoomId: z.string(),
  primaryTeacherId: z.string(),
  capacity: z.string().trim().refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) > 0), "Sức chứa phải là số lớn hơn 0"),
  startDate: z.string(),
  endDate: z.string(),
  code: z.string().trim().min(1, "Nhập mã lớp học").max(50, "Tối đa 50 ký tự"),
  name: z.string().trim().min(1, "Nhập tên lớp học").max(200, "Tối đa 200 ký tự"),
  description: z.string().trim().max(1000, "Tối đa 1000 ký tự"),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export type ClassFormValues = z.infer<typeof classSchema>;
