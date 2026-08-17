import type { Command } from 'commander';
import {
  listRunInspectorRuns,
  readRunInspectorTaskDetail,
} from '../../core/run-inspector-read-model.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

type InspectorRecord = Record<string, unknown>;
type InspectorReader = (projectRoot: string, taskId: string) => unknown | Promise<unknown>;
type InspectorLister = (projectRoot: string) => unknown | Promise<unknown>;

export interface InspectCommandDependencies {
  readonly listRuns?: InspectorLister;
  readonly readTaskDetail?: InspectorReader;
  readonly projectRoot?: () => string;
  readonly output?: (value: string) => void;
  readonly language?: string;
}

export interface InspectCommandOptions {
  readonly json?: boolean;
}

function record(value: unknown): InspectorRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as InspectorRecord
    : {};
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function nested(source: InspectorRecord, key: string): InspectorRecord {
  return record(source[key]);
}

export function formatInspectRunListing(payload: unknown, lang: string): string {
  const runs = Array.isArray(record(payload)['runs'])
    ? record(payload)['runs'] as unknown[]
    : [];
  const header = [
    getMessage('inspect.column.run_id', lang),
    getMessage('inspect.column.state', lang),
    getMessage('inspect.column.source', lang),
    getMessage('inspect.column.settled_at', lang),
  ].join('\t');
  const rows = runs.map((item) => {
    const run = record(item);
    return [
      display(run['runId']),
      display(run['lifecycle'] ?? run['recordState']),
      display(run['source']),
      display(run['settledAt']),
    ].join('\t');
  });
  return [header, ...rows].join('\n');
}

export function formatInspectTaskDetail(payload: unknown, lang: string): string {
  const detail = record(payload);
  const heartbeat = nested(detail, 'heartbeat');
  const plan = nested(detail, 'plan');
  const result = nested(detail, 'result');
  const lineage = nested(detail, 'lineage');
  const heartbeatSummary = heartbeat['summary']
    ?? heartbeat['currentAction']
    ?? heartbeat['status']
    ?? detail['heartbeatSummary'];
  const fields: Array<[string, unknown]> = [
    ['inspect.field.task_id', detail['taskId']],
    ['inspect.field.status', detail['status']],
    ['inspect.field.agent', detail['agent'] ?? detail['agentId']],
    ['inspect.field.model', detail['model']],
    ['inspect.field.heartbeat', heartbeatSummary],
    ['inspect.field.plan_truncated', detail['planTruncated'] ?? plan['truncated']],
    ['inspect.field.self_assessment', result['selfAssessment'] ?? detail['selfAssessment']],
    ['inspect.field.lineage', lineage],
  ];
  return fields
    .map(([key, value]) => `${getMessage(key, lang)}: ${display(value)}`)
    .join('\n');
}

export async function runInspectCommand(
  taskId: string | undefined,
  options: InspectCommandOptions = {},
  dependencies: InspectCommandDependencies = {},
): Promise<number> {
  const lang = dependencies.language ?? getLanguage(undefined);
  const root = (dependencies.projectRoot ?? resolveProjectRoot)();
  const output = dependencies.output ?? print;
  if (taskId === undefined) {
    const payload = await (dependencies.listRuns ?? listRunInspectorRuns)(root);
    output(options.json
      ? JSON.stringify(payload, null, 2)
      : formatInspectRunListing(payload, lang));
    return 0;
  }

  const payload = await (dependencies.readTaskDetail ?? readRunInspectorTaskDetail)(root, taskId);
  if (payload === null || payload === undefined) {
    output(getMessage('inspect.error.unknown_task', lang, { taskId }));
    return 1;
  }
  output(options.json
    ? JSON.stringify(payload, null, 2)
    : formatInspectTaskDetail(payload, lang));
  return 0;
}

export function registerInspect(
  program: Command,
  dependencies: InspectCommandDependencies = {},
): void {
  const lang = dependencies.language ?? getLanguage(undefined);
  program
    .command('inspect [taskId]')
    .description(getMessage('inspect.description', lang))
    .option('--json', getMessage('inspect.option.json', lang))
    .action(async (taskId: string | undefined, options: InspectCommandOptions) => {
      const exitCode = await runInspectCommand(taskId, options, dependencies);
      if (exitCode !== 0) process.exitCode = exitCode;
    });
}
