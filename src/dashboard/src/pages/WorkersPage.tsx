import { useCallback, useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { WorkerCardGrid } from "../components/WorkerCard";
import { AgentDetail } from "../components/AgentDetail";
import { Sheet, SheetContent } from "../components/ui/sheet";
import { useSSE } from "../hooks/useSSE";
import { useLiveData } from "../lib/use-live-data";
import { useTranslation } from "../i18n/LanguageProvider";
import { postJson } from "../lib/api";
import type { DashboardState } from "../types";

/**
 * Workers page (Sprint 269 Task 269-002) — the paged form of DashboardPage's
 * worker grid: id, task, status, heartbeat age, provider/model (all rendered
 * by WorkerCard) plus the kill control posting to /api/kill/:id.
 *
 * Live data mirrors the DashboardPage pattern: SSE push via /api/events with
 * a stale-while-revalidate poll of /api/status when the stream is unavailable.
 */
export default function WorkersPage() {
  const { t } = useTranslation();
  const sseState = useSSE("/api/events");
  const { data: polledState, refresh } = useLiveData<DashboardState>("/api/status", {
    enabled: !sseState,
    pollIntervalMs: 5000,
  });
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const state = sseState ?? polledState;
  const agents = state?.agents ?? [];
  const executing = agents.filter((a) => a.status === "EXECUTING").length;

  const handleKill = useCallback(
    async (agentId: string) => {
      if (!confirm(`${t("dashboard.confirm_kill_worker")} ${agentId}?`)) return;
      try {
        await postJson(`/api/kill/${agentId}`);
        refresh();
      } catch {
        // error handled silently — next poll/SSE tick reconciles the grid
      }
    },
    [refresh, t],
  );

  return (
    <div className="space-y-6" data-testid="workers-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.03em] text-zinc-100">
            <Users className="h-6 w-6 text-brand-300" />
            {t("nav.workers")}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{t("workers.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" data-testid="workers-total">
            {t("dashboard.workers_label")}: {agents.length}
          </Badge>
          <Badge variant="info" data-testid="workers-executing">
            {t("dashboard.stat_executing")}: {executing}
          </Badge>
        </div>
      </div>

      {/* Live worker grid — WorkerCard renders id, task, status, heartbeat age,
          provider bar + model badge, and the kill button for EXECUTING workers. */}
      <WorkerCardGrid
        agents={agents}
        onSelect={(taskId) => setSelectedAgent(taskId)}
        onKill={handleKill}
      />

      {/* Agent Detail Sheet — same drill-down as DashboardPage */}
      <Sheet
        open={selectedAgent !== null}
        onOpenChange={(open) => { if (!open) setSelectedAgent(null); }}
      >
        <SheetContent side="right" className="w-[600px] sm:w-[700px]">
          {selectedAgent && (
            <AgentDetail
              taskId={selectedAgent}
              onClose={() => setSelectedAgent(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
