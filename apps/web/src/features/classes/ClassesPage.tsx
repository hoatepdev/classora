import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { classQueryKey, listClasses } from "./api.js";
import type { Class } from "./types.js";

const column = createColumnHelper<Class>();
const columns = [
  column.accessor("code", { header: "Mã", cell: ({ getValue }) => <span className="code">{getValue()}</span> }),
  column.accessor("name", { header: "Tên lớp", cell: ({ getValue, row }) => <Link className="name" to={`/classes/${row.original.id}`}>{getValue()}</Link> }),
  column.accessor("status", { header: "Trạng thái", cell: ({ getValue }) => <span className={`status ${getValue() === "DISABLED" ? "disabled" : ""}`}>{getValue() === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</span> }),
  column.display({ id: "actions", header: "Thao tác", cell: ({ row }) => <Link className="action-link" to={`/classes/${row.original.id}/edit`}>Chỉnh sửa</Link> }),
];

export function ClassesPage() {
  const query = useQuery({ queryKey: classQueryKey(), queryFn: listClasses });
  const table = useReactTable({ data: query.data ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return <main className="page">
    <div className="page-heading">
      <div><h1>Lớp học</h1><p className="subtitle">Danh sách lớp học của trung tâm.</p></div>
      <Link className="button" to="/classes/new">Thêm lớp học</Link>
    </div>
    {query.isPending ? <div className="state" aria-live="polite"><strong>Đang tải danh sách</strong>Vui lòng đợi trong giây lát.</div>
      : query.isError ? <div className="state error" role="alert"><strong>Không thể tải lớp học</strong>Kiểm tra kết nối và thử lại.</div>
      : query.data.length === 0 ? <div className="state"><strong>Chưa có lớp học</strong>Thêm lớp học đầu tiên để bắt đầu quản lý danh sách.</div>
      : <div className="register"><table>
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell => <td key={cell.id} data-label={String(cell.column.columnDef.header ?? "")}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table></div>}
  </main>;
}
