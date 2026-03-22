import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BRAIN_DIR, ARCHIVE_DIR, SPRINTS_DIR, DEBT_TABLE_HEADER, DECKENT_FILE, PROJECT_CONFIG_PATH } from './constants.js';
import type { DebtItem } from './types.js';
import { DebtPriority } from './types.js';

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
  } catch {
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
  } catch {
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
  } catch {
    return null;
  }
}

/**
 * Count total lines in .brain/ directory (excluding archive/).
 * Used by brain decay and doctor health checks.
 * @param projectRoot - Project root directory
 * @returns Total line count across all .brain/ files
 */
export function countBrainLines(projectRoot: string): number {
  const brainPath = join(projectRoot, BRAIN_DIR);
  if (!existsSync(brainPath)) return 0;

  let total = 0;
  const entries = readdirSync(brainPath);
  for (const entry of entries) {
    if (entry === ARCHIVE_DIR || entry === SPRINTS_DIR) continue;
    try { total += readFileSync(join(brainPath, entry), 'utf-8').split('\n').length; } catch { /* dir */ }
  }

  const sprintsPath = join(brainPath, SPRINTS_DIR);
  if (existsSync(sprintsPath)) {
    for (const file of readdirSync(sprintsPath)) {
      try { total += readFileSync(join(sprintsPath, file), 'utf-8').split('\n').length; } catch { /* skip */ }
    }
  }
  return total;
}

/**
 * Scan .brain/sprints/ directory AND .deckent/config.json last_sprint_id,
 * take the max of both sources, return sprint-{max+1} padded to 3 digits.
 * Never goes backward — config acts as a floor when sprint files are missing.
 * If no sources available, returns "sprint-001".
 */
export function getNextSprintId(projectRoot: string): string {
  // Source 1: scan .brain/sprints/ (file-based)
  const sprintsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  let maxFromFiles = 0;
  if (existsSync(sprintsDir)) {
    for (const file of readdirSync(sprintsDir)) {
      const match = file.match(/^sprint-(\d+)\.md$/);
      if (match?.[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxFromFiles) maxFromFiles = num;
      }
    }
  }

  // Source 2: read last_sprint_id from .deckent/config.json
  let maxFromConfig = 0;
  const configPath = join(projectRoot, PROJECT_CONFIG_PATH);
  const config = readJsonSafe<Record<string, unknown>>(configPath);
  if (config) {
    const lastId = config.last_sprint_id;
    if (typeof lastId === 'string') {
      const m = lastId.match(/^sprint-(\d+)$/);
      if (m?.[1]) maxFromConfig = parseInt(m[1], 10);
    } else if (typeof lastId === 'number') {
      maxFromConfig = lastId;
    }
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
    const config: Record<string, unknown> = readJsonSafe<Record<string, unknown>>(configPath) ?? {};
    config.last_sprint_id = sprintId;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  } catch { /* ignore — non-critical */ }
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
    if (!content.includes(ref)) {
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
