import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CircleDollarSign, CreditCard, FileText, HandCoins, Percent, Receipt, RotateCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getApiErrorMessage } from "@/lib/api";
import { FinanceNavigation } from "../finance/FinanceNavigation.js";
import { billingDiscountsQueryKey, billingInvoicesQueryKey, billingOverviewQueryKey, billingPaymentsQueryKey, billingPricesQueryKey, billingReceivablesQueryKey, billingRefundsQueryKey, getBillingOverview, listDiscounts, listInvoices, listPayments, listPrices, listReceivables, listRefunds, recordPayment, requestRefund } from "./api";
import type { BillingDiscount, BillingInvoice, BillingPayment, BillingPrice, BillingReceivable, BillingRefund } from "./types";

type Section = "overview" | "invoices" | "payments" | "receivables" | "pricing" | "discounts" | "refunds";
const sections: Array<{ id: Section; label: string; icon: typeof FileText }> = [
  { id: "overview", label: "Tổng quan", icon: Wallet },
  { id: "invoices", label: "Hóa đơn", icon: FileText },
  { id: "payments", label: "Thanh toán", icon: CreditCard },
  { id: "receivables", label: "Công nợ", icon: HandCoins },
  { id: "pricing", label: "Bảng giá", icon: Receipt },
  { id: "discounts", label: "Giảm giá", icon: Percent },
  { id: "refunds", label: "Hoàn tiền", icon: RotateCcw },
];
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });
const displayDate = (value?: string | null) => value ? date.format(new Date(value)) : "—";
const displayMoney = (value?: string | null) => value && /^\d+$/.test(value) ? `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ₫` : "—";

export function BillingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split("/")[2] as Section | undefined;
  const section: Section = sections.some((item) => item.id === segment) ? segment! : "overview";
  const select = (id: Section) => navigate(id === "overview" ? "/billing" : `/billing/${id}`);

  return <PageContainer>
    <PageHeader title="Học phí & thanh toán" description="Theo dõi hóa đơn, thu học phí và công nợ của trung tâm." />
    <FinanceNavigation />
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-[#e2e8f0]" aria-label="Các chức năng học phí">
      {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => select(id)} aria-current={section === id ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${section === id ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-[#64748b] hover:border-[#cbd5e1] hover:text-[#0f172a]"}`}><Icon size={16} aria-hidden="true" />{label}</button>)}
    </nav>
    {section === "overview" && <Overview />}
    {section === "invoices" && <Invoices />}
    {section === "payments" && <Payments />}
    {section === "receivables" && <Receivables />}
    {section === "pricing" && <Pricing />}
    {section === "discounts" && <Discounts />}
    {section === "refunds" && <Refunds />}
  </PageContainer>;
}

function Overview() {
  const query = useQuery({ queryKey: billingOverviewQueryKey(), queryFn: getBillingOverview });
  if (query.isPending) return <LoadingState label="Đang tải tổng quan học phí" />;
  if (query.isError) return <ErrorState title="Không thể tải tổng quan học phí" message={getApiErrorMessage(query.error, "Kiểm tra kết nối và thử lại.")} onRetry={() => void query.refetch()} />;
  const overview = query.data;
  return <div className="grid gap-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Đang phải thu" value={displayMoney(overview.outstanding)} tone="blue" />
      <Metric label="Quá hạn" value={displayMoney(overview.overdue)} tone="red" />
      <Metric label="Đã thu kỳ này" value={displayMoney(overview.collectedThisPeriod)} tone="green" />
      <Metric label="Đến hạn kỳ này" value={displayMoney(overview.dueThisPeriod)} tone="amber" />
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <section><SectionHeading title="Hóa đơn gần đây" href="/billing/invoices" /><InvoiceTable rows={overview.recentInvoices} /></section>
      <section><SectionHeading title="Thanh toán gần đây" href="/billing/payments" /><PaymentTable rows={overview.recentPayments} /></section>
    </div>
  </div>;
}

function Invoices() {
  const query = useQuery({ queryKey: billingInvoicesQueryKey(), queryFn: listInvoices });
  return <ListState query={query} title="Hóa đơn" description="Danh sách học phí đã phát hành và trạng thái thu." render={(rows) => <InvoiceTable rows={rows} />} />;
}
function Payments() {
  const query = useQuery({ queryKey: billingPaymentsQueryKey(), queryFn: listPayments });
  const [open, setOpen] = useState(false);
  return <><PageHeader title="Thanh toán" description="Ghi nhận và đối soát các khoản học phí đã thu." primaryAction={<Button onClick={() => setOpen(true)}><CreditCard size={16} aria-hidden="true" />Ghi nhận thanh toán</Button>} /><ListState query={query} title="Lịch sử thanh toán" render={(rows) => <PaymentTable rows={rows} />} /><PaymentDialog open={open} onOpenChange={setOpen} /></>;
}
function Receivables() {
  const query = useQuery({ queryKey: billingReceivablesQueryKey(), queryFn: listReceivables });
  return <ListState query={query} title="Công nợ" description="Các khoản phải thu cần được theo dõi và xử lý." render={(rows) => <ReceivableTable rows={rows} />} />;
}
function Pricing() {
  const query = useQuery({ queryKey: billingPricesQueryKey(), queryFn: listPrices });
  return <ListState query={query} title="Bảng giá" description="Các gói học phí đang được trung tâm áp dụng." render={(rows) => <PriceTable rows={rows} />} />;
}
function Discounts() {
  const query = useQuery({ queryKey: billingDiscountsQueryKey(), queryFn: listDiscounts });
  return <ListState query={query} title="Chương trình giảm giá" description="Quản lý các chính sách ưu đãi học phí." render={(rows) => <DiscountTable rows={rows} />} />;
}
function Refunds() {
  const query = useQuery({ queryKey: billingRefundsQueryKey(), queryFn: listRefunds });
  const [open, setOpen] = useState(false);
  return <><PageHeader title="Hoàn tiền" description="Theo dõi các yêu cầu hoàn tiền học phí." primaryAction={<Button onClick={() => setOpen(true)}><RotateCcw size={16} aria-hidden="true" />Tạo yêu cầu hoàn tiền</Button>} /><ListState query={query} title="Yêu cầu hoàn tiền" render={(rows) => <RefundTable rows={rows} />} /><RefundDialog open={open} onOpenChange={setOpen} /></>;
}

function ListState<T>({ query, title, description, render }: { query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown; data?: T[] }; title: string; description?: string; render: (rows: T[]) => React.ReactNode }) {
  if (query.isPending) return <LoadingState label={`Đang tải ${title.toLowerCase()}`} />;
  if (query.isError) return <ErrorState title={`Không thể tải ${title.toLowerCase()}`} message={getApiErrorMessage(query.error, "Kiểm tra kết nối và thử lại.")} onRetry={() => void query.refetch()} />;
  return <section aria-label={title}><div className="mb-3"><h2 className="m-0 text-lg font-semibold text-[#0f172a]">{title}</h2>{description && <p className="mt-1 mb-0 text-sm text-[#64748b]">{description}</p>}</div>{query.data?.length ? render(query.data) : <EmptyState icon={CircleDollarSign} title={`Chưa có ${title.toLowerCase()}`} description="Dữ liệu sẽ xuất hiện ở đây khi có phát sinh." />}</section>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "blue" | "red" | "green" | "amber" }) { const styles = { blue: "bg-[#eff6ff] text-[#1d4ed8]", red: "bg-[#fff1f2] text-[#be123c]", green: "bg-[#f0fdf4] text-[#15803d]", amber: "bg-[#fffbeb] text-[#b45309]" }; return <div className="rounded-xl border border-[#e2e8f0] bg-white p-5"><div className={`mb-5 grid size-9 place-items-center rounded-lg ${styles[tone]}`}><CircleDollarSign size={18} aria-hidden="true" /></div><p className="m-0 text-sm text-[#64748b]">{label}</p><p className="mt-1 mb-0 text-xl font-bold tracking-tight text-[#0f172a]">{value}</p></div>; }
function SectionHeading({ title, href }: { title: string; href: string }) { return <div className="mb-3 flex items-center justify-between"><h2 className="m-0 text-lg font-semibold text-[#0f172a]">{title}</h2><Link className="text-sm font-semibold text-[#2563eb] hover:underline" to={href}>Xem tất cả</Link></div>; }
function Table({ children }: { children: React.ReactNode }) { return <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white"><table className="w-full text-left text-sm"><tbody>{children}</tbody></table></div>; }
function Header({ children }: { children: React.ReactNode }) { return <thead><tr className="bg-[#f8fafc] text-xs font-semibold text-[#64748b]">{children}</tr></thead>; }
function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-3 ${className}`}>{children}</td>; }
function EmptyCell() { return <Cell>—</Cell>; }
function InvoiceTable({ rows }: { rows: BillingInvoice[] }) { return <Table><Header><th className="px-4 py-3">Hóa đơn</th><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Hạn thanh toán</th><th className="px-4 py-3 text-right">Còn phải thu</th><th className="px-4 py-3">Trạng thái</th></Header>{rows.map((row) => <tr className="border-t border-[#f1f5f9]" key={row.id}><Cell className="font-semibold">{row.invoiceNumber ?? row.number ?? row.id}</Cell><Cell>{row.studentName ?? "—"}</Cell><Cell>{displayDate(row.dueDate ?? row.dueAt)}</Cell><Cell className="text-right font-semibold">{displayMoney(row.outstandingVnd ?? row.balance)}</Cell><Cell><State value={row.effectiveStatus ?? row.status} /></Cell></tr>)}</Table>; }
function PaymentTable({ rows }: { rows: BillingPayment[] }) { return <Table><Header><th className="px-4 py-3">Ngày thu</th><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Hóa đơn</th><th className="px-4 py-3 text-right">Số tiền</th><th className="px-4 py-3">Phương thức</th></Header>{rows.map((row) => <tr className="border-t border-[#f1f5f9]" key={row.id}><Cell>{displayDate(row.receivedAt ?? row.paidAt)}</Cell><Cell>{row.studentName ?? "—"}</Cell><Cell>{row.invoiceNumber ?? "—"}</Cell><Cell className="text-right font-semibold">{displayMoney(row.amountVnd ?? row.amount)}</Cell><Cell>{row.method || "—"}</Cell></tr>)}</Table>; }
function ReceivableTable({ rows }: { rows: BillingReceivable[] }) { return <Table><Header><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Hóa đơn</th><th className="px-4 py-3">Hạn thanh toán</th><th className="px-4 py-3 text-right">Số tiền</th><th className="px-4 py-3">Quá hạn</th></Header>{rows.map((row) => <tr className="border-t border-[#f1f5f9]" key={row.id}><Cell className="font-semibold">{row.studentName}</Cell><Cell>{row.invoiceNumber ?? "—"}</Cell><Cell>{displayDate(row.dueDate ?? row.dueAt)}</Cell><Cell className="text-right font-semibold">{displayMoney(row.amount)}</Cell><Cell>{row.daysOverdue > 0 ? `${row.daysOverdue} ngày` : "Chưa quá hạn"}</Cell></tr>)}</Table>; }
function PriceTable({ rows }: { rows: BillingPrice[] }) { return <Table><Header><th className="px-4 py-3">Tên bảng giá</th><th className="px-4 py-3">Mô tả</th><th className="px-4 py-3">Chu kỳ</th><th className="px-4 py-3 text-right">Mức phí</th><th className="px-4 py-3">Trạng thái</th></Header>{rows.map((row) => <tr className="border-t border-[#f1f5f9]" key={row.id}><Cell className="font-semibold">{row.name}</Cell><Cell>{row.description ?? "—"}</Cell><Cell>{row.billingPeriod}</Cell><Cell className="text-right font-semibold">{displayMoney(row.amount)}</Cell><Cell><State value={row.status} /></Cell></tr>)}</Table>; }
function DiscountTable({ rows }: { rows: BillingDiscount[] }) { return <Table><Header><th className="px-4 py-3">Chương trình</th><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Mức giảm</th><th className="px-4 py-3">Thời gian</th><th className="px-4 py-3">Trạng thái</th></Header>{rows.map((row) => <tr className="border-t border-[#f1f5f9]" key={row.id}><Cell className="font-semibold">{row.name}</Cell><Cell>{row.code ?? "—"}</Cell><Cell>{row.type === "PERCENTAGE" ? `${row.value}%` : displayMoney(row.value)}</Cell><Cell>{displayDate(row.startsAt)} — {displayDate(row.endsAt)}</Cell><Cell><State value={row.status} /></Cell></tr>)}</Table>; }
function RefundTable({ rows }: { rows: BillingRefund[] }) { return <Table><Header><th className="px-4 py-3">Ngày yêu cầu</th><th className="px-4 py-3">Học viên</th><th className="px-4 py-3 text-right">Số tiền</th><th className="px-4 py-3">Lý do</th><th className="px-4 py-3">Trạng thái</th></Header>{rows.map((row) => <tr className="border-t border-[#f1f5f9]" key={row.id}><Cell>{displayDate(row.requestedAt)}</Cell><Cell>{row.studentName}</Cell><Cell className="text-right font-semibold">{displayMoney(row.amount)}</Cell><Cell>{row.reason ?? "—"}</Cell><Cell><State value={row.status} /></Cell></tr>)}</Table>; }
function State({ value }: { value: string }) { const labels: Record<string, string> = { PAID: "Đã thanh toán", PARTIALLY_PAID: "Đã thanh toán một phần", OVERDUE: "Quá hạn", ISSUED: "Đã phát hành", DRAFT: "Nháp", ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động", PENDING: "Đang chờ xử lý", REFUNDED: "Đã hoàn tiền", VOID: "Đã hủy" }; return <span className="inline-flex rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#475569]">{labels[value] ?? value}</span>; }

function PaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const validAmount = /^[1-9]\d*$/.test(amount);
  const mutation = useMutation({
    mutationFn: () => recordPayment({ invoiceId, amountVnd: amount, method, receivedAt: `${paidAt}T00:00:00.000Z`, idempotencyKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: billingPaymentsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: billingInvoicesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: billingReceivablesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: billingOverviewQueryKey() });
      onOpenChange(false);
      toast.success("Đã ghi nhận thanh toán.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể ghi nhận thanh toán.")),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Ghi nhận thanh toán</DialogTitle><DialogDescription>Nhập thông tin khoản thu đã nhận từ học viên.</DialogDescription></DialogHeader><div className="grid gap-4"><Field label="Mã hóa đơn"><Input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="ID hóa đơn" /></Field><Field label="Số tiền"><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></Field><Field label="Ngày thu"><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field><Field label="Phương thức"><select className="min-h-10.5 rounded-lg border border-input bg-card px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Tiền mặt</option><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CARD">Thẻ</option></select></Field></div><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Hủy</Button><Button disabled={mutation.isPending || !invoiceId || !validAmount} onClick={() => mutation.mutate()}>Lưu thanh toán</Button></DialogFooter></DialogContent></Dialog>;
}
function RefundDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const validAmount = /^[1-9]\d*$/.test(amount);
  const mutation = useMutation({
    mutationFn: () => requestRefund({ paymentId, amountVnd: amount, reason, idempotencyKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: billingRefundsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: billingInvoicesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: billingReceivablesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: billingOverviewQueryKey() });
      onOpenChange(false);
      toast.success("Đã tạo yêu cầu hoàn tiền.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể tạo yêu cầu hoàn tiền.")),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Tạo yêu cầu hoàn tiền</DialogTitle><DialogDescription>Yêu cầu sẽ được lưu để bộ phận có quyền xử lý tiếp.</DialogDescription></DialogHeader><div className="grid gap-4"><Field label="Mã thanh toán"><Input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} placeholder="ID thanh toán" /></Field><Field label="Số tiền"><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></Field><Field label="Lý do"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do hoàn tiền" /></Field></div><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Hủy</Button><Button disabled={mutation.isPending || !paymentId || !validAmount || !reason.trim()} onClick={() => mutation.mutate()}>Tạo yêu cầu</Button></DialogFooter></DialogContent></Dialog>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm font-semibold text-[#334155]">{label}{children}</label>; }
