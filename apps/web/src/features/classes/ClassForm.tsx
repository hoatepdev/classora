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
import { courseClassQueryKey, courseQueryKey, listCourses } from "../courses/api.js";
import { classQueryKey, createClass, getClass, updateClass } from "./api.js";
import { classSchema, type ClassFormValues } from "./schema.js";

const defaults: ClassFormValues = { courseId: "", code: "", name: "", description: "", status: "ACTIVE" };

export function ClassForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const classRecord = useQuery({ queryKey: [...classQueryKey(), id], queryFn: () => getClass(id!), enabled: editing });
  const courses = useQuery({ queryKey: courseQueryKey(), queryFn: listCourses });
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<ClassFormValues>({ resolver: zodResolver(classSchema), defaultValues: defaults });

  useEffect(() => {
    if (!classRecord.data) return;
    reset({ courseId: classRecord.data.courseId ?? "", code: classRecord.data.code, name: classRecord.data.name, description: classRecord.data.description ?? "", status: classRecord.data.status });
  }, [classRecord.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: ClassFormValues) => {
      const input = { ...values, description: values.description || null };
      return editing ? updateClass(id!, input) : createClass(input);
    },
    onSuccess: async (saved) => {
      const previousCourseId = classRecord.data?.courseId;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classQueryKey() }),
        queryClient.invalidateQueries({ queryKey: courseClassQueryKey(saved.courseId!) }),
      ]);
      if (previousCourseId && previousCourseId !== saved.courseId) await queryClient.invalidateQueries({ queryKey: courseClassQueryKey(previousCourseId) });
      navigate("/classes");
    },
    onError: (error) => setError("root", {
      message: axios.isAxiosError(error) && error.response?.status === 409
        ? typeof error.response.data?.message === "string" && error.response.data.message.startsWith("Course")
          ? "Khóa học đang ngừng hoạt động, không thể gán lớp vào khóa này."
          : "Mã lớp học đã tồn tại trong trung tâm."
        : "Không thể lưu lớp học. Vui lòng thử lại.",
    }),
  });

  if (editing && classRecord.isPending) return <PageContainer><LoadingState label="Đang tải thông tin lớp học" /></PageContainer>;
  if (editing && classRecord.isError) return <PageContainer><ErrorState title="Không tìm thấy lớp học" message="Quay lại danh sách và thử lại." onRetry={() => void classRecord.refetch()} /></PageContainer>;

  const selectableCourses = courses.data?.filter((course) => course.status === "ACTIVE" || course.id === classRecord.data?.courseId) ?? [];

  return <PageContainer className="max-w-5xl">
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/classes"><ChevronLeft size={16} aria-hidden="true" />Lớp học</Link></Button>
    <PageHeader title={editing ? "Chỉnh sửa lớp học" : "Thêm lớp học"} description={editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho lớp học."} />
    <form className="form-sheet" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField id="class-course" label="Khóa học" required error={errors.courseId?.message} full><select id="class-course" className="input" disabled={courses.isPending || courses.isError} aria-invalid={Boolean(errors.courseId)} aria-describedby={errors.courseId ? "class-course-error" : undefined} {...register("courseId")}><option value="">Chọn khóa học</option>{selectableCourses.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.name}</option>)}</select></FormField>
        <FormField id="class-code" label="Mã lớp" required error={errors.code?.message}><Input id="class-code" autoComplete="off" aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? "class-code-error" : undefined} {...register("code")} /></FormField>
        <FormField id="class-status" label="Trạng thái" required error={errors.status?.message}><select id="class-status" className="input" aria-invalid={Boolean(errors.status)} aria-describedby={errors.status ? "class-status-error" : undefined} {...register("status")}><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Ngừng hoạt động</option></select></FormField>
        <FormField id="class-name" label="Tên lớp" required error={errors.name?.message} full><Input id="class-name" autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "class-name-error" : undefined} {...register("name")} /></FormField>
        <FormField id="class-description" label="Mô tả" error={errors.description?.message} full><Textarea id="class-description" rows={4} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "class-description-error" : undefined} {...register("description")} /></FormField>
      </div>
      <div className="form-actions"><Button disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu lớp học"}</Button><Button variant="secondary" asChild><Link to="/classes">Hủy</Link></Button></div>
    </form>
  </PageContainer>;
}
