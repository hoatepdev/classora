export const statusLabels: Record<string, string> = {
  PENDING: "Chờ kích hoạt", TRIAL: "Học thử", ACTIVE: "Đang hoạt động", PAUSED: "Tạm dừng", COMPLETED: "Hoàn thành", WITHDRAWN: "Đã rút", CANCELLED: "Đã hủy",
  PRESENT: "Có mặt", LATE: "Đi muộn", ABSENT_EXCUSED: "Vắng có phép", ABSENT_UNEXCUSED: "Vắng không phép", ONLINE: "Trực tuyến", MAKEUP: "Học bù",
  RECORDED: "Đã ghi nhận", REVERSED: "Đã đảo ngược",
  NEW: "Mới", CONTACTED: "Đã liên hệ", QUALIFIED: "Đủ điều kiện", TRIAL_BOOKED: "Đã đặt học thử", TRIAL_COMPLETED: "Đã học thử", WON: "Thắng", LOST: "Thua",
};

export const sourceLabels: Record<string, string> = {
  REFERRAL: "Giới thiệu", FACEBOOK: "Facebook", GOOGLE: "Google", WALK_IN: "Trực tiếp", EXISTING_CUSTOMER: "Khách hàng hiện tại", OTHER: "Khác",
};

export const statusOptions: Record<string, string[]> = {
  "students-enrollments": ["PENDING", "TRIAL", "ACTIVE", "PAUSED", "COMPLETED", "WITHDRAWN", "CANCELLED"],
  attendance: ["PRESENT", "LATE", "ABSENT_EXCUSED", "ABSENT_UNEXCUSED", "ONLINE", "MAKEUP"],
  payments: ["RECORDED", "REVERSED"],
};

export const categoryLabels = { ACADEMIC: "Học vụ", FINANCE: "Tài chính", GROWTH: "Tăng trưởng", ORGANIZATION: "Tổ chức" } as const;

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
// Report business timezone is Asia/Ho_Chi_Minh; render instants there, not in the browser's zone.
const dateTime = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

function formatDateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function formatReportValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return "";
  if (key.toLowerCase().endsWith("vnd")) {
    try { return `${new Intl.NumberFormat("vi-VN").format(BigInt(String(value)))} ₫`; } catch { return String(value); }
  }
  if (key.toLowerCase().includes("rate") || key.toLowerCase().endsWith("pct") || key === "average") return `${number.format(Number(value))}%`;
  if (key.toLowerCase().endsWith("at")) return dateTime.format(new Date(String(value)));
  if (key.toLowerCase().includes("date") || /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatDateOnly(String(value));
  if (typeof value === "number") return number.format(value);
  return statusLabels[String(value)] ?? sourceLabels[String(value)] ?? String(value);
}

export function reportLink(row: Record<string, unknown>, key: string): string | undefined {
  if (key === "student" && row.studentId) return `/students/${row.studentId}`;
  if ((key === "class" || key === "className") && row.classId) return `/classes/${row.classId}`;
  if (key === "lead" && row.leadId) return `/leads/${row.leadId}`;
  if (key === "invoiceNumber") return "/billing/receivables";
  return undefined;
}
