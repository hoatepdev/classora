import { useQuery } from "@tanstack/react-query";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { listRoles, teamQueryKey } from "./api";

export function RolesPage() {
  const query = useQuery({ queryKey: [...teamQueryKey(), "roles"], queryFn: listRoles });
  return <PageContainer>
    <PageHeader title="Vai trò" description="Các vai trò dựng sẵn và nhóm quyền tương ứng trong Classora." />
    {query.isPending ? <LoadingState label="Đang tải vai trò" /> : query.isError ? <ErrorState title="Không thể tải vai trò" message="Kiểm tra kết nối và thử lại." onRetry={() => void query.refetch()} /> : <div className="grid gap-4 md:grid-cols-2">{query.data.map((item) => <section key={item.role} className="rounded-xl border border-[#e2e8f0] bg-white p-5"><h2 className="text-base font-semibold text-[#0f172a]">{item.role}</h2><ul className="mt-3 grid gap-2 text-sm text-[#475569]">{item.permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul></section>)}</div>}
  </PageContainer>;
}
