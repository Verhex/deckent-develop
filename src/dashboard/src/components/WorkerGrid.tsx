import { useLiveData } from "../lib/use-live-data.js";
import { WorkerCardGrid } from "./WorkerCard.js";
import type { DashboardState } from "../types/index.js";

interface WorkerGridProps {
  onSelect: (taskId: string) => void;
  onKill: (id: string) => void;
}

/**
 * Real-time worker grid — polls /api/status via useLiveData (stale-while-revalidate).
 * Replaces the static-6 worker list: all workers from live data are rendered, no cap.
 * SSE push events are handled at the DashboardPage level; this component uses REST polling
 * as the worker-grid source of truth (3s interval for fast spawn/done visibility).
 */
export function WorkerGrid({ onSelect, onKill }: WorkerGridProps) {
  const { data, isStale, status } = useLiveData<DashboardState>("/api/status", {
    pollIntervalMs: 3000,
  });

  const workers = data?.agents ?? [];

  return (
    <div>
      {isStale && status === "reconnecting" && (
        <p className="text-xs text-yellow-400 mb-2 font-mono">⚠ reconnecting…</p>
      )}
      <WorkerCardGrid agents={workers} onSelect={onSelect} onKill={onKill} />
    </div>
  );
}
