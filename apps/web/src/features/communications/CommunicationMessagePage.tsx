import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft, RotateCcw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { getApiErrorMessage } from "@/lib/api";
import { communicationMessageQueryKey, getCommunicationMessage, retryCommunicationMessage } from "./api.js";
import {
  communicationChannelLabels,
  communicationEventLabels,
  communicationRecipientLabels,
  communicationStatusLabels,
  relatedEntityLabels,
} from "./types.js";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export function CommunicationMessagePage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: communicationMessageQueryKey(id ?? ""), queryFn: () => getCommunicationMessage(id!), enabled: Boolean(id) });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canManage = can(membership, "communication.manage");
  const retry = useMutation({
    mutationFn: () => retryCommunicationMessage(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communicationMessageQueryKey(id ?? "") });
      toast.success("Đã gửi lại thông báo.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể thực hiện. Vui lòng thử lại.")),
  });

  if (query.isPending) return <PageContainer><LoadingState label="Đang tải thông báo" /></PageContainer>;
  if (query.isError) {
    const notFound = axios.isAxiosError(query.error) && query.error.response?.status === 404;
    return <PageContainer><ErrorState title={notFound ? "Không tìm thấy thông báo" : "Không thể tải thông báo"} message="Quay lại lịch sử và thử lại." onRetry={() => void query.refetch()} /></PageContainer>;
  }
  const message = query.data;
  const retryable = message.status === "PENDING" || message.status === "FAILED";
  return <PageContainer>
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/communications"><ChevronLeft size={16} aria-hidden="true" />Thông báo</Link></Button>
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="m-0 text-xl font-bold tracking-tight text-[#0f172a] md:text-2xl">{message.subject ?? communicationEventLabels[message.eventType]}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#64748b]">
          <StatusBadge status={message.status === "SENT" ? "ACTIVE" : message.status === "FAILED" ? "ABSENT" : message.status === "CANCELLED" ? "CANCELLED" : "PENDING"}>{communicationStatusLabels[message.status]}</StatusBadge>
          <span>{communicationEventLabels[message.eventType]}</span>
          <span aria-hidden="true">·</span>
          <span>{communicationChannelLabels[message.channel]}</span>
        </div>
      </div>
      {retryable && canManage && <Button disabled={retry.isPending} onClick={() => retry.mutate()}><RotateCcw size={16} aria-hidden="true" />{retry.isPending ? "Đang gửi lại…" : "Gửi lại"}</Button>}
    </header>

    <div className="grid gap-5 lg:grid-cols-3">
      <div className="grid gap-5 lg:col-span-2">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5">
          <h2 className="m-0 mb-3 text-sm font-semibold tracking-wide text-[#64748b] uppercase">Nội dung đã gửi</h2>
          {message.subject && <p className="m-0 mb-3 font-semibold text-[#0f172a]">{message.subject}</p>}
          <p className="m-0 rounded-lg bg-[#f8fafc] p-4 text-sm whitespace-pre-wrap text-[#334155]">{message.body}</p>
          <p className="mt-3 mb-0 text-xs text-[#94a3b8]">Nội dung được lưu tại lúc tạo; chỉnh sửa mẫu về sau không thay đổi thông báo này.</p>
        </section>
        {message.lastError && <section className="rounded-xl border border-[#fecdd3] bg-[#fff5f4] p-5" role="alert">
          <h2 className="m-0 mb-2 text-sm font-semibold text-[#b42318] uppercase">Lỗi gửi gần nhất (đã lọc thông tin nhạy cảm)</h2>
          <p className="m-0 text-sm whitespace-pre-wrap text-[#b42318]">{message.lastError}</p>
        </section>}
      </div>
      <div className="grid content-start gap-5">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5">
          <h2 className="m-0 mb-3 text-sm font-semibold tracking-wide text-[#64748b] uppercase">Người nhận</h2>
          <dl className="m-0 divide-y divide-[#f1f5f9] text-sm">
            <div className="grid gap-1 py-2.5"><dt className="text-xs font-medium text-[#64748b]">Loại</dt><dd className="m-0 font-medium text-[#0f172a]">{communicationRecipientLabels[message.recipientType]}</dd></div>
            <div className="grid gap-1 py-2.5"><dt className="text-xs font-medium text-[#64748b]">Tên</dt><dd className="m-0 font-medium text-[#0f172a]">{message.recipientName ?? "—"}</dd></div>
            <div className="grid gap-1 py-2.5"><dt className="text-xs font-medium text-[#64748b]">Đích đến</dt><dd className="m-0 font-medium text-[#0f172a]">{message.destination ?? "Trong ứng dụng"}</dd></div>
          </dl>
        </section>
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5">
          <h2 className="m-0 mb-3 text-sm font-semibold tracking-wide text-[#64748b] uppercase">Gửi hàng</h2>
          <dl className="m-0 divide-y divide-[#f1f5f9] text-sm">
            <div className="grid gap-1 py-2.5"><dt className="text-xs font-medium text-[#64748b]">Provider</dt><dd className="m-0 font-medium text-[#0f172a]">{message.provider ?? "—"}{message.provider === "LOCAL" && <span className="ml-2 text-xs font-normal text-[#64748b]">(bộ chuyển phát nội bộ)</span>}</dd></div>
            <div className="grid gap-1 py-2.5"><dt className="text-xs font-medium text-[#64748b]">Số lần thử</dt><dd className="m-0 font-medium text-[#0f172a]">{message.attemptCount}</dd></div>
            <div className="grid gap-1 py-2.5"><dt className="text-xs font-medium text-[#64748b]">Tạo lúc</dt><dd className="m-0 font-medium text-[#0f172a]">{dateTimeFormatter.format(new Date(message.createdAt))}</dd></div>
            <div className="grid gap-1 py-2.5"><dt className="text-xs font-medium text-[#64748b]">Gửi lúc</dt><dd className="m-0 font-medium text-[#0f172a]">{message.sentAt ? dateTimeFormatter.format(new Date(message.sentAt)) : "—"}</dd></div>
            <div className="grid gap-1 py-2.5"><dt className="text-xs font-medium text-[#64748b]">Lỗi lúc</dt><dd className="m-0 font-medium text-[#0f172a]">{message.failedAt ? dateTimeFormatter.format(new Date(message.failedAt)) : "—"}</dd></div>
          </dl>
        </section>
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5">
          <h2 className="m-0 mb-3 text-sm font-semibold tracking-wide text-[#64748b] uppercase">Liên quan</h2>
          <p className="m-0 text-sm text-[#334155]">{message.relatedEntityType ? `${relatedEntityLabels[message.relatedEntityType] ?? message.relatedEntityType} · ${message.relatedEntityId}` : "—"}</p>
        </section>
      </div>
    </div>
  </PageContainer>;
}
