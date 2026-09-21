import type { CurrentUser } from "./api";

export type Permission = string;

export function currentMembership(user: CurrentUser | undefined, tenantId: string | undefined) {
  return user?.memberships.find((membership) => membership.tenantId === tenantId);
}

export function can(membership: CurrentUser["memberships"][number] | undefined, permission: Permission) {
  return membership?.status === "ACTIVE" && membership.permissions.includes(permission);
}
