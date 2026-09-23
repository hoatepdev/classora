import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { listTeamMembers, inviteMember, resendInvitation, setMemberStatus, removeMember, changeMemberRole, teamQueryKey } from "./api";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser, type MemberRole } from "@/auth/api";
import { can } from "@/auth/permissions";

const roles: MemberRole[] = ["CENTER_ADMIN", "ACADEMIC_MANAGER", "ACCOUNTANT", "SALE", "STAFF", "TEACHER"];

export function TeamPage() {
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canManage = can(membership, "team.manage");
  const query = useQuery({ queryKey: teamQueryKey(), queryFn: listTeamMembers });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("STAFF");
  const mutation = useMutation({
    mutationFn: inviteMember,
    onSuccess: ({ invitationToken }) => {
      setEmail("");
      toast.success(`Đã tạo lời mời. Liên kết tạm thời: ${window.location.origin}/accept-invitation?token=${invitationToken}`);
      void queryClient.invalidateQueries({ queryKey: teamQueryKey() });
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể mời thành viên.")),
  });
  const action = useMutation({
    mutationFn: ({ id, type, nextRole }: { id: string; type: "status" | "remove" | "role"; nextRole?: MemberRole }) =>
      type === "remove" ? removeMember(id) : type === "role" ? changeMemberRole(id, nextRole!) : setMemberStatus(id, nextRole as never),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: teamQueryKey() }),
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể cập nhật thành viên.")),
  });
  const resend = useMutation({
    mutationFn: resendInvitation,
    onSuccess: ({ invitationToken }) => toast.success(`Đã tạo lời mời mới: ${window.location.origin}/accept-invitation?token=${invitationToken}`),
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể gửi lại lời mời.")),
  });

  return <PageContainer>
    <PageHeader title="Thành viên" description="Quản lý quyền truy cập của đội ngũ trung tâm." />
    {canManage && <form className="mb-6 flex flex-col gap-3 rounded-xl border border-[#e2e8f0] bg-white p-4 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); mutation.mutate({ email, role }); }}>
      <label className="min-w-0 flex-1 text-sm font-medium text-[#334155]">Email<input className="input mt-1" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
      <label className="text-sm font-medium text-[#334155]">Vai trò<select className="input mt-1 min-w-48" value={role} onChange={(event) => setRole(event.target.value as MemberRole)}>{roles.map((item) => <option key={item}>{item}</option>)}</select></label>
      <Button type="submit" disabled={mutation.isPending}><UserPlus size={16} aria-hidden="true" />Mời thành viên</Button>
    </form>}
    {query.isPending ? <LoadingState label="Đang tải thành viên" /> : query.isError ? <ErrorState title="Không thể tải thành viên" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} /> : <>
      {query.data.invitations.length > 0 && <div className="mb-6 overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-[#e2e8f0] text-[#64748b]"><tr><th className="px-4 py-3">Lời mời đang chờ</th><th className="px-4 py-3">Vai trò</th><th className="px-4 py-3">Hết hạn</th><th className="px-4 py-3">Thao tác</th></tr></thead><tbody>{query.data.invitations.map((invitation) => <tr key={invitation.id} className="border-b border-[#f1f5f9] last:border-0"><td className="px-4 py-3 font-medium text-[#0f172a]">{invitation.email}</td><td className="px-4 py-3">{invitation.role}</td><td className="px-4 py-3 text-[#64748b]">{new Date(invitation.expiresAt).toLocaleString("vi-VN")}</td><td className="px-4 py-3"><Button size="sm" variant="secondary" disabled={!canManage || resend.isPending} onClick={() => resend.mutate(invitation.id)}>Gửi lại</Button></td></tr>)}</tbody></table></div>}
      {query.data.members.length === 0 ? <EmptyState title="Chưa có thành viên" description="Mời thành viên đầu tiên của trung tâm." /> : <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-[#e2e8f0] text-[#64748b]"><tr><th className="px-4 py-3">Thành viên</th><th className="px-4 py-3">Vai trò</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Thao tác</th></tr></thead><tbody>{query.data.members.map((member) => <tr key={member.id} className="border-b border-[#f1f5f9] last:border-0"><td className="px-4 py-3"><p className="font-semibold text-[#0f172a]">{member.user.name}</p><p className="text-xs text-[#64748b]">{member.user.email}</p></td><td className="px-4 py-3"><select className="input h-9" value={member.role} disabled={!canManage || action.isPending} onChange={(event) => action.mutate({ id: member.id, type: "role", nextRole: event.target.value as MemberRole })}><option value={member.role}>{member.role}</option>{roles.filter((item) => item !== member.role).map((item) => <option key={item}>{item}</option>)}</select></td><td className="px-4 py-3"><StatusBadge status={member.status}>{member.status === "ACTIVE" ? "Đang hoạt động" : "Đã vô hiệu hóa"}</StatusBadge></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={!canManage || action.isPending} onClick={() => action.mutate({ id: member.id, type: "status", nextRole: member.status === "ACTIVE" ? "DISABLED" as never : "ACTIVE" as never })}>{member.status === "ACTIVE" ? "Vô hiệu hóa" : "Kích hoạt"}</Button><Button size="sm" variant="destructive" disabled={!canManage || action.isPending} onClick={() => { if (window.confirm("Xóa thành viên khỏi trung tâm?")) action.mutate({ id: member.id, type: "remove" }); }}>Xóa</Button></div></td></tr>)}</tbody></table></div>}
    </>}
  </PageContainer>;
}
