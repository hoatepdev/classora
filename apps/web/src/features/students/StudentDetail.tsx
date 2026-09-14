import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { listStudentEnrollments, studentEnrollmentQueryKey } from "../enrollments/api.js";
import { getStudent, studentQueryKey } from "./api.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");

export function StudentDetail() {
  const { id } = useParams();
  const student = useQuery({
    queryKey: [...studentQueryKey(), id],
    queryFn: () => getStudent(id!),
    enabled: Boolean(id),
  });
  const enrollments = useQuery({
    queryKey: studentEnrollmentQueryKey(id ?? ""),
    queryFn: () => listStudentEnrollments(id!),
    enabled: Boolean(id),
  });

  if (student.isPending) {
    return <main className="page"><div className="state">Đang tải thông tin học viên…</div></main>;
  }
  if (student.isError) {
    const notFound = axios.isAxiosError(student.error) && student.error.response?.status === 404;
    return <main className="page"><div className="state error" role="alert">
      <strong>{notFound ? "Không tìm thấy học viên" : "Không thể tải học viên"}</strong>
      Quay lại danh sách và thử lại.
    </div></main>;
  }

  const fields = [
    ["Mã học viên", student.data.code],
    ["Họ và tên", student.data.fullName],
    ["Điện thoại", student.data.phone ?? "—"],
    ["Email", student.data.email ?? "—"],
    ["Ngày sinh", student.data.dateOfBirth ? dateFormatter.format(new Date(`${student.data.dateOfBirth}T00:00:00`)) : "—"],
  ];

  return <main className="page">
    <div className="page-heading">
      <div><h1>{student.data.fullName}</h1><p className="subtitle">Thông tin học viên đang lưu tại trung tâm.</p></div>
      <Link className="button" to={`/students/${student.data.id}/edit`}>Chỉnh sửa</Link>
    </div>
    <dl className="detail-sheet">
      {fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div className="detail-field"><dt>Trạng thái</dt><dd><span className={`status ${student.data.status === "DISABLED" ? "disabled" : ""}`}>{student.data.status === "ACTIVE" ? "Đang học" : "Ngừng học"}</span></dd></div>
    </dl>

    <section className="relationship-section" aria-labelledby="student-classes-heading">
      <div className="relationship-heading"><div><h2 id="student-classes-heading">Lớp học</h2><p className="subtitle">Các lớp học viên đã ghi danh.</p></div></div>
      {enrollments.isPending ? <div className="state">Đang tải lớp học…</div> : enrollments.isError ? <div className="state error" role="alert">Không thể tải lớp học của học viên.</div> : enrollments.data.length === 0 ? <div className="state">Học viên chưa ghi danh vào lớp nào.</div> : <div className="register">
        <table>
          <thead><tr><th>Mã lớp</th><th>Tên lớp</th><th>Trạng thái</th><th>Ngày ghi danh</th></tr></thead>
          <tbody>{enrollments.data.map((enrollment) => <tr key={enrollment.id}>
            <td className="code" data-label="Mã lớp">{enrollment.classCode}</td>
            <td className="name" data-label="Tên lớp"><Link className="action-link" to={`/classes/${enrollment.classId}`}>{enrollment.className}</Link></td>
            <td data-label="Trạng thái"><span className={`status ${enrollment.status === "WITHDRAWN" ? "disabled" : ""}`}>{enrollment.status === "ACTIVE" ? "Đang học" : "Đã rút"}</span></td>
            <td data-label="Ngày ghi danh">{dateFormatter.format(new Date(enrollment.enrolledAt))}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <div className="form-actions"><Link className="button secondary" to="/students">Quay lại danh sách</Link></div>
  </main>;
}
