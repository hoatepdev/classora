import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { BellRing, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { communicationQueryKey, listCommunications } from "./api.js";
import {
  communicationChannelLabels,
  communicationEventLabels,
  communicationRecipientLabels,
  communicationStatusLabels,
  relatedEntityLabels,
  type CommunicationListFilters,
  type CommunicationMessage,
} from "./types.js";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
const column = createColumnHelper<CommunicationMessage>();

export function CommunicationsPage({ studentId, leadId, compact = false }: { studentId?: string; leadId?: string; compact?: boolean }) {
  const [filters, setFilters] = useState<CommunicationListFilters>({ limit: 50, studentId, leadId });
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const query = useQuery({ queryKey: communicationQueryKey(filters), queryFn: () => listCommunications(filters), refetchOnWindowFocus: false });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canManage = can(membership, "communication.manage");

  useEffect(() => {
    if (query.data) setMessages((current) => filters.cursor ? [...current, ...query.data.data] : query.data.data);
  }, [filters.cursor, query.data]);

  const updateFilter = (key: keyof CommunicationListFilters, value: string) => {
    setMessages([]);
    setFilters((current) => ({ ...current, [key]: value || undefined, cursor: undefined }));
  };

  const columns = useMemo(() => [
    column.accessor("createdAt", {
      header: "Thời gian",
      cell: ({ getValue }) => <span className="whitespace-nowrap text-[#64748b]">{dateTimeFormatter.format(new Date(getValue()))}</span>,
    }),
    column.display({
      id: "recipient",
      header: "Người nhận",
      cell: ({ row }) => <div className="min-w-40">
        <Link className="block truncate font-medium text-[#0f172a] no-underline hover:text-[#2563eb]" to={`/communications/${row.original.id}`}>{row.original.recipientName ?? row.original.destination ?? "—"}</Link>
        <p className="mt-0.5 mb-0 truncate text-xs text-[#64748b]">{communicationRecipientLabels[row.original.recipientType]}{row.original.destination ? ` · ${row.original.destination}` : ""}</p>
      </div>,
    }),
    column.accessor("eventType", { header: "Sự kiện", cell: ({ getValue }) => communicationEventLabels[getValue()] }),
    column.accessor("channel", { header: "Kênh", cell: ({ getValue }) => communicationChannelLabels[getValue()] }),
    column.accessor("status", {
      header: "Trạng thái",
      cell: ({ getValue }) => <StatusBadge status={getValue() === "SENT" ? "ACTIVE" : getValue() === "FAILED" ? "ABSENT" : getValue() === "CANCELLED" ? "CANCELLED" : "PENDING"}>{communicationStatusLabels[getValue()]}</StatusBadge>,
    }),
    column.display({
      id: "related",
      header: "Liên quan",
      cell: ({ row }) => row.original.relatedEntityType
        ? <span className="text-[#64748b]">{relatedEntityLabels[row.original.relatedEntityType] ?? row.original.relatedEntityType}</span>
        : <span className="text-[#94a3b8]">—</span>,
    }),
  ], []);

  const hasFilter = Boolean(filters.eventType || filters.channel || filters.status || filters.from || filters.to || filters.recipient);

  const table = <>
    {query.isPending && messages.length === 0 ? <LoadingState label="Đang tải lịch sử thông báo" />
      : query.isError && messages.length === 0 ? <ErrorState title="Không thể tải thông báo" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : messages.length === 0 ? <EmptyState icon={BellRing} title="Chưa có thông báo" description={hasFilter ? "Không có thông báo khớp bộ lọc hiện tại." : "Các thông báo gửi cho học viên và phụ huynh sẽ xuất hiện ở đây."} />
      : <section aria-label="Danh sách thông báo">
        <DataTable columns={columns} data={messages} />
        {query.data?.nextCursor && <Button variant="secondary" className="mt-4" disabled={query.isFetching} onClick={() => setFilters((current) => ({ ...current, cursor: query.data?.nextCursor ?? undefined }))}>{query.isFetching ? "Đang tải…" : "Tải thêm"}</Button>}
      </section>}
  </>;

  if (compact) return table;

  return <PageContainer>
    <PageHeader
      title="Thông báo"
      description="Lịch sử thông báo giao dịch gửi cho học viên, phụ huynh và khách tiềm năng."
      primaryAction={can(membership, "communication.read") ? <Button variant="secondary" asChild><Link to="/communications/templates"><SlidersHorizontal size={16} aria-hidden="true" />Mẫu thông báo</Link></Button> : undefined}
    />
    <p className="subtitle rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-xs text-[#64748b]">
      EMAIL hiện chạy qua bộ chuyển phát nội bộ (provider LOCAL): trạng thái "Đã gửi" nghĩa là thông báo đã được hệ thống chấp nhận, chưa gửi đến hộp thư thật.
    </p>
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className="relative block min-w-0 flex-1 lg:max-w-sm" htmlFor="communication-recipient-search">
        <span className="sr-only">Tìm người nhận</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#94a3b8]" aria-hidden="true" />
        <Input id="communication-recipient-search" name="recipient" className="pl-9" type="search" value={filters.recipient ?? ""} placeholder="Tìm theo tên hoặc email..." onChange={(event) => updateFilter("recipient", event.target.value)} />
      </label>
      <label htmlFor="communication-event-filter">
        <span className="sr-only">Lọc theo sự kiện</span>
        <select id="communication-event-filter" name="eventType" className="input min-w-44" value={filters.eventType ?? ""} onChange={(event) => updateFilter("eventType", event.target.value)}>
          <option value="">Mọi sự kiện</option>
          {Object.entries(communicationEventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label htmlFor="communication-channel-filter">
        <span className="sr-only">Lọc theo kênh</span>
        <select id="communication-channel-filter" name="channel" className="input min-w-36" value={filters.channel ?? ""} onChange={(event) => updateFilter("channel", event.target.value)}>
          <option value="">Mọi kênh</option>
          <option value="IN_APP">Trong ứng dụng</option>
          <option value="EMAIL">Email</option>
        </select>
      </label>
      <label htmlFor="communication-status-filter">
        <span className="sr-only">Lọc theo trạng thái</span>
        <select id="communication-status-filter" name="status" className="input min-w-36" value={filters.status ?? ""} onChange={(event) => updateFilter("status", event.target.value)}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(communicationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-sm text-[#64748b]" htmlFor="communication-from-date">
        <span className="sr-only">Từ ngày</span>
        <Input id="communication-from-date" name="from" type="date" className="input" value={filters.from?.slice(0, 10) ?? ""} onChange={(event) => updateFilter("from", event.target.value ? new Date(`${event.target.value}T00:00:00`).toISOString() : "")} />
      </label>
      <label className="text-sm text-[#64748b]" htmlFor="communication-to-date">
        <span className="sr-only">Đến ngày</span>
        <Input id="communication-to-date" name="to" type="date" className="input" value={filters.to?.slice(0, 10) ?? ""} onChange={(event) => updateFilter("to", event.target.value ? new Date(`${event.target.value}T23:59:59`).toISOString() : "")} />
      </label>
    </div>
    {table}
  </PageContainer>;
}
