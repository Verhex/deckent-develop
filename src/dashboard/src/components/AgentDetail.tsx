import { useEffect, useRef, useState } from "react";

import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useTranslation } from "../i18n/LanguageProvider";

interface AgentDetailProps {
  taskId: string;
  onClose: () => void;
  apiBase?: string;
}

interface WorkerLogData {
  taskId: string;
  log: string | null;
  task: {
    title?: string;
    status?: string;
    model?: string;
    description?: string;
    scope?: { directories?: string[]; filesRead?: string[]; filesWrite?: string[] };
    assignedAgent?: string;
    assignedSkills?: string[];
    createdAt?: string;
  } | null;
}

function formatElapsed(createdAt: string): string {
  const start = new Date(createdAt).getTime();
  const elapsed = Math.max(0, Date.now() - start);
  const s = Math.floor(elapsed / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function getStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case "EXECUTING": return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    case "DONE": return "bg-green-500/20 text-green-300 border-green-500/40";
    case "NO_GO": return "bg-red-500/20 text-red-300 border-red-500/40";
    case "CLAIMED": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
    case "PENDING": return "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";
    default: return "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";
  }
}

export function AgentDetail({ taskId, onClose, apiBase = "" }: AgentDetailProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<WorkerLogData | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let active = true;
    const fetchLog = async () => {
      try {
        const res = await fetch(`${apiBase}/api/worker/${taskId}/log`);
        if (res.ok && active) {
          setData(await res.json() as WorkerLogData);
        }
      } catch {
        /* ignore fetch errors */
      }
    };

    fetchLog();
    const interval = setInterval(fetchLog, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [taskId, apiBase]);

  // Auto-scroll log to bottom when new content arrives
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [data?.log]);

  // Live elapsed time ticker
  useEffect(() => {
    if (!data?.task?.createdAt) return;
    const update = () => setElapsed(formatElapsed(data.task!.createdAt!));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [data?.task?.createdAt]);

  const handleCopyLog = () => {
    const logText = data?.log ?? "";
    navigator.clipboard.writeText(logText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* ignore */});
  };

  const task = data?.task;
  const description = task?.description ?? "";
  const descTruncated = description.length > 200;
  const displayDesc = descExpanded ? description : description.slice(0, 200);

  const files = task?.scope?.filesWrite ?? [];

  return (
    <Card className="h-full border-zinc-800 bg-zinc-900 flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div className="flex-1 min-w-0">
          {/* Large title */}
          <CardTitle className="text-lg font-bold text-zinc-100 leading-tight mb-2">
            {task?.title ?? `${t("agent.worker")} ${taskId}`}
          </CardTitle>
          {/* Badges row */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-sm text-zinc-400 border-zinc-700">
              {taskId}
            </Badge>
            {task?.model && (
              <Badge variant="outline" className="text-sm border-zinc-600 text-zinc-300">
                {task.model}
              </Badge>
            )}
            {task?.status && (
              <Badge className={`text-sm border ${getStatusColor(task.status)}`}>
                {task.status}
              </Badge>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-100 ml-2 mt-0.5 flex-shrink-0"
          aria-label="Close"
        >
          &#x2715;
        </button>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto space-y-3">
        {/* Agent + Skills row */}
        {(task?.assignedAgent || (task?.assignedSkills && task.assignedSkills.length > 0)) && (
          <div className="flex flex-wrap gap-3 text-sm">
            {task?.assignedAgent && (
              <div>
                <span className="text-zinc-500">{t("agent.agent")}: </span>
                <span className="text-zinc-300 font-medium">{task.assignedAgent}</span>
              </div>
            )}
            {task?.assignedSkills && task.assignedSkills.length > 0 && (
              <div>
                <span className="text-zinc-500">{t("agent.skills")}: </span>
                <span className="text-zinc-300">{task.assignedSkills.join(", ")}</span>
              </div>
            )}
          </div>
        )}

        {/* Elapsed time */}
        {elapsed && (
          <div className="text-sm">
            <span className="text-zinc-500">{t("agent.elapsed")}: </span>
            <span className="text-zinc-300 font-mono">{elapsed}</span>
          </div>
        )}

        {/* Scope directories */}
        {task?.scope?.directories && task.scope.directories.length > 0 && (
          <div className="text-sm">
            <span className="text-zinc-500">{t("agent.scope")}: </span>
            <span className="text-zinc-300">{task.scope.directories.join(", ")}</span>
          </div>
        )}

        {/* Files changed (filesWrite from scope) */}
        {files.length > 0 && (
          <div className="text-sm">
            <div className="text-zinc-500 mb-1">{t("agent.files_changed")}:</div>
            <ul className="space-y-0.5">
              {files.map((f) => (
                <li key={f} className="text-zinc-400 font-mono truncate">{f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Description collapsible */}
        {description && (
          <div className="text-sm">
            <div className="text-zinc-500 mb-1">{t("agent.description")}:</div>
            <p className="text-zinc-400 leading-relaxed whitespace-pre-wrap">
              {displayDesc}
              {descTruncated && !descExpanded && "…"}
            </p>
            {descTruncated && (
              <button
                onClick={() => setDescExpanded((v) => !v)}
                className="text-blue-400 hover:text-blue-300 mt-1"
              >
                {descExpanded ? t("agent.show_less") : t("agent.show_more")}
              </button>
            )}
          </div>
        )}

        {/* Log section */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-zinc-400">{t("agent.log_output")}</span>
            <button
              onClick={handleCopyLog}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {copied ? t("agent.copied") : t("agent.copy_log")}
            </button>
          </div>
          <div className="h-[350px] rounded border border-zinc-800 bg-zinc-950 overflow-auto">
            <pre
              ref={logRef}
              className="text-xs whitespace-pre-wrap break-words font-mono text-zinc-300 p-2"
            >
              {data?.log ?? t("agent.no_log")}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
