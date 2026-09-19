import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10.5 items-center justify-center gap-2 rounded-lg border border-transparent px-4 font-bold transition-colors disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/30",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#116e54]",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-[#f8fafb]",
        destructive: "bg-destructive text-white hover:bg-[#8d231b]",
        ghost: "bg-transparent text-[#34339a] hover:bg-accent",
      },
      size: {
        default: "h-10.5",
        sm: "min-h-9 px-3 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
