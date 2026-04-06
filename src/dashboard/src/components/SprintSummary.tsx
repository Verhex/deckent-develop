import { useMemo } from "react";
import {
  CheckCircle,
  Clock,
  Cpu,
  Loader2,
  AlertTriangle,
  Pause,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { TaskCard, type TaskCardData } from "./TaskCard";
import { useTranslation } from "../i18n/LanguageProvider";
import type { AgentInfo, DashboardState } from "../types";

// ─── Types ──────────────────────────────────────────────────────────

export interface TaskInfo {
  id: string;
  title: string;
  status: string;
  provider?: string;
  retries?: number;
  startedAt?: string;
  completedAt?: string;
  currentAction?: string;
  filesChanged?: string[];
  testResults?: { passed: number; failed: number; total: number };
  retryHistory?: Array<{ attempt: number; reason: string }>;
  dependsOn?: string[];
  feedbackLoop?: {
    tscAttempts: number;
    testAttempts: number;
  };
}

export interface SprintSummaryProps {
  state: DashboardState;
  tasks?: TaskInfo[];
}

// ─── Helpers (exported for testing) ─────────────────────────────────

export function getTaskStatusColor(status: string): string {
  switch (status) {
    case "DONE":
      return "text-green-400";
    case "EXECUTING":
    case "CODING":
    case "TESTING":
    case "VERIFYING":
      return "text-blue-400";
    case "NO_GO":
    case "ERROR":
      return "text-yellow-400";
    case "PAUSED":
      return "text-orange-400";
    default:
      return "text-zinc-500";
  }
}

export function getTaskStatusBg(status: string): string {
  switch (status) {
    case "DONE":
      return "bg-green-900/30 border-green-800/50";
    case "EXECUTING":
    case "CODING":
    case "TESTING":
    case "VERIFYING":
      return "bg-blue-900/30 border-blue-800/50";
    case "NO_GO":
    case "ERROR":
      return "bg-yellow-900/30 border-yellow-800/50";
    case "PAUSED":
      return "bg-orange-900/30 border-orange-800/50";
    default:
      return "bg-zinc-800/30 border-zinc-700/50";
  }
}

export function getStatusIcon(status: string) {
  switch (status) {
    case "DONE":
      return CheckCircle;
    case "EXECUTING":
    case "CODING":
    case "TESTING":
    case "VERIFYING":
      return Loader2;
    case "NO_GO":
    case "ERROR":
      return AlertTriangle;
    case "PAUSED":
      return Pause;
    default:
      return Clock;
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "DONE":
      return "Done";
    case "EXECUTING":
      return "Active";
    case "CODING":
      return "Writing code";
    case "TESTING":
      return "Running tests";
    case "VERIFYING":
      return "Type checking";
    case "NO_GO":
      return "Needs attention";
    case "ERROR":
      return "Error";
    case "PAUSED":
      return "Paused";
    case "PENDING":
      return "Queued";
    case "DRAFT":
      return "Draft";
    default:
      return "Waiting";
  }
}

export function computeSelfHealingCount(tasks: TaskInfo[]): number {
  return tasks.filter((t) => {
    if (!t.feedbackLoop) return false;
    return t.feedbackLoop.tscAttempts > 1 || t.feedbackLoop.testAttempts > 1;
  }).length;
}

export function computeProviderBreakdown(
  agents: AgentInfo[],
  tasks: TaskInfo[],
): Record<string, number> {
  const breakdown: Record<string, number> = {};

  // From tasks with provider field
  for (const task of tasks) {
    if (task.provider) {
      breakdown[task.provider] = (breakdown[task.provider] ?? 0) + 1;
    }
  }

  // From active agents if no task providers
  if (Object.keys(breakdown).length === 0) {
    for (const agent of agents) {
      const provider = agent.model?.includes("gpt") || agent.model?.includes("codex")
        ? "Codex"
        : agent.model?.includes("gemini")
          ? "Gemini"
          : "Claude";
      breakdown[provider] = (breakdown[provider] ?? 0) + 1;
    }
  }

  return breakdown;
}

export function estimateTimeRemaining(
  done: number,
  total: number,
  startedAt?: string,
  translate?: (key: string) => string,
): string {
  if (!startedAt || done === 0 || done >= total) return "";
  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  const msPerTask = elapsedMs / done;
  const remainingTasks = total - done;
  const remainingMs = msPerTask * remainingTasks;
  const remainingMin = Math.ceil(remainingMs / 60000);
  if (remainingMin < 1) {
    return translate ? translate('sprint_summary.time_less_than_1min') : "< 1 min remaining";
  }
  if (translate) {
    return translate('sprint_summary.time_remaining').replace('{{n}}', String(remainingMin));
  }
  return `~${remainingMin} min remaining`;
}

export function formatElapsedTime(startedAt?: string, translate?: (key: string) => string): string {
  if (!startedAt) return "";
  const ms = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) {
    return translate ? translate('sprint_summary.just_started') : "just started";
  }
  if (translate) {
    return translate('sprint_summary.time_elapsed').replace('{{n}}', String(mins));
  }
  return `${mins} min elapsed`;
}

// ─── Component ──────────────────────────────────────────────────────

export function SprintSummary({ state, tasks = [] }: SprintSummaryProps) {
  const { t } = useTranslation();
  const { progress, agents, sprint } = state;
  const done = progress?.done ?? 0;
  const active = progress?.active ?? 0;
  const total = progress?.total ?? 0;
  const pending = Math.max(0, total - done - active - (progress?.blocked ?? 0));
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const selfHealingCount = useMemo(() => computeSelfHealingCount(tasks), [tasks]);
  const providerBreakdown = useMemo(
    () => computeProviderBreakdown(agents, tasks),
    [agents, tasks],
  );
  const eta = useMemo(
    () => estimateTimeRemaining(done, total, state.updatedAt, t as (key: string) => string),
    [done, total, state.updatedAt, t],
  );
  const elapsed = useMemo(
    () => formatElapsedTime(state.updatedAt, t as (key: string) => string),
    [state.updatedAt, t],
  );

  const activeAgents = agents.filter((a) => a.status === "EXECUTING");

  const warnings = tasks.filter(
    (t) =>
      t.feedbackLoop &&
      (t.feedbackLoop.tscAttempts > 2 || t.feedbackLoop.testAttempts > 2),
  );

  return (
    <div className="space-y-6" data-testid="sprint-summary">
      {/* Header + Progress */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl text-zinc-100">
              {sprint.id ? `Sprint ${sprint.id.replace("sprint-", "")}` : "Sprint"}
              {sprint.phase && (
                <span className="ml-2 text-sm font-normal text-zinc-400">
                  — {sprint.phase}
                </span>
              )}
            </CardTitle>
            <div className="text-right text-sm text-zinc-400">
              {elapsed && <span>{elapsed}</span>}
              {eta && <span className="ml-3">{eta}</span>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Large progress bar */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-2xl font-bold text-zinc-100" data-testid="progress-percentage">
                {pct}%
              </span>
              <span className="text-sm text-zinc-400" data-testid="progress-fraction">
                {t('sprint_summary.tasks_done').replace('{{done}}', String(done)).replace('{{total}}', String(total))}
              </span>
            </div>
            <Progress
              total={total}
              segments={[
                { value: done, color: "bg-green-500", label: t('sprint_summary.done_count').replace('{{n}}', String(done)) },
                { value: active, color: "bg-blue-500", label: t('sprint_summary.active_count').replace('{{n}}', String(active)) },
                { value: pending, color: "bg-zinc-600", label: t('sprint_summary.queued_count').replace('{{n}}', String(pending)) },
              ]}
              className="h-6"
              data-testid="progress-bar"
            />
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-6 text-sm">
            <span className="flex items-center gap-1.5 text-green-400">
              <CheckCircle className="h-4 w-4" />
              {t('sprint_summary.n_done').replace('{{n}}', String(done))}
            </span>
            <span className="flex items-center gap-1.5 text-blue-400">
              <Loader2 className="h-4 w-4" />
              {t('sprint_summary.n_active').replace('{{n}}', String(active))}
            </span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Clock className="h-4 w-4" />
              {t('sprint_summary.n_queued').replace('{{n}}', String(pending))}
            </span>
            {selfHealingCount > 0 && (
              <span
                className="flex items-center gap-1.5 text-amber-400"
                data-testid="self-healing-count"
              >
                <Wrench className="h-4 w-4" />
                {t('sprint_summary.n_auto_fixed').replace('{{n}}', String(selfHealingCount))}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* What's happening now */}
      {activeAgents.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-zinc-100">
              <Cpu className="h-5 w-5 text-blue-400" />
              {t('sprint_summary.whats_happening')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between rounded-md bg-blue-900/20 border border-blue-800/30 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    <span className="text-sm text-zinc-200">
                      {agent.taskId ?? agent.id}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {agent.currentAction ?? t('sprint_summary.working')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      {tasks.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-zinc-100">{t('sprint_summary.tasks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5" data-testid="task-list">
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task as TaskCardData} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provider breakdown */}
      {Object.keys(providerBreakdown).length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-zinc-100">{t('sprint_summary.providers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4" data-testid="provider-breakdown">
              {Object.entries(providerBreakdown).map(([provider, count]) => (
                <div key={provider} className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm text-zinc-200">
                    {t('sprint_summary.n_on_provider').replace('{{n}}', String(count)).replace('{{provider}}', provider)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              {t('sprint_summary.needs_attention')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="warnings">
              {warnings.map((task) => (
                <div
                  key={task.id}
                  className="rounded-md bg-yellow-900/20 border border-yellow-800/30 px-3 py-2 text-sm text-zinc-300"
                >
                  {t('sprint_summary.task_retries')
                    .replace('{{id}}', task.id)
                    .replace('{{title}}', task.title)
                    .replace('{{retries}}', String(
                      (task.feedbackLoop?.tscAttempts ?? 0) +
                      (task.feedbackLoop?.testAttempts ?? 0) -
                      2
                    ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
