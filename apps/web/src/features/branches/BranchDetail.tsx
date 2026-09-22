import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { branchQueryKey, getBranch } from "./api.js";

export function BranchDetail() {
  const { id } = useParams();
  const query = useQuery({ queryKey: [...branchQueryKey(), id], queryFn: () => getBranch(id!), enabled: Boolean(id) });
  if (query.isPending) return <main className="page"><div className="state">Đang tải thông tin chi nhánh…</div></main>;
  if (query.isError) { const notFound = axios.isAxiosError(query.error) && query.error.response?.status === 404; return <main className="page"><div className="state error" role="alert"><strong>{notFound ? "Không tìm thấy chi nhánh" : "Không thể tải chi nhánh"}</strong>Quay lại danh sách và thử lại.</div></main>; }
  const fields = [["Mã chi nhánh", query.data.code], ["Tên chi nhánh", query.data.name], ["Địa chỉ", query.data.address ?? "—"], ["Điện thoại", query.data.phone ?? "—"], ["Email", query.data.email ?? "—"], ["Số phòng học", String(query.data.roomCount)]];
  return <main className="page">
    <div className="page-heading"><div><h1>{query.data.name}</h1><p className="subtitle">Thông tin chi nhánh đang lưu tại trung tâm.</p></div><Link className="button" to={`/branches/${query.data.id}/edit`}>Chỉnh sửa</Link></div>
    <dl className="detail-sheet">{fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div className="detail-field"><dt>Trạng thái</dt><dd><span className={`status ${query.data.status === "DISABLED" ? "disabled" : ""}`}>{query.data.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</span></dd></div></dl>
    <div className="form-actions"><Link className="button secondary" to="/branches">Quay lại danh sách</Link></div>
  </main>;
}
