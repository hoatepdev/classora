export type CommunicationEventType =
  | "SESSION_REMINDER"
  | "SCHEDULE_CHANGED"
  | "ATTENDANCE_ABSENCE"
  | "TUITION_DUE"
  | "TUITION_OVERDUE"
  | "PAYMENT_RECEIVED"
  | "TRIAL_REMINDER"
  | "ENROLLMENT_EXPIRING";

export type CommunicationChannel = "IN_APP" | "EMAIL";
export type CommunicationStatus = "PENDING" | "SENT" | "FAILED" | "CANCELLED";
export type CommunicationRecipientType = "STUDENT" | "GUARDIAN" | "LEAD" | "MEMBERSHIP";

export type CommunicationMessage = {
  id: string;
  eventType: CommunicationEventType;
  channel: CommunicationChannel;
  recipientType: CommunicationRecipientType;
  recipientId: string | null;
  recipientName: string | null;
  destination: string | null;
  subject: string | null;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  dedupeKey: string;
  status: CommunicationStatus;
  provider: string | null;
  providerMessageId: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  failedAt: string | null;
};

export type TemplateVariable = { name: string; required: boolean };

export type CommunicationTemplateView = {
  eventType: CommunicationEventType;
  channel: CommunicationChannel;
  timing: "IMMEDIATE" | "TIME_BASED";
  variables: TemplateVariable[];
  hasOverride: boolean;
  enabled: boolean;
  effectiveSubject: string | null;
  effectiveBody: string;
};

export type CommunicationTemplatePreview = {
  eventType: CommunicationEventType;
  channel: CommunicationChannel;
  subject: string | null;
  body: string;
  variables: TemplateVariable[];
};

export type CommunicationListFilters = {
  eventType?: string;
  channel?: string;
  status?: string;
  from?: string;
  to?: string;
  recipient?: string;
  studentId?: string;
  leadId?: string;
  cursor?: string;
  limit?: number;
};

export const communicationEventLabels: Record<CommunicationEventType, string> = {
  SESSION_REMINDER: "Nhắc buổi học",
  SCHEDULE_CHANGED: "Thay đổi lịch học",
  ATTENDANCE_ABSENCE: "Vắng mặt",
  TUITION_DUE: "Học phí sắp đến hạn",
  TUITION_OVERDUE: "Học phí quá hạn",
  PAYMENT_RECEIVED: "Đã nhận thanh toán",
  TRIAL_REMINDER: "Nhắc học thử",
  ENROLLMENT_EXPIRING: "Khóa học sắp kết thúc",
};

export const communicationStatusLabels: Record<CommunicationStatus, string> = {
  PENDING: "Chờ gửi",
  SENT: "Đã gửi",
  FAILED: "Lỗi gửi",
  CANCELLED: "Đã hủy",
};

export const communicationChannelLabels: Record<CommunicationChannel, string> = {
  IN_APP: "Trong ứng dụng",
  EMAIL: "Email",
};

export const communicationRecipientLabels: Record<CommunicationRecipientType, string> = {
  STUDENT: "Học viên",
  GUARDIAN: "Người giám hộ",
  LEAD: "Khách tiềm năng",
  MEMBERSHIP: "Thành viên",
};

export const relatedEntityLabels: Record<string, string> = {
  Payment: "Thanh toán",
  Session: "Buổi học",
  AttendanceRecord: "Bản ghi điểm danh",
  Invoice: "Hóa đơn",
  TrialBooking: "Buổi học thử",
  Enrollment: "Ghi danh",
};
