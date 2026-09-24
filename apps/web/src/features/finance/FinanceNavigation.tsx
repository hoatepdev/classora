import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";

const entries = [
  { to: "/billing", label: "Học phí & thanh toán", permission: "billing.read" },
  { to: "/billing/compensation", label: "Thù lao giáo viên", permission: "compensation.read" },
] as const;

export function FinanceNavigation() {
  const location = useLocation();
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const visible = entries.filter((entry) => can(membership, entry.permission));

  if (visible.length < 2) return null;

  return <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-[#e2e8f0]" aria-label="Khu vực tài chính">
    {visible.map((entry) => {
      const active = entry.to === "/billing"
        ? location.pathname === "/billing" || (location.pathname.startsWith("/billing/") && !location.pathname.startsWith("/billing/compensation"))
        : location.pathname.startsWith(entry.to);
      return <Link key={entry.to} to={entry.to} aria-current={active ? "page" : undefined} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${active ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-[#64748b] hover:border-[#cbd5e1] hover:text-[#0f172a]"}`}>{entry.label}</Link>;
    })}
  </nav>;
}
