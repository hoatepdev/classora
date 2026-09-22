import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { listBranches, branchQueryKey } from "../branches/api.js";
import { listClasses, classQueryKey } from "../classes/api.js";
import { listRooms, roomQueryKey } from "../rooms/api.js";
import { listTeachers, teacherQueryKey } from "../teachers/api.js";
import {
  createScheduleExclusion,
  deleteScheduleExclusion,
  listScheduleExclusions,
  listSessions,
  scheduleExclusionQueryKey,
  sessionCalendarQueryKey,
} from "./api.js";
import type { CalendarFilters, Session, SessionStatus } from "./types.js";
import { toast } from "sonner";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";

const statuses: Array<{ value: SessionStatus; label: string }> = [
  { value: "SCHEDULED", label: "Đã lên lịch" },
  { value: "COMPLETED", label: "Đã hoàn thành" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "RESCHEDULED", label: "Đã dời lịch" },
];

const statusLabels: Record<SessionStatus, string> = Object.fromEntries(statuses.map(({ value, label }) => [value, label])) as Record<SessionStatus, string>;
const dayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

type View = "day" | "week" | "month";

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function addMonths(value: string, months: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months, 1);
  return formatDate(date);
}

function dateTitle(from: string, to: string, view: View) {
  const start = new Date(`${from}T00:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const end = new Date(`${to}T00:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  return view === "day" ? start : `${start} – ${end}`;
}

function sessionLabel(session: Session) {
  return session.classCode ? `${session.classCode} · ${session.className ?? ""}` : session.className ?? "Lớp học";
}

function SessionItem({ session }: { session: Session }) {
  return <article className="rounded-lg border border-[#dbeafe] bg-[#eff6ff] p-2 text-xs text-[#1e3a8a]">
    <div className="flex items-start justify-between gap-2">
      <p className="m-0 font-semibold">{session.startTime}–{session.endTime}</p>
      <StatusBadge status={session.status}>{statusLabels[session.status]}</StatusBadge>
    </div>
    <p className="mt-1 mb-0 font-semibold text-[#0f172a]">{sessionLabel(session)}</p>
    <p className="mt-1 mb-0 text-[#475569]">{session.teacherName ?? "Chưa gán giáo viên"}{session.roomName ? ` · ${session.roomName}` : ""}</p>
  </article>;
}

export function SchedulePage() {
  const today = formatDate(new Date());
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "schedule.write");
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(today);
  const [filters, setFilters] = useState<Pick<CalendarFilters, "classId" | "teacherId" | "roomId" | "branchId" | "status">>({});

  const range = useMemo(() => {
    if (view === "day") return { from: anchor, to: anchor };
    if (view === "month") {
      const date = new Date(`${anchor}T00:00:00Z`);
      const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
      return { from: formatDate(first), to: formatDate(last) };
    }
    const from = formatDate(startOfWeek(new Date(`${anchor}T00:00:00Z`)));
    return { from, to: addDays(from, 6) };
  }, [anchor, view]);

  const queryFilters = { ...range, ...filters } satisfies CalendarFilters;
  const sessions = useQuery({ queryKey: sessionCalendarQueryKey(queryFilters), queryFn: () => listSessions(queryFilters) });
  const classes = useQuery({ queryKey: classQueryKey(), queryFn: listClasses });
  const teachers = useQuery({ queryKey: teacherQueryKey(), queryFn: listTeachers });
  const rooms = useQuery({ queryKey: roomQueryKey(), queryFn: () => listRooms() });
  const branches = useQuery({ queryKey: branchQueryKey(), queryFn: listBranches });
  const exclusions = useQuery({ queryKey: scheduleExclusionQueryKey(), queryFn: listScheduleExclusions });
  const [exclusionDate, setExclusionDate] = useState(today);
  const [exclusionBranchId, setExclusionBranchId] = useState("");
  const [exclusionReason, setExclusionReason] = useState("");
  const createExclusion = useMutation({
    mutationFn: createScheduleExclusion,
    onSuccess: () => {
      setExclusionReason("");
      void queryClient.invalidateQueries({ queryKey: scheduleExclusionQueryKey() });
      toast.success("Đã thêm ngày nghỉ lịch học.");
    },
    onError: () => toast.error("Không thể thêm ngày nghỉ lịch học."),
  });
  const removeExclusion = useMutation({
    mutationFn: deleteScheduleExclusion,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduleExclusionQueryKey() });
      toast.success("Đã xóa ngày nghỉ lịch học.");
    },
    onError: () => toast.error("Không thể xóa ngày nghỉ lịch học."),
  });

  const byDate = useMemo(() => {
    const result = new Map<string, Session[]>();
    for (const session of sessions.data ?? []) result.set(session.sessionDate, [...(result.get(session.sessionDate) ?? []), session]);
    return result;
  }, [sessions.data]);

  const shift = (direction: number) => setAnchor((current) => view === "day" ? addDays(current, direction) : view === "week" ? addDays(current, direction * 7) : addMonths(current, direction));
  const dates = view === "day" ? [anchor] : Array.from({ length: view === "week" ? 7 : new Date(`${range.to}T00:00:00Z`).getUTCDate() }, (_, index) => addDays(range.from, index));

  return <PageContainer>
    <PageHeader title="Lịch học" description="Theo dõi các buổi học đã tạo trong một khoảng thời gian giới hạn." />
    <section className="mb-5 rounded-xl border border-[#e2e8f0] bg-white p-4" aria-label="Bộ lọc lịch học">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-[#475569]">Ngày neo<input className="input" type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-medium text-[#475569]">Chế độ xem<select className="input" value={view} onChange={(event) => setView(event.target.value as View)}><option value="day">Ngày</option><option value="week">Tuần</option><option value="month">Tháng</option></select></label>
        <label className="grid min-w-44 gap-1 text-xs font-medium text-[#475569]">Lớp học<select className="input" value={filters.classId ?? ""} onChange={(event) => setFilters({ ...filters, classId: event.target.value || undefined })}><option value="">Tất cả lớp</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
        <label className="grid min-w-44 gap-1 text-xs font-medium text-[#475569]">Giáo viên<select className="input" value={filters.teacherId ?? ""} onChange={(event) => setFilters({ ...filters, teacherId: event.target.value || undefined })}><option value="">Tất cả giáo viên</option>{teachers.data?.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
        <label className="grid min-w-40 gap-1 text-xs font-medium text-[#475569]">Chi nhánh<select className="input" value={filters.branchId ?? ""} onChange={(event) => setFilters({ ...filters, branchId: event.target.value || undefined })}><option value="">Tất cả chi nhánh</option>{branches.data?.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
        <label className="grid min-w-40 gap-1 text-xs font-medium text-[#475569]">Phòng học<select className="input" value={filters.roomId ?? ""} onChange={(event) => setFilters({ ...filters, roomId: event.target.value || undefined })}><option value="">Tất cả phòng</option>{rooms.data?.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
        <label className="grid min-w-36 gap-1 text-xs font-medium text-[#475569]">Trạng thái<select className="input" value={filters.status ?? ""} onChange={(event) => setFilters({ ...filters, status: (event.target.value || undefined) as SessionStatus | undefined })}><option value="">Tất cả trạng thái</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#f1f5f9] pt-3"><div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={() => shift(-1)} aria-label="Khoảng thời gian trước"><ChevronLeft size={16} aria-hidden="true" /></Button><Button variant="secondary" size="sm" onClick={() => setAnchor(today)}>Hôm nay</Button><Button variant="secondary" size="sm" onClick={() => shift(1)} aria-label="Khoảng thời gian sau"><ChevronRight size={16} aria-hidden="true" /></Button></div><p className="m-0 text-sm font-semibold text-[#334155]">{dateTitle(range.from, range.to, view)}</p></div>
    </section>
    <section className="mb-5 rounded-xl border border-[#e2e8f0] bg-white p-4" aria-labelledby="schedule-exclusions-heading">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h2 id="schedule-exclusions-heading" className="m-0 text-base font-semibold text-[#0f172a]">Ngày nghỉ lịch học</h2><p className="mt-1 mb-0 text-sm text-[#64748b]">Không tạo Session cho ngày nghỉ toàn trung tâm.</p></div>
      </div>
      {canWrite && <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (exclusionReason.trim()) createExclusion.mutate({ date: exclusionDate, branchId: exclusionBranchId || null, reason: exclusionReason.trim() }); }}>
        <label className="grid gap-1 text-xs font-medium text-[#475569]">Ngày<input className="input" type="date" value={exclusionDate} onChange={(event) => setExclusionDate(event.target.value)} required /></label>
        <label className="grid min-w-40 gap-1 text-xs font-medium text-[#475569]">Phạm vi<select className="input" value={exclusionBranchId} onChange={(event) => setExclusionBranchId(event.target.value)}><option value="">Toàn trung tâm</option>{branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></label>
        <label className="grid min-w-56 flex-1 gap-1 text-xs font-medium text-[#475569]">Lý do<input className="input" value={exclusionReason} onChange={(event) => setExclusionReason(event.target.value)} maxLength={500} required /></label>
        <Button type="submit" disabled={createExclusion.isPending || !exclusionReason.trim()}>Thêm ngày nghỉ</Button>
      </form>}
      {exclusions.isPending ? <LoadingState label="Đang tải ngày nghỉ" /> : exclusions.isError ? <ErrorState title="Không thể tải ngày nghỉ" message="Kiểm tra kết nối và thử lại." onRetry={() => void exclusions.refetch()} /> : exclusions.data.length === 0 ? <EmptyState title="Chưa có ngày nghỉ" description="Ngày nghỉ được áp dụng cho toàn trung tâm trong quá trình tạo Session." /> : <div className="overflow-x-auto"><table><thead><tr><th>Ngày</th><th>Phạm vi</th><th>Lý do</th>{canWrite && <th>Thao tác</th>}</tr></thead><tbody>{exclusions.data.map((exclusion) => <tr key={exclusion.id}><td data-label="Ngày">{exclusion.date}</td><td data-label="Phạm vi">{exclusion.branchName ? `${exclusion.branchCode} — ${exclusion.branchName}` : "Toàn trung tâm"}</td><td data-label="Lý do">{exclusion.reason}</td>{canWrite && <td data-label="Thao tác"><Button type="button" variant="ghost" size="sm" disabled={removeExclusion.isPending} onClick={() => { if (window.confirm("Xóa ngày nghỉ này?")) removeExclusion.mutate(exclusion.id); }}>Xóa</Button></td>}</tr>)}</tbody></table></div>}
    </section>
    {sessions.isPending ? <LoadingState label="Đang tải lịch học" /> : sessions.isError ? <ErrorState title="Không thể tải lịch học" message="Kiểm tra kết nối và thử lại." onRetry={() => void sessions.refetch()} /> : sessions.data.length === 0 ? <EmptyState icon={CalendarDays} title="Chưa có buổi học trong khoảng này" description="Tạo Sessions từ lịch lặp của lớp để chúng xuất hiện tại đây." /> : <section className={view === "month" ? "grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e2e8f0] bg-[#e2e8f0] sm:grid-cols-4 lg:grid-cols-7" : "grid gap-3 md:grid-cols-7"} aria-label="Lịch các buổi học">
      {dates.map((date, index) => <div key={date} className={view === "month" ? "min-h-28 bg-white p-2" : "min-h-52 rounded-xl border border-[#e2e8f0] bg-white p-3"}><div className="mb-3 flex items-center justify-between gap-2"><p className="m-0 text-xs font-semibold text-[#64748b]">{view === "week" ? dayLabels[index] : new Date(`${date}T00:00:00Z`).getUTCDate()}</p><p className="m-0 text-xs text-[#94a3b8]">{date.slice(5)}</p></div><div className="grid gap-2">{byDate.get(date)?.map((session) => <SessionItem key={session.id} session={session} />)}</div></div>)}
    </section>}
  </PageContainer>;
}
