import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ARCHIVE_DIR,
  ARCHIVE_SPRINTS_SUBDIR,
  BRAIN_DIR,
  DEBT_TABLE_HEADER,
  DECKENT_DIR,
  DECKENT_FILE,
  ERRORS_CRITICAL_CLASS_RE,
  ERRORS_CRITICAL_FILE,
  ERRORS_CRITICAL_MAX_LINES,
  ERRORS_FILE,
  ERRORS_MAX_LINES,
  PROJECT_CONFIG_PATH,
  RECENT_WORKS_DIR,
  SPRINTS_DIR,
} from './constants.js';
import type { DebtItem } from './types.js';
import { DebtPriority } from './types.js';

/**
 * Log a debug message to stderr (when DECKENT_DEBUG is set) and always
 * append to .brain/ERRORS.md for persistent error tracking.
 * @param context - Short label describing where the error occurred (e.g. 'readJsonSafe')
 * @param error - The caught error or message to log
 */
export function debugLog(context: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  // Write to stderr when DECKENT_DEBUG is set
  if (process.env['DECKENT_DEBUG']) {
    process.stderr.write(`[deckent:debug] ${context}: ${msg}\n`);
  }
  // Always append to .brain/ERRORS.md (non-fatal)
  appendToErrorsFile(context, msg);
}

/**
 * Append an error entry to .brain/ERRORS.md in pipe-delimited format.
 * Trims file to ERRORS_MAX_LINES (constants.ts — 600 since Sprint 140) to prevent unbounded growth.
 * Non-fatal: any write failure is silently ignored.
 */
function appendToErrorsFile(context: string, message: string): void {
  // Skip writing to real .brain/ERRORS.md during vitest test runs.
  // Tests generate hundreds of expected errors that overwhelm real sprint events.
  if (process.env['VITEST'] || process.env['NODE_ENV'] === 'test') return;
  const brainDir = BRAIN_DIR;
  if (!existsSync(brainDir)) return; // No .brain/ dir — not initialized
  const timestamp = new Date().toISOString();
  const sanitized = message.replace(/\n/g, ' ').slice(0, 200);
  const entry = `| ${timestamp} | ${context} | ${sanitized} |\n`;

  appendWithLineLimit(join(brainDir, ERRORS_FILE), entry, ERRORS_MAX_LINES);

  const errorCode = getErrorCode(message) ?? context;
  if (
    ERRORS_CRITICAL_CLASS_RE.test(context)
    || ERRORS_CRITICAL_CLASS_RE.test(errorCode)
  ) {
    appendWithLineLimit(
      join(brainDir, ERRORS_CRITICAL_FILE),
      entry,
      ERRORS_CRITICAL_MAX_LINES,
    );
  }
}

function getErrorCode(message: string): string | undefined {
  return message.match(/\b(?:CONFIG_[A-Z0-9_]*|[A-Z][A-Z0-9_]*_HOLD)\b/)?.[0];
}

function appendWithLineLimit(filePath: string, entry: string, maxLines: number): void {
  try {
    appendFileSync(filePath, entry, 'utf-8');
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length > maxLines) {
      writeFileSync(filePath, `${lines.slice(-maxLines).join('\n')}\n`, 'utf-8');
    }
  } catch {
    // Error logging must never alter the caller's control flow.
  }
}

/** Type guard: validates that a string is a valid DebtPriority enum value. */
function isDebtPriority(value: string): value is DebtPriority {
  return Object.values(DebtPriority).includes(value as DebtPriority);
}

/**
 * Read a file safely, returning empty string on any error.
 * @param filePath - Absolute or relative path to the file
 * @returns File contents as string, or empty string on failure
 */
export function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (e) {
    debugLog('readFileSafe', e);
    return '';
  }
}

/**
 * Parse a JSON file safely, returning null on any error.
 * @param filePath - Path to the JSON file
 * @returns Parsed object of type T, or null on failure
 */
export function readJsonSafe<T>(filePath: string): T | null {
  try {
    // safe: generic T is caller-supplied; validation is deferred to caller; null returned on parse failure
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch (e) {
    // W7 (2026-07-07): a MISSING file is this function's expected soft-miss —
    // callers probe optional state with it constantly (status pollers hit
    // sprint-state.json every 15s). Logging ENOENT flooded ERRORS.md's rolling
    // window (599/600 lines) and rotated real forensic entries out (born-484
    // lesson). Only UNEXPECTED failures (parse errors, EACCES...) are logged.
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT' && (e as NodeJS.ErrnoException)?.code !== 'ENOTDIR') {
      debugLog('readJsonSafe', e);
    }
    return null;
  }
}

/**
 * Async variant of readJsonSafe. Parse a JSON file safely, returning null on any error.
 * @param filePath - Path to the JSON file
 * @returns Parsed object of type T, or null on failure
 */
export async function readJsonSafeAsync<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    // safe: generic T is caller-supplied; validation is deferred to caller; null returned on parse failure
    return JSON.parse(content) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT' && (e as NodeJS.ErrnoException)?.code !== 'ENOTDIR') debugLog('readJsonSafeAsync', e);
    return null;
  }
}

/**
 * Scan every durable run-identity surface plus `.deckent/config.json`, take
 * the maximum observed identity and return its successor. Test-mode runs do
 * not write memory/finalizer state, so the event/metric and task-archive
 * ledgers are required to prevent a cleaned test run from reusing an identity
 * and appending a second generation to the first generation's event stream.
 * Config remains a floor when other evidence is removed.
 * If no sources available, returns "sprint-001".
 */
const LEGACY_EPOCH_SPRINT_MIN_MS = Date.UTC(2000, 0, 1);
const LEGACY_EPOCH_SPRINT_MAX_MS = Date.UTC(3000, 0, 1);

/**
 * Parse an ordinal sprint identity without confusing legacy Date.now()-based
 * detached-job identities with the repository's monotonic sprint sequence.
 *
 * Historical `sprint-17…` records remain valid archive evidence; they are only
 * excluded from sequence allocation. The bounded epoch range is semantic (real
 * millisecond timestamps), rather than a digit-count shortcut that would cap a
 * future large installation's ordinal namespace.
 */
export function parseSprintOrdinal(value: unknown): number | null {
  let candidate: number;
  if (typeof value === 'number') {
    candidate = value;
  } else if (typeof value === 'string') {
    const match = value.match(/^sprint-(\d+)$/);
    if (!match?.[1]) return null;
    candidate = Number(match[1]);
  } else {
    return null;
  }

  if (!Number.isSafeInteger(candidate) || candidate < 0) return null;
  if (candidate >= LEGACY_EPOCH_SPRINT_MIN_MS && candidate < LEGACY_EPOCH_SPRINT_MAX_MS) {
    return null;
  }
  return candidate;
}

export function getNextSprintId(projectRoot: string): string {
  const evidenceDirectories = [
    join(projectRoot, BRAIN_DIR, SPRINTS_DIR),
    join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR),
    join(projectRoot, DECKENT_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR),
    join(projectRoot, RECENT_WORKS_DIR),
  ];
  let maxFromFiles = 0;
  for (const directory of evidenceDirectories) {
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      const match = file.match(/^sprint-(\d+)(?:\D|$)/)
        ?? file.match(/^task-(\d+)-/);
      if (match?.[1]) {
        const ordinal = parseSprintOrdinal(`sprint-${match[1]}`);
        if (ordinal !== null && ordinal > maxFromFiles) maxFromFiles = ordinal;
      }
    }
  }

  // Source 2: read last_sprint_id from .deckent/config.json
  let maxFromConfig = 0;
  const configPath = join(projectRoot, PROJECT_CONFIG_PATH);
  const config = readJsonSafe<Record<string, unknown>>(configPath);
  if (config) {
    const lastId = config.last_sprint_id;
    const ordinal = parseSprintOrdinal(lastId);
    if (ordinal !== null) maxFromConfig = ordinal;
  }

  // Take the max of both sources — never go backward
  const maxNumber = Math.max(maxFromFiles, maxFromConfig);
  return `sprint-${String(maxNumber + 1).padStart(3, '0')}`;
}

/**
 * Persist the latest sprint ID into .deckent/config.json so that
 * getNextSprintId never regresses even if sprint log files are deleted.
 */
export function updateLastSprintId(projectRoot: string, sprintId: string): void {
  const configPath = join(projectRoot, PROJECT_CONFIG_PATH);
  try {
    if (parseSprintOrdinal(sprintId) === null || !/^sprint-\d+$/.test(sprintId)) {
      debugLog('updateLastSprintId', `refusing non-ordinal sprint identity: ${sprintId}`);
      return;
    }
    // Read existing config — use empty object ONLY if file doesn't exist yet
    // If file exists but is corrupted/unreadable, skip update to preserve whatever is there
    if (!existsSync(configPath)) {
      // A missing project config is an anomaly (crash/race window), never a
      // license to mint one: writing `{last_sprint_id}` from an empty base has
      // erased every owner setting three times live (2026-08-25 incident —
      // 37-byte config.json.bak evidence). The ordinal is derivable from
      // sprint-state/archives; losing it is cheaper than losing the config.
      debugLog('updateLastSprintId', 'config.json absent — refusing to mint a single-field config');
      return;
    }
    const parsed = readJsonSafe<Record<string, unknown>>(configPath);
    if (!parsed) {
      debugLog('updateLastSprintId', 'config.json exists but unreadable — skipping to preserve settings');
      return;
    }
    const config = parsed;
    const currentOrdinal = parseSprintOrdinal(config.last_sprint_id);
    const nextOrdinal = parseSprintOrdinal(sprintId);
    if (nextOrdinal === null || (currentOrdinal !== null && nextOrdinal < currentOrdinal)) {
      debugLog('updateLastSprintId', `refusing regressive sprint identity: ${sprintId}`);
      return;
    }
    config.last_sprint_id = sprintId;
    // Atomic replace: a plain truncate+write let concurrent readers observe a
    // half-written file, which the loadConfig self-healer then falsely moved
    // aside as "corrupted" (same incident). tmp+rename is atomic on POSIX.
    const tmpPath = `${configPath}.${process.pid}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n');
    renameSync(tmpPath, configPath);
  } catch (e) { debugLog('updateLastSprintId', e); }
}

/**
 * Parse a sprint ID string like "sprint-021" and return the numeric part (21).
 * Returns 0 if the format is unrecognised.
 */
export function parseSprintNumber(sprintId: string): number {
  const match = sprintId.match(/sprint-(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : 0;
}

/**
 * Decide whether a DEBT.md entry should be removed during decay.
 *
 * Rules:
 * - open entry (resolved === false)         → keep (return false)
 * - resolved, resolvedInSprintId undefined  → remove (legacy, return true)
 * - resolved, sprint diff >= retentionSprints → remove (return true)
 * - resolved, sprint diff < retentionSprints  → keep (return false)
 */
export function shouldRemoveResolvedDebt(
  entry: DebtItem,
  currentSprintId: string,
  retentionSprints = 3,
): boolean {
  if (!entry.resolved) return false;                         // open → keep
  if (entry.resolvedInSprintId === undefined) return true;  // legacy → remove
  const diff = parseSprintNumber(currentSprintId) - parseSprintNumber(entry.resolvedInSprintId);
  return diff >= retentionSprints;                          // old enough → remove
}

/**
 * Parse a DEBT.md markdown table into an array of DebtItem objects.
 * Expects a pipe-delimited table with columns: ID, Description, OriginTaskId,
 * OriginSprintId, Priority, SprintsOpen, Resolved, ResolvedInSprintId, CreatedAt.
 * @deprecated Memory V2 stores debt in SQLite DB. Kept for V1 fallback and migration.
 * @param content - Raw markdown content containing the debt table
 * @returns Parsed debt items; returns empty array if no valid table found
 */
export function parseDebtTable(content: string): DebtItem[] {
  const lines = content.split('\n');
  const items: DebtItem[] = [];
  let headerFound = false;

  for (const line of lines) {
    if (line.includes('| ID |')) { headerFound = true; continue; }
    if (!headerFound) continue;
    if (line.startsWith('|---') || line.startsWith('| ---')) continue;
    if (!line.startsWith('|')) continue;

    const cols = line.split('|').slice(1, -1).map(c => c.trim());
    if (cols.length < 9) continue;

    items.push({
      id: cols[0] ?? '',
      description: cols[1] ?? '',
      originTaskId: cols[2] ?? '',
      originSprintId: cols[3] ?? '',
      priority: isDebtPriority(cols[4] ?? '') ? cols[4] as DebtPriority : DebtPriority.NORMAL,
      sprintsOpen: parseInt(cols[5] ?? '0', 10) || 0,
      resolved: cols[6] === 'true',
      resolvedInSprintId: cols[7] === '-' ? undefined : cols[7],
      createdAt: cols[8] ?? '',
    });
  }
  return items;
}

/**
 * Generate a pipe-delimited markdown table string from an array of DebtItem objects.
 * Produces a table with header, separator, and one row per item.
 * @deprecated Memory V2 stores debt in SQLite DB. Kept for V1 fallback and migration.
 * @param items - Debt items to render as table rows
 * @returns Formatted markdown table string
 */
export function generateDebtTable(items: DebtItem[]): string {
  const separator = '|----|-------------|------|--------|----------|------|----------|----------|---------|';
  const rows = items.map(d =>
    `| ${d.id} | ${d.description} | ${d.originTaskId} | ${d.originSprintId} | ${d.priority} | ${d.sprintsOpen} | ${d.resolved} | ${d.resolvedInSprintId ?? '-'} | ${d.createdAt} |`,
  );
  return [DEBT_TABLE_HEADER, separator, ...rows].join('\n');
}

/**
 * Ensure a file contains `@DECKENT.md` reference.
 * - File doesn't exist -> create with `@DECKENT.md\n`
 * - File exists without reference -> prepend `@DECKENT.md\n\n` to existing content
 * - File exists with reference -> no-op (idempotent)
 * @param filePath - Path to the file to check/update
 */
export function ensureDeckentImport(filePath: string): void {
  const ref = `@${DECKENT_FILE}`;
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf-8');
    // Reference-aware: ANY mention of DECKENT.md satisfies the requirement — the
    // `@`-auto-load import OR a plain "see DECKENT.md" on-demand reference. Only
    // prepend the auto-load import when there is NO reference at all, so a
    // deliberate on-demand choice (context-trim) is respected, not overwritten
    // back to auto-load. Backward-compatible: files with `@DECKENT.md` unchanged.
    if (!content.includes(DECKENT_FILE)) {
      writeFileSync(filePath, `${ref}\n\n${content}`);
    }
  } else {
    writeFileSync(filePath, `${ref}\n`);
  }
}

// ─── i18n Date/Time Localization ─────────────────────────────────────────────

const DATE_LOCALES: Record<string, string> = {
  en: 'en-US',
  tr: 'tr-TR',
};

/**
 * Format a Date or ISO string according to the given language.
 * Supported lang values: 'en' (default), 'tr'
 * @param date - Date object or ISO date string to format
 * @param lang - Language code ('en' or 'tr')
 * @returns Formatted date string in the given locale
 */
export function formatDate(date: Date | string, lang: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const locale = DATE_LOCALES[lang] ?? DATE_LOCALES['en'] ?? 'en-US';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

const DURATION_UNITS: Array<{ ms: number; en: string; tr: string }> = [
  { ms: 86_400_000, en: 'day', tr: 'gün' },
  { ms: 3_600_000, en: 'hour', tr: 'saat' },
  { ms: 60_000, en: 'minute', tr: 'dakika' },
  { ms: 1_000, en: 'second', tr: 'saniye' },
];

/**
 * Format a duration in milliseconds into a human-readable string.
 * e.g. formatDuration(300000, 'en') -> "5 minutes"
 *      formatDuration(300000, 'tr') -> "5 dakika"
 * @param ms - Duration in milliseconds
 * @param lang - Language code ('en' or 'tr')
 * @returns Human-readable duration string
 */
export function formatDuration(ms: number, lang: string): string {
  if (ms < 0) ms = 0;
  const isTr = lang === 'tr';

  for (const unit of DURATION_UNITS) {
    const value = Math.floor(ms / unit.ms);
    if (value >= 1) {
      if (isTr) {
        return `${value} ${unit.tr}`;
      }
      return value === 1 ? `1 ${unit.en}` : `${value} ${unit.en}s`;
    }
  }
  return isTr ? '0 saniye' : '0 seconds';
}

/**
 * Format the time elapsed since `date` as a relative string.
 * e.g. formatRelativeTime(pastDate, 'en') -> "3 seconds ago"
 *      formatRelativeTime(pastDate, 'tr') -> "3 saniye once"
 * For future dates: "in 3 seconds" / "3 saniye sonra"
 * @param date - The reference date to compare against now
 * @param lang - Language code ('en' or 'tr')
 * @returns Relative time string like "5 minutes ago"
 */
export function formatRelativeTime(date: Date, lang: string): string {
  const diffMs = Date.now() - date.getTime();
  const isFuture = diffMs < 0;
  const absDiff = Math.abs(diffMs);
  const isTr = lang === 'tr';

  const duration = formatDuration(absDiff, lang);

  if (isTr) {
    return isFuture ? `${duration} sonra` : `${duration} önce`;
  }
  return isFuture ? `in ${duration}` : `${duration} ago`;
}
