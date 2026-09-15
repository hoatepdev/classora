import { z } from "zod";

export const classSchema = z.object({
  courseId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Chọn khóa học"),
  code: z.string().trim().min(1, "Nhập mã lớp học").max(50, "Tối đa 50 ký tự"),
  name: z.string().trim().min(1, "Nhập tên lớp học").max(200, "Tối đa 200 ký tự"),
  description: z.string().trim().max(1000, "Tối đa 1000 ký tự"),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export type ClassFormValues = z.infer<typeof classSchema>;
