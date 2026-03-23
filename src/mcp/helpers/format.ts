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
