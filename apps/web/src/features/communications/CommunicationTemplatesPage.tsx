import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Eye, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { getApiErrorMessage } from "@/lib/api";
import {
  communicationTemplatesQueryKey,
  listCommunicationTemplates,
  previewCommunicationTemplate,
  resetCommunicationTemplate,
  setCommunicationTemplateEnabled,
  upsertCommunicationTemplate,
} from "./api.js";
import {
  communicationChannelLabels,
  communicationEventLabels,
  type CommunicationTemplatePreview,
  type CommunicationTemplateView,
} from "./types.js";

const eventOrder = Object.keys(communicationEventLabels) as Array<keyof typeof communicationEventLabels>;

export function CommunicationTemplatesPage() {
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: communicationTemplatesQueryKey(), queryFn: listCommunicationTemplates });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canManage = can(membership, "communication.manage");
  const [editing, setEditing] = useState<CommunicationTemplateView | null>(null);
  const [previewing, setPreviewing] = useState<CommunicationTemplatePreview | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: communicationTemplatesQueryKey() });

  const enabledMutation = useMutation({
    mutationFn: (input: { template: CommunicationTemplateView; enabled: boolean }) => setCommunicationTemplateEnabled(input.template.eventType, input.template.channel, input.enabled),
    onSuccess: () => { void invalidate(); },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể thực hiện. Vui lòng thử lại.")),
  });

  if (templates.isPending) return <PageContainer><LoadingState label="Đang tải mẫu thông báo" /></PageContainer>;
  if (templates.isError) return <PageContainer><ErrorState title="Không thể tải mẫu thông báo" message="Kiểm tra kết nối và thử lại." onRetry={() => void templates.refetch()} /></PageContainer>;

  return <PageContainer>
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/communications"><ChevronLeft size={16} aria-hidden="true" />Thông báo</Link></Button>
    <PageHeader
      title="Mẫu thông báo"
      description="Mặc định hệ thống cho từng sự kiện và kênh; tạo bản ghi đè riêng của trung tâm khi cần."
    />
    <p className="subtitle rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-xs text-[#64748b]">
      Biến dạng <code className="rounded bg-white px-1 py-0.5">{"{{tenBien}}"}</code> chỉ cho phép các biến được liệt kê cho từng sự kiện. Thông báo đã gửi giữ nguyên nội dung tại lúc tạo.
    </p>
    <div className="grid min-w-0 gap-4">
      {eventOrder.map((eventType) => {
        const rows = templates.data.filter((template) => template.eventType === eventType);
        return <section key={eventType} className="min-w-0 rounded-xl border border-[#e2e8f0] bg-white p-5" aria-labelledby={`template-${eventType}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-base font-semibold text-[#0f172a]" id={`template-${eventType}`}>{communicationEventLabels[eventType]}</h2>
              <p className="mt-0.5 mb-0 text-xs text-[#64748b]">{rows[0]?.timing === "IMMEDIATE" ? "Tự động khi nghiệp vụ xảy ra" : "Gửi theo lịch (kích hoạt thủ công / tự động hóa sau)"}</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((template) => <article key={`${template.eventType}-${template.channel}`} className={`min-w-0 rounded-lg border p-4 ${template.enabled ? "border-[#e2e8f0]" : "border-dashed border-[#fecdd3] bg-[#fffafa]"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="m-0 text-sm font-semibold text-[#0f172a]">{communicationChannelLabels[template.channel]}</p>
                <div className="flex items-center gap-1.5">
                  {template.hasOverride && <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-xs font-semibold text-[#2563eb]">Đã ghi đè</span>}
                  {!template.enabled && <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-xs font-semibold text-[#92400e]">Đang tắt</span>}
                </div>
              </div>
              {template.effectiveSubject && <p className="mt-2 mb-0 truncate text-sm font-medium text-[#334155]">{template.effectiveSubject}</p>}
              <p className="mt-1 mb-3 line-clamp-2 text-xs whitespace-pre-wrap text-[#64748b]">{template.effectiveBody}</p>
              {canManage && <div className="flex flex-wrap gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => setEditing(template)}><Pencil size={14} aria-hidden="true" />Sửa</Button>
                <PreviewButton template={template} onPreview={setPreviewing} />
                <Button variant="ghost" size="sm" disabled={enabledMutation.isPending} onClick={() => enabledMutation.mutate({ template, enabled: !template.enabled })}>{template.enabled ? "Tắt" : "Bật"}</Button>
                {template.hasOverride && <ConfirmDialog
                  trigger={<Button variant="ghost" size="sm"><RotateCcw size={14} aria-hidden="true" />Đặt lại mặc định</Button>}
                  title="Đặt lại mẫu mặc định"
                  description="Xóa bản ghi đè của trung tâm và quay về mẫu mặc định hệ thống."
                  confirmLabel="Đặt lại"
                  onConfirm={async () => { await resetCommunicationTemplate(template.eventType, template.channel); await invalidate(); toast.success("Đã đặt lại mẫu mặc định."); }}
                />}
              </div>}
            </article>)}
          </div>
        </section>;
      })}
    </div>
    {editing && <TemplateEditDialog template={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await invalidate(); }} />}
    {previewing && <TemplatePreviewDialog preview={previewing} onClose={() => setPreviewing(null)} />}
  </PageContainer>;
}

function PreviewButton({ template, onPreview }: { template: CommunicationTemplateView; onPreview: (preview: CommunicationTemplatePreview) => void }) {
  const preview = useMutation({
    mutationFn: () => previewCommunicationTemplate(template.eventType, template.channel),
    onSuccess: onPreview,
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể thực hiện. Vui lòng thử lại.")),
  });
  return <Button variant="secondary" size="sm" disabled={preview.isPending} onClick={() => preview.mutate()}><Eye size={14} aria-hidden="true" />{preview.isPending ? "Đang xem…" : "Xem trước"}</Button>;
}

function TemplateEditDialog({ template, onClose, onSaved }: { template: CommunicationTemplateView; onClose: () => void; onSaved: () => Promise<void> }) {
  const [subject, setSubject] = useState(template.effectiveSubject ?? "");
  const [body, setBody] = useState(template.effectiveBody);
  const [preview, setPreview] = useState<CommunicationTemplatePreview | null>(null);
  const save = useMutation({
    mutationFn: () => upsertCommunicationTemplate(template.eventType, template.channel, template.channel === "EMAIL" ? { subject, body } : { body }),
    onSuccess: () => { toast.success("Đã lưu mẫu thông báo."); void onSaved(); },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể thực hiện. Vui lòng thử lại.")),
  });
  const previewMutation = useMutation({
    mutationFn: () => previewCommunicationTemplate(template.eventType, template.channel, template.channel === "EMAIL" ? { subject, body } : { body }),
    onSuccess: setPreview,
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể thực hiện. Vui lòng thử lại.")),
  });
  return <Dialog open onOpenChange={(open) => !save.isPending && !open && onClose()}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Sửa mẫu {communicationEventLabels[template.eventType]} · {communicationChannelLabels[template.channel]}</DialogTitle>
        <DialogDescription>Dùng các biến được phép bên dưới; lưu sẽ từ chối biến không hợp lệ.</DialogDescription>
      </DialogHeader>
      {template.channel === "EMAIL" && <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Tiêu đề<Input value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Tiêu đề email" /></label>}
      <label className="grid gap-1.5 text-sm font-medium text-[#334155]">Nội dung<Textarea className="min-h-40 font-mono text-sm" value={body} onChange={(event) => setBody(event.target.value)} aria-label="Nội dung mẫu" /></label>
      <div className="rounded-lg bg-[#f8fafc] p-3">
        <p className="m-0 mb-1.5 text-xs font-semibold text-[#64748b]">Biến cho phép</p>
        <div className="flex flex-wrap gap-1.5">
          {template.variables.map((variable) => <span key={variable.name} className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-[#475569]">{`{{${variable.name}}}`}{variable.required ? " *" : ""}</span>)}
        </div>
      </div>
      {preview && <div className="rounded-lg border border-[#e2e8f0] p-3">
        <p className="m-0 mb-1 text-xs font-semibold text-[#64748b]">Xem trước (dữ liệu mẫu)</p>
        {preview.subject && <p className="m-0 mb-1 text-sm font-semibold text-[#0f172a]">{preview.subject}</p>}
        <p className="m-0 text-sm whitespace-pre-wrap text-[#334155]">{preview.body}</p>
      </div>}
      <DialogFooter>
        <Button variant="secondary" disabled={save.isPending || previewMutation.isPending} onClick={() => previewMutation.mutate()}>Xem trước</Button>
        <Button variant="secondary" disabled={save.isPending} onClick={onClose}>Hủy</Button>
        <Button disabled={save.isPending || !body.trim() || (template.channel === "EMAIL" && !subject.trim())} onClick={() => save.mutate()}>{save.isPending ? "Đang lưu…" : "Lưu"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function TemplatePreviewDialog({ preview, onClose }: { preview: CommunicationTemplatePreview; onClose: () => void }) {
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Xem trước · {communicationEventLabels[preview.eventType]} · {communicationChannelLabels[preview.channel]}</DialogTitle>
        <DialogDescription>Kết quả hiển thị với dữ liệu mẫu an toàn; không gửi thật.</DialogDescription>
      </DialogHeader>
      {preview.subject && <p className="m-0 text-sm font-semibold text-[#0f172a]">{preview.subject}</p>}
      <p className="m-0 rounded-lg bg-[#f8fafc] p-4 text-sm whitespace-pre-wrap text-[#334155]">{preview.body}</p>
      <DialogFooter><Button variant="secondary" onClick={onClose}>Đóng</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
