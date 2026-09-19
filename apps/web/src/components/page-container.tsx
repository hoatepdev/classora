import { cn } from "@/lib/utils";

export function PageContainer({ className, ...props }: React.ComponentProps<"main">) {
  return <main className={cn("page-content mx-auto w-full max-w-[1440px] px-4 py-6 md:px-7 md:py-7 lg:px-8 lg:py-8", className)} {...props} />;
}
