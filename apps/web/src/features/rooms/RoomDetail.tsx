import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { getRoom, roomQueryKey } from "./api.js";
import { listUpcomingSessions, upcomingSessionQueryKey } from "../schedules/api.js";
import type { Session } from "../schedules/types.js";

const sessionDateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function upcomingDateRange() {
  const from = new Date();
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function UpcomingRoomSessions({ query }: { query: { isPending: boolean; isError: boolean; data?: Session[] } }) {
  return <section className="relationship-section" aria-labelledby="room-upcoming-sessions-heading">
    <div className="relationship-heading"><div><h2 id="room-upcoming-sessions-heading">Buổi học sắp tới</h2><p className="subtitle">Các Session trong 30 ngày tới tại phòng học.</p></div></div>
    {query.isPending ? <div className="state">Đang tải buổi học…</div> : query.isError ? <div className="state error" role="alert">Không thể tải buổi học của phòng.</div> : !query.data?.length ? <div className="state">Chưa có buổi học sắp tới.</div> : <div className="register"><table><thead><tr><th>Ngày</th><th>Thời gian</th><th>Lớp học</th><th>Giáo viên</th><th>Trạng thái</th></tr></thead><tbody>{query.data.map((session) => <tr key={session.id}><td data-label="Ngày">{sessionDateFormatter.format(new Date(`${session.sessionDate}T00:00:00Z`))}</td><td className="code" data-label="Thời gian">{session.startTime}–{session.endTime}</td><td className="name" data-label="Lớp học"><Link className="action-link" to={`/classes/${session.classId}`}>{session.classCode} — {session.className}</Link></td><td data-label="Giáo viên">{session.teacherName ?? "—"}</td><td data-label="Trạng thái"><span className={`status ${session.status !== "SCHEDULED" ? "disabled" : ""}`}>{session.status === "SCHEDULED" ? "Đã lên lịch" : session.status === "COMPLETED" ? "Đã hoàn thành" : session.status === "CANCELLED" ? "Đã hủy" : "Đã dời lịch"}</span></td></tr>)}</tbody></table></div>}
  </section>;
}

export function RoomDetail() {
  const { id } = useParams();
  const query = useQuery({ queryKey: [...roomQueryKey(), id], queryFn: () => getRoom(id!), enabled: Boolean(id) });
  const upcomingRange = upcomingDateRange();
  const upcomingSessions = useQuery({
    queryKey: upcomingSessionQueryKey({ ...upcomingRange, roomId: id, status: "SCHEDULED" }),
    queryFn: () => listUpcomingSessions({ ...upcomingRange, roomId: id, status: "SCHEDULED" }),
    enabled: Boolean(id),
  });
  if (query.isPending) return <main className="page"><div className="state">Đang tải thông tin phòng học…</div></main>;
  if (query.isError) { const notFound = axios.isAxiosError(query.error) && query.error.response?.status === 404; return <main className="page"><div className="state error" role="alert"><strong>{notFound ? "Không tìm thấy phòng học" : "Không thể tải phòng học"}</strong>Quay lại danh sách và thử lại.</div></main>; }
  const fields = [["Mã phòng", query.data.code], ["Tên phòng", query.data.name], ["Chi nhánh", `${query.data.branchCode} — ${query.data.branchName}`], ["Sức chứa", query.data.capacity ? `${query.data.capacity} người` : "—"], ["Ghi chú", query.data.notes ?? "—"]];
  return <main className="page">
    <div className="page-heading"><div><h1>{query.data.name}</h1><p className="subtitle">Thông tin phòng học đang lưu tại trung tâm.</p></div><Link className="button" to={`/rooms/${query.data.id}/edit`}>Chỉnh sửa</Link></div>
    <dl className="detail-sheet">{fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div className="detail-field"><dt>Trạng thái</dt><dd><span className={`status ${query.data.status === "DISABLED" ? "disabled" : ""}`}>{query.data.status === "ACTIVE" ? "Đang sử dụng" : "Ngừng sử dụng"}</span></dd></div></dl>
    <UpcomingRoomSessions query={upcomingSessions} />
    <div className="form-actions"><Link className="button secondary" to="/rooms">Quay lại danh sách</Link></div>
  </main>;
}
