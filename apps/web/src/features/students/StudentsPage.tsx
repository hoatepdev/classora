import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { GraduationCap, Plus } from "lucide-react";
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
  column.accessor("code", { header: "Mã", cell: ({ getValue }) => <span className="code">{getValue()}</span> }),
  column.accessor("fullName", { header: "Họ và tên", cell: ({ getValue, row }) => <Link className="name" to={`/students/${row.original.id}`}>{getValue()}</Link> }),
  column.accessor("phone", { header: "Điện thoại", cell: ({ getValue }) => getValue() || <span className="muted">—</span> }),
  column.accessor("email", { header: "Email", cell: ({ getValue }) => getValue() || <span className="muted">—</span> }),
  column.accessor("dateOfBirth", { header: "Ngày sinh", cell: ({ getValue }) => getValue() ? new Intl.DateTimeFormat("vi-VN").format(new Date(`${getValue()}T00:00:00`)) : <span className="muted">—</span> }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <StatusBadge status={getValue()}>{getValue() === "ACTIVE" ? "Đang học" : "Ngừng học"}</StatusBadge> }),
  column.display({ id: "actions", header: "Thao tác", cell: ({ row }) => <Link className="action-link" to={`/students/${row.original.id}/edit`}>Chỉnh sửa</Link> }),
];

export function StudentsPage() {
  const query = useQuery({ queryKey: studentQueryKey(), queryFn: listStudents });

  return <PageContainer>
    <PageHeader
      title="Học viên"
      description="Danh sách học viên của trung tâm."
      primaryAction={<Button asChild><Link to="/students/new"><Plus size={17} aria-hidden="true" />Thêm học viên</Link></Button>}
    />
    {query.isPending ? <LoadingState label="Đang tải danh sách học viên" />
      : query.isError ? <ErrorState title="Không thể tải học viên" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : query.data.length === 0 ? <EmptyState icon={GraduationCap} title="Chưa có học viên" description="Thêm học viên đầu tiên để bắt đầu quản lý danh sách." />
      : <DataTable columns={columns} data={query.data} />}
  </PageContainer>;
}
