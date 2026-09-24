import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Plus, Wallet } from "lucide-react";
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
import { FinanceNavigation } from "../finance/FinanceNavigation.js";
import {
  compensationAgreementsQueryKey,
  compensationPeriodsQueryKey,
  compensationReferencesQueryKey,
  createCompensationAgreement,
  createCompensationPeriod,
  endCompensationAgreement,
  getCompensationReferences,
  listCompensationAgreements,
  listCompensationPeriods,
  replaceCompensationAgreement,
} from "./api.js";
import { formatCompensationDate as date } from "./format.js";
import type { CompensationAgreement, CompensationAgreementInput, CompensationBasis } from "./types.js";

const money = (value: string) => `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ₫`;
const basisLabels: Record<CompensationBasis, string> = { PER_SESSION: "Theo buổi", PER_HOUR: "Theo giờ", FIXED_CLASS: "Theo lớp" };
const selectClass = "min-h-10 rounded-lg border border-input bg-card px-3 text-sm";

export function CompensationPage() {
  const [tab, setTab] = useState<"periods" | "agreements">("periods");
  const [periodDialog, setPeriodDialog] = useState(false);
  const [agreementDialog, setAgreementDialog] = useState(false);
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canManage = can(membership, "compensation.manage");
  const primaryAction = canManage ? <Button onClick={() => tab === "periods" ? setPeriodDialog(true) : setAgreementDialog(true)}><Plus size={16} aria-hidden="true" />{tab === "periods" ? "Tạo kỳ tính" : "Tạo thỏa thuận"}</Button> : undefined;

  return <PageContainer>
    <PageHeader title="Thù lao giáo viên" description="Quản lý thỏa thuận, kỳ tính và số tiền phải trả. Payable không phải là đã thanh toán." primaryAction={primaryAction} />
    <FinanceNavigation />
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-[#e2e8f0]" aria-label="Khu vực thù lao">
      <button type="button" onClick={() => setTab("periods")} className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === "periods" ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-[#64748b]"}`}>Kỳ tính</button>
      <button type="button" onClick={() => setTab("agreements")} className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === "agreements" ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-[#64748b]"}`}>Thỏa thuận</button>
    </nav>
    {tab === "periods" ? <Periods /> : <Agreements canManage={canManage} />}
    <PeriodDialog open={periodDialog} onOpenChange={setPeriodDialog} />
    <AgreementDialog open={agreementDialog} onOpenChange={setAgreementDialog} />
  </PageContainer>;
}

function Periods() {
  const query = useQuery({ queryKey: compensationPeriodsQueryKey(), queryFn: listCompensationPeriods });
  if (query.isPending) return <LoadingState label="Đang tải kỳ tính" />;
  if (query.isError) return <ErrorState title="Không thể tải kỳ tính" message={getApiErrorMessage(query.error, "Vui lòng thử lại.")} onRetry={() => void query.refetch()} />;
  if (!query.data.length) return <EmptyState icon={Wallet} title="Chưa có kỳ tính" description="Tạo kỳ tính để bắt đầu tổng hợp thù lao giáo viên." />;
  return <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white"><table className="w-full text-left text-sm"><thead><tr className="bg-[#f8fafc] text-xs text-[#64748b]"><th className="px-4 py-3">Kỳ tính</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Tạo bản nháp</th><th className="px-4 py-3">Thao tác</th></tr></thead><tbody>{query.data.map((row) => <tr className="border-t border-[#f1f5f9]" key={row.id}><td className="px-4 py-3 font-semibold">{date(row.periodStart)} — {date(row.periodEnd)}</td><td className="px-4 py-3"><span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold">{row.status === "FINALIZED" ? "Đã chốt" : "Bản nháp"}</span></td><td className="px-4 py-3 text-[#64748b]">{row.generatedAt ? date(row.generatedAt) : "Chưa tạo"}</td><td className="px-4 py-3"><Link className="font-semibold text-[#2563eb] hover:underline" to={`/billing/compensation/periods/${row.id}`}>Mở kỳ tính</Link></td></tr>)}</tbody></table></div>;
}

function Agreements({ canManage }: { canManage: boolean }) {
  const query = useQuery({ queryKey: compensationAgreementsQueryKey(), queryFn: listCompensationAgreements });
  const [replace, setReplace] = useState<CompensationAgreement | null>(null);
  const [end, setEnd] = useState<CompensationAgreement | null>(null);
  if (query.isPending) return <LoadingState label="Đang tải thỏa thuận" />;
  if (query.isError) return <ErrorState title="Không thể tải thỏa thuận" message={getApiErrorMessage(query.error, "Vui lòng thử lại.")} onRetry={() => void query.refetch()} />;
  if (!query.data.length) return <EmptyState icon={FileText} title="Chưa có thỏa thuận" description="Thỏa thuận được dùng để xác định mức thù lao theo ngày làm việc." />;
  return <>
    <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white"><table className="w-full text-left text-sm"><thead><tr className="bg-[#f8fafc] text-xs text-[#64748b]"><th className="px-4 py-3">Giáo viên</th><th className="px-4 py-3">Phạm vi</th><th className="px-4 py-3">Cách tính</th><th className="px-4 py-3 text-right">Mức thù lao</th><th className="px-4 py-3">Hiệu lực</th>{canManage && <th className="px-4 py-3">Thao tác</th>}</tr></thead><tbody>{query.data.map((row) => <tr className="border-t border-[#f1f5f9]" key={row.id}><td className="px-4 py-3 font-semibold">{row.teacherCode} — {row.teacherName}</td><td className="px-4 py-3">{row.classCode ? `${row.classCode} — ${row.className}` : "Mặc định giáo viên"}</td><td className="px-4 py-3">{basisLabels[row.basis]}</td><td className="px-4 py-3 text-right font-semibold">{money(row.rateVnd)}</td><td className="px-4 py-3">{date(row.effectiveFrom)} — {row.effectiveUntil ? date(row.effectiveUntil) : "Hiện tại"}</td>{canManage && <td className="px-4 py-3">{row.status === "ACTIVE" && <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setReplace(row)}>Thay thế</Button><Button variant="ghost" size="sm" onClick={() => setEnd(row)}>Kết thúc</Button></div>}</td>}</tr>)}</tbody></table></div>
    <AgreementDialog open={Boolean(replace)} onOpenChange={(open) => { if (!open) setReplace(null); }} replacing={replace} />
    <EndAgreementDialog agreement={end} onOpenChange={(open) => { if (!open) setEnd(null); }} />
  </>;
}

function PeriodDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const mutation = useMutation({ mutationFn: () => createCompensationPeriod({ periodStart: start, periodEnd: end }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: compensationPeriodsQueryKey() }); onOpenChange(false); setStart(""); setEnd(""); toast.success("Đã tạo kỳ tính."); }, onError: (error) => toast.error(getApiErrorMessage(error, "Không thể tạo kỳ tính.")) });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Tạo kỳ tính thù lao</DialogTitle><DialogDescription>Kỳ tính bao gồm các Session hoàn thành và lớp hoàn thành trong khoảng ngày này.</DialogDescription></DialogHeader><div className="grid gap-4"><label className="grid gap-1.5 text-sm font-semibold">Từ ngày<Input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-semibold">Đến ngày<Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Hủy</Button><Button disabled={mutation.isPending || !start || !end || end < start} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang tạo…" : "Tạo kỳ tính"}</Button></DialogFooter></DialogContent></Dialog>;
}

function AgreementDialog({ open, onOpenChange, replacing }: { open: boolean; onOpenChange: (open: boolean) => void; replacing?: CompensationAgreement | null }) {
  const queryClient = useQueryClient();
  const references = useQuery({ queryKey: compensationReferencesQueryKey(), queryFn: getCompensationReferences, enabled: open });
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [basis, setBasis] = useState<CompensationBasis>("PER_SESSION");
  const [rateVnd, setRateVnd] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [notes, setNotes] = useState("");
  const input: CompensationAgreementInput = replacing ? { teacherId: replacing.teacherId, classId: replacing.classId, basis: replacing.basis, rateVnd, effectiveFrom, effectiveUntil: effectiveUntil || null, notes: notes.trim() || null } : { teacherId, classId: classId || null, basis, rateVnd, effectiveFrom, effectiveUntil: effectiveUntil || null, notes: notes.trim() || null };
  const mutation = useMutation({ mutationFn: () => replacing ? replaceCompensationAgreement(replacing.id, input) : createCompensationAgreement(input), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: compensationAgreementsQueryKey() }); onOpenChange(false); setTeacherId(""); setClassId(""); setBasis("PER_SESSION"); setRateVnd(""); setEffectiveFrom(""); setEffectiveUntil(""); setNotes(""); toast.success(replacing ? "Đã thay thế thỏa thuận." : "Đã tạo thỏa thuận."); }, onError: (error) => toast.error(getApiErrorMessage(error, "Không thể lưu thỏa thuận.")) });
  const valid = Boolean((replacing || teacherId) && rateVnd && effectiveFrom && (!effectiveUntil || effectiveUntil >= effectiveFrom) && ((replacing?.basis ?? basis) !== "FIXED_CLASS" || (replacing?.classId ?? classId)));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{replacing ? "Thay thế thỏa thuận" : "Tạo thỏa thuận thù lao"}</DialogTitle><DialogDescription>{replacing ? "Thỏa thuận hiện tại sẽ kết thúc vào ngày trước khi thỏa thuận mới bắt đầu." : "Chọn phạm vi, cách tính và mức thù lao áp dụng."}</DialogDescription></DialogHeader>{references.isPending ? <LoadingState label="Đang tải dữ liệu" /> : references.isError ? <ErrorState title="Không thể tải dữ liệu" message="Vui lòng thử lại." onRetry={() => void references.refetch()} /> : <div className="grid gap-4">{replacing ? <><div className="text-sm"><span className="text-[#64748b]">Giáo viên</span><p className="mt-1 mb-0 font-semibold">{replacing.teacherCode} — {replacing.teacherName}</p></div><div className="text-sm"><span className="text-[#64748b]">Phạm vi và cách tính</span><p className="mt-1 mb-0 font-semibold">{replacing.classCode ? `${replacing.classCode} — ${replacing.className}` : "Mặc định giáo viên"} · {basisLabels[replacing.basis]}</p></div></> : <><label className="grid gap-1.5 text-sm font-semibold">Giáo viên<select className={selectClass} value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Chọn giáo viên</option>{references.data?.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.code} — {teacher.name}</option>)}</select></label><label className="grid gap-1.5 text-sm font-semibold">Cách tính<select className={selectClass} value={basis} onChange={(event) => setBasis(event.target.value as CompensationBasis)}><option value="PER_SESSION">Theo buổi</option><option value="PER_HOUR">Theo giờ</option><option value="FIXED_CLASS">Theo lớp hoàn thành</option></select></label><label className="grid gap-1.5 text-sm font-semibold">Lớp áp dụng<select className={selectClass} value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Mặc định giáo viên</option>{references.data?.classes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label></>}<label className="grid gap-1.5 text-sm font-semibold">Mức thù lao (VND)<Input inputMode="numeric" value={rateVnd} onChange={(event) => setRateVnd(event.target.value.replace(/\D/g, ""))} /></label><label className="grid gap-1.5 text-sm font-semibold">Hiệu lực từ<Input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-semibold">Hiệu lực đến (không bắt buộc)<Input type="date" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-semibold">Ghi chú<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>}<DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Hủy</Button><Button disabled={mutation.isPending || references.isPending || !valid} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : replacing ? "Thay thế thỏa thuận" : "Tạo thỏa thuận"}</Button></DialogFooter></DialogContent></Dialog>;
}

function EndAgreementDialog({ agreement, onOpenChange }: { agreement: CompensationAgreement | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const mutation = useMutation({ mutationFn: () => endCompensationAgreement(agreement!.id, effectiveUntil), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: compensationAgreementsQueryKey() }); onOpenChange(false); setEffectiveUntil(""); toast.success("Đã kết thúc thỏa thuận."); }, onError: (error) => toast.error(getApiErrorMessage(error, "Không thể kết thúc thỏa thuận.")) });
  return <Dialog open={Boolean(agreement)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Kết thúc thỏa thuận</DialogTitle><DialogDescription>Chọn ngày cuối cùng thỏa thuận còn hiệu lực. Bản ghi lịch sử sẽ được giữ nguyên.</DialogDescription></DialogHeader><label className="grid gap-1.5 text-sm font-semibold">Hiệu lực đến<Input type="date" min={agreement?.effectiveFrom} value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} /></label><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Hủy</Button><Button disabled={mutation.isPending || !effectiveUntil || Boolean(agreement && effectiveUntil < agreement.effectiveFrom)} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : "Kết thúc thỏa thuận"}</Button></DialogFooter></DialogContent></Dialog>;
}
