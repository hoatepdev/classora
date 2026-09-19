import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ label = "Đang tải dữ liệu" }: { label?: string }) {
  return <div className="rounded-xl border border-[#d9dee7] bg-white px-5 py-12 shadow-[0_1px_2px_rgba(24,33,57,.04)]" aria-live="polite" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div className="mx-auto grid max-w-2xl gap-3" aria-hidden="true">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  </div>;
}
