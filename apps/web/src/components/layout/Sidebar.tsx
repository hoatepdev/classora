import { BookOpen, GraduationCap, LogOut, School, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { CurrentUser } from "@/auth/api";
import { cn } from "@/lib/utils";

const navigation = [
  { to: "/students", label: "Học viên", icon: GraduationCap },
  { to: "/teachers", label: "Giáo viên", icon: Users },
  { to: "/courses", label: "Khóa học", icon: BookOpen },
  { to: "/classes", label: "Lớp học", icon: School },
];

export function Sidebar({ centerName, hostname, user, onNavigate, onLogout }: {
  centerName?: string;
  hostname: string;
  user?: CurrentUser;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const { pathname } = useLocation();
  return <div className="flex h-full flex-col bg-[#201f5b] text-white">
    <div className="border-b border-white/10 px-5 py-5">
      <Link to="/students" onClick={onNavigate} className="inline-flex items-center gap-2 text-xl font-extrabold tracking-[-.03em]">
        <span className="grid size-8 place-items-center rounded-lg bg-white text-[#242261]">C</span>
        Classora
      </Link>
    </div>

    <div className="mx-3 mt-4 rounded-xl border border-white/10 bg-white/8 p-3.5">
      <p className="m-0 truncate text-sm font-bold text-white">{centerName ?? "Trung tâm hiện tại"}</p>
      <p className="mt-1 truncate text-xs text-indigo-200">{hostname}</p>
    </div>

    <nav className="flex-1 px-3 py-6" aria-label="Điều hướng chính">
      <p className="mb-2 px-3 text-[11px] font-bold tracking-[.08em] text-indigo-300 uppercase">Vận hành</p>
      <div className="grid gap-1">
        {navigation.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to) || (to === "/classes" && pathname.startsWith("/attendance-sessions"));
          return <Link
            key={to}
            to={to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-indigo-100 transition-colors hover:bg-white/8 hover:text-white",
              active && "bg-white text-[#242261] shadow-sm hover:bg-white hover:text-[#242261]",
            )}
          >
            <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
            {label}
          </Link>;
        })}
      </div>
    </nav>

    <div className="border-t border-white/10 p-3">
      <div className="px-3 py-2">
        <p className="m-0 truncate text-sm font-bold">{user?.name ?? "Tài khoản"}</p>
        <p className="mt-1 truncate text-xs text-indigo-200">{user?.email ?? "Đang tải thông tin…"}</p>
      </div>
      <button type="button" onClick={onLogout} className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-indigo-100 hover:bg-white/8 hover:text-white">
        <LogOut size={17} aria-hidden="true" />
        Đăng xuất
      </button>
    </div>
  </div>;
}
