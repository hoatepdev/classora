import { BookOpen, GraduationCap, LogOut, School, Settings, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { CurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { cn } from "@/lib/utils";

const navigation = [
  { to: "/students", label: "Học viên", icon: GraduationCap, permission: "student.read" },
  { to: "/teachers", label: "Giáo viên", icon: Users },
  { to: "/courses", label: "Khóa học", icon: BookOpen },
  { to: "/classes", label: "Lớp học", icon: School },
];

export function Sidebar({ centerName, hostname, user, activeMembership, onNavigate, onLogout }: {
  centerName?: string;
  hostname: string;
  user?: CurrentUser;
  activeMembership?: CurrentUser["memberships"][number];
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const { pathname } = useLocation();
  const membership = activeMembership ?? user?.memberships.find((item) => item.tenant.slug === hostname.split('.')[0]);
  const visibleNavigation = navigation.filter((item) => !item.permission || can(membership, item.permission));
  return <div className="flex h-full flex-col border-r border-[#e2e8f0] bg-white text-[#334155]">
    <div className="px-5 pt-5 pb-4">
      <Link to="/students" onClick={onNavigate} className="inline-flex items-center gap-2.5 text-xl font-bold tracking-[-.03em] text-[#0f172a]">
        <span className="grid size-8 place-items-center rounded-lg bg-[#2563eb] text-sm font-bold text-white">C</span>
        Classora
      </Link>
    </div>

    <div className="mx-3 border-y border-[#f1f5f9] px-2 py-4">
      <p className="m-0 truncate text-sm font-semibold text-[#0f172a]">{centerName ?? "Trung tâm hiện tại"}</p>
      <p className="mt-1 truncate text-xs text-[#64748b]">{hostname}</p>
    </div>

    <nav className="flex-1 px-3 py-5" aria-label="Điều hướng chính">
      <p className="mb-2 px-3 text-[11px] font-semibold tracking-[.08em] text-[#94a3b8] uppercase">Vận hành</p>
      <div className="grid gap-1">
        {visibleNavigation.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to) || (to === "/classes" && pathname.startsWith("/attendance-sessions"));
          return <Link
            key={to}
            to={to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#475569] transition-colors hover:bg-[#f8fafc] hover:text-[#0f172a]",
              active && "bg-[#eff6ff] font-semibold text-[#2563eb] hover:bg-[#eff6ff] hover:text-[#2563eb]",
            )}
          >
            <Icon size={18} strokeWidth={1.9} className={active ? "text-[#2563eb]" : "text-[#94a3b8]"} aria-hidden="true" />
            {label}
          </Link>;
        })}
        {membership && can(membership, "team.read") && <Link to="/settings/team" onClick={onNavigate} className={cn(
          "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#475569] transition-colors hover:bg-[#f8fafc] hover:text-[#0f172a]",
          pathname.startsWith("/settings") && "bg-[#eff6ff] font-semibold text-[#2563eb] hover:bg-[#eff6ff] hover:text-[#2563eb]",
        )}><Settings size={18} aria-hidden="true" />Thiết lập</Link>}
      </div>
    </nav>

    <div className="border-t border-[#e2e8f0] p-3">
      <div className="px-3 py-2">
        <p className="m-0 truncate text-sm font-semibold text-[#0f172a]">{user?.name ?? "Tài khoản"}</p>
        <p className="mt-1 truncate text-xs text-[#64748b]">{user?.email ?? "Đang tải thông tin…"}</p>
      </div>
      <button type="button" onClick={onLogout} className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#64748b] transition-colors hover:bg-[#f8fafc] hover:text-[#0f172a]">
        <LogOut size={17} aria-hidden="true" />
        Đăng xuất
      </button>
    </div>
  </div>;
}
