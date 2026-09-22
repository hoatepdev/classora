import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { branchQueryKey, listBranches } from "@/features/branches/api";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createRoom, getRoom, roomQueryKey, updateRoom } from "./api.js";
import { roomSchema, type RoomFormValues } from "./schema.js";

const defaults: RoomFormValues = { branchId: "", code: "", name: "", capacity: "", note: "", status: "ACTIVE" };

export function RoomForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const room = useQuery({ queryKey: [...roomQueryKey(), id], queryFn: () => getRoom(id!), enabled: editing });
  const branches = useQuery({ queryKey: branchQueryKey(), queryFn: listBranches });
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<RoomFormValues>({ resolver: zodResolver(roomSchema), defaultValues: defaults });
  useEffect(() => { if (room.data) reset({ branchId: room.data.branchId, code: room.data.code, name: room.data.name, capacity: room.data.capacity ? String(room.data.capacity) : "", note: room.data.notes ?? "", status: room.data.status }); }, [room.data, reset]);
  const mutation = useMutation({
    mutationFn: (values: RoomFormValues) => { const input = { branchId: values.branchId || null, code: values.code, name: values.name, capacity: values.capacity ? Number(values.capacity) : null, notes: values.note || null, status: values.status }; return editing ? updateRoom(id!, input) : createRoom(input); },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: roomQueryKey() }); navigate("/rooms"); },
    onError: (error) => setError("root", { message: axios.isAxiosError(error) && error.response?.status === 409 ? "Mã phòng đã tồn tại tại chi nhánh này." : "Không thể lưu phòng học. Vui lòng thử lại." }),
  });
  if (editing && room.isPending) return <PageContainer><LoadingState label="Đang tải thông tin phòng học" /></PageContainer>;
  if (editing && room.isError) return <PageContainer><ErrorState title="Không tìm thấy phòng học" message="Quay lại danh sách và thử lại." onRetry={() => void room.refetch()} /></PageContainer>;
  return <PageContainer className="max-w-5xl">
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/rooms"><ChevronLeft size={16} aria-hidden="true" />Phòng học</Link></Button>
    <PageHeader title={editing ? "Chỉnh sửa phòng học" : "Thêm phòng học"} description={editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho phòng học."} />
    <form className="form-sheet" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField id="room-branch" label="Chi nhánh" required error={errors.branchId?.message}><select id="room-branch" className="input" {...register("branchId")}><option value="">Chọn chi nhánh</option>{branches.data?.filter((branch) => branch.status === "ACTIVE").map((branch) => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></FormField>
        <FormField id="room-status" label="Trạng thái" required error={errors.status?.message}><select id="room-status" className="input" {...register("status")}><option value="ACTIVE">Đang sử dụng</option><option value="DISABLED">Ngừng sử dụng</option></select></FormField>
        <FormField id="room-code" label="Mã phòng" required error={errors.code?.message}><Input id="room-code" autoComplete="off" {...register("code")} /></FormField>
        <FormField id="room-capacity" label="Sức chứa" error={errors.capacity?.message}><Input id="room-capacity" type="number" min="1" inputMode="numeric" placeholder="Ví dụ: 20" {...register("capacity")} /></FormField>
        <FormField id="room-name" label="Tên phòng" required error={errors.name?.message} full><Input id="room-name" autoComplete="off" {...register("name")} /></FormField>
        <FormField id="room-note" label="Ghi chú" error={errors.note?.message} full><Textarea id="room-note" rows={4} {...register("note")} /></FormField>
      </div>
      <div className="form-actions"><Button disabled={mutation.isPending || branches.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu phòng học"}</Button><Button variant="secondary" asChild><Link to="/rooms">Hủy</Link></Button></div>
    </form>
  </PageContainer>;
}
