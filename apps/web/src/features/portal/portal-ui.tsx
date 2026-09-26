import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { getPortalMe, portalMeKey } from "./api";

export function PortalPage({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8"><header className="mb-6"><h1 className="text-2xl font-bold tracking-[-.025em] text-[#0f172a]">{title}</h1>{description && <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[#64748b]">{description}</p>}</header>{children}</main>;
}

export function useSelectedStudent() {
  const me = useQuery({ queryKey: portalMeKey(), queryFn: getPortalMe });
  const [selected, setSelected] = useState(() => sessionStorage.getItem("classora.portal.student"));
  const student = me.data?.students.find((item) => item.id === selected) ?? me.data?.students[0];
  const select = (id: string) => { sessionStorage.setItem("classora.portal.student", id); setSelected(id); };
  return { me, student, select };
}

export function StudentSelector({ student, students, onChange }: { student?: { id: string }; students: Array<{ id: string; fullName: string }>; onChange: (id: string) => void }) {
  if (students.length < 2) return null;
  return <label className="mb-6 block max-w-sm text-sm font-medium text-[#334155]" htmlFor="portal-student">Học viên<select className="input mt-1" id="portal-student" name="student" value={student?.id} onChange={(event) => onChange(event.target.value)}>{students.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>;
}

export function QueryState({ query, children }: { query: { isPending: boolean; isError: boolean; refetch(): unknown }; children: React.ReactNode }) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState title="Không thể tải dữ liệu" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} />;
  return children;
}

export const formatDate = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN") : "—";
export const formatDateTime = (value: string) => new Date(value).toLocaleString("vi-VN");
export const formatMoney = (value: string) => `${new Intl.NumberFormat("vi-VN").format(Number(value))} ₫`;
