import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getApiErrorMessage } from "@/lib/api";
import {
  attendanceSessionQueryKey,
  classAttendanceQueryKey,
  correctAttendanceRecord,
  finalizeAttendanceSession,
  getAttendanceSession,
  listAttendanceCorrections,
  studentAttendanceQueryKey,
  updateAttendanceRecord,
} from "./api.js";
import { attendanceStatusLabels } from "./labels.js";
import { attendanceStatuses, type SessionAttendanceRecord } from "./types.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");

export function AttendanceSessionPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [correctionRecord, setCorrectionRecord] = useState<SessionAttendanceRecord | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<SessionAttendanceRecord["status"]>("PRESENT");
  const [correctionReason, setCorrectionReason] = useState("");
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "attendance.write");
  const canCorrect = can(membership, "attendance.correct");
  const session = useQuery({
    queryKey: attendanceSessionQueryKey(id ?? ""),
    queryFn: () => getAttendanceSession(id!),
    enabled: Boolean(id),
  });
  const update = useMutation({
    mutationFn: ({ record, input }: {
      record: SessionAttendanceRecord;
      input: { status?: SessionAttendanceRecord["status"]; note?: string | null };
    }) => updateAttendanceRecord(record.id, input),
    onSuccess: async (record) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: attendanceSessionQueryKey(record.attendanceSessionId) }),
        queryClient.invalidateQueries({ queryKey: studentAttendanceQueryKey(record.studentId) }),
      ]);
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể lưu điểm danh.")),
  });
  const finalize = useMutation({
    mutationFn: () => finalizeAttendanceSession(id!),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: attendanceSessionQueryKey(result.id) }),
        queryClient.invalidateQueries({ queryKey: classAttendanceQueryKey(result.classId) }),
      ]);
      toast.success("Đã khóa điểm danh và hoàn thành buổi học.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể khóa điểm danh. Hãy kiểm tra các bản ghi chưa điểm danh.")),
  });
  const correct = useMutation({
    mutationFn: () => correctAttendanceRecord(correctionRecord!.id, { status: correctionStatus, reason: correctionReason.trim() }),
    onSuccess: async (record) => {
      setCorrectionRecord(null);
      setCorrectionReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: attendanceSessionQueryKey(record.attendanceSessionId) }),
        queryClient.invalidateQueries({ queryKey: studentAttendanceQueryKey(record.studentId) }),
        queryClient.invalidateQueries({ queryKey: ["attendance-corrections", record.id] }),
      ]);
      toast.success("Đã lưu điều chỉnh điểm danh.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể điều chỉnh điểm danh.")),
  });

  if (session.isPending) return <main className="page"><div className="state">Đang tải điểm danh…</div></main>;
  if (session.isError) {
    const notFound = axios.isAxiosError(session.error) && session.error.response?.status === 404;
    return <main className="page"><div className="state error" role="alert"><strong>{notFound ? "Không tìm thấy buổi điểm danh" : "Không thể tải điểm danh"}</strong>Quay lại lớp học và thử lại.</div></main>;
  }

  const attendanceLocked = session.data.attendanceStatus === "LOCKED";
  const sessionClosed = ["COMPLETED", "CANCELLED", "RESCHEDULED"].includes(session.data.status);
  const locked = !canWrite || attendanceLocked || sessionClosed;
  return <main className="page">
    <div className="page-heading">
      <div><h1>{session.data.classCode} — {session.data.className}</h1><p className="subtitle">{dateFormatter.format(new Date(`${session.data.sessionDate}T00:00:00`))} · {session.data.startTime}–{session.data.endTime}{session.data.teacherName ? ` · ${session.data.teacherName}` : ""} · {attendanceLocked ? "Đã khóa" : "Đang mở"}</p></div>
      {canWrite && !attendanceLocked && !sessionClosed && <ConfirmDialog
        trigger={<Button type="button">Khóa điểm danh</Button>}
        title="Khóa điểm danh?"
        description="Sau khi khóa, các thay đổi thông thường sẽ bị chặn. Mọi điều chỉnh sau đó phải có quyền và lý do."
        confirmLabel="Khóa điểm danh"
        pendingLabel="Đang khóa…"
        pending={finalize.isPending}
        onConfirm={() => finalize.mutateAsync()}
      />}
    </div>
    {session.data.records.length === 0 ? <div className="state">Buổi học không có học viên đủ điều kiện tại thời điểm tạo.</div> : <div className="register">
      <table>
        <thead><tr><th>Học viên</th><th>Trạng thái</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
        <tbody>{session.data.records.map((record) => <tr key={record.id}>
          <td className="name" data-label="Học viên"><Link className="action-link" to={`/students/${record.studentId}`}>{record.studentCode} — {record.studentFullName}</Link></td>
          <td data-label="Trạng thái">
            <label className="sr-only" htmlFor={`attendance-status-${record.id}`}>Trạng thái của {record.studentFullName}</label>
            <select id={`attendance-status-${record.id}`} className="input" value={record.status} disabled={locked || update.isPending} onChange={(event) => update.mutate({ record, input: { status: event.target.value as SessionAttendanceRecord["status"] } })}>
              {attendanceStatuses.map((status) => <option key={status} value={status}>{attendanceStatusLabels[status]}</option>)}
            </select>
          </td>
          <td data-label="Ghi chú">
            <label className="sr-only" htmlFor={`attendance-note-${record.id}`}>Ghi chú cho {record.studentFullName}</label>
            <input id={`attendance-note-${record.id}`} className="input" defaultValue={record.note ?? ""} disabled={locked || update.isPending} onBlur={(event) => {
              const note = event.target.value.trim();
              if (note !== (record.note ?? "")) update.mutate({ record, input: { note: note || null } });
            }} />
          </td>
          <td data-label="Thao tác">{attendanceLocked && canCorrect && <Button type="button" variant="ghost" size="sm" onClick={() => { setCorrectionRecord(record); setCorrectionStatus(record.status); setCorrectionReason(""); }}>Điều chỉnh</Button>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <div className="form-actions"><Link className="button secondary" to={`/classes/${session.data.classId}`}>Quay lại lớp học</Link></div>
    <CorrectionDialog
      record={correctionRecord}
      status={correctionStatus}
      reason={correctionReason}
      pending={correct.isPending}
      onStatusChange={setCorrectionStatus}
      onReasonChange={setCorrectionReason}
      onClose={() => !correct.isPending && setCorrectionRecord(null)}
      onSubmit={() => correct.mutate()}
    />
  </main>;
}

function CorrectionDialog({
  record,
  status,
  reason,
  pending,
  onStatusChange,
  onReasonChange,
  onClose,
  onSubmit,
}: {
  record: SessionAttendanceRecord | null;
  status: SessionAttendanceRecord["status"];
  reason: string;
  pending: boolean;
  onStatusChange: (status: SessionAttendanceRecord["status"]) => void;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const corrections = useQuery({
    queryKey: ["attendance-corrections", record?.id],
    queryFn: () => listAttendanceCorrections(record!.id),
    enabled: Boolean(record),
  });
  return <Dialog open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Điều chỉnh điểm danh</DialogTitle>
        <DialogDescription>{record?.studentFullName}. Điều chỉnh sau khi khóa cần nêu rõ lý do.</DialogDescription>
      </DialogHeader>
      <label className="field"><span>Trạng thái mới</span><select className="input" value={status} onChange={(event) => onStatusChange(event.target.value as SessionAttendanceRecord["status"])}>{attendanceStatuses.filter((item) => item !== "UNMARKED").map((item) => <option key={item} value={item}>{attendanceStatusLabels[item]}</option>)}</select></label>
      <label className="field"><span>Lý do <span className="required">*</span></span><textarea className="input" rows={3} value={reason} maxLength={1000} onChange={(event) => onReasonChange(event.target.value)} /></label>
      {corrections.data?.length ? <div className="text-sm text-muted-foreground"><strong>Lịch sử điều chỉnh</strong>{corrections.data.map((item) => <p key={item.id} className="mb-0 mt-2">{attendanceStatusLabels[item.beforeStatus]} → {attendanceStatusLabels[item.afterStatus]} · {item.reason}</p>)}</div> : null}
      <DialogFooter><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Hủy</Button><Button type="button" disabled={pending || !reason.trim() || status === record?.status} onClick={onSubmit}>{pending ? "Đang lưu…" : "Lưu điều chỉnh"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
