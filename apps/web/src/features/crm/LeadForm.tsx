import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import { createLead, getLead, lookupCrmAssignees, lookupCrmBranches, lookupCrmCourses, updateLead } from "./api.js";
import { leadSourceLabels } from "./labels.js";
import { leadSchema, type LeadFormValues } from "./schema.js";

const defaults: LeadFormValues = {
  studentName: "", studentPhone: "", studentEmail: "", guardianName: "", guardianPhone: "", guardianEmail: "",
  source: "", campaign: "", interestedCourseId: "", interestedCourseLevelId: "", preferredBranchId: "", assignedMembershipId: "", nextFollowUpAt: "",
};

export function LeadForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lead = useQuery({ queryKey: ["lead", window.location.hostname, id], queryFn: () => getLead(id!), enabled: editing });
  const courses = useQuery({ queryKey: ["crm-courses", window.location.hostname], queryFn: lookupCrmCourses });
  const branches = useQuery({ queryKey: ["crm-branches", window.location.hostname], queryFn: lookupCrmBranches });
  const assignees = useQuery({ queryKey: ["crm-assignees", window.location.hostname], queryFn: lookupCrmAssignees });
  const { register, handleSubmit, reset, watch, setError, formState: { errors } } = useForm<LeadFormValues>({ resolver: zodResolver(leadSchema), defaultValues: defaults });

  useEffect(() => {
    if (!lead.data) return;
    reset({
      studentName: lead.data.studentName,
      studentPhone: lead.data.studentPhone ?? "",
      studentEmail: lead.data.studentEmail ?? "",
      guardianName: lead.data.guardianName ?? "",
      guardianPhone: lead.data.guardianPhone ?? "",
      guardianEmail: lead.data.guardianEmail ?? "",
      source: lead.data.source ?? "",
      campaign: lead.data.campaign ?? "",
      interestedCourseId: lead.data.interestedCourseId ?? "",
      interestedCourseLevelId: lead.data.interestedCourseLevelId ?? "",
      preferredBranchId: lead.data.preferredBranchId ?? "",
      assignedMembershipId: lead.data.assignedMembershipId ?? "",
      nextFollowUpAt: lead.data.nextFollowUpAt ? lead.data.nextFollowUpAt.slice(0, 16) : "",
    });
  }, [lead.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: LeadFormValues) => {
      const input = {
        studentName: values.studentName,
        studentPhone: values.studentPhone || null,
        studentEmail: values.studentEmail || null,
        guardianName: values.guardianName || null,
        guardianPhone: values.guardianPhone || null,
        guardianEmail: values.guardianEmail || null,
        source: values.source || null,
        campaign: values.campaign || null,
        interestedCourseId: values.interestedCourseId || null,
        interestedCourseLevelId: values.interestedCourseLevelId || null,
        preferredBranchId: values.preferredBranchId || null,
        assignedMembershipId: values.assignedMembershipId || null,
        nextFollowUpAt: values.nextFollowUpAt ? new Date(values.nextFollowUpAt).toISOString() : null,
      };
      return editing ? updateLead(id!, input) : createLead(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["leads", window.location.hostname] });
      await queryClient.invalidateQueries({ queryKey: ["lead", window.location.hostname] });
      toast.success(editing ? "Đã cập nhật lead." : "Đã tạo lead.");
      navigate(id ? `/leads/${id}` : "/leads");
    },
    onError: (error) => setError("root", { message: getApiErrorMessage(error, "Không thể lưu lead. Vui lòng thử lại.") }),
  });

  if (editing && lead.isPending) return <PageContainer><LoadingState label="Đang tải thông tin lead" /></PageContainer>;
  if (editing && lead.isError) return <PageContainer><ErrorState title="Không tìm thấy lead" message="Quay lại danh sách và thử lại." onRetry={() => void lead.refetch()} /></PageContainer>;

  const selectedCourseId = watch("interestedCourseId");
  const levels = courses.data?.find((course) => course.id === selectedCourseId)?.levels ?? [];

  return <PageContainer className="max-w-[900px]">
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3">
      <Link to={editing ? `/leads/${id}` : "/leads"}><ChevronLeft size={16} aria-hidden="true" />Tiềm năng</Link>
    </Button>
    <PageHeader
      title={editing ? "Chỉnh sửa lead" : "Thêm lead"}
      description={editing ? "Cập nhật thông tin liên hệ và nhu cầu của khách hàng tiềm năng." : "Ghi nhận khách hàng tiềm năng mới cho trung tâm."}
    />
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {errors.root && <p className="mb-5 rounded-lg border border-[#efb6b0] bg-[#fff5f4] px-4 py-3 text-sm text-[#8d231b]" role="alert">{errors.root.message}</p>}
      <div className="grid gap-5">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] md:p-6">
          <h2 className="mb-5 border-b border-[#f1f5f9] pb-4 text-lg font-semibold text-[#0f172a]">Học viên tiềm năng</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <FormField id="lead-student-name" label="Tên học viên" required error={errors.studentName?.message} full>
              <Input id="lead-student-name" aria-invalid={Boolean(errors.studentName)} {...register("studentName")} />
            </FormField>
            <FormField id="lead-student-phone" label="Điện thoại học viên" error={errors.studentPhone?.message}>
              <Input id="lead-student-phone" type="tel" {...register("studentPhone")} />
            </FormField>
            <FormField id="lead-student-email" label="Email học viên" error={errors.studentEmail?.message}>
              <Input id="lead-student-email" type="email" {...register("studentEmail")} />
            </FormField>
          </div>
        </section>

        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] md:p-6">
          <h2 className="mb-5 border-b border-[#f1f5f9] pb-4 text-lg font-semibold text-[#0f172a]">Người giám hộ (nếu có)</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <FormField id="lead-guardian-name" label="Tên người giám hộ" error={errors.guardianName?.message}>
              <Input id="lead-guardian-name" {...register("guardianName")} />
            </FormField>
            <FormField id="lead-guardian-phone" label="Điện thoại" error={errors.guardianPhone?.message}>
              <Input id="lead-guardian-phone" type="tel" {...register("guardianPhone")} />
            </FormField>
            <FormField id="lead-guardian-email" label="Email" error={errors.guardianEmail?.message}>
              <Input id="lead-guardian-email" type="email" {...register("guardianEmail")} />
            </FormField>
          </div>
        </section>

        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] md:p-6">
          <h2 className="mb-5 border-b border-[#f1f5f9] pb-4 text-lg font-semibold text-[#0f172a]">Nhu cầu & phân công</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <FormField id="lead-course" label="Khóa học quan tâm">
              <select id="lead-course" className="input" {...register("interestedCourseId")}>
                <option value="">— Chưa chọn —</option>
                {courses.data?.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </FormField>
            <FormField id="lead-level" label="Trình độ quan tâm">
              <select id="lead-level" className="input" {...register("interestedCourseLevelId")} disabled={!selectedCourseId}>
                <option value="">— Chưa chọn —</option>
                {levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
              </select>
            </FormField>
            <FormField id="lead-branch" label="Chi nhánh mong muốn">
              <select id="lead-branch" className="input" {...register("preferredBranchId")}>
                <option value="">— Chưa chọn —</option>
                {branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </FormField>
            <FormField id="lead-assignee" label="Nhân viên phụ trách">
              <select id="lead-assignee" className="input" {...register("assignedMembershipId")}>
                <option value="">— Chưa phân công —</option>
                {assignees.data?.map((assignee) => <option key={assignee.membershipId} value={assignee.membershipId}>{assignee.name}</option>)}
              </select>
            </FormField>
            <FormField id="lead-source" label="Nguồn">
              <select id="lead-source" className="input" {...register("source")}>
                <option value="">— Chưa chọn —</option>
                {Object.entries(leadSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </FormField>
            <FormField id="lead-campaign" label="Chiến dịch" error={errors.campaign?.message}>
              <Input id="lead-campaign" placeholder="Ví dụ: hè-2026" {...register("campaign")} />
            </FormField>
            <FormField id="lead-follow-up" label="Hẹn chăm sóc lần sau" error={errors.nextFollowUpAt?.message}>
              <Input id="lead-follow-up" type="datetime-local" {...register("nextFollowUpAt")} />
            </FormField>
          </div>
        </section>
      </div>
      <div className="mt-6 flex flex-wrap gap-3 border-t border-[#e2e8f0] pt-5">
        <Button disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo lead"}</Button>
        <Button variant="secondary" asChild><Link to={editing ? `/leads/${id}` : "/leads"}>Hủy</Link></Button>
      </div>
    </form>
  </PageContainer>;
}
