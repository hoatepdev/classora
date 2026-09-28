import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { getApiErrorMessage } from "@/lib/api";
import { getReportCatalog, reportCatalogQueryKey } from "./api";
import { categoryLabels } from "./labels";
import type { ReportCategory } from "./types";

const categories: ReportCategory[] = ["ACADEMIC", "FINANCE", "GROWTH", "ORGANIZATION"];

export function ReportsPage() {
  const catalog = useQuery({ queryKey: reportCatalogQueryKey(), queryFn: getReportCatalog });
  if (catalog.isPending) return <PageContainer><PageHeader title="Báo cáo" description="Phân tích dữ liệu vận hành theo kỳ." /><LoadingState label="Đang tải danh mục báo cáo" /></PageContainer>;
  if (catalog.isError) return <PageContainer><PageHeader title="Báo cáo" description="Phân tích dữ liệu vận hành theo kỳ." /><ErrorState title="Không thể tải báo cáo" message={getApiErrorMessage(catalog.error, "Kiểm tra kết nối và thử lại.")} onRetry={() => void catalog.refetch()} /></PageContainer>;
  if (!catalog.data.length) return <PageContainer><PageHeader title="Báo cáo" description="Phân tích dữ liệu vận hành theo kỳ." /><EmptyState icon={BarChart3} title="Chưa có báo cáo được cấp quyền" description="Danh mục sẽ xuất hiện khi tài khoản có quyền truy cập dữ liệu phù hợp." /></PageContainer>;

  return <PageContainer>
    <PageHeader title="Báo cáo" description="Xem tổng hợp, phân tích chi tiết và xuất CSV từ cùng một bộ lọc dữ liệu." />
    <div className="grid grid-cols-1 gap-8">
      {categories.map((category) => {
        const reports = catalog.data.filter((report) => report.category === category);
        if (!reports.length) return null;
        return <section key={category} aria-labelledby={`reports-${category}`}>
          <h2 id={`reports-${category}`} className="mb-3 text-sm font-semibold tracking-wide text-[#475569] uppercase">{categoryLabels[category]}</h2>
          <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
            {reports.map((report) => <Link key={report.key} to={`/reports/${report.key}`} className="group flex min-h-20 items-center gap-4 border-b border-[#f1f5f9] px-5 py-4 last:border-0 hover:bg-[#f8fafc] focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-500/25">
              <div className="min-w-0 flex-1"><h3 className="m-0 text-base font-semibold text-[#0f172a]">{report.name}</h3><p className="mt-1 mb-0 max-w-3xl text-sm leading-5 text-[#64748b]">{report.description}</p></div>
              <ArrowRight size={18} className="shrink-0 text-[#94a3b8] transition-transform group-hover:translate-x-0.5 group-hover:text-[#2563eb]" aria-hidden="true" />
            </Link>)}
          </div>
        </section>;
      })}
    </div>
  </PageContainer>;
}
