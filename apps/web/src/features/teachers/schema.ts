import { z } from "zod";

export const teacherSchema = z.object({
  code: z.string().trim().min(1, "Nhập mã giáo viên").max(50, "Tối đa 50 ký tự"),
  name: z.string().trim().min(1, "Nhập họ và tên").max(200, "Tối đa 200 ký tự"),
  phone: z.string().trim().max(50, "Tối đa 50 ký tự"),
  email: z.string().trim().pipe(z.union([z.literal(""), z.email("Email không hợp lệ")])),
  note: z.string().trim().max(1000, "Tối đa 1000 ký tự"),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export type TeacherFormValues = z.infer<typeof teacherSchema>;
