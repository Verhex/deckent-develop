import { useEffect, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Gem, Zap, Leaf, Bot, Cpu, FileCode2, Activity, Clock, type LucideIcon } from "lucide-react";
import type { AgentInfo } from "../types";
import { useTranslation } from "../i18n/LanguageProvider";
import type { TranslatorProp } from "../i18n/types";
import { buildSseUrl } from "../lib/api";

// 2px top status bar (handoff §3): EXECUTING teal gradient, DONE green, etc.
const STATUS_BAR: Record<string, string> = {
  EXECUTING: "bg-gradient-to-r from-brand-600 to-brand-400 animate-pulse",
  DONE: "bg-green-500",
  NO_GO: "bg-red-500",
  ERROR: "bg-red-500",
  PAUSED: "bg-yellow-500",
  IDLE: "bg-zinc-600",
};

const STATUS_BADGE: Record<string, "info" | "success" | "critical" | "secondary" | "warning"> = {
  EXECUTING: "info",
  DONE: "success",
  NO_GO: "critical",
  ERROR: "critical",
  PAUSED: "warning",
  IDLE: "secondary",
};

const STATUS_DOT_COLOR: Record<string, string> = {
  EXECUTING: "bg-brand-400 animate-pulse",
  DONE: "bg-green-500",
  NO_GO: "bg-red-500",
  ERROR: "bg-red-500",
  PAUSED: "bg-yellow-500",
  IDLE: "bg-zinc-600",
};

const MODEL_ICON: Record<string, LucideIcon> = {
  opus: Gem,
  sonnet: Zap,
  haiku: Leaf,
};

const BACKEND_BADGE: Record<string, { label: string; className: string }> = {
  docker: { label: "Docker", className: "bg-brand-bg/50 text-brand-300 border border-brand-700" },
  tmux: { label: "tmux", className: "bg-green-900/50 text-green-300 border border-green-700" },
  subprocess: { label: "subprocess", className: "bg-orange-900/50 text-orange-300 border border-orange-700" },
};

function getModelIcon(model: string): LucideIcon {
  const lower = model.toLowerCase();
  for (const [key, Icon] of Object.entries(MODEL_ICON)) {
    if (lower.includes(key)) return Icon;
  }
  return Bot;
}

/** Derive the model tier (gold label) from the model id — client-side, no API
 *  field (AgentInfo carries only `model`). Mirrors model-registry tiers. */
type ModelTier = "premium" | "standard" | "economy";
function getModelTier(model: string): ModelTier {
  const m = model.toLowerCase();
  if (m.includes("opus") || m.includes("o3") || m.includes("2.5-pro") || m.includes("gemini-3") || /gpt-5(?!-mini)/.test(m)) {
    return "premium";
  }
  if (m.includes("sonnet") || m.includes("o4-mini") || m.includes("2.5-flash") || /gpt-4\.1(?!-mini)/.test(m)) {
    return "standard";
  }
  return "economy";
}

/** Derive provider + brand color from the model id (handoff provider colors). */
const PROVIDER_META = {
  claude: { label: "Claude", color: "#D97757" },
  codex: { label: "Codex", color: "#10A37F" },
  gemini: { label: "Gemini", color: "#4285F4" },
} as const;
function getProvider(model: string): { label: string; color: string } {
  const m = model.toLowerCase();
  if (m.includes("gpt") || m.includes("o3") || m.includes("o4")) return PROVIDER_META.codex;
  if (m.includes("gemini")) return PROVIDER_META.gemini;
  return PROVIDER_META.claude;
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

export function WorkerCard({ agent, onClick }: WorkerCardProps) {
  const { t } = useTranslation();
  const statusBar = STATUS_BAR[agent.status] ?? "bg-zinc-600";
  const badgeVariant = STATUS_BADGE[agent.status] ?? "secondary";
  const statusDot = STATUS_DOT_COLOR[agent.status] ?? "bg-zinc-600";
  const ModelIcon = getModelIcon(agent.model);
  const tier = getModelTier(agent.model);
  const provider = getProvider(agent.model);
  const liveLog = useLiveLogTail(
    agent.taskId,
    agent.status === "EXECUTING" && agent.backend === "docker",
  );

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 p-4 cursor-pointer transition-all duration-200 hover:bg-zinc-800/80 hover:-translate-y-0.5 shadow-lg shadow-zinc-950/50"
      onClick={onClick}
    >
      {/* 2px top status bar (handoff §3) */}
      <div className={`absolute inset-x-0 top-0 h-0.5 ${statusBar}`} data-testid="worker-status-bar" />

      {/* Header: Worker ID + provider bar + tier + Model/Backend badges */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-sm text-zinc-100 flex items-center gap-1">
          <Cpu className="h-3.5 w-3.5 text-zinc-400" /> {agent.id}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Provider color bar (3px) — Claude clay / Codex green / Gemini blue */}
          <span
            className="inline-block h-3.5 w-[3px] rounded-full"
            style={{ backgroundColor: provider.color }}
            title={provider.label}
            data-testid="worker-provider-bar"
          />
          {agent.backend && BACKEND_BADGE[agent.backend] && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${BACKEND_BADGE[agent.backend].className}`}>
              {BACKEND_BADGE[agent.backend].label}
            </span>
          )}
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <ModelIcon className="h-3.5 w-3.5" /> {agent.model}
          </Badge>
          {/* Tier label — gold (handoff signature) */}
          <span className="font-mono text-[10px] uppercase tracking-wide text-gold" data-testid="worker-tier">
            {tier}
          </span>
        </div>
      </div>

      <div className="h-px bg-zinc-800 mb-3" />

      {/* Task title */}
      <div className="mb-2">
        <p className="text-sm text-zinc-200 truncate flex items-center gap-1">
          <FileCode2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" /> {agent.taskId ?? "—"}
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          {t("worker.agent")}: <span className="text-zinc-300">{agent.role}</span>
        </p>
      </div>

      <div className="h-px bg-zinc-800 mb-3" />

      {/* Elapsed + Heartbeat */}
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-3">
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {elapsed(agent.spawnedAt)}</span>
        <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-red-400" /> {relativeTime(agent.lastHeartbeat, t)}</span>
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
          <span className={`inline-block h-2 w-2 rounded-full ${statusDot}`} data-testid="worker-status-dot" />
          <Badge variant={badgeVariant}>{agent.status}</Badge>
        </div>
        {/* SURF-7 (ADR-G-033): the per-worker Kill button is gone — the
            dashboard observes; `deckent kill <worker>` is the control path. */}
        <div className="flex items-center gap-2">
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
}

export function WorkerCardGrid({ agents, onSelect }: WorkerCardGridProps) {
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
        />
      ))}
    </div>
  );
}
