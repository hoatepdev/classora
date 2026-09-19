import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ label = "Đang tải dữ liệu" }: { label?: string }) {
  return <div className="state" aria-live="polite" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div className="mx-auto grid max-w-2xl gap-3" aria-hidden="true">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  </div>;
}
