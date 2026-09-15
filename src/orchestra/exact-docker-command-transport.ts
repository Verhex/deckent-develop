import { Worker } from 'node:worker_threads';
import { parseExactDockerCommandDiagnostic } from './exact-docker-command-diagnostic.js';
import type { ExactDockerWorkspaceCommandInputV1, ExactDockerWorkspaceCommandResultV1 } from './exact-docker-workspace-command.js';

export interface ExactDockerCaptureWindowInputV1 {
  readonly helper: ExactDockerWorkspaceCommandInputV1;
  readonly volumeName: string;
  readonly deadlineUnixMs: number;
}
export interface ExactDockerCaptureWindowResultV1 {
  readonly helper: ExactDockerWorkspaceCommandResultV1;
  readonly postGeneration: ExactDockerWorkspaceCommandResultV1 | null;
  readonly completedAt: string;
}

/** This transport owns no admission or settlement authority. The lifecycle
 * supplies an admitted helper command and independently validates the returned
 * volume generation, native capture and timestamps before creating a receipt. */
export async function runIsolatedExactDockerCaptureWindow(
  input: ExactDockerCaptureWindowInputV1,
): Promise<ExactDockerCaptureWindowResultV1 | null> {
  if (input.helper.command !== 'docker' || input.helper.args[0] !== 'run'
    || input.helper.stdin.byteLength !== 0
    || !/^deckent-xw-[a-f0-9]{48}$/u.test(input.volumeName)
    || !Number.isSafeInteger(input.deadlineUnixMs) || input.deadlineUnixMs <= 0) return null;
  const validResult = (value: ExactDockerWorkspaceCommandResultV1, stdoutCeiling: number, stderrCeiling: number): boolean =>
    !!value && (value.status === null || Number.isSafeInteger(value.status))
    && (value.signal === null || typeof value.signal === 'string')
    && typeof value.error === 'boolean' && typeof value.overflow === 'boolean'
    && value.stdout instanceof Uint8Array && value.stderr instanceof Uint8Array
    && value.stdout.byteLength <= stdoutCeiling && value.stderr.byteLength <= stderrCeiling
    && (value.diagnostic === undefined || parseExactDockerCommandDiagnostic(value.diagnostic) !== null);
  return new Promise(resolveResult => {
    let worker: Worker;
    let result: ExactDockerCaptureWindowResultV1 | null = null;
    try {
      worker = new Worker(new URL('./exact-docker-capture-window-worker.js', import.meta.url), {
        workerData: input,
        execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')),
      });
    } catch { resolveResult(null); return; }
    worker.once('message', (message: ExactDockerCaptureWindowResultV1) => {
      if (!message || !validResult(message.helper, input.helper.stdoutCeiling, input.helper.stderrCeiling)
        || (message.postGeneration !== null && !validResult(message.postGeneration, 1024 * 1024, 64 * 1024))
        || typeof message.completedAt !== 'string' || !Number.isFinite(Date.parse(message.completedAt))
        || new Date(Date.parse(message.completedAt)).toISOString() !== message.completedAt) return;
      result = Object.freeze(message);
    });
    worker.once('error', () => { result = null; });
    // Child close precedes the message; thread exit precedes delivery. A busy
    // coordinator can delay delivery, never change the observed completion time.
    worker.once('exit', code => resolveResult(code === 0 ? result : null));
  });
}

/** Execution transport only. Callers retain all admission, identity and effect
 * authority. Kept separate from the strictly read-only observation transport. */
export function isExactDockerIsolatedExecution(input: ExactDockerWorkspaceCommandInputV1): boolean {
  return input.command === 'docker' && Array.isArray(input.args)
    && (input.args[0] === 'rm' || input.args[0] === 'run'
      || (input.args[0] === 'volume' && input.args[1] === 'rm'));
}

export async function runIsolatedExactDockerExecution(
  input: ExactDockerWorkspaceCommandInputV1,
): Promise<ExactDockerWorkspaceCommandResultV1> {
  const unavailable = (): ExactDockerWorkspaceCommandResultV1 => Object.freeze({
    status: null, signal: null, stdout: new Uint8Array(), stderr: new Uint8Array(),
    error: true, overflow: false,
    diagnostic: { reason: 'unavailable' as const, exitCode: null, signaled: false,
      timeoutMs: Number.isSafeInteger(input.timeoutMs) && input.timeoutMs >= 0 ? input.timeoutMs : 0,
      elapsedMs: null, stdoutBytes: 0, stderrBytes: 0 },
  });
  if (!isExactDockerIsolatedExecution(input)) return unavailable();
  return new Promise(resolveResult => {
    let worker: Worker;
    let result: ExactDockerWorkspaceCommandResultV1 | null = null;
    let failed = false;
    try {
      worker = new Worker(new URL('./exact-docker-execution-worker.js', import.meta.url), {
        workerData: input,
        execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')),
      });
    } catch { resolveResult(unavailable()); return; }
    worker.on('message', (message: ExactDockerWorkspaceCommandResultV1) => {
      if (result || !message || (message.status !== null && !Number.isSafeInteger(message.status))
        || (message.signal !== null && typeof message.signal !== 'string')
        || typeof message.error !== 'boolean' || typeof message.overflow !== 'boolean'
        || !(message.stdout instanceof Uint8Array) || !(message.stderr instanceof Uint8Array)
        || message.stdout.byteLength > input.stdoutCeiling
        || message.stderr.byteLength > input.stderrCeiling
        || !parseExactDockerCommandDiagnostic(message.diagnostic)) {
        failed = true; return;
      }
      result = Object.freeze(message);
    });
    worker.once('error', () => { failed = true; });
    // No parent timer: delayed delivery is not a subprocess timeout. The worker
    // waits for child close, and transport retirement precedes result delivery.
    worker.once('exit', code => resolveResult(code === 0 && !failed && result ? result : unavailable()));
  });
}
