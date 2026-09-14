import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { classQueryKey, getClass } from "./api.js";

export function ClassDetail() {
  const { id } = useParams();
  const classRecord = useQuery({
    queryKey: [...classQueryKey(), id],
    queryFn: () => getClass(id!),
    enabled: Boolean(id),
  });

  if (classRecord.isPending) {
    return <main className="page"><div className="state">Đang tải thông tin lớp học…</div></main>;
  }
  if (classRecord.isError) {
    const notFound = axios.isAxiosError(classRecord.error) && classRecord.error.response?.status === 404;
    return <main className="page"><div className="state error" role="alert">
      <strong>{notFound ? "Không tìm thấy lớp học" : "Không thể tải lớp học"}</strong>
      Quay lại danh sách và thử lại.
    </div></main>;
  }

  const fields = [
    ["Mã lớp", classRecord.data.code],
    ["Tên lớp", classRecord.data.name],
    ["Mô tả", classRecord.data.description ?? "—"],
  ];

  return <main className="page">
    <div className="page-heading">
      <div><h1>{classRecord.data.name}</h1><p className="subtitle">Thông tin lớp học đang lưu tại trung tâm.</p></div>
      <Link className="button" to={`/classes/${classRecord.data.id}/edit`}>Chỉnh sửa</Link>
    </div>
    <dl className="detail-sheet">
      {fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div className="detail-field"><dt>Trạng thái</dt><dd><span className={`status ${classRecord.data.status === "DISABLED" ? "disabled" : ""}`}>{classRecord.data.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</span></dd></div>
    </dl>
    <div className="form-actions"><Link className="button secondary" to="/classes">Quay lại danh sách</Link></div>
  </main>;
}
