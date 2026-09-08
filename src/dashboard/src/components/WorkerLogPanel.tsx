import { useCallback, useEffect, useRef, useState } from "react";
import { Pin, PinOff, ScrollText, X } from "lucide-react";
import { useExactTaskOutput } from "../lib/useExactTaskOutput";
import { useTranslation } from "../i18n/LanguageProvider";

const MAX_LOG_LINES = 500;

interface WorkerLogPanelProps {
  taskId: string;
  onClose?: () => void;
  labels?: Partial<{ title: string; close: string; empty: string; scrollLock: string; scrollUnlock: string }>;
  className?: string;
  testId?: string;
}

export function WorkerLogPanel({ taskId, onClose, labels, className, testId }: WorkerLogPanelProps) {
  const { t } = useTranslation();
  const [attemptInput, setAttemptInput] = useState("");
  const [selectedAttempt, setSelectedAttempt] = useState("");
  const { lines, status, identity, omittedLines, retry } = useExactTaskOutput(taskId, true, MAX_LOG_LINES, selectedAttempt);
  useEffect(() => { setAttemptInput(""); setSelectedAttempt(""); }, [taskId]);
  const [scrollLocked, setScrollLocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new lines unless scroll is locked
  useEffect(() => {
    if (!scrollLocked && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, scrollLocked]);

  const toggleScrollLock = useCallback(() => {
    setScrollLocked((prev) => !prev);
  }, []);

  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-900/80 flex flex-col ${className ?? ""}`}
      data-testid={testId ?? "worker-log-panel"}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
        <ScrollText className="h-4 w-4 text-brand-300 shrink-0" />
        <span className="text-sm font-semibold text-zinc-200 flex-1 truncate">
          {labels?.title ?? t("worker_log.panel_title")} — {taskId}
        </span>
        <span role="status" className="text-xs text-zinc-400" data-testid="output-view-status">
          {t(`worker_log.state.${status}`)}
        </span>
        <button type="button" onClick={retry} className="text-xs text-zinc-400">
          {t("worker_log.retry_view")}
        </button>
        <button
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={toggleScrollLock}
          title={scrollLocked ? (labels?.scrollUnlock ?? t("worker_log.scroll_unlock")) : (labels?.scrollLock ?? t("worker_log.scroll_lock"))}
          aria-label={scrollLocked ? (labels?.scrollUnlock ?? t("worker_log.scroll_unlock")) : (labels?.scrollLock ?? t("worker_log.scroll_lock"))}
          data-testid="scroll-lock-toggle"
        >
          {scrollLocked ? (
            <Pin className="h-3.5 w-3.5" />
          ) : (
            <PinOff className="h-3.5 w-3.5" />
          )}
        </button>
        {onClose && <button
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={onClose}
          title={labels?.close ?? t("worker_log.close")}
          aria-label={labels?.close ?? t("worker_log.close")}
          data-testid="log-panel-close"
        >
          <X className="h-3.5 w-3.5" />
        </button>}
      </div>

      <form className="px-3 py-1 flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        setSelectedAttempt(attemptInput.trim());
      }}>
        <label className="text-xs text-zinc-400 flex-1">
          {t("worker_log.attempt_selector")}
          <input value={attemptInput} onChange={(event) => setAttemptInput(event.target.value)}
            className="w-full bg-transparent border border-zinc-700 rounded px-1" maxLength={16_384} />
        </label>
        <button type="submit" className="text-xs text-zinc-400">{t("worker_log.select_attempt")}</button>
      </form>

      {identity && <p className="text-xs text-zinc-400 px-3 break-all">
        {t("worker_log.attempt")} {identity.attemptId} / {identity.generation}
      </p>}
      {omittedLines > 0 && <p className="text-xs text-zinc-400 px-3" role="status">
        {t("worker_log.omitted", { count: omittedLines })}
      </p>}

      {/* Log output area */}
      <div
        ref={containerRef}
        className="overflow-y-auto font-mono text-xs text-zinc-300 p-3 min-h-[200px] max-h-[400px]"
        data-testid="log-lines-container"
      >
        {lines.length === 0 ? (
          <p className="text-zinc-600 italic" data-testid="log-empty-message">
            {labels?.empty ?? t("worker_log.no_logs")}
          </p>
        ) : (
          <div className="space-y-0.5">
            {lines.map((entry) => (
              <div key={entry.id} data-source={entry.source} className="leading-5 whitespace-pre-wrap break-all">
                {entry.line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
