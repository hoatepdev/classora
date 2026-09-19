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
import { courseQueryKey, createCourse, getCourse, updateCourse } from "./api.js";
import { courseSchema, type CourseFormValues } from "./schema.js";

const defaults: CourseFormValues = { code: "", name: "", description: "", status: "ACTIVE" };

export function CourseForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const course = useQuery({ queryKey: [...courseQueryKey(), id], queryFn: () => getCourse(id!), enabled: editing });
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<CourseFormValues>({ resolver: zodResolver(courseSchema), defaultValues: defaults });

  useEffect(() => {
    if (!course.data) return;
    reset({ code: course.data.code, name: course.data.name, description: course.data.description ?? "", status: course.data.status });
  }, [course.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: CourseFormValues) => {
      const input = { ...values, description: values.description || null };
      return editing ? updateCourse(id!, input) : createCourse(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseQueryKey() });
      navigate("/courses");
    },
    onError: (error) => setError("root", { message: axios.isAxiosError(error) && error.response?.status === 409 ? "Mã khóa học đã tồn tại trong trung tâm." : "Không thể lưu khóa học. Vui lòng thử lại." }),
  });

  if (editing && course.isPending) return <PageContainer><LoadingState label="Đang tải thông tin khóa học" /></PageContainer>;
  if (editing && course.isError) return <PageContainer><ErrorState title="Không tìm thấy khóa học" message="Quay lại danh sách và thử lại." onRetry={() => void course.refetch()} /></PageContainer>;

  return <PageContainer className="max-w-5xl">
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/courses"><ChevronLeft size={16} aria-hidden="true" />Khóa học</Link></Button>
    <PageHeader title={editing ? "Chỉnh sửa khóa học" : "Thêm khóa học"} description={editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho khóa học."} />
    <form className="form-sheet" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField id="course-code" label="Mã khóa học" required error={errors.code?.message}><Input id="course-code" autoComplete="off" aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? "course-code-error" : undefined} {...register("code")} /></FormField>
        <FormField id="course-status" label="Trạng thái" required error={errors.status?.message}><select id="course-status" className="input" aria-invalid={Boolean(errors.status)} aria-describedby={errors.status ? "course-status-error" : undefined} {...register("status")}><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Ngừng hoạt động</option></select></FormField>
        <FormField id="course-name" label="Tên khóa học" required error={errors.name?.message} full><Input id="course-name" autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "course-name-error" : undefined} {...register("name")} /></FormField>
        <FormField id="course-description" label="Mô tả" error={errors.description?.message} full><Textarea id="course-description" rows={4} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "course-description-error" : undefined} {...register("description")} /></FormField>
      </div>
      <div className="form-actions"><Button disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu khóa học"}</Button><Button variant="secondary" asChild><Link to="/courses">Hủy</Link></Button></div>
    </form>
  </PageContainer>;
}
