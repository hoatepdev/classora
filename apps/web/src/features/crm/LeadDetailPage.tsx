import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { CalendarClock, ChevronLeft, Pencil, PhoneCall, Plus, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { getApiErrorMessage } from "@/lib/api";
import {
  addLeadNote, bookTrial, cancelTrialBooking, contactLead, convertLead, getLead, leadDuplicates, leadQueryKey, lookupCrmAssignees, lookupCrmClasses, lookupTrialSessions, lostLead, qualifyLead, recordTrialOutcome, updateLead,
} from "./api.js";
import { bookingStatusLabels, guardianRelationshipLabels, leadEventLabels, leadSourceLabels, leadStatusLabels, lostReasonLabels, trialOutcomeLabels } from "./labels.js";
import type { GuardianRelationship, LeadDetail, LostReason, TrialBooking, TrialOutcomeValue } from "./types.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const sessionDateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export function LeadDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const leadQuery = useQuery({ queryKey: ["lead", window.location.hostname, id], queryFn: () => getLead(id!), enabled: Boolean(id) });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "crm.write");
  const assignees = useQuery({ queryKey: ["crm-assignees", window.location.hostname], queryFn: lookupCrmAssignees });
  const classes = useQuery({ queryKey: ["crm-classes", window.location.hostname], queryFn: lookupCrmClasses });
  const duplicates = useQuery({ queryKey: ["lead-duplicates", window.location.hostname, id], queryFn: () => leadDuplicates(id!), enabled: Boolean(id) && (leadQuery.data?.status === "QUALIFIED" || leadQuery.data?.status === "TRIAL_COMPLETED") });

  const [dialog, setDialog] = useState<"none" | "followUp" | "lost" | "trial" | "outcome" | "convert">("none");
  const [outcomeBooking, setOutcomeBooking] = useState<TrialBooking | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["lead", window.location.hostname] });
    await queryClient.invalidateQueries({ queryKey: leadQueryKey() });
  };
  const onError = (fallback: string) => (error: unknown) => toast.error(getApiErrorMessage(error, fallback));
  const simpleAction = useMutation({
    mutationFn: (action: "contact" | "qualify") => (action === "contact" ? contactLead(id!) : qualifyLead(id!)),
    onSuccess: async () => { await invalidate(); toast.success("Đã cập nhật trạng thái lead."); },
    onError: onError("Không thể cập nhật trạng thái. Có thể chuyển trạng thái không hợp lệ."),
  });

  if (leadQuery.isPending) return <PageContainer><LoadingState label="Đang tải thông tin lead" /></PageContainer>;
  if (leadQuery.isError) {
    const notFound = axios.isAxiosError(leadQuery.error) && leadQuery.error.response?.status === 404;
    return <PageContainer><ErrorState title={notFound ? "Không tìm thấy lead" : "Không thể tải lead"} message="Quay lại danh sách và thử lại." onRetry={() => void leadQuery.refetch()} /></PageContainer>;
  }
  const lead = leadQuery.data;
  const status = lead.status;
  const active = status !== "WON" && status !== "LOST";
  const assigneeName = lead.assignedMembershipId ? (assignees.data?.find((item) => item.membershipId === lead.assignedMembershipId)?.name ?? null) : null;
  const activeBooking = lead.trialBookings.find((booking) => booking.status === "BOOKED");
  const needsRebook = activeBooking && (activeBooking.sessionStatus === "CANCELLED" || activeBooking.sessionStatus === "RESCHEDULED");
  const studentDuplicates = duplicates.data?.filter((item) => item.kind === "STUDENT") ?? [];

  return <PageContainer>
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/leads"><ChevronLeft size={16} aria-hidden="true" />Tiềm năng</Link></Button>
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="m-0 truncate text-[1.75rem] leading-tight font-bold tracking-tight text-[#0f172a] md:text-[2rem]">{lead.studentName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#64748b]">
          <StatusBadge status={status === "WON" ? "ACTIVE" : status === "LOST" ? "DISABLED" : status === "TRIAL_BOOKED" ? "TRIAL" : "PENDING"}>{leadStatusLabels[status]}</StatusBadge>
          {lead.campaign && <span>Chiến dịch: {lead.campaign}</span>}
          <span>Tạo {dateFormatter.format(new Date(lead.createdAt))}</span>
        </div>
      </div>
      {canWrite && active && <div className="flex flex-wrap gap-2">
        {status === "NEW" && <Button variant="secondary" onClick={() => simpleAction.mutate("contact")} disabled={simpleAction.isPending}><PhoneCall size={16} aria-hidden="true" />Đã liên hệ</Button>}
        {(status === "NEW" || status === "CONTACTED") && <Button variant="secondary" onClick={() => simpleAction.mutate("qualify")} disabled={simpleAction.isPending}><ShieldCheck size={16} aria-hidden="true" />Đủ điều kiện</Button>}
        {status === "QUALIFIED" && <Button variant="secondary" onClick={() => setDialog("trial")}><CalendarClock size={16} aria-hidden="true" />Đặt học thử</Button>}
        {(status === "QUALIFIED" || status === "TRIAL_COMPLETED") && <Button onClick={() => setDialog("convert")}>Chuyển đổi ghi danh</Button>}
        <Button variant="ghost" onClick={() => setDialog("lost")} className="text-[#b42318]" disabled={simpleAction.isPending}><XCircle size={16} aria-hidden="true" />Đánh mất</Button>
        <Button variant="ghost" asChild><Link to={`/leads/${lead.id}/edit`}><Pencil size={16} aria-hidden="true" />Sửa</Link></Button>
      </div>}
      {canWrite && status === "WON" && lead.conversion && <div className="rounded-xl border border-[#dcf5e3] bg-[#f2fbf5] px-4 py-3 text-sm text-[#15803d]">Đã ghi danh thành công. Học phí được quản lý ở mục Tài chính.</div>}
    </header>

    <div className="grid gap-5 lg:grid-cols-2">
      <DetailSection title="Học viên tiềm năng" fields={[
        ["Tên", lead.studentName],
        ["Điện thoại", lead.studentPhone ?? "—"],
        ["Email", lead.studentEmail ?? "—"],
        ["Nguồn", lead.source ? leadSourceLabels[lead.source] : "—"],
      ]} />
      <DetailSection title="Người giám hộ" fields={[
        ["Tên", lead.guardianName ?? "—"],
        ["Điện thoại", lead.guardianPhone ?? "—"],
        ["Email", lead.guardianEmail ?? "—"],
      ]} />
      <DetailSection title="Nhu cầu" fields={[
        ["Khóa học quan tâm", lead.interestedCourseName ?? "—"],
        ["Trình độ", lead.interestedCourseLevelName ?? "—"],
        ["Chi nhánh mong muốn", lead.preferredBranchName ?? "—"],
      ]} />
      <DetailSection title="Phân công & chăm sóc" fields={[
        ["Nhân viên phụ trách", assigneeName ?? "Chưa phân công"],
        ["Hẹn chăm sóc", lead.nextFollowUpAt ? dateFormatter.format(new Date(lead.nextFollowUpAt)) : "Chưa hẹn"],
        ...(status === "LOST" ? [["Lý do mất", `${lostReasonLabels[lead.lostReason!]}${lead.lostReasonDetail ? ` — ${lead.lostReasonDetail}` : ""}`] as string[]] : []),
      ]}
        action={canWrite && active ? <Button variant="secondary" size="sm" onClick={() => setDialog("followUp")}><CalendarClock size={16} aria-hidden="true" />Hẹn chăm sóc</Button> : undefined} />
    </div>

    {status === "LOST" && lead.lostReason && (
      <section className="mt-7 rounded-xl border border-[#efb6b0] bg-[#fff5f4] p-5">
        <h2 className="m-0 text-base font-semibold text-[#8d231b]">Lead đã mất — {lostReasonLabels[lead.lostReason]}</h2>
        {lead.lostReasonDetail && <p className="mt-1 mb-0 text-sm text-[#8d231b]">{lead.lostReasonDetail}</p>}
      </section>
    )}

    <section className="mt-7">
      <SectionHeader title="Học thử" action={canWrite && status === "QUALIFIED" ? <Button variant="secondary" size="sm" onClick={() => setDialog("trial")}><Plus size={16} aria-hidden="true" />Đặt học thử</Button> : undefined} />
      {needsRebook && <p className="mb-3 rounded-lg border border-[#fef3c7] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">Buổi học đã bị hủy hoặc dời lịch — hãy hủy lần đặt này và đặt lại buổi học thử khác.</p>}
      {lead.trialBookings.length === 0 ? <div className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-8 text-center text-sm text-[#64748b]">Chưa có buổi học thử nào.</div> : (
        <div className="grid gap-3">
          {lead.trialBookings.map((booking) => <div key={booking.id} className="rounded-xl border border-[#e2e8f0] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="m-0 font-semibold text-[#0f172a]">{sessionDateFormatter.format(new Date(`${booking.sessionDate}T00:00:00Z`))} · {booking.startTime}–{booking.endTime}</p>
                <p className="mt-1 mb-0 text-sm text-[#64748b]">{booking.classCode} — {booking.className}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={booking.status === "COMPLETED" ? "COMPLETED" : booking.status === "CANCELLED" ? "CANCELLED" : booking.status === "NO_SHOW" ? "ABSENT" : "SCHEDULED"}>{bookingStatusLabels[booking.status]}</StatusBadge>
                {booking.outcome && <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#475569]">{trialOutcomeLabels[booking.outcome]}</span>}
              </div>
            </div>
            {booking.outcomeNotes && <p className="mt-2 mb-0 text-sm text-[#475569]">{booking.outcomeNotes}</p>}
            {canWrite && booking.status === "BOOKED" && <div className="mt-3 flex flex-wrap gap-2">
              {booking.sessionStatus !== "CANCELLED" && booking.sessionStatus !== "RESCHEDULED" && <Button variant="secondary" size="sm" onClick={() => { setOutcomeBooking(booking); setDialog("outcome"); }}>Ghi kết quả</Button>}
              <ConfirmDialog
                trigger={<Button variant="ghost" size="sm" className="text-[#b42318]">Hủy buổi học thử</Button>}
                title="Hủy buổi học thử?"
                description={`Buổi ${sessionDateFormatter.format(new Date(`${booking.sessionDate}T00:00:00Z`))} sẽ được giữ lại trong lịch sử. Lớp học thử sẽ được đóng an toàn.`}
                confirmLabel="Hủy học thử"
                destructive
                onConfirm={async () => { await cancelTrialBooking(booking.id, "Hủy từ nhân viên"); await invalidate(); toast.success("Đã hủy buổi học thử."); }}
              />
            </div>}
          </div>)}
        </div>
      )}
    </section>

    <LeadNotesSection leadId={lead.id} notes={lead.notes} canWrite={canWrite && active} onInvalidated={invalidate} />
    <section className="mt-7">
      <SectionHeader title="Hoạt động" />
      {lead.events.length === 0 ? <div className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-8 text-center text-sm text-[#64748b]">Chưa có hoạt động.</div> : (
        <div className="space-y-2">
          {lead.events.map((event) => <article key={event.id} className="rounded-xl border border-[#e2e8f0] bg-white p-4">
            <p className="m-0 text-sm font-medium text-[#334155]">{leadEventLabels[event.type] ?? event.type}{event.toStatus && event.fromStatus !== event.toStatus ? ` — ${leadStatusLabels[event.toStatus]}` : ""}</p>
            <p className="mt-1 mb-0 text-xs text-[#64748b]">{dateFormatter.format(new Date(event.occurredAt))}</p>
            {event.reason && <p className="mt-1 mb-0 text-xs text-[#64748b]">Lý do: {event.reason}</p>}
          </article>)}
        </div>
      )}
    </section>

    {dialog === "followUp" && <FollowUpDialog lead={lead} onClose={() => setDialog("none")} onDone={async () => { await invalidate(); setDialog("none"); }} />}
    {dialog === "lost" && <LostDialog leadId={lead.id} onClose={() => setDialog("none")} onDone={async () => { await invalidate(); setDialog("none"); }} />}
    {dialog === "trial" && <TrialDialog lead={lead} onClose={() => setDialog("none")} onDone={async () => { await invalidate(); setDialog("none"); }} />}
    {dialog === "outcome" && outcomeBooking && <OutcomeDialog booking={outcomeBooking} onClose={() => setDialog("none")} onDone={async () => { await invalidate(); setDialog("none"); }} />}
    {dialog === "convert" && <ConvertDialog lead={lead} classes={classes.data ?? []} studentDuplicates={studentDuplicates} onClose={() => setDialog("none")} onDone={async () => { await invalidate(); setDialog("none"); }} />}
  </PageContainer>;
}

function FollowUpDialog({ lead, onClose, onDone }: { lead: LeadDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const [value, setValue] = useState(lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 16) : "");
  const mutation = useMutation({
    mutationFn: () => updateLead(lead.id, { nextFollowUpAt: value ? new Date(value).toISOString() : null }),
    onSuccess: async () => { toast.success("Đã cập nhật lịch chăm sóc."); await onDone(); },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể lưu lịch chăm sóc.")),
  });
  return <Dialog open onOpenChange={onClose}>
    <DialogContent>
      <DialogHeader><DialogTitle>Hẹn chăm sóc</DialogTitle><DialogDescription>Đặt lịch liên hệ lần tới cho lead này. Để trống và lưu nếu muốn bỏ lịch hẹn.</DialogDescription></DialogHeader>
      <Input aria-label="Thời gian hẹn" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} />
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Đóng</Button>
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : "Lưu lịch hẹn"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function LostDialog({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState<LostReason>("NOT_INTERESTED");
  const [detail, setDetail] = useState("");
  const mutation = useMutation({
    mutationFn: () => lostLead(leadId, { reason, detail: detail.trim() || null }),
    onSuccess: async () => { toast.success("Đã đánh dấu lead là mất."); await onDone(); },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể đánh mất lead.")),
  });
  return <Dialog open onOpenChange={onClose}>
    <DialogContent>
      <DialogHeader><DialogTitle>Đánh mất lead</DialogTitle><DialogDescription>Lead và toàn bộ lịch sử được giữ lại. Nếu có buổi học thử đang chờ, nó sẽ được hủy an toàn.</DialogDescription></DialogHeader>
      <label className="grid gap-2 text-sm"><span className="font-medium text-[#334155]">Lý do</span>
        <select className="input" value={reason} onChange={(event) => setReason(event.target.value as LostReason)}>
          {Object.entries(lostReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <Input aria-label="Chi tiết (tùy chọn)" placeholder="Chi tiết thêm (tùy chọn)" value={detail} onChange={(event) => setDetail(event.target.value)} />
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Hủy</Button>
        <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : "Xác nhận mất"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function TrialDialog({ lead, onClose, onDone }: { lead: LeadDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const [sessionId, setSessionId] = useState("");
  const [studentChoice, setStudentChoice] = useState<"create" | "reuse">("create");
  const [studentId, setStudentId] = useState("");
  const [createGuardian, setCreateGuardian] = useState(Boolean(lead.guardianName));
  const [relationship, setRelationship] = useState<GuardianRelationship>("MOTHER");
  const sessions = useQuery({
    queryKey: ["crm-trial-sessions", window.location.hostname, lead.id],
    queryFn: () => lookupTrialSessions({ courseId: lead.interestedCourseId ?? undefined, branchId: lead.preferredBranchId ?? undefined }),
  });
  const duplicates = useQuery({ queryKey: ["lead-duplicates", window.location.hostname, lead.id], queryFn: () => leadDuplicates(lead.id) });
  const studentCandidates = duplicates.data?.filter((item) => item.kind === "STUDENT") ?? [];
  const mutation = useMutation({
    mutationFn: () => bookTrial(lead.id, {
      sessionId,
      ...(studentChoice === "reuse" ? { studentId } : { createStudent: true }),
      ...(createGuardian && lead.guardianName ? { createGuardian: true, guardianRelationship: relationship } : {}),
    }),
    onSuccess: async () => { toast.success("Đã đặt học thử và tạo hồ sơ học thử."); await onDone(); },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể đặt học thử.")),
  });
  const submitDisabled = !sessionId || (studentChoice === "reuse" && !studentId);
  return <Dialog open onOpenChange={onClose}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Đặt buổi học thử</DialogTitle><DialogDescription>Chọn buổi học từ lịch hiện có. Hồ sơ học viên (và người giám hộ) được tạo tự động từ dữ liệu lead.</DialogDescription></DialogHeader>
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm"><span className="font-medium text-[#334155]">Buổi học</span>
          <select className="input" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
            <option value="">— Chọn buổi học —</option>
            {sessions.data?.map((session) => <option key={session.id} value={session.id}>
              {session.sessionDate.split("-").reverse().join("/")} {session.startTime}–{session.endTime} · {session.className}{session.branchName ? ` · ${session.branchName}` : ""}
            </option>)}
          </select>
        </label>
        {studentCandidates.length > 0 && <fieldset className="grid gap-2 rounded-lg border border-[#e2e8f0] p-3">
          <legend className="px-1 text-xs font-semibold text-[#64748b]">Có thể trùng với hồ sơ hiện có</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="student-choice" checked={studentChoice === "create"} onChange={() => setStudentChoice("create")} />Tạo học viên mới từ dữ liệu lead</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="student-choice" checked={studentChoice === "reuse"} onChange={() => { setStudentChoice("reuse"); if (!studentId && studentCandidates[0]) setStudentId(studentCandidates[0].id); }} />Dùng hồ sơ hiện có</label>
          {studentChoice === "reuse" && <select className="input" value={studentId} onChange={(event) => setStudentId(event.target.value)} aria-label="Chọn học viên hiện có">
            {studentCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.phone ? ` · ${candidate.phone}` : ""}</option>)}
          </select>}
        </fieldset>}
        {lead.guardianName && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createGuardian} onChange={(event) => setCreateGuardian(event.target.checked)} />Tạo và liên kết người giám hộ ({lead.guardianName})</label>}
        {createGuardian && lead.guardianName && <label className="grid gap-1.5 text-sm"><span className="font-medium text-[#334155]">Mối quan hệ</span>
          <select className="input" value={relationship} onChange={(event) => setRelationship(event.target.value as GuardianRelationship)}>
            {Object.entries(guardianRelationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>}
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Hủy</Button>
        <Button disabled={submitDisabled || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang đặt…" : "Đặt học thử"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function OutcomeDialog({ booking, onClose, onDone }: { booking: TrialBooking; onClose: () => void; onDone: () => Promise<void> }) {
  const [outcome, setOutcome] = useState<TrialOutcomeValue>("ENROLL");
  const [lostReason, setLostReason] = useState<LostReason>("NOT_INTERESTED");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => recordTrialOutcome(booking.id, {
      outcome,
      ...(outcome === "LOST" ? { lostReason, lostDetail: notes.trim() || null } : { notes: notes.trim() || null }),
    }),
    onSuccess: async () => { toast.success("Đã ghi kết quả học thử theo điểm danh thật."); await onDone(); },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể ghi kết quả. Điểm danh buổi học phải được chốt trước.")),
  });
  return <Dialog open onOpenChange={onClose}>
    <DialogContent>
      <DialogHeader><DialogTitle>Kết quả học thử</DialogTitle><DialogDescription>Kết quả tham dự lấy từ điểm danh đã chốt của buổi {booking.sessionDate.split("-").reverse().join("/")}. Chọn hướng xử lý tiếp theo.</DialogDescription></DialogHeader>
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm"><span className="font-medium text-[#334155]">Hướng xử lý</span>
          <select className="input" value={outcome} onChange={(event) => setOutcome(event.target.value as TrialOutcomeValue)}>
            {Object.entries(trialOutcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {outcome === "LOST" && <label className="grid gap-1.5 text-sm"><span className="font-medium text-[#334155]">Lý do</span>
          <select className="input" value={lostReason} onChange={(event) => setLostReason(event.target.value as LostReason)}>
            {Object.entries(lostReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>}
        <Input aria-label="Ghi chú (tùy chọn)" placeholder="Ghi chú thêm (tùy chọn)" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Hủy</Button>
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang lưu…" : "Lưu kết quả"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function ConvertDialog({ lead, classes, studentDuplicates, onClose, onDone }: { lead: LeadDetail; classes: Array<{ id: string; name: string; code: string; courseName: string | null }>; studentDuplicates: Array<{ id: string; name: string; phone: string | null }>; onClose: () => void; onDone: () => Promise<void> }) {
  const [classId, setClassId] = useState("");
  const [studentChoice, setStudentChoice] = useState<"default" | "create" | "reuse">(studentDuplicates.length ? "create" : "default");
  const [studentId, setStudentId] = useState("");
  const [createGuardian, setCreateGuardian] = useState(Boolean(lead.guardianName));
  const [relationship, setRelationship] = useState<GuardianRelationship>("MOTHER");
  const mutation = useMutation({
    mutationFn: () => convertLead(lead.id, {
      classId,
      ...(studentChoice === "create" ? { createStudent: true } : studentChoice === "reuse" && studentId ? { studentId } : {}),
      ...(createGuardian && lead.guardianName ? { createGuardian: true, guardianRelationship: relationship } : {}),
    }),
    onSuccess: async () => { toast.success("Đã chuyển đổi lead thành ghi danh."); await onDone(); },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể chuyển đổi lead.")),
  });
  return <Dialog open onOpenChange={onClose}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Chuyển đổi thành ghi danh</DialogTitle><DialogDescription>Tạo hồ sơ học viên, người giám hộ và ghi danh vào lớp đã chọn — tất cả trong một thao tác, không cần nhập lại thông tin.</DialogDescription></DialogHeader>
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm"><span className="font-medium text-[#334155]">Lớp ghi danh</span>
          <select className="input" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">— Chọn lớp —</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}{item.courseName ? ` (${item.courseName})` : ""}</option>)}
          </select>
        </label>
        {studentDuplicates.length > 0 && <fieldset className="grid gap-2 rounded-lg border border-[#e2e8f0] p-3">
          <legend className="px-1 text-xs font-semibold text-[#64748b]">Có thể trùng hồ sơ hiện có — chọn rõ ràng</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="convert-student" checked={studentChoice === "create"} onChange={() => setStudentChoice("create")} />Tạo học viên mới từ dữ liệu lead</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="convert-student" checked={studentChoice === "reuse"} onChange={() => { setStudentChoice("reuse"); if (!studentId && studentDuplicates[0]) setStudentId(studentDuplicates[0].id); }} />Dùng hồ sơ hiện có</label>
          {studentChoice === "reuse" && <select className="input" value={studentId} onChange={(event) => setStudentId(event.target.value)} aria-label="Chọn học viên hiện có">
            {studentDuplicates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.phone ? ` · ${candidate.phone}` : ""}</option>)}
          </select>}
        </fieldset>}
        {lead.guardianName && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createGuardian} onChange={(event) => setCreateGuardian(event.target.checked)} />Tạo và liên kết người giám hộ ({lead.guardianName})</label>}
        {createGuardian && lead.guardianName && <label className="grid gap-1.5 text-sm"><span className="font-medium text-[#334155]">Mối quan hệ</span>
          <select className="input" value={relationship} onChange={(event) => setRelationship(event.target.value as GuardianRelationship)}>
            {Object.entries(guardianRelationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>}
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Hủy</Button>
        <Button disabled={!classId || (studentChoice === "reuse" && !studentId) || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang chuyển đổi…" : "Chuyển đổi"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function LeadNotesSection({ leadId, notes, canWrite, onInvalidated }: { leadId: string; notes: LeadDetail["notes"]; canWrite: boolean; onInvalidated: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const mutation = useMutation({
    mutationFn: () => addLeadNote(leadId, value.trim()),
    onSuccess: async () => { setValue(""); toast.success("Đã thêm ghi chú."); await onInvalidated(); },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể thêm ghi chú.")),
  });
  return <section className="mt-7">
    <SectionHeader title="Ghi chú nội bộ" />
    {canWrite && <form className="mb-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (value.trim()) mutation.mutate(); }}>
      <Input aria-label="Ghi chú mới" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Thêm ghi chú chăm sóc..." />
      <Button disabled={mutation.isPending || !value.trim()}>{mutation.isPending ? "Đang lưu…" : "Thêm"}</Button>
    </form>}
    {notes.length === 0 ? <div className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-8 text-center text-sm text-[#64748b]">Chưa có ghi chú.</div> : (
      <div className="space-y-3">
        {notes.map((note) => <article key={note.id} className="rounded-xl border border-[#e2e8f0] bg-white p-4">
          <p className="m-0 whitespace-pre-wrap text-sm text-[#334155]">{note.content}</p>
          <p className="mt-3 mb-0 text-xs text-[#64748b]">{note.authorName ?? "Nhân viên"} · {dateFormatter.format(new Date(note.createdAt))}</p>
        </article>)}
      </div>
    )}
  </section>;
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-3"><h2 className="m-0 text-lg font-semibold text-[#0f172a]">{title}</h2>{action}</div>;
}

function DetailSection({ title, fields, action }: { title: string; fields: string[][]; action?: React.ReactNode }) {
  return <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] md:p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="m-0 border-b-0 pb-0 text-lg font-semibold text-[#0f172a]">{title}</h2>
      {action}
    </div>
    <dl className="m-0 divide-y divide-[#f1f5f9]">
      {fields.map(([label, value]) => <div className="grid gap-1 py-3 sm:grid-cols-[150px_1fr] sm:gap-5" key={label}>
        <dt className="text-[13px] font-medium text-[#64748b]">{label}</dt>
        <dd className="m-0 text-sm font-medium text-[#0f172a]">{value}</dd>
      </div>)}
    </dl>
  </section>;
}
