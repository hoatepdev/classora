import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { KanbanSquare, Plus, Search, Table2, UserRoundPlus } from "lucide-react";
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
import { leadQueryKey, listLeads, lookupCrmAssignees } from "./api.js";
import { activeBoardStatuses, leadSourceLabels, leadStatusLabels } from "./labels.js";
import type { Lead, LeadListFilters, LeadStatus } from "./types.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const column = createColumnHelper<Lead>();

function followUpState(value: string | null): { label: string; className: string } | null {
  if (!value) return null;
  const date = new Date(value);
  const today = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (day < now) return { label: "Quá hạn", className: "bg-[#fff5f4] text-[#b42318]" };
  if (day.getTime() === now.getTime()) return { label: "Hôm nay", className: "bg-[#eff6ff] text-[#2563eb]" };
  return { label: "Sắp tới", className: "bg-[#f1f5f9] text-[#475569]" };
}

export function LeadsPage() {
  const [view, setView] = useState<"board" | "list">("board");
  const [filters, setFilters] = useState<LeadListFilters>({ limit: 50 });
  const [leads, setLeads] = useState<Lead[]>([]);
  const query = useQuery({ queryKey: leadQueryKey(filters), queryFn: () => listLeads(filters), refetchOnWindowFocus: false });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "crm.write");
  const assignees = useQuery({ queryKey: ["crm-assignees", window.location.hostname], queryFn: lookupCrmAssignees });
  const assigneeNames = useMemo(() => new Map((assignees.data ?? []).map((assignee) => [assignee.membershipId, assignee.name])), [assignees.data]);

  useEffect(() => {
    if (query.data) setLeads((current) => filters.cursor ? [...current, ...query.data.data] : query.data.data);
  }, [filters.cursor, query.data]);

  const updateFilter = (key: keyof LeadListFilters, value: string) => {
    setLeads([]);
    setFilters((current) => ({ ...current, [key]: value || undefined, cursor: undefined }));
  };

  const columns = useMemo(() => [
    column.display({
      id: "lead",
      header: "Khách tiềm năng",
      cell: ({ row }) => <div className="min-w-48">
        <Link className="block truncate font-semibold text-[#0f172a] no-underline hover:text-[#2563eb]" to={`/leads/${row.original.id}`}>{row.original.studentName}</Link>
        <p className="mt-0.5 mb-0 truncate text-xs text-[#64748b]">{row.original.guardianName ? `${row.original.guardianName} · ` : ""}{row.original.studentPhone ?? row.original.guardianPhone ?? "Chưa có SĐT"}</p>
      </div>,
    }),
    column.accessor("interestedCourseName", { header: "Khóa học", cell: ({ getValue }) => getValue() || <span className="text-[#94a3b8]">—</span> }),
    column.accessor("source", { header: "Nguồn", cell: ({ getValue }) => getValue() ? leadSourceLabels[getValue()!] : <span className="text-[#94a3b8]">—</span> }),
    column.display({
      id: "owner",
      header: "Phụ trách",
      cell: ({ row }) => row.original.assignedMembershipId ? (assigneeNames.get(row.original.assignedMembershipId) ?? "—") : <span className="text-[#94a3b8]">Chưa phân công</span>,
    }),
    column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <StatusBadge status={getValue() === "WON" ? "ACTIVE" : getValue() === "LOST" ? "DISABLED" : "PENDING"}>{leadStatusLabels[getValue()]}</StatusBadge> }),
    column.display({
      id: "followUp",
      header: "Hẹn chăm sóc",
      cell: ({ row }) => {
        const state = followUpState(row.original.nextFollowUpAt);
        return state ? <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${state.className}`}>{state.label} · {dateFormatter.format(new Date(row.original.nextFollowUpAt!))}</span> : <span className="text-[#94a3b8]">—</span>;
      },
    }),
    column.accessor("createdAt", { header: "Ngày tạo", cell: ({ getValue }) => <span className="text-[#64748b]">{dateFormatter.format(new Date(getValue()))}</span> }),
  ], [assigneeNames]);

  const visible = view === "board" && filters.status === undefined ? leads.filter((lead) => activeBoardStatuses.includes(lead.status as (typeof activeBoardStatuses)[number])) : leads;
  const hasAnyLead = leads.length > 0 || Boolean(filters.search || filters.status || filters.followUp);

  return <PageContainer>
    <PageHeader
      title="Khách hàng tiềm năng"
      description="Quản lý pipeline bán hàng: từ tiếp cận, học thử đến ghi danh."
      primaryAction={canWrite ? <Button asChild><Link to="/leads/new"><Plus size={17} aria-hidden="true" />Thêm lead</Link></Button> : undefined}
    />
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className="relative block min-w-0 flex-1 lg:max-w-sm">
        <span className="sr-only">Tìm lead</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#94a3b8]" aria-hidden="true" />
        <Input className="pl-9" type="search" value={filters.search ?? ""} placeholder="Tìm theo tên, SĐT, email..." onChange={(event) => updateFilter("search", event.target.value)} />
      </label>
      <label>
        <span className="sr-only">Lọc theo trạng thái</span>
        <select className="input min-w-44" value={filters.status ?? ""} onChange={(event) => updateFilter("status", event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="WON">Thành công</option>
          <option value="LOST">Đã mất</option>
          {activeBoardStatuses.map((status) => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}
        </select>
      </label>
      <label>
        <span className="sr-only">Lọc theo lịch chăm sóc</span>
        <select className="input min-w-44" value={filters.followUp ?? ""} onChange={(event) => updateFilter("followUp", event.target.value)}>
          <option value="">Mọi lịch hẹn</option>
          <option value="OVERDUE">Đã quá hạn</option>
          <option value="TODAY">Hôm nay</option>
          <option value="UPCOMING">Sắp tới</option>
          <option value="NONE">Chưa hẹn</option>
        </select>
      </label>
      <label>
        <span className="sr-only">Lọc theo nhân viên phụ trách</span>
        <select className="input min-w-44" value={filters.assignedMembershipId ?? ""} onChange={(event) => updateFilter("assignedMembershipId", event.target.value)}>
          <option value="">Mọi nhân viên</option>
          {assignees.data?.map((assignee) => <option key={assignee.membershipId} value={assignee.membershipId}>{assignee.name}</option>)}
        </select>
      </label>
      <div className="flex gap-1 rounded-lg border border-[#e2e8f0] bg-white p-1 lg:ml-auto" role="group" aria-label="Kiểu hiển thị">
        <button type="button" aria-pressed={view === "board"} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${view === "board" ? "bg-[#eff6ff] text-[#2563eb]" : "text-[#64748b]"}`} onClick={() => setView("board")}><KanbanSquare size={16} aria-hidden="true" />Pipeline</button>
        <button type="button" aria-pressed={view === "list"} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-[#eff6ff] text-[#2563eb]" : "text-[#64748b]"}`} onClick={() => setView("list")}><Table2 size={16} aria-hidden="true" />Danh sách</button>
      </div>
    </div>

    {query.isPending && leads.length === 0 ? <LoadingState label="Đang tải pipeline" />
      : query.isError && leads.length === 0 ? <ErrorState title="Không thể tải lead" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : !hasAnyLead ? <EmptyState icon={UserRoundPlus} title="Chưa có lead" description="Thêm khách hàng tiềm năng đầu tiên để bắt đầu pipeline bán hàng." />
      : view === "list" ? <section aria-label="Danh sách lead">
        <DataTable columns={columns} data={leads} />
        {query.data?.nextCursor && <Button variant="secondary" className="mt-4" disabled={query.isFetching} onClick={() => setFilters((current) => ({ ...current, cursor: query.data?.nextCursor ?? undefined }))}>{query.isFetching ? "Đang tải…" : "Tải thêm"}</Button>}
      </section>
      : <section aria-label="Pipeline lead" className="grid gap-4 lg:grid-cols-5">
        {activeBoardStatuses.map((status) => {
          const columnLeads = visible.filter((lead) => lead.status === status);
          return <div key={status} className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="m-0 text-sm font-semibold text-[#0f172a]">{leadStatusLabels[status]}</h2>
              <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs font-semibold text-[#64748b]">{columnLeads.length}</span>
            </div>
            <div className="grid gap-3">
              {columnLeads.map((lead) => {
                const followUp = followUpState(lead.nextFollowUpAt);
                return <Link key={lead.id} to={`/leads/${lead.id}`} className="block rounded-xl border border-[#e2e8f0] bg-white p-3.5 no-underline transition-colors hover:border-[#2563eb]">
                  <p className="m-0 truncate font-semibold text-[#0f172a]">{lead.studentName}</p>
                  <p className="mt-1 mb-0 truncate text-xs text-[#64748b]">{lead.studentPhone ?? lead.guardianPhone ?? lead.guardianName ?? "Chưa có liên hệ"}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {lead.interestedCourseName && <span className="truncate rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[#475569]">{lead.interestedCourseName}</span>}
                    {lead.source && <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[#475569]">{leadSourceLabels[lead.source]}</span>}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-[#64748b]">{lead.assignedMembershipId ? (assigneeNames.get(lead.assignedMembershipId) ?? "—") : "Chưa phân công"}</span>
                    {followUp && <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${followUp.className}`}>{followUp.label}</span>}
                  </div>
                </Link>;
              })}
              {columnLeads.length === 0 && <p className="m-0 rounded-xl border border-dashed border-[#e2e8f0] px-3 py-4 text-center text-xs text-[#94a3b8]">Trống</p>}
            </div>
          </div>;
        })}
        {query.data?.nextCursor && <div className="lg:col-span-5"><Button variant="secondary" disabled={query.isFetching} onClick={() => setFilters((current) => ({ ...current, cursor: query.data?.nextCursor ?? undefined }))}>{query.isFetching ? "Đang tải…" : "Tải thêm"}</Button></div>}
      </section>}
  </PageContainer>;
}
