import { z } from "zod";

const optionalDate = z.string().refine((value) => {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}, "Ngày sinh không hợp lệ");

export const studentSchema = z.object({
  code: z.string().trim().min(1, "Nhập mã học viên").max(50, "Tối đa 50 ký tự"),
  fullName: z.string().trim().min(1, "Nhập họ và tên").max(200, "Tối đa 200 ký tự"),
  phone: z.string().trim().max(50, "Tối đa 50 ký tự"),
  email: z.union([z.literal(""), z.email("Email không hợp lệ")]),
  dateOfBirth: optionalDate,
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export type StudentFormValues = z.infer<typeof studentSchema>;
