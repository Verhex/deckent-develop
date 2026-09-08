import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PROJECT_CONFIG_PATH } from './constants.js';
import { resolveGlobalConfigReadPath } from './global-scope-resolver.js';
import { DEFAULT_LIFECYCLE_RECOVERY_CONFIG } from './types.js';

export const DEFAULT_TASK_OUTPUT_VIEW_LIMITS = Object.freeze({
  maxPendingBytes: 1024 * 1024,
  maxTailLines: 10_000,
  maxTailBytes: 4 * 1024 * 1024,
});

export type TaskOutputViewPolicyErrorCode = 'CONFIG_UNAVAILABLE' | 'CONFIG_INVALID';

export class TaskOutputViewPolicyError extends Error {
  readonly code: TaskOutputViewPolicyErrorCode;

  constructor(code: TaskOutputViewPolicyErrorCode) {
    super(code);
    this.name = 'TaskOutputViewPolicyError';
    this.code = code;
  }
}

export interface TaskOutputViewPolicy {
  readonly strictTenantIsolation: boolean;
  readonly limits: Readonly<{
    readonly maxPendingBytes: number;
    readonly maxTailLines: number;
    readonly maxTailBytes: number;
    readonly termGraceMs: number;
    readonly reapObservationMs: number;
    readonly streamCloseMs: number;
  }>;
}

type RelevantLayer = Readonly<{
  strictTenantIsolation?: boolean;
  lifecycleRecovery?: {
    coordinator_termination_grace_ms?: number;
    termination_poll_interval_ms?: number;
    forced_termination_verify_ms?: number;
  };
}>;

function readRelevantLayer(path: string): RelevantLayer | null {
  let source: string;
  try { source = readFileSync(path, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new TaskOutputViewPolicyError('CONFIG_UNAVAILABLE');
  }
  let value: unknown;
  try { value = JSON.parse(source) as unknown; }
  catch { throw new TaskOutputViewPolicyError('CONFIG_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TaskOutputViewPolicyError('CONFIG_INVALID');
  }
  const record = value as Record<string, unknown>;
  const strict = record.strict_tenant_isolation;
  if (strict !== undefined && typeof strict !== 'boolean') {
    throw new TaskOutputViewPolicyError('CONFIG_INVALID');
  }
  const recoveryValue = record.lifecycle_recovery;
  let lifecycleRecovery: RelevantLayer['lifecycleRecovery'];
  if (recoveryValue !== undefined) {
    if (!recoveryValue || typeof recoveryValue !== 'object' || Array.isArray(recoveryValue)) {
      throw new TaskOutputViewPolicyError('CONFIG_INVALID');
    }
    const recovery = recoveryValue as Record<string, unknown>;
    const keys = [
      'coordinator_termination_grace_ms',
      'termination_poll_interval_ms',
      'forced_termination_verify_ms',
    ] as const;
    lifecycleRecovery = {};
    for (const key of keys) {
      const entry = recovery[key];
      if (entry === undefined) continue;
      const [min, max] = key === 'termination_poll_interval_ms'
        ? [10, 5_000] : [100, 60_000];
      if (!Number.isSafeInteger(entry) || Number(entry) < min || Number(entry) > max) {
        throw new TaskOutputViewPolicyError('CONFIG_INVALID');
      }
      lifecycleRecovery[key] = Number(entry);
    }
  }
  return Object.freeze({
    ...(strict === undefined ? {} : { strictTenantIsolation: strict }),
    ...(lifecycleRecovery === undefined ? {} : { lifecycleRecovery }),
  });
}

/** Read-only global→project policy projection; it never invokes config healing. */
export function readTaskOutputViewPolicy(projectRoot: string): TaskOutputViewPolicy {
  const recovery = { ...DEFAULT_LIFECYCLE_RECOVERY_CONFIG };
  let strictTenantIsolation = false;
  for (const path of [
    resolveGlobalConfigReadPath(),
    join(resolve(projectRoot), PROJECT_CONFIG_PATH),
  ]) {
    const layer = readRelevantLayer(path);
    if (!layer) continue;
    if (layer.strictTenantIsolation !== undefined) {
      strictTenantIsolation = layer.strictTenantIsolation;
    }
    Object.assign(recovery, layer.lifecycleRecovery ?? {});
  }
  if (recovery.termination_poll_interval_ms > recovery.coordinator_termination_grace_ms
    || recovery.termination_poll_interval_ms > recovery.forced_termination_verify_ms) {
    throw new TaskOutputViewPolicyError('CONFIG_INVALID');
  }
  return Object.freeze({
    strictTenantIsolation,
    limits: Object.freeze({
      ...DEFAULT_TASK_OUTPUT_VIEW_LIMITS,
      termGraceMs: recovery.coordinator_termination_grace_ms,
      reapObservationMs: recovery.forced_termination_verify_ms,
      streamCloseMs: recovery.forced_termination_verify_ms,
    }),
  });
}
