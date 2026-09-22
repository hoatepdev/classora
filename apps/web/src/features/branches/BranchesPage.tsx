import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Building2, Pencil, Plus } from "lucide-react";
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
import { branchQueryKey, listBranches } from "./api.js";
import type { Branch } from "./types.js";

const column = createColumnHelper<Branch>();
const columns = (canWrite: boolean) => [
  column.display({ id: "branch", header: "Chi nhánh", cell: ({ row }) => <div className="min-w-52"><Link className="font-bold text-[#0f172a] no-underline hover:text-[#2563eb]" to={`/branches/${row.original.id}`}>{row.original.name}</Link><span className="mt-0.5 block text-xs font-semibold text-[#667085]">{row.original.code}</span></div> }),
  column.display({ id: "contact", header: "Liên hệ", cell: ({ row }) => <div className="grid gap-0.5"><span>{row.original.phone || "—"}</span><span className="text-xs text-[#667085]">{row.original.email || row.original.address || "Chưa có liên hệ"}</span></div> }),
  column.accessor("roomCount", { header: "Phòng học", cell: ({ getValue }) => getValue() }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <StatusBadge status={getValue()}>{getValue() === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</StatusBadge> }),
  column.display({ id: "actions", header: "Thao tác", cell: ({ row }) => canWrite ? <Button variant="ghost" size="sm" asChild><Link to={`/branches/${row.original.id}/edit`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link></Button> : null }),
];

export function BranchesPage() {
  const query = useQuery({ queryKey: branchQueryKey(), queryFn: listBranches });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "branch.write");
  return <PageContainer>
    <PageHeader title="Chi nhánh" description="Quản lý các chi nhánh của trung tâm." primaryAction={canWrite ? <Button asChild><Link to="/branches/new"><Plus size={17} aria-hidden="true" />Thêm chi nhánh</Link></Button> : undefined} />
    {query.isPending ? <LoadingState label="Đang tải danh sách chi nhánh" />
      : query.isError ? <ErrorState title="Không thể tải chi nhánh" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : query.data.length === 0 ? <EmptyState icon={Building2} title="Chưa có chi nhánh" description="Thêm chi nhánh đầu tiên để tổ chức hoạt động của trung tâm." />
      : <section aria-label="Danh sách chi nhánh"><p className="mb-3 text-sm font-semibold text-[#667085]">{query.data.length} chi nhánh</p><DataTable columns={columns(canWrite)} data={query.data} /></section>}
  </PageContainer>;
}
