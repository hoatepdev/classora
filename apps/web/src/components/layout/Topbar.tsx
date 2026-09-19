import { Menu } from "lucide-react";

const sectionNames: Record<string, string> = {
  students: "Học viên",
  teachers: "Giáo viên",
  courses: "Khóa học",
  classes: "Lớp học",
  "attendance-sessions": "Điểm danh",
};

export function Topbar({ pathname, centerName, onOpenNavigation }: {
  pathname: string;
  centerName?: string;
  onOpenNavigation: () => void;
}) {
  const section = sectionNames[pathname.split("/")[1]] ?? "Không gian làm việc";
  return <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[#e2e5ea] bg-white/95 px-4 backdrop-blur-sm md:px-7">
    <button
      type="button"
      className="grid size-10 place-items-center rounded-lg text-[#242261] hover:bg-[#eef1f5] lg:hidden"
      aria-label="Mở điều hướng"
      onClick={onOpenNavigation}
    >
      <Menu size={21} aria-hidden="true" />
    </button>
    <div className="min-w-0">
      <p className="m-0 text-sm font-bold text-[#202944]">{section}</p>
      {centerName && <p className="m-0 mt-0.5 truncate text-xs text-[#667085] lg:hidden">{centerName}</p>}
    </div>
  </header>;
}
