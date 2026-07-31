import { posix } from 'node:path';
import type { Task } from './types.js';

export interface ExecutionWriteScopePolicy {
  readonly mode: 'closed-allowlist';
  readonly filesWrite: readonly string[];
}

export type ExecutionWriteScopeViolationCode =
  | 'INVALID_ALLOWLIST_PATH'
  | 'ALLOWLIST_PATH_NOT_TRACKED'
  | 'TASK_WRITE_OUTSIDE_ALLOWLIST'
  | 'WRITE_PATH_NOT_PRESENT';

export interface ExecutionWriteScopeViolation {
  readonly code: ExecutionWriteScopeViolationCode;
  readonly path: string;
  readonly taskId?: string;
}

export interface EvaluateExecutionWriteScopePolicyInput {
  readonly policy: ExecutionWriteScopePolicy;
  readonly tasks: readonly Pick<Task, 'id' | 'scope'>[];
  /** Authoritative PLAN-time repository projection. */
  readonly trackedFiles?: readonly string[];
  /** Exact-start disk projection; supplied paths are known to exist. */
  readonly presentFiles?: readonly string[];
}

function canonicalRelativePath(value: string): string | undefined {
  const slashNormalized = value.trim().replace(/\\/g, '/');
  if (
    slashNormalized.length === 0
    || slashNormalized.startsWith('/')
    || /^[A-Za-z]:\//.test(slashNormalized)
  ) return undefined;
  const normalized = posix.normalize(slashNormalized).replace(/^\.\//, '');
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) return undefined;
  return normalized;
}

export function normalizeExecutionWriteScopePolicy(
  policy: ExecutionWriteScopePolicy,
): ExecutionWriteScopePolicy {
  if (policy.mode !== 'closed-allowlist') {
    throw new TypeError(`execution-write-scope-policy: unsupported mode '${String(policy.mode)}'`);
  }
  const normalized: string[] = [];
  for (const value of policy.filesWrite) {
    const path = canonicalRelativePath(value);
    if (!path) {
      throw new TypeError(`execution-write-scope-policy: invalid repository-relative path '${value}'`);
    }
    normalized.push(path);
  }
  return Object.freeze({
    mode: 'closed-allowlist',
    filesWrite: Object.freeze([...new Set(normalized)].sort((a, b) => a.localeCompare(b))),
  });
}

function canonicalSet(values: readonly string[]): ReadonlySet<string> {
  const normalized = values
    .map(canonicalRelativePath)
    .filter((value): value is string => value !== undefined);
  return new Set(normalized);
}

export function evaluateExecutionWriteScopePolicy(
  input: EvaluateExecutionWriteScopePolicyInput,
): {
  readonly ok: boolean;
  readonly policy: ExecutionWriteScopePolicy;
  readonly violations: readonly ExecutionWriteScopeViolation[];
} {
  let policy: ExecutionWriteScopePolicy;
  try {
    policy = normalizeExecutionWriteScopePolicy(input.policy);
  } catch {
    return {
      ok: false,
      policy: input.policy,
      violations: input.policy.filesWrite.map(path => ({
        code: 'INVALID_ALLOWLIST_PATH' as const,
        path,
      })),
    };
  }
  const allowlist = new Set(policy.filesWrite);
  const tracked = input.trackedFiles ? canonicalSet(input.trackedFiles) : undefined;
  const present = input.presentFiles ? canonicalSet(input.presentFiles) : undefined;
  const violations: ExecutionWriteScopeViolation[] = [];

  for (const path of policy.filesWrite) {
    if (tracked && !tracked.has(path)) {
      violations.push({ code: 'ALLOWLIST_PATH_NOT_TRACKED', path });
    }
    if (present && !present.has(path)) {
      violations.push({ code: 'WRITE_PATH_NOT_PRESENT', path });
    }
  }
  for (const task of input.tasks) {
    for (const rawPath of task.scope.filesWrite ?? []) {
      const path = canonicalRelativePath(rawPath);
      if (!path || !allowlist.has(path)) {
        violations.push({
          code: 'TASK_WRITE_OUTSIDE_ALLOWLIST',
          path: path ?? rawPath,
          taskId: task.id,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    policy,
    violations: Object.freeze(violations),
  };
}
