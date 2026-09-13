import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { getStudent, studentQueryKey } from "./api.js";

export function StudentDetail() {
  const { id } = useParams();
  const student = useQuery({
    queryKey: [...studentQueryKey(), id],
    queryFn: () => getStudent(id!),
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
    ["Ngày sinh", student.data.dateOfBirth ? new Intl.DateTimeFormat("vi-VN").format(new Date(`${student.data.dateOfBirth}T00:00:00`)) : "—"],
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
    <div className="form-actions"><Link className="button secondary" to="/students">Quay lại danh sách</Link></div>
  </main>;
}
