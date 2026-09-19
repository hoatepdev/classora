import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { GraduationCap, Pencil, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { listStudents, studentQueryKey } from "./api.js";
import type { Student } from "./types.js";

const column = createColumnHelper<Student>();
const columns = [
  column.display({
    id: "student",
    header: "Học viên",
    cell: ({ row }) => <div className="flex min-w-52 items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#ecebff] text-xs font-extrabold text-[#3730a3]" aria-hidden="true">
        {row.original.fullName.split(" ").slice(-2).map((part) => part[0]).join("").toUpperCase()}
      </div>
      <div className="min-w-0">
        <Link className="block truncate font-bold text-[#182139] no-underline hover:text-[#3730a3]" to={`/students/${row.original.id}`}>{row.original.fullName}</Link>
        <span className="mt-0.5 block text-xs font-semibold text-[#667085]">{row.original.code}</span>
      </div>
    </div>,
  }),
  column.display({
    id: "contact",
    header: "Liên hệ",
    cell: ({ row }) => <div className="grid gap-0.5">
      <span>{row.original.phone || <span className="text-[#8a93a5]">Chưa có số điện thoại</span>}</span>
      <span className="text-xs text-[#667085]">{row.original.email || "Chưa có email"}</span>
    </div>,
  }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <StatusBadge status={getValue()}>{getValue() === "ACTIVE" ? "Đang học" : "Ngừng học"}</StatusBadge> }),
  column.display({
    id: "actions",
    header: "Thao tác",
    cell: ({ row }) => <Button variant="ghost" size="sm" asChild>
      <Link to={`/students/${row.original.id}/edit`} aria-label={`Chỉnh sửa ${row.original.fullName}`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link>
    </Button>,
  }),
];

export function StudentsPage() {
  const query = useQuery({ queryKey: studentQueryKey(), queryFn: listStudents });

  return <PageContainer>
    <PageHeader
      title="Học viên"
      description="Quản lý hồ sơ học viên của trung tâm."
      primaryAction={<Button asChild><Link to="/students/new"><Plus size={17} aria-hidden="true" />Thêm học viên</Link></Button>}
    />
    {query.isPending ? <LoadingState label="Đang tải danh sách học viên" />
      : query.isError ? <ErrorState title="Không thể tải học viên" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : query.data.length === 0 ? <EmptyState icon={GraduationCap} title="Chưa có học viên" description="Thêm học viên đầu tiên để bắt đầu quản lý danh sách." />
      : <section aria-label="Danh sách học viên">
        <p className="mb-3 text-sm font-semibold text-[#667085]">{query.data.length} học viên</p>
        <DataTable columns={columns} data={query.data} />
      </section>}
  </PageContainer>;
}
