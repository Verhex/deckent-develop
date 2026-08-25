import type { Command } from 'commander';
import {
  listRunInspectorRuns,
  observeRunInspectorSnapshot,
  readRunInspectorTaskDetail,
} from '../../core/run-inspector-read-model.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { bindArgumentDescriptions } from '../helpers/message-catalog/cli-run.js';

type InspectorRecord = Record<string, unknown>;
type InspectorReader = (projectRoot: string, taskId: string) => unknown | Promise<unknown>;
type InspectorLister = (projectRoot: string) => unknown | Promise<unknown>;
type InspectorObserver = (
  projectRoot: string,
  onSnapshot: (snapshot: unknown) => void,
) => { close(): void };

interface FollowSignalSource {
  on(event: 'SIGINT' | 'close', listener: () => void): void;
  off(event: 'SIGINT' | 'close', listener: () => void): void;
}

export interface InspectCommandDependencies {
  readonly listRuns?: InspectorLister;
  readonly readTaskDetail?: InspectorReader;
  readonly observeSnapshot?: InspectorObserver;
  readonly followSignals?: FollowSignalSource;
  readonly projectRoot?: () => string;
  readonly output?: (value: string) => void;
  readonly followOutput?: (value: string) => void;
  readonly language?: string;
}

export interface InspectCommandOptions {
  readonly json?: boolean;
  readonly follow?: boolean;
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
  const detailText = fields
    .map(([key, value]) => `${getMessage(key, lang)}: ${display(value)}`)
    .join('\n');
  const logTail = record(lineage['logTail']);
  const hasLogTail = lineage['logTail'] !== null
    && typeof lineage['logTail'] === 'object'
    && !Array.isArray(lineage['logTail']);
  const lines = Array.isArray(logTail['lines'])
    ? logTail['lines'].filter((line): line is string => typeof line === 'string')
    : [];
  if (!hasLogTail) return detailText;
  const tailHeader = getMessage('inspect.log_tail.header', lang, {
    count: String(lines.length),
    truncated: display(logTail['truncated']),
  });
  return `${detailText}\n\n${tailHeader}\n${lines.join('\n')}`;
}

export function formatInspectFollowStatus(payload: unknown, lang: string): string {
  const snapshot = record(payload);
  const workers = Array.isArray(snapshot['workers'])
    ? snapshot['workers'].length
    : snapshot['workerCount'];
  return getMessage('inspect.follow.run_status', lang, {
    lifecycle: display(snapshot['lifecycle']),
    phase: display(snapshot['phase']),
    workers: display(workers),
    revision: display(snapshot['revision']),
  });
}

export function formatInspectFollowTask(payload: unknown, taskId: string, lang: string): string {
  const snapshot = record(payload);
  const tasks = Array.isArray(snapshot['tasks']) ? snapshot['tasks'] as unknown[] : [];
  const task = record(tasks.find((item) => record(item)['taskId'] === taskId));
  const heartbeat = record(task['heartbeat']);
  return getMessage('inspect.follow.task_status', lang, {
    taskId,
    status: display(task['status']),
    heartbeat: display(heartbeat['summary'] ?? heartbeat['currentAction'] ?? task['heartbeatSummary']),
    revision: display(snapshot['revision']),
  });
}

async function followInspector(
  taskId: string | undefined,
  root: string,
  lang: string,
  dependencies: InspectCommandDependencies,
): Promise<number> {
  const followOutput = dependencies.followOutput
    ?? dependencies.output
    ?? ((value: string) => process.stdout.write(value));
  const signals = dependencies.followSignals ?? {
    on(event: 'SIGINT' | 'close', listener: () => void) {
      (event === 'SIGINT' ? process : process.stdin).on(event, listener);
    },
    off(event: 'SIGINT' | 'close', listener: () => void) {
      (event === 'SIGINT' ? process : process.stdin).off(event, listener);
    },
  };
  return await new Promise<number>((resolve, reject) => {
    let observer: { close(): void } | undefined;
    let settled = false;
    const close = (): void => {
      if (settled) return;
      settled = true;
      signals.off('SIGINT', close);
      signals.off('close', close);
      observer?.close();
      resolve(0);
    };
    signals.on('SIGINT', close);
    signals.on('close', close);
    try {
      const onSnapshot = (snapshot: unknown): void => {
        const line = taskId === undefined
          ? formatInspectFollowStatus(snapshot, lang)
          : formatInspectFollowTask(snapshot, taskId, lang);
        followOutput(`\r\u001b[2K${line}`);
      };
      observer = dependencies.observeSnapshot
        ? dependencies.observeSnapshot(root, onSnapshot)
        : observeRunInspectorSnapshot(root, { onSnapshot });
    } catch (error) {
      signals.off('SIGINT', close);
      signals.off('close', close);
      reject(error);
    }
  });
}

export async function runInspectCommand(
  taskId: string | undefined,
  options: InspectCommandOptions = {},
  dependencies: InspectCommandDependencies = {},
): Promise<number> {
  const lang = dependencies.language ?? getLanguage(undefined);
  const root = (dependencies.projectRoot ?? resolveProjectRoot)();
  const output = dependencies.output ?? print;
  if (options.follow && options.json) {
    output(getMessage('inspect.error.follow_json', lang));
    return 1;
  }
  if (taskId === undefined) {
    const payload = await (dependencies.listRuns ?? listRunInspectorRuns)(root);
    output(options.json
      ? JSON.stringify(payload, null, 2)
      : formatInspectRunListing(payload, lang));
    return options.follow ? followInspector(undefined, root, lang, dependencies) : 0;
  }

  const payload = await (dependencies.readTaskDetail ?? readRunInspectorTaskDetail)(root, taskId);
  if (payload === null || payload === undefined) {
    output(getMessage('inspect.error.unknown_task', lang, { taskId }));
    return 1;
  }
  output(options.json
    ? JSON.stringify(payload, null, 2)
    : formatInspectTaskDetail(payload, lang));
  return options.follow ? followInspector(taskId, root, lang, dependencies) : 0;
}

export function registerInspect(
  program: Command,
  dependencies: InspectCommandDependencies = {},
): void {
  const lang = dependencies.language ?? getLanguage(undefined);
  bindArgumentDescriptions(program.command('inspect [taskId]'), lang, { taskId: 'cliContract.inspect.arg.taskId' })
    .description(getMessage('inspect.description', lang))
    .option('--json', getMessage('inspect.option.json', lang))
    .option('--follow', getMessage('inspect.option.follow', lang))
    .action(async (taskId: string | undefined, options: InspectCommandOptions) => {
      const exitCode = await runInspectCommand(taskId, options, dependencies);
      if (exitCode !== 0) process.exitCode = exitCode;
    });
}
