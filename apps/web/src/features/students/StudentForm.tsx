import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createStudent, getStudent, studentQueryKey, updateStudent } from "./api.js";
import { studentSchema, type StudentFormValues } from "./schema.js";

const defaults: StudentFormValues = { code: "", fullName: "", phone: "", email: "", dateOfBirth: "", status: "ACTIVE" };

export function StudentForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const student = useQuery({ queryKey: [...studentQueryKey(), id], queryFn: () => getStudent(id!), enabled: editing });
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<StudentFormValues>({ resolver: zodResolver(studentSchema), defaultValues: defaults });

  useEffect(() => {
    if (!student.data) return;
    reset({
      code: student.data.code,
      fullName: student.data.fullName,
      phone: student.data.phone ?? "",
      email: student.data.email ?? "",
      dateOfBirth: student.data.dateOfBirth ?? "",
      status: student.data.status,
    });
  }, [student.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: StudentFormValues) => {
      const input = { ...values, phone: values.phone || null, email: values.email || null, dateOfBirth: values.dateOfBirth || null };
      return editing ? updateStudent(id!, input) : createStudent(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: studentQueryKey() });
      navigate("/students");
    },
    onError: (error) => setError("root", { message: axios.isAxiosError(error) && error.response?.status === 409 ? "Mã học viên đã tồn tại trong trung tâm." : "Không thể lưu học viên. Vui lòng thử lại." }),
  });

  if (editing && student.isPending) return <main className="page"><div className="state">Đang tải thông tin học viên…</div></main>;
  if (editing && student.isError) return <main className="page"><div className="state error" role="alert"><strong>Không tìm thấy học viên</strong>Quay lại danh sách và thử lại.</div></main>;

  return <main className="page">
    <div className="page-heading"><div><h1>{editing ? "Chỉnh sửa học viên" : "Thêm học viên"}</h1><p className="subtitle">{editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho hồ sơ học viên."}</p></div></div>
    <form className="form-sheet" onSubmit={handleSubmit(values => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="form-grid">
        <Field label="Mã học viên" required error={errors.code?.message}><input className="input" autoComplete="off" {...register("code")} /></Field>
        <Field label="Trạng thái" required error={errors.status?.message}><select className="input" {...register("status")}><option value="ACTIVE">Đang học</option><option value="DISABLED">Ngừng học</option></select></Field>
        <Field label="Họ và tên" required error={errors.fullName?.message} full><input className="input" autoComplete="name" {...register("fullName")} /></Field>
        <Field label="Điện thoại" error={errors.phone?.message}><input className="input" type="tel" autoComplete="tel" {...register("phone")} /></Field>
        <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register("email")} /></Field>
        <Field label="Ngày sinh" error={errors.dateOfBirth?.message}><input className="input" type="date" {...register("dateOfBirth")} /></Field>
      </div>
      <div className="form-actions"><button className="button" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu học viên"}</button><Link className="button secondary" to="/students">Hủy</Link></div>
    </form>
  </main>;
}

function Field({ label, required, error, full, children }: { label: string; required?: boolean; error?: string; full?: boolean; children: React.ReactNode }) {
  return <label className={`field ${full ? "full" : ""}`}><span>{label}{required && <span className="required"> *</span>}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}
