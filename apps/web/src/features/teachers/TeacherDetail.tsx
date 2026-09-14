import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { getTeacher, teacherQueryKey } from "./api.js";

export function TeacherDetail() {
  const { id } = useParams();
  const teacher = useQuery({
    queryKey: [...teacherQueryKey(), id],
    queryFn: () => getTeacher(id!),
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
    <div className="form-actions"><Link className="button secondary" to="/teachers">Quay lại danh sách</Link></div>
  </main>;
}
