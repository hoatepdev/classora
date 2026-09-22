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
import { createBranch, branchQueryKey, getBranch, updateBranch } from "./api.js";
import { branchSchema, type BranchFormValues } from "./schema.js";

const defaults: BranchFormValues = { code: "", name: "", address: "", phone: "", email: "", status: "ACTIVE", notes: "" };

export function BranchForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const branch = useQuery({ queryKey: [...branchQueryKey(), id], queryFn: () => getBranch(id!), enabled: editing });
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<BranchFormValues>({ resolver: zodResolver(branchSchema), defaultValues: defaults });
  useEffect(() => { if (branch.data) reset({ code: branch.data.code, name: branch.data.name, address: branch.data.address ?? "", phone: branch.data.phone ?? "", email: branch.data.email ?? "", status: branch.data.status, notes: branch.data.notes ?? "" }); }, [branch.data, reset]);
  const mutation = useMutation({
    mutationFn: (values: BranchFormValues) => { const input = { ...values, address: values.address || null, phone: values.phone || null, email: values.email || null, notes: values.notes || null }; return editing ? updateBranch(id!, input) : createBranch(input); },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: branchQueryKey() }); navigate("/branches"); },
    onError: (error) => setError("root", { message: axios.isAxiosError(error) && error.response?.status === 409 ? "Mã chi nhánh đã tồn tại trong trung tâm." : "Không thể lưu chi nhánh. Vui lòng thử lại." }),
  });
  if (editing && branch.isPending) return <PageContainer><LoadingState label="Đang tải thông tin chi nhánh" /></PageContainer>;
  if (editing && branch.isError) return <PageContainer><ErrorState title="Không tìm thấy chi nhánh" message="Quay lại danh sách và thử lại." onRetry={() => void branch.refetch()} /></PageContainer>;
  return <PageContainer className="max-w-5xl">
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/branches"><ChevronLeft size={16} aria-hidden="true" />Chi nhánh</Link></Button>
    <PageHeader title={editing ? "Chỉnh sửa chi nhánh" : "Thêm chi nhánh"} description={editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho chi nhánh."} />
    <form className="form-sheet" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField id="branch-code" label="Mã chi nhánh" required error={errors.code?.message}><Input id="branch-code" autoComplete="off" aria-invalid={Boolean(errors.code)} {...register("code")} /></FormField>
        <FormField id="branch-status" label="Trạng thái" required error={errors.status?.message}><select id="branch-status" className="input" {...register("status")}><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Ngừng hoạt động</option></select></FormField>
        <FormField id="branch-name" label="Tên chi nhánh" required error={errors.name?.message} full><Input id="branch-name" autoComplete="organization" aria-invalid={Boolean(errors.name)} {...register("name")} /></FormField>
        <FormField id="branch-phone" label="Điện thoại" error={errors.phone?.message}><Input id="branch-phone" type="tel" autoComplete="tel" {...register("phone")} /></FormField>
        <FormField id="branch-email" label="Email" error={errors.email?.message}><Input id="branch-email" type="email" autoComplete="email" {...register("email")} /></FormField>
        <FormField id="branch-address" label="Địa chỉ" error={errors.address?.message}><Input id="branch-address" autoComplete="street-address" {...register("address")} /></FormField>
        <FormField id="branch-notes" label="Ghi chú" error={errors.notes?.message} full><Textarea id="branch-notes" rows={4} {...register("notes")} /></FormField>
      </div>
      <div className="form-actions"><Button disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu chi nhánh"}</Button><Button variant="secondary" asChild><Link to="/branches">Hủy</Link></Button></div>
    </form>
  </PageContainer>;
}
