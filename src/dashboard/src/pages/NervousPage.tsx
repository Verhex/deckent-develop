import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { SkeletonCard } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { Brain, ShieldAlert, Activity, Inbox, Lightbulb } from "lucide-react";
import { useTranslation } from "../i18n/LanguageProvider";

interface PendingApproval {
  id: string;
  type: string;
  description: string;
  detector: string;
  createdAt: string;
  risk: "low" | "medium" | "high";
}

interface NervousRecommendation {
  id: string;
  actionId: string;
  createdAt: string;
  payload: Record<string, unknown>;
  status: "open" | "dismissed";
}

/** One-line, length-bounded payload summary (key=value …) — scannable, no nesting. */
function formatRecPayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (v === null || typeof v === "object") continue;
    parts.push(`${k}=${String(v)}`);
    if (parts.length >= 3) break;
  }
  const joined = parts.join(" ");
  return joined.length > 80 ? joined.slice(0, 77) + "…" : joined;
}

interface DetectorInfo {
  id: string;
  name: string;
  enabled: boolean;
  triggerCount: number;
}

interface NervousStatus {
  panicGuard: boolean;
  detectors: DetectorInfo[];
  pendingCount: number;
}

/** Poll cadence for the nervous live view — matches the dashboard's 5s tick. */
const NERVOUS_POLL_MS = 5000;

export default function NervousPage() {
  const { t } = useTranslation();
  // Sprint 269 Task 269-002: one-shot fetch → live data. pollIntervalMs routes
  // these through lib/use-live-data (stale-while-revalidate polling); refetch
  // becomes an immediate re-fetch, so accept/reject refresh the lists at once
  // and the poll keeps them current afterwards.
  const { data: status, loading: statusLoading, error: statusError, refetch: refetchStatus } =
    useApi<NervousStatus>("/api/nervous/status", { pollIntervalMs: NERVOUS_POLL_MS });
  const { data: pending, loading: pendingLoading, error: pendingError, refetch: refetchPending } =
    useApi<PendingApproval[]>("/api/nervous/pending", { pollIntervalMs: NERVOUS_POLL_MS });
  const { data: recommendations, loading: recsLoading, error: recsError, refetch: refetchRecs } =
    useApi<NervousRecommendation[]>("/api/nervous/recommendations", { pollIntervalMs: NERVOUS_POLL_MS });

  // SURF-7 (ADR-G-033): accept/reject/dismiss moved to the terminal
  // (`deckent nervous`) — the page observes; the polls keep the lists live.
  void refetchStatus;
  void refetchPending;
  void refetchRecs;

  return (
    <div className="space-y-6" data-testid="nervous-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">{t('nervous.title')}</h1>
        {status && (
          <Badge
            data-testid="panic-guard-badge"
            className={status.panicGuard ? "bg-red-900 text-red-300" : "bg-green-900 text-green-300"}
          >
            {status.panicGuard ? t('nervous.panic_guard_active') : t('nervous.panic_guard_off')}
          </Badge>
        )}
      </div>

      <ReadOnlyNotice hintKey="readonly.hint.nervous" />

      {/* Detector Status */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-300" />
            {t('nervous.detector_status_title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statusLoading && <SkeletonCard />}
          {statusError && <p className="text-red-400">{t('nervous.error')}: {statusError}</p>}
          {status && status.detectors.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="detector-list">
              {status.detectors.map((detector) => (
                <Badge
                  key={detector.id}
                  data-testid={`detector-${detector.id}`}
                  className={detector.enabled ? "bg-brand-bg text-brand-300" : "bg-zinc-700 text-zinc-500"}
                  title={`Triggered ${detector.triggerCount} times`}
                >
                  {detector.name}
                </Badge>
              ))}
            </div>
          )}
          {!statusLoading && !statusError && (!status || status.detectors.length === 0) && (
            <EmptyState
              icon={Activity}
              title={t('nervous.detectors_empty_title')}
              description={t('nervous.detectors_empty_desc')}
            />
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            {t('nervous.pending_approvals_title')}
            {pending && pending.length > 0 && (
              <Badge className="ml-2 bg-yellow-900 text-yellow-300">{pending.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingLoading && <SkeletonCard />}
          {pendingError && <p className="text-red-400">{t('nervous.error')}: {pendingError}</p>}
          {pending && pending.length > 0 && (
            <div className="space-y-3" data-testid="pending-list">
              {pending.map((approval) => (
                <div
                  key={approval.id}
                  data-testid={`approval-${approval.id}`}
                  className="rounded-md border border-zinc-800 p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldAlert className="w-4 h-4 text-yellow-400 shrink-0" />
                      <span className="font-medium text-zinc-100 text-sm">{approval.type}</span>
                      <Badge className={
                        approval.risk === "high" ? "bg-red-900 text-red-300 text-xs" :
                        approval.risk === "medium" ? "bg-yellow-900 text-yellow-300 text-xs" :
                        "bg-zinc-700 text-zinc-400 text-xs"
                      }>
                        {approval.risk}
                      </Badge>
                    </div>
                    <p className="text-sm text-zinc-400 mb-1">{approval.description}</p>
                    <p className="text-xs text-zinc-600">detector: {approval.detector} · {approval.createdAt}</p>
                  </div>
                  {/* SURF-7: accept/reject buttons removed — decide from the
                      terminal (`deckent nervous`); the poll reflects it here. */}
                </div>
              ))}
            </div>
          )}
          {!pendingLoading && !pendingError && (!pending || pending.length === 0) && (
            <EmptyState
              icon={Brain}
              title={t('nervous.approvals_empty_title')}
              description={t('nervous.approvals_empty_desc')}
            />
          )}
        </CardContent>
      </Card>

      {/* Brain Inbox — recommendations (ADR-037: nervous proposes, Brain disposes) */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-brand-300" />
            {t('nervous.recommendations_title')}
            {recommendations && recommendations.length > 0 && (
              <Badge className="ml-2 bg-brand-bg text-brand-300">{recommendations.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recsLoading && <SkeletonCard />}
          {recsError && <p className="text-red-400">{t('nervous.error')}: {recsError}</p>}
          {recommendations && recommendations.length > 0 && (
            <div className="space-y-3" data-testid="recommendation-list">
              {recommendations.map((rec) => {
                const summary = formatRecPayload(rec.payload);
                return (
                  <div
                    key={rec.id}
                    data-testid={`recommendation-${rec.id}`}
                    className="rounded-md border border-zinc-800 p-4 flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Lightbulb className="w-4 h-4 text-brand-300 shrink-0" />
                        <span className="font-medium text-zinc-100 text-sm">{rec.actionId}</span>
                      </div>
                      {summary && <p className="text-sm text-zinc-400 mb-1 truncate">{summary}</p>}
                      <p className="text-xs text-zinc-600">{rec.id} · {rec.createdAt}</p>
                    </div>
                    {/* SURF-7: dismiss moved to the terminal (`deckent nervous`). */}
                  </div>
                );
              })}
            </div>
          )}
          {!recsLoading && !recsError && (!recommendations || recommendations.length === 0) && (
            <EmptyState
              icon={Inbox}
              title={t('nervous.recommendations_empty_title')}
              description={t('nervous.recommendations_empty_desc')}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
