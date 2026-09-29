import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "../../auth/api.js";
import { can } from "../../auth/permissions.js";
import { accessTokenKey } from "../../lib/api.js";

export function ProtectedRoute({ permission, anyPermissions, children }: { permission?: string; anyPermissions?: string[]; children?: ReactNode }) {
  const authenticated = Boolean(localStorage.getItem(accessTokenKey));
  const restricted = Boolean(permission || anyPermissions?.length);
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser, enabled: authenticated && restricted });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant, enabled: authenticated && restricted });
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!restricted) return children ?? <Outlet />;
  if (user.isPending || tenant.isPending) return null;
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const authorized = permission ? can(membership, permission) : anyPermissions?.some((item) => can(membership, item));
  return authorized ? children ?? <Outlet /> : <Navigate to="/dashboard" replace />;
}
