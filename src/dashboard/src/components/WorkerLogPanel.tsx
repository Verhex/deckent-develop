import { useCallback, useEffect, useRef, useState } from "react";
import { Pin, PinOff, ScrollText, X } from "lucide-react";
import { buildSseUrl } from "../lib/api";
import { useTranslation } from "../i18n/LanguageProvider";

const MAX_LOG_LINES = 500;

interface LogLine {
  id: string;
  line: string;
  ts: string;
}

type LogPanelStatus = "connecting" | "connected" | "disconnected";

interface WorkerLogPanelProps {
  taskId: string;
  onClose: () => void;
}

export function WorkerLogPanel({ taskId, onClose }: WorkerLogPanelProps) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<LogPanelStatus>("connecting");
  const [unavailable, setUnavailable] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(0);

  // Auto-scroll to bottom on new lines unless scroll is locked
  useEffect(() => {
    if (!scrollLocked && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, scrollLocked]);

  // SSE connection to /api/workers/:taskId/logs/stream
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect(): void {
      setStatus("connecting");
      const url = buildSseUrl(`/api/workers/${encodeURIComponent(taskId)}/logs/stream`);
      es = new EventSource(url);

      es.onopen = () => {
        setStatus("connected");
      };

      es.addEventListener("log_line", (event: Event) => {
        try {
          const ev = JSON.parse((event as MessageEvent).data) as {
            line?: string;
            ts?: string;
          };
          if (ev.line === undefined) return;
          const id = String(++lineIdRef.current);
          setLines((prev) => {
            const entry: LogLine = { id, line: ev.line!, ts: ev.ts ?? "" };
            return [...prev, entry].slice(-MAX_LOG_LINES);
          });
        } catch {
          // ignore malformed log_line
        }
      });

      es.addEventListener("log_unavailable", () => {
        setUnavailable(true);
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
  }, [taskId]);

  const toggleScrollLock = useCallback(() => {
    setScrollLocked((prev) => !prev);
  }, []);

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/80 flex flex-col"
      data-testid="worker-log-panel"
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
        <ScrollText className="h-4 w-4 text-brand-300 shrink-0" />
        <span className="text-sm font-semibold text-zinc-200 flex-1 truncate">
          {t("worker_log.panel_title")} — {taskId}
        </span>
        {status === "disconnected" && (
          <span className="text-xs text-yellow-400" data-testid="reconnecting-indicator">
            {t("worker_log.reconnecting")}
          </span>
        )}
        <button
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={toggleScrollLock}
          title={scrollLocked ? t("worker_log.scroll_unlock") : t("worker_log.scroll_lock")}
          aria-label={scrollLocked ? t("worker_log.scroll_unlock") : t("worker_log.scroll_lock")}
          data-testid="scroll-lock-toggle"
        >
          {scrollLocked ? (
            <Pin className="h-3.5 w-3.5" />
          ) : (
            <PinOff className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={onClose}
          title={t("worker_log.close")}
          aria-label={t("worker_log.close")}
          data-testid="log-panel-close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Log output area */}
      <div
        ref={containerRef}
        className="overflow-y-auto font-mono text-xs text-zinc-300 p-3 min-h-[200px] max-h-[400px]"
        data-testid="log-lines-container"
      >
        {unavailable ? (
          <p className="text-zinc-500 italic" data-testid="log-unavailable-message">
            {t("worker_log.empty_unavailable")}
          </p>
        ) : lines.length === 0 ? (
          <p className="text-zinc-600 italic" data-testid="log-empty-message">
            {t("worker_log.no_logs")}
          </p>
        ) : (
          <div className="space-y-0.5">
            {lines.map((entry) => (
              <div key={entry.id} className="leading-5 whitespace-pre-wrap break-all">
                {entry.line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
