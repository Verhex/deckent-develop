import { useCallback, useState } from "react";
import { Users, MessageSquare, ArrowRightLeft, Cpu } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { WorkerCardGrid } from "../components/WorkerCard";
import { AgentDetail } from "../components/AgentDetail";
import { WorkerLogPanel } from "../components/WorkerLogPanel";
import { Sheet, SheetContent } from "../components/ui/sheet";
import { useSSE } from "../hooks/useSSE";
import { useLiveData } from "../lib/use-live-data";
import { useTranslation } from "../i18n/LanguageProvider";
import { postJson } from "../lib/api";
import EmptyState from "../components/EmptyState";
import type { DashboardState, AgentInfo } from "../types";

// ─── Worker Comms Panel ─────────────────────────────────────────────────────

interface WorkerCommsPanelProps {
  agents: AgentInfo[];
}

/**
 * Worker Comms panel (Sprint 279 Task 279-009):
 * Shows shared-context key count (proxied from DONE workers that may have
 * written to SharedMemory) and recent handoff entries per DONE worker.
 */
function WorkerCommsPanel({ agents }: WorkerCommsPanelProps) {
  const { t } = useTranslation();
  const doneAgents = agents.filter((a) => a.status === "DONE");
  const sharedCount = doneAgents.length;

  if (agents.length === 0) {
    return (
      <div
        className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
        data-testid="worker-comms-panel"
      >
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-brand-300" />
          <h2 className="text-sm font-semibold text-zinc-200">Worker Comms</h2>
        </div>
        <div data-testid="worker-comms-empty">
          <EmptyState
            icon={ArrowRightLeft}
            title={t('workers.comms_no_handoffs_title')}
            description={t('workers.comms_no_handoffs_desc')}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3"
      data-testid="worker-comms-panel"
    >
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-brand-300" />
        <h2 className="text-sm font-semibold text-zinc-200">Worker Comms</h2>
        <span
          className="ml-auto text-xs text-zinc-500"
          data-testid="worker-comms-shared-count"
        >
          {t(sharedCount === 1 ? 'workers.comms_completed_count_one' : 'workers.comms_completed_count_other', { n: sharedCount })}
        </span>
      </div>

      {doneAgents.length === 0 ? (
        <p className="text-xs text-zinc-500 py-1">{t('workers.comms_no_completed')}</p>
      ) : (
        <ul className="space-y-1" data-testid="worker-comms-handoffs">
          {doneAgents.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 py-1"
              data-testid={`handoff-${a.id}`}
            >
              <ArrowRightLeft className="h-3 w-3 shrink-0 text-zinc-500" />
              <span className="text-xs text-zinc-400 truncate">{a.taskId ?? a.id}</span>
              <Badge variant="outline" className="ml-auto shrink-0 text-xs">{a.role}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Worker Resource Summary ─────────────────────────────────────────────────

/**
 * Resource summary row: shows backend distribution for active workers.
 * Hidden when there are no agents.
 */
function WorkerResourceSummary({ agents }: WorkerCommsPanelProps) {
  if (agents.length === 0) return null;

  const byBackend: Record<string, number> = {};
  for (const a of agents) {
    const b = a.backend ?? "unknown";
    byBackend[b] = (byBackend[b] ?? 0) + 1;
  }

  return (
    <div
      className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap px-1"
      data-testid="worker-resource-summary"
    >
      <Cpu className="h-3 w-3 shrink-0" />
      {Object.entries(byBackend).map(([backend, count]) => (
        <span key={backend}>
          {count} {backend}
        </span>
      ))}
    </div>
  );
}

// ─── Workers Page ────────────────────────────────────────────────────────────

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
  const [selectedLogTaskId, setSelectedLogTaskId] = useState<string | null>(null);

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
        onSelect={(taskId) => {
          setSelectedAgent(taskId);
          setSelectedLogTaskId(taskId);
        }}
        onKill={handleKill}
      />

      {/* Worker Log Panel — live SSE log stream for the selected worker */}
      {selectedLogTaskId !== null && (
        <WorkerLogPanel
          taskId={selectedLogTaskId}
          onClose={() => setSelectedLogTaskId(null)}
        />
      )}

      {/* Worker Comms panel — shared-context key count + recent handoffs */}
      <WorkerCommsPanel agents={agents} />

      {/* Resource summary row — backend distribution */}
      <WorkerResourceSummary agents={agents} />

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
