import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
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
    reset({
      courseId: classRecord.data.courseId ?? "",
      code: classRecord.data.code,
      name: classRecord.data.name,
      description: classRecord.data.description ?? "",
      status: classRecord.data.status,
    });
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
      if (previousCourseId && previousCourseId !== saved.courseId) {
        await queryClient.invalidateQueries({ queryKey: courseClassQueryKey(previousCourseId) });
      }
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

  if (editing && classRecord.isPending) return <main className="page"><div className="state">Đang tải thông tin lớp học…</div></main>;
  if (editing && classRecord.isError) return <main className="page"><div className="state error" role="alert"><strong>Không tìm thấy lớp học</strong>Quay lại danh sách và thử lại.</div></main>;

  const selectableCourses = courses.data?.filter(course => course.status === "ACTIVE" || course.id === classRecord.data?.courseId) ?? [];

  return <main className="page">
    <div className="page-heading"><div><h1>{editing ? "Chỉnh sửa lớp học" : "Thêm lớp học"}</h1><p className="subtitle">{editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho lớp học."}</p></div></div>
    <form className="form-sheet" onSubmit={handleSubmit(values => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="form-grid">
        <Field label="Khóa học" required error={errors.courseId?.message} full><select className="input" disabled={courses.isPending || courses.isError} {...register("courseId")}><option value="">Chọn khóa học</option>{selectableCourses.map(course => <option key={course.id} value={course.id}>{course.code} — {course.name}</option>)}</select></Field>
        <Field label="Mã lớp" required error={errors.code?.message}><input className="input" autoComplete="off" {...register("code")} /></Field>
        <Field label="Trạng thái" required error={errors.status?.message}><select className="input" {...register("status")}><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Ngừng hoạt động</option></select></Field>
        <Field label="Tên lớp" required error={errors.name?.message} full><input className="input" autoComplete="off" {...register("name")} /></Field>
        <Field label="Mô tả" error={errors.description?.message} full><textarea className="input" rows={4} {...register("description")} /></Field>
      </div>
      <div className="form-actions"><button className="button" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu lớp học"}</button><Link className="button secondary" to="/classes">Hủy</Link></div>
    </form>
  </main>;
}

function Field({ label, required, error, full, children }: { label: string; required?: boolean; error?: string; full?: boolean; children: React.ReactNode }) {
  return <label className={`field ${full ? "full" : ""}`}><span>{label}{required && <span className="required"> *</span>}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}
