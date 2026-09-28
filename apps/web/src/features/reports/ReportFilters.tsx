import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can, currentMembership } from "@/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { branchQueryKey, listBranches } from "@/features/branches/api";
import { classQueryKey, listClasses } from "@/features/classes/api";
import { courseQueryKey, listCourses } from "@/features/courses/api";
import { courseLevelQueryKey, listCourseLevels } from "@/features/courses/levels";
import { lookupCrmAssignees, lookupCrmBranches } from "@/features/crm/api";
import { studentQueryKey, listStudents } from "@/features/students/api";
import { teacherQueryKey, listTeachers } from "@/features/teachers/api";
import { sourceLabels, statusLabels, statusOptions } from "./labels";
import type { ReportCatalogItem, ReportFilters } from "./types";

function iso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
function businessToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Number(value.year), Number(value.month) - 1, Number(value.day));
}
function defaultDates() { const now = businessToday(); return { from: iso(startOfMonth(now)), to: iso(now) }; }

export function reportInitialFilters(): ReportFilters { return { ...defaultDates(), page: 1, pageSize: 50 }; }

function presetDates(preset: string) {
  const now = businessToday();
  if (preset === "month") return { from: iso(startOfMonth(now)), to: iso(now) };
  if (preset === "last-month") { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { from: iso(d), to: iso(endOfMonth(d)) }; }
  if (preset === "30-days") { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: iso(d), to: iso(now) }; }
  if (preset === "quarter") { const d = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); return { from: iso(d), to: iso(now) }; }
  return null;
}

export function ReportFiltersBar({ report, value, onApply }: { report: ReportCatalogItem; value: ReportFilters; onApply: (filters: ReportFilters) => void }) {
  const [draft, setDraft] = useState(value);
  const [advanced, setAdvanced] = useState(false);
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = currentMembership(user.data, tenant.data?.tenantId);
  const needs = (filter: string) => report.filters.includes(filter as never);
  const branches = useQuery({
    queryKey: report.key === "crm" ? ["crm-lookups", "branches", window.location.hostname] : branchQueryKey(),
    queryFn: report.key === "crm" ? lookupCrmBranches : listBranches,
    enabled: needs("branchId") && (report.key === "crm" ? can(membership, "crm.read") : can(membership, "branch.read")),
  });
  const courses = useQuery({ queryKey: courseQueryKey(), queryFn: listCourses, enabled: needs("courseId") && can(membership, "course.read") });
  const levels = useQuery({ queryKey: courseLevelQueryKey(draft.courseId ?? ""), queryFn: () => listCourseLevels(draft.courseId!), enabled: needs("courseLevelId") && Boolean(draft.courseId) });
  const classes = useQuery({ queryKey: classQueryKey(), queryFn: listClasses, enabled: needs("classId") && can(membership, "class.read") });
  const teachers = useQuery({ queryKey: teacherQueryKey(), queryFn: listTeachers, enabled: needs("teacherId") && can(membership, "teacher.read") });
  const students = useQuery({ queryKey: studentQueryKey({ limit: 100 }), queryFn: () => listStudents({ limit: 100 }), enabled: needs("studentId") && can(membership, "student.read") });
  const assignees = useQuery({ queryKey: ["crm-lookups", "assignees", window.location.hostname], queryFn: lookupCrmAssignees, enabled: needs("salesOwnerId") && can(membership, "crm.read") });
  const optionalVisible = useMemo(() => report.filters.some((filter) => !["status", "source"].includes(filter)), [report.filters]);

  const set = (key: keyof ReportFilters, next: string | number) => setDraft((current) => {
    if (next === "" && key !== "from" && key !== "to") {
      const updated = { ...current, page: 1 };
      delete updated[key];
      return updated;
    }
    return { ...current, [key]: next, page: 1 };
  });
  const select = "input min-h-10.5 w-full";
  return <section className="rounded-xl border border-[#e2e8f0] bg-white p-4 md:p-5">
    <div className="flex flex-wrap gap-2" aria-label="Khoảng thời gian nhanh">
      {[{ id: "month", label: "Tháng này" }, { id: "last-month", label: "Tháng trước" }, { id: "30-days", label: "30 ngày gần nhất" }, { id: "quarter", label: "Quý này" }].map((preset) => <Button key={preset.id} type="button" variant="secondary" size="sm" onClick={() => { const dates = presetDates(preset.id); if (dates) setDraft((current) => ({ ...current, ...dates, page: 1 })); }}>{preset.label}</Button>)}
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Từ ngày<Input name="from" type="date" value={draft.from} onChange={(event) => set("from", event.target.value)} /></label>
      <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Đến ngày<Input name="to" type="date" value={draft.to} onChange={(event) => set("to", event.target.value)} /></label>
      {needs("status") && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Trạng thái<select name="status" className={select} value={draft.status ?? ""} onChange={(event) => set("status", event.target.value)}><option value="">Tất cả</option>{(statusOptions[report.key] ?? []).map((status) => <option key={status} value={status}>{statusLabels[status] ?? status}</option>)}</select></label>}
      {needs("source") && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Nguồn<select name="source" className={select} value={draft.source ?? ""} onChange={(event) => set("source", event.target.value)}><option value="">Tất cả</option>{Object.entries(sourceLabels).map(([source, label]) => <option key={source} value={source}>{label}</option>)}</select></label>}
    </div>
    {optionalVisible && <button type="button" className="mt-4 text-sm font-semibold text-[#2563eb] underline-offset-4 hover:underline" onClick={() => setAdvanced((shown) => !shown)}>{advanced ? "Ẩn bộ lọc thêm" : "Bộ lọc thêm"}</button>}
    {advanced && <div className="mt-4 grid gap-4 border-t border-[#f1f5f9] pt-4 sm:grid-cols-2 lg:grid-cols-4">
      {needs("branchId") && branches.data && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Chi nhánh<select name="branchId" className={select} value={draft.branchId ?? ""} onChange={(event) => set("branchId", event.target.value)}><option value="">Tất cả</option>{branches.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {needs("courseId") && courses.data && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Khóa học<select name="courseId" className={select} value={draft.courseId ?? ""} onChange={(event) => { const courseId = event.target.value; setDraft((current) => { const updated = { ...current, courseId, page: 1 }; delete updated.courseLevelId; return updated; }); }}><option value="">Tất cả</option>{courses.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {needs("courseLevelId") && draft.courseId && levels.data && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Cấp độ<select name="courseLevelId" className={select} value={draft.courseLevelId ?? ""} onChange={(event) => set("courseLevelId", event.target.value)}><option value="">Tất cả</option>{levels.data.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>}
      {needs("classId") && classes.data && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Lớp học<select name="classId" className={select} value={draft.classId ?? ""} onChange={(event) => set("classId", event.target.value)}><option value="">Tất cả</option>{classes.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {needs("teacherId") && teachers.data && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Giáo viên<select name="teacherId" className={select} value={draft.teacherId ?? ""} onChange={(event) => set("teacherId", event.target.value)}><option value="">Tất cả</option>{teachers.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {needs("studentId") && students.data && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Học viên<select name="studentId" className={select} value={draft.studentId ?? ""} onChange={(event) => set("studentId", event.target.value)}><option value="">Tất cả</option>{students.data.data.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>}
      {needs("salesOwnerId") && assignees.data && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Người phụ trách<select name="salesOwnerId" className={select} value={draft.salesOwnerId ?? ""} onChange={(event) => set("salesOwnerId", event.target.value)}><option value="">Tất cả</option>{assignees.data.map((item) => <option key={item.membershipId} value={item.membershipId}>{item.name}</option>)}</select></label>}
    </div>}
    <div className="mt-5 flex justify-end"><Button type="button" onClick={() => onApply({ ...draft, page: 1 })}>Áp dụng</Button></div>
  </section>;
}
