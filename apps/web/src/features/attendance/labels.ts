import type { AttendanceStatus } from "./types.js";

export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  UNMARKED: "Chưa điểm danh",
  PRESENT: "Có mặt",
  LATE: "Đi trễ",
  ABSENT_EXCUSED: "Vắng có phép",
  ABSENT_UNEXCUSED: "Vắng không phép",
  ONLINE: "Học trực tuyến",
  MAKEUP: "Học bù",
};
