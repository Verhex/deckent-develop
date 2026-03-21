import type { Command } from 'commander';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { UsageTracker } from '../../core/usage-tracker.js';
import type { ModelBreakdown, SprintUsage, TotalUsage } from '../../core/usage-tracker.js';

// Cost estimates per 1K tokens (in USD) — rough API mode estimates
const TOKEN_COST_PER_1K: Record<string, number> = {
  opus: 0.015,
  sonnet: 0.003,
  haiku: 0.00025,
};

function estimateCost(model: string, tokens: number): number {
  const rate = TOKEN_COST_PER_1K[model] ?? 0;
  return (tokens / 1000) * rate;
}

function formatModelTable(breakdown: ModelBreakdown[], isApiMode: boolean): string {
  const headers = isApiMode
    ? ['Model', 'Calls', 'Tokens', 'Est. Cost (USD)']
    : ['Model', 'Calls', 'Tokens'];

  const rows = breakdown.map((b) => {
    const base = [b.model, String(b.calls), String(b.tokens)];
    if (isApiMode) {
      base.push(`$${estimateCost(b.model, b.tokens).toFixed(4)}`);
    }
    return base;
  });

  return formatTable(headers, rows);
}

function formatSprintTable(sprints: SprintUsage[], isApiMode: boolean): string {
  const headers = isApiMode
    ? ['Sprint', 'Calls', 'Tokens', 'Est. Cost (USD)']
    : ['Sprint', 'Calls', 'Tokens'];

  const rows = sprints.map((s) => {
    const totalCost = s.modelBreakdown.reduce(
      (sum, b) => sum + estimateCost(b.model, b.tokens),
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

export interface UsageCommandOptions {
  json?: boolean;
  sprint?: string;
  projectRoot?: string;
}

export function buildUsageOutput(
  tracker: UsageTracker,
  opts: UsageCommandOptions = {},
): { text: string; data: unknown } {
  const isApiMode = false; // TODO: read from config when API mode is implemented

  if (opts.sprint) {
    const sprintUsage = tracker.getSprintUsage(opts.sprint);

    if (sprintUsage.totalCalls === 0) {
      const text = `No usage data found for sprint: ${opts.sprint}`;
      return { text, data: sprintUsage };
    }

    const table = formatModelTable(sprintUsage.modelBreakdown, isApiMode);
    const lines = [
      `Sprint: ${sprintUsage.sprintId}`,
      `Total Calls: ${sprintUsage.totalCalls} | Total Tokens: ${sprintUsage.totalTokens}`,
      '',
      'Model Breakdown:',
      table,
    ];

    return { text: lines.join('\n'), data: sprintUsage };
  }

  const total: TotalUsage = tracker.getTotalUsage();

  if (total.totalCalls === 0) {
    const text = [
      'No usage data found.',
      'Run a sprint first to track usage metrics.',
    ].join('\n');
    return { text, data: total };
  }

  const sprints = tracker.listSprints();
  const sprintUsages = sprints.map((id) => tracker.getSprintUsage(id));

  const modelTable = formatModelTable(total.modelBreakdown, isApiMode);
  const sprintTable = formatSprintTable(sprintUsages, isApiMode);

  const lines = [
    `Total Sprints: ${total.sprintCount} | Total Calls: ${total.totalCalls} | Total Tokens: ${total.totalTokens}`,
    '',
    'Model Breakdown:',
    modelTable,
    '',
    'Sprint History:',
    sprintTable,
  ];

  return { text: lines.join('\n'), data: { total, sprints: sprintUsages } };
}

export function registerUsage(program: Command): void {
  program
    .command('usage')
    .description('Show usage metrics')
    .option('--json', 'Output as JSON')
    .option('--sprint <id>', 'Filter by sprint ID')
    .action((opts: UsageCommandOptions) => {
      try {
        const root = resolveProjectRoot();
        const tracker = new UsageTracker(root);
        const { text, data } = buildUsageOutput(tracker, opts);

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
