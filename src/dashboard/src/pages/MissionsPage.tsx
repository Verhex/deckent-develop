import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { SkeletonCard } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import {
  Target,
  CheckSquare2,
  Zap,
  GitBranch,
  ListTodo,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Local types matching the MissionView shape from src/orchestra/autonomous/mission-store/mission-view.ts
interface Progress { done: number; total: number; phase?: string; step?: string; }
interface MissionItem {
  id: string;
  kind: string;
  status: string;
  renderAs: string;
  progress: Progress | null;
}
interface MissionView {
  id: string;
  renderAs: "checklist" | "goal";
  status: "pending" | "active" | "completed" | "failed" | "cancelled";
  title: string;
  progress: Progress;
  deliverTo: string | null;
  lastResult: { ok: boolean; reason?: string } | null;
  items: MissionItem[];
}

// render_as → lucide icon
const RENDER_AS_ICON: Record<string, LucideIcon> = {
  checklist: CheckSquare2,
  goal: Target,
  sprint: Zap,
  workflow: GitBranch,
  task: ListTodo,
};

// render_as → badge color classes
const RENDER_AS_COLOR: Record<string, string> = {
  checklist: "bg-sky-900/50 text-sky-300 border-sky-800",
  goal: "bg-purple-900/50 text-purple-300 border-purple-800",
  sprint: "bg-yellow-900/50 text-yellow-300 border-yellow-800",
  workflow: "bg-teal-900/50 text-teal-300 border-teal-800",
  task: "bg-zinc-800 text-zinc-300 border-zinc-700",
};

// status → badge color classes
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-zinc-800 text-zinc-400",
  active: "bg-blue-900/50 text-blue-300",
  completed: "bg-green-900/50 text-green-300",
  failed: "bg-red-900/50 text-red-300",
  cancelled: "bg-zinc-900/50 text-zinc-500",
};

// status → lucide icon
const STATUS_ICON: Record<string, LucideIcon> = {
  pending: Clock,
  active: Activity,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: XCircle,
};

function RenderAsBadge({ renderAs }: { renderAs: string }) {
  const Icon = RENDER_AS_ICON[renderAs] ?? ListTodo;
  const colorClass = RENDER_AS_COLOR[renderAs] ?? "bg-zinc-800 text-zinc-300";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}
      data-testid={`render-as-badge-${renderAs}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {renderAs}
    </span>
  );
}

function ProgressBar({ progress }: { progress: Progress }) {
  const total = progress.total ?? 0;
  const done = progress.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3" data-testid="mission-progress">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div
          className="bg-brand-300 h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%` }}
          aria-label={`${pct}% complete`}
        />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap">
        {done} / {total}
      </span>
    </div>
  );
}

export default function MissionsPage() {
  const { data, loading, error } = useApi<{ missions: MissionView[] }>("/api/missions");

  const missions = data?.missions ?? [];

  return (
    <div className="space-y-6" data-testid="missions-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.03em] text-zinc-100">
            <Target className="h-6 w-6 text-brand-300" aria-hidden="true" />
            Missions
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Autonomous mission status</p>
        </div>
        {!loading && (
          <Badge variant="outline" data-testid="missions-count">
            {missions.length} {missions.length === 1 ? "mission" : "missions"}
          </Badge>
        )}
      </div>

      {/* Loading */}
      {loading && <SkeletonCard />}

      {/* Error */}
      {!loading && error && (
        <p className="text-red-400 text-sm" data-testid="missions-error">
          Error: {error}
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && missions.length === 0 && (
        <EmptyState
          icon={Target}
          title="No missions"
          description="No autonomous missions have been created yet."
          data-testid="missions-empty"
        />
      )}

      {/* Mission list */}
      {!loading && !error && missions.length > 0 && (
        <div className="space-y-4" data-testid="missions-list">
          {missions.map((mission) => {
            const StatusIcon = STATUS_ICON[mission.status] ?? Clock;
            const statusColor = STATUS_COLOR[mission.status] ?? "bg-zinc-800 text-zinc-400";
            return (
              <Card
                key={mission.id}
                className="bg-zinc-900 border-zinc-800"
                data-testid={`mission-card-${mission.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <RenderAsBadge renderAs={mission.renderAs} />
                      <CardTitle className="text-zinc-100 text-base font-semibold">
                        {mission.title}
                      </CardTitle>
                    </div>
                    <Badge
                      className={`${statusColor} flex items-center gap-1 shrink-0`}
                      data-testid={`mission-status-${mission.id}`}
                    >
                      <StatusIcon className="w-3 h-3" aria-hidden="true" />
                      {mission.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ProgressBar progress={mission.progress} />
                  {mission.deliverTo && (
                    <p className="text-xs text-zinc-500">
                      Deliver to: {mission.deliverTo}
                    </p>
                  )}
                  {mission.lastResult && !mission.lastResult.ok && mission.lastResult.reason && (
                    <p className="text-xs text-red-400" data-testid={`mission-error-${mission.id}`}>
                      {mission.lastResult.reason}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
