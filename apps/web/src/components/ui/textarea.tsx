import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea
    className={cn("flex min-h-24 w-full rounded-sm border border-input bg-card px-3 py-2 text-foreground outline-none placeholder:text-[#7b8497] hover:border-[#929cab] focus:border-ring focus:ring-3 focus:ring-ring/12 disabled:cursor-not-allowed disabled:opacity-55", className)}
    {...props}
  />;
}

export { Textarea };
