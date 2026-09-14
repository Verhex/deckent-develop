import { types } from 'node:util';

export const EXACT_DOCKER_COMMAND_REASONS = ['invalid-input', 'spawn-error', 'stdin-error',
  'process-error', 'timeout', 'overflow', 'exit', 'unavailable'] as const;
export interface ExactDockerCommandDiagnosticV1 {
  readonly reason: typeof EXACT_DOCKER_COMMAND_REASONS[number];
  readonly exitCode: number | null;
  readonly signaled: boolean;
  readonly timeoutMs: number;
  readonly elapsedMs: number | null;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
}

/** Diagnostic data only: no commands, paths, output bytes or authority. */
export function parseExactDockerCommandDiagnostic(value: unknown): ExactDockerCommandDiagnosticV1 | null {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return null;
  const keys = ['reason', 'exitCode', 'signaled', 'timeoutMs', 'elapsedMs', 'stdoutBytes', 'stderrBytes'];
  if (Reflect.ownKeys(value).length !== keys.length) return null;
  const row: Record<string, unknown> = {};
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field || !('value' in field)) return null;
    row[key] = field.value;
  }
  if (!EXACT_DOCKER_COMMAND_REASONS.includes(row.reason as ExactDockerCommandDiagnosticV1['reason'])
    || !(row.exitCode === null || (Number.isSafeInteger(row.exitCode) && (row.exitCode as number) >= -0x80000000 && (row.exitCode as number) <= 0xffffffff))
    || typeof row.signaled !== 'boolean'
    || !(row.elapsedMs === null || (typeof row.elapsedMs === 'number' && Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0))
    || !['timeoutMs', 'stdoutBytes', 'stderrBytes'].every(key => Number.isSafeInteger(row[key]) && (row[key] as number) >= 0)) return null;
  return Object.freeze(row) as unknown as ExactDockerCommandDiagnosticV1;
}
