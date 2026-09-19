import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { GraduationCap, Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
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
import { listStudents, studentQueryKey } from "./api.js";
import type { Student } from "./types.js";

const column = createColumnHelper<Student>();
const columns = [
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
    cell: ({ row }) => <Button variant="ghost" size="sm" asChild className="size-9 px-0">
      <Link to={`/students/${row.original.id}/edit`} aria-label={`Chỉnh sửa ${row.original.fullName}`}><Pencil size={16} aria-hidden="true" /></Link>
    </Button>,
  }),
];

type StatusFilter = "ALL" | Student["status"];

export function StudentsPage() {
  const query = useQuery({ queryKey: studentQueryKey(), queryFn: listStudents });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const students = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("vi-VN");
    return query.data?.filter((student) => {
      const matchesStatus = status === "ALL" || student.status === status;
      const matchesSearch = !term || [student.fullName, student.code, student.phone, student.email]
        .some((value) => value?.toLocaleLowerCase("vi-VN").includes(term));
      return matchesStatus && matchesSearch;
    }) ?? [];
  }, [query.data, search, status]);

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
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative block min-w-0 flex-1 sm:max-w-md">
            <span className="sr-only">Tìm học viên</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#94a3b8]" aria-hidden="true" />
            <Input className="pl-9" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, mã học viên..." />
          </label>
          <label>
            <span className="sr-only">Lọc theo trạng thái</span>
            <select className="input min-w-48" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang học</option>
              <option value="DISABLED">Ngừng học</option>
            </select>
          </label>
        </div>
        <p className="mb-3 text-sm font-medium text-[#475569]">{students.length} học viên</p>
        {students.length === 0
          ? <div className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-10 text-center text-sm text-[#64748b] shadow-[0_1px_2px_rgba(15,23,42,.04)]">Không tìm thấy học viên phù hợp.</div>
          : <DataTable columns={columns} data={students} />}
      </section>}
  </PageContainer>;
}
