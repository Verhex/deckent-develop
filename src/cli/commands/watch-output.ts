import type { Command } from 'commander';

import { attendedExecutionProjectId } from '../../core/attended-execution-approval.js';
import { resolveLocalOsPrincipal, type VerifiedPrincipal } from '../../core/principal.js';
import {
  projectTaskOutput,
  type TaskOutputProjectionEvent,
  type TaskOutputProjectionResult,
} from '../../core/task-output-projection.js';
import type { TaskOutputReadService } from '../../core/task-output-read-service.js';
import {
  readTaskOutputViewPolicy,
  TaskOutputViewPolicyError,
  type TaskOutputViewPolicy,
} from '../../core/task-output-view-policy.js';
import { createExactDockerTaskOutputReadService } from '../../orchestra/spawn-backend-docker.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { resolveProjectRoot } from '../helpers/process.js';

export interface WatchOutputOptions {
  readonly tail?: string;
  readonly follow?: boolean;
  readonly sprintId?: string;
  readonly attemptId?: string;
  readonly dispatchRequestId?: string;
  readonly json?: boolean;
  readonly lang?: string;
}

interface AsyncOutputSink {
  write(chunk: string, callback: (error?: Error | null) => void): boolean;
  on(event: 'error' | 'close', listener: (error?: Error) => void): unknown;
  removeListener(event: 'error' | 'close', listener: (error?: Error) => void): unknown;
}

interface SignalHost {
  on(signal: NodeJS.Signals, listener: () => void): unknown;
  removeListener(signal: NodeJS.Signals, listener: () => void): unknown;
}

export interface WatchOutputDeps {
  readonly resolveProjectRootFn?: () => string;
  readonly readPolicy?: (projectRoot: string) => TaskOutputViewPolicy;
  readonly createService?: (projectRoot: string) => TaskOutputReadService;
  readonly resolvePrincipal?: () => VerifiedPrincipal;
  readonly stdout?: AsyncOutputSink;
  readonly signalHost?: SignalHost;
  readonly platform?: NodeJS.Platform;
  readonly setExitCode?: (code: number) => void;
}

function localLanguage(value: string | undefined): string {
  return value === 'en' || value === 'tr' ? value : getLanguage(undefined);
}

function humanEvent(event: TaskOutputProjectionEvent, lang: string): readonly string[] {
  if (event.type === 'lines') {
    return [
      ...event.lines,
      ...(event.omittedLines > 0
        ? [getMessage('outputView.lines.omitted', lang, { count: String(event.omittedLines) })]
        : []),
    ];
  }
  if (event.type === 'observation-end') {
    if (event.result.state === 'closed') return [getMessage('outputView.end.closed', lang)];
    if (event.result.state === 'aborted') return [getMessage('outputView.end.aborted', lang)];
    return [getMessage('outputView.end.unavailable', lang, {
      reasonCode: event.result.reasonCode,
    })];
  }
  const result = event.result;
  if (result.state === 'sealed') return [getMessage('outputView.state.sealed', lang, {
    taskId: result.identity.taskId, attemptId: result.identity.attemptId,
  })];
  if (result.state === 'pending') return [getMessage('outputView.state.pending', lang, {
    phase: result.phase,
  })];
  if (result.state === 'not-dispatched') {
    return [getMessage('outputView.state.not_dispatched', lang, {
      reasonCode: result.reasonCode,
    })];
  }
  if (result.state === 'ambiguous') return [getMessage('outputView.state.ambiguous', lang, {
    candidateCount: String(result.candidateCount),
  })];
  if (result.state === 'unavailable') return [getMessage('outputView.state.unavailable', lang, {
    reasonCode: result.detailCode ?? result.reasonCode,
  })];
  return [getMessage('outputView.state.denied', lang, { reasonCode: result.reasonCode })];
}

/** Shared canonical/legacy executor. Closing this view only aborts its observer client. */
export async function executeWatchOutput(
  taskId: string,
  options: WatchOutputOptions,
  deps: WatchOutputDeps = {},
): Promise<TaskOutputProjectionResult | null> {
  const lang = localLanguage(options.lang);
  const stdout = deps.stdout ?? process.stdout;
  const signalHost = deps.signalHost ?? process;
  const controller = new AbortController();
  let sinkUnavailable = false;
  const stopView = (): void => controller.abort();
  const outputClosed = (): void => {
    sinkUnavailable = true;
    controller.abort();
  };
  signalHost.on('SIGINT', stopView);
  signalHost.on('SIGTERM', stopView);
  if ((deps.platform ?? process.platform) === 'win32') signalHost.on('SIGBREAK', stopView);
  stdout.on('error', outputClosed);
  stdout.on('close', outputClosed);
  const write = (line: string): Promise<void> => new Promise((resolve, reject) => {
    stdout.write(`${line}\n`, error => {
      if (!error) resolve();
      else {
        sinkUnavailable = true;
        controller.abort();
        reject(error);
      }
    });
  });
  const setFailure = (): void => (deps.setExitCode ?? (code => { process.exitCode = code; }))(1);
  try {
    if (options.lang !== undefined && options.lang !== 'en' && options.lang !== 'tr') {
      await write(options.json
        ? JSON.stringify({ type: 'end', result: { state: 'held', reason: 'invalid-view' } })
        : getMessage('outputView.lang_invalid', lang));
      setFailure();
      return null;
    }
    const tail = options.tail ?? '50';
    if (!/^(?:0|[1-9][0-9]*)$/u.test(tail)) {
      await write(options.json
        ? JSON.stringify({ type: 'end', result: { state: 'held', reason: 'invalid-view' } })
        : getMessage('outputView.end.held', lang, { reasonCode: 'invalid-view' }));
      setFailure();
      return null;
    }
    const root = (deps.resolveProjectRootFn ?? resolveProjectRoot)();
    let policy: TaskOutputViewPolicy;
    try { policy = (deps.readPolicy ?? readTaskOutputViewPolicy)(root); }
    catch (error) {
      const reasonCode = error instanceof TaskOutputViewPolicyError
        ? error.code : 'CONFIG_UNAVAILABLE';
      await write(options.json
        ? JSON.stringify({ type: 'end', result: { state: 'held', reasonCode } })
        : getMessage('outputView.policy_unavailable', lang, { reasonCode }));
      setFailure();
      return null;
    }
    const principal = (deps.resolvePrincipal ?? (() => resolveLocalOsPrincipal('cli')))();
    const service = (deps.createService ?? createExactDockerTaskOutputReadService)(root);
    let stateFailed = false;
    const result = await projectTaskOutput(service, {
      query: {
        projectId: attendedExecutionProjectId(root), taskId,
        ...(options.sprintId ? { sprintId: options.sprintId } : {}),
        ...(options.attemptId ? { attemptId: options.attemptId } : {}),
        ...(options.dispatchRequestId
          ? { dispatchRequestId: options.dispatchRequestId } : {}),
        caller: { id: principal.id, ...(principal.tenantId ? { tenantId: principal.tenantId } : {}) },
        strictTenantIsolation: policy.strictTenantIsolation,
      },
      tail: Number(tail),
      follow: options.follow ?? false,
      signal: controller.signal,
      limits: policy.limits,
      redactionLabel: getMessage('outputView.redaction_label', lang),
      onEvent: async event => {
        if (event.type === 'state' && ['ambiguous', 'unavailable', 'denied'].includes(event.result.state)) {
          stateFailed = true;
        }
        if (options.json) await write(JSON.stringify(event));
        else for (const line of humanEvent(event, lang)) await write(line);
      },
    });
    if (options.json) await write(JSON.stringify({ type: 'end', result }));
    else if (result.state === 'held') {
      await write(getMessage('outputView.end.held', lang, { reasonCode: result.reason }));
    } else if (result.state === 'not-observed' && !stateFailed) {
      await write(getMessage('outputView.end.not_observed', lang));
    }
    if (stateFailed || result.state === 'held'
      || (result.state === 'live-view' && result.observation.state === 'unavailable')) {
      setFailure();
    }
    return result;
  } catch {
    if (!sinkUnavailable) {
      try {
        await write(options.json
          ? JSON.stringify({ type: 'end', result: { state: 'held', reason: 'reader-failed' } })
          : getMessage('outputView.end.held', lang, { reasonCode: 'reader-failed' }));
      } catch { /* the sink closed while reporting the bounded failure */ }
    }
    if (!controller.signal.aborted || !sinkUnavailable) setFailure();
    return null;
  } finally {
    signalHost.removeListener('SIGINT', stopView);
    signalHost.removeListener('SIGTERM', stopView);
    if ((deps.platform ?? process.platform) === 'win32') {
      signalHost.removeListener('SIGBREAK', stopView);
    }
    stdout.removeListener('error', outputClosed);
    stdout.removeListener('close', outputClosed);
  }
}

export function configureWatchOutputCommand(
  command: Command,
  deps: WatchOutputDeps = {},
  beforeExecute?: (options: WatchOutputOptions) => void,
): Command {
  return command
    .description(getMessage('cli.watch.output.desc', getLanguage(undefined)))
    .argument('<taskId>', getMessage('outputView.arg.task_id', getLanguage(undefined)))
    .option('--tail <n>', getMessage('outputView.opt.tail', getLanguage(undefined)), '50')
    .option('--follow', getMessage('outputView.opt.follow', getLanguage(undefined)))
    .option('--sprint-id <id>', getMessage('outputView.opt.sprint_id', getLanguage(undefined)))
    .option('--attempt-id <id>', getMessage('outputView.opt.attempt_id', getLanguage(undefined)))
    .option('--dispatch-request-id <id>', getMessage('outputView.opt.dispatch_request_id', getLanguage(undefined)))
    .option('--json', getMessage('outputView.opt.json', getLanguage(undefined)))
    .option('--lang <lang>', getMessage('outputView.opt.lang', getLanguage(undefined)))
    .action(async (taskId: string, options: WatchOutputOptions) => {
      beforeExecute?.(options);
      await executeWatchOutput(taskId, options, deps);
    });
}

export function registerWatchOutput(parent: Command, deps: WatchOutputDeps = {}): Command {
  return configureWatchOutputCommand(parent.command('output'), deps);
}
