// Worker Output Contract — live structured log viewer (spec §2.3 / Task 326-011)
//
// Consumes the SSE endpoint that serves handleLogStream events:
//   log-backfill  →  full event history on connect   (LogStreamEvent)
//   log           →  live appended events             (LogStreamEvent)
//   done          →  server closed the stream
//
// Each event is rendered in seq-order with type-specific styling.
// Backpressure: capped at MAX_EVENTS; oldest events evicted when exceeded.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Loader2,
  Pin,
  PinOff,
  ScrollText,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { buildSseUrl } from "../lib/api";
import { cn } from "../lib/utils";

// ─── Local types (mirrors src/core/log-event.ts — no cross-bundle import) ──

type LogEventType =
  | "turn"
  | "tool_use"
  | "tool_result"
  | "text"
  | "stderr"
  | "usage"
  | "lifecycle";

interface LogEvent {
  ts: string;
  seq: number;
  type: LogEventType;
  content: unknown;
}

interface LogStreamEvent {
  taskId: string;
  events: readonly LogEvent[];
  lastSeq: number;
}

// ─── Label injection (i18n-ready; caller passes t(key) strings) ────────────

export interface WorkerLogViewerLabels {
  title: string;
  connecting: string;
  disconnected: string;
  done: string;
  empty: string;
  scrollLock: string;
  scrollUnlock: string;
  close: string;
  eventTypeLabels: Record<LogEventType, string>;
}

const DEFAULT_LABELS: WorkerLogViewerLabels = {
  title: "Worker Log",
  connecting: "Connecting...",
  disconnected: "Reconnecting...",
  done: "Stream closed",
  empty: "No log events yet.",
  scrollLock: "Lock scroll",
  scrollUnlock: "Unlock scroll",
  close: "Close log viewer",
  eventTypeLabels: {
    turn: "Turn",
    tool_use: "Tool",
    tool_result: "Result",
    text: "Text",
    stderr: "Stderr",
    usage: "Usage",
    lifecycle: "Lifecycle",
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_EVENTS = 1000;
const RECONNECT_DELAY_MS = 3000;

type ConnectionStatus = "connecting" | "connected" | "disconnected";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractToolName(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  if (typeof c.name === "string") return c.name;
  // Claude SDK envelope: { message: { content: [{ type: 'tool_use', name, ... }] } }
  if (c.message && typeof c.message === "object") {
    const msg = c.message as Record<string, unknown>;
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          block &&
          typeof block === "object" &&
          (block as Record<string, unknown>).type === "tool_use" &&
          typeof (block as Record<string, unknown>).name === "string"
        ) {
          return (block as Record<string, unknown>).name as string;
        }
      }
    }
  }
  return null;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  const c = content as Record<string, unknown>;
  // Plain text chunk
  if (typeof c.response === "string") return c.response;
  // Claude content_block_delta
  if (c.delta && typeof c.delta === "object") {
    const d = c.delta as Record<string, unknown>;
    if (typeof d.text === "string") return d.text;
  }
  // OpenAI-compat choices[].delta.content
  if (Array.isArray(c.choices) && c.choices.length > 0) {
    const choice = c.choices[0];
    if (choice && typeof choice === "object") {
      const ch = choice as Record<string, unknown>;
      const delta = (ch.delta ?? ch.message) as Record<string, unknown> | undefined;
      if (delta && typeof delta.content === "string") return delta.content;
    }
  }
  // Ollama chat
  if (c.message && typeof c.message === "object") {
    const msg = c.message as Record<string, unknown>;
    if (typeof msg.content === "string") return msg.content;
  }
  return "";
}

function extractUsageSummary(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as Record<string, unknown>;
  // Anthropic SDK result event
  if (c.usage && typeof c.usage === "object") {
    const u = c.usage as Record<string, unknown>;
    const input = u.input_tokens ?? u.inputTokens ?? u.prompt_tokens ?? 0;
    const output = u.output_tokens ?? u.outputTokens ?? u.completion_tokens ?? 0;
    return `in:${input} out:${output}`;
  }
  // Ollama
  const prompt = (c as Record<string, unknown>).prompt_eval_count;
  const eval_ = (c as Record<string, unknown>).eval_count;
  if (typeof prompt === "number" || typeof eval_ === "number") {
    return `in:${prompt ?? 0} out:${eval_ ?? 0}`;
  }
  return "";
}

// ─── Event row renderers ──────────────────────────────────────────────────────

interface EventRowProps {
  event: LogEvent;
  labels: WorkerLogViewerLabels;
}

function TurnRow({ event, labels }: EventRowProps) {
  return (
    <div
      className="flex items-center gap-1.5 py-1 px-2 rounded bg-brand-bg/30 border border-brand-800/40"
      data-testid="log-event-turn"
      data-seq={event.seq}
    >
      <ChevronRight className="h-3.5 w-3.5 text-brand-400 shrink-0" aria-hidden />
      <span className="text-xs font-semibold text-brand-300 uppercase tracking-wider">
        {labels.eventTypeLabels.turn}
      </span>
      <span className="text-xs text-zinc-500 ml-auto">{event.ts.slice(11, 19)}</span>
    </div>
  );
}

function ToolUseRow({ event, labels }: EventRowProps) {
  const name = extractToolName(event.content);
  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-2 rounded bg-amber-950/30 border border-amber-800/30"
      data-testid="log-event-tool_use"
      data-seq={event.seq}
    >
      <Wrench className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden />
      <span className="text-xs text-amber-300 font-medium">
        {labels.eventTypeLabels.tool_use}
        {name ? `: ${name}` : ""}
      </span>
      <span className="text-xs text-zinc-600 ml-auto">{event.ts.slice(11, 19)}</span>
    </div>
  );
}

function ToolResultRow({ event, labels }: EventRowProps) {
  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-2 rounded bg-green-950/20 border border-green-900/30"
      data-testid="log-event-tool_result"
      data-seq={event.seq}
    >
      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" aria-hidden />
      <span className="text-xs text-green-400">{labels.eventTypeLabels.tool_result}</span>
      <span className="text-xs text-zinc-600 ml-auto">{event.ts.slice(11, 19)}</span>
    </div>
  );
}

function TextRow({ event }: EventRowProps) {
  const text = extractText(event.content);
  if (!text) return null;
  return (
    <div
      className="font-mono text-xs text-zinc-300 leading-5 whitespace-pre-wrap break-all pl-2"
      data-testid="log-event-text"
      data-seq={event.seq}
    >
      {text}
    </div>
  );
}

function StderrRow({ event }: EventRowProps) {
  const text = extractText(event.content);
  return (
    <div
      className="flex items-start gap-1.5 py-0.5 px-2 rounded bg-red-950/20 border border-red-900/30"
      data-testid="log-event-stderr"
      data-seq={event.seq}
    >
      <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" aria-hidden />
      <span className="font-mono text-xs text-red-300 whitespace-pre-wrap break-all">
        {text || JSON.stringify(event.content)}
      </span>
    </div>
  );
}

function UsageRow({ event, labels }: EventRowProps) {
  const summary = extractUsageSummary(event.content);
  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-2 text-zinc-600"
      data-testid="log-event-usage"
      data-seq={event.seq}
    >
      <Zap className="h-3 w-3 shrink-0" aria-hidden />
      <span className="text-xs">{labels.eventTypeLabels.usage}</span>
      {summary && <span className="font-mono text-xs ml-1">{summary}</span>}
    </div>
  );
}

function LifecycleRow({ event, labels }: EventRowProps) {
  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-2 text-zinc-700 italic"
      data-testid="log-event-lifecycle"
      data-seq={event.seq}
    >
      <Cpu className="h-3 w-3 shrink-0" aria-hidden />
      <span className="text-xs">{labels.eventTypeLabels.lifecycle}</span>
    </div>
  );
}

function LogEventRow({ event, labels }: EventRowProps) {
  switch (event.type) {
    case "turn":
      return <TurnRow event={event} labels={labels} />;
    case "tool_use":
      return <ToolUseRow event={event} labels={labels} />;
    case "tool_result":
      return <ToolResultRow event={event} labels={labels} />;
    case "text":
      return <TextRow event={event} labels={labels} />;
    case "stderr":
      return <StderrRow event={event} labels={labels} />;
    case "usage":
      return <UsageRow event={event} labels={labels} />;
    case "lifecycle":
      return <LifecycleRow event={event} labels={labels} />;
    default:
      return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface WorkerLogViewerProps {
  /** Task ID to stream logs for. */
  taskId: string;
  /** SSE endpoint URL — defaults to /api/output-stream (handleLogStream route). */
  streamUrl?: string;
  /** Called when the close button is pressed (if provided, shows close button). */
  onClose?: () => void;
  /** Label overrides for i18n. Caller should pass t(key) strings. */
  labels?: Partial<WorkerLogViewerLabels>;
  className?: string;
}

export function WorkerLogViewer({
  taskId,
  streamUrl,
  onClose,
  labels: labelOverrides,
  className,
}: WorkerLogViewerProps) {
  const labels: WorkerLogViewerLabels = { ...DEFAULT_LABELS, ...labelOverrides };

  const [events, setEvents] = useState<LogEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [streamDone, setStreamDone] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastSeqRef = useRef<number>(-1);

  // Auto-scroll to bottom on new events unless locked.
  useEffect(() => {
    if (!scrollLocked && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, scrollLocked]);

  // SSE connection with reconnect.
  useEffect(() => {
    const base = streamUrl ?? `/api/output-stream?taskId=${encodeURIComponent(taskId)}`;
    const url = buildSseUrl(base);

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    function connect(): void {
      if (!mounted) return;
      setStatus("connecting");
      setStreamDone(false);
      es = new EventSource(url);

      es.onopen = () => {
        if (mounted) setStatus("connected");
      };

      es.addEventListener("log-backfill", (ev: Event) => {
        if (!mounted) return;
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as LogStreamEvent;
          const sorted = [...payload.events].sort((a, b) => a.seq - b.seq);
          lastSeqRef.current = payload.lastSeq;
          setEvents(sorted.slice(-MAX_EVENTS));
        } catch {
          // ignore malformed backfill
        }
      });

      es.addEventListener("log", (ev: Event) => {
        if (!mounted) return;
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as LogStreamEvent;
          // Only append events strictly newer than last seen seq.
          const fresh = payload.events.filter((e) => e.seq > lastSeqRef.current);
          if (fresh.length === 0) return;
          const sorted = fresh.sort((a, b) => a.seq - b.seq);
          lastSeqRef.current = payload.lastSeq;
          setEvents((prev) =>
            [...prev, ...sorted].slice(-MAX_EVENTS),
          );
        } catch {
          // ignore malformed live event
        }
      });

      es.addEventListener("done", () => {
        if (mounted) {
          setStreamDone(true);
          setStatus("disconnected");
        }
        es?.close();
      });

      es.onerror = () => {
        es?.close();
        if (mounted) {
          setStatus("disconnected");
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      mounted = false;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [taskId, streamUrl]);

  const toggleScrollLock = useCallback(() => {
    setScrollLocked((prev) => !prev);
  }, []);

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-900/80 flex flex-col",
        className,
      )}
      data-testid="worker-log-viewer"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
        <ScrollText className="h-4 w-4 text-brand-300 shrink-0" aria-hidden />
        <span className="text-sm font-semibold text-zinc-200 flex-1 truncate">
          {labels.title} — {taskId}
        </span>

        {status === "connecting" && !streamDone && (
          <span
            className="flex items-center gap-1 text-xs text-zinc-500"
            data-testid="status-connecting"
          >
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            {labels.connecting}
          </span>
        )}
        {status === "disconnected" && !streamDone && (
          <span className="text-xs text-yellow-400" data-testid="status-disconnected">
            {labels.disconnected}
          </span>
        )}
        {streamDone && (
          <span className="text-xs text-zinc-500" data-testid="status-done">
            {labels.done}
          </span>
        )}

        <button
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={toggleScrollLock}
          title={scrollLocked ? labels.scrollUnlock : labels.scrollLock}
          aria-label={scrollLocked ? labels.scrollUnlock : labels.scrollLock}
          data-testid="scroll-lock-toggle"
        >
          {scrollLocked ? (
            <Pin className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <PinOff className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>

        {onClose && (
          <button
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            onClick={onClose}
            title={labels.close}
            aria-label={labels.close}
            data-testid="log-viewer-close"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* Event list */}
      <div
        ref={containerRef}
        className="overflow-y-auto min-h-[200px] max-h-[500px] p-2 space-y-0.5"
        data-testid="log-events-container"
      >
        {events.length === 0 ? (
          <p
            className="text-xs text-zinc-600 italic p-2"
            data-testid="log-empty-message"
          >
            {labels.empty}
          </p>
        ) : (
          events.map((ev) => (
            <LogEventRow key={ev.seq} event={ev} labels={labels} />
          ))
        )}
      </div>
    </div>
  );
}
