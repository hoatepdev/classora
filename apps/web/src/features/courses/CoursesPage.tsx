import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { BookOpen, Pencil, Plus } from "lucide-react";
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
import { courseQueryKey, listCourses } from "./api.js";
import type { Course } from "./types.js";

const column = createColumnHelper<Course>();
const columns = (canWrite: boolean) => [
  column.display({
    id: "course",
    header: "Khóa học",
    cell: ({ row }) => <div className="min-w-56"><Link className="font-bold text-[#0f172a] no-underline hover:text-[#2563eb]" to={`/courses/${row.original.id}`}>{row.original.name}</Link><span className="mt-0.5 block text-xs font-semibold text-[#667085]">{row.original.code}</span></div>,
  }),
  column.accessor("description", { header: "Mô tả", cell: ({ getValue }) => <span className="line-clamp-2 max-w-xl text-[#667085]">{getValue() || "Chưa có mô tả"}</span> }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <StatusBadge status={getValue()}>{getValue() === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</StatusBadge> }),
  column.display({ id: "actions", header: "Thao tác", cell: ({ row }) => canWrite ? <Button variant="ghost" size="sm" asChild><Link to={`/courses/${row.original.id}/edit`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link></Button> : null }),
];

export function CoursesPage() {
  const query = useQuery({ queryKey: courseQueryKey(), queryFn: listCourses });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "course.write");
  return <PageContainer>
    <PageHeader title="Khóa học" description="Quản lý các chương trình đào tạo của trung tâm." primaryAction={canWrite ? <Button asChild><Link to="/courses/new"><Plus size={17} aria-hidden="true" />Thêm khóa học</Link></Button> : undefined} />
    {query.isPending ? <LoadingState label="Đang tải danh sách khóa học" />
      : query.isError ? <ErrorState title="Không thể tải khóa học" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : query.data.length === 0 ? <EmptyState icon={BookOpen} title="Chưa có khóa học" description="Thêm khóa học đầu tiên để tổ chức chương trình đào tạo." />
      : <section aria-label="Danh sách khóa học"><p className="mb-3 text-sm font-semibold text-[#667085]">{query.data.length} khóa học</p><DataTable columns={columns(canWrite)} data={query.data} /></section>}
  </PageContainer>;
}
