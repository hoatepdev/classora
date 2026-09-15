import type { AttendanceStatus } from "./types.js";

export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  LATE: "Đi trễ",
  EXCUSED: "Có phép",
};
