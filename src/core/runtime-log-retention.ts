/**
 * Retention for explicitly recognised one-off runtime logs and writer residue.
 *
 * Inspection and mutation are deliberately separate.  The plan records the
 * identity of every candidate and apply revalidates it, so a file which has
 * been reopened or appended after inspection is never truncated or removed.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { DeckentError } from './errors.js';
import { publishMaintenanceArchive } from './maintenance-archive.js';

export const RUNTIME_LOG_RETENTION_VERSION = 1 as const;

/** The legacy, one-shot start logs which may be retired when empty and stale. */
export const NAMED_START_LOGS = Object.freeze([
  '.deckent/brain-start.log',
  '.deckent/dashboard-start.log',
  '.deckent/bot-start.log',
  '.deckent/mcp-start.log',
] as const);

export type RuntimeLogKind = 'start-log' | 'bot-log' | 'prompt-lint-jsonl' | 'resource-jsonl' | 'temporary';
export type RuntimeLogAction = 'retire-empty' | 'archive-then-retire' | 'retire-temporary';
export type RuntimeLogHoldReason = 'current-writer' | 'not-expired' | 'non-regular' | 'unrecognised';

export interface RuntimeLogCandidate {
  readonly source: string;
  readonly kind: RuntimeLogKind;
  readonly action: RuntimeLogAction;
  readonly bytes: number;
  readonly sha256: string;
  readonly dev: number;
  readonly ino: number;
  readonly mtimeMs: number;
}

export interface RuntimeLogHold {
  readonly source: string;
  readonly reason: RuntimeLogHoldReason;
}

export interface RuntimeLogRetentionPlan {
  readonly version: typeof RUNTIME_LOG_RETENTION_VERSION;
  readonly projectRoot: string;
  readonly plannedAt: string;
  readonly archiveRoot: string;
  readonly retire: readonly RuntimeLogCandidate[];
  readonly preserve: readonly RuntimeLogHold[];
}

export interface PlanRuntimeLogRetentionOptions {
  readonly now?: Date;
  readonly maxAgeDays?: number;
  /** Project-relative paths known to have a current append/write owner. */
  readonly currentWriters?: readonly string[];
  readonly archiveRoot?: string;
}

export interface RuntimeLogRetirementReceipt {
  readonly version: typeof RUNTIME_LOG_RETENTION_VERSION;
  readonly receiptId: string;
  readonly source: string;
  readonly action: RuntimeLogAction;
  readonly bytes: number;
  readonly sha256: string;
  readonly retiredAt: string;
  readonly archiveManifestPath?: string;
}

export interface RuntimeLogRetentionApplyResult {
  readonly retired: readonly string[];
  readonly archived: readonly string[];
  readonly receipts: readonly string[];
  readonly preserved: readonly RuntimeLogHold[];
  readonly failures: readonly string[];
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_AGE_DAYS = 14;
const DEFAULT_ARCHIVE_ROOT = '.deckent/archive/runtime-artifacts';
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');
const NAMED_START_SET = new Set<string>(NAMED_START_LOGS);

function portable(path: string): string { return path.split(sep).join('/'); }

function safeRelative(value: string): string {
  const normalized = portable(value).replace(/^\.\//u, '');
  if (normalized === '' || isAbsolute(value) || normalized.includes('\0')
    || normalized.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new DeckentError('RUNTIME_LOG_INVALID_RELATIVE_PATH', 'RUNTIME_LOG_INVALID_RELATIVE_PATH');
  }
  return normalized;
}

function classify(source: string): RuntimeLogKind | null {
  const name = basename(source).toLowerCase();
  if (NAMED_START_SET.has(source)) return 'start-log';
  if (source.startsWith('.deckent/runtime/logs/detached/') && name.endsWith('.log')) return 'start-log';
  if (name.endsWith('.log') && name.includes('bot')) return 'bot-log';
  if (name.endsWith('.jsonl') && name.includes('prompt-lint')) return 'prompt-lint-jsonl';
  if (name === 'resource-log.jsonl') return 'resource-jsonl';
  if (/\.(?:tmp|temp|partial)$/u.test(name) || /^\..+\.tmp(?:\.|$)/u.test(name)) return 'temporary';
  return null;
}

function discover(root: string): string[] {
  const deckent = join(root, '.deckent');
  const found: string[] = [];
  const visit = (directory: string, depth: number): void => {
    let names: string[];
    try { names = readdirSync(directory).sort(); } catch { return; }
    for (const name of names) {
      const path = join(directory, name);
      let metadata;
      try { metadata = lstatSync(path); } catch { continue; }
      const source = portable(relative(root, path));
      if (metadata.isDirectory()) {
        // Archive bytes and nested application state are never cleanup input.
        if (depth < 3 && source !== '.deckent/archive') visit(path, depth + 1);
      } else if (classify(source) !== null) found.push(source);
    }
  };
  visit(deckent, 0);
  return found;
}

function identity(path: string): Omit<RuntimeLogCandidate, 'source' | 'kind' | 'action'> {
  const before = lstatSync(path);
  if (!before.isFile()) throw new DeckentError('RUNTIME_LOG_NOT_REGULAR', 'RUNTIME_LOG_NOT_REGULAR');
  if (before.nlink !== 1) throw new DeckentError('RUNTIME_LOG_MULTIPLY_LINKED', 'RUNTIME_LOG_MULTIPLY_LINKED');
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally { closeSync(descriptor); }
  const after = statSync(path);
  if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
    || after.mtimeMs !== before.mtimeMs || after.nlink !== 1) {
    throw new DeckentError('RUNTIME_LOG_CHANGED_DURING_INSPECTION', 'RUNTIME_LOG_CHANGED_DURING_INSPECTION');
  }
  return {
    bytes: after.size,
    sha256: hash.digest('hex'),
    dev: after.dev,
    ino: after.ino,
    mtimeMs: after.mtimeMs,
  };
}

/** Read-only inventory. Missing directories produce an empty plan. */
export function planRuntimeLogRetention(
  projectRoot: string,
  options: PlanRuntimeLogRetentionOptions = {},
): RuntimeLogRetentionPlan {
  const root = resolve(projectRoot);
  const now = options.now ?? new Date();
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1) throw new DeckentError('RUNTIME_LOG_INVALID_MAX_AGE_DAYS', 'RUNTIME_LOG_INVALID_MAX_AGE_DAYS');
  const archiveRoot = safeRelative(options.archiveRoot ?? DEFAULT_ARCHIVE_ROOT);
  const writers = new Set((options.currentWriters ?? []).map(safeRelative));
  const retire: RuntimeLogCandidate[] = [];
  const preserve: RuntimeLogHold[] = [];
  for (const source of discover(root)) {
    const kind = classify(source);
    if (kind === null) { preserve.push({ source, reason: 'unrecognised' }); continue; }
    if (writers.has(source)) { preserve.push({ source, reason: 'current-writer' }); continue; }
    const path = resolve(root, source);
    let file;
    try { file = identity(path); } catch { preserve.push({ source, reason: 'non-regular' }); continue; }
    if (now.getTime() - file.mtimeMs <= maxAgeDays * DAY_MS) {
      preserve.push({ source, reason: 'not-expired' });
      continue;
    }
    const action: RuntimeLogAction = kind === 'temporary'
      ? 'retire-temporary'
      : file.bytes === 0 ? 'retire-empty' : 'archive-then-retire';
    retire.push({ source, kind, action, ...file });
  }
  return { version: RUNTIME_LOG_RETENTION_VERSION, projectRoot: root, plannedAt: now.toISOString(), archiveRoot, retire, preserve };
}

function sameIdentity(path: string, candidate: RuntimeLogCandidate): boolean {
  try {
    const fresh = identity(path);
    return fresh.dev === candidate.dev && fresh.ino === candidate.ino
      && fresh.bytes === candidate.bytes && fresh.mtimeMs === candidate.mtimeMs
      && fresh.sha256 === candidate.sha256;
  } catch { return false; }
}

function writeReceipt(root: string, archiveRoot: string, receipt: RuntimeLogRetirementReceipt): string {
  const directory = join(root, archiveRoot, 'receipts');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const relativePath = `${archiveRoot}/receipts/${receipt.receiptId}.json`;
  const destination = join(root, relativePath);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, destination);
  const directoryDescriptor = openSync(dirname(destination), 'r');
  try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  return portable(relative(root, destination));
}

/** Apply a previously captured plan, with fresh identity checks before mutation. */
export function applyRuntimeLogRetention(
  plan: RuntimeLogRetentionPlan,
  options: { readonly now?: Date; readonly currentWriters?: readonly string[] } = {},
): RuntimeLogRetentionApplyResult {
  if (plan.version !== RUNTIME_LOG_RETENTION_VERSION) throw new DeckentError('RUNTIME_LOG_INVALID_PLAN', 'RUNTIME_LOG_INVALID_PLAN');
  const root = resolve(plan.projectRoot);
  const writers = new Set((options.currentWriters ?? []).map(safeRelative));
  const retired: string[] = [];
  const archived: string[] = [];
  const receipts: string[] = [];
  const preserved = [...plan.preserve];
  const failures: string[] = [];
  for (const candidate of plan.retire) {
    const source = safeRelative(candidate.source);
    const path = resolve(root, source);
    if (writers.has(source)) { preserved.push({ source, reason: 'current-writer' }); continue; }
    if (!existsSync(path) || portable(relative(root, path)) !== source || !sameIdentity(path, candidate)) {
      failures.push(`${source}:SOURCE_CHANGED`);
      continue;
    }
    try {
      let archiveManifestPath: string | undefined;
      if (candidate.action === 'archive-then-retire') {
        const publication = publishMaintenanceArchive(root, {
          source,
          lineage: `runtime-log-retention:${candidate.sha256}`,
          retireSource: false,
          archiveRoot: plan.archiveRoot,
        });
        archiveManifestPath = publication.manifestPath;
        archived.push(publication.manifestPath);
      }
      if (!sameIdentity(path, candidate)) throw new DeckentError('SOURCE_CHANGED', 'SOURCE_CHANGED');
      if (candidate.action === 'retire-empty' && (candidate.bytes !== 0 || candidate.sha256 !== EMPTY_SHA256)) {
        throw new DeckentError('EMPTY_PROOF_INVALID', 'EMPTY_PROOF_INVALID');
      }
      const retiredAt = (options.now ?? new Date()).toISOString();
      const receiptProjection = { source, action: candidate.action, bytes: candidate.bytes, sha256: candidate.sha256, retiredAt, archiveManifestPath };
      const receiptId = createHash('sha256').update(JSON.stringify(receiptProjection)).digest('hex');
      const receipt = { version: RUNTIME_LOG_RETENTION_VERSION, receiptId, ...receiptProjection } satisfies RuntimeLogRetirementReceipt;
      const receiptPath = writeReceipt(root, plan.archiveRoot, receipt);
      if (!sameIdentity(path, candidate)) throw new DeckentError('SOURCE_CHANGED', 'SOURCE_CHANGED');
      unlinkSync(path);
      receipts.push(receiptPath);
      retired.push(source);
    } catch (error) {
      failures.push(`${source}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { retired, archived, receipts, preserved, failures };
}

/** Convenience entrypoint retaining a mutation-free default mode. */
export function reconcileRuntimeLogRetention(
  projectRoot: string,
  options: PlanRuntimeLogRetentionOptions & { readonly apply?: boolean } = {},
): RuntimeLogRetentionPlan | RuntimeLogRetentionApplyResult {
  const plan = planRuntimeLogRetention(projectRoot, options);
  return options.apply === true
    ? applyRuntimeLogRetention(plan, { now: options.now, currentWriters: options.currentWriters })
    : plan;
}
