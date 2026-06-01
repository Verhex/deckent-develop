import { useState, useCallback } from "react";
import { Activity, Skull, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { WorkerCardGrid } from "./WorkerCard";
import { SprintPhaseTimeline } from "./SprintPhaseTimeline";
import { useSSEWithStatus } from "../hooks/useSSE";
import { useApi } from "../hooks/useApi";
import { postJson } from "../lib/api";
import type { DashboardState } from "../types";

const PHASE_COLORS: Record<string, "info" | "warning" | "critical" | "success" | "secondary"> = {
  PLAN: "info",
  SPAWN: "info",
  EXECUTE: "warning",
  EVALUATE: "warning",
  FIX: "critical",
  RETRO: "success",
  DECAY: "secondary",
  CLEANUP: "secondary",
  COMPLETE: "success",
};

export function SprintControlPanel() {
  const { data: sseState, status: sseStatus } = useSSEWithStatus("/api/events");
  const { data: apiState, refetch } = useApi<DashboardState>("/api/status");
  const [isKillAllLoading, setIsKillAllLoading] = useState(false);
  const [isCleanupLoading, setIsCleanupLoading] = useState(false);

  const state = sseState ?? apiState;
  const phase = state?.sprint?.phase;
  const agents = state?.agents ?? [];
  const progress = state?.progress;

  const done = progress?.done ?? 0;
  const active = progress?.active ?? 0;
  const total = progress?.total ?? 0;
  const pending = Math.max(0, total - done - active);

  const showKillAll = phase === "EXECUTE" || phase === "FIX";

  const handleKillAll = useCallback(async () => {
    if (!window.confirm("Kill all active workers?")) return;
    setIsKillAllLoading(true);
    try {
      await postJson("/api/kill/all");
      refetch();
    } catch {
      // silent
    } finally {
      setIsKillAllLoading(false);
    }
  }, [refetch]);

  const handleKill = useCallback(async (agentId: string) => {
    if (!window.confirm(`Kill worker ${agentId}?`)) return;
    try {
      await postJson(`/api/kill/${agentId}`);
      refetch();
    } catch {
      // silent
    }
  }, [refetch]);

  const handleCleanup = useCallback(async () => {
    if (!window.confirm("Run cleanup?")) return;
    setIsCleanupLoading(true);
    try {
      await postJson("/api/cleanup");
      refetch();
    } catch {
      // silent
    } finally {
      setIsCleanupLoading(false);
    }
  }, [refetch]);

  if (!state || state.idle) {
    return (
      <Card data-testid="sprint-control-panel-empty" className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-3xl select-none">🐙</p>
          <p className="text-zinc-500 text-sm">No active sprint</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div data-testid="sprint-control-panel" className="space-y-4">
      {/* Sprint Status Card */}
      <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-zinc-100">
            <Activity className="h-5 w-5 text-blue-400" />
            Sprint Control
          </CardTitle>
          <div className="flex items-center gap-2">
            {phase && (
              <Badge
                data-testid="phase-badge"
                variant={PHASE_COLORS[phase] ?? "secondary"}
              >
                {phase}
              </Badge>
            )}
            <Badge variant={sseStatus === "connected" ? "success" : "secondary"}>
              {sseStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Sprint ID + Status row */}
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p className="text-zinc-400">Sprint ID</p>
              <p className="font-mono text-zinc-100">{state.sprint?.id ?? "—"}</p>
            </div>
            <div>
              <p className="text-zinc-400">Status</p>
              <p className="text-zinc-100">{state.sprint?.status ?? "—"}</p>
            </div>
          </div>

          {/* Phase timeline */}
          {phase && <SprintPhaseTimeline currentPhase={phase} />}

          {/* Control buttons */}
          <div className="flex gap-2 mt-4">
            {showKillAll && (
              <Button
                data-testid="kill-all-btn"
                variant="destructive"
                size="sm"
                disabled={isKillAllLoading}
                onClick={handleKillAll}
              >
                <Skull className="mr-1 h-3 w-3" />
                Kill All
              </Button>
            )}
            <Button
              data-testid="cleanup-btn"
              variant="outline"
              size="sm"
              disabled={isCleanupLoading}
              onClick={handleCleanup}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Cleanup
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {total > 0 && (
        <Card data-testid="progress-card" className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
          <CardContent className="pt-4">
            <Progress
              total={total}
              segments={[
                { value: done, color: "bg-green-500", label: `Done: ${done}` },
                { value: active, color: "bg-blue-500", label: `Active: ${active}` },
                { value: pending, color: "bg-zinc-600", label: `Pending: ${pending}` },
              ]}
            />
            <p className="text-sm text-zinc-400 mt-2">
              {done}/{total} done · {active} active · {pending} queued
            </p>
          </CardContent>
        </Card>
      )}

      {/* Worker grid */}
      <div data-testid="worker-grid">
        <WorkerCardGrid
          agents={agents}
          onSelect={() => {}}
          onKill={handleKill}
        />
      </div>
    </div>
  );
}
