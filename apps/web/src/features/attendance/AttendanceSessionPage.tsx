import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api";
import {
  attendanceSessionQueryKey,
  classAttendanceQueryKey,
  completeAttendanceSession,
  getAttendanceSession,
  studentAttendanceQueryKey,
  updateAttendanceRecord,
} from "./api.js";
import { attendanceStatusLabels } from "./labels.js";
import { attendanceStatuses, type SessionAttendanceRecord } from "./types.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");

export function AttendanceSessionPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "attendance.write");
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
  });
  const complete = useMutation({
    mutationFn: () => completeAttendanceSession(id!),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: attendanceSessionQueryKey(result.id) }),
        queryClient.invalidateQueries({ queryKey: classAttendanceQueryKey(result.classId) }),
      ]);
      toast.success("Đã hoàn thành buổi điểm danh.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể hoàn thành buổi điểm danh. Vui lòng thử lại.")),
  });

  if (session.isPending) return <main className="page"><div className="state">Đang tải điểm danh…</div></main>;
  if (session.isError) {
    const notFound = axios.isAxiosError(session.error) && session.error.response?.status === 404;
    return <main className="page"><div className="state error" role="alert"><strong>{notFound ? "Không tìm thấy buổi điểm danh" : "Không thể tải điểm danh"}</strong>Quay lại lớp học và thử lại.</div></main>;
  }

  const locked = !canWrite || ["COMPLETED", "CANCELLED", "RESCHEDULED"].includes(session.data.status);
  return <main className="page">
    <div className="page-heading">
      <div><h1>{session.data.classCode} — {session.data.className}</h1><p className="subtitle">{dateFormatter.format(new Date(`${session.data.sessionDate}T00:00:00`))} · {session.data.startTime}–{session.data.endTime}{session.data.teacherName ? ` · ${session.data.teacherName}` : ""}</p></div>
      {canWrite && !["COMPLETED", "CANCELLED", "RESCHEDULED"].includes(session.data.status) && <ConfirmDialog
        trigger={<Button type="button">Hoàn thành</Button>}
        title="Hoàn thành buổi điểm danh?"
        description="Sau khi hoàn thành, danh sách điểm danh sẽ bị khóa và không thể chỉnh sửa."
        confirmLabel="Hoàn thành"
        pendingLabel="Đang hoàn thành…"
        pending={complete.isPending}
        onConfirm={() => complete.mutateAsync()}
      />}
    </div>
    {(update.isError || complete.isError) && <p className="form-error" role="alert">Không thể lưu điểm danh. Vui lòng thử lại.</p>}
    {session.data.records.length === 0 ? <div className="state">Buổi học không có học viên đủ điều kiện tại thời điểm tạo.</div> : <div className="register">
      <table>
        <thead><tr><th>Học viên</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
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
        </tr>)}</tbody>
      </table>
    </div>}
    <div className="form-actions"><Link className="button secondary" to={`/classes/${session.data.classId}`}>Quay lại lớp học</Link></div>
  </main>;
}
