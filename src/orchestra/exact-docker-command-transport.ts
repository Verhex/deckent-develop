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
