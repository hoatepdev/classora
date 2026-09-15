import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listStudentAttendance, studentAttendanceQueryKey } from "./api.js";
import { attendanceStatusLabels } from "./labels.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");

export function StudentAttendanceSection({ studentId }: { studentId: string }) {
  const attendance = useQuery({
    queryKey: studentAttendanceQueryKey(studentId),
    queryFn: () => listStudentAttendance(studentId),
  });

  return <section className="relationship-section" aria-labelledby="student-attendance-heading">
    <div className="relationship-heading"><div><h2 id="student-attendance-heading">Lịch sử điểm danh</h2><p className="subtitle">Kết quả đã lưu trong từng buổi học.</p></div></div>
    {attendance.isPending ? <div className="state">Đang tải lịch sử điểm danh…</div> : attendance.isError ? <div className="state error" role="alert">Không thể tải lịch sử điểm danh.</div> : attendance.data.length === 0 ? <div className="state">Chưa có dữ liệu điểm danh.</div> : <div className="register">
      <table>
        <thead><tr><th>Ngày</th><th>Lớp</th><th>Thời gian</th><th>Kết quả</th><th>Ghi chú</th></tr></thead>
        <tbody>{attendance.data.map((record) => <tr key={record.id}>
          <td data-label="Ngày">{dateFormatter.format(new Date(`${record.sessionDate}T00:00:00`))}</td>
          <td className="name" data-label="Lớp"><Link className="action-link" to={`/classes/${record.classId}`}>{record.classCode} — {record.className}</Link></td>
          <td className="code" data-label="Thời gian">{record.startTime}–{record.endTime}</td>
          <td data-label="Kết quả"><span className={`status ${record.status === "ABSENT" ? "disabled" : ""}`}>{attendanceStatusLabels[record.status]}</span></td>
          <td data-label="Ghi chú">{record.note ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
