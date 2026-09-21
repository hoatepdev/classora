import { useQuery } from "@tanstack/react-query";
import { getCurrentUser, currentUserQueryKey } from "@/auth/api";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";

export function SecurityPage() {
  const query = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  return <PageContainer><PageHeader title="Bảo mật" description="Thông tin tài khoản và trạng thái truy cập hiện tại." />{query.isPending ? <LoadingState label="Đang tải thông tin tài khoản" /> : <section className="max-w-2xl rounded-xl border border-[#e2e8f0] bg-white p-5"><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-[#64748b]">Tài khoản</dt><dd className="mt-1 font-medium text-[#0f172a]">{query.data?.name}</dd></div><div><dt className="text-[#64748b]">Email</dt><dd className="mt-1 font-medium text-[#0f172a]">{query.data?.email}</dd></div></dl><p className="mt-5 border-t border-[#f1f5f9] pt-4 text-sm text-[#64748b]">Phiên đăng nhập hiện tại sử dụng access token và được kiểm tra trạng thái tài khoản ở mỗi yêu cầu.</p></section>}</PageContainer>;
}
