import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
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

  if (editing && course.isPending) return <main className="page"><div className="state">Đang tải thông tin khóa học…</div></main>;
  if (editing && course.isError) return <main className="page"><div className="state error" role="alert"><strong>Không tìm thấy khóa học</strong>Quay lại danh sách và thử lại.</div></main>;

  return <main className="page">
    <div className="page-heading"><div><h1>{editing ? "Chỉnh sửa khóa học" : "Thêm khóa học"}</h1><p className="subtitle">{editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho khóa học."}</p></div></div>
    <form className="form-sheet" onSubmit={handleSubmit(values => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="form-grid">
        <Field label="Mã khóa học" required error={errors.code?.message}><input className="input" autoComplete="off" {...register("code")} /></Field>
        <Field label="Trạng thái" required error={errors.status?.message}><select className="input" {...register("status")}><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Ngừng hoạt động</option></select></Field>
        <Field label="Tên khóa học" required error={errors.name?.message} full><input className="input" autoComplete="off" {...register("name")} /></Field>
        <Field label="Mô tả" error={errors.description?.message} full><textarea className="input" rows={4} {...register("description")} /></Field>
      </div>
      <div className="form-actions"><button className="button" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu khóa học"}</button><Link className="button secondary" to="/courses">Hủy</Link></div>
    </form>
  </main>;
}

function Field({ label, required, error, full, children }: { label: string; required?: boolean; error?: string; full?: boolean; children: React.ReactNode }) {
  return <label className={`field ${full ? "full" : ""}`}><span>{label}{required && <span className="required"> *</span>}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}
