import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { listTeacherSchedules, teacherScheduleQueryKey } from "../schedules/api.js";
import { dayLabels } from "../schedules/labels.js";
import { getTeacher, teacherQueryKey } from "./api.js";

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
            <td data-label="Phòng / địa điểm">{schedule.room ?? "—"}</td>
            <td data-label="Trạng thái"><span className={`status ${schedule.status === "DISABLED" ? "disabled" : ""}`}>{schedule.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <div className="form-actions"><Link className="button secondary" to="/teachers">Quay lại danh sách</Link></div>
  </main>;
}
