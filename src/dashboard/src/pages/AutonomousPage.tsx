import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { SkeletonCard } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { Zap, ListTodo, Cpu, Clock } from "lucide-react";
import { useTranslation } from "../i18n/LanguageProvider";

interface PendingApproval {
  triggerId: string;
  action: string;
  requestedBy: string;
  enqueuedAt: string;
}

interface BacklogEntry {
  id: string;
  title: string;
  kind: string;
  status: string;
  policy: string;
  trigger: { type: string; cron?: string };
  lastRun: string | null;
}

interface BacklogSummary {
  total: number;
  pending: number;
  running: number;
  parked: number;
  done: number;
  failed: number;
}

interface AutonomousStatus {
  pendingCount: number;
  backlogSummary: BacklogSummary;
  recentAudit: Array<{ timestamp: string; action: string; outcome: string; reason: string }>;
}

/** Poll cadence for the autonomous live view — matches the dashboard's 5s tick. */
const AUTONOMOUS_POLL_MS = 5000;

const SUMMARY_KEYS = ["pending", "running", "parked", "done", "failed"] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case "done": return "bg-green-900 text-green-300";
    case "failed": return "bg-red-900 text-red-300";
    case "running": return "bg-brand-bg text-brand-300";
    case "parked": return "bg-yellow-900 text-yellow-300";
    default: return "bg-zinc-700 text-zinc-400";
  }
}

export default function AutonomousPage() {
  const { t } = useTranslation();
  const { data: status, loading: statusLoading, error: statusError, refetch: refetchStatus } =
    useApi<AutonomousStatus>("/api/autonomous/status", { pollIntervalMs: AUTONOMOUS_POLL_MS });
  const { data: pending, loading: pendingLoading, error: pendingError, refetch: refetchPending } =
    useApi<PendingApproval[]>("/api/autonomous/pending", { pollIntervalMs: AUTONOMOUS_POLL_MS });
  const { data: backlog, loading: backlogLoading, error: backlogError } =
    useApi<BacklogEntry[]>("/api/autonomous/backlog", { pollIntervalMs: AUTONOMOUS_POLL_MS });

  // SURF-7 (ADR-G-033): approve/reject moved to the terminal
  // (`deckent autonomous`) — the page observes; the polls keep the lists live.
  void refetchStatus;
  void refetchPending;

  const summary = status?.backlogSummary;

  return (
    <div className="space-y-6" data-testid="autonomous-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">{t("autonomous.title")}</h1>
        {status && (
          <Badge
            data-testid="pending-badge"
            className={status.pendingCount > 0 ? "bg-yellow-900 text-yellow-300" : "bg-green-900 text-green-300"}
          >
            {status.pendingCount} {t("autonomous.pending_word")}
          </Badge>
        )}
      </div>

      <ReadOnlyNotice hintKey="readonly.hint.autonomous" />

      {/* Backlog Summary */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-brand-300" />
            {t("autonomous.backlog_summary_title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statusLoading && <SkeletonCard />}
          {statusError && <p className="text-red-400">{t("autonomous.error")}: {statusError}</p>}
          {summary && (
            <div className="flex flex-wrap gap-2" data-testid="backlog-summary">
              <Badge className="bg-brand-bg text-brand-300">{t("autonomous.summary_total")}: {summary.total}</Badge>
              {SUMMARY_KEYS.map((k) => (
                <Badge key={k} data-testid={`summary-${k}`} className="bg-zinc-800 text-zinc-300">
                  {t(`autonomous.summary_${k}` as const)}: {summary[k]}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            {t("autonomous.pending_approvals_title")}
            {pending && pending.length > 0 && (
              <Badge className="ml-2 bg-yellow-900 text-yellow-300">{pending.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingLoading && <SkeletonCard />}
          {pendingError && <p className="text-red-400">{t("autonomous.error")}: {pendingError}</p>}
          {pending && pending.length > 0 && (
            <div className="space-y-3" data-testid="pending-list">
              {pending.map((p) => (
                <div
                  key={p.triggerId}
                  data-testid={`approval-${p.triggerId}`}
                  className="rounded-md border border-zinc-800 p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
                      <span className="font-medium text-zinc-100 text-sm">{p.action}</span>
                    </div>
                    <p className="text-xs text-zinc-600">{p.triggerId} · {p.requestedBy} · {p.enqueuedAt}</p>
                  </div>
                  {/* SURF-7: approve/reject buttons removed — decide from the
                      terminal (`deckent autonomous`); the poll reflects it. */}
                </div>
              ))}
            </div>
          )}
          {!pendingLoading && !pendingError && (!pending || pending.length === 0) && (
            <EmptyState
              icon={Zap}
              title={t("autonomous.approvals_empty_title")}
              description={t("autonomous.approvals_empty_desc")}
            />
          )}
        </CardContent>
      </Card>

      {/* Backlog Entries */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-brand-300" />
            {t("autonomous.backlog_title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backlogLoading && <SkeletonCard />}
          {backlogError && <p className="text-red-400">{t("autonomous.error")}: {backlogError}</p>}
          {backlog && backlog.length > 0 && (
            <div className="space-y-2" data-testid="backlog-list">
              {backlog.map((e) => (
                <div
                  key={e.id}
                  data-testid={`backlog-${e.id}`}
                  className="rounded-md border border-zinc-800 p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-zinc-100 text-sm">{e.title}</span>
                    <p className="text-xs text-zinc-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {e.id} · {e.kind} · {e.trigger?.type}{e.trigger?.cron ? ` (${e.trigger.cron})` : ""}
                    </p>
                  </div>
                  <Badge className={statusBadgeClass(e.status)}>{e.status}</Badge>
                </div>
              ))}
            </div>
          )}
          {!backlogLoading && !backlogError && (!backlog || backlog.length === 0) && (
            <EmptyState
              icon={ListTodo}
              title={t("autonomous.backlog_empty_title")}
              description={t("autonomous.backlog_empty_desc")}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
