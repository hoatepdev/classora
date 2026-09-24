import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { addCompensationAdjustment, compensationStatementQueryKey, compensationStatementsQueryKey, getCompensationStatement, removeCompensationAdjustment } from "./api.js";
import { formatCompensationDate as date } from "./format.js";
import type { CompensationAdjustment, CompensationBasis } from "./types.js";

const money = (value: string) => `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ₫`;
const basisLabels: Record<CompensationBasis, string> = { PER_SESSION: "Theo buổi", PER_HOUR: "Theo giờ", FIXED_CLASS: "Theo lớp" };

export function CompensationStatementPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [adjustmentDialog, setAdjustmentDialog] = useState(false);
  const [removing, setRemoving] = useState<CompensationAdjustment | null>(null);
  const query = useQuery({ queryKey: compensationStatementQueryKey(id!), queryFn: () => getCompensationStatement(id!), enabled: Boolean(id) });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canManage = can(membership, "compensation.manage");
  const remove = useMutation({ mutationFn: (adjustmentId: string) => removeCompensationAdjustment(adjustmentId), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: compensationStatementQueryKey(id!) }); void queryClient.invalidateQueries({ queryKey: compensationStatementsQueryKey(query.data!.periodId) }); setRemoving(null); toast.success("Đã xóa điều chỉnh."); }, onError: (error) => toast.error(getApiErrorMessage(error, "Không thể xóa điều chỉnh.")) });

  if (query.isPending) return <PageContainer><LoadingState label="Đang tải bảng kê" /></PageContainer>;
  if (query.isError || !query.data) return <PageContainer><ErrorState title="Không thể tải bảng kê" message={getApiErrorMessage(query.error, "Vui lòng thử lại.")} onRetry={() => void query.refetch()} /></PageContainer>;
  const statement = query.data;
  const editable = canManage && statement.periodStatus === "DRAFT";
  return <PageContainer>
    <ButtonBack periodId={statement.periodId} />
    <PageHeader title={`${statement.teacherCode} — ${statement.teacherName}`} description={statement.periodStatus === "FINALIZED" ? "Bảng kê đã chốt và chỉ đọc." : "Bảng kê chi tiết các khoản thu nhập và điều chỉnh trong kỳ."} primaryAction={editable ? <Button onClick={() => setAdjustmentDialog(true)}><Plus size={16} aria-hidden="true" />Thêm điều chỉnh</Button> : undefined} />
    <div className="mb-6 grid gap-4 md:grid-cols-3"><Metric label="Thu nhập" value={money(statement.earningsVnd)} /><Metric label="Điều chỉnh" value={money(statement.adjustmentsVnd)} /><Metric label="Phải trả" value={money(statement.payableVnd)} /></div>
    <section><h2 className="mb-3 text-lg font-semibold text-[#0f172a]">Khoản thu nhập</h2>{!statement.items.length ? <EmptyState icon={FileText} title="Chưa có khoản thu nhập" /> : <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white"><table className="w-full text-left text-sm"><thead><tr className="bg-[#f8fafc] text-xs text-[#64748b]"><th className="px-4 py-3">Ngày</th><th className="px-4 py-3">Nguồn</th><th className="px-4 py-3">Lớp</th><th className="px-4 py-3">Cách tính</th><th className="px-4 py-3 text-right">Mức</th><th className="px-4 py-3 text-right">Thành tiền</th></tr></thead><tbody>{statement.items.map((item) => <tr className="border-t border-[#f1f5f9]" key={item.id}><td className="px-4 py-3">{date(item.workDate)}</td><td className="px-4 py-3">{item.sourceKind === "FIXED_CLASS" ? "Hoàn thành lớp" : `Session${item.durationMinutes ? ` · ${item.durationMinutes} phút` : ""}`}</td><td className="px-4 py-3">{item.classCode} — {item.className}</td><td className="px-4 py-3">{basisLabels[item.basis]}</td><td className="px-4 py-3 text-right">{money(item.rateVnd)}</td><td className="px-4 py-3 text-right font-semibold">{money(item.amountVnd)}</td></tr>)}</tbody></table></div>}</section>
    <section className="mt-7"><h2 className="mb-3 text-lg font-semibold text-[#0f172a]">Điều chỉnh</h2>{!statement.adjustments.length ? <div className="rounded-xl border border-dashed border-[#cbd5e1] bg-white px-5 py-8 text-center text-sm text-[#64748b]">Không có điều chỉnh.</div> : <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white"><table className="w-full text-left text-sm"><thead><tr className="bg-[#f8fafc] text-xs text-[#64748b]"><th className="px-4 py-3">Ngày tạo</th><th className="px-4 py-3">Lý do</th><th className="px-4 py-3 text-right">Số tiền</th>{editable && <th className="px-4 py-3">Thao tác</th>}</tr></thead><tbody>{statement.adjustments.map((item) => <tr className="border-t border-[#f1f5f9]" key={item.id}><td className="px-4 py-3">{date(item.createdAt)}</td><td className="px-4 py-3">{item.reason}</td><td className="px-4 py-3 text-right font-semibold">{money(item.amountVnd)}</td>{editable && <td className="px-4 py-3"><Button variant="ghost" size="sm" onClick={() => setRemoving(item)}>Xóa</Button></td>}</tr>)}</tbody></table></div>}</section>
    <AdjustmentDialog open={adjustmentDialog} onOpenChange={setAdjustmentDialog} periodId={statement.periodId} teacherId={statement.teacherId} statementId={statement.id} />
    <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null); }}><DialogContent><DialogHeader><DialogTitle>Xóa điều chỉnh?</DialogTitle><DialogDescription>Khoản điều chỉnh {removing ? money(removing.amountVnd) : ""} sẽ bị xóa khỏi bản nháp. Kỳ đã chốt không thể thay đổi.</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setRemoving(null)}>Hủy</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => removing && remove.mutate(removing.id)}>{remove.isPending ? "Đang xóa…" : "Xóa điều chỉnh"}</Button></DialogFooter></DialogContent></Dialog>
  </PageContainer>;
}

function AdjustmentDialog({ open, onOpenChange, periodId, teacherId, statementId }: { open: boolean; onOpenChange: (open: boolean) => void; periodId: string; teacherId: string; statementId: string }) {
  const queryClient = useQueryClient();
  const [sign, setSign] = useState<"+" | "-">("+");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({ mutationFn: () => addCompensationAdjustment(periodId, teacherId, { amountVnd: `${sign === "-" ? "-" : ""}${amount}`, reason: reason.trim() }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: compensationStatementQueryKey(statementId) }); void queryClient.invalidateQueries({ queryKey: compensationStatementsQueryKey(periodId) }); onOpenChange(false); setSign("+"); setAmount(""); setReason(""); toast.success("Đã thêm điều chỉnh."); }, onError: (error) => toast.error(getApiErrorMessage(error, "Không thể thêm điều chỉnh.")) });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Thêm điều chỉnh</DialogTitle><DialogDescription>Dùng khoản cộng hoặc trừ có lý do rõ ràng. Tổng phải trả không được âm khi chốt kỳ.</DialogDescription></DialogHeader><div className="grid gap-4"><label className="grid gap-1.5 text-sm font-semibold">Loại<select className="min-h-10 rounded-lg border border-input bg-card px-3 text-sm" value={sign} onChange={(event) => setSign(event.target.value as "+" | "-")}><option value="+">Cộng</option><option value="-">Trừ</option></select></label><label className="grid gap-1.5 text-sm font-semibold">Số tiền (VND)<Input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} /></label><label className="grid gap-1.5 text-sm font-semibold">Lý do<Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label></div><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Hủy</Button><Button disabled={mutation.isPending || !/^[1-9]\d*$/.test(amount) || !reason.trim()} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : "Thêm điều chỉnh"}</Button></DialogFooter></DialogContent></Dialog>;
}

function ButtonBack({ periodId }: { periodId: string }) { return <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to={`/billing/compensation/periods/${periodId}`}><ChevronLeft size={16} aria-hidden="true" />Kỳ tính</Link></Button>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[#e2e8f0] bg-white p-5"><p className="m-0 text-sm text-[#64748b]">{label}</p><p className="mt-1 mb-0 text-xl font-bold text-[#0f172a]">{value}</p></div>; }
