import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { getRoom, roomQueryKey } from "./api.js";

export function RoomDetail() {
  const { id } = useParams();
  const query = useQuery({ queryKey: [...roomQueryKey(), id], queryFn: () => getRoom(id!), enabled: Boolean(id) });
  if (query.isPending) return <main className="page"><div className="state">Đang tải thông tin phòng học…</div></main>;
  if (query.isError) { const notFound = axios.isAxiosError(query.error) && query.error.response?.status === 404; return <main className="page"><div className="state error" role="alert"><strong>{notFound ? "Không tìm thấy phòng học" : "Không thể tải phòng học"}</strong>Quay lại danh sách và thử lại.</div></main>; }
  const fields = [["Mã phòng", query.data.code], ["Tên phòng", query.data.name], ["Chi nhánh", `${query.data.branchCode} — ${query.data.branchName}`], ["Sức chứa", query.data.capacity ? `${query.data.capacity} người` : "—"], ["Ghi chú", query.data.notes ?? "—"]];
  return <main className="page">
    <div className="page-heading"><div><h1>{query.data.name}</h1><p className="subtitle">Thông tin phòng học đang lưu tại trung tâm.</p></div><Link className="button" to={`/rooms/${query.data.id}/edit`}>Chỉnh sửa</Link></div>
    <dl className="detail-sheet">{fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div className="detail-field"><dt>Trạng thái</dt><dd><span className={`status ${query.data.status === "DISABLED" ? "disabled" : ""}`}>{query.data.status === "ACTIVE" ? "Đang sử dụng" : "Ngừng sử dụng"}</span></dd></div></dl>
    <div className="form-actions"><Link className="button secondary" to="/rooms">Quay lại danh sách</Link></div>
  </main>;
}
