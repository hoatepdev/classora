import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
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
    reset({
      code: teacher.data.code,
      name: teacher.data.name,
      phone: teacher.data.phone ?? "",
      email: teacher.data.email ?? "",
      note: teacher.data.note ?? "",
      status: teacher.data.status,
    });
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

  if (editing && teacher.isPending) return <main className="page"><div className="state">Đang tải thông tin giáo viên…</div></main>;
  if (editing && teacher.isError) return <main className="page"><div className="state error" role="alert"><strong>Không tìm thấy giáo viên</strong>Quay lại danh sách và thử lại.</div></main>;

  return <main className="page">
    <div className="page-heading"><div><h1>{editing ? "Chỉnh sửa giáo viên" : "Thêm giáo viên"}</h1><p className="subtitle">{editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho hồ sơ giáo viên."}</p></div></div>
    <form className="form-sheet" onSubmit={handleSubmit(values => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="form-grid">
        <Field label="Mã giáo viên" required error={errors.code?.message}><input className="input" autoComplete="off" {...register("code")} /></Field>
        <Field label="Trạng thái" required error={errors.status?.message}><select className="input" {...register("status")}><option value="ACTIVE">Đang dạy</option><option value="DISABLED">Ngừng dạy</option></select></Field>
        <Field label="Họ và tên" required error={errors.name?.message} full><input className="input" autoComplete="name" {...register("name")} /></Field>
        <Field label="Điện thoại" error={errors.phone?.message}><input className="input" type="tel" autoComplete="tel" {...register("phone")} /></Field>
        <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register("email")} /></Field>
        <Field label="Ghi chú" error={errors.note?.message} full><textarea className="input" rows={4} {...register("note")} /></Field>
      </div>
      <div className="form-actions"><button className="button" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu giáo viên"}</button><Link className="button secondary" to="/teachers">Hủy</Link></div>
    </form>
  </main>;
}

function Field({ label, required, error, full, children }: { label: string; required?: boolean; error?: string; full?: boolean; children: React.ReactNode }) {
  return <label className={`field ${full ? "full" : ""}`}><span>{label}{required && <span className="required"> *</span>}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}
