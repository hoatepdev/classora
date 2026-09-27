import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/page-container";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { getApiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { getGradebook, progressKey, updateGradebook } from "./api";

export function GradebookPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const [values, setValues] = useState<Record<string, { score: string; comment: string; criteria: Record<string, string> }>>({});
  const query = useQuery({ queryKey: progressKey("gradebook", id ?? ""), queryFn: () => getGradebook(id!), enabled: Boolean(id) });
  const save = useMutation({
    mutationFn: () => updateGradebook(id!, query.data!.results.map((result) => ({
      ...result,
      score: values[result.studentId]?.score ?? result.score ?? null,
      comment: values[result.studentId]?.comment ?? result.comment ?? null,
      criterionScores: Object.fromEntries(Object.entries(values[result.studentId]?.criteria ?? result.criterionScores ?? {}).map(([key, value]) => [key, value || null])),
    }))),
    onSuccess: () => { void client.invalidateQueries({ queryKey: progressKey("gradebook", id ?? "") }); toast.success("Đã lưu sổ điểm."); },
    onError: (error) => toast.error(getApiErrorMessage(error, "Không thể lưu sổ điểm.")),
  });
  if (query.isPending) return <PageContainer><LoadingState label="Đang tải sổ điểm" /></PageContainer>;
  if (query.isError || !query.data) return <PageContainer><ErrorState title="Không thể tải sổ điểm" message="Vui lòng thử lại." onRetry={() => void query.refetch()} /></PageContainer>;
  const criteria = query.data.criteria ?? query.data.assessment.criteria ?? [];
  return <PageContainer>
    <Button variant="ghost" asChild className="mb-4 -ml-3"><Link to={`/classes/${query.data.assessment.classId}`}>Quay lại lớp học</Link></Button>
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="m-0 text-2xl font-bold text-[#0f172a]">{query.data.assessment.title}</h1><p className="mt-2 mb-0 text-sm text-[#64748b]">Sổ điểm tập trung · {query.data.assessment.scoringMode === "RUBRIC" ? "Rubric" : `Điểm / ${query.data.assessment.maxScore ?? "—"}`}</p></div><Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Đang lưu…" : "Lưu sổ điểm"}</Button></header>
    <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white"><table className="w-full text-left text-sm"><thead><tr><th className="px-4 py-3">Học viên</th>{query.data.assessment.scoringMode === "RUBRIC" && criteria.map((criterion) => <th className="w-36 px-4 py-3" key={criterion.id ?? criterion.name}>{criterion.name}<span className="block text-xs font-normal text-[#64748b]">/{criterion.maxScore}</span></th>)}<th className="w-36 px-4 py-3">Điểm tổng</th><th className="px-4 py-3">Nhận xét</th></tr></thead><tbody>{query.data.results.map((result) => { const existing = values[result.studentId] ?? { score: result.score ?? "", comment: result.comment ?? "", criteria: Object.fromEntries(Object.entries(result.criterionScores ?? {}).map(([key, score]) => [key, score ?? ""])) }; return <tr className="border-t border-[#f1f5f9]" key={result.studentId}><td className="px-4 py-3 font-semibold">{result.studentName}<span className="ml-2 text-xs font-normal text-[#64748b]">{result.studentCode}</span></td>{query.data.assessment.scoringMode === "RUBRIC" && criteria.map((criterion) => { const key = criterion.id ?? criterion.name; return <td className="px-4 py-3" key={key}><Input type="number" min="0" max={criterion.maxScore} value={existing.criteria[key] ?? ""} onChange={(event) => setValues((prev) => ({ ...prev, [result.studentId]: { ...existing, criteria: { ...existing.criteria, [key]: event.target.value } } }))} aria-label={`${criterion.name} của ${result.studentName}`} /></td>; })}<td className="px-4 py-3"><Input type="number" min="0" max={query.data.assessment.maxScore ?? undefined} value={existing.score} onChange={(event) => setValues((prev) => ({ ...prev, [result.studentId]: { ...existing, score: event.target.value } }))} aria-label={`Điểm của ${result.studentName}`} /></td><td className="px-4 py-3"><Input value={existing.comment} onChange={(event) => setValues((prev) => ({ ...prev, [result.studentId]: { ...existing, comment: event.target.value } }))} aria-label={`Nhận xét cho ${result.studentName}`} /></td></tr>; })}</tbody></table></div>
  </PageContainer>;
}
