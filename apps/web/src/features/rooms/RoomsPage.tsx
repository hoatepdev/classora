import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { DoorOpen, Pencil, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { roomQueryKey, listRooms } from "./api.js";
import type { Room } from "./types.js";

const column = createColumnHelper<Room>();
const columns = (canWrite: boolean) => [
  column.display({ id: "room", header: "Phòng học", cell: ({ row }) => <div className="min-w-52"><Link className="font-bold text-[#0f172a] no-underline hover:text-[#2563eb]" to={`/rooms/${row.original.id}`}>{row.original.name}</Link><span className="mt-0.5 block text-xs font-semibold text-[#667085]">{row.original.code}</span></div> }),
  column.display({ id: "branch", header: "Chi nhánh", cell: ({ row }) => <span>{row.original.branchCode} — {row.original.branchName}</span> }),
  column.accessor("capacity", { header: "Sức chứa", cell: ({ getValue }) => getValue() ? `${getValue()} người` : "—" }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <StatusBadge status={getValue()}>{getValue() === "ACTIVE" ? "Đang sử dụng" : "Ngừng sử dụng"}</StatusBadge> }),
  column.display({ id: "actions", header: "Thao tác", cell: ({ row }) => canWrite ? <Button variant="ghost" size="sm" asChild><Link to={`/rooms/${row.original.id}/edit`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link></Button> : null }),
];

export function RoomsPage() {
  const query = useQuery({ queryKey: roomQueryKey(), queryFn: () => listRooms() });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "room.write");
  return <PageContainer>
    <PageHeader title="Phòng học" description="Quản lý các phòng học và sức chứa tại trung tâm." primaryAction={canWrite ? <Button asChild><Link to="/rooms/new"><Plus size={17} aria-hidden="true" />Thêm phòng học</Link></Button> : undefined} />
    {query.isPending ? <LoadingState label="Đang tải danh sách phòng học" />
      : query.isError ? <ErrorState title="Không thể tải phòng học" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : query.data.length === 0 ? <EmptyState icon={DoorOpen} title="Chưa có phòng học" description="Thêm phòng học đầu tiên để sắp xếp lịch học." />
      : <section aria-label="Danh sách phòng học"><p className="mb-3 text-sm font-semibold text-[#667085]">{query.data.length} phòng học</p><DataTable columns={columns(canWrite)} data={query.data} /></section>}
  </PageContainer>;
}
