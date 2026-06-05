/**
 * memory-export.ts — Generate .md snapshots from the SQLite DB.
 *
 * Four export functions produce markdown strings for git tracking
 * and human review. Each takes a MemoryStore instance and returns
 * a markdown string.
 *
 * Also exports `exportAdrsToFs` for DB→FS reverse sync (Sprint 169 H1,
 * bi-directional hook contract per ADR-046 Amendment 2026-05-15).
 *
 * `writeGuardedExports` (Sprint 227 task 227-002) is the sanity-checked
 * writer: it refuses to overwrite an existing .md with an empty render
 * when the DB still contains entries of the corresponding type. This
 * blocks the catastrophic wipe path observed in sprint-226 (decisions.md
 * 8518→2 lines while the DB held 75 ADRs).
 */

import { mkdirSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryStore } from './memory-store.js';
import type { MemoryEntryV2, EntryType } from './memory-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function isoDate(): string {
  return new Date().toISOString().split('T')[0]!;
}

/**
 * Truncate text to maxLen chars, appending '...' if truncated.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Sort entries by natural ID ordering (ADR-001 < ADR-005 < ADR-010).
 * Falls back to string comparison for non-numeric IDs.
 */
function sortById(a: MemoryEntryV2, b: MemoryEntryV2): number {
  return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
}

// ─── exportSummaryMd ────────────────────────────────────────────────

/**
 * Compact context file for @ reference loading.
 * Target < 5000 chars.
 */
export function exportSummaryMd(store: MemoryStore): string {
  const lines: string[] = [];
  lines.push('# Brain Summary (auto-generated)');
  lines.push('');

  // Active Architecture Decisions
  const adrs = store.getByType('adr').sort(sortById);
  lines.push('## Active Architecture Decisions');
  if (adrs.length > 0) {
    lines.push('| ID | Title | Status |');
    lines.push('|-----|-------|--------|');
    for (const adr of adrs) {
      lines.push(`| ${adr.id} | ${adr.title} | ${adr.status} |`);
    }
  } else {
    lines.push('_No architecture decisions recorded._');
  }
  lines.push('');

  // Recent Learnings
  const memories = store.getByType('memory'); // already sorted sprint_num DESC
  lines.push('## Recent Learnings');
  if (memories.length > 0) {
    for (const mem of memories.slice(0, 10)) {
      const sprintLabel = mem.sprint_id ? ` (${mem.sprint_id})` : '';
      const desc = truncate(mem.content, 120);
      lines.push(`- **${mem.title}**${sprintLabel}: ${desc}`);
    }
  } else {
    lines.push('_No learnings recorded._');
  }
  lines.push('');

  // Active Technical Debt (exclude resolved — show active, open, acknowledged, etc.)
  const debts = store.getByType('debt').filter(d => d.status !== 'resolved');
  lines.push('## Active Technical Debt');
  if (debts.length > 0) {
    for (const d of debts) {
      lines.push(`- [${d.priority.toUpperCase()}] ${d.title}`);
    }
  } else {
    lines.push('_No active technical debt._');
  }
  lines.push('');

  // Active Patterns
  const patterns = store.getByType('pattern').filter(p => p.status === 'active');
  lines.push('## Active Patterns');
  if (patterns.length > 0) {
    for (const p of patterns) {
      lines.push(`- ${p.title}`);
    }
  } else {
    lines.push('_No active patterns._');
  }
  lines.push('');

  // Footer
  const total = store.totalCount();
  lines.push(`_Total entries: ${total} | Generated: ${isoDate()}_`);

  return lines.join('\n');
}

// ─── exportDecisionsMd ──────────────────────────────────────────────

/**
 * Full ADR content for git review.
 */
export function exportDecisionsMd(store: MemoryStore): string {
  const lines: string[] = [];
  lines.push('# Architecture Decision Records (auto-generated)');
  lines.push('');

  const adrs = store.getByType('adr').sort(sortById);

  if (adrs.length === 0) {
    lines.push('_No architecture decisions recorded._');
    return lines.join('\n');
  }

  for (let i = 0; i < adrs.length; i++) {
    const adr = adrs[i]!;

    lines.push(`## ${adr.id}: ${adr.title}`);
    lines.push('');
    lines.push(`**Status:** ${adr.status}`);
    lines.push('');

    // If the content already starts with **Status:** strip it to avoid duplication
    let content = adr.content;
    const statusLineRegex = /^\*\*Status:\*\*\s*\S+\s*\n*/;
    if (statusLineRegex.test(content)) {
      content = content.replace(statusLineRegex, '').trimStart();
    }

    lines.push(content);

    // Separator between ADRs (not after the last one)
    if (i < adrs.length - 1) {
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── exportMemoryMd ────────────────────────────────────────────────

/**
 * Sprint learnings grouped by sprint.
 */
export function exportMemoryMd(store: MemoryStore): string {
  const lines: string[] = [];
  lines.push('# Sprint Learnings (auto-generated)');
  lines.push('');

  const memories = store.getByType('memory'); // sorted sprint_num DESC

  if (memories.length === 0) {
    lines.push('_No learnings recorded._');
    return lines.join('\n');
  }

  // Group by sprint_id, maintaining DESC order
  const groups = new Map<string, MemoryEntryV2[]>();
  for (const mem of memories) {
    const key = mem.sprint_id ?? 'unknown';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(mem);
  }

  for (const [sprintId, entries] of groups) {
    lines.push(`## Sprint ${sprintId} Learnings`);
    for (const mem of entries) {
      lines.push(`- ${mem.title}: ${mem.content}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── exportDebtMd ──────────────────────────────────────────────────

/**
 * Active + resolved debt as markdown tables.
 */
export function exportDebtMd(store: MemoryStore): string {
  const lines: string[] = [];
  lines.push('# Technical Debt (auto-generated)');
  lines.push('');

  const allDebt = store.getByType('debt');

  if (allDebt.length === 0) {
    lines.push('_No technical debt recorded._');
    return lines.join('\n');
  }

  const active = allDebt.filter(d => d.status !== 'resolved');
  const resolved = allDebt.filter(d => d.status === 'resolved');

  // Active table
  lines.push('## Active Technical Debt');
  lines.push('');
  lines.push('| ID | Title | Priority | Sprint | Status |');
  lines.push('|----|-------|----------|--------|--------|');
  if (active.length > 0) {
    for (const d of active) {
      lines.push(`| ${d.id} | ${d.title} | ${d.priority} | ${d.sprint_id ?? '-'} | ${d.status} |`);
    }
  }
  lines.push('');

  // Resolved table (only if there are resolved entries)
  if (resolved.length > 0) {
    lines.push('## Resolved Technical Debt');
    lines.push('');
    lines.push('| ID | Title | Priority | Sprint | Status |');
    lines.push('|----|-------|----------|--------|--------|');
    for (const d of resolved) {
      lines.push(`| ${d.id} | ${d.title} | ${d.priority} | ${d.sprint_id ?? '-'} | ${d.status} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── exportAdrsToFs ────────────────────────────────────────────────

/**
 * Result of a DB→FS ADR export run.
 */
export interface AdrFsExportResult {
  /** New files created (did not exist before). */
  written: number;
  /** Existing files overwritten (DB is newer than file mtime). */
  updated: number;
  /** Files skipped because file mtime > DB updated_at (manual edit wins). */
  skipped: number;
  /** Error messages (one per failed ADR entry). */
  errors: string[];
  /** IDs of ADRs that were written or updated (not skipped/errored). */
  ids: string[];
}

/**
 * Compute the filesystem filename for an ADR entry.
 * adr-001  + "TypeScript ESM"            → "001-typescript-esm.md"
 * adr-022-v2 + "CLI/MCP Feature Parity"  → "022-v2-cli-mcp-feature-parity.md"
 */
function adrToFilename(id: string, title: string): string {
  const numPart = id.replace(/^adr-/i, '');
  const numMatch = numPart.match(/^(\d+)/);
  const numStr = numMatch ? numMatch[1]!.padStart(3, '0') : numPart;
  const suffix = numMatch ? numPart.slice(numMatch[1]!.length) : '';
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${numStr}${suffix}-${slug}.md`;
}

/**
 * Build MADR v3 markdown for an ADR entry.
 * If content already starts with a `#` header, use it as-is.
 * Otherwise generate a wrapper with `_To be backfilled_` placeholders.
 */
function buildAdrMarkdown(entry: MemoryEntryV2): string {
  const content = entry.content.trim();

  if (content.startsWith('#')) {
    return content + '\n';
  }

  const sprintField = entry.sprint_id ?? '_To be backfilled_';
  const bodyContent = content || '_To be backfilled_';

  return [
    `# ${entry.id.toUpperCase()}: ${entry.title}`,
    '',
    `**Status:** ${entry.status || '_To be backfilled_'}`,
    '',
    `**Sprint:** ${sprintField}`,
    '',
    '---',
    '',
    bodyContent,
    '',
  ].join('\n');
}

/**
 * Export all ADR entries from the memory DB to individual markdown files
 * in `adrDir`. Implements the reverse (DB→FS) direction of the bi-directional
 * hook contract introduced by ADR-046 Amendment 2026-05-15.
 *
 * Idempotency: if a file's mtime is newer than the DB `updated_at` the file
 * is considered a manual edit and left untouched (manual edit wins).
 */
export function exportAdrsToFs(
  store: MemoryStore,
  adrDir: string,
  opts?: { dryRun?: boolean },
): AdrFsExportResult {
  const dryRun = opts?.dryRun ?? false;
  const result: AdrFsExportResult = {
    written: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    ids: [],
  };

  if (!dryRun) {
    mkdirSync(adrDir, { recursive: true });
  }

  const adrs = store.getByType('adr').sort(sortById);

  for (const adr of adrs) {
    try {
      const filename = adrToFilename(adr.id, adr.title);
      const filePath = join(adrDir, filename);
      const markdown = buildAdrMarkdown(adr);

      const fileExists = existsSync(filePath);

      if (fileExists) {
        const fileMtime = statSync(filePath).mtimeMs;
        // SQLite datetime() returns 'YYYY-MM-DD HH:MM:SS' (UTC). Parse safely.
        const dbTs = adr.updated_at.includes('T')
          ? adr.updated_at
          : adr.updated_at.replace(' ', 'T') + 'Z';
        const dbUpdatedAt = new Date(dbTs).getTime();

        if (fileMtime > dbUpdatedAt) {
          result.skipped++;
          continue;
        }

        if (!dryRun) {
          writeFileSync(filePath, markdown, 'utf-8');
        }
        result.ids.push(adr.id);
        result.updated++;
      } else {
        if (!dryRun) {
          writeFileSync(filePath, markdown, 'utf-8');
        }
        result.ids.push(adr.id);
        result.written++;
      }
    } catch (e) {
      result.errors.push(`${adr.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

// ─── writeGuardedExports (Sprint 227 task 227-002) ─────────────────

/**
 * Per-file outcome of writeGuardedExports.
 */
export interface GuardedExportResult {
  written: string[];
  skipped: string[];
  warnings: string[];
}

interface GuardedExportSpec {
  name: string;
  render: (store: MemoryStore) => string;
  entryType: EntryType;
  emptyMarker: string;
}

const GUARDED_EXPORT_SPECS: GuardedExportSpec[] = [
  { name: 'summary.md',   render: exportSummaryMd,   entryType: 'adr',    emptyMarker: '_No architecture decisions recorded._' },
  { name: 'decisions.md', render: exportDecisionsMd, entryType: 'adr',    emptyMarker: '_No architecture decisions recorded._' },
  { name: 'memory.md',    render: exportMemoryMd,    entryType: 'memory', emptyMarker: '_No learnings recorded._' },
  { name: 'debt.md',      render: exportDebtMd,      entryType: 'debt',   emptyMarker: '_No technical debt recorded._' },
];

/**
 * Render and write export .md snapshots with a sanity guard.
 *
 * For each file: render content, count DB entries of the relevant type,
 * and refuse to overwrite when the DB has entries but the render
 * collapsed to the renderer's "no entries" marker — preserving the
 * previous on-disk file and surfacing a warning. Blocks the wipe path
 * observed in sprint-226 (decisions.md 8518→2 lines while DB held 75 ADRs).
 *
 * All four export files (summary, decisions, memory, debt) are guarded.
 */
export function writeGuardedExports(
  store: MemoryStore,
  exportsDir: string,
): GuardedExportResult {
  mkdirSync(exportsDir, { recursive: true });

  const result: GuardedExportResult = { written: [], skipped: [], warnings: [] };

  for (const spec of GUARDED_EXPORT_SPECS) {
    const content = spec.render(store);
    const filePath = join(exportsDir, spec.name);
    const dbCount = store.getByType(spec.entryType).length;
    const renderIsEmpty = content.includes(spec.emptyMarker);

    if (dbCount > 0 && renderIsEmpty) {
      const warning =
        `export-wipe-guard: refused to write ${spec.name} — ` +
        `DB has ${dbCount} ${spec.entryType} entries but render is empty ` +
        `(preserving previous file at ${filePath})`;
      result.warnings.push(warning);
      result.skipped.push(spec.name);
      continue;
    }

    if (dbCount === 0 && existsSync(filePath)) {
      const diskContent = readFileSync(filePath, 'utf-8');
      if (diskContent.trim().length > 0 && !diskContent.includes(spec.emptyMarker)) {
        const warning =
          `export-wipe-guard: refused to write ${spec.name} — ` +
          `DB is empty but disk file has content ` +
          `(preserving previous file at ${filePath})`;
        result.warnings.push(warning);
        result.skipped.push(spec.name);
        continue;
      }
    }

    writeFileSync(filePath, content, 'utf-8');
    result.written.push(spec.name);
  }

  return result;
}
