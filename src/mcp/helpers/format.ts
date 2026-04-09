// ─── Human-Friendly MCP Response Formatters ─────────────────────────────────
// Each formatter produces a concise, readable summary string from raw response data.
// MCP tool responses include both `data` (JSON) and `summary` (human-readable).

export interface StatusData {
  sprint?: { id?: string; phase?: string; startedAt?: string };
  progress?: { done?: number; active?: number; total?: number; blocked?: number };
  agents?: Array<{ status?: string; taskId?: string; currentAction?: string }>;
  alerts?: Array<{ level?: string; message?: string }>;
  eta?: string;
  active?: boolean;
  message?: string;
}

export interface PlanData {
  sprintId?: string;
  tasks?: Array<{ id?: string; title?: string; model?: string; priority?: string }>;
  modelDistribution?: Record<string, number>;
  recommendation?: { size?: string; maxWorkers?: number; reason?: string };
  riskAssessment?: string;
  planningMode?: string;
  waveBreakdown?: Record<string, number>;
}

export interface StartData {
  success?: boolean;
  jobId?: string;
  status?: string;
  activeWorkers?: number;
  queuedTasks?: number;
  estimatedDuration?: string;
  error?: string;
}

export interface DoctorData {
  ok?: boolean;
  checks?: Array<{ ok: boolean; name?: string; label?: string; message?: string }>;
  healthScore?: number;
  recommendations?: string[];
  systemProfile?: { subscription?: string };
}

export interface RetroData {
  content?: string | null;
  highlights?: string[];
  sprintId?: string;
  successRate?: number;
  selfHealingRate?: number;
  selfHealedCount?: number;
}

export interface HistoryData {
  sprints?: Array<{ id: string; content?: string }>;
  trend?: string;
  avgSuccessRate?: number;
}

export interface ErrorData {
  code?: string;
  message?: string;
  phase?: string;
  whatHappened?: string;
  howToFix?: string;
}

const MODEL_LABELS: Record<string, string> = {
  opus: 'complex',
  sonnet: 'standard',
  haiku: 'lightweight',
};

function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

export function formatStatusResponse(data: StatusData): string {
  if (data.active === false || !data.progress) {
    return data.message ?? 'No active sprint.';
  }

  const { done = 0, active = 0, total = 0 } = data.progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const sprintId = data.sprint?.id ?? 'unknown';
  const workerCount = data.agents?.length ?? active;
  const eta = data.eta ?? 'unknown';

  const parts: string[] = [
    `Sprint ${sprintId}: ${done}/${total} done (${pct}%)`,
    `${workerCount} active ${pluralize(workerCount, 'worker')}`,
  ];

  if (eta !== 'unknown') {
    parts.push(`${eta} remaining`);
  }

  const alertCount = data.alerts?.length ?? 0;
  if (alertCount > 0) {
    const criticals = data.alerts?.filter(a => a.level === 'CRITICAL').length ?? 0;
    if (criticals > 0) {
      parts.push(`${criticals} critical ${pluralize(criticals, 'alert')}`);
    } else {
      parts.push(`${alertCount} ${pluralize(alertCount, 'alert')}`);
    }
  }

  return parts.join(', ');
}

export function formatPlanResponse(data: PlanData): string {
  const taskCount = data.tasks?.length ?? 0;
  if (taskCount === 0) {
    return 'No tasks planned.';
  }

  const dist = data.modelDistribution ?? {};
  const modelParts = Object.entries(dist)
    .map(([model, count]) => `${count} ${model} (${modelLabel(model)})`)
    .join(', ');

  const parts: string[] = [
    `Planned ${taskCount} ${pluralize(taskCount, 'task')}`,
  ];

  if (modelParts) {
    parts[0] += `: ${modelParts}`;
  }

  if (data.recommendation?.maxWorkers) {
    const waves = data.waveBreakdown ? Object.keys(data.waveBreakdown).length : 0;
    if (waves > 1) {
      parts.push(`${waves} waves with ${data.recommendation.maxWorkers} max workers`);
    }
  }

  if (data.riskAssessment) {
    parts.push(`risk: ${data.riskAssessment}`);
  }

  return parts.join('. ') + '.';
}

export function formatStartResponse(data: StartData): string {
  if (!data.success) {
    const reason = data.error ?? 'Unknown error';
    return `Sprint failed to start: ${reason}. Try: check DIRECTIVES.md and run \`deckent doctor\`.`;
  }

  const parts: string[] = ['Sprint started!'];

  if (data.estimatedDuration) {
    parts.push(`Estimated duration: ${data.estimatedDuration}.`);
  }

  parts.push('Watch progress: `deckent status --watch`.');

  return parts.join(' ');
}

export function formatDoctorResponse(data: DoctorData): string {
  const checks = data.checks ?? [];
  const total = checks.length;
  const passed = checks.filter(c => c.ok).length;
  const failed = total - passed;

  if (total === 0) {
    return 'No health checks available.';
  }

  const status = failed === 0 ? 'System healthy' : `System has ${failed} ${pluralize(failed, 'issue')}`;
  const parts: string[] = [status];

  if (data.healthScore !== undefined) {
    parts.push(`${data.healthScore}% health score`);
  }

  const failedChecks = checks.filter(c => !c.ok);
  if (failedChecks.length > 0) {
    const names = failedChecks
      .map(c => c.name ?? c.label ?? 'unknown')
      .slice(0, 3)
      .join(', ');
    parts.push(`fix: ${names}`);
  }

  if (data.recommendations && data.recommendations.length > 0) {
    parts.push(`${data.recommendations.length} ${pluralize(data.recommendations.length, 'recommendation')}`);
  }

  return parts.join('. ') + '.';
}

export function formatRetroResponse(data: RetroData): string {
  if (!data.content) {
    return 'No retrospective available.';
  }

  const parts: string[] = [];

  if (data.sprintId) {
    parts.push(`Sprint ${data.sprintId}`);
  }

  if (data.successRate !== undefined) {
    parts.push(`${data.successRate}% success`);
  }

  if (data.selfHealingRate !== undefined) {
    parts.push(`self-healing rate ${data.selfHealingRate}%`);
  }

  if (data.selfHealedCount !== undefined && data.selfHealedCount > 0) {
    parts.push(`${data.selfHealedCount} ${pluralize(data.selfHealedCount, 'task')} auto-fixed`);
  }

  if (parts.length === 0) {
    const highlightCount = data.highlights?.length ?? 0;
    if (highlightCount > 0) {
      return `Retrospective available with ${highlightCount} ${pluralize(highlightCount, 'highlight')}.`;
    }
    return 'Retrospective available.';
  }

  return parts.join('. ') + '.';
}

export function formatHistoryResponse(data: HistoryData): string {
  const count = data.sprints?.length ?? 0;
  if (count === 0) {
    return 'No sprint history available.';
  }

  const parts: string[] = [`Last ${count} ${pluralize(count, 'sprint')}`];

  if (data.avgSuccessRate !== undefined) {
    parts.push(`${data.avgSuccessRate}% avg success rate`);
  }

  const trend = data.trend ?? 'insufficient_data';
  const trendLabels: Record<string, string> = {
    improving: 'trending up',
    declining: 'trending down',
    stable: 'stable',
  };
  const trendLabel = trendLabels[trend];
  if (trendLabel) {
    parts.push(trendLabel);
  }

  return parts.join(', ') + '.';
}

export function formatErrorResponse(data: ErrorData): string {
  const what = data.whatHappened ?? data.message ?? 'An unexpected error occurred';
  const code = data.code ? ` [${data.code}]` : '';

  const lines: string[] = [`Something went wrong${code}: ${what}`];

  if (data.howToFix) {
    lines.push(`Try: ${data.howToFix}`);
  } else if (data.phase) {
    lines.push(`Try: check logs for phase "${data.phase}" and retry.`);
  } else {
    lines.push('Try: run `deckent doctor` to diagnose the issue.');
  }

  return lines.join('. ');
}

export interface FormattedResponse<T> {
  data: T;
  summary: string;
}

export function wrapResponse<T>(data: T, summary: string): FormattedResponse<T> {
  return { data, summary };
}

export interface ExplainData {
  found: boolean;
  sprintId?: string;
  sprintNumber?: number;
  goal?: string;
  totalTasks?: number;
  completed?: number;
  techDebt?: number;
  noGo?: number;
  durationMs?: number;
  learnings?: string[];
  tasks?: string[];
  output?: string;
}

export function formatExplainResponse(data: ExplainData): string {
  if (!data.found) {
    if (data.sprintId) {
      return `Sprint ${data.sprintId} not found. Check sprint ID and try again.`;
    }
    return 'No sprints found. Run `deckent start` to begin.';
  }

  const num = data.sprintNumber ?? 0;
  const done = (data.completed ?? 0) + (data.techDebt ?? 0);
  const total = data.totalTasks ?? 0;
  const noGo = data.noGo ?? 0;

  const parts: string[] = [`Sprint #${num}: ${done}/${total} ${pluralize(total, 'task')} completed`];

  if (noGo > 0) {
    parts.push(`${noGo} failed`);
  }

  if (data.durationMs && data.durationMs > 0) {
    const mins = Math.floor(data.durationMs / 60000);
    const secs = Math.floor((data.durationMs % 60000) / 1000);
    parts.push(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
  }

  return parts.join(', ') + '.';
}
