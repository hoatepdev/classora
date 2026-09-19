import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTeacher, getTeacher, teacherQueryKey, updateTeacher } from "./api.js";
import { teacherSchema, type TeacherFormValues } from "./schema.js";

const defaults: TeacherFormValues = { code: "", name: "", phone: "", email: "", note: "", status: "ACTIVE" };

export function TeacherForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const teacher = useQuery({ queryKey: [...teacherQueryKey(), id], queryFn: () => getTeacher(id!), enabled: editing });
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<TeacherFormValues>({ resolver: zodResolver(teacherSchema), defaultValues: defaults });

  useEffect(() => {
    if (!teacher.data) return;
    reset({ code: teacher.data.code, name: teacher.data.name, phone: teacher.data.phone ?? "", email: teacher.data.email ?? "", note: teacher.data.note ?? "", status: teacher.data.status });
  }, [teacher.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: TeacherFormValues) => {
      const input = { ...values, phone: values.phone || null, email: values.email || null, note: values.note || null };
      return editing ? updateTeacher(id!, input) : createTeacher(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teacherQueryKey() });
      navigate("/teachers");
    },
    onError: (error) => setError("root", { message: axios.isAxiosError(error) && error.response?.status === 409 ? "Mã giáo viên đã tồn tại trong trung tâm." : "Không thể lưu giáo viên. Vui lòng thử lại." }),
  });

  if (editing && teacher.isPending) return <PageContainer><LoadingState label="Đang tải thông tin giáo viên" /></PageContainer>;
  if (editing && teacher.isError) return <PageContainer><ErrorState title="Không tìm thấy giáo viên" message="Quay lại danh sách và thử lại." onRetry={() => void teacher.refetch()} /></PageContainer>;

  return <PageContainer className="max-w-5xl">
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/teachers"><ChevronLeft size={16} aria-hidden="true" />Giáo viên</Link></Button>
    <PageHeader title={editing ? "Chỉnh sửa giáo viên" : "Thêm giáo viên"} description={editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho hồ sơ giáo viên."} />
    <form className="form-sheet" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField id="teacher-code" label="Mã giáo viên" required error={errors.code?.message}><Input id="teacher-code" autoComplete="off" aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? "teacher-code-error" : undefined} {...register("code")} /></FormField>
        <FormField id="teacher-status" label="Trạng thái" required error={errors.status?.message}><select id="teacher-status" className="input" aria-invalid={Boolean(errors.status)} aria-describedby={errors.status ? "teacher-status-error" : undefined} {...register("status")}><option value="ACTIVE">Đang dạy</option><option value="DISABLED">Ngừng dạy</option></select></FormField>
        <FormField id="teacher-name" label="Họ và tên" required error={errors.name?.message} full><Input id="teacher-name" autoComplete="name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "teacher-name-error" : undefined} {...register("name")} /></FormField>
        <FormField id="teacher-phone" label="Điện thoại" error={errors.phone?.message}><Input id="teacher-phone" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "teacher-phone-error" : undefined} {...register("phone")} /></FormField>
        <FormField id="teacher-email" label="Email" error={errors.email?.message}><Input id="teacher-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "teacher-email-error" : undefined} {...register("email")} /></FormField>
        <FormField id="teacher-note" label="Ghi chú" error={errors.note?.message} full><Textarea id="teacher-note" rows={4} aria-invalid={Boolean(errors.note)} aria-describedby={errors.note ? "teacher-note-error" : undefined} {...register("note")} /></FormField>
      </div>
      <div className="form-actions"><Button disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu giáo viên"}</Button><Button variant="secondary" asChild><Link to="/teachers">Hủy</Link></Button></div>
    </form>
  </PageContainer>;
}
