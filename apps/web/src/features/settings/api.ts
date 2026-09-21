import { api } from "@/lib/api";
import type { MemberRole, MembershipStatus, Permission } from "@/auth/api";

export type TeamMember = {
  id: string;
  role: MemberRole;
  status: MembershipStatus;
  disabledAt: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string; status: "ACTIVE" | "DISABLED" };
};

export type TeamInvitation = {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  createdAt: string;
};

export type TeamResponse = { members: TeamMember[]; invitations: TeamInvitation[] };

export type RoleInfo = { role: MemberRole; permissions: Permission[] };
export const teamQueryKey = () => ["team", window.location.hostname] as const;

export async function listTeamMembers() { return (await api.get<TeamResponse>("/team/members")).data; }
export async function listRoles() { return (await api.get<RoleInfo[]>("/team/roles")).data; }
export async function inviteMember(input: { email: string; role: MemberRole }) {
  return (await api.post<{ invitationToken: string; email: string; role: MemberRole; expiresAt: string }>("/team/invitations", input)).data;
}
export async function resendInvitation(id: string) { return (await api.post<{ invitationToken: string; email: string; role: MemberRole; expiresAt: string }>(`/team/invitations/${id}/resend`)).data; }
export async function changeMemberRole(id: string, role: MemberRole) { return (await api.patch(`/team/members/${id}/role`, { role })).data; }
export async function setMemberStatus(id: string, status: MembershipStatus) { return (await api.patch(`/team/members/${id}/status/${status}`)).data; }
export async function removeMember(id: string) { return (await api.delete(`/team/members/${id}`)).data; }
