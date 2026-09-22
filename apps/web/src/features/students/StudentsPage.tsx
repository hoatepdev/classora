import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { GraduationCap, Pencil, Plus, Search } from "lucide-react";
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
import { listStudents, studentQueryKey, type StudentListFilters } from "./api.js";
import type { Student } from "./types.js";

const column = createColumnHelper<Student>();
const columns = (canWrite: boolean) => [
  column.display({
    id: "student",
    header: "Học viên",
    cell: ({ row }) => <div className="flex min-w-52 items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eff6ff] text-xs font-semibold text-[#2563eb]" aria-hidden="true">
        {row.original.fullName.split(" ").filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase()}
      </div>
      <Link className="block truncate font-semibold text-[#0f172a] no-underline hover:text-[#2563eb]" to={`/students/${row.original.id}`}>{row.original.fullName}</Link>
    </div>,
  }),
  column.accessor("code", { header: "Mã", cell: ({ getValue }) => <span className="font-medium text-[#475569]">{getValue()}</span> }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <StatusBadge status={getValue()}>{getValue() === "ACTIVE" ? "Đang học" : "Ngừng học"}</StatusBadge> }),
  column.accessor("phone", { header: "Điện thoại", cell: ({ getValue }) => getValue() || <span className="text-[#94a3b8]">Chưa có</span> }),
  column.display({
    id: "actions",
    header: "Thao tác",
    cell: ({ row }) => canWrite ? <Button variant="ghost" size="sm" asChild className="size-9 px-0">
      <Link to={`/students/${row.original.id}/edit`} aria-label={`Chỉnh sửa ${row.original.fullName}`}><Pencil size={16} aria-hidden="true" /></Link>
    </Button> : null,
  }),
];

type StatusFilter = "ALL" | Student["status"];

export function StudentsPage() {
  const [filters, setFilters] = useState<StudentListFilters>({ limit: 50 });
  const [students, setStudents] = useState<Student[]>([]);
  const query = useQuery({ queryKey: studentQueryKey(filters), queryFn: () => listStudents(filters), refetchOnWindowFocus: false });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canWrite = can(membership, "student.write");
  const columnsForUser = useMemo(() => columns(canWrite), [canWrite]);

  useEffect(() => {
    if (query.data) setStudents((current) => filters.cursor ? [...current, ...query.data.data] : query.data.data);
  }, [filters.cursor, query.data]);

  const updateFilter = (key: "search" | "status", value: string) => {
    setStudents([]);
    setFilters((current) => ({ ...current, [key]: value || undefined, cursor: undefined }));
  };

  return <PageContainer>
    <PageHeader
      title="Học viên"
      description="Quản lý hồ sơ học viên của trung tâm."
      primaryAction={canWrite ? <Button asChild><Link to="/students/new"><Plus size={17} aria-hidden="true" />Thêm học viên</Link></Button> : undefined}
    />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row">
      <label className="relative block min-w-0 flex-1 sm:max-w-md">
        <span className="sr-only">Tìm học viên</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#94a3b8]" aria-hidden="true" />
        <Input className="pl-9" type="search" value={filters.search ?? ""} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Tìm theo tên, mã, điện thoại, email..." />
      </label>
      <label>
        <span className="sr-only">Lọc theo trạng thái</span>
        <select className="input min-w-48" value={filters.status ?? "ALL"} onChange={(event) => updateFilter("status", event.target.value === "ALL" ? "" : event.target.value)}>
          <option value="ALL">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang học</option>
          <option value="DISABLED">Ngừng học</option>
        </select>
      </label>
    </div>
    {query.isPending && students.length === 0 ? <LoadingState label="Đang tải danh sách học viên" />
      : query.isError && students.length === 0 ? <ErrorState title="Không thể tải học viên" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />
      : students.length === 0 ? <EmptyState icon={GraduationCap} title={filters.search || filters.status ? "Không tìm thấy học viên" : "Chưa có học viên"} description={filters.search || filters.status ? "Thử thay đổi từ khóa hoặc bộ lọc." : "Thêm học viên đầu tiên để bắt đầu quản lý danh sách."} />
      : <section aria-label="Danh sách học viên">
        <p className="mb-3 text-sm font-medium text-[#475569]">{students.length} học viên đã tải</p>
        <DataTable columns={columnsForUser} data={students} />
        {query.data?.nextCursor && <Button variant="secondary" className="mt-4" disabled={query.isFetching} onClick={() => setFilters((current) => ({ ...current, cursor: query.data?.nextCursor ?? undefined }))}>{query.isFetching ? "Đang tải…" : "Tải thêm"}</Button>}
      </section>}
  </PageContainer>;
}
