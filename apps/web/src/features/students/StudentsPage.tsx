import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { listStudents, studentQueryKey } from "./api.js";
import type { Student } from "./types.js";

const column = createColumnHelper<Student>();
const columns = [
  column.accessor("code", { header: "Mã", cell: ({ getValue }) => <span className="code">{getValue()}</span> }),
  column.accessor("fullName", { header: "Họ và tên", cell: ({ getValue, row }) => <Link className="name" to={`/students/${row.original.id}`}>{getValue()}</Link> }),
  column.accessor("phone", { header: "Điện thoại", cell: ({ getValue }) => getValue() || <span className="muted">—</span> }),
  column.accessor("email", { header: "Email", cell: ({ getValue }) => getValue() || <span className="muted">—</span> }),
  column.accessor("dateOfBirth", { header: "Ngày sinh", cell: ({ getValue }) => getValue() ? new Intl.DateTimeFormat("vi-VN").format(new Date(`${getValue()}T00:00:00`)) : <span className="muted">—</span> }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <span className={`status ${getValue() === "DISABLED" ? "disabled" : ""}`}>{getValue() === "ACTIVE" ? "Đang học" : "Ngừng học"}</span> }),
  column.display({ id: "actions", header: "Thao tác", cell: ({ row }) => <Link className="action-link" to={`/students/${row.original.id}/edit`}>Chỉnh sửa</Link> }),
];

export function StudentsPage() {
  const query = useQuery({ queryKey: studentQueryKey(), queryFn: listStudents });
  const table = useReactTable({ data: query.data ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return <main className="page">
    <div className="page-heading">
      <div><h1>Học viên</h1><p className="subtitle">Danh sách học viên của trung tâm.</p></div>
      <Link className="button" to="/students/new">Thêm học viên</Link>
    </div>
    {query.isPending ? <div className="state" aria-live="polite"><strong>Đang tải danh sách</strong>Vui lòng đợi trong giây lát.</div>
      : query.isError ? <div className="state error" role="alert"><strong>Không thể tải học viên</strong>Kiểm tra kết nối và thử lại.</div>
      : query.data.length === 0 ? <div className="state"><strong>Chưa có học viên</strong>Thêm học viên đầu tiên để bắt đầu quản lý danh sách.</div>
      : <div className="register"><table>
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell => <td key={cell.id} data-label={String(cell.column.columnDef.header ?? "")}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table></div>}
  </main>;
}
