import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { accessTokenKey } from "@/lib/api";
import { getPortalMe, portalMeKey } from "./api";

export function PortalProtectedRoute() {
  const location = useLocation();
  const authenticated = Boolean(localStorage.getItem(accessTokenKey));
  const query = useQuery({ queryKey: portalMeKey(), queryFn: getPortalMe, enabled: authenticated, retry: false });
  if (!authenticated) return <Navigate to={`/portal/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  if (query.isPending) return null;
  if (query.isError) return <Navigate to="/portal/login" replace />;
  return <Outlet />;
}
