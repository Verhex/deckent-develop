import { cn } from "../lib/utils";

interface SkeletonProps {
  className?: string;
}

// Base skeleton element
function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded bg-zinc-800", className)}
    />
  );
}

// Card-shaped skeleton placeholder
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-lg shadow-zinc-950/50", className)}>
      <div className="space-y-3">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

// Table rows skeleton placeholder
interface SkeletonTableProps extends SkeletonProps {
  rows?: number;
  cols?: number;
}

export function SkeletonTable({ rows = 5, cols = 4, className }: SkeletonTableProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {/* Header row */}
      <div className="flex gap-4 border-b border-zinc-700 pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className={cn("h-4 flex-1", j === 0 ? "max-w-[120px]" : "")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Text line skeleton placeholder with varying widths
interface SkeletonTextProps extends SkeletonProps {
  lines?: number;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  const widths = ["w-full", "w-4/5", "w-3/4", "w-2/3", "w-1/2", "w-5/6"];
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", widths[i % widths.length])}
        />
      ))}
    </div>
  );
}
