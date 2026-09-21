import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuditEvent, listAuditEvents, auditQueryKey, type AuditEvent, type AuditFilters } from "./api";

const labels: Record<string, string> = {
  "membership.invited": "Mời thành viên",
  "membership.invitation_resent": "Gửi lại lời mời",
  "membership.activated": "Kích hoạt thành viên",
  "membership.role_changed": "Đổi vai trò thành viên",
  "membership.disabled": "Vô hiệu hóa thành viên",
  "membership.enabled": "Kích hoạt thành viên",
  "membership.removed": "Xóa thành viên",
  "student.created": "Tạo học viên",
  "student.updated": "Cập nhật học viên",
};
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({ limit: 25 });
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const query = useQuery({ queryKey: auditQueryKey(filters), queryFn: () => listAuditEvents(filters), refetchOnWindowFocus: false });
  useEffect(() => {
    if (query.data) setEvents((current) => filters.cursor ? [...current, ...query.data.data] : query.data.data);
  }, [filters.cursor, query.data]);
  const detail = useQuery({ queryKey: ["audit", "detail", selected?.id], queryFn: () => getAuditEvent(selected!.id), enabled: Boolean(selected) });
  const update = (key: keyof AuditFilters, value: string) => { setEvents([]); setFilters((current) => ({ ...current, [key]: value || undefined, cursor: undefined })); };

  return <PageContainer>
    <PageHeader title="Nhật ký hoạt động" description="Theo dõi các thay đổi quan trọng trong trung tâm." />
    <div className="mb-5 grid gap-3 rounded-xl border border-[#e2e8f0] bg-white p-4 md:grid-cols-4">
      <label className="text-sm font-medium text-[#334155]">Người thực hiện<input className="input mt-1" placeholder="ID người dùng" value={filters.actorUserId ?? ""} onChange={(event) => update("actorUserId", event.target.value)} /></label>
      <label className="text-sm font-medium text-[#334155]">Hành động<select className="input mt-1" value={filters.action ?? ""} onChange={(event) => update("action", event.target.value)}><option value="">Tất cả</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-medium text-[#334155]">Loại đối tượng<select className="input mt-1" value={filters.entityType ?? ""} onChange={(event) => update("entityType", event.target.value)}><option value="">Tất cả</option><option value="MEMBERSHIP">Thành viên</option><option value="STUDENT">Học viên</option></select></label>
      <label className="text-sm font-medium text-[#334155]">Từ ngày<input className="input mt-1" type="date" value={filters.from ?? ""} onChange={(event) => update("from", event.target.value)} /></label>
      <label className="text-sm font-medium text-[#334155]">Đến ngày<input className="input mt-1" type="date" value={filters.to ?? ""} onChange={(event) => update("to", event.target.value)} /></label>
    </div>
    {query.isPending ? <LoadingState label="Đang tải nhật ký hoạt động" /> : query.isError ? <ErrorState title="Không thể tải nhật ký" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} /> : events.length === 0 ? <EmptyState title="Chưa có hoạt động" description="Các thay đổi quan trọng sẽ xuất hiện tại đây." /> : <>
      <Table><TableHeader><TableRow><TableHead>Thời gian</TableHead><TableHead>Người thực hiện</TableHead><TableHead>Hành động</TableHead><TableHead>Đối tượng</TableHead><TableHead>Tóm tắt</TableHead></TableRow></TableHeader><TableBody>{events.map((event) => <TableRow key={`${event.source}-${event.id}`}><TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(event.occurredAt))}</TableCell><TableCell><p className="font-medium text-[#0f172a]">{event.actorName ?? "Hệ thống"}</p><p className="text-xs text-[#64748b]">{event.actorEmail ?? ""}</p></TableCell><TableCell className="font-medium">{labels[event.action] ?? event.action}</TableCell><TableCell>{event.entityType}</TableCell><TableCell><button type="button" className="font-medium text-[#2563eb] hover:underline" onClick={() => setSelected(event)}>Xem chi tiết</button></TableCell></TableRow>)}</TableBody></Table>
      {query.data.nextCursor && <button type="button" className="mt-4 rounded-lg border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-[#334155] hover:bg-[#f8fafc]" onClick={() => setFilters((current) => ({ ...current, cursor: query.data.nextCursor ?? undefined }))}>Tải thêm</button>}
    </>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{detail.data ? labels[detail.data.action] ?? detail.data.action : "Chi tiết hoạt động"}</DialogTitle><DialogDescription>Thông tin đầy đủ của thay đổi được ghi nhận.</DialogDescription></DialogHeader>{detail.isPending ? <LoadingState label="Đang tải chi tiết" /> : detail.isError ? <ErrorState title="Không thể tải chi tiết" message="Vui lòng thử lại." onRetry={() => void detail.refetch()} /> : detail.data && <div className="grid gap-4 text-sm"><dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-[#64748b]">Thời gian</dt><dd>{dateFormatter.format(new Date(detail.data.occurredAt))}</dd></div><div><dt className="text-[#64748b]">Đối tượng</dt><dd>{detail.data.entityType} · {detail.data.entityId ? (detail.data.entityType === "STUDENT" ? <Link className="text-[#2563eb] hover:underline" to={`/students/${detail.data.entityId}`}>{detail.data.entityId}</Link> : detail.data.entityId) : "—"}</dd></div><div><dt className="text-[#64748b]">Request ID</dt><dd className="break-all">{detail.data.requestId ?? "—"}</dd></div><div><dt className="text-[#64748b]">Lý do</dt><dd>{detail.data.reason ?? "—"}</dd></div></dl><Diff title="Trước" value={detail.data.before} /><Diff title="Sau" value={detail.data.after} /></div>}</DialogContent></Dialog>
  </PageContainer>;
}

function Diff({ title, value }: { title: string; value: Record<string, unknown> | null }) { return <section><h3 className="mb-2 font-semibold text-[#0f172a]">{title}</h3><pre className="max-h-56 overflow-auto rounded-lg bg-[#f8fafc] p-3 text-xs text-[#334155]">{value ? JSON.stringify(value, null, 2) : "—"}</pre></section>; }
