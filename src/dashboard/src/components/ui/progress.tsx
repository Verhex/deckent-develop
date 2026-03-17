import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface ProgressSegment {
  value: number;
  color: string;
  label?: string;
}

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  segments: ProgressSegment[];
  total: number;
}

function Progress({ segments, total, className, ...props }: ProgressProps) {
  return (
    <div
      className={cn("flex h-4 w-full overflow-hidden rounded-full bg-zinc-800", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      {...props}
    >
      {segments.map((segment, i) => {
        const pct = total > 0 ? (segment.value / total) * 100 : 0;
        if (pct === 0) return null;
        return (
          <div
            key={i}
            className={cn("h-full transition-all", segment.color)}
            style={{ width: `${pct}%` }}
            title={segment.label ?? `${segment.value}`}
          />
        );
      })}
    </div>
  );
}

export { Progress, type ProgressSegment, type ProgressProps };
