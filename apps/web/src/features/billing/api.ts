import { api } from "@/lib/api";
import type { BillingDiscount, BillingInvoice, BillingOverview, BillingPayment, BillingPrice, BillingReceivable, BillingRefund, RecordPaymentInput, RequestRefundInput } from "./types.js";

export const billingQueryKey = (resource: string, params = "") => ["billing", resource, window.location.hostname, params] as const;
export async function getBillingOverview() { return (await api.get<BillingOverview>("/billing/overview")).data; }
export async function listInvoices() { return (await api.get<BillingInvoice[]>("/billing/invoices")).data; }
export async function listPayments() { return (await api.get<BillingPayment[]>("/billing/payments")).data; }
export async function listReceivables() { return (await api.get<BillingReceivable[]>("/billing/receivables")).data; }
export async function listPrices() { return (await api.get<BillingPrice[]>("/billing/pricing")).data; }
export async function listDiscounts() { return (await api.get<BillingDiscount[]>("/billing/discounts")).data; }
export async function listRefunds() { return (await api.get<BillingRefund[]>("/billing/refunds")).data; }
export async function recordPayment(input: RecordPaymentInput) { return (await api.post<BillingPayment>("/billing/payments", input)).data; }
export async function requestRefund(input: RequestRefundInput) { return (await api.post<BillingRefund>("/billing/refunds", input)).data; }
