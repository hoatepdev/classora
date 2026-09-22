import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Pencil, Plus, School } from "lucide-react";
import { Link } from "react-router-dom";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { classQueryKey, listClasses } from "./api.js";
import type { Class } from "./types.js";

const column = createColumnHelper<Class>();
const columns = (canWrite: boolean) => [
  column.display({
    id: "class",
    header: "Lớp học",
    cell: ({ row }) => <div className="min-w-52"><Link className="font-bold text-[#0f172a] no-underline hover:text-[#2563eb]" to={`/classes/${row.original.id}`}>{row.original.name}</Link><span className="mt-0.5 block text-xs font-semibold text-[#667085]">{row.original.code}</span></div>,
  }),
  column.accessor("courseName", { header: "Khóa học", cell: ({ getValue }) => getValue() || <span className="text-[#8a93a5]">Chưa gán khóa học</span> }),
  column.display({ id: "branch", header: "Chi nhánh", cell: ({ row }) => row.original.branchName ? `${row.original.branchCode} — ${row.original.branchName}` : "—" }),
  column.display({ id: "level", header: "Cấp độ", cell: ({ row }) => row.original.courseLevelName || "—" }),
  column.display({ id: "teacher", header: "Giáo viên", cell: ({ row }) => row.original.primaryTeacherName || "—" }),
  column.accessor("capacity", { header: "Sức chứa", cell: ({ getValue }) => getValue() ? `${getValue()} người` : "—" }),
  column.display({ id: "dates", header: "Thời gian", cell: ({ row }) => row.original.startDate || row.original.endDate ? `${row.original.startDate?.slice(0, 10) ?? "?"} – ${row.original.endDate?.slice(0, 10) ?? "?"}` : "—" }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <StatusBadge status={getValue()}>{getValue() === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</StatusBadge> }),
  column.display({ id: "actions", header: "Thao tác", cell: ({ row }) => canWrite ? <Button variant="ghost" size="sm" asChild><Link to={`/classes/${row.original.id}/edit`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link></Button> : null }),
];

export function ClassesPage() {
  const query = useQuery({ queryKey: classQueryKey(), queryFn: listClasses });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "class.write");
  return <PageContainer>
    <PageHeader title="Lớp học" description="Theo dõi các lớp đang vận hành tại trung tâm." primaryAction={canWrite ? <Button asChild><Link to="/classes/new"><Plus size={17} aria-hidden="true" />Thêm lớp học</Link></Button> : undefined} />
    {query.isPending ? <LoadingState label="Đang tải danh sách lớp học" />
      : query.isError ? <ErrorState title="Không thể tải lớp học" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : query.data.length === 0 ? <EmptyState icon={School} title="Chưa có lớp học" description="Thêm lớp học đầu tiên để bắt đầu vận hành." />
      : <section aria-label="Danh sách lớp học"><p className="mb-3 text-sm font-semibold text-[#667085]">{query.data.length} lớp học</p><DataTable columns={columns(canWrite)} data={query.data} /></section>}
  </PageContainer>;
}
