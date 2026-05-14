// src/core/memory-import.ts
//
// Parse existing .brain/ markdown files into CreateEntryInput objects
// for Memory V2 DB insertion.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CreateEntryInput } from './memory-types.js';
import type { MemoryStore } from './memory-store.js';
import { DeckentError } from './errors.js';

// ─── Stop Words ──────────────────────────────────────────────────

const STOP_WORDS_EN = new Set([
  'the', 'this', 'that', 'with', 'from', 'into', 'have', 'been',
  'will', 'would', 'could', 'should', 'does', 'each', 'then',
  'than', 'also', 'more', 'most', 'some', 'what', 'when', 'where',
  'which', 'while', 'about', 'after', 'before', 'between', 'through',
  'during', 'under', 'over', 'only', 'other', 'just', 'very',
  'their', 'there', 'they', 'them', 'these', 'those', 'being',
  'were', 'here', 'every', 'same', 'both', 'such', 'because',
  'using', 'used', 'uses',
]);

const STOP_WORDS_TR = new Set([
  'için', 'olan', 'ile', 'veya', 'ama', 'ancak', 'daha', 'çok',
  'gibi', 'kadar', 'sonra', 'önce', 'üzerinde', 'altında',
  'arasında', 'iken', 'zaman', 'yani', 'hala', 'sadece',
]);

// ─── extractKeywords ─────────────────────────────────────────────

/**
 * Extract unique, lowercased keywords from text.
 * Filters: > 3 chars, not stop words (EN + TR), unique, max 15.
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];

  const words = text
    .replace(/[*#|>`_\-=\[\](){}:;,."'!?/\\~@+^$%&<>]/g, ' ')
    .split(/\s+/)
    .map((w) => w.toLowerCase().trim())
    .filter((w) => w.length > 3)
    .filter((w) => !STOP_WORDS_EN.has(w))
    .filter((w) => !STOP_WORDS_TR.has(w));

  const unique = [...new Set(words)];
  return unique.slice(0, 15);
}

// ─── parseDecisionsMd ────────────────────────────────────────────

/**
 * Parse DECISIONS.md into CreateEntryInput[].
 * Each ADR section: `## ADR-NNN: Title` with `**Status:** word`.
 */
export function parseDecisionsMd(content: string): CreateEntryInput[] {
  if (!content) return [];

  const entries: CreateEntryInput[] = [];

  // Match all ADR headers: ## ADR-NNN: Title
  const headerPattern = /^## ADR-(\d+):\s*(.+)$/gm;
  const headers: Array<{ num: string; title: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(content)) !== null) {
    const num = match[1] ?? '';
    const title = (match[2] ?? '').trim();
    if (!num || !title) continue;
    headers.push({ num, title, index: match.index });
  }

  // Track seen IDs to handle duplicates (e.g. ADR-022 v1 superseded + v2 accepted)
  const seenIds = new Map<string, number>();

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]!;
    const nextHeader = headers[i + 1];
    const headerLineEnd = content.indexOf('\n', header.index);
    const sectionStart = headerLineEnd !== -1 ? headerLineEnd + 1 : header.index;
    const sectionEnd = nextHeader !== undefined ? nextHeader.index : content.length;
    const sectionContent = content.slice(sectionStart, sectionEnd).trim();

    // Extract status
    const statusMatch = sectionContent.match(/\*\*Status:\*\*\s*(\w+)/);
    const status = statusMatch?.[1]?.toLowerCase() ?? 'accepted';

    // Handle duplicate ADR numbers (superseded + new version)
    const baseId = `adr-${header.num.padStart(3, '0')}`;
    const count = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-v${count + 1}`;

    const tags = extractKeywords(`${header.title} ${sectionContent}`);

    // If this is a later version, add supersedes relation to the first
    const relations = count > 0
      ? [{ to_id: baseId, rel_type: 'supersedes' as const }]
      : undefined;

    entries.push({
      id,
      type: 'adr',
      title: header.title,
      content: sectionContent,
      source: 'import',
      tags,
      status,
      decay_exempt: status === 'accepted',
      relations,
    });
  }

  return entries;
}

// ─── parseMemoryMd ───────────────────────────────────────────────

/**
 * Parse MEMORY.md into CreateEntryInput[].
 * Sections: `## Sprint sprint-NNN Learnings` or `## Sprint NNN Learnings`.
 */
export function parseMemoryMd(content: string): CreateEntryInput[] {
  if (!content) return [];

  const entries: CreateEntryInput[] = [];

  // Match both formats: "Sprint sprint-NNN" and "Sprint NNN"
  const headerPattern = /^## Sprint (?:sprint-)?(\d+)\s+Learnings/gm;
  const headers: Array<{ num: number; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(content)) !== null) {
    const numStr = match[1] ?? '';
    if (!numStr) continue;
    headers.push({
      num: parseInt(numStr, 10),
      index: match.index,
    });
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]!;
    const nextHeader = headers[i + 1];
    const headerLineEnd = content.indexOf('\n', header.index);
    const sectionStart = headerLineEnd !== -1 ? headerLineEnd + 1 : header.index;
    const sectionEnd = nextHeader !== undefined ? nextHeader.index : content.length;
    const sectionContent = content.slice(sectionStart, sectionEnd).trim();

    const sprintId = `sprint-${header.num}`;
    const tags = extractKeywords(sectionContent);

    entries.push({
      id: `mem-${header.num}`,
      type: 'memory',
      title: `Sprint ${header.num} Learnings`,
      content: sectionContent,
      source: 'import',
      tags,
      status: 'active',
      sprint_id: sprintId,
      sprint_num: header.num,
    });
  }

  return entries;
}

// ─── extractSprintFromDebtId ─────────────────────────────────────

/**
 * Extract sprint id/num from a debt entry id.
 * Handles both `debt-NNN-MMM` and `debt-debt-NNN-MMM` (double-prefix) shapes.
 * Returns null when no sprint number is encoded in the id.
 */
export function extractSprintFromDebtId(
  debtId: string,
): { sprint_id: string; sprint_num: number } | null {
  if (!debtId) return null;
  const match = debtId.match(/^debt-(?:debt-)?(\d+)-\d+/);
  if (!match?.[1]) return null;
  const sprintNum = parseInt(match[1], 10);
  if (!Number.isFinite(sprintNum) || sprintNum <= 0) return null;
  return { sprint_id: `sprint-${sprintNum}`, sprint_num: sprintNum };
}

// ─── parseDebtMd ─────────────────────────────────────────────────

/**
 * Parse DEBT.md pipe-delimited markdown table into CreateEntryInput[].
 * Columns: ID | Description | OriginTaskId | OriginSprintId | Priority |
 *          SprintsOpen | Resolved | ResolvedInSprintId | CreatedAt
 *
 * Bug V fix (Sprint 166): when originSprintId column is missing or "-",
 * fall back to parsing the sprint number directly from the debt id
 * (e.g. `debt-156-011` → `sprint-156`).
 */
export function parseDebtMd(content: string): CreateEntryInput[] {
  if (!content) return [];

  const lines = content.split('\n');
  const entries: CreateEntryInput[] = [];

  // Find header line containing '| ID |'
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').includes('| ID |')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return [];

  // Process data rows (skip header + separator)
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();

    // Skip separator lines
    if (!line || line.startsWith('|--') || line.startsWith('|-')) continue;

    // Must be a pipe-delimited row
    if (!line.startsWith('|')) continue;

    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '');

    // Expect 9 columns
    if (cells.length < 9) continue;

    const rawId = cells[0] ?? '';
    const description = cells[1] ?? '';
    const originTaskId = cells[2] ?? '';
    const originSprintId = cells[3] ?? '';
    const priority = cells[4] ?? '';
    const sprintsOpenStr = cells[5] ?? '0';
    const resolvedStr = cells[6] ?? 'false';
    const resolvedInSprintId = cells[7] ?? '-';
    const createdAt = cells[8] ?? '';

    const resolved = resolvedStr.toLowerCase() === 'true';
    const sprintsOpen = parseInt(sprintsOpenStr, 10) || 0;

    // Extract sprint number from originSprintId column first
    const sprintNumMatch = originSprintId.match(/sprint-(\d+)/);
    let sprintId = sprintNumMatch ? originSprintId : '';
    let sprintNum = sprintNumMatch?.[1] ? parseInt(sprintNumMatch[1], 10) : 0;

    // Bug V fallback: column missing or "-" → parse from id
    if (!sprintId || sprintId === '-' || sprintNum <= 0) {
      const idFallback = extractSprintFromDebtId(`debt-${rawId}`);
      if (idFallback) {
        sprintId = idFallback.sprint_id;
        sprintNum = idFallback.sprint_num;
      }
    }

    const tags = extractKeywords(description);

    entries.push({
      id: `debt-${rawId}`,
      type: 'debt',
      title: description,
      content: description,
      source: 'import',
      tags,
      status: resolved ? 'resolved' : 'active',
      priority: priority.toLowerCase(),
      sprint_id: sprintId || originSprintId,
      sprint_num: sprintNum,
      metadata: {
        originTaskId,
        originSprintId,
        sprintsOpen,
        resolved,
        resolvedInSprintId: resolvedInSprintId === '-' ? null : resolvedInSprintId,
        createdAt,
      },
    });
  }

  return entries;
}

// ─── backfillDebtSprintIds ───────────────────────────────────────

interface DebtRow {
  id: string;
  sprint_id: string | null;
  sprint_num: number;
}

/**
 * Backfill missing sprint_id / sprint_num on existing debt entries.
 *
 * Sprint 166 Bug V fix: 100 debt entries in memory.db have sprint_id=NULL
 * because they were inserted by debt-manager (not parseDebtMd). This helper
 * parses sprint info directly from the debt id and updates rows atomically.
 *
 * @param store MemoryStore instance (writable connection)
 * @returns { scanned, updated } — idempotent: second call returns updated=0
 */
export function backfillDebtSprintIds(store: MemoryStore): {
  scanned: number;
  updated: number;
} {
  // Access the underlying SQLite db via the documented escape hatch.
  // MemoryStore does not yet expose a typed migration API, but the better-sqlite3
  // Database instance is reachable through `store as any`. The transaction
  // below is the single atomic write surface; reads occur in the same block.
  const db = (store as unknown as { db: import('better-sqlite3').Database }).db;
  if (!db) {
    throw new DeckentError(
      'DECKENT_MEMORY_NO_DB',
      'backfillDebtSprintIds: MemoryStore has no underlying SQLite db handle',
      'Ensure MemoryStore was constructed with a valid db path before invoking backfillDebtSprintIds.',
    );
  }

  const selectStmt = db.prepare(
    `SELECT id, sprint_id, sprint_num FROM entries WHERE type = 'debt' AND (sprint_id IS NULL OR sprint_id = '' OR sprint_id = '-')`,
  );
  const updateStmt = db.prepare(
    `UPDATE entries SET sprint_id = @sprint_id, sprint_num = @sprint_num, updated_at = datetime('now') WHERE id = @id`,
  );

  let updated = 0;
  let scanned = 0;

  const txn = db.transaction(() => {
    const rows = selectStmt.all() as DebtRow[];
    scanned = rows.length;
    for (const row of rows) {
      const extracted = extractSprintFromDebtId(row.id);
      if (!extracted) continue;
      updateStmt.run({
        id: row.id,
        sprint_id: extracted.sprint_id,
        sprint_num: extracted.sprint_num,
      });
      updated += 1;
    }
  });

  txn();

  return { scanned, updated };
}

// ─── backfillSprintMemoriesFromSprintsDir ────────────────────────

/**
 * Backfill type='memory' entries for the given sprint numbers from
 * `.brain/sprints/sprint-NNN.md` log files.
 *
 * Sprint 166: parseMemoryMd only sees sprints that have a header in
 * `.brain/exports/memory.md`. For older or missing sprints we fall back
 * to the per-sprint log file when one exists. Idempotent — entries that
 * already exist are not overwritten.
 *
 * @param store MemoryStore instance
 * @param sprintsDir Path to `.brain/sprints/` directory
 * @param sprintNumbers Sprint numbers to attempt backfill for
 * @returns { attempted, inserted, skipped, missing }
 */
export function backfillSprintMemoriesFromSprintsDir(
  store: MemoryStore,
  sprintsDir: string,
  sprintNumbers: number[],
): { attempted: number; inserted: number; skipped: number; missing: number } {
  let attempted = 0;
  let inserted = 0;
  let skipped = 0;
  let missing = 0;

  if (!existsSync(sprintsDir)) {
    return { attempted: sprintNumbers.length, inserted: 0, skipped: 0, missing: sprintNumbers.length };
  }

  // Pre-load available sprint files for quick lookup
  const availableFiles = new Set(readdirSync(sprintsDir));

  for (const num of sprintNumbers) {
    attempted += 1;

    const memId = `mem-${num}`;
    if (store.getById(memId)) {
      skipped += 1;
      continue;
    }

    const fileName = `sprint-${num}.md`;
    if (!availableFiles.has(fileName)) {
      missing += 1;
      continue;
    }

    let content = '';
    try {
      content = readFileSync(join(sprintsDir, fileName), 'utf-8');
    } catch {
      missing += 1;
      continue;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      missing += 1;
      continue;
    }

    const tags = extractKeywords(trimmed);
    store.insert({
      id: memId,
      type: 'memory',
      title: `Sprint ${num} Learnings`,
      content: trimmed,
      source: 'import',
      tags,
      status: 'active',
      sprint_id: `sprint-${num}`,
      sprint_num: num,
    });
    inserted += 1;
  }

  return { attempted, inserted, skipped, missing };
}
