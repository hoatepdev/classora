import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, ClipboardCheck, CreditCard, Home, LogOut, Menu, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { accessTokenKey } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getPortalMe, portalMeKey } from "./api";

const links = [{ to: "/portal", label: "Tổng quan", icon: Home }, { to: "/portal/progress", label: "Tiến độ", icon: TrendingUp }, { to: "/portal/schedule", label: "Lịch học", icon: CalendarDays }, { to: "/portal/attendance", label: "Điểm danh", icon: ClipboardCheck }, { to: "/portal/notifications", label: "Thông báo", icon: Bell }];

export function PortalShell() {
  const query = useQuery({ queryKey: portalMeKey(), queryFn: getPortalMe });
  const [open, setOpen] = useState(false);
  const location = useLocation(); const navigate = useNavigate(); const client = useQueryClient();
  const visible = query.data?.students.some((student) => student.canViewBilling) ? [...links.slice(0, 3), { to: "/portal/billing", label: "Học phí", icon: CreditCard }, links[3]] : links;
  const logout = () => { client.clear(); localStorage.removeItem(accessTokenKey); navigate("/portal/login", { replace: true }); };
  const navigation = <><Link to="/portal" className="flex items-center gap-2 text-lg font-bold text-[#0f172a] no-underline"><span className="grid size-8 place-items-center rounded-lg bg-[#2563eb] text-white">C</span>Classora</Link><nav className="mt-7 grid gap-1" aria-label="Cổng thông tin">{visible.map(({ to, label, icon: Icon }) => { const active = to === "/portal" ? location.pathname === to : location.pathname.startsWith(to); return <Link key={to} to={to} onClick={() => setOpen(false)} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#475569] no-underline hover:bg-[#f8fafc]", active && "bg-[#eff6ff] font-semibold text-[#2563eb]")}><Icon size={18} aria-hidden="true" />{label}</Link>; })}</nav><div className="mt-auto border-t border-[#e2e8f0] pt-4"><p className="m-0 truncate text-sm font-semibold">{query.data?.user.name}</p><p className="mt-1 truncate text-xs text-[#64748b]">{query.data?.user.email}</p><Button className="mt-3 w-full justify-start" variant="ghost" onClick={logout}><LogOut size={17} />Đăng xuất</Button></div></>;
  return <div className="min-h-screen bg-[#f8fafc] md:grid md:grid-cols-[220px_minmax(0,1fr)]"><aside className="hidden min-h-screen flex-col border-r border-[#e2e8f0] bg-white p-5 md:flex">{navigation}</aside>{open && <div className="fixed inset-0 z-40 bg-[#0f172a]/30 md:hidden" onClick={() => setOpen(false)}><aside className="flex h-full w-[min(300px,86vw)] flex-col bg-white p-5" onClick={(event) => event.stopPropagation()}>{navigation}</aside></div>}<div className="min-w-0"><header className="flex min-h-16 items-center justify-between border-b border-[#e2e8f0] bg-white px-4 md:px-6"><Button className="md:hidden" variant="ghost" aria-label="Mở điều hướng" onClick={() => setOpen(true)}><Menu size={20} /></Button><p className="m-0 text-sm font-semibold text-[#334155]">Cổng học viên & phụ huynh</p><span className="text-sm text-[#64748b]">{query.data?.students.length ? `${query.data.students.length} học viên` : ""}</span></header><Outlet /></div></div>;
}
