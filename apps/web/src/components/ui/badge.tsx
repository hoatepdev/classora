import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", {
  variants: {
    variant: {
      active: "bg-[#dcf5eb] text-[#11664e]",
      inactive: "bg-[#eef0f3] text-[#596278]",
      warning: "bg-[#fff4d6] text-[#7a4d00]",
      danger: "bg-[#fff0ee] text-[#9f2d24]",
      info: "bg-[#ecebff] text-[#3730a3]",
    },
  },
  defaultVariants: { variant: "inactive" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
