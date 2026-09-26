import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { getPortalNotifications } from "./api";
import { formatDateTime, PortalPage, QueryState } from "./portal-ui";

export function PortalNotificationsPage() {
  const query = useQuery({ queryKey: ["portal", "notifications"], queryFn: getPortalNotifications });
  return <PortalPage title="Thông báo" description="Thông báo trong ứng dụng được trung tâm gửi trực tiếp đến hồ sơ của bạn."><QueryState query={query}>{query.data?.data.length ? <div className="grid gap-3">{query.data.data.map((item) => <article key={`${item.createdAt}-${item.eventType}`} className="rounded-xl border border-[#e2e8f0] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-base">{item.subject ?? "Thông báo từ trung tâm"}</h2><time className="text-xs text-[#64748b]">{formatDateTime(item.createdAt)}</time></div><p className="mt-3 mb-0 whitespace-pre-wrap text-sm leading-6 text-[#334155]">{item.body}</p></article>)}</div> : <EmptyState title="Chưa có thông báo" description="Thông báo mới từ trung tâm sẽ xuất hiện tại đây." />}</QueryState></PortalPage>;
}
