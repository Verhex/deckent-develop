import type { Command } from 'commander';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { UsageTracker, DEFAULT_TOKEN_COSTS } from '../../core/usage-tracker.js';
import type { ModelBreakdown, SprintUsage, TotalUsage, ProviderBreakdown, TaskUsage } from '../../core/usage-tracker.js';
import { readAuthMode } from '../../core/config.js';

// Cost estimates per 1K tokens (in USD) — defaults, overridable via config
function getTokenCosts(overrides?: Record<string, number>): Record<string, number> {
  return { ...DEFAULT_TOKEN_COSTS, ...overrides };
}

function estimateCost(model: string, tokens: number, costs?: Record<string, number>): number {
  const costMap = costs ?? DEFAULT_TOKEN_COSTS;
  const rate = costMap[model] ?? 0;
  return (tokens / 1000) * rate;
}

function formatModelTable(breakdown: ModelBreakdown[], isApiMode: boolean, costs?: Record<string, number>): string {
  const headers = isApiMode
    ? ['Model', 'Calls', 'Tokens', 'Est. Cost (USD)']
    : ['Model', 'Calls', 'Tokens'];

  const rows = breakdown.map((b) => {
    const base = [b.model, String(b.calls), String(b.tokens)];
    if (isApiMode) {
      base.push(`$${estimateCost(b.model, b.tokens, costs).toFixed(4)}`);
    }
    return base;
  });

  return formatTable(headers, rows);
}

function formatProviderTable(breakdown: ProviderBreakdown[], isApiMode: boolean): string {
  const headers = isApiMode
    ? ['Provider', 'Calls', 'Tokens', 'Est. Cost (USD)']
    : ['Provider', 'Calls', 'Tokens'];

  const rows = breakdown.map((b) => {
    const base = [b.provider, String(b.calls), String(b.tokens)];
    if (isApiMode) {
      base.push('—');
    }
    return base;
  });

  return formatTable(headers, rows);
}

function formatTaskTable(tasks: TaskUsage[]): string {
  const headers = ['Task', 'Calls', 'Tokens'];
  const top = tasks.slice(0, 10);
  const rows = top.map((t) => [t.taskId, String(t.calls), String(t.tokens)]);
  return formatTable(headers, rows);
}

function formatSprintTable(sprints: SprintUsage[], isApiMode: boolean, costs?: Record<string, number>): string {
  const headers = isApiMode
    ? ['Sprint', 'Calls', 'Tokens', 'Est. Cost (USD)']
    : ['Sprint', 'Calls', 'Tokens'];

  const rows = sprints.map((s) => {
    const totalCost = s.modelBreakdown.reduce(
      (sum, b) => sum + estimateCost(b.model, b.tokens, costs),
      0,
    );
    const base = [s.sprintId, String(s.totalCalls), String(s.totalTokens)];
    if (isApiMode) {
      base.push(`$${totalCost.toFixed(4)}`);
    }
    return base;
  });

  return formatTable(headers, rows);
}

function formatTrendLine(sprints: SprintUsage[]): string {
  if (sprints.length < 2) return '';
  const first = sprints[0]!;
  const last = sprints[sprints.length - 1]!;
  const tokensDelta = last.totalTokens - first.totalTokens;
  const callsDelta = last.totalCalls - first.totalCalls;
  const arrow = (n: number) => n > 0 ? '↑' : n < 0 ? '↓' : '→';
  return `Trend: Tokens ${arrow(tokensDelta)}${Math.abs(tokensDelta)} | Calls ${arrow(callsDelta)}${Math.abs(callsDelta)}`;
}

export interface UsageCommandOptions {
  json?: boolean;
  sprint?: string;
  projectRoot?: string;
  isApiMode?: boolean;
  since?: string;
  last?: number;
  verbose?: boolean;
  costOverrides?: Record<string, number>;
}

export function buildUsageOutput(
  tracker: UsageTracker,
  opts: UsageCommandOptions = {},
): { text: string; data: unknown } {
  const isApiMode = opts.isApiMode ?? false;
  const costs = getTokenCosts(opts.costOverrides);

  if (opts.sprint) {
    const sprintUsage = tracker.getSprintUsage(opts.sprint);

    if (sprintUsage.totalCalls === 0) {
      const text = `No usage data found for sprint: ${opts.sprint}`;
      return { text, data: sprintUsage };
    }

    const table = formatModelTable(sprintUsage.modelBreakdown, isApiMode, costs);
    const lines = [
      `Sprint: ${sprintUsage.sprintId}`,
      `Total Calls: ${sprintUsage.totalCalls} | Total Tokens: ${sprintUsage.totalTokens}`,
      '',
      'Model Breakdown:',
      table,
    ];

    // Provider breakdown
    if (sprintUsage.providerBreakdown && sprintUsage.providerBreakdown.length > 0) {
      lines.push('', 'Provider Breakdown:', formatProviderTable(sprintUsage.providerBreakdown, isApiMode));
    }

    // Task breakdown (verbose or always in JSON)
    if (opts.verbose && sprintUsage.taskBreakdown && sprintUsage.taskBreakdown.length > 0) {
      lines.push('', 'Top Tasks by Token Usage:', formatTaskTable(sprintUsage.taskBreakdown));
    }

    // Rate limit info for subscription mode
    if (!isApiMode) {
      lines.push('', 'Mode: Subscription — rate limit based, no cost estimate.');
    }

    return { text: lines.join('\n'), data: sprintUsage };
  }

  // Filtered sprint list
  const filteredSprints = (opts.since || opts.last)
    ? tracker.listSprintsFiltered({ since: opts.since, last: opts.last })
    : null;

  const total: TotalUsage = tracker.getTotalUsage();

  if (total.totalCalls === 0) {
    const text = [
      'No usage data found.',
      'Run a sprint first to track usage metrics.',
    ].join('\n');
    return { text, data: total };
  }

  const sprintIds = filteredSprints ?? tracker.listSprints();
  const sprintUsages = sprintIds.map((id) => tracker.getSprintUsage(id));

  const modelTable = formatModelTable(total.modelBreakdown, isApiMode, costs);
  const sprintTable = formatSprintTable(sprintUsages, isApiMode, costs);

  const lines = [
    `Total Sprints: ${total.sprintCount} | Total Calls: ${total.totalCalls} | Total Tokens: ${total.totalTokens}`,
    '',
    'Model Breakdown:',
    modelTable,
    '',
    'Sprint History:',
    sprintTable,
  ];

  // Trend analysis
  if (sprintUsages.length >= 2) {
    const trendLine = formatTrendLine(sprintUsages);
    if (trendLine) lines.push('', trendLine);
  }

  // Rate limit info for subscription mode
  if (!isApiMode) {
    lines.push('', 'Mode: Subscription — rate limit based, no cost estimate.');
  }

  return { text: lines.join('\n'), data: { total, sprints: sprintUsages } };
}

export function registerUsage(program: Command): void {
  program
    .command('usage')
    .description('Show usage metrics')
    .option('--json', 'Output as JSON')
    .option('--sprint <id>', 'Filter by sprint ID')
    .option('--since <date>', 'Show sprints since date (ISO format)')
    .option('--last <n>', 'Show last N sprints', parseInt)
    .option('--verbose', 'Show detailed breakdown including task-level usage')
    .action(async (opts: UsageCommandOptions) => {
      try {
        const root = resolveProjectRoot();
        const authMode = await readAuthMode(root);
        const isApiMode = authMode === 'api';
        const tracker = new UsageTracker(root);
        const { text, data } = buildUsageOutput(tracker, { ...opts, isApiMode });

        if (opts.json) {
          print(JSON.stringify(data, null, 2));
        } else {
          print(text);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
