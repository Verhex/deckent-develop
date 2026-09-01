import { posix } from 'node:path';
import { createHash } from 'node:crypto';
import type { Task } from './types.js';
import type { TaskScope } from './task-types.js';

export const CANONICAL_SCOPE_MANIFEST_VERSION = 1 as const;
export const CANONICAL_SCOPE_POLICY_VERSION = 'portable-scope-v1' as const;
export const EXECUTION_EFFECT_WRITE_POLICY_VERSION = 1 as const;

export const EXECUTION_EFFECT_PORTABLE_PATH_LIMITS = Object.freeze({
  maxEntries: 100_000,
  maxPathBytes: 16 * 1024,
  maxNameBytes: 255,
  maxTotalPathBytes: 16 * 1024 * 1024,
});

export const EXECUTION_EFFECT_PROTECTED_TREES = Object.freeze([
  '.brain',
  '.deck',
  '.deckent',
  '.git',
  '.locks',
  '.tasks',
] as const);

export type ScopeSelector =
  | { readonly kind: 'exact-file'; readonly path: string }
  | { readonly kind: 'directory-tree'; readonly path: string }
  | { readonly kind: 'glob'; readonly pattern: string };

type PathScopeSelector = Extract<ScopeSelector, { readonly path: string }>;

export type CanonicalScopeHoldCode =
  | 'INVALID_PATH'
  | 'DIRECTORY_INTENT_REQUIRES_DIRECTORIES'
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

export type ExecutionEffectWritePolicyHoldCode =
  | 'INVALID_EXACT_WRITE_PATH'
  | 'WRITE_POLICY_ENTRY_LIMIT'
  | 'WRITE_POLICY_PATH_BYTES_LIMIT'
  | 'WRITE_POLICY_NAME_BYTES_LIMIT'
  | 'WRITE_POLICY_TOTAL_PATH_BYTES_LIMIT'
  | 'PROTECTED_WRITE_PATH'
  | 'PORTABLE_WRITE_PATH_COLLISION';

export interface ExecutionEffectWritePolicyHold {
  readonly code: ExecutionEffectWritePolicyHoldCode;
  readonly path: string;
}

export interface ExecutionEffectWritePolicy {
  readonly version: typeof EXECUTION_EFFECT_WRITE_POLICY_VERSION;
  readonly mode: 'exact-files-write';
  readonly readOnly: boolean;
  readonly filesWrite: readonly string[];
  readonly protectedTrees: typeof EXECUTION_EFFECT_PROTECTED_TREES;
  readonly digest: string;
}

export type ExecutionEffectWritePolicyCompileResult =
  | { readonly ok: true; readonly policy: ExecutionEffectWritePolicy }
  | { readonly ok: false; readonly holds: readonly ExecutionEffectWritePolicyHold[] };

function exactPolicyRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Object.getOwnPropertySymbols(value).length !== 0) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort(compareCodePoint);
  const expected = [...keys].sort(compareCodePoint);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    return null;
  }
  return actual.every(key => {
    const descriptor = descriptors[key];
    return descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true;
  }) ? value as Record<string, unknown> : null;
}

function exactStringArray(value: unknown): readonly string[] | null {
  if (
    !Array.isArray(value)
    || value.length > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxEntries
    || Object.getOwnPropertySymbols(value).length !== 0
  ) return null;
  let totalPathBytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== 'string') return null;
    totalPathBytes += Buffer.byteLength(entry, 'utf8');
    if (
      !Number.isSafeInteger(totalPathBytes)
      || totalPathBytes > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxTotalPathBytes
    ) return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedKeys = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length'];
  const actualKeys = Object.keys(descriptors);
  if (actualKeys.length !== expectedKeys.length
    || expectedKeys.some(key => !(key in descriptors))) return null;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') return null;
  }
  return Object.freeze([...value] as string[]);
}

function isWindowsReservedName(segment: string): boolean {
  const base = segment.split('.')[0]?.toUpperCase() ?? '';
  return base === 'CON'
    || base === 'PRN'
    || base === 'AUX'
    || base === 'NUL'
    || base === 'CLOCK$'
    || base === 'CONIN$'
    || base === 'CONOUT$'
    || /^COM[1-9¹²³]$/u.test(base)
    || /^LPT[1-9¹²³]$/u.test(base);
}

function portableEffectPathFailure(
  value: string,
): 'INVALID' | 'PATH_BYTES_LIMIT' | 'NAME_BYTES_LIMIT' | undefined {
  if (Buffer.byteLength(value, 'utf8') > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxPathBytes) {
    return 'PATH_BYTES_LIMIT';
  }
  if (
    value.length === 0
    || value !== value.normalize('NFC')
    || value !== value.trim()
    || value.startsWith('/')
    || value.startsWith('//')
    || /^[A-Za-z]:($|\/)/u.test(value)
    || value.includes('\\')
    || containsWildcard(value)
  ) return 'INVALID';
  const segments = value.split('/');
  for (const segment of segments) {
    if (Buffer.byteLength(segment, 'utf8') > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxNameBytes) {
      return 'NAME_BYTES_LIMIT';
    }
    if (
      segment.length === 0
      || segment === '.'
      || segment === '..'
      || segment !== segment.trim()
      || /[. ]$/u.test(segment)
      || /[\u0000-\u001f<>:"|]/u.test(segment)
      || isWindowsReservedName(segment)
    ) return 'INVALID';
  }
  return undefined;
}

/**
 * Strict portable identity for durable effect authority. It rejects aliases
 * instead of rewriting them; callers must never trim, separator-normalize or
 * Unicode-normalize an observed filesystem name into an authorized spelling.
 */
export function parseExecutionEffectPortablePath(
  value: string,
): { readonly path: string; readonly key: string } | undefined {
  if (portableEffectPathFailure(value) !== undefined) return undefined;
  return Object.freeze({
    path: value,
    // Compatibility folding is deliberately conservative: it catches Unicode
    // width/compatibility and case aliases in addition to ordinary case-only
    // collisions while preserving the exact authored path above.
    key: value.normalize('NFKC').toUpperCase(),
  });
}

function normalizeExactEffectPath(value: string): { path: string; key: string } | undefined {
  if (typeof value !== 'string') return undefined;
  const input = value;
  if (
    portableEffectPathFailure(input) !== undefined
  ) return undefined;
  return parseExecutionEffectPortablePath(input);
}

export function isExecutionEffectProtectedPath(path: string): boolean {
  const normalized = normalizeExactEffectPath(path);
  if (!normalized) return true;
  return EXECUTION_EFFECT_PROTECTED_TREES.some(
    protectedTree => {
      const protectedKey = protectedTree.normalize('NFKC').toUpperCase();
      return normalized.key === protectedKey || normalized.key.startsWith(`${protectedKey}/`);
    },
  );
}

/**
 * Compile the sole persistent-effect authority for one exact attempt.
 * `directories` and legacy wildcard semantics intentionally do not participate:
 * every landed project file must be named exactly. An empty list is an explicit
 * read-only policy rather than an implicit directory fallback.
 */
export function compileExecutionEffectWritePolicy(
  filesWrite: readonly string[],
): ExecutionEffectWritePolicyCompileResult {
  const holds: ExecutionEffectWritePolicyHold[] = [];
  const byPortableKey = new Map<string, string>();
  const normalizedPaths: string[] = [];

  if (
    !Array.isArray(filesWrite)
    || filesWrite.length > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxEntries
  ) {
    return Object.freeze({
      ok: false,
      holds: Object.freeze([Object.freeze({
        code: 'WRITE_POLICY_ENTRY_LIMIT' as const,
        path: Array.isArray(filesWrite) ? String(filesWrite.length) : '<not-an-array>',
      })]),
    });
  }

  let totalPathBytes = 0;
  for (const rawPath of filesWrite) {
    if (typeof rawPath !== 'string') continue;
    totalPathBytes += Buffer.byteLength(rawPath, 'utf8');
    if (
      !Number.isSafeInteger(totalPathBytes)
      || totalPathBytes > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxTotalPathBytes
    ) {
      return Object.freeze({
        ok: false,
        holds: Object.freeze([Object.freeze({
          code: 'WRITE_POLICY_TOTAL_PATH_BYTES_LIMIT' as const,
          path: String(totalPathBytes),
        })]),
      });
    }
  }

  for (const rawPath of filesWrite) {
    const failure = typeof rawPath === 'string' ? portableEffectPathFailure(rawPath) : 'INVALID';
    const normalized = normalizeExactEffectPath(rawPath);
    if (!normalized) {
      holds.push({
        code: failure === 'PATH_BYTES_LIMIT'
          ? 'WRITE_POLICY_PATH_BYTES_LIMIT'
          : failure === 'NAME_BYTES_LIMIT'
            ? 'WRITE_POLICY_NAME_BYTES_LIMIT'
            : 'INVALID_EXACT_WRITE_PATH',
        path: typeof rawPath === 'string' ? rawPath : String(rawPath),
      });
      continue;
    }
    if (isExecutionEffectProtectedPath(normalized.path)) {
      holds.push({ code: 'PROTECTED_WRITE_PATH', path: normalized.path });
      continue;
    }
    const previous = byPortableKey.get(normalized.key);
    if (previous !== undefined && previous !== normalized.path) {
      holds.push({
        code: 'PORTABLE_WRITE_PATH_COLLISION',
        path: [previous, normalized.path].sort(compareCodePoint).join('|'),
      });
      continue;
    }
    byPortableKey.set(normalized.key, normalized.path);
    normalizedPaths.push(normalized.path);
  }

  if (holds.length > 0) {
    return {
      ok: false,
      holds: Object.freeze(holds
        .sort((left, right) => compareCodePoint(canonicalJson(left), canonicalJson(right)))
        .map(hold => Object.freeze(hold))),
    };
  }

  const canonicalPaths = Object.freeze(
    [...new Set(normalizedPaths)].sort(compareCodePoint),
  );
  const body = Object.freeze({
    version: EXECUTION_EFFECT_WRITE_POLICY_VERSION,
    mode: 'exact-files-write' as const,
    readOnly: canonicalPaths.length === 0,
    filesWrite: canonicalPaths,
    protectedTrees: EXECUTION_EFFECT_PROTECTED_TREES,
  });
  return {
    ok: true,
    policy: Object.freeze({ ...body, digest: sha256(body) }),
  };
}

/** Strict durable parser: authority is recomputed from the exact filesWrite list. */
export function parseExecutionEffectWritePolicy(value: unknown): ExecutionEffectWritePolicy | null {
  const record = exactPolicyRecord(value, [
    'version', 'mode', 'readOnly', 'filesWrite', 'protectedTrees', 'digest',
  ]);
  if (record === null) return null;
  const filesWrite = exactStringArray(record.filesWrite);
  const protectedTrees = exactStringArray(record.protectedTrees);
  if (
    record.version !== EXECUTION_EFFECT_WRITE_POLICY_VERSION
    || record.mode !== 'exact-files-write'
    || typeof record.readOnly !== 'boolean'
    || filesWrite === null
    || protectedTrees === null
    || canonicalJson(protectedTrees) !== canonicalJson(EXECUTION_EFFECT_PROTECTED_TREES)
    || typeof record.digest !== 'string'
  ) return null;
  const compiled = compileExecutionEffectWritePolicy(filesWrite);
  if (!compiled.ok || canonicalJson(compiled.policy) !== canonicalJson(record)) return null;
  return compiled.policy;
}

export function executionEffectPolicyAllowsPath(
  policy: ExecutionEffectWritePolicy,
  path: string,
): boolean {
  const normalized = normalizeExactEffectPath(path);
  if (normalized === undefined || isExecutionEffectProtectedPath(normalized.path)) return false;
  let low = 0;
  let high = policy.filesWrite.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const candidate = policy.filesWrite[middle];
    if (candidate === normalized.path) return true;
    if (candidate === undefined || compareCodePoint(candidate, normalized.path) > 0) {
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return false;
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
    // A trailing slash is unambiguous directory intent. Compiling it under a
    // file-selector kind would normalize the slash away and silently produce
    // `exact-file`, which matches only a file literally named `src` — so a task
    // authored with `filesWrite: ['src/']` would end up with an effectively
    // empty write scope while appearing to have declared one. This module
    // already refuses ambiguous authored input (`src/**` holds); the same
    // refusal belongs here, pointing at the field that does express a tree.
    if (kind !== 'directory-tree' && /\/\s*$/.test(raw)) {
      holds.push({ code: 'DIRECTORY_INTENT_REQUIRES_DIRECTORIES', field, value: raw });
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
