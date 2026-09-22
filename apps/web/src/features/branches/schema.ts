import { z } from "zod";

export const branchSchema = z.object({
  code: z.string().trim().min(1, "Nhập mã chi nhánh").max(50, "Tối đa 50 ký tự"),
  name: z.string().trim().min(1, "Nhập tên chi nhánh").max(200, "Tối đa 200 ký tự"),
  address: z.string().trim().max(300, "Tối đa 300 ký tự"),
  phone: z.string().trim().max(50, "Tối đa 50 ký tự"),
  email: z.string().trim().pipe(z.union([z.literal(""), z.email("Email không hợp lệ")])),
  status: z.enum(["ACTIVE", "DISABLED"]),
  notes: z.string().trim().max(1000, "Tối đa 1000 ký tự"),
});

export type BranchFormValues = z.infer<typeof branchSchema>;
