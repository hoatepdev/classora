import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
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
      toast.success(editing ? "Đã cập nhật học viên." : "Đã thêm học viên.");
      navigate("/students");
    },
    onError: (error) => setError("root", {
      message: axios.isAxiosError(error) && error.response?.status === 409
        ? "Mã học viên đã tồn tại trong trung tâm."
        : getApiErrorMessage(error, "Không thể lưu học viên. Vui lòng thử lại."),
    }),
  });

  if (editing && student.isPending) return <PageContainer><LoadingState label="Đang tải thông tin học viên" /></PageContainer>;
  if (editing && student.isError) return <PageContainer><ErrorState title="Không tìm thấy học viên" message="Quay lại danh sách và thử lại." onRetry={() => void student.refetch()} /></PageContainer>;

  const code = register("code");
  const status = register("status");
  const fullName = register("fullName");
  const phone = register("phone");
  const email = register("email");
  const dateOfBirth = register("dateOfBirth");

  return <PageContainer>
    <PageHeader
      title={editing ? "Chỉnh sửa học viên" : "Thêm học viên"}
      description={editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho hồ sơ học viên."}
    />
    <form className="form-sheet" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="form-grid">
        <FormField id="student-code" label="Mã học viên" required error={errors.code?.message}>
          <Input id="student-code" autoComplete="off" aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? "student-code-error" : undefined} {...code} />
        </FormField>
        <FormField id="student-status" label="Trạng thái" required error={errors.status?.message}>
          <select id="student-status" className="input" aria-invalid={Boolean(errors.status)} aria-describedby={errors.status ? "student-status-error" : undefined} {...status}>
            <option value="ACTIVE">Đang học</option><option value="DISABLED">Ngừng học</option>
          </select>
        </FormField>
        <FormField id="student-name" label="Họ và tên" required error={errors.fullName?.message} full>
          <Input id="student-name" autoComplete="name" aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? "student-name-error" : undefined} {...fullName} />
        </FormField>
        <FormField id="student-phone" label="Điện thoại" error={errors.phone?.message}>
          <Input id="student-phone" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "student-phone-error" : undefined} {...phone} />
        </FormField>
        <FormField id="student-email" label="Email" error={errors.email?.message}>
          <Input id="student-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "student-email-error" : undefined} {...email} />
        </FormField>
        <FormField id="student-birth-date" label="Ngày sinh" error={errors.dateOfBirth?.message}>
          <Input id="student-birth-date" type="date" aria-invalid={Boolean(errors.dateOfBirth)} aria-describedby={errors.dateOfBirth ? "student-birth-date-error" : undefined} {...dateOfBirth} />
        </FormField>
      </div>
      <div className="form-actions">
        <Button disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu học viên"}</Button>
        <Button variant="secondary" asChild><Link to="/students">Hủy</Link></Button>
      </div>
    </form>
  </PageContainer>;
}
