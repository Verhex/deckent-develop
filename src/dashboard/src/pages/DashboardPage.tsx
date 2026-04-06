import { useState, useEffect, useCallback } from "react";
import { Activity, AlertTriangle, Info, XOctagon, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { WorkerCardGrid } from "../components/WorkerCard";
import { NewSprintModal } from "../components/NewSprintModal";
import { AgentDetail } from "../components/AgentDetail";
import { ActivityFeed } from "../components/ActivityFeed";
import { SprintPhaseTimeline } from "../components/SprintPhaseTimeline";
import { SkeletonCard } from "../components/Skeleton";
import { Sheet, SheetContent } from "../components/ui/sheet";
import { useSSE } from "../hooks/useSSE";
import { useTranslation } from "../i18n/LanguageProvider";
import { fetchJson, postJson, ApiError } from "../lib/api";
import type { DashboardState, Alert } from "../types";

// WelcomeScreen: shown when no active sprint
interface WelcomeScreenProps {
  lastSprintId?: string;
  onNewSprint: () => void;
}
function WelcomeScreen({ lastSprintId, onNewSprint }: WelcomeScreenProps) {
  const { t } = useTranslation();
  return (
    <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
      <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-5xl select-none">🐙</p>
        <h2 className="text-2xl font-bold text-zinc-100">deckent</h2>
        <p className="text-zinc-400 text-center">{t("welcome.no_sprint")}</p>
        <p className="text-zinc-500 text-sm text-center">{t("welcome.start_hint")}</p>
        <Button onClick={onNewSprint} className="mt-2 transition-all duration-200">
          <Plus className="mr-2 h-4 w-4" />
          {t("dashboard.new_sprint")}
        </Button>
        {lastSprintId && (
          <p className="text-xs text-zinc-600 mt-1">
            {t("welcome.last_sprint")}: {lastSprintId}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const PHASE_COLORS: Record<string, string> = {
  DIRECTIVE: "secondary",
  PLAN: "info",
  SPAWN: "info",
  EXECUTE: "warning",
  EVALUATE: "warning",
  FIX: "critical",
  RETRO: "success",
  DECAY: "secondary",
  TRANSITION: "secondary",
  COMPLETE: "success",
};

const ALERT_VARIANT: Record<string, "info" | "warning" | "critical"> = {
  info: "info",
  INFO: "info",
  warn: "warning",
  WARNING: "warning",
  error: "critical",
  CRITICAL: "critical",
};

const ALERT_ICON: Record<string, typeof Info> = {
  info: Info,
  INFO: Info,
  warn: AlertTriangle,
  WARNING: AlertTriangle,
  error: XOctagon,
  CRITICAL: XOctagon,
};

function relativeTime(isoDate: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return t('common.seconds_ago', { n: secs });
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t('common.minutes_ago', { n: mins });
  const hrs = Math.floor(mins / 60);
  return t('common.hours_ago', { n: hrs });
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const sseState = useSSE("/api/events");
  const [fallbackState, setFallbackState] = useState<DashboardState | null>(null);
  const [noSprint, setNoSprint] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isCleanupLoading, setIsCleanupLoading] = useState(false);
  const [isKillAllLoading, setIsKillAllLoading] = useState(false);

  useEffect(() => {
    if (!sseState) {
      fetchJson<DashboardState>("/api/status")
        .then((data) => {
          setFallbackState(data);
          setNoSprint(false);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) {
            setNoSprint(true);
          }
        })
        .finally(() => setInitialLoading(false));
    } else {
      setInitialLoading(false);
    }
  }, [sseState]);

  const state = sseState ?? fallbackState;

  const handleCleanup = useCallback(async () => {
    if (!confirm(t('dashboard.confirm_cleanup'))) return;
    setIsCleanupLoading(true);
    try {
      await postJson('/api/cleanup');
      if (!sseState) {
        fetchJson<DashboardState>('/api/status')
          .then(setFallbackState)
          .catch(() => {});
      }
    } catch {
      // error handled silently
    } finally {
      setIsCleanupLoading(false);
    }
  }, [sseState, t]);

  const handleKillAll = useCallback(async () => {
    if (!confirm(t('dashboard.confirm_kill'))) return;
    setIsKillAllLoading(true);
    try {
      await postJson('/api/kill/all');
      if (!sseState) {
        fetchJson<DashboardState>('/api/status')
          .then(setFallbackState)
          .catch(() => {});
      }
    } catch {
      // error handled silently
    } finally {
      setIsKillAllLoading(false);
    }
  }, [sseState, t]);

  const handleKill = useCallback(async (agentId: string) => {
    if (!confirm(`${t('dashboard.confirm_kill_worker')} ${agentId}?`)) return;
    try {
      await postJson(`/api/kill/${agentId}`);
      if (!sseState) {
        fetchJson<DashboardState>("/api/status")
          .then(setFallbackState)
          .catch(() => {});
      }
    } catch {
      // error handled silently
    }
  }, [sseState]);

  const agents = state?.agents ?? [];
  const alerts = state?.alerts ?? [];
  const progress = state?.progress;

  const done = progress?.done ?? 0;
  const active = progress?.active ?? 0;
  const blocked = progress?.blocked ?? 0;
  const total = progress?.total ?? 0;
  const pending = total - done - active - blocked;

  const phase = state?.sprint?.phase;
  const showKillAll = phase === 'EXECUTE' || phase === 'FIX';
  const showCleanup = !state || phase === 'COMPLETE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-zinc-100 bg-clip-text text-transparent">
          {t("dashboard.title")}
        </h1>
        <div className="flex items-center gap-2">
          {showCleanup && (
            <Button
              variant="outline"
              onClick={handleCleanup}
              disabled={isCleanupLoading}
              className="transition-all duration-200"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("dashboard.cleanup")}
            </Button>
          )}
          {showKillAll && (
            <Button
              variant="destructive"
              onClick={handleKillAll}
              disabled={isKillAllLoading}
              className="transition-all duration-200"
            >
              <XOctagon className="mr-2 h-4 w-4" />
              {t("dashboard.kill_all")}
            </Button>
          )}
          <Button onClick={() => setModalOpen(true)} className="transition-all duration-200">
            <Plus className="mr-2 h-4 w-4" />
            {t("dashboard.new_sprint")}
          </Button>
        </div>
      </div>

      {/* Skeleton: shown during initial data load */}
      {initialLoading && !sseState && (
        <div className="space-y-4">
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-24" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SkeletonCard className="lg:col-span-2 h-48" />
            <SkeletonCard className="h-48" />
          </div>
        </div>
      )}

      {/* Welcome Screen: shown when no active sprint */}
      {!initialLoading && noSprint && !state && (
        <WelcomeScreen onNewSprint={() => setModalOpen(true)} />
      )}

      {/* Sprint Status Card */}
      {state && (
        <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-zinc-100">
              <Activity className="h-5 w-5 text-blue-400" />
              {t("dashboard.sprint_status")}
            </CardTitle>
            {state.sprint?.phase && (
              <Badge
                variant={
                  (PHASE_COLORS[state.sprint.phase] as "info" | "warning" | "critical" | "success" | "secondary") ?? "secondary"
                }
              >
                {state.sprint.phase}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-zinc-400">{t("dashboard.sprint_id")}</p>
                <p className="font-mono text-zinc-100">
                  {state.sprint.id ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-zinc-400">{t("dashboard.phase")}</p>
                <p className="text-zinc-100">{state.sprint.phase}</p>
              </div>
              <div>
                <p className="text-zinc-400">{t("dashboard.status")}</p>
                <p className="text-zinc-100">{state.sprint.status}</p>
              </div>
              <div>
                <p className="text-zinc-400">{t("dashboard.updated")}</p>
                <p className="text-zinc-100">
                  {state.updatedAt ? relativeTime(state.updatedAt, t) : "—"}
                </p>
              </div>
            </div>
            <SprintPhaseTimeline currentPhase={state.sprint.phase} />
          </CardContent>
        </Card>
      )}

      {/* Usage Card removed — no real token tracking available via Claude CLI */}

      {/* Progress Section */}
      {total > 0 && (
        <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
          <CardHeader>
            <CardTitle className="text-zinc-100">{t("dashboard.progress")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress
              total={total}
              segments={[
                { value: done, color: "bg-green-500", label: `${t('dashboard.done')}: ${done}` },
                { value: active, color: "bg-blue-500", label: `${t('dashboard.active')}: ${active}` },
                {
                  value: Math.max(0, pending),
                  color: "bg-zinc-600",
                  label: `${t('dashboard.pending')}: ${Math.max(0, pending)}`,
                },
              ]}
            />
            <p className="text-sm text-zinc-400">
              {done}/{total} {t("dashboard.done")}, {active} {t("dashboard.running")},{" "}
              {Math.max(0, pending)} {t("dashboard.queued")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Workers (2/3) + Activity Feed (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Worker Cards — 2/3 */}
        <div className="lg:col-span-2">
          <WorkerCardGrid
            agents={agents}
            onSelect={(taskId) => setSelectedAgent(taskId)}
            onKill={handleKill}
          />
        </div>

        {/* Activity Feed — 1/3 */}
        <div className="lg:col-span-1">
          <ActivityFeed state={state} hasSprint={!!state} />
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-zinc-100">{t("dashboard.alerts")}</CardTitle>
            {(state?.violations ?? 0) > 0 && (
              <Badge variant="critical">{state!.violations} {t("dashboard.violations")}</Badge>
            )}
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {alerts.map((alert: Alert, i: number) => {
                const Icon = ALERT_ICON[alert.level] ?? Info;
                return (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-md bg-zinc-800/50 px-3 py-2 transition-all duration-200"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={ALERT_VARIANT[alert.level] ?? "info"}>
                          {alert.level.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-zinc-500">
                          {alert.timestamp}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-300">
                        {alert.message}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* New Sprint Modal */}
      <NewSprintModal open={modalOpen} onOpenChange={setModalOpen} />

      {/* Agent Detail Sheet */}
      <Sheet
        open={selectedAgent !== null}
        onOpenChange={(open) => { if (!open) setSelectedAgent(null); }}
      >
        <SheetContent side="right" className="w-[600px] sm:w-[700px]">
          {selectedAgent && (
            <AgentDetail
              taskId={selectedAgent}
              onClose={() => setSelectedAgent(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
