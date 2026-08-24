import { posix } from 'node:path';
import { createHash } from 'node:crypto';
import type { Task } from './types.js';
import type { TaskScope } from './task-types.js';

export const CANONICAL_SCOPE_MANIFEST_VERSION = 1 as const;
export const CANONICAL_SCOPE_POLICY_VERSION = 'portable-scope-v1' as const;

export type ScopeSelector =
  | { readonly kind: 'exact-file'; readonly path: string }
  | { readonly kind: 'directory-tree'; readonly path: string }
  | { readonly kind: 'glob'; readonly pattern: string };

type PathScopeSelector = Extract<ScopeSelector, { readonly path: string }>;

export type CanonicalScopeHoldCode =
  | 'INVALID_PATH'
  | 'LEGACY_WILDCARD_REQUIRES_SELECTOR'
  | 'UNSUPPORTED_GLOB'
  | 'PORTABLE_PATH_COLLISION'
  | 'SYMLINK_AMBIGUITY';

export interface CanonicalScopeHold {
  readonly code: CanonicalScopeHoldCode;
  readonly field: 'directories' | 'filesRead' | 'filesWrite' | 'inventory';
  readonly value: string;
}

export interface CanonicalScopeManifest {
  readonly version: typeof CANONICAL_SCOPE_MANIFEST_VERSION;
  readonly policyVersion: typeof CANONICAL_SCOPE_POLICY_VERSION;
  readonly policyDigest: string;
  readonly digest: string;
  readonly selectors: Readonly<{
    readonly directories: readonly ScopeSelector[];
    readonly filesRead: readonly ScopeSelector[];
    readonly filesWrite: readonly ScopeSelector[];
  }>;
  readonly scope: Readonly<{
    readonly directories: readonly string[];
    readonly filesRead: readonly string[];
    readonly filesWrite: readonly string[];
  }>;
}

export type CanonicalScopeCompileResult =
  | { readonly ok: true; readonly manifest: CanonicalScopeManifest }
  | { readonly ok: false; readonly holds: readonly CanonicalScopeHold[] };

export interface CompileCanonicalScopeInput {
  readonly scope: TaskScope;
  /** Deterministic project inventory. Required to expand directory-tree selectors. */
  readonly inventory?: readonly string[];
  /** Paths the inventory provider could not prove are non-symlinks. */
  readonly ambiguousSymlinks?: readonly string[];
}

function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => compareCodePoint(a, b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function containsWildcard(value: string): boolean {
  return /[*?[\]{}!]/.test(value);
}

function normalizePortablePath(value: string): { path: string; key: string } | undefined {
  const input = value.trim().normalize('NFC').replace(/\\/g, '/');
  if (
    input.length === 0
    || input.startsWith('/')
    || input.startsWith('//')
    || /^[A-Za-z]:($|\/)/.test(input)
  ) return undefined;
  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return undefined;
      segments.pop();
      continue;
    }
    if (segment.includes('\0') || segment.includes(':')) return undefined;
    segments.push(segment);
  }
  if (segments.length === 0) return undefined;
  const path = segments.join('/');
  return { path, key: path.toLowerCase() };
}

/**
 * Pure admission compiler for legacy TaskScope strings. Wildcards never receive
 * implicit prefix/glob semantics: callers must migrate them to an explicit
 * selector API before admission. The returned manifest is the sole exact scope
 * authority for prompt compilation and downstream consumers.
 */
export function compileCanonicalScope(input: CompileCanonicalScopeInput): CanonicalScopeCompileResult {
  const holds: CanonicalScopeHold[] = [];
  const inventoryByKey = new Map<string, string>();
  const inventoryCollisions = new Map<string, Set<string>>();
  const inventory: string[] = [];
  for (const raw of input.inventory ?? []) {
    const normalized = normalizePortablePath(raw);
    if (!normalized) {
      holds.push({ code: 'INVALID_PATH', field: 'inventory', value: raw });
      continue;
    }
    const previous = inventoryByKey.get(normalized.key);
    if (previous && previous !== normalized.path) {
      const variants = inventoryCollisions.get(normalized.key) ?? new Set([previous]);
      variants.add(normalized.path);
      inventoryCollisions.set(normalized.key, variants);
    } else if (!previous) {
      inventoryByKey.set(normalized.key, normalized.path);
    }
    inventory.push(normalized.path);
  }
  const ambiguous = new Set<string>();
  for (const raw of input.ambiguousSymlinks ?? []) {
    const normalized = normalizePortablePath(raw);
    if (!normalized) holds.push({ code: 'INVALID_PATH', field: 'inventory', value: raw });
    else ambiguous.add(normalized.key);
  }

  const parse = (
    values: readonly string[],
    field: CanonicalScopeHold['field'],
    kind: PathScopeSelector['kind'],
  ): PathScopeSelector[] => values.flatMap(raw => {
    if (containsWildcard(raw)) {
      holds.push({ code: 'LEGACY_WILDCARD_REQUIRES_SELECTOR', field, value: raw });
      return [];
    }
    const normalized = normalizePortablePath(raw);
    if (!normalized) {
      holds.push({ code: 'INVALID_PATH', field, value: raw });
      return [];
    }
    if (ambiguous.has(normalized.key)) {
      holds.push({ code: 'SYMLINK_AMBIGUITY', field, value: raw });
      return [];
    }
    return [{ kind, path: normalized.path }];
  });

  const directorySelectors = parse(input.scope.directories ?? [], 'directories', 'directory-tree');
  const readSelectors = parse(input.scope.filesRead ?? [], 'filesRead', 'exact-file');
  const writeSelectors = parse(input.scope.filesWrite ?? [], 'filesWrite', 'exact-file');
  const authoredSelectors: readonly PathScopeSelector[] = [
    ...directorySelectors,
    ...readSelectors,
    ...writeSelectors,
  ];
  for (const [key, variants] of inventoryCollisions) {
    const isSelected = authoredSelectors.some(selector => {
      const selectorKey = selector.path.toLowerCase();
      return selector.kind === 'exact-file'
        ? selectorKey === key
        : key === selectorKey || key.startsWith(`${selectorKey}/`);
    });
    if (isSelected) {
      holds.push({
        code: 'PORTABLE_PATH_COLLISION',
        field: 'inventory',
        value: [...variants].sort(compareCodePoint).join('|'),
      });
    }
  }
  if (holds.length > 0) return { ok: false, holds: Object.freeze(holds) };

  const sortSelectors = (values: ScopeSelector[]): readonly ScopeSelector[] => Object.freeze(
    [...new Map(values.map(value => [`${value.kind}:${'path' in value ? value.path : value.pattern}`, value])).values()]
      .sort((a, b) => compareCodePoint(canonicalJson(a), canonicalJson(b)))
      .map(value => Object.freeze(value)),
  );
  const selectors = Object.freeze({
    directories: sortSelectors(directorySelectors),
    filesRead: sortSelectors(readSelectors),
    filesWrite: sortSelectors(writeSelectors),
  });
  const writes = [...new Set(writeSelectors.map(selector => selector.path))].sort(compareCodePoint);
  const writeKeys = new Set(writes.map(path => path.toLowerCase()));
  const reads = [...new Set(readSelectors.map(selector => selector.path))]
    .filter(path => !writeKeys.has(path.toLowerCase())).sort(compareCodePoint);
  const directories = [...new Set(directorySelectors.map(selector => selector.path))].sort(compareCodePoint);
  const policyIdentity = {
    version: CANONICAL_SCOPE_MANIFEST_VERSION,
    policyVersion: CANONICAL_SCOPE_POLICY_VERSION,
    rules: ['slash', 'NFC', 'portable-casefold', 'no-drive-UNC-root-escape', 'symlink-hold'],
  };
  const payload = { ...policyIdentity, selectors, scope: { directories, filesRead: reads, filesWrite: writes }, inventory: [...new Set(inventory)].sort(compareCodePoint) };
  return {
    ok: true,
    manifest: Object.freeze({
      version: CANONICAL_SCOPE_MANIFEST_VERSION,
      policyVersion: CANONICAL_SCOPE_POLICY_VERSION,
      policyDigest: sha256(policyIdentity),
      digest: sha256(payload),
      selectors,
      scope: Object.freeze({ directories: Object.freeze(directories), filesRead: Object.freeze(reads), filesWrite: Object.freeze(writes) }),
    }),
  };
}

export interface ExecutionWriteScopePolicy {
  readonly mode: 'closed-allowlist';
  readonly filesWrite: readonly string[];
  /**
   * Exact owner-authorized outputs that did not exist in the PLAN-time tracked
   * projection. The classification is digest-bound so START never guesses
   * whether a missing path is an intentional greenfield output or drift.
   */
  readonly plannedNewFiles?: readonly string[];
}

export type ExecutionWriteScopeViolationCode =
  | 'INVALID_ALLOWLIST_PATH'
  | 'ALLOWLIST_PATH_NOT_TRACKED'
  | 'TASK_WRITE_OUTSIDE_ALLOWLIST'
  | 'WRITE_PATH_NOT_PRESENT'
  | 'PLANNED_NEW_PATH_ALREADY_TRACKED'
  | 'PLANNED_NEW_PATH_PRESENT'
  | 'PLANNED_NEW_PATH_OUTSIDE_ALLOWLIST';

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
  const plannedNewFiles: string[] = [];
  for (const value of policy.plannedNewFiles ?? []) {
    const path = canonicalRelativePath(value);
    if (!path) {
      throw new TypeError(`execution-write-scope-policy: invalid planned-new repository-relative path '${value}'`);
    }
    plannedNewFiles.push(path);
  }
  const filesWrite = [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
  const writeSet = new Set(filesWrite);
  const plannedNew = [...new Set(plannedNewFiles)].sort((a, b) => a.localeCompare(b));
  const outside = plannedNew.find(path => !writeSet.has(path));
  if (outside) {
    throw new TypeError(
      `execution-write-scope-policy: planned-new path '${outside}' is outside filesWrite`,
    );
  }
  return Object.freeze({
    mode: 'closed-allowlist',
    filesWrite: Object.freeze(filesWrite),
    ...(plannedNew.length > 0 ? { plannedNewFiles: Object.freeze(plannedNew) } : {}),
  });
}

/**
 * Convert explicitly acknowledged untracked allowlist entries into
 * digest-bound greenfield intent. Callers must only set `authorizeNewPaths`
 * from an owner approval surface; ordinary planning keeps failing closed.
 */
export function bindExecutionWriteScopePolicy(
  policy: ExecutionWriteScopePolicy,
  trackedFiles: readonly string[],
  authorizeNewPaths: boolean,
): ExecutionWriteScopePolicy {
  const normalized = normalizeExecutionWriteScopePolicy(policy);
  if (!authorizeNewPaths) return normalized;
  const tracked = canonicalSet(trackedFiles);
  return normalizeExecutionWriteScopePolicy({
    ...normalized,
    plannedNewFiles: normalized.filesWrite.filter(path => !tracked.has(path)),
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
  const plannedNew = new Set(policy.plannedNewFiles ?? []);
  const tracked = input.trackedFiles ? canonicalSet(input.trackedFiles) : undefined;
  const present = input.presentFiles ? canonicalSet(input.presentFiles) : undefined;
  const violations: ExecutionWriteScopeViolation[] = [];

  for (const path of policy.filesWrite) {
    if (tracked) {
      if (plannedNew.has(path) && tracked.has(path)) {
        violations.push({ code: 'PLANNED_NEW_PATH_ALREADY_TRACKED', path });
      } else if (!plannedNew.has(path) && !tracked.has(path)) {
        violations.push({ code: 'ALLOWLIST_PATH_NOT_TRACKED', path });
      }
    }
    if (present) {
      if (plannedNew.has(path) && present.has(path)) {
        violations.push({ code: 'PLANNED_NEW_PATH_PRESENT', path });
      } else if (!plannedNew.has(path) && !present.has(path)) {
        violations.push({ code: 'WRITE_PATH_NOT_PRESENT', path });
      }
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
