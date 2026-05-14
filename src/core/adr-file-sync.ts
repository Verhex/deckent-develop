// ═══ ADR File Sync ════════════════════════════════════════════════
// Parses MADR v3 ADR markdown files in `docs/adr/*.md` and upserts
// them into the memory.db. Used by:
//   - identity-generator.ts postFinalizeHooks (Step 3 adrInsert)
//   - memory.ts `rebuild` action (primary source over decisions.md)
//
// MADR v3 format expectations:
//   - Filename: `NNN-kebab-title.md` (e.g. `043-brain-crash-recovery-protocol.md`)
//   - H1: `# ADR-NNN: Title`
//   - Status: `**Status:** <word>` (first occurrence)
//   - Sprint: `**Sprint:** Sprint NNN` or `(Sprint NNN ...)`

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryStore } from './memory-store.js';
import type { CreateEntryInput } from './memory-types.js';
import { extractKeywords } from './memory-import.js';
import { debugLog } from './utils.js';

// ─── Types ────────────────────────────────────────────────────────

/** Parsed ADR metadata extracted from a markdown file. */
export interface ParsedAdr {
  /** Normalized ID, e.g. `adr-043` (lowercase, 3-digit zero-padded). */
  id: string;
  /** Title text without the `ADR-NNN:` prefix. */
  title: string;
  /** Lowercased status word (accepted, deprecated, proposed, etc.). */
  status: string;
  /** Optional sprint id `sprint-NNN`. Extracted from frontmatter or body. */
  sprintId: string | null;
  /** Sprint number (0 if not found). */
  sprintNum: number;
  /** Full markdown content. */
  content: string;
}

/** Result of a sync run over a directory of ADR files. */
export interface AdrSyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  ids: string[];
}

// ─── Parsing ──────────────────────────────────────────────────────

const FILENAME_PATTERN = /^(\d{3,})-.+\.md$/i;
const H1_PATTERN = /^#\s*ADR-(\d+):\s*(.+)$/m;
const STATUS_PATTERN = /\*\*Status:\*\*\s*([A-Za-z][A-Za-z_-]*)/;
const SPRINT_PATTERN = /\*\*Sprint:\*\*\s*Sprint\s+(\d+)/i;
const SPRINT_INLINE_PATTERN = /\bSprint[\s-]+(\d+)\b/i;

/**
 * Parse a single ADR markdown file.
 * Returns null if the file is malformed (no H1 title or no status).
 */
export function parseAdrFile(filePath: string): ParsedAdr | null {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (e) {
    debugLog('parseAdrFile:read', `${filePath}: ${e}`);
    return null;
  }

  // Filename-based ID (authoritative — H1 number is verified against it)
  const baseName = filePath.split(/[\\/]/).pop() ?? '';
  const filenameMatch = baseName.match(FILENAME_PATTERN);
  if (!filenameMatch) {
    return null;
  }
  const filenameNum = filenameMatch[1]!.padStart(3, '0');

  // Title — required, from H1 line
  const h1Match = content.match(H1_PATTERN);
  if (!h1Match) {
    return null;
  }
  const title = (h1Match[2] ?? '').trim();
  if (!title) {
    return null;
  }

  // Status — required
  const statusMatch = content.match(STATUS_PATTERN);
  if (!statusMatch) {
    return null;
  }
  const status = (statusMatch[1] ?? '').toLowerCase();

  // Sprint extraction — prefer `**Sprint:** Sprint NNN`, fallback to first
  // `Sprint NNN` token in body.
  const sprintHeaderMatch = content.match(SPRINT_PATTERN);
  let sprintNum = 0;
  if (sprintHeaderMatch && sprintHeaderMatch[1]) {
    sprintNum = parseInt(sprintHeaderMatch[1], 10);
  } else {
    const inlineMatch = content.match(SPRINT_INLINE_PATTERN);
    if (inlineMatch && inlineMatch[1]) {
      sprintNum = parseInt(inlineMatch[1], 10);
    }
  }
  const sprintId = sprintNum > 0 ? `sprint-${sprintNum}` : null;

  return {
    id: `adr-${filenameNum}`,
    title,
    status,
    sprintId,
    sprintNum,
    content,
  };
}

// ─── Sync ─────────────────────────────────────────────────────────

/**
 * Convert a parsed ADR into the canonical CreateEntryInput for memory.db.
 * Tags include the title + headings keywords. `decay_exempt` follows
 * the `accepted` rule from parseDecisionsMd for consistency.
 */
export function adrToEntryInput(adr: ParsedAdr): CreateEntryInput {
  const tags = extractKeywords(`${adr.title} ${adr.content}`);
  const input: CreateEntryInput = {
    id: adr.id,
    type: 'adr',
    title: adr.title,
    content: adr.content,
    source: 'import',
    tags,
    status: adr.status,
    decay_exempt: adr.status === 'accepted',
  };
  if (adr.sprintId) {
    input.sprint_id = adr.sprintId;
    input.sprint_num = adr.sprintNum;
  }
  return input;
}

/**
 * Sync all ADR markdown files in `adrDir` into the memory DB.
 *
 * Behavior:
 *   - Files not matching `NNN-*.md` are silently ignored.
 *   - Malformed files (missing H1/status) are counted in `skipped` with an
 *     error message — they do not abort the run.
 *   - Idempotent: an entry whose title + content + status + sprint already
 *     match the DB row is counted as `skipped` (no upsert call).
 *   - Existing entries with differing fields are updated via `store.upsert`.
 *   - New entries are inserted via `store.upsert` (which delegates to insert).
 *
 * The function never throws on a single bad file; the result object reports
 * the outcome.
 */
export function syncAdrFilesToDb(
  store: MemoryStore,
  adrDir: string,
  opts: { changedBy?: string } = {},
): AdrSyncResult {
  const result: AdrSyncResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    ids: [],
  };

  if (!existsSync(adrDir)) {
    result.errors.push(`adr dir not found: ${adrDir}`);
    return result;
  }

  let stat;
  try {
    stat = statSync(adrDir);
  } catch (e) {
    result.errors.push(`adr dir stat failed: ${e}`);
    return result;
  }
  if (!stat.isDirectory()) {
    result.errors.push(`adr path is not a directory: ${adrDir}`);
    return result;
  }

  let entries: string[];
  try {
    entries = readdirSync(adrDir);
  } catch (e) {
    result.errors.push(`adr dir readdir failed: ${e}`);
    return result;
  }

  const adrFiles = entries
    .filter((f) => FILENAME_PATTERN.test(f))
    .sort();

  const changedBy = opts.changedBy ?? 'adr-file-sync';

  for (const fileName of adrFiles) {
    const filePath = join(adrDir, fileName);
    const parsed = parseAdrFile(filePath);
    if (!parsed) {
      result.skipped++;
      result.errors.push(`malformed: ${fileName}`);
      continue;
    }

    const input = adrToEntryInput(parsed);

    // Idempotency check — compare against existing row if any.
    const existing = store.getById(parsed.id, { includeDeleted: true });
    if (existing) {
      const sameTitle = existing.title === parsed.title;
      const sameContent = existing.content === parsed.content;
      const sameStatus = existing.status === parsed.status;
      const sameSprint = (existing.sprint_id ?? null) === (parsed.sprintId ?? null);
      if (sameTitle && sameContent && sameStatus && sameSprint) {
        result.skipped++;
        result.ids.push(parsed.id);
        continue;
      }
      try {
        store.upsert(input, changedBy);
        result.updated++;
        result.ids.push(parsed.id);
      } catch (e) {
        result.errors.push(`upsert ${parsed.id}: ${e}`);
      }
    } else {
      try {
        store.upsert(input, changedBy);
        result.inserted++;
        result.ids.push(parsed.id);
      } catch (e) {
        result.errors.push(`insert ${parsed.id}: ${e}`);
      }
    }
  }

  return result;
}
