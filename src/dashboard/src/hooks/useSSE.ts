import { useEffect, useRef, useState } from "react";
import type { DashboardState, AgentInfo } from "../types";
import { buildSseUrl } from "../lib/api";
import type { LiveActivityEntry } from "../lib/use-live-data.js";
import { MAX_LIVE_ACTIVITY } from "../lib/use-live-data.js";

export type SSEStatus = "connecting" | "connected" | "disconnected";

export interface SSEResult {
  data: DashboardState | null;
  status: SSEStatus;
}

export interface SSEResultExtended extends SSEResult {
  /** Ring buffer of deckent_event / worker_heartbeat / worker_done entries (max MAX_LIVE_ACTIVITY). */
  liveEvents: LiveActivityEntry[];
}

/** Backward-compat: returns merged DashboardState only. */
export function useSSE(url = "/api/events"): DashboardState | null {
  return useSSEWithStatus(url).data;
}

/** Backward-compat: returns merged state + SSE connection status. */
export function useSSEWithStatus(url = "/api/events"): SSEResult {
  const { data, status } = useSSEWithLiveEvents(url);
  return { data, status };
}

/**
 * Full SSE hook for DASH-RT-1.
 *
 * Subscribes to the /api/events SSE channel and handles both:
 *   - Default (unnamed) `data:` messages → snapshot DashboardState (backward compat)
 *   - Named typed events from the live-event bridge (Task 284-001):
 *       worker_heartbeat → patches matching agent's status/currentAction immediately
 *       worker_done      → marks matching agent DONE immediately
 *       deckent_event    → appends to the liveEvents ring buffer
 *
 * Conflict rule: if a typed event's `ts` > agent's `lastHeartbeat`, event wins over snapshot.
 */
export function useSSEWithLiveEvents(url = "/api/events"): SSEResultExtended {
  const [data, setData] = useState<DashboardState | null>(null);
  const [status, setStatus] = useState<SSEStatus>("connecting");
  const [liveEvents, setLiveEvents] = useState<LiveActivityEntry[]>([]);

  // Live agent overrides keyed by taskId: hold the most recent typed-event values.
  const liveAgentsRef = useRef<Map<string, { status?: string; currentAction?: string; ts: string }>>(
    new Map(),
  );

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    /** Apply stored live-agent overrides onto a snapshot agents array.
     *  Conflict rule: override.ts must be > agent.lastHeartbeat to win. */
    function mergeAgents(agents: AgentInfo[]): AgentInfo[] {
      if (liveAgentsRef.current.size === 0) return agents;
      return agents.map((agent) => {
        const key = agent.taskId ?? agent.id;
        const override = liveAgentsRef.current.get(key);
        if (!override) return agent;
        const snapshotTs = agent.lastHeartbeat ?? "";
        // Snapshot is newer → discard the stale override
        if (snapshotTs > override.ts) {
          liveAgentsRef.current.delete(key);
          return agent;
        }
        return {
          ...agent,
          ...(override.status !== undefined && { status: override.status }),
          ...(override.currentAction !== undefined && { currentAction: override.currentAction }),
          lastHeartbeat: override.ts,
        };
      });
    }

    function makeEntryId(): string {
      return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function connect(): void {
      setStatus("connecting");
      es = new EventSource(buildSseUrl(url));

      es.onopen = () => {
        setStatus("connected");
      };

      // Default (unnamed) message → snapshot DashboardState; merge live overrides onto it.
      es.onmessage = (event: MessageEvent) => {
        try {
          const snapshot = JSON.parse(event.data) as DashboardState;
          setData({
            ...snapshot,
            agents: mergeAgents(snapshot.agents ?? []),
          });
          setStatus("connected");
        } catch {
          // ignore malformed data
        }
      };

      // worker_heartbeat: update agent status/currentAction immediately without waiting for snapshot.
      es.addEventListener("worker_heartbeat", (event: Event) => {
        try {
          const ev = JSON.parse((event as MessageEvent).data) as {
            taskId?: string;
            status?: string;
            currentAction?: string;
            ts?: string;
          };
          if (!ev.taskId) return;
          const ts = ev.ts ?? new Date().toISOString();
          liveAgentsRef.current.set(ev.taskId, {
            status: ev.status,
            currentAction: ev.currentAction,
            ts,
          });
          setData((prev) => {
            if (!prev) return prev;
            const agents = prev.agents.map((a) => {
              if (a.taskId !== ev.taskId && a.id !== ev.taskId) return a;
              const snapshotTs = a.lastHeartbeat ?? "";
              if (snapshotTs > ts) return a;
              return {
                ...a,
                ...(ev.status !== undefined && { status: ev.status }),
                ...(ev.currentAction !== undefined && { currentAction: ev.currentAction }),
                lastHeartbeat: ts,
              };
            });
            return { ...prev, agents };
          });
          setLiveEvents((prev) => {
            const entry: LiveActivityEntry = { id: makeEntryId(), ts, type: "worker_heartbeat", payload: ev };
            return [...prev, entry].slice(-MAX_LIVE_ACTIVITY);
          });
        } catch {
          // ignore malformed worker_heartbeat
        }
      });

      // worker_done: mark agent DONE immediately.
      es.addEventListener("worker_done", (event: Event) => {
        try {
          const ev = JSON.parse((event as MessageEvent).data) as {
            taskId?: string;
            ts?: string;
          };
          if (!ev.taskId) return;
          const ts = ev.ts ?? new Date().toISOString();
          liveAgentsRef.current.set(ev.taskId, { status: "DONE", ts });
          setData((prev) => {
            if (!prev) return prev;
            const agents = prev.agents.map((a) => {
              if (a.taskId !== ev.taskId && a.id !== ev.taskId) return a;
              const snapshotTs = a.lastHeartbeat ?? "";
              if (snapshotTs > ts) return a;
              return { ...a, status: "DONE", lastHeartbeat: ts };
            });
            return { ...prev, agents };
          });
          setLiveEvents((prev) => {
            const entry: LiveActivityEntry = { id: makeEntryId(), ts, type: "worker_done", payload: ev };
            return [...prev, entry].slice(-MAX_LIVE_ACTIVITY);
          });
        } catch {
          // ignore malformed worker_done
        }
      });

      // deckent_event: append to live activity ring buffer.
      es.addEventListener("deckent_event", (event: Event) => {
        try {
          const ev = JSON.parse((event as MessageEvent).data) as {
            ts?: string;
            event?: unknown;
          };
          const ts = ev.ts ?? new Date().toISOString();
          const entry: LiveActivityEntry = {
            id: makeEntryId(),
            ts,
            type: "deckent_event",
            payload: ev.event,
          };
          setLiveEvents((prev) => [...prev, entry].slice(-MAX_LIVE_ACTIVITY));
        } catch {
          // ignore malformed deckent_event
        }
      });

      es.onerror = () => {
        es?.close();
        setStatus("disconnected");
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [url]);

  return { data, status, liveEvents };
}
