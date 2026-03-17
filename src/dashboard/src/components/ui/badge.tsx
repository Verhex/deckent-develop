import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-zinc-800 text-zinc-100",
        destructive: "border-transparent bg-red-900 text-red-100",
        outline: "text-foreground",
        info: "border-transparent bg-blue-900 text-blue-100",
        warning: "border-transparent bg-amber-900 text-amber-100",
        critical: "border-transparent bg-red-900 text-red-100",
        success: "border-transparent bg-green-900 text-green-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
