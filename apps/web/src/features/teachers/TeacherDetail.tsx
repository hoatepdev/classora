import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { listTeacherSchedules, listUpcomingSessions, teacherScheduleQueryKey, upcomingSessionQueryKey } from "../schedules/api.js";
import type { Session } from "../schedules/types.js";
import { dayLabels } from "../schedules/labels.js";
import { getTeacher, teacherQueryKey } from "./api.js";

const sessionDateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function upcomingDateRange() {
  const from = new Date();
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function UpcomingTeacherSessions({ query }: { query: { isPending: boolean; isError: boolean; data?: Session[] } }) {
  return <section className="relationship-section" aria-labelledby="teacher-upcoming-sessions-heading">
    <div className="relationship-heading"><div><h2 id="teacher-upcoming-sessions-heading">Buổi dạy sắp tới</h2><p className="subtitle">Các Session trong 30 ngày tới của giáo viên.</p></div></div>
    {query.isPending ? <div className="state">Đang tải buổi dạy…</div> : query.isError ? <div className="state error" role="alert">Không thể tải buổi dạy của giáo viên.</div> : !query.data?.length ? <div className="state">Chưa có buổi dạy sắp tới.</div> : <div className="register"><table><thead><tr><th>Ngày</th><th>Thời gian</th><th>Lớp học</th><th>Phòng học</th><th>Trạng thái</th></tr></thead><tbody>{query.data.map((session) => <tr key={session.id}><td data-label="Ngày">{sessionDateFormatter.format(new Date(`${session.sessionDate}T00:00:00Z`))}</td><td className="code" data-label="Thời gian">{session.startTime}–{session.endTime}</td><td className="name" data-label="Lớp học"><Link className="action-link" to={`/classes/${session.classId}`}>{session.classCode} — {session.className}</Link></td><td data-label="Phòng học">{session.roomName ?? "—"}</td><td data-label="Trạng thái"><span className={`status ${session.status !== "SCHEDULED" ? "disabled" : ""}`}>{session.status === "SCHEDULED" ? "Đã lên lịch" : session.status === "COMPLETED" ? "Đã hoàn thành" : session.status === "CANCELLED" ? "Đã hủy" : "Đã dời lịch"}</span></td></tr>)}</tbody></table></div>}
  </section>;
}

export function TeacherDetail() {
  const { id } = useParams();
  const teacher = useQuery({
    queryKey: [...teacherQueryKey(), id],
    queryFn: () => getTeacher(id!),
    enabled: Boolean(id),
  });
  const schedules = useQuery({
    queryKey: teacherScheduleQueryKey(id ?? ""),
    queryFn: () => listTeacherSchedules(id!),
    enabled: Boolean(id),
  });
  const upcomingRange = upcomingDateRange();
  const upcomingSessions = useQuery({
    queryKey: upcomingSessionQueryKey({ ...upcomingRange, teacherId: id, status: "SCHEDULED" }),
    queryFn: () => listUpcomingSessions({ ...upcomingRange, teacherId: id, status: "SCHEDULED" }),
    enabled: Boolean(id),
  });

  if (teacher.isPending) {
    return <main className="page"><div className="state">Đang tải thông tin giáo viên…</div></main>;
  }
  if (teacher.isError) {
    const notFound = axios.isAxiosError(teacher.error) && teacher.error.response?.status === 404;
    return <main className="page"><div className="state error" role="alert">
      <strong>{notFound ? "Không tìm thấy giáo viên" : "Không thể tải giáo viên"}</strong>
      Quay lại danh sách và thử lại.
    </div></main>;
  }

  const fields = [
    ["Mã giáo viên", teacher.data.code],
    ["Họ và tên", teacher.data.name],
    ["Điện thoại", teacher.data.phone ?? "—"],
    ["Email", teacher.data.email ?? "—"],
    ["Ghi chú", teacher.data.note ?? "—"],
  ];

  return <main className="page">
    <div className="page-heading">
      <div><h1>{teacher.data.name}</h1><p className="subtitle">Thông tin giáo viên đang lưu tại trung tâm.</p></div>
      <Link className="button" to={`/teachers/${teacher.data.id}/edit`}>Chỉnh sửa</Link>
    </div>
    <dl className="detail-sheet">
      {fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div className="detail-field"><dt>Trạng thái</dt><dd><span className={`status ${teacher.data.status === "DISABLED" ? "disabled" : ""}`}>{teacher.data.status === "ACTIVE" ? "Đang dạy" : "Ngừng dạy"}</span></dd></div>
    </dl>

    <section className="relationship-section" aria-labelledby="teacher-schedules-heading">
      <div className="relationship-heading">
        <div><h2 id="teacher-schedules-heading">Lịch dạy</h2><p className="subtitle">Lịch giảng dạy lặp lại hằng tuần.</p></div>
      </div>
      {schedules.isPending ? <div className="state">Đang tải lịch dạy…</div> : schedules.isError ? <div className="state error" role="alert">Không thể tải lịch dạy của giáo viên.</div> : schedules.data.length === 0 ? <div className="state">Chưa có lịch dạy.</div> : <div className="register">
        <table>
          <thead><tr><th>Ngày</th><th>Thời gian</th><th>Lớp học</th><th>Phòng / địa điểm</th><th>Trạng thái</th></tr></thead>
          <tbody>{schedules.data.map((schedule) => <tr key={schedule.id}>
            <td data-label="Ngày">{dayLabels[schedule.dayOfWeek]}</td>
            <td className="code" data-label="Thời gian">{schedule.startTime}–{schedule.endTime}</td>
            <td className="name" data-label="Lớp học"><Link className="action-link" to={`/classes/${schedule.classId}`}>{schedule.classCode} — {schedule.className}</Link></td>
            <td data-label="Phòng học">{schedule.legacyRoomSource ?? (schedule.roomId ? "Đã chọn" : "—")}</td>
            <td data-label="Trạng thái"><span className={`status ${schedule.status === "DISABLED" ? "disabled" : ""}`}>{schedule.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    <UpcomingTeacherSessions query={upcomingSessions} />

    <div className="form-actions"><Link className="button secondary" to="/teachers">Quay lại danh sách</Link></div>
  </main>;
}
