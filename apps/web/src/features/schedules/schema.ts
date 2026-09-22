import { z } from "zod";
import { dayOfWeeks } from "./types.js";

const time = /^([01]\d|2[0-3]):[0-5]\d$/;

export const scheduleSchema = z.object({
  teacherId: z.string().min(1, "Chọn giáo viên"),
  dayOfWeek: z.enum(dayOfWeeks),
  startTime: z.string().regex(time, "Nhập giờ bắt đầu hợp lệ"),
  endTime: z.string().regex(time, "Nhập giờ kết thúc hợp lệ"),
  roomId: z.string(),
  status: z.enum(["ACTIVE", "DISABLED"]),
}).refine((value) => value.startTime < value.endTime, {
  message: "Giờ bắt đầu phải sớm hơn giờ kết thúc",
  path: ["endTime"],
});

export type ScheduleFormValues = z.infer<typeof scheduleSchema>;
