import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Pencil, Plus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { listTeachers, teacherQueryKey } from "./api.js";
import type { Teacher } from "./types.js";

const column = createColumnHelper<Teacher>();
const columns = [
  column.display({
    id: "teacher",
    header: "Giáo viên",
    cell: ({ row }) => <div className="min-w-52">
      <Link className="font-bold text-[#182139] no-underline hover:text-[#3730a3]" to={`/teachers/${row.original.id}`}>{row.original.name}</Link>
      <span className="mt-0.5 block text-xs font-semibold text-[#667085]">{row.original.code}</span>
    </div>,
  }),
  column.display({
    id: "contact",
    header: "Liên hệ",
    cell: ({ row }) => <div className="grid gap-0.5"><span>{row.original.phone || "—"}</span><span className="text-xs text-[#667085]">{row.original.email || "Chưa có email"}</span></div>,
  }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <StatusBadge status={getValue()}>{getValue() === "ACTIVE" ? "Đang dạy" : "Ngừng dạy"}</StatusBadge> }),
  column.display({ id: "actions", header: "Thao tác", cell: ({ row }) => <Button variant="ghost" size="sm" asChild><Link to={`/teachers/${row.original.id}/edit`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link></Button> }),
];

export function TeachersPage() {
  const query = useQuery({ queryKey: teacherQueryKey(), queryFn: listTeachers });
  return <PageContainer>
    <PageHeader title="Giáo viên" description="Quản lý đội ngũ giảng dạy của trung tâm." primaryAction={<Button asChild><Link to="/teachers/new"><Plus size={17} aria-hidden="true" />Thêm giáo viên</Link></Button>} />
    {query.isPending ? <LoadingState label="Đang tải danh sách giáo viên" />
      : query.isError ? <ErrorState title="Không thể tải giáo viên" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : query.data.length === 0 ? <EmptyState icon={Users} title="Chưa có giáo viên" description="Thêm giáo viên đầu tiên để bắt đầu quản lý đội ngũ." />
      : <section aria-label="Danh sách giáo viên"><p className="mb-3 text-sm font-semibold text-[#667085]">{query.data.length} giáo viên</p><DataTable columns={columns} data={query.data} /></section>}
  </PageContainer>;
}
