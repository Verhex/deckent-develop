import type { ExactDockerCommandDiagnosticV1 } from './exact-docker-command-diagnostic.js';
import { spawn as nodeSpawn } from 'node:child_process';
import { EXECUTION_EFFECT_PORTABLE_PATH_LIMITS } from '../core/execution-write-scope-policy.js';

export interface ExactDockerWorkspaceCommandInputV1 {
  readonly command: 'git' | 'docker';
  readonly args: readonly string[];
  readonly stdin: Uint8Array;
  readonly timeoutMs: number;
  readonly stdoutCeiling: number;
  readonly stderrCeiling: number;
}

export interface ExactDockerWorkspaceCommandResultV1 {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly error: boolean;
  readonly overflow: boolean;
  readonly diagnostic?: ExactDockerCommandDiagnosticV1;
}

export type ExactDockerWorkspaceCommandRunnerV1 = (
  input: ExactDockerWorkspaceCommandInputV1,
) => Promise<ExactDockerWorkspaceCommandResultV1>;

export function runExactDockerWorkspaceCommand(
  input: ExactDockerWorkspaceCommandInputV1,
): Promise<ExactDockerWorkspaceCommandResultV1> {
  const valid = (input.command === 'git' || input.command === 'docker')
    && Array.isArray(input.args) && input.args.length <= 512
    && input.args.every(value => typeof value === 'string' && !value.includes('\0')
      && Buffer.byteLength(value, 'utf8') <= 64 * 1024)
    && input.stdin instanceof Uint8Array
    && input.stdin.byteLength <= EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxTotalPathBytes
    && Number.isSafeInteger(input.timeoutMs) && input.timeoutMs > 0 && input.timeoutMs <= 3_600_000
    && Number.isSafeInteger(input.stdoutCeiling) && input.stdoutCeiling >= 0
    && input.stdoutCeiling <= 32 * 1024 * 1024
    && Number.isSafeInteger(input.stderrCeiling) && input.stderrCeiling >= 0
    && input.stderrCeiling <= 16 * 1024 * 1024;
  if (!valid) {
    return Promise.resolve(Object.freeze({
      status: null,
      signal: null,
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      error: true,
      overflow: false,
    }));
  }
  return new Promise(resolveCommand => {
    let child: ReturnType<typeof nodeSpawn>;
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let error = false;
    let overflow = false;
    let settled = false;
    let timedOut = false;
    const started = performance.now();
    let reason: ExactDockerCommandDiagnosticV1['reason'] = 'exit';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (status: number | null, signal: NodeJS.Signals | null,
      observedStatus = status, observedSignal = signal): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveCommand(Object.freeze({
        status,
        signal,
        stdout,
        stderr,
        error,
        overflow,
        diagnostic: Object.freeze({ reason, exitCode: observedStatus, signaled: observedSignal !== null,
          timeoutMs: input.timeoutMs, elapsedMs: performance.now() - started,
          stdoutBytes: stdout.byteLength, stderrBytes: stderr.byteLength }),
      }));
    };
    const append = (
      current: Buffer<ArrayBufferLike>,
      value: string | Buffer<ArrayBufferLike>,
      ceiling: number,
    ): Buffer<ArrayBufferLike> => {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = ceiling - current.byteLength;
      if (bytes.byteLength > remaining) {
        overflow = true;
        if (reason === 'exit') reason = 'overflow';
        try { child.kill('SIGKILL'); } catch { /* exact HOLD still follows */ }
      }
      return remaining <= 0
        ? current : Buffer.concat([current, bytes.subarray(0, Math.max(0, remaining))]);
    };
    try {
      child = nodeSpawn(input.command, [...input.args], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      resolveCommand(Object.freeze({
        status: null,
        signal: null,
        stdout,
        stderr,
        error: true,
        overflow: false,
        diagnostic: Object.freeze({ reason: 'spawn-error', exitCode: null, signaled: false,
          timeoutMs: input.timeoutMs, elapsedMs: performance.now() - started,
          stdoutBytes: stdout.byteLength, stderrBytes: stderr.byteLength }),
      }));
      return;
    }
    child.stdout?.on('data', value => {
      stdout = append(stdout, value as string | Buffer<ArrayBufferLike>, input.stdoutCeiling);
    });
    child.stderr?.on('data', value => {
      stderr = append(stderr, value as string | Buffer<ArrayBufferLike>, input.stderrCeiling);
    });
    child.stdin?.once('error', () => {
      error = true;
      if (reason === 'exit') reason = 'stdin-error';
      try { child.kill('SIGKILL'); } catch { /* close resolves */ }
    });
    child.once('error', () => { error = true; if (reason === 'exit') reason = 'process-error'; });
    child.once('close', (status, signal) => finish(timedOut ? null : status, timedOut ? null : signal, status, signal));
    child.stdin?.end(Buffer.from(input.stdin));
    timer = setTimeout(() => {
      timedOut = true;
      if (reason === 'exit') reason = 'timeout';
      error = true;
      try { child.kill('SIGKILL'); } catch { /* close may already be pending */ }
      // Resolve only on close: timeout is not proof that the child retired.
    }, input.timeoutMs);
    timer.unref();
  });
}
