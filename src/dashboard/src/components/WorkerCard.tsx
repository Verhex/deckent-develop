import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skull } from "lucide-react";
import type { AgentInfo } from "../types";
import { useTranslation } from "../i18n/LanguageProvider";

const STATUS_BORDER: Record<string, string> = {
  EXECUTING: "border-blue-500 animate-pulse",
  DONE: "border-green-500",
  NO_GO: "border-red-500",
  ERROR: "border-red-500",
  PAUSED: "border-yellow-500",
  IDLE: "border-zinc-700",
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

function relativeTime(isoDate?: string): string {
  if (!isoDate) return "—";
  const ms = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

interface WorkerCardProps {
  agent: AgentInfo;
  onClick: () => void;
  onKill: (id: string) => void;
}

export function WorkerCard({ agent, onClick, onKill }: WorkerCardProps) {
  const { t } = useTranslation();
  const borderClass = STATUS_BORDER[agent.status] ?? "border-zinc-700";
  const badgeVariant = STATUS_BADGE[agent.status] ?? "secondary";
  const statusIcon = STATUS_ICON[agent.status] ?? "○";
  const modelIcon = getModelIcon(agent.model);

  return (
    <div
      className={`rounded-lg border-2 ${borderClass} bg-zinc-900 p-4 cursor-pointer transition-all duration-300 hover:bg-zinc-800/80 shadow-lg shadow-zinc-950/50`}
      onClick={onClick}
    >
      {/* Header: Worker ID + Model badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-sm text-zinc-100">
          🤖 {agent.id}
        </span>
        <Badge variant="outline" className="text-xs">
          {modelIcon} {agent.model}
        </Badge>
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
        <span>❤️ {relativeTime(agent.lastHeartbeat)}</span>
      </div>

      {/* Current action (SSE live data) */}
      {agent.currentAction && (
        <p className="text-xs text-zinc-500 truncate mb-3 italic">
          {agent.currentAction}
        </p>
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
