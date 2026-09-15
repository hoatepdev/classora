import { z } from "zod";

export const courseSchema = z.object({
  code: z.string().trim().min(1, "Nhập mã khóa học").max(50, "Tối đa 50 ký tự"),
  name: z.string().trim().min(1, "Nhập tên khóa học").max(200, "Tối đa 200 ký tự"),
  description: z.string().trim().max(1000, "Tối đa 1000 ký tự"),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export type CourseFormValues = z.infer<typeof courseSchema>;
