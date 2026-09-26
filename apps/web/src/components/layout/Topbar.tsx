import { Menu } from "lucide-react";
import type { CurrentUser } from "@/auth/api";

const sectionNames: Record<string, string> = {
  students: "Học viên",
  teachers: "Giáo viên",
  courses: "Khóa học",
  classes: "Lớp học",
  schedule: "Lịch học",
  "attendance-sessions": "Điểm danh",
  communications: "Thông báo",
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
}

export function Topbar({ pathname, centerName, user, onOpenNavigation }: {
  pathname: string;
  centerName?: string;
  user?: CurrentUser;
  onOpenNavigation: () => void;
}) {
  const section = sectionNames[pathname.split("/")[1]] ?? "Không gian làm việc";
  return <header className="sticky top-0 z-30 flex h-15 items-center gap-3 border-b border-[#e2e8f0] bg-white px-4 md:px-7">
    <button
      type="button"
      className="grid size-10 place-items-center rounded-lg text-[#334155] hover:bg-[#f1f5f9] lg:hidden"
      aria-label="Mở điều hướng"
      onClick={onOpenNavigation}
    >
      <Menu size={21} aria-hidden="true" />
    </button>
    <div className="min-w-0">
      <p className="m-0 text-sm font-semibold text-[#0f172a]">{section}</p>
      {centerName && <p className="m-0 mt-0.5 truncate text-xs text-[#64748b] lg:hidden">{centerName}</p>}
    </div>
    <div className="ml-auto flex min-w-0 items-center gap-2.5">
      <div className="hidden min-w-0 text-right sm:block">
        <p className="m-0 max-w-44 truncate text-sm font-medium text-[#0f172a]">{user?.name ?? "Tài khoản"}</p>
        {user?.email && <p className="m-0 mt-0.5 max-w-44 truncate text-xs text-[#64748b]">{user.email}</p>}
      </div>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eff6ff] text-xs font-semibold text-[#2563eb]" aria-hidden="true">
        {initials(user?.name ?? "Tài khoản")}
      </span>
    </div>
  </header>;
}
