import { z } from "zod";

const time = /^([01]\d|2[0-3]):[0-5]\d$/;

export const attendanceSessionSchema = z.object({
  sessionDate: z.iso.date("Chọn ngày hợp lệ"),
  scheduleId: z.string(),
  teacherId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
}).superRefine((value, context) => {
  if (value.scheduleId) return;
  if (!time.test(value.startTime)) {
    context.addIssue({ code: "custom", message: "Nhập giờ bắt đầu hợp lệ", path: ["startTime"] });
  }
  if (!time.test(value.endTime) || value.startTime >= value.endTime) {
    context.addIssue({ code: "custom", message: "Giờ kết thúc phải sau giờ bắt đầu", path: ["endTime"] });
  }
});

export type AttendanceSessionFormValues = z.infer<typeof attendanceSessionSchema>;
