import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/empty-state";
import { getPortalAttendance, getPortalNotifications, getPortalProfile, getPortalSchedule } from "./api";
import { formatDate, PortalPage, QueryState, StudentSelector, useSelectedStudent } from "./portal-ui";

const today = new Date().toISOString().slice(0, 10);
const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

export function PortalHomePage() {
  const { me, student, select } = useSelectedStudent();
  const profile = useQuery({ queryKey: ["portal", "profile", student?.id], queryFn: () => getPortalProfile(student!.id), enabled: Boolean(student) });
  const schedule = useQuery({ queryKey: ["portal", "schedule", student?.id, today, future], queryFn: () => getPortalSchedule(student!.id, today, future), enabled: Boolean(student) });
  const attendance = useQuery({ queryKey: ["portal", "attendance", student?.id], queryFn: () => getPortalAttendance(student!.id), enabled: Boolean(student) });
  const notifications = useQuery({ queryKey: ["portal", "notifications"], queryFn: getPortalNotifications });
  return <PortalPage title={me.data?.portalType === "GUARDIAN" ? "Tổng quan gia đình" : "Tổng quan học tập"} description="Thông tin hiện tại từ trung tâm, được cập nhật theo hồ sơ và quan hệ đang có hiệu lực.">
    <QueryState query={me}>{me.data?.students.length ? <><StudentSelector student={student} students={me.data.students} onChange={select} /><div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-xl border border-[#e2e8f0] bg-white p-5"><QueryState query={profile}>{profile.data && <><h2>{profile.data.fullName}</h2><p className="mt-1 text-sm text-[#64748b]">{profile.data.code} · {profile.data.school ?? "Chưa cập nhật trường học"}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{profile.data.enrollments.slice(0, 4).map((item) => <div key={item.id} className="border-t border-[#e2e8f0] pt-3"><p className="m-0 font-semibold text-[#0f172a]">{item.className}</p><p className="mt-1 text-sm text-[#64748b]">{item.courseName ?? "Khóa học"}{item.levelName ? ` · ${item.levelName}` : ""}</p><p className="mt-2 text-xs text-[#64748b]">{item.status} · từ {formatDate(item.startedAt ?? item.enrolledAt)}</p></div>)}</div></>}</QueryState></section>
      <section className="rounded-xl border border-[#e2e8f0] bg-white p-5"><h2>Điểm danh</h2><QueryState query={attendance}>{attendance.data && <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><strong className="block text-2xl text-[#0f172a]">{attendance.data.summary.percentage ?? "—"}%</strong><span className="text-[#64748b]">Tỷ lệ tham gia</span></div><div><strong className="block text-2xl text-[#0f172a]">{attendance.data.summary.absent}</strong><span className="text-[#64748b]">Buổi vắng</span></div></div>}</QueryState><Link className="action-link mt-5 inline-block" to="/portal/attendance">Xem lịch sử</Link></section>
      <section className="rounded-xl border border-[#e2e8f0] bg-white p-5"><h2>Lịch sắp tới</h2><QueryState query={schedule}>{schedule.data?.length ? <div className="mt-4 divide-y divide-[#f1f5f9]">{schedule.data.slice(0, 4).map((item) => <div key={`${item.date}-${item.startTime}-${item.className}`} className="py-3 first:pt-0"><p className="m-0 font-semibold">{item.className}</p><p className="mt-1 text-sm text-[#64748b]">{formatDate(item.date)} · {item.startTime}–{item.endTime}{item.teacherName ? ` · ${item.teacherName}` : ""}</p></div>)}</div> : <p className="mt-4 text-sm text-[#64748b]">Không có buổi học trong 30 ngày tới.</p>}</QueryState></section>
      <section className="rounded-xl border border-[#e2e8f0] bg-white p-5"><h2>Thông báo gần đây</h2><QueryState query={notifications}>{notifications.data?.data.length ? <div className="mt-4 divide-y divide-[#f1f5f9]">{notifications.data.data.slice(0, 3).map((item) => <div key={`${item.createdAt}-${item.eventType}`} className="py-3 first:pt-0"><p className="m-0 font-semibold">{item.subject ?? "Thông báo từ trung tâm"}</p><p className="mt-1 line-clamp-2 text-sm text-[#64748b]">{item.body}</p></div>)}</div> : <p className="mt-4 text-sm text-[#64748b]">Chưa có thông báo.</p>}</QueryState></section>
    </div></> : <EmptyState title="Chưa có hồ sơ được cấp quyền" description="Liên hệ trung tâm để kiểm tra quyền truy cập." />}</QueryState>
  </PortalPage>;
}
