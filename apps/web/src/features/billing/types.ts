export type BillingStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID" | "PENDING" | "REFUNDED" | "ACTIVE" | "INACTIVE";

export type BillingInvoice = {
  id: string;
  number: string;
  studentId: string;
  studentName: string;
  issuedAt: string;
  dueAt: string;
  total: number;
  paid: number;
  balance: number;
  status: BillingStatus | string;
};

export type BillingPayment = {
  id: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  studentId: string;
  studentName: string;
  amount: number;
  paidAt: string;
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
  dueAt: string;
  amount: number;
  daysOverdue: number;
  status: BillingStatus | string;
};

export type BillingPrice = {
  id: string;
  name: string;
  description?: string | null;
  amount: number;
  billingPeriod: string;
  status: BillingStatus | string;
  updatedAt: string;
};

export type BillingDiscount = {
  id: string;
  name: string;
  code?: string | null;
  type: "PERCENTAGE" | "FIXED" | string;
  value: number;
  startsAt?: string | null;
  endsAt?: string | null;
  usageCount?: number;
  status: BillingStatus | string;
};

export type BillingRefund = {
  id: string;
  paymentId: string;
  studentName: string;
  amount: number;
  requestedAt: string;
  reason?: string | null;
  status: BillingStatus | string;
};

export type BillingOverview = {
  currency: string;
  outstanding: number;
  overdue: number;
  collectedThisPeriod: number;
  dueThisPeriod: number;
  recentInvoices: BillingInvoice[];
  recentPayments: BillingPayment[];
};

export type RecordPaymentInput = {
  invoiceId: string;
  amount: number;
  paidAt: string;
  method: string;
  reference?: string;
};

export type RequestRefundInput = {
  paymentId: string;
  amount: number;
  reason: string;
};
