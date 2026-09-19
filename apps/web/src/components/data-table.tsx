import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function DataTable<TData>({ columns, data }: { columns: ColumnDef<TData, any>[]; data: TData[] }) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return <Table>
    <TableHeader>
      {table.getHeaderGroups().map((group) => <TableRow key={group.id}>
        {group.headers.map((header) => <TableHead key={header.id}>
          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
        </TableHead>)}
      </TableRow>)}
    </TableHeader>
    <TableBody>
      {table.getRowModel().rows.map((row) => <TableRow key={row.id}>
        {row.getVisibleCells().map((cell) => <TableCell key={cell.id} data-label={String(cell.column.columnDef.header ?? "")}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>)}
      </TableRow>)}
    </TableBody>
  </Table>;
}
