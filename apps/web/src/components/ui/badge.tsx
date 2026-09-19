import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", {
  variants: {
    variant: {
      active: "bg-[#dcfce7] text-[#166534]",
      inactive: "bg-[#f1f5f9] text-[#64748b]",
      warning: "bg-[#fff7ed] text-[#9a3412]",
      danger: "bg-[#fef2f2] text-[#991b1b]",
      info: "bg-[#eff6ff] text-[#1d4ed8]",
    },
  },
  defaultVariants: { variant: "inactive" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
