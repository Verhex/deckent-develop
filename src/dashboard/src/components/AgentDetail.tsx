import { useEffect, useState } from "react";
import { ScrollArea } from "./ui/scroll-area";
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
    scope?: { directories?: string[]; filesWrite?: string[] };
  } | null;
}

export function AgentDetail({ taskId, onClose, apiBase = "" }: AgentDetailProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<WorkerLogData | null>(null);

  useEffect(() => {
    let active = true;
    const fetchLog = async () => {
      try {
        const res = await fetch(`${apiBase}/api/worker/${taskId}/log`);
        if (res.ok && active) {
          setData(await res.json());
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

  return (
    <Card className="h-full border-zinc-800 bg-zinc-900">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-zinc-100">
          {t("agent.worker")} {taskId}
          {data?.task?.model && (
            <Badge variant="outline" className="ml-2">
              {data.task.model}
            </Badge>
          )}
          {data?.task?.status && (
            <Badge className="ml-2">{data.task.status}</Badge>
          )}
        </CardTitle>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-100"
          aria-label="Close"
        >
          &#x2715;
        </button>
      </CardHeader>
      <CardContent>
        {data?.task?.title && (
          <p className="text-sm text-zinc-200 mb-2">{data.task.title}</p>
        )}
        {data?.task?.description && (
          <p className="text-xs text-zinc-400 mb-3">{data.task.description}</p>
        )}
        {data?.task?.scope?.directories && data.task.scope.directories.length > 0 && (
          <div className="mb-3">
            <span className="text-xs font-medium text-zinc-400">{t("agent.scope")}: </span>
            <span className="text-xs text-zinc-300">
              {data.task.scope.directories.join(", ")}
            </span>
          </div>
        )}
        <div className="text-xs font-medium text-zinc-400 mb-1">{t("agent.log_output")}</div>
        <ScrollArea className="h-[300px] rounded border border-zinc-800 bg-zinc-950 p-2">
          <pre className="text-xs whitespace-pre-wrap font-mono text-zinc-300">
            {data?.log ?? t("agent.no_log")}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
