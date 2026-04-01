import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useTranslation } from "../i18n/LanguageProvider";
import type { DashboardState } from "../types";

const MAX_ENTRIES = 50;

interface ActivityEntry {
  id: string;
  timestamp: string;
  icon: string;
  message: string;
  detail?: string;
}

interface ActivityFeedProps {
  state: DashboardState | null;
  hasSprint: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ActivityFeed({ state, hasSprint }: ActivityFeedProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const prevAgentsRef = useRef<Map<string, string>>(new Map());
  const prevPhaseRef = useRef<string | undefined>(undefined);
  const prevDoneRef = useRef<number>(0);
  const prevAlertsRef = useRef<number>(0);

  useEffect(() => {
    if (!state) return;

    const now = new Date().toISOString();
    const newEntries: ActivityEntry[] = [];

    // Phase change
    const currentPhase = state.sprint?.phase;
    if (currentPhase && currentPhase !== prevPhaseRef.current) {
      if (prevPhaseRef.current !== undefined) {
        newEntries.push({
          id: makeId(),
          timestamp: now,
          icon: "🔄",
          message: t("activity.phase_changed"),
          detail: currentPhase,
        });
      }
      prevPhaseRef.current = currentPhase;
    }

    // Agent status changes
    const currentAgents = state.agents ?? [];
    for (const agent of currentAgents) {
      const prevStatus = prevAgentsRef.current.get(agent.id);
      if (prevStatus === undefined) {
        // New agent spawned
        newEntries.push({
          id: makeId(),
          timestamp: now,
          icon: "🟢",
          message: `${agent.id} ${t("activity.spawned")}`,
          detail: agent.model ? `[${agent.model}]` : undefined,
        });
      } else if (prevStatus !== agent.status) {
        if (agent.status === "DONE") {
          newEntries.push({
            id: makeId(),
            timestamp: now,
            icon: "✅",
            message: `${agent.id} ${t("activity.done")}`,
            detail: agent.taskId ?? undefined,
          });
        } else if (agent.status === "ERROR") {
          newEntries.push({
            id: makeId(),
            timestamp: now,
            icon: "❌",
            message: `${agent.id} ${t("activity.nogo")}`,
            detail: agent.taskId ?? undefined,
          });
        } else if (agent.status === "EXECUTING" && prevStatus !== "EXECUTING") {
          newEntries.push({
            id: makeId(),
            timestamp: now,
            icon: "📝",
            message: `${agent.id} ${t("activity.writing")}`,
            detail: agent.currentAction ?? undefined,
          });
        }
      } else if (
        agent.status === "EXECUTING" &&
        agent.currentAction &&
        agent.currentAction !== prevAgentsRef.current.get(`${agent.id}:action`)
      ) {
        newEntries.push({
          id: makeId(),
          timestamp: now,
          icon: "📝",
          message: `${agent.id} ${t("activity.writing")}`,
          detail: agent.currentAction,
        });
        prevAgentsRef.current.set(`${agent.id}:action`, agent.currentAction);
      }
      prevAgentsRef.current.set(agent.id, agent.status);
    }

    // New alerts
    const currentAlerts = state.alerts ?? [];
    const prevAlertCount = prevAlertsRef.current;
    if (currentAlerts.length > prevAlertCount) {
      for (let i = prevAlertCount; i < currentAlerts.length; i++) {
        const alert = currentAlerts[i];
        if (!alert) continue;
        const isStale =
          alert.message.toLowerCase().includes("stale") ||
          alert.message.toLowerCase().includes("heartbeat");
        newEntries.push({
          id: makeId(),
          timestamp: now,
          icon: isStale ? "⚠️" : "🔔",
          message: isStale ? t("activity.stale") : alert.message,
          detail: alert.source ?? undefined,
        });
      }
      prevAlertsRef.current = currentAlerts.length;
    }

    // Progress update
    const currentDone = state.progress?.done ?? 0;
    if (currentDone > prevDoneRef.current) {
      prevDoneRef.current = currentDone;
    }

    if (newEntries.length > 0) {
      setEntries((prev) => {
        const combined = [...prev, ...newEntries];
        return combined.slice(-MAX_ENTRIES);
      });
    }
  }, [state, t]);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <Card className="border-zinc-800 bg-zinc-900 flex flex-col h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-zinc-100 text-sm font-semibold flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          {t("activity.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-3 min-h-0 max-h-80">
        {!hasSprint && entries.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center pt-4">
            {t("activity.no_activity")}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center pt-4">
            {t("activity.waiting")}
          </p>
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 text-xs">
                <span className="text-zinc-500 font-mono shrink-0 mt-0.5">
                  {formatTime(entry.timestamp)}
                </span>
                <span className="shrink-0">{entry.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-zinc-300">{entry.message}</span>
                  {entry.detail && (
                    <span className="block text-zinc-500 truncate">
                      {entry.detail}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div ref={bottomRef} />
      </CardContent>
    </Card>
  );
}
