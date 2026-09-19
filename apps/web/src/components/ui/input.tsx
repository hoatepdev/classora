import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input
    type={type}
    className={cn("flex min-h-10.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-[#94a3b8] hover:border-[#94a3b8] focus:border-ring focus:ring-3 focus:ring-ring/12 disabled:cursor-not-allowed disabled:opacity-55", className)}
    {...props}
  />;
}

export { Input };
