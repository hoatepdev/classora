import { cn } from "@/lib/utils";

export function PageContainer({ className, ...props }: React.ComponentProps<"main">) {
  return <main className={cn("page", className)} {...props} />;
}
