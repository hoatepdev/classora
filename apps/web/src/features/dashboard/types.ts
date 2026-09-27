export type DashboardStatus = string;

export type DashboardSessionCounts = {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  rescheduled: number;
};

export type DashboardUpcomingSession = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  classId?: string;
  className?: string;
  teacherName?: string;
  roomName?: string;
  branchName?: string;
  status: DashboardStatus;
};

export type AcademicDashboardSection = {
  activeStudentCount?: number;
  activeClassCount?: number;
  sessionsToday?: Partial<DashboardSessionCounts>;
  upcomingSessions?: DashboardUpcomingSession[];
  pendingAttendanceCount?: number;
  availableMakeupCount?: number;
  draftAssessmentCount?: number;
  draftProgressReportCount?: number;
};

export type DashboardReceivable = {
  invoiceId: string;
  invoiceNumber?: string;
  studentId?: string;
  studentName?: string;
  dueDate: string;
  outstandingVnd: number | string;
  daysOverdue: number;
};

export type DashboardBilling = {
  outstandingVnd?: number | string;
  overdueVnd?: number | string;
  collectedThisMonthVnd?: number | string;
};

export type DashboardCompensation = {
  draftPeriodCount?: number;
  unresolvedIssueCount?: number;
  latestFinalizedPayableVnd?: number | string;
};

export type FinanceDashboardSection = {
  billing?: DashboardBilling;
  overdueReceivables?: DashboardReceivable[];
  compensation?: DashboardCompensation;
};

export type DashboardLeadFollowUp = {
  leadId: string;
  studentName?: string;
  status?: DashboardStatus;
  assigneeName?: string;
  nextFollowUpAt?: string;
};

export type DashboardTrial = {
  id: string;
  leadId?: string;
  leadName?: string;
  sessionId?: string;
  sessionDate: string;
  startTime?: string;
  className?: string;
  status?: DashboardStatus;
};

export type GrowthDashboardSection = {
  activeLeadCount?: number;
  pipeline?: Partial<Record<"NEW" | "CONTACTED" | "QUALIFIED" | "TRIAL_BOOKED" | "TRIAL_COMPLETED", number>>;
  overdueFollowUpCount?: number;
  followUpsTodayCount?: number;
  upcomingTrialCount?: number;
  wonThisMonthCount?: number;
  followUps?: DashboardLeadFollowUp[];
  trials?: DashboardTrial[];
};

export type DashboardAttention = {
  type: string;
  severity: string;
  title: string;
  description?: string;
  date?: string;
  href?: string;
};

export type DashboardResponse = {
  generatedAt: string;
  businessDate: string;
  sections: {
    academic?: AcademicDashboardSection;
    finance?: FinanceDashboardSection;
    growth?: GrowthDashboardSection;
    attention?: DashboardAttention[];
  };
};
