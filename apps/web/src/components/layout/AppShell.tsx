import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { accessTokenKey } from "@/lib/api";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const hostname = window.location.hostname;

  const logout = () => {
    queryClient.clear();
    localStorage.removeItem(accessTokenKey);
    navigate("/login", { replace: true });
  };

  return <div className="min-h-screen bg-[#f8fafc] lg:grid lg:grid-cols-[216px_minmax(0,1fr)]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[216px] lg:block">
      <Sidebar centerName={membership?.tenant.name} hostname={hostname} user={user.data} activeMembership={membership} onLogout={logout} />
    </aside>

    <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}>
      <DialogContent className="inset-y-0 left-0 top-0 h-dvh w-[min(300px,88vw)] max-w-none translate-x-0 translate-y-0 border-0 p-0 [&>button]:text-[#64748b] [&>button:hover]:bg-[#f1f5f9] lg:hidden">
        <DialogTitle className="sr-only">Điều hướng</DialogTitle>
        <DialogDescription className="sr-only">Chọn khu vực làm việc trong Classora.</DialogDescription>
        <Sidebar centerName={membership?.tenant.name} hostname={hostname} user={user.data} activeMembership={membership} onNavigate={() => setNavigationOpen(false)} onLogout={logout} />
      </DialogContent>
    </Dialog>

    <div className="min-w-0 lg:col-start-2">
      <Topbar pathname={location.pathname} centerName={membership?.tenant.name} user={user.data} onOpenNavigation={() => setNavigationOpen(true)} />
      <Outlet />
    </div>
  </div>;
}
