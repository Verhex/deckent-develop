import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

export interface CheckpointCounters {
  readonly [name: string]: number;
}

export interface ScratchCheckpointPayload {
  schemaVersion: 1;
  objective: string;
  findings: string[];
  evidenceRefs: string[];
  decisions: string[];
  unresolved: string[];
  nextActions: string[];
  inspectedAreas: string[];
  toolResultDigests: string[];
  cumulativeCounters: CheckpointCounters;
  createdAt: string;
}

export interface CheckpointReceipt { path: string; digest: string }
export type CheckpointReadResult =
  | { status: 'empty' }
  | { status: 'ok'; payload: ScratchCheckpointPayload; receipt: CheckpointReceipt }
  | { status: 'corrupt'; path: string; reason: string };

export interface ScratchStoreInfo {
  /** The session scratchpad — everything the agent writes lives under it. */
  root: string;
  /** The `<sessionId>` directory that owns {@link ScratchStoreInfo.root}; the
   *  unit the reaper and `close({policy:'delete'})` operate on. */
  sessionRoot: string;
  modeProtection: 'posix-enforced' | 'windows-best-effort';
  retention: number;
  /** Resolved inactivity window a sibling session survives before the reaper
   *  sweeps it (and the default for `close({policy:'keep-for-recovery'})`). */
  recoveryWindowMs: number;
}

/** Session identity for one scratch namespace. */
export interface ScratchIdentity {
  tenantId: string;
  projectId: string;
  sessionId: string;
  /** Canonical project-directory slug (`projectSlug()` from core). It — not the
   *  opaque projectId — is the namespace directory, so every session of one
   *  project shares one sweepable namespace. Absent → `projectId`. */
  slug?: string;
}

export interface ScratchStoreOptions {
  /** Base temp root. Injectable so a test never touches the shared OS temp
   *  namespace (and so a host adapter can relocate scratch). Absent → `tmpdir()`. */
  baseDir?: string;
  /** Inactivity window before a sibling session is reaped. Absent → {@link DEFAULT_RECOVERY_WINDOW_MS}. */
  recoveryWindowMs?: number;
  /** Clock seam for the reaper. Absent → `Date.now`. */
  now?: () => number;
}

/** Pure path resolution for one scratch session — no filesystem effect. Callers
 *  that must know the scratch layout BEFORE the session exists (e.g. building
 *  the tool-result content store that has to land inside the same swept
 *  namespace) resolve it here instead of guessing a path. */
export interface ScratchLayout {
  baseDir: string;
  /** `<baseDir>/deckent/<slug>` — the sweep unit's parent. */
  namespaceDir: string;
  /** `<namespaceDir>/<sessionId>`. */
  sessionRoot: string;
  /** `<sessionRoot>/scratchpad` — `ScratchStoreInfo.root`. */
  root: string;
  /** Strict prefix of the pre-deterministic-root `mkdtemp` leftovers. */
  legacyPrefix: string;
  sessionId: string;
}

export interface ScratchStore {
  readonly info: ScratchStoreInfo;
  writeCheckpoint(payload: ScratchCheckpointPayload): CheckpointReceipt;
  readLatestCheckpoint(): CheckpointReadResult;
  close(options: { policy: 'delete' | 'keep-for-recovery'; recoveryWindowMs?: number }): void;
}

const RETENTION = 5;
const CHECKPOINT_RE = /^checkpoint-(\d+)-([a-f0-9]{64})\.json$/;

/** Namespace directory every deckent scratch session lives under. */
const SCRATCH_NAMESPACE = 'deckent';
/** Leaf directory name of the per-session scratchpad. */
const SCRATCHPAD_DIR = 'scratchpad';
/** How long a session's scratchpad survives its last observed activity before
 *  the reaper sweeps it. Also the default `keep-for-recovery` window. */
export const DEFAULT_RECOVERY_WINDOW_MS = 10 * 60 * 1000;
/** Upper bound on entries ONE hygiene sweep touches — the sweep is opportunistic
 *  housekeeping on a hot path, never an unbounded directory walk. */
const MAX_SWEEP_ENTRIES = 512;

function safePart(value: string, name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value) || value === '.' || value === '..') {
    throw new Error(`invalid ${name}`);
  }
  return value;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertContained(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.includes(`${sep}..${sep}`)) {
    throw new Error('scratch path escaped its session root');
  }
  let cursor = dirname(candidate);
  while (resolve(cursor) !== resolve(root)) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('scratch path contains a symlink');
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error('scratch path escaped its session root');
    cursor = parent;
  }
  if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) throw new Error('scratch target is a symlink');
}

function parsePayload(value: unknown): ScratchCheckpointPayload | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const arrays = ['findings', 'evidenceRefs', 'decisions', 'unresolved', 'nextActions', 'inspectedAreas', 'toolResultDigests'];
  if (v.schemaVersion !== 1 || typeof v.objective !== 'string' || typeof v.createdAt !== 'string') return undefined;
  if (!arrays.every((key) => Array.isArray(v[key]) && (v[key] as unknown[]).every((item) => typeof item === 'string'))) return undefined;
  if (!v.cumulativeCounters || typeof v.cumulativeCounters !== 'object' || Array.isArray(v.cumulativeCounters)) return undefined;
  if (!Object.values(v.cumulativeCounters as object).every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return undefined;
  return v as unknown as ScratchCheckpointPayload;
}

/**
 * Resolve the deterministic scratch layout for one session. Deterministic on
 * purpose: the same identity resolves to the same directory across process
 * restarts, which is what makes RECOVERY (reopen and keep reading the previous
 * checkpoints) possible at all — an `mkdtemp` root can never be found again.
 */
export function resolveScratchRoot(ids: ScratchIdentity, options: ScratchStoreOptions = {}): ScratchLayout {
  const tenantId = safePart(ids.tenantId, 'tenantId');
  const projectId = safePart(ids.projectId, 'projectId');
  const sessionId = safePart(ids.sessionId, 'sessionId');
  const slug = safePart(ids.slug ?? projectId, 'slug');
  const baseDir = options.baseDir ?? tmpdir();
  const namespaceDir = join(baseDir, SCRATCH_NAMESPACE, slug);
  const sessionRoot = join(namespaceDir, sessionId);
  return {
    baseDir,
    namespaceDir,
    sessionRoot,
    root: join(sessionRoot, SCRATCHPAD_DIR),
    legacyPrefix: `${SCRATCH_NAMESPACE}-${tenantId}-${projectId}-${sessionId}-`,
    sessionId,
  };
}

function resolveRecoveryWindowMs(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 0) return DEFAULT_RECOVERY_WINDOW_MS;
  return Math.floor(requested);
}

/** Newest mtime observed anywhere in a session directory's own level — the
 *  liveness stamp {@link touchLiveness} refreshes. A directory's mtime does not
 *  change when a grandchild file is written, so activity is stamped explicitly
 *  rather than inferred. */
function lastActivityMs(sessionRoot: string): number {
  return statSync(sessionRoot).mtimeMs;
}

/** Best-effort activity stamp. A failure here only makes the sweep more
 *  conservative on the NEXT open; it must never surface to the session. */
function touchLiveness(sessionRoot: string, nowMs: number): void {
  try {
    const seconds = nowMs / 1000;
    utimesSync(sessionRoot, seconds, seconds);
  } catch { /* best-effort — hygiene never fails a session */ }
}

/**
 * Remove ONE stale directory, defensively. Returns silently on anything it is
 * not certain about: a symlink, a non-directory, a fresh directory, a path that
 * is not contained by `parent`, or any fs error.
 */
function reapIfStale(parent: string, name: string, cutoffMs: number): void {
  try {
    const candidate = join(parent, name);
    const stats = lstatSync(candidate);
    if (stats.isSymbolicLink() || !stats.isDirectory()) return;
    if (lastActivityMs(candidate) > cutoffMs) return;
    assertContained(parent, candidate);
    rmSync(candidate, { recursive: true, force: true });
  } catch { /* fail-open: a hygiene error never downs the session */ }
}

/**
 * The reaper. Two bounded sweeps, both strictly inside the deckent scratch
 * namespace and both fail-open:
 *
 *  1. sibling `<baseDir>/deckent/<slug>/<otherSessionId>` directories whose last
 *     observed activity is older than the recovery window (never the live one);
 *  2. pre-deterministic-root `mkdtemp` leftovers directly under `<baseDir>`,
 *     matched by the STRICT legacy prefix of this exact identity — never a
 *     loose `deckent-*` glob, so an unrelated `deckent-tool-content-*` directory
 *     is untouchable.
 */
function sweepStaleScratch(layout: ScratchLayout, cutoffMs: number): void {
  try {
    const siblings = readdirSync(layout.namespaceDir).filter((name) => name !== layout.sessionId);
    for (const name of siblings.slice(0, MAX_SWEEP_ENTRIES)) reapIfStale(layout.namespaceDir, name, cutoffMs);
  } catch { /* namespace missing or unreadable → nothing to sweep */ }
  try {
    const legacy = readdirSync(layout.baseDir).filter((name) => name.startsWith(layout.legacyPrefix));
    for (const name of legacy.slice(0, MAX_SWEEP_ENTRIES)) reapIfStale(layout.baseDir, name, cutoffMs);
  } catch { /* base dir unreadable → nothing to sweep */ }
}

export function openScratchStore(ids: ScratchIdentity, options: ScratchStoreOptions = {}): ScratchStore {
  const layout = resolveScratchRoot(ids, options);
  const recoveryWindowMs = resolveRecoveryWindowMs(options.recoveryWindowMs);
  const now = options.now ?? Date.now;
  const root = layout.root;
  const checkpointDir = join(root, 'checkpoints');
  // Deterministic, not mkdtemp: an existing directory is REUSED so a recovered
  // session keeps its checkpoint lineage instead of starting a fresh island.
  mkdirSync(checkpointDir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    for (const dir of [layout.sessionRoot, root, checkpointDir]) {
      try { chmodSync(dir, 0o700); } catch { /* best-effort on exotic filesystems */ }
    }
  }

  const files = (): string[] => readdirSync(checkpointDir)
    .filter((name) => CHECKPOINT_RE.test(name))
    .sort((a, b) => Number(CHECKPOINT_RE.exec(a)![1]) - Number(CHECKPOINT_RE.exec(b)![1]));

  // Resume the sequence from disk — a recovered session must not re-mint an
  // index that already exists (a rename would silently clobber it).
  const resumed = files().at(-1);
  let sequence = resumed ? Number(CHECKPOINT_RE.exec(resumed)![1]) : 0;

  // Hygiene runs INSIDE its own fail-open guard, after our own directory exists
  // and is stamped live, so a concurrent opener can never mistake us for garbage.
  try {
    const nowMs = now();
    touchLiveness(layout.sessionRoot, nowMs);
    sweepStaleScratch(layout, nowMs - recoveryWindowMs);
  } catch { /* fail-open: hygiene is never load-bearing for the session */ }

  return {
    info: {
      root,
      sessionRoot: layout.sessionRoot,
      modeProtection: process.platform === 'win32' ? 'windows-best-effort' : 'posix-enforced',
      retention: RETENTION,
      recoveryWindowMs,
    },
    writeCheckpoint(payload): CheckpointReceipt {
      if (!parsePayload(payload)) throw new Error('invalid checkpoint payload');
      const body = JSON.stringify(payload);
      const checksum = digest(body);
      const envelope = JSON.stringify({ checksum, payload });
      const name = `checkpoint-${String(++sequence).padStart(8, '0')}-${checksum}.json`;
      const target = join(checkpointDir, name);
      const temporary = join(checkpointDir, `.${name}.${process.pid}.tmp`);
      assertContained(root, target);
      assertContained(root, temporary);
      writeFileSync(temporary, envelope, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      renameSync(temporary, target);
      if (process.platform !== 'win32') chmodSync(target, 0o600);
      for (const stale of files().slice(0, -RETENTION)) {
        const stalePath = join(checkpointDir, basename(stale));
        assertContained(root, stalePath);
        rmSync(stalePath);
      }
      // Activity stamp: "10 minutes" means ten minutes of INACTIVITY, so a
      // long-running session is never reaped out from under itself. Guarded —
      // an unusable clock degrades hygiene, it never fails a checkpoint write.
      try { touchLiveness(layout.sessionRoot, now()); } catch { /* fail-open */ }
      return { path: target, digest: checksum };
    },
    readLatestCheckpoint(): CheckpointReadResult {
      const latest = files().at(-1);
      if (!latest) return { status: 'empty' };
      const path = join(checkpointDir, basename(latest));
      try {
        assertContained(root, path);
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as { checksum?: unknown; payload?: unknown };
        const payload = parsePayload(parsed.payload);
        if (!payload || typeof parsed.checksum !== 'string') return { status: 'corrupt', path, reason: 'invalid schema' };
        const actual = digest(JSON.stringify(payload));
        if (actual !== parsed.checksum || !latest.endsWith(`-${actual}.json`)) return { status: 'corrupt', path, reason: 'checksum mismatch' };
        return { status: 'ok', payload, receipt: { path, digest: actual } };
      } catch (error) {
        return { status: 'corrupt', path, reason: error instanceof Error ? error.message : String(error) };
      }
    },
    close(options): void {
      // A kept scratchpad is not leaked: it is stamped now, and the NEXT session
      // in this namespace reaps it once the window has elapsed (the 10-minute
      // recovery semantics, now actually enforced instead of merely promised).
      const keepFor = options.policy === 'keep-for-recovery'
        ? (options.recoveryWindowMs ?? recoveryWindowMs)
        : 0;
      if (keepFor > 0) {
        try { touchLiveness(layout.sessionRoot, now()); } catch { /* fail-open */ }
        return;
      }
      // Delete the SESSION root, not just the scratchpad: the tool-result
      // content store lives beside it, so one namespace, one sweep.
      assertContained(layout.namespaceDir, layout.sessionRoot);
      if (lstatSync(layout.sessionRoot).isSymbolicLink()) throw new Error('scratch root is a symlink');
      rmSync(layout.sessionRoot, { recursive: true, force: true });
    },
  };
}
