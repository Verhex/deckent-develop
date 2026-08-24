// ═══ Honest Gate — Dishonest Worker Result Detector ═══════════════════
// Sprint 194 Task 194-002 (W-INTEGRITY I-8, Sprint 192 192-012 carry-over).
//
// The Sprint 191 191-003 incident: worker `.result` notes claimed
// "+220 LoC outcome-tracker.ts" but the on-disk delta touched only a
// single test file. The existing honest-gate (result-evaluator.ts)
// caught structural stubs (`linesAdded=0 + selfAssessment=DONE`) but
// not magnitude or files-list dishonesty.
//
// This module adds three orthogonal detectors:
//   1. LOC_DELTA_MISMATCH    — claimed linesAdded vs git numstat ±tolerance
//   2. FILES_NOT_TOUCHED     — filesChanged list contains paths with no actual change
//   3. NOTES_CLAIM_MISMATCH  — notes-claimed "+N LoC" / "Files changed: X" disagrees
//                              with both result.linesAdded AND git numstat
//
// All three return a typed DishonestyFinding the caller can use to
// downgrade to NO_GO and emit the BRAIN→AUDITOR audit event.

import { normalizeChangedPaths } from '../core/task-result-schema.js';
import { spawnSync } from 'node:child_process';
import type { TaskResult, TaskScope } from '../core/types.js';
import { debugLog } from '../core/utils.js';
import { writeEvent } from './event-stream.js';
// Sprint 195 195-001 (W-INTEGRITY) — disk-verify for missing-but-on-disk work.
import { verifyDiskAgainstClaim, type VerifyDiskOptions } from './disk-verify.js';

// ─── Public API ───────────────────────────────────────────────────────

/** Audit-event channel emitted when a dishonest result is detected. */
export const DISHONEST_RESULT_DETECTED_CHANNEL =
  'BRAIN→AUDITOR:DISHONEST_RESULT_DETECTED';

/** Discrete dishonesty categories surfaced by {@link detectDishonestResult}. */
export type DishonestyReason =
  | 'LOC_DELTA_MISMATCH'
  | 'FILES_NOT_TOUCHED'
  | 'NOTES_CLAIM_MISMATCH'
  // Sprint 195 195-001: worker reported empty filesChanged but disk-verify
  // (git numstat / ls-files --others) found real work on disk. Indicates a
  // synthetic NO_GO that would discard partial work without the gate.
  | 'MISSING_RESULT_BUT_DISK_HAS_WORK';

/** Per-file additions/removals from a git numstat snapshot. */
export interface FileNumstat {
  added: number;
  removed: number;
}

/**
 * Returns numstat (added/removed lines) for a given list of file paths.
 *
 * Abstracted so tests can inject a deterministic in-memory provider and
 * production calls can use git. Keys are normalized forward-slash paths.
 */
export interface GitNumstatProvider {
  numstat(filePaths: readonly string[]): Map<string, FileNumstat>;
}

/** Outcome of running {@link detectDishonestResult}. */
export interface DishonestyFinding {
  dishonest: boolean;
  reason?: DishonestyReason;
  detail?: string;
  /** Lines the worker claimed in `result.linesAdded` (or from notes). */
  claimedLines?: number;
  /** Lines git numstat reports for the same files. */
  actualLines?: number;
  /** Files listed in `result.filesChanged` with zero on-disk delta. */
  untouchedFiles?: string[];
}

/** Parsed structured claims extracted from the freeform `notes` field. */
export interface NotesClaims {
  /** Largest "+N LoC" / "added N lines" / "N+ lines" hit found in notes. */
  locAdded?: number;
  /** Files mentioned after "Files changed:" / "files modified:" headers. */
  files: string[];
}

// ─── Notes Parsing (heuristic) ────────────────────────────────────────

// "Files changed: a/b.ts, c/d.ts" (single-line, terminated by newline or semicolon)
const FILES_CLAIM_REGEX = /(?:files?\s+(?:changed|modified|added|touched)|changed\s+files?)\s*:?\s*([^\n;]+)/i;

// "+220 LoC", "+220 loc", "added 220 lines", "220+ lines added"
const LOC_CLAIM_REGEXES: ReadonlyArray<RegExp> = [
  /\+\s*(\d{1,6})\s*(?:LoC|loc|lines?)\b/g,
  /added\s+(\d{1,6})\s*(?:LoC|loc|lines?)\b/gi,
  /(\d{1,6})\s*\+\s*lines?\s*added/gi,
];

/**
 * Best-effort structured parse of the freeform `notes` field. Returns the
 * largest LoC-added claim and any file list that appears after a
 * "Files changed:" / "Files modified:" header.
 *
 * This is intentionally generous (no fuzz, no NLP) — we only fire the
 * NOTES_CLAIM_MISMATCH rule when notes claim a delta of >= 50 lines and
 * BOTH `result.linesAdded` and the git numstat disagree, so heuristic
 * misses are not load-bearing.
 */
export function parseNotesClaims(notes: string | undefined | null): NotesClaims {
  const out: NotesClaims = { files: [] };
  if (!notes || notes.length === 0) return out;

  let maxLoc = 0;
  for (const re of LOC_CLAIM_REGEXES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(notes)) !== null) {
      const n = parseInt(m[1] ?? '', 10);
      if (!Number.isNaN(n) && n > maxLoc) maxLoc = n;
    }
  }
  if (maxLoc > 0) out.locAdded = maxLoc;

  const filesMatch = FILES_CLAIM_REGEX.exec(notes);
  if (filesMatch && typeof filesMatch[1] === 'string') {
    const raw = filesMatch[1];
    const tokens = raw
      .split(/[,\s]+/)
      .map(t => t.trim().replace(/[`*'"]/g, ''))
      .filter(t => t.length > 0 && /\.[a-zA-Z0-9]+$/.test(t));
    out.files = tokens;
  }

  return out;
}

// ─── Detector ─────────────────────────────────────────────────────────

/** Options for {@link detectDishonestResult}. */
export interface DetectDishonestOptions {
  /** Allowed deviation between claimed and actual linesAdded (0..1). Default 0.5 (±50%). */
  tolerance?: number;
  /**
   * Minimum claimed linesAdded before the LOC_DELTA_MISMATCH rule fires.
   * Prevents trivial "1 line added" rounding noise from being flagged. Default 20.
   */
  minLocThreshold?: number;
  /**
   * Sprint 195 195-001 — disk-verify context for the
   * MISSING_RESULT_BUT_DISK_HAS_WORK rule. When provided, the detector runs
   * `verifyDiskAgainstClaim(projectRoot, scope)` on empty-`filesChanged`
   * results to distinguish "honest no-op" from "lost work". Omit to keep
   * the legacy early-return behavior (empty `filesChanged` → honest).
   */
  diskVerify?: {
    projectRoot: string;
    scope: TaskScope;
    /** Inject test providers; defaults to git spawnSync. */
    options?: VerifyDiskOptions;
  };
}

/**
 * Detect dishonest worker results by cross-checking `result.filesChanged`
 * + `result.linesAdded` + `result.notes` against ground-truth git numstat.
 *
 * Returns the FIRST matching dishonesty reason (priority order):
 *   1. FILES_NOT_TOUCHED      — list claims files git did not touch
 *   2. LOC_DELTA_MISMATCH     — linesAdded deviates from numstat sum > tolerance
 *   3. NOTES_CLAIM_MISMATCH   — notes-claim disagrees with both result + git
 *
 * Honest results (no rule fires) return `{ dishonest: false }`.
 *
 * Test/audit-only — does not write to disk and does not emit the audit
 * event. Use {@link emitDishonestResultEvent} after a positive detection.
 */
export function detectDishonestResult(
  result: TaskResult | null | undefined,
  git: GitNumstatProvider,
  opts: DetectDishonestOptions = {},
): DishonestyFinding {
  if (!result) return { dishonest: false };
  const tolerance = clampTolerance(opts.tolerance ?? 0.5);
  const minLoc = opts.minLocThreshold ?? 20;

  const filesChanged = normalizeChangedPaths(result.filesChanged).map(normalizePath);

  // Sprint 195 195-001 — MISSING_RESULT_BUT_DISK_HAS_WORK rule.
  // When filesChanged is empty, the legacy fast-path returned "honest". That
  // misclassified synthetic NO_GO writes (worker exited without .result; Brain
  // wrote an empty stub) as honest results, hiding lost work. When the caller
  // provides a disk-verify context, we now check the filesystem before declaring
  // honest. Without context, preserve the legacy behavior to avoid surprising
  // callers that don't know about the new rule.
  if (filesChanged.length === 0) {
    if (!opts.diskVerify) return { dishonest: false };
    const dv = verifyDiskAgainstClaim(
      opts.diskVerify.projectRoot,
      opts.diskVerify.scope,
      opts.diskVerify.options,
    );
    if (!dv.hasDiskEvidence) return { dishonest: false };
    return {
      dishonest: true,
      reason: 'MISSING_RESULT_BUT_DISK_HAS_WORK',
      detail:
        `result.filesChanged=[] but disk-verify found evidence ` +
        `(linesAdded=${dv.linesAdded}, untrackedFiles=${dv.untrackedFiles.length})`,
      claimedLines: result.linesAdded ?? 0,
      actualLines: dv.linesAdded,
      untouchedFiles: dv.untrackedFiles,
    };
  }

  // Pull ground truth for the union of result-claimed files and notes-claimed files
  const notesClaims = parseNotesClaims(result.notes);
  const allFiles = unique([...filesChanged, ...notesClaims.files.map(normalizePath)]);
  const numstat = safeNumstat(git, allFiles);

  // Rule 1 — FILES_NOT_TOUCHED: claimed files with both 0 added AND 0 removed
  const untouched = filesChanged.filter(f => {
    const ns = numstat.get(f);
    return ns !== undefined && ns.added === 0 && ns.removed === 0;
  });
  // Sprint 191 191-003: worker listed outcome-tracker.ts but git showed only test
  // delta. Only fire when MOST claimed files are untouched (avoid noise when
  // worker legitimately edited some files but listed extras for context).
  if (
    untouched.length > 0 &&
    untouched.length === filesChanged.length &&
    (result.linesAdded ?? 0) >= minLoc
  ) {
    return {
      dishonest: true,
      reason: 'FILES_NOT_TOUCHED',
      detail:
        `all ${untouched.length} claimed file(s) have zero git delta: ${untouched.join(', ')}; ` +
        `linesAdded=${result.linesAdded ?? 0}`,
      claimedLines: result.linesAdded ?? 0,
      actualLines: 0,
      untouchedFiles: untouched,
    };
  }

  // Rule 2 — LOC_DELTA_MISMATCH: |claimed - actual| / max > tolerance
  const claimed = result.linesAdded ?? 0;
  const actual = sumAdded(filesChanged, numstat);
  if (claimed >= minLoc && exceedsTolerance(claimed, actual, tolerance)) {
    return {
      dishonest: true,
      reason: 'LOC_DELTA_MISMATCH',
      detail:
        `claimed linesAdded=${claimed} but git numstat sum=${actual} ` +
        `(deviation ${formatPct(deviation(claimed, actual))} > tolerance ${formatPct(tolerance)})`,
      claimedLines: claimed,
      actualLines: actual,
    };
  }

  // Rule 3 — NOTES_CLAIM_MISMATCH: notes claim ≥ minLoc, disagrees with both result and git
  if (
    notesClaims.locAdded !== undefined &&
    notesClaims.locAdded >= minLoc &&
    exceedsTolerance(notesClaims.locAdded, claimed, tolerance) &&
    exceedsTolerance(notesClaims.locAdded, actual, tolerance)
  ) {
    return {
      dishonest: true,
      reason: 'NOTES_CLAIM_MISMATCH',
      detail:
        `notes claim "+${notesClaims.locAdded} LoC" disagrees with result.linesAdded=${claimed} ` +
        `and git numstat sum=${actual}`,
      claimedLines: notesClaims.locAdded,
      actualLines: actual,
    };
  }

  return { dishonest: false };
}

// ─── Event Emission ───────────────────────────────────────────────────

/** Sink shape — kept narrow so tests can pass a `vi.fn()` spy. */
export type DishonestEventSink = (channel: string, payload: unknown) => void;

/**
 * Emit the BRAIN→AUDITOR:DISHONEST_RESULT_DETECTED audit event.
 *
 * When no `sink` is provided, writes through the shared event-stream
 * (`writeEvent` from `./event-stream.js`). Tests pass a sink to capture
 * the payload without touching disk.
 */
export function emitDishonestResultEvent(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  finding: DishonestyFinding,
  sink?: DishonestEventSink,
): void {
  if (!finding.dishonest || !finding.reason) return;

  const payload = {
    taskId,
    reason: finding.reason,
    detail: finding.detail ?? '',
    claimedLines: finding.claimedLines ?? null,
    actualLines: finding.actualLines ?? null,
    untouchedFiles: finding.untouchedFiles ?? [],
    emittedAt: new Date().toISOString(),
  };

  if (sink) {
    sink(DISHONEST_RESULT_DETECTED_CHANNEL, payload);
    return;
  }

  writeEvent(
    projectRoot,
    sprintId,
    'brain',
    'auditor',
    DISHONEST_RESULT_DETECTED_CHANNEL,
    payload,
  );
}

// ─── Default Git Provider ─────────────────────────────────────────────

/**
 * Default git provider — runs `git diff --numstat HEAD -- <files>` and
 * parses the output. Follows ADR-006 (array-form spawnSync, no shell).
 *
 * Used in production by the EVALUATE phase. Tests should use a fake
 * provider via {@link makeStaticGitNumstatProvider}.
 */
export function createDefaultGitNumstatProvider(
  projectRoot: string,
): GitNumstatProvider {
  return {
    numstat(filePaths) {
      const result = new Map<string, FileNumstat>();
      if (filePaths.length === 0) return result;
      try {
        const args = ['diff', '--numstat', 'HEAD', '--', ...filePaths];
        const res = spawnSync('git', args, {
          cwd: projectRoot,
          encoding: 'utf-8',
          timeout: 10_000,
        });
        if (res.error || res.status !== 0 || typeof res.stdout !== 'string') {
          debugLog('honest-gate:numstat', `git diff failed status=${res.status}`);
          // Fail-open: empty map means "no evidence" — detector treats
          // unknown files as untouched only when the file is explicitly
          // present in the map, so missing entries do not trigger false
          // positives.
          return result;
        }
        for (const line of res.stdout.split('\n')) {
          if (!line.trim()) continue;
          const parts = line.split('\t');
          if (parts.length < 3) continue;
          const added = parseGitCount(parts[0]);
          const removed = parseGitCount(parts[1]);
          const path = (parts[2] ?? '').trim();
          if (!path) continue;
          result.set(normalizePath(path), { added, removed });
        }
        // Files that git did not report (i.e. truly untouched) are added
        // explicitly so the detector can distinguish "untouched" from
        // "unknown to git" — git omits unchanged files from numstat output.
        for (const f of filePaths) {
          const norm = normalizePath(f);
          if (!result.has(norm)) {
            result.set(norm, { added: 0, removed: 0 });
          }
        }
      } catch (e) {
        debugLog('honest-gate:numstat', e);
      }
      return result;
    },
  };
}

/**
 * Construct a deterministic in-memory git provider — for tests only.
 *
 * Files absent from the map are reported as `{added: 0, removed: 0}`
 * (matching the real provider's behavior for untouched files in scope).
 */
export function makeStaticGitNumstatProvider(
  data: Record<string, FileNumstat>,
): GitNumstatProvider {
  return {
    numstat(filePaths) {
      const out = new Map<string, FileNumstat>();
      for (const f of filePaths) {
        const norm = normalizePath(f);
        out.set(norm, data[norm] ?? data[f] ?? { added: 0, removed: 0 });
      }
      return out;
    },
  };
}

// ─── Garbage Throw Detector ───────────────────────────────────────────

/**
 * Keywords used in stub/placeholder throws that indicate structural garbage.
 * Matches both single-quote and double-quote / backtick forms.
 */
const GARBAGE_THROW_KEYWORDS = ['unreachable', 'placeholder', 'TODO'] as const;

/** Per-occurrence evidence of a garbage throw pattern. */
export interface GarbageThrowMatch {
  file: string;
  pattern: string;
  /** 1-based line number where the pattern was found. */
  line: number;
}

/** Result of {@link detectGarbageThrows}. */
export interface GarbageThrowFinding {
  hasGarbageThrow: boolean;
  matches: GarbageThrowMatch[];
}

/**
 * Scan file contents for module-level stub throw patterns that indicate
 * structural garbage left by workers (Sprint 208 incident: 8×unreachable,
 * 2×placeholder in enterprise-config/tenant-context).
 *
 * Detects `throw new Error('unreachable'|'placeholder'|'TODO')` with any
 * combination of single-quotes, double-quotes, or backticks. Returns all
 * matches so callers can flag results or emit audit events.
 *
 * @param fileContents - Map of file path → file source text.
 */
export function detectGarbageThrows(
  fileContents: Map<string, string>,
): GarbageThrowFinding {
  const matches: GarbageThrowMatch[] = [];

  for (const [file, content] of fileContents) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      for (const keyword of GARBAGE_THROW_KEYWORDS) {
        // Match: throw new Error(<quote>keyword<quote>) with optional whitespace
        const re = new RegExp(
          `throw\\s+new\\s+Error\\s*\\(\\s*['"\`]${keyword}['"\`]\\s*\\)`,
        );
        if (re.test(line)) {
          matches.push({ file, pattern: `throw new Error('${keyword}')`, line: i + 1 });
        }
      }
    }
  }

  return { hasGarbageThrow: matches.length > 0, matches };
}

// ─── Internal Helpers ─────────────────────────────────────────────────

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').trim();
}

function unique<T>(arr: readonly T[]): T[] {
  return Array.from(new Set(arr));
}

function safeNumstat(
  git: GitNumstatProvider,
  files: readonly string[],
): Map<string, FileNumstat> {
  try {
    return git.numstat(files);
  } catch (e) {
    debugLog('honest-gate:safeNumstat', e);
    return new Map();
  }
}

function sumAdded(files: readonly string[], numstat: Map<string, FileNumstat>): number {
  let total = 0;
  for (const f of files) {
    const ns = numstat.get(f);
    if (ns) total += ns.added;
  }
  return total;
}

function clampTolerance(t: number): number {
  if (!Number.isFinite(t) || t < 0) return 0.5;
  if (t > 1) return 1;
  return t;
}

function deviation(claimed: number, actual: number): number {
  const max = Math.max(claimed, actual);
  if (max === 0) return 0;
  return Math.abs(claimed - actual) / max;
}

function exceedsTolerance(claimed: number, actual: number, tolerance: number): boolean {
  return deviation(claimed, actual) > tolerance;
}

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function parseGitCount(raw: string | undefined): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  // git uses "-" for binary files — treat as 0
  if (trimmed === '-' || trimmed === '') return 0;
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? 0 : n;
}
