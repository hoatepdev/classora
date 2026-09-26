import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { getPortalSchedule } from "./api";
import { formatDate, PortalPage, QueryState, StudentSelector, useSelectedStudent } from "./portal-ui";

const initialFrom = new Date().toISOString().slice(0, 10);
const initialTo = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

export function PortalSchedulePage() {
  const { me, student, select } = useSelectedStudent(); const [from, setFrom] = useState(initialFrom); const [to, setTo] = useState(initialTo);
  const query = useQuery({ queryKey: ["portal", "schedule", student?.id, from, to], queryFn: () => getPortalSchedule(student!.id, from, to), enabled: Boolean(student) });
  return <PortalPage title="Lịch học" description="Các buổi học theo khoảng ngày đã chọn."><StudentSelector student={student} students={me.data?.students ?? []} onChange={select} /><div className="mb-5 grid max-w-xl gap-3 sm:grid-cols-2"><label htmlFor="portal-schedule-from">Từ ngày<input className="input mt-1" id="portal-schedule-from" name="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label htmlFor="portal-schedule-to">Đến ngày<input className="input mt-1" id="portal-schedule-to" name="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><QueryState query={query}>{query.data?.length ? <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white"><div className="divide-y divide-[#f1f5f9]">{query.data.map((item) => <article key={`${item.date}-${item.startTime}-${item.className}`} className="grid gap-2 p-4 sm:grid-cols-[130px_1fr_auto] sm:items-center"><div><p className="m-0 font-semibold">{formatDate(item.date)}</p><p className="mt-1 text-sm text-[#64748b]">{item.startTime}–{item.endTime}</p></div><div><h2 className="text-base">{item.className}</h2><p className="mt-1 text-sm text-[#64748b]">{[item.courseName, item.levelName, item.teacherName].filter(Boolean).join(" · ")}</p><p className="mt-1 text-sm text-[#64748b]">{[item.roomName, item.branchName].filter(Boolean).join(" · ")}</p></div><span className="status">{item.status}</span></article>)}</div></div> : <EmptyState title="Không có buổi học" description="Thử chọn một khoảng ngày khác." />}</QueryState></PortalPage>;
}
