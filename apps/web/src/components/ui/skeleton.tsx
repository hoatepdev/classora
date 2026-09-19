import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-sm bg-[#e2e5ea]", className)} {...props} />;
}

export { Skeleton };
