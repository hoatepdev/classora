import type { GuardianRelationship, LeadSource, LeadStatus, LostReason, TrialOutcomeValue } from "./types.js";

export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: "Mới",
  CONTACTED: "Đã liên hệ",
  QUALIFIED: "Đủ điều kiện",
  TRIAL_BOOKED: "Đã đặt học thử",
  TRIAL_COMPLETED: "Đã học thử",
  WON: "Thành công",
  LOST: "Đã mất",
};

export const leadSourceLabels: Record<LeadSource, string> = {
  REFERRAL: "Giới thiệu",
  FACEBOOK: "Facebook",
  GOOGLE: "Google",
  WALK_IN: "Ghé trực tiếp",
  EXISTING_CUSTOMER: "Học viên hiện tại",
  OTHER: "Khác",
};

export const lostReasonLabels: Record<LostReason, string> = {
  PRICE: "Học phí",
  SCHEDULE: "Lịch học",
  NO_RESPONSE: "Không phản hồi",
  COMPETITOR: "Chọn trung tâm khác",
  NOT_INTERESTED: "Không còn quan tâm",
  LOCATION: "Vị trí",
  OTHER: "Khác",
};

export const guardianRelationshipLabels: Record<GuardianRelationship, string> = {
  MOTHER: "Mẹ",
  FATHER: "Bố",
  GRANDPARENT: "Ông/Bà",
  GUARDIAN: "Người giám hộ",
  OTHER: "Khác",
};

export const trialOutcomeLabels: Record<TrialOutcomeValue, string> = {
  ENROLL: "Sẵn sàng ghi danh",
  FOLLOW_UP: "Tiếp tục chăm sóc",
  LOST: "Đánh mất",
};

export const bookingStatusLabels: Record<"BOOKED" | "COMPLETED" | "NO_SHOW" | "CANCELLED", string> = {
  BOOKED: "Đã đặt",
  COMPLETED: "Đã tham dự",
  NO_SHOW: "Vắng mặt",
  CANCELLED: "Đã hủy",
};

export const leadEventLabels: Record<string, string> = {
  CREATED: "Tạo lead",
  UPDATED: "Cập nhật",
  ASSIGNED: "Phân công",
  CONTACTED: "Đã liên hệ",
  QUALIFIED: "Đủ điều kiện",
  FOLLOW_UP_CHANGED: "Đổi lịch chăm sóc",
  NOTE_ADDED: "Ghi chú",
  TRIAL_BOOKED: "Đặt học thử",
  TRIAL_CANCELLED: "Hủy học thử",
  TRIAL_COMPLETED: "Kết thúc học thử",
  TRIAL_OUTCOME: "Kết quả học thử",
  CONVERTED: "Chuyển đổi thành công",
  LOST: "Đánh mất",
};

export const activeBoardStatuses = ["NEW", "CONTACTED", "QUALIFIED", "TRIAL_BOOKED", "TRIAL_COMPLETED"] as const;
