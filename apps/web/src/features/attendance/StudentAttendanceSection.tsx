import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { listSessions } from "../schedules/api.js";
import {
  bookMakeup,
  cancelMakeup,
  listMakeupEntitlements,
  listStudentAttendance,
  rebookMakeup,
  studentAttendanceQueryKey,
} from "./api.js";
import { attendanceStatusLabels } from "./labels.js";
import type { MakeupEntitlement } from "./types.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const sessionDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export function StudentAttendanceSection({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "attendance.write");
  const attendance = useQuery({
    queryKey: studentAttendanceQueryKey(studentId),
    queryFn: () => listStudentAttendance(studentId),
  });
  const entitlements = useQuery({
    queryKey: ["makeup-entitlements", window.location.hostname, studentId],
    queryFn: () => listMakeupEntitlements(studentId),
  });
  const range = makeupSessionRange();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["makeup-entitlements", window.location.hostname, studentId] }),
      queryClient.invalidateQueries({ queryKey: ["makeup-destinations", window.location.hostname, studentId] }),
      queryClient.invalidateQueries({ queryKey: studentAttendanceQueryKey(studentId) }),
    ]);
  };
  const mutationError = (message: string) => (error: unknown) => toast.error(getApiErrorMessage(error, message));
  const book = useMutation({
    mutationFn: ({ entitlementId, destinationSessionId }: { entitlementId: string; destinationSessionId: string }) => bookMakeup(entitlementId, destinationSessionId),
    onSuccess: async () => { await refresh(); toast.success("Đã đặt buổi học bù."); },
    onError: mutationError("Không thể đặt buổi học bù."),
  });
  const rebook = useMutation({
    mutationFn: ({ bookingId, destinationSessionId }: { bookingId: string; destinationSessionId: string }) => rebookMakeup(bookingId, destinationSessionId),
    onSuccess: async () => { await refresh(); toast.success("Đã đổi buổi học bù."); },
    onError: mutationError("Không thể đổi buổi học bù."),
  });
  const cancel = useMutation({
    mutationFn: cancelMakeup,
    onSuccess: async () => { await refresh(); toast.success("Đã hủy đặt học bù."); },
    onError: mutationError("Không thể hủy đặt học bù."),
  });

  return <>
    <section className="relationship-section" aria-labelledby="student-attendance-heading">
      <div className="relationship-heading"><div><h2 id="student-attendance-heading">Lịch sử điểm danh</h2><p className="subtitle">Kết quả đã lưu trong từng buổi học.</p></div></div>
      {attendance.isPending ? <div className="state">Đang tải lịch sử điểm danh…</div> : attendance.isError ? <div className="state error" role="alert">Không thể tải lịch sử điểm danh.</div> : attendance.data.length === 0 ? <div className="state">Chưa có dữ liệu điểm danh.</div> : <div className="register">
        <table>
          <thead><tr><th>Ngày</th><th>Lớp</th><th>Thời gian</th><th>Kết quả</th><th>Ghi chú</th></tr></thead>
          <tbody>{attendance.data.map((record) => <tr key={record.id}>
            <td data-label="Ngày">{dateFormatter.format(new Date(`${record.sessionDate}T00:00:00`))}</td>
            <td className="name" data-label="Lớp"><Link className="action-link" to={`/classes/${record.classId}`}>{record.classCode} — {record.className}</Link></td>
            <td className="code" data-label="Thời gian">{record.startTime}–{record.endTime}</td>
            <td data-label="Kết quả"><span className={`status ${record.status === "ABSENT_EXCUSED" || record.status === "ABSENT_UNEXCUSED" ? "disabled" : ""}`}>{attendanceStatusLabels[record.status]}</span></td>
            <td data-label="Ghi chú">{record.note ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    <section className="relationship-section" aria-labelledby="student-makeup-heading">
      <div className="relationship-heading"><div><h2 id="student-makeup-heading">Quyền học bù</h2><p className="subtitle">Các buổi vắng có phép và lịch học bù đã đặt.</p></div></div>
      {entitlements.isPending ? <div className="state">Đang tải quyền học bù…</div> : entitlements.isError ? <div className="state error" role="alert">Không thể tải quyền học bù.</div> : entitlements.data.length === 0 ? <div className="state">Chưa có quyền học bù.</div> : <div className="register">
        <table>
          <thead><tr><th>Hạn dùng</th><th>Trạng thái</th><th>Buổi đích</th><th>Thao tác</th></tr></thead>
          <tbody>{entitlements.data.map((entitlement) => <MakeupRow
            key={entitlement.id}
            entitlement={entitlement}
            range={range}
            destination={destinations[entitlement.id] ?? ""}
            canWrite={canWrite}
            pending={book.isPending || rebook.isPending || cancel.isPending}
            onDestinationChange={(value) => setDestinations((current) => ({ ...current, [entitlement.id]: value }))}
            onBook={() => book.mutate({ entitlementId: entitlement.id, destinationSessionId: destinations[entitlement.id] ?? "" })}
            onRebook={() => rebook.mutate({ bookingId: entitlement.bookingId!, destinationSessionId: destinations[entitlement.id] ?? "" })}
            onCancel={() => cancel.mutate(entitlement.bookingId!)}
          />)}</tbody>
        </table>
      </div>}
    </section>
  </>;
}

function MakeupRow({ entitlement, range, destination, canWrite, pending, onDestinationChange, onBook, onRebook, onCancel }: {
  entitlement: MakeupEntitlement;
  range: { from: string; to: string };
  destination: string;
  canWrite: boolean;
  pending: boolean;
  onDestinationChange: (value: string) => void;
  onBook: () => void;
  onRebook: () => void;
  onCancel: () => void;
}) {
  const sessions = useQuery({
    queryKey: ["makeup-destinations", window.location.hostname, entitlement.id, range],
    queryFn: () => listSessions({ ...range, makeupEntitlementId: entitlement.id, status: "SCHEDULED" }),
    enabled: entitlement.status === "AVAILABLE" || entitlement.status === "BOOKED",
  });
  const choices = sessions.data ?? [];
  const canBook = entitlement.status === "AVAILABLE";
  const canRebook = entitlement.status === "BOOKED" && Boolean(entitlement.bookingId);
  return <tr>
    <td data-label="Hạn dùng">{dateFormatter.format(new Date(`${entitlement.expiresAt}T00:00:00`))}</td>
    <td data-label="Trạng thái"><StatusBadge status={makeupBadgeStatus(entitlement)}>{makeupStatusLabel(entitlement)}</StatusBadge></td>
    <td data-label="Buổi đích">
      {entitlement.bookingDestinationSessionId ? <Link className="action-link" to={`/attendance-sessions/${entitlement.bookingDestinationSessionId}`}>Mở buổi học</Link> : "Chưa đặt"}
    </td>
    <td data-label="Thao tác">
      {(canBook || canRebook) && <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`makeup-destination-${entitlement.id}`}>Buổi học bù</label>
        <select id={`makeup-destination-${entitlement.id}`} className="input" value={destination} disabled={!canWrite || pending} onChange={(event) => onDestinationChange(event.target.value)}>
          <option value="">Chọn buổi học</option>
          {choices.map((session) => <option key={session.id} value={session.id}>{sessionDateFormatter.format(new Date(`${session.sessionDate}T00:00:00Z`))} · {session.classCode ?? "Lớp học"} · {session.startTime}–{session.endTime}</option>)}
        </select>
        <button type="button" className="button" disabled={!canWrite || pending || !destination} onClick={canBook ? onBook : onRebook}>{canBook ? "Đặt học bù" : "Đổi buổi"}</button>
        {canRebook && <button type="button" className="button secondary" disabled={!canWrite || pending} onClick={onCancel}>Hủy đặt</button>}
        {sessions.isError && <span className="field-error" role="alert">Không thể tải buổi học phù hợp.</span>}
      </div>}
    </td>
  </tr>;
}

function makeupSessionRange() {
  const from = new Date();
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 366);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function makeupBadgeStatus(entitlement: MakeupEntitlement) {
  if (entitlement.status === "AVAILABLE") return "ACTIVE" as const;
  if (entitlement.status === "BOOKED") return "PENDING" as const;
  if (entitlement.status === "USED") return "COMPLETED" as const;
  return "DISABLED" as const;
}

function makeupStatusLabel(entitlement: MakeupEntitlement) {
  if (entitlement.status === "AVAILABLE") return "Có thể đặt";
  if (entitlement.status === "BOOKED") return "Đã đặt";
  if (entitlement.status === "USED") return "Đã sử dụng";
  if (entitlement.status === "EXPIRED") return "Đã hết hạn";
  return "Đã thu hồi";
}
