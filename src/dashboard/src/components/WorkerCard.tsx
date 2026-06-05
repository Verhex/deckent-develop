import { useEffect, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skull } from "lucide-react";
import type { AgentInfo } from "../types";
import { useTranslation } from "../i18n/LanguageProvider";
import type { TranslatorProp } from "../i18n/types";
import { buildSseUrl } from "../lib/api";

const STATUS_BORDER: Record<string, string> = {
  EXECUTING: "border border-l-4 border-blue-500 animate-pulse",
  DONE: "border-2 border-green-500",
  NO_GO: "border-2 border-red-500",
  ERROR: "border-2 border-red-500",
  PAUSED: "border-2 border-yellow-500",
  IDLE: "border-2 border-zinc-700",
};

const STATUS_BADGE: Record<string, "info" | "success" | "critical" | "secondary" | "warning"> = {
  EXECUTING: "info",
  DONE: "success",
  NO_GO: "critical",
  ERROR: "critical",
  PAUSED: "warning",
  IDLE: "secondary",
};

const STATUS_ICON: Record<string, string> = {
  EXECUTING: "▶",
  DONE: "✓",
  NO_GO: "✗",
  ERROR: "✗",
  PAUSED: "⏸",
  IDLE: "○",
};

const MODEL_ICON: Record<string, string> = {
  opus: "💎",
  sonnet: "⚡",
  haiku: "🍃",
};

const BACKEND_BADGE: Record<string, { label: string; className: string }> = {
  docker: { label: "Docker", className: "bg-blue-900/50 text-blue-300 border border-blue-700" },
  tmux: { label: "tmux", className: "bg-green-900/50 text-green-300 border border-green-700" },
  subprocess: { label: "subprocess", className: "bg-orange-900/50 text-orange-300 border border-orange-700" },
};

function getModelIcon(model: string): string {
  const lower = model.toLowerCase();
  for (const [key, icon] of Object.entries(MODEL_ICON)) {
    if (lower.includes(key)) return icon;
  }
  return "🤖";
}

function elapsed(startedAt?: string): string {
  if (!startedAt) return "—";
  const ms = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function relativeTime(isoDate: string | undefined, t: TranslatorProp): string {
  if (!isoDate) return "—";
  const ms = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return t('common.seconds_ago', { n: secs });
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t('common.minutes_ago', { n: mins });
  const hrs = Math.floor(mins / 60);
  return t('common.hours_ago', { n: hrs });
}

interface WorkerCardProps {
  agent: AgentInfo;
  onClick: () => void;
  onKill: (id: string) => void;
}

const LIVE_LOG_TAIL = 5;

/** Sprint 230 T-230-008: subscribe to /api/output-stream and surface the last
 *  few lines on the worker card. Returns an empty array until the SSE channel
 *  delivers data; cleans up on unmount. Defensively no-ops when EventSource
 *  is unavailable (server-side render, hardened test environments). */
function useLiveLogTail(taskId: string | undefined, enabled: boolean): string[] {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || !taskId) {
      setLines([]);
      return;
    }
    if (typeof EventSource === "undefined") return;

    const url = buildSseUrl(`/api/output-stream?taskId=${encodeURIComponent(taskId)}`);
    const es = new EventSource(url);

    function handle(event: MessageEvent): void {
      try {
        const payload = JSON.parse(event.data) as {
          lines?: Array<{ line?: string }>;
          snapshot?: { lines?: Array<{ line?: string }> };
        };
        const next = payload.snapshot?.lines ?? payload.lines ?? [];
        if (next.length === 0) return;
        setLines((prev) => {
          const merged = [...prev, ...next.map((e) => e.line ?? "").filter(Boolean)];
          return merged.slice(-LIVE_LOG_TAIL);
        });
      } catch {
        // ignore malformed payloads
      }
    }

    es.addEventListener("snapshot", handle as EventListener);
    es.addEventListener("output", handle as EventListener);

    return () => {
      es.close();
    };
  }, [taskId, enabled]);

  return lines;
}

export function WorkerCard({ agent, onClick, onKill }: WorkerCardProps) {
  const { t } = useTranslation();
  const borderClass = STATUS_BORDER[agent.status] ?? "border-zinc-700";
  const badgeVariant = STATUS_BADGE[agent.status] ?? "secondary";
  const statusIcon = STATUS_ICON[agent.status] ?? "○";
  const modelIcon = getModelIcon(agent.model);
  const liveLog = useLiveLogTail(
    agent.taskId,
    agent.status === "EXECUTING" && agent.backend === "docker",
  );

  return (
    <div
      className={`rounded-lg ${borderClass} bg-zinc-900 p-4 cursor-pointer transition-all duration-200 hover:bg-zinc-800/80 hover:scale-[1.02] shadow-lg shadow-zinc-950/50`}
      onClick={onClick}
    >
      {/* Header: Worker ID + Model badge + Backend badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-sm text-zinc-100">
          🤖 {agent.id}
        </span>
        <div className="flex items-center gap-1.5">
          {agent.backend && BACKEND_BADGE[agent.backend] && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${BACKEND_BADGE[agent.backend].className}`}>
              {BACKEND_BADGE[agent.backend].label}
            </span>
          )}
          <Badge variant="outline" className="text-xs">
            {modelIcon} {agent.model}
          </Badge>
        </div>
      </div>

      <div className="h-px bg-zinc-800 mb-3" />

      {/* Task title */}
      <div className="mb-2">
        <p className="text-sm text-zinc-200 truncate">
          📝 {agent.taskId ?? "—"}
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          {t("worker.agent")}: <span className="text-zinc-300">{agent.role}</span>
        </p>
      </div>

      <div className="h-px bg-zinc-800 mb-3" />

      {/* Elapsed + Heartbeat */}
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-3">
        <span>⏱ {elapsed(agent.spawnedAt)}</span>
        <span>❤️ {relativeTime(agent.lastHeartbeat, t)}</span>
      </div>

      {/* Current action (SSE live data) */}
      {agent.currentAction && (
        <p className="text-xs text-zinc-500 truncate mb-3 italic">
          {agent.currentAction}
        </p>
      )}

      {/* Live docker log tail (Sprint 230 T-230-008) */}
      {liveLog.length > 0 && (
        <pre
          data-testid="worker-live-log"
          className="text-[10px] text-zinc-400 bg-zinc-950/60 rounded p-2 mb-3 max-h-24 overflow-hidden font-mono whitespace-pre-wrap"
        >
          {liveLog.join("\n")}
        </pre>
      )}

      <div className="h-px bg-zinc-800 mb-3" />

      {/* Status bar + badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{statusIcon}</span>
          <Badge variant={badgeVariant}>{agent.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {agent.status === "EXECUTING" && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onKill(agent.id);
              }}
            >
              <Skull className="mr-1 h-3 w-3" />
              {t("dashboard.kill")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            {t("worker.detail")}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface WorkerCardGridProps {
  agents: AgentInfo[];
  onSelect: (taskId: string) => void;
  onKill: (id: string) => void;
}

export function WorkerCardGrid({ agents, onSelect, onKill }: WorkerCardGridProps) {
  const { t } = useTranslation();
  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-zinc-500">
          {t("worker.no_workers")}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map((agent) => (
        <WorkerCard
          key={agent.id}
          agent={agent}
          onClick={() => onSelect(agent.taskId ?? agent.id)}
          onKill={onKill}
        />
      ))}
    </div>
  );
}
