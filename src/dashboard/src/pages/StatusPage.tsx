/**
 * StatusPage — Human-friendly sprint status view.
 * Uses SprintSummary for a narrative overview instead of raw data tables.
 */
import { useState, useEffect } from "react";
import { SprintSummary, type TaskInfo } from "../components/SprintSummary";
import { useSSE } from "../hooks/useSSE";
import { useLiveData } from "../lib/use-live-data";
import { fetchJson, ApiError } from "../lib/api";
import { useTranslation } from "../i18n/LanguageProvider";
import type { DashboardState } from "../types";

export default function StatusPage() {
  const { t } = useTranslation();
  const sseState = useSSE("/api/events");
  const [fallbackState, setFallbackState] = useState<DashboardState | null>(null);
  const [noSprint, setNoSprint] = useState(false);

  // Real-time task polling — done/working/no_go status updates every 5s
  const liveTasks = useLiveData<TaskInfo[]>("/api/tasks", { pollIntervalMs: 5000 });

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

  const state = sseState ?? fallbackState;
  const tasks = liveTasks.data ?? [];

  if (noSprint) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
        <p className="text-lg">{t('status.no_sprint')}</p>
        <p className="mt-2 text-sm">
          {t('status.run_start')}
        </p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        {t('status.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="status-page">
      <h1 className="text-2xl font-bold text-zinc-100">{t('status.title')}</h1>
      <SprintSummary state={state} tasks={tasks} />
    </div>
  );
}
