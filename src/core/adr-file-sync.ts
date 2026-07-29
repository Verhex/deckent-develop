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
  /** Normalized ID: new `adr-g-019` / `adr-d-001`, or legacy `adr-043`. */
  id: string;
  /** Title text without the `ADR-[G|D-]NNN:` prefix. */
  title: string;
  /** Lowercased status word (accepted, deprecated, proposed, etc.). */
  status: string;
  /** Optional sprint id `sprint-NNN`. Extracted from frontmatter or body. */
  sprintId: string | null;
  /** Sprint number (0 if not found). */
  sprintNum: number;
  /** Full markdown content. */
  content: string;
  /** ADR-G-019 taxonomy: class `G`|`D`|`UG`|`UP` (null for legacy un-classed). */
  adrClass: string | null;
  /** `global+project` | `dev` (from `**Scope:**` metadata, null if absent). */
  scope: string | null;
  /** Immutable flag (from `**Immutable:** yes|no`, null if absent). */
  immutable: boolean | null;
  /** `publisher`|`contributor`|`user` (from `**Source:**`, null if absent). */
  sourceAuthority: string | null;
  /** `advisory`|`runtime`|`hard` when declared as a discrete metadata value. */
  enforcementLevel: string | null;
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

// New 4-layer taxonomy scheme (ADR-G-019): `adr-{class}-{num}-slug.md` + `# ADR-{CLASS}-{num}: Title`.
const FILENAME_PATTERN_NEW = /^adr-(g|d|ug|up)-(\d+)-.+\.md$/i;
const H1_PATTERN_NEW = /^#\s*ADR-(G|D|UG|UP)-(\d+):\s*(.+)$/im;
// Legacy scheme: `NNN-slug.md` + `# ADR-NNN: Title` (fallback, pre-redesign).
const FILENAME_PATTERN_OLD = /^(\d{3,})-.+\.md$/i;
const H1_PATTERN_OLD = /^#\s*ADR-(\d+):\s*(.+)$/m;
// Matches either scheme — used by the directory filter.
const FILENAME_PATTERN = /^(?:adr-(?:g|d|ug|up)-\d+|\d{3,})-.+\.md$/i;
const STATUS_PATTERN = /\*\*Status:\*\*\s*([A-Za-z][A-Za-z_-]*)/;
const SPRINT_PATTERN = /\*\*Sprint:\*\*\s*Sprint\s+(\d+)/i;
const SPRINT_INLINE_PATTERN = /\bSprint[\s-]+(\d+)\b/i;
// Class-metadata header (ADR-G-019): `**Class:** ADR-G · **Scope:** … · **Immutable:** yes · **Source:** …`
const CLASS_META_PATTERN = /\*\*Class:\*\*\s*ADR-(G|D|UG|UP)\b/i;
const SCOPE_META_PATTERN = /\*\*Scope:\*\*\s*([A-Za-z+]+)/i;
const IMMUTABLE_META_PATTERN = /\*\*Immutable:\*\*\s*(yes|no|true|false)/i;
const SOURCE_META_PATTERN = /\*\*Source:\*\*\s*([A-Za-z+]+)/i;
const ENFORCEMENT_LEVEL_PATTERN =
  /\*\*(?:Enforcement-Level|Enforcement level|Enforcement):\*\*\s*(advisory|runtime|hard)\b/i;

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

  // ID + class from filename — new `adr-{class}-{num}-slug.md` (authoritative)
  // or legacy `{num}-slug.md`.
  const baseName = filePath.split(/[\\/]/).pop() ?? '';
  const newName = baseName.match(FILENAME_PATTERN_NEW);
  const oldName = baseName.match(FILENAME_PATTERN_OLD);
  let id: string;
  let adrClass: string | null = null;
  if (newName) {
    adrClass = newName[1]!.toUpperCase();
    id = `adr-${adrClass.toLowerCase()}-${newName[2]!.padStart(3, '0')}`;
  } else if (oldName) {
    id = `adr-${oldName[1]!.padStart(3, '0')}`;
  } else {
    return null;
  }

  // Title — required, from H1 (new `# ADR-G-NNN:` or legacy `# ADR-NNN:`)
  const h1New = content.match(H1_PATTERN_NEW);
  const h1Old = content.match(H1_PATTERN_OLD);
  let title: string;
  if (h1New) {
    if (!adrClass) adrClass = h1New[1]!.toUpperCase();
    title = (h1New[3] ?? '').trim();
  } else if (h1Old) {
    title = (h1Old[2] ?? '').trim();
  } else {
    return null;
  }
  if (!title) {
    return null;
  }

  // Status — required
  const statusMatch = content.match(STATUS_PATTERN);
  if (!statusMatch) {
    return null;
  }
  const status = (statusMatch[1] ?? '').toLowerCase();

  // Class metadata (ADR-G-019 header line) — class/scope/immutable/source.
  if (!adrClass) {
    const cm = content.match(CLASS_META_PATTERN);
    if (cm) adrClass = cm[1]!.toUpperCase();
  }
  const scopeMatch = content.match(SCOPE_META_PATTERN);
  const scope = scopeMatch
    ? scopeMatch[1]!.trim().toLowerCase()
    : adrClass === 'D'
      ? 'dev'
      : adrClass === 'G'
        ? 'global+project'
        : null;
  const immMatch = content.match(IMMUTABLE_META_PATTERN);
  const immutable = immMatch ? /^(?:yes|true)$/i.test(immMatch[1]!) : null;
  const srcMatch = content.match(SOURCE_META_PATTERN);
  const sourceAuthority = srcMatch ? srcMatch[1]!.trim().toLowerCase() : null;
  const enforcementMatch = content.match(ENFORCEMENT_LEVEL_PATTERN);
  const enforcementLevel = enforcementMatch
    ? enforcementMatch[1]!.trim().toLowerCase()
    : null;

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
    id,
    title,
    status,
    sprintId,
    sprintNum,
    content,
    adrClass,
    scope,
    immutable,
    sourceAuthority,
    enforcementLevel,
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
  // ADR-G-019 taxonomy columns — written on insert, preserved across updates.
  if (adr.adrClass) input.adr_class = adr.adrClass;
  if (adr.scope) input.scope = adr.scope;
  if (adr.immutable != null) input.immutable = adr.immutable;
  if (adr.sourceAuthority) input.source_authority = adr.sourceAuthority;
  if (adr.enforcementLevel) input.enforcement_level = adr.enforcementLevel;
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

    // Existing historical rows may use uppercase IDs (for example ADR-G-037).
    // Resolve identity case-insensitively so a lowercase canonical projection
    // updates the authoritative row instead of creating a duplicate.
    let existing = store.getById(parsed.id, { includeDeleted: true });
    if (!existing) {
      const caseVariant = store.getRawDb().prepare(
        'SELECT id FROM entries WHERE lower(id) = lower(?) LIMIT 1',
      ).get(parsed.id) as { id: string } | undefined;
      if (caseVariant) {
        existing = store.getById(caseVariant.id, { includeDeleted: true });
        input.id = caseVariant.id;
      }
    }
    const resolvedId = input.id ?? parsed.id;

    // Idempotency check — compare against existing row if any.
    if (existing) {
      const sameTitle = existing.title === parsed.title;
      const sameContent = existing.content === parsed.content;
      const sameStatus = existing.status === parsed.status;
      const sameSprint = (existing.sprint_id ?? null) === (parsed.sprintId ?? null);
      const sameTaxonomy =
        (existing.adr_class ?? null) === parsed.adrClass
        && (existing.scope ?? null) === parsed.scope
        && (existing.immutable == null ? null : existing.immutable === 1) === parsed.immutable
        && (existing.source_authority ?? null) === parsed.sourceAuthority
        && (existing.enforcement_level ?? null) === parsed.enforcementLevel;
      if (sameTitle && sameContent && sameStatus && sameSprint && sameTaxonomy) {
        result.skipped++;
        result.ids.push(resolvedId);
        continue;
      }
      try {
        store.upsert(input, changedBy);
        result.updated++;
        result.ids.push(resolvedId);
      } catch (e) {
        result.errors.push(`upsert ${resolvedId}: ${e}`);
      }
    } else {
      try {
        store.upsert(input, changedBy);
        result.inserted++;
        result.ids.push(resolvedId);
      } catch (e) {
        result.errors.push(`insert ${resolvedId}: ${e}`);
      }
    }
  }

  return result;
}
