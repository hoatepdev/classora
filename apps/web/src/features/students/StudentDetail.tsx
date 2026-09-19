import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StudentAttendanceSection } from "../attendance/StudentAttendanceSection.js";
import { listStudentEnrollments, studentEnrollmentQueryKey } from "../enrollments/api.js";
import { getStudent, studentQueryKey } from "./api.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");

export function StudentDetail() {
  const { id } = useParams();
  const student = useQuery({ queryKey: [...studentQueryKey(), id], queryFn: () => getStudent(id!), enabled: Boolean(id) });
  const enrollments = useQuery({ queryKey: studentEnrollmentQueryKey(id ?? ""), queryFn: () => listStudentEnrollments(id!), enabled: Boolean(id) });

  if (student.isPending) return <PageContainer><LoadingState label="Đang tải thông tin học viên" /></PageContainer>;
  if (student.isError) {
    const notFound = axios.isAxiosError(student.error) && student.error.response?.status === 404;
    return <PageContainer><ErrorState title={notFound ? "Không tìm thấy học viên" : "Không thể tải học viên"} message="Quay lại danh sách và thử lại." onRetry={() => void student.refetch()} /></PageContainer>;
  }

  const initials = student.data.fullName.split(" ").filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();

  return <PageContainer>
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/students"><ChevronLeft size={16} aria-hidden="true" />Học viên</Link></Button>
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <div className="grid size-13 shrink-0 place-items-center rounded-full bg-[#eff6ff] text-sm font-bold text-[#2563eb]" aria-hidden="true">{initials}</div>
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[1.75rem] leading-tight font-bold tracking-[-.025em] text-[#0f172a] md:text-[2rem]">{student.data.fullName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#64748b]"><span>{student.data.code}</span><span aria-hidden="true">·</span><StatusBadge status={student.data.status}>{student.data.status === "ACTIVE" ? "Đang học" : "Ngừng học"}</StatusBadge></div>
        </div>
      </div>
      <Button variant="secondary" asChild><Link to={`/students/${student.data.id}/edit`}><Pencil size={16} aria-hidden="true" />Chỉnh sửa</Link></Button>
    </header>

    <div className="grid gap-5 lg:grid-cols-2">
      <DetailSection title="Thông tin cá nhân" fields={[
        ["Họ và tên", student.data.fullName],
        ["Mã học viên", student.data.code],
        ["Ngày sinh", student.data.dateOfBirth ? dateFormatter.format(new Date(`${student.data.dateOfBirth}T00:00:00`)) : "—"],
        ["Trạng thái", student.data.status === "ACTIVE" ? "Đang học" : "Ngừng học"],
      ]} />
      <DetailSection title="Thông tin liên hệ" fields={[
        ["Điện thoại", student.data.phone ?? "—"],
        ["Email", student.data.email ?? "—"],
      ]} />
    </div>

    <section className="mt-7" aria-labelledby="student-classes-heading">
      <div className="mb-3">
        <h2 id="student-classes-heading" className="text-lg font-semibold text-[#0f172a]">Lớp học</h2>
        <p className="mt-1 mb-0 text-sm text-[#64748b]">Các lớp học viên đã ghi danh.</p>
      </div>
      {enrollments.isPending ? <LoadingState label="Đang tải lớp học" />
        : enrollments.isError ? <ErrorState title="Không thể tải lớp học" message="Vui lòng thử lại." onRetry={() => void enrollments.refetch()} />
        : enrollments.data.length === 0 ? <div className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-10 text-center text-sm text-[#64748b] shadow-[0_1px_2px_rgba(15,23,42,.04)]">Học viên chưa ghi danh vào lớp nào.</div>
        : <Table>
          <TableHeader><TableRow><TableHead>Mã lớp</TableHead><TableHead>Tên lớp</TableHead><TableHead>Trạng thái</TableHead><TableHead>Ngày ghi danh</TableHead></TableRow></TableHeader>
          <TableBody>{enrollments.data.map((enrollment) => <TableRow key={enrollment.id}>
            <TableCell className="font-semibold text-[#334155]">{enrollment.classCode}</TableCell>
            <TableCell><Link className="font-medium text-[#2563eb] underline-offset-3 hover:underline" to={`/classes/${enrollment.classId}`}>{enrollment.className}</Link></TableCell>
            <TableCell><StatusBadge status={enrollment.status}>{enrollment.status === "ACTIVE" ? "Đang học" : "Đã rút"}</StatusBadge></TableCell>
            <TableCell>{dateFormatter.format(new Date(enrollment.enrolledAt))}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
    </section>

    <StudentAttendanceSection studentId={student.data.id} />
  </PageContainer>;
}

function DetailSection({ title, fields }: { title: string; fields: string[][] }) {
  return <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] md:p-6">
    <h2 className="border-b border-[#f1f5f9] pb-4 text-lg font-semibold text-[#0f172a]">{title}</h2>
    <dl className="m-0 divide-y divide-[#f1f5f9]">
      {fields.map(([label, value]) => <div className="grid gap-1 py-3.5 sm:grid-cols-[140px_1fr] sm:gap-5" key={label}><dt className="text-[13px] font-medium text-[#64748b]">{label}</dt><dd className="m-0 text-sm font-medium text-[#0f172a]">{value}</dd></div>)}
    </dl>
  </section>;
}
