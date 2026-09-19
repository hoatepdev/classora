import { api } from "@/lib/api";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  memberships: Array<{
    id: string;
    tenantId: string;
    userId: string;
    role: "OWNER" | "ADMIN" | "STAFF";
    tenant: { id: string; name: string; slug: string };
  }>;
};

export type CurrentTenant = { tenantId: string; tenantSlug: string };

export const currentUserQueryKey = () => ["auth", "me", window.location.hostname] as const;
export const currentTenantQueryKey = () => ["tenant", "current", window.location.hostname] as const;

export async function getCurrentUser() {
  return (await api.get<CurrentUser>("/auth/me")).data;
}

export async function getCurrentTenant() {
  return (await api.get<CurrentTenant>("/health/tenant")).data;
}
