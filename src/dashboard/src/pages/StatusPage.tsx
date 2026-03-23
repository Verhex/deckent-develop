/**
 * StatusPage — Human-friendly sprint status view.
 * Uses SprintSummary for a narrative overview instead of raw data tables.
 */
import { useState, useEffect } from "react";
import { SprintSummary, type TaskInfo } from "../components/SprintSummary";
import { useSSE } from "../hooks/useSSE";
import { fetchJson, ApiError } from "../lib/api";
import type { DashboardState } from "../types";

export default function StatusPage() {
  const sseState = useSSE("/api/events");
  const [fallbackState, setFallbackState] = useState<DashboardState | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [noSprint, setNoSprint] = useState(false);

  useEffect(() => {
    if (!sseState) {
      fetchJson<DashboardState>("/api/status")
        .then((data) => {
          setFallbackState(data);
          setNoSprint(false);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) {
            setNoSprint(true);
          }
        });
    }
  }, [sseState]);

  // Fetch task details for the summary
  useEffect(() => {
    fetchJson<TaskInfo[]>("/api/tasks")
      .then(setTasks)
      .catch(() => setTasks([]));
  }, [sseState, fallbackState]);

  const state = sseState ?? fallbackState;

  if (noSprint) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
        <p className="text-lg">No active sprint.</p>
        <p className="mt-2 text-sm">
          Run <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">deckent start</code> to begin.
        </p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        Loading sprint data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Sprint Status</h1>
      <SprintSummary state={state} tasks={tasks} />
    </div>
  );
}
