import { z } from "zod";

const optionalEmail = z.string().trim().refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Email không hợp lệ");
const optionalDatetime = z.string().refine((value) => {
  if (!value) return true;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf());
}, "Thời gian không hợp lệ");

export const leadSchema = z.object({
  studentName: z.string().trim().min(1, "Nhập tên học viên tiềm năng").max(200, "Tối đa 200 ký tự"),
  studentPhone: z.string().trim().max(50, "Tối đa 50 ký tự"),
  studentEmail: optionalEmail,
  guardianName: z.string().trim().max(200, "Tối đa 200 ký tự"),
  guardianPhone: z.string().trim().max(50, "Tối đa 50 ký tự"),
  guardianEmail: optionalEmail,
  source: z.string(),
  campaign: z.string().trim().max(200, "Tối đa 200 ký tự"),
  interestedCourseId: z.string(),
  interestedCourseLevelId: z.string(),
  preferredBranchId: z.string(),
  assignedMembershipId: z.string(),
  nextFollowUpAt: optionalDatetime,
});

export type LeadFormValues = z.infer<typeof leadSchema>;
