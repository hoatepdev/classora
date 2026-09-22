import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { classQueryKey, listClasses } from "../classes/api.js";
import type { Class } from "../classes/types.js";
import {
  classEnrollmentQueryKey,
  getEnrollmentHistory,
  reenrollEnrollment,
  studentEnrollmentQueryKey,
  transferEnrollment,
  transitionEnrollment,
} from "./api.js";
import type { Enrollment, EnrollmentEvent, EnrollmentStatus } from "./types.js";

const statusLabels: Record<EnrollmentStatus, string> = {
  PENDING: "Chờ bắt đầu",
  TRIAL: "Học thử",
  ACTIVE: "Đang học",
  PAUSED: "Tạm dừng",
  COMPLETED: "Đã hoàn thành",
  WITHDRAWN: "Đã rút",
  CANCELLED: "Đã hủy",
};

const actionLabels = {
  activate: "Bắt đầu học",
  trial: "Bắt đầu học thử",
  pause: "Tạm dừng",
  resume: "Tiếp tục học",
  withdraw: "Rút khỏi lớp",
  complete: "Hoàn thành",
  cancel: "Hủy ghi danh",
  transfer: "Chuyển lớp",
  reenroll: "Ghi danh lại",
} as const;

type LifecycleAction = keyof typeof actionLabels;
type SelectedAction = LifecycleAction | "__menu";

const actionsByStatus: Record<EnrollmentStatus, LifecycleAction[]> = {
  PENDING: ["activate", "trial", "cancel"],
  TRIAL: ["activate", "cancel", "withdraw"],
  ACTIVE: ["pause", "complete", "withdraw", "transfer"],
  PAUSED: ["resume", "withdraw", "transfer"],
  COMPLETED: ["reenroll"],
  WITHDRAWN: ["reenroll"],
  CANCELLED: ["reenroll"],
};

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

type Props = {
  enrollment: Enrollment;
  canWrite: boolean;
};

export function EnrollmentLifecycleActions({ enrollment, canWrite }: Props) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<SelectedAction | null>(null);
  const [reason, setReason] = useState("");
  const [destinationClassId, setDestinationClassId] = useState(enrollment.classId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const needsClasses = action === "transfer" || action === "reenroll";
  const classes = useQuery({
    queryKey: classQueryKey(),
    queryFn: listClasses,
    enabled: needsClasses,
  });
  const history = useQuery({
    queryKey: ["enrollment-history", window.location.hostname, enrollment.id],
    queryFn: () => getEnrollmentHistory(enrollment.id),
    enabled: historyOpen,
  });

  const refresh = async (result: Enrollment) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: studentEnrollmentQueryKey(result.studentId) }),
      queryClient.invalidateQueries({ queryKey: classEnrollmentQueryKey(enrollment.classId) }),
      queryClient.invalidateQueries({ queryKey: classEnrollmentQueryKey(result.classId) }),
      queryClient.invalidateQueries({ queryKey: ["enrollment-history", window.location.hostname, enrollment.id] }),
    ]);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!action || action === "__menu") throw new Error("Missing enrollment action");
      if (action === "transfer") return transferEnrollment(enrollment.id, destinationClassId, reason || undefined);
      if (action === "reenroll") return reenrollEnrollment(enrollment.id, { studentId: enrollment.studentId, classId: destinationClassId, status: "ACTIVE", notes: reason || undefined });
      return transitionEnrollment(enrollment.id, action, reason || undefined);
    },
    onSuccess: async (result) => {
      await refresh(result);
      setAction(null);
      setReason("");
      toast.success(`${action && action !== "__menu" ? actionLabels[action] : "Cập nhật"} thành công.`);
    },
    onError: (error) => {
      const fallback = action === "transfer" ? "Không thể chuyển lớp." : action === "reenroll" ? "Không thể ghi danh lại." : "Không thể cập nhật trạng thái ghi danh.";
      toast.error(getApiErrorMessage(error, fallback));
    },
  });

  const availableClasses = (classes.data ?? []).filter((item) => item.status === "ACTIVE");
  const selectedActionLabel = action && action !== "__menu" ? actionLabels[action] : "";
  const terminal = ["COMPLETED", "WITHDRAWN", "CANCELLED"].includes(enrollment.status);

  return <>
    <div className="flex flex-wrap items-center gap-1.5">
      {canWrite && actionsByStatus[enrollment.status].slice(0, 2).map((item) => <Button key={item} variant={item === "withdraw" ? "destructive" : "secondary"} size="sm" type="button" onClick={() => { setDestinationClassId(enrollment.classId); setAction(item); }}>
        {actionLabels[item]}
      </Button>)}
      {(canWrite && actionsByStatus[enrollment.status].length > 2 || !canWrite || terminal) && <Button variant="ghost" size="sm" type="button" aria-label="Mở thêm thao tác" onClick={() => setAction("__menu")}><MoreHorizontal size={17} aria-hidden="true" /></Button>}
      <Button variant="ghost" size="sm" type="button" aria-label="Xem lịch sử ghi danh" onClick={() => setHistoryOpen(true)}><History size={16} aria-hidden="true" />Lịch sử</Button>
    </div>

    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !mutation.isPending) { setAction(null); setReason(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action === "__menu" ? "Thao tác ghi danh" : selectedActionLabel}</DialogTitle>
          <DialogDescription>{action === "__menu" ? "Chọn thao tác phù hợp với trạng thái hiện tại." : `Cập nhật ghi danh của học viên sang “${selectedActionLabel}”.`}</DialogDescription>
        </DialogHeader>
        {action === "__menu" ? <div className="grid gap-2">
          {canWrite && actionsByStatus[enrollment.status].map((item) => <Button key={item} variant={item === "withdraw" || item === "cancel" ? "destructive" : "secondary"} type="button" onClick={() => { setDestinationClassId(enrollment.classId); setAction(item); }}>{actionLabels[item]}</Button>)}
          {!canWrite && <p className="m-0 text-sm text-muted-foreground">Bạn không có quyền thay đổi ghi danh.</p>}
        </div> : <>
          {(action === "transfer" || action === "reenroll") && <label className="grid gap-2 text-sm font-medium" htmlFor={`destination-class-${enrollment.id}`}>
            Lớp đích
            <select id={`destination-class-${enrollment.id}`} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={destinationClassId} onChange={(event) => setDestinationClassId(event.target.value)} disabled={classes.isPending || mutation.isPending}>
              <option value="">Chọn lớp</option>
              {availableClasses.map((item: Class) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
            </select>
          </label>}
          <label className="grid gap-2 text-sm font-medium" htmlFor={`enrollment-reason-${enrollment.id}`}>
            Lý do <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
            <Input id={`enrollment-reason-${enrollment.id}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Nhập lý do nếu cần" disabled={mutation.isPending} />
          </label>
        </>}
        {action !== "__menu" && <DialogFooter><Button variant="secondary" type="button" disabled={mutation.isPending} onClick={() => setAction(null)}>Hủy</Button><Button type="button" variant={action === "withdraw" || action === "cancel" ? "destructive" : "default"} disabled={mutation.isPending || ((action === "transfer" || action === "reenroll") && !destinationClassId)} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang xử lý…" : selectedActionLabel}</Button></DialogFooter>}
      </DialogContent>
    </Dialog>

    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Lịch sử ghi danh</DialogTitle><DialogDescription>Các thay đổi của ghi danh được lưu theo thời gian.</DialogDescription></DialogHeader>
        {history.isPending ? <p className="m-0 text-sm text-muted-foreground">Đang tải lịch sử…</p> : history.isError ? <p className="m-0 text-sm text-destructive" role="alert">Không thể tải lịch sử ghi danh.</p> : history.data?.length ? <ol className="grid gap-4" aria-label="Lịch sử ghi danh">{history.data.map((event) => <HistoryItem event={event} key={event.id} />)}</ol> : <p className="m-0 text-sm text-muted-foreground">Chưa có lịch sử.</p>}
      </DialogContent>
    </Dialog>
  </>;
}

function HistoryItem({ event }: { event: EnrollmentEvent }) {
  return <li className="border-l-2 border-[#e2e8f0] pl-4">
    <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[#0f172a]">{eventLabel(event.type)}</strong>{event.toStatus && <StatusBadge status={event.toStatus}>{statusLabels[event.toStatus]}</StatusBadge>}</div>
    <p className="mt-1 mb-0 text-xs text-[#64748b]">{dateFormatter.format(new Date(event.occurredAt))}</p>
    {event.reason && <p className="mt-2 mb-0 text-sm text-[#334155]">{event.reason}</p>}
  </li>;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = { ENROLLED: "Đã ghi danh", ACTIVATED: "Đã bắt đầu học", TRIAL_STARTED: "Đã bắt đầu học thử", PAUSED: "Đã tạm dừng", RESUMED: "Đã tiếp tục học", WITHDRAWN: "Đã rút khỏi lớp", COMPLETED: "Đã hoàn thành", CANCELLED: "Đã hủy ghi danh", TRANSFERRED: "Đã chuyển lớp" };
  return labels[type] ?? type;
}
