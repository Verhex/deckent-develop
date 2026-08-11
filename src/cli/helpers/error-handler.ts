// ─── Error Handler ──────────────────────────────────────────────────

import { mkdirSync, writeFileSync, renameSync, existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { DeckentError, formatHumanError } from '../../core/errors.js';
import { redactSensitive } from '../../core/redact-sensitive.js';

export interface ErrorHandlerOpts {
  verbose?: boolean;
  noColor?: boolean;
}

/**
 * Handle an error and print formatted output to stderr.
 * - DeckentError: shows human-friendly context (whatHappened, why, howToFix)
 * - Generic Error: shows message and report URL
 * - If verbose: includes stack trace
 */
export function handleError(error: unknown, opts?: ErrorHandlerOpts): void {
  if (error instanceof DeckentError) {
    handleDeckentError(error, opts);
  } else if (error instanceof Error) {
    handleGenericError(error, opts);
  } else {
    process.stderr.write(`Error: ${String(error)}\n`);
  }
}

function handleDeckentError(error: DeckentError, opts?: ErrorHandlerOpts): void {
  if (error.whatHappened) {
    // Human-friendly format with full context
    const formatted = formatHumanError(error);
    if (opts?.noColor) {
      process.stderr.write(formatted + '\n');
    } else {
      process.stderr.write(colorizeHumanError(formatted) + '\n');
    }
  } else {
    // Compact format: DeckentError without rich context fields set
    if (opts?.noColor) {
      process.stderr.write(`[${error.code}] ${error.message}\n`);
    } else {
      process.stderr.write(`\x1b[31m[${error.code}]\x1b[0m ${error.message}\n`);
    }

    if (error.suggestion) {
      if (opts?.noColor) {
        process.stderr.write(`Suggestion: ${error.suggestion}\n`);
      } else {
        process.stderr.write(`\x1b[33mSuggestion:\x1b[0m ${error.suggestion}\n`);
      }
    }

    if (error.docLink) {
      if (opts?.noColor) {
        process.stderr.write(`Docs: ${error.docLink}\n`);
      } else {
        process.stderr.write(`\x1b[36mDocs:\x1b[0m ${error.docLink}\n`);
      }
    }
  }

  if (opts?.verbose && error.stack) {
    process.stderr.write(`\n${error.stack}\n`);
  }
}

function handleGenericError(error: Error, opts?: ErrorHandlerOpts): void {
  process.stderr.write(`Error: ${error.message}\n`);
  process.stderr.write('Report: https://github.com/VerhexIO/deckent/issues\n');

  if (opts?.verbose && error.stack) {
    process.stderr.write(`\n${error.stack}\n`);
  }
}

/**
 * Add ANSI color codes to human-friendly error output.
 */
function colorizeHumanError(text: string): string {
  return text
    .replace(/^(Error:.+)$/m, '\x1b[31m$1\x1b[0m')
    .replace(/^(What happened:)$/m, '\x1b[33m$1\x1b[0m')
    .replace(/^(Why:)$/m, '\x1b[33m$1\x1b[0m')
    .replace(/^(How to fix:)$/m, '\x1b[32m$1\x1b[0m')
    .replace(/^(Docs:.+)$/m, '\x1b[36m$1\x1b[0m');
}

// ─── Fatal Handler (uncaughtException / unhandledRejection wire) ────

function describeFatal(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message, stack: error.stack };
  }
  return { name: 'NonError', message: String(error) };
}

// ─── Crash Artifact Schema (row 121, first slice) ───────────────────
//
// Versioned, self-describing crash artifacts with provenance (command,
// deckent version, project-root digest — never raw secrets or account
// identity) and collision-free naming (timestamp + pid + random suffix,
// temp-then-rename). Filename keeps the pre-existing `.log` suffix so
// existing readers/tests that match /\.log$/ keep working; only the
// body format is now a versioned JSON schema instead of free text.

export const CRASH_ARTIFACT_SCHEMA_VERSION = 1;

export interface CrashArtifactV1 {
  schemaVersion: 1;
  timestamp: string;
  pid: number;
  command: string;
  deckentVersion: string;
  projectRootDigest: string;
  name: string;
  message: string;
  stack: string | null;
}

/**
 * Sanitize a process argv array through the existing redaction surface.
 * Joined with spaces (not a delimiter) so multi-token secret patterns
 * that span two argv elements, e.g. ["--password", "hunter2"] rendered
 * as "--password hunter2", still match redactSensitive's assignment
 * and Bearer-token rules.
 */
export function sanitizeCommandArgv(argv: string[]): string {
  return redactSensitive(argv.join(' '));
}

/**
 * Digest of the project root path — provenance without exposing the
 * raw filesystem path or any account identity.
 */
export function computeProjectRootDigest(root: string): string {
  return createHash('sha256').update(root).digest('hex').slice(0, 16);
}

/**
 * Best-effort deckent package version, resolved by walking up from this
 * module's own location so it works whether deckent runs from src/dist,
 * a global install, or a monorepo checkout. Never throws.
 */
export function resolveDeckentVersion(): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, 'package.json');
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version?: string };
        if (pkg.name === 'deckent' && typeof pkg.version === 'string') {
          return pkg.version;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Best-effort — never throw from the fatal handler's write path.
  }
  return 'unknown';
}

/**
 * Assemble a schema-versioned crash artifact. `message`/`stack` are
 * expected to already be redacted by the caller (matches existing
 * formatFatalAndExit behavior); `argv` is sanitized here.
 */
export function buildCrashArtifact(details: {
  name: string;
  message: string;
  stack?: string;
  cwd: string;
  argv: string[];
}): CrashArtifactV1 {
  return {
    schemaVersion: CRASH_ARTIFACT_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    pid: process.pid,
    command: sanitizeCommandArgv(details.argv),
    deckentVersion: resolveDeckentVersion(),
    projectRootDigest: computeProjectRootDigest(details.cwd),
    name: details.name,
    message: details.message,
    stack: details.stack ?? null,
  };
}

/**
 * Collision-free artifact filename: ISO timestamp + pid + random suffix,
 * so two fatals in the same process within the same millisecond (or two
 * processes sharing a millisecond) never overwrite each other.
 */
export function crashArtifactFileName(pid: number): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = randomBytes(4).toString('hex');
  return `${stamp}-${pid}-${suffix}.log`;
}

/**
 * Write the artifact atomically: temp file (least-privilege mode,
 * exclusive create) in the same directory, then rename into place.
 * Throws on failure — callers are responsible for the best-effort
 * try/catch so a write failure never masks the original fatal.
 */
export function writeCrashArtifactAtomic(dir: string, fileName: string, artifact: CrashArtifactV1): void {
  const finalPath = join(dir, fileName);
  const tempPath = join(dir, `.tmp-${fileName}`);
  writeFileSync(tempPath, JSON.stringify(artifact, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  renameSync(tempPath, finalPath);
}

// ─── Crash Artifact Retention + Bounded Reader (row 121, second slice) ─
//
// Retention is applied ONLY at write time by formatFatalAndExit itself
// (never a background job): every fatal, after writing its own artifact,
// prunes prior schema-versioned (V1) artifacts against an age+count+size
// hybrid limit — the same "whichever triggers first" shape already used
// by core/config.ts's sprint_file_retention (keep_last_n + size_cap_mb)
// and scheduler_shadow_retention (retention_days). core/config.ts /
// config-types.ts are outside this task's write scope and loadConfig()
// is async + does disk I/O, which would risk delaying or breaking the
// synchronous, must-never-throw fatal path (ADR-G-025). Limits are
// therefore SSOT'd here as named constants, overridable via env vars —
// the same config-resolution shape this file already uses for
// DECKENT_DEBUG — rather than scattered as inline literals.
//
// Legacy (pre-schema) artifacts are files that fail JSON.parse or don't
// carry schemaVersion === 1. They are classified 'legacy', never parsed
// as V1, and structurally excluded from pruning: selectCrashArtifactsToPrune
// only accepts V1 entries, so a legacy file can never reach unlinkSync
// through this path. Legacy pruning stays receipt-gated (out of scope
// here) and is never performed by this writer-side retention.

export interface CrashRetentionConfig {
  /** Artifacts older than this (by mtime) are pruned. */
  maxAgeDays: number;
  /** At most this many V1 artifacts are kept, newest-first. */
  maxCount: number;
  /** Total size cap (MB) across kept V1 artifacts; oldest pruned first past the cap. */
  maxSizeMB: number;
}

export const DEFAULT_CRASH_RETENTION_MAX_AGE_DAYS = 30;
export const DEFAULT_CRASH_RETENTION_MAX_COUNT = 200;
export const DEFAULT_CRASH_RETENTION_MAX_SIZE_MB = 50;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BYTES_PER_MB = 1024 * 1024;

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Resolve crash-retention limits, synchronously, from env vars (falling
 * back to the SSOT defaults above). Deliberately does not go through
 * core/config.ts's loadConfig() — see the block comment above.
 */
export function resolveCrashRetentionConfig(env: NodeJS.ProcessEnv = process.env): CrashRetentionConfig {
  return {
    maxAgeDays: parsePositiveIntEnv(env.DECKENT_CRASH_RETENTION_MAX_AGE_DAYS, DEFAULT_CRASH_RETENTION_MAX_AGE_DAYS),
    maxCount: parsePositiveIntEnv(env.DECKENT_CRASH_RETENTION_MAX_COUNT, DEFAULT_CRASH_RETENTION_MAX_COUNT),
    maxSizeMB: parsePositiveIntEnv(env.DECKENT_CRASH_RETENTION_MAX_SIZE_MB, DEFAULT_CRASH_RETENTION_MAX_SIZE_MB),
  };
}

interface CrashArtifactFileMeta {
  fileName: string;
  mtimeMs: number;
  sizeBytes: number;
}

export type CrashArtifactV1Entry = CrashArtifactFileMeta & { kind: 'v1'; artifact: CrashArtifactV1 };
export type CrashArtifactLegacyEntry = CrashArtifactFileMeta & { kind: 'legacy' };
export type CrashArtifactEntry = CrashArtifactV1Entry | CrashArtifactLegacyEntry;

/**
 * Typed parse: returns the artifact only if it round-trips as a
 * schema-versioned V1 body. Anything else (parse failure, missing/wrong
 * schemaVersion, wrong shape) is legacy — never coerced into V1.
 */
function tryParseCrashArtifactV1(raw: string): CrashArtifactV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const candidate = parsed as Partial<CrashArtifactV1>;
  if (
    candidate.schemaVersion === CRASH_ARTIFACT_SCHEMA_VERSION &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.pid === 'number' &&
    typeof candidate.command === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.message === 'string'
  ) {
    return candidate as CrashArtifactV1;
  }
  return null;
}

/**
 * Read + classify every artifact file in `dir`. Not itself bounded —
 * callers that need a hard cap (the reader) slice after sorting;
 * retention needs the full picture to prune correctly.
 */
function readCrashArtifactDir(dir: string): CrashArtifactEntry[] {
  if (!existsSync(dir)) return [];
  const fileNames = readdirSync(dir).filter((f) => f.endsWith('.log') && !f.startsWith('.tmp-'));
  const entries: CrashArtifactEntry[] = [];
  for (const fileName of fileNames) {
    const filePath = join(dir, fileName);
    let stat;
    let raw: string;
    try {
      stat = statSync(filePath);
      raw = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const meta: CrashArtifactFileMeta = { fileName, mtimeMs: stat.mtimeMs, sizeBytes: stat.size };
    const artifact = tryParseCrashArtifactV1(raw);
    entries.push(artifact ? { ...meta, kind: 'v1', artifact } : { ...meta, kind: 'legacy' });
  }
  return entries;
}

export const DEFAULT_CRASH_ARTIFACT_READ_LIMIT = 50;
export const CRASH_ARTIFACT_READ_HARD_CAP = 500;

/**
 * Bounded production reader: lists crash artifacts newest-first, capped
 * at `opts.limit` (clamped into [1, CRASH_ARTIFACT_READ_HARD_CAP]).
 * Legacy files are included and typed `kind: 'legacy'` — never parsed
 * as V1.
 */
export function listCrashArtifacts(dir: string, opts: { limit?: number } = {}): CrashArtifactEntry[] {
  const requested = opts.limit ?? DEFAULT_CRASH_ARTIFACT_READ_LIMIT;
  const limit = Math.min(Math.max(1, requested), CRASH_ARTIFACT_READ_HARD_CAP);
  const entries = readCrashArtifactDir(dir);
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries.slice(0, limit);
}

/**
 * Pure selection: which V1 entries to prune under the hybrid
 * age/count/size policy. Walks newest-first, keeping an entry only
 * while it fits under all three limits; once any limit trips, that
 * entry and everything older is pruned. Legacy entries cannot be
 * passed in (V1-only input type) — structurally never selected.
 */
export function selectCrashArtifactsToPrune(
  entries: CrashArtifactV1Entry[],
  config: CrashRetentionConfig,
  nowMs: number,
): CrashArtifactV1Entry[] {
  const sorted = [...entries].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const maxAgeMs = config.maxAgeDays * MS_PER_DAY;
  const maxSizeBytes = config.maxSizeMB * BYTES_PER_MB;

  const toPrune: CrashArtifactV1Entry[] = [];
  let runningSizeBytes = 0;
  let keptCount = 0;

  for (const entry of sorted) {
    const overAge = nowMs - entry.mtimeMs > maxAgeMs;
    const overCount = keptCount >= config.maxCount;
    const wouldExceedSize = runningSizeBytes + entry.sizeBytes > maxSizeBytes;

    if (overAge || overCount || wouldExceedSize) {
      toPrune.push(entry);
    } else {
      runningSizeBytes += entry.sizeBytes;
      keptCount++;
    }
  }
  return toPrune;
}

/**
 * Apply retention to `dir`: prune V1 artifacts beyond the hybrid
 * age/count/size policy. Legacy artifacts are never touched. Entirely
 * best-effort — every failure (directory read, per-file unlink) is
 * swallowed so this can never mask the original fatal that triggered
 * it; callers (formatFatalAndExit) rely on that guarantee.
 */
export function applyCrashRetention(
  dir: string,
  config: CrashRetentionConfig,
  nowMs: number = Date.now(),
): void {
  try {
    const entries = readCrashArtifactDir(dir);
    const v1Entries = entries.filter((e): e is CrashArtifactV1Entry => e.kind === 'v1');
    const toPrune = selectCrashArtifactsToPrune(v1Entries, config, nowMs);
    for (const entry of toPrune) {
      try {
        unlinkSync(join(dir, entry.fileName));
      } catch {
        // best-effort per-file — one failure must not block the rest or throw
      }
    }
  } catch {
    // best-effort — retention must never throw out of the fatal write path
  }
}

/**
 * Top-level fatal handler used by process.on('uncaughtException') and
 * process.on('unhandledRejection'). Writes a single readable FATAL line
 * to stderr, optional stack trace (DECKENT_DEBUG=1), best-effort
 * schema-versioned crash artifact under .deckent/crashes/, then exits
 * with code 1.
 */
export function formatFatalAndExit(error: unknown): never {
  const { name, message, stack } = describeFatal(error);
  const redactedMessage = redactSensitive(message);
  const redactedStack = stack ? redactSensitive(stack) : stack;
  const debug = process.env.DECKENT_DEBUG === '1';

  process.stderr.write(`\x1b[31m✗ FATAL:\x1b[0m ${name}: ${redactedMessage}\n`);
  if (debug && redactedStack) {
    process.stderr.write(`${redactedStack}\n`);
  }

  try {
    const cwd = process.cwd();
    const dir = join(cwd, '.deckent', 'crashes');
    mkdirSync(dir, { recursive: true });
    const artifact = buildCrashArtifact({
      name,
      message: redactedMessage,
      stack: redactedStack,
      cwd,
      argv: process.argv,
    });
    const fileName = crashArtifactFileName(process.pid);
    writeCrashArtifactAtomic(dir, fileName, artifact);
    applyCrashRetention(dir, resolveCrashRetentionConfig());
  } catch {
    // Best-effort — fatal handler must never throw.
  }

  process.exit(1);
}

let fatalHandlersInstalled = false;

function isTestEnv(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

export interface InstallFatalHandlersOpts {
  /** Bypass the test-env skip (idempotency is still enforced). */
  force?: boolean;
}

/**
 * Install process-wide handlers for uncaughtException and
 * unhandledRejection that delegate to formatFatalAndExit.
 *
 * Idempotent — once installed, repeat calls return false (force does
 * not bypass this; use __resetFatalHandlersForTest to re-arm).
 * Skips installation under VITEST / NODE_ENV=test to keep vitest
 * isolation intact; pass { force: true } to override the test-env skip.
 *
 * Returns true if handlers were installed by this call, false otherwise.
 */
export function installFatalHandlers(opts: InstallFatalHandlersOpts = {}): boolean {
  if (fatalHandlersInstalled) return false;
  if (isTestEnv() && !opts.force) return false;

  process.on('uncaughtException', formatFatalAndExit);
  process.on('unhandledRejection', formatFatalAndExit);
  fatalHandlersInstalled = true;
  return true;
}

/**
 * Test-only helper — reset module-scope state so tests can re-exercise
 * installation logic. Not exported for production use.
 */
export function __resetFatalHandlersForTest(): void {
  fatalHandlersInstalled = false;
  process.removeListener('uncaughtException', formatFatalAndExit);
  process.removeListener('unhandledRejection', formatFatalAndExit);
}
