import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "../../auth/api.js";
import { can } from "../../auth/permissions.js";
import { accessTokenKey } from "../../lib/api.js";

export function ProtectedRoute({ permission, children }: { permission?: string; children?: ReactNode }) {
  const authenticated = Boolean(localStorage.getItem(accessTokenKey));
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser, enabled: authenticated && Boolean(permission) });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant, enabled: authenticated && Boolean(permission) });
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!permission) return children ?? <Outlet />;
  if (user.isPending || tenant.isPending) return null;
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  return can(membership, permission) ? children ?? <Outlet /> : <Navigate to="/students" replace />;
}
