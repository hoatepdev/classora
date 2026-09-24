export type BillingStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID" | "PENDING" | "REFUNDED" | "ACTIVE" | "INACTIVE";

export type BillingInvoice = {
  id: string;
  invoiceNumber?: string | null;
  number?: string | null;
  studentId: string;
  studentName?: string | null;
  issueDate?: string | null;
  issuedAt?: string | null;
  dueDate?: string | null;
  dueAt?: string | null;
  totalVnd?: string;
  total?: string;
  paidVnd?: string;
  paid?: string;
  outstandingVnd?: string;
  balance?: string;
  status: BillingStatus | string;
  effectiveStatus?: BillingStatus | string;
};

export type BillingPayment = {
  id: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  studentId: string | null;
  studentName: string | null;
  amountVnd?: string;
  amount?: string;
  receivedAt?: string;
  paidAt?: string;
  method: string;
  reference?: string | null;
  status: BillingStatus | string;
};

export type BillingReceivable = {
  id: string;
  studentId: string;
  studentName: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  dueDate?: string | null;
  dueAt?: string | null;
  amount: string;
  daysOverdue: number;
  status: BillingStatus | string;
};

export type BillingPrice = {
  id: string;
  name: string;
  description?: string | null;
  amount: string;
  billingPeriod: string;
  status: BillingStatus | string;
  updatedAt: string;
};

export type BillingDiscount = {
  id: string;
  name: string;
  code?: string | null;
  type: "PERCENTAGE" | "FIXED" | string;
  value: string;
  startsAt?: string | null;
  endsAt?: string | null;
  usageCount?: number;
  status: BillingStatus | string;
};

export type BillingRefund = {
  id: string;
  paymentId: string;
  studentName: string;
  amount: string;
  requestedAt: string;
  reason?: string | null;
  status: BillingStatus | string;
};

export type BillingOverview = {
  currency: string;
  outstanding: string;
  overdue: string;
  collectedThisPeriod: string;
  dueThisPeriod: string;
  recentInvoices: BillingInvoice[];
  recentPayments: BillingPayment[];
};

export type RecordPaymentInput = {
  invoiceId: string;
  amountVnd: string;
  receivedAt: string;
  method: string;
  idempotencyKey: string;
  reference?: string;
};

export type RequestRefundInput = {
  paymentId: string;
  amountVnd: string;
  reason: string;
  idempotencyKey: string;
};
