/**
 * memory-export.ts — Generate .md snapshots from the SQLite DB.
 *
 * Four export functions produce markdown strings for git tracking
 * and human review. Each takes a MemoryStore instance and returns
 * a markdown string.
 *
 * Also exports `exportAdrsToFs` for DB→FS reverse sync (Sprint 169 H1,
 * DB-authority projection contract per ADR-G-035.
 *
 * `writeGuardedExports` (Sprint 227 task 227-002) is the sanity-checked
 * writer: it refuses to overwrite an existing .md with an empty render
 * when the DB still contains entries of the corresponding type. This
 * blocks the catastrophic wipe path observed in sprint-226 (decisions.md
 * 8518→2 lines while the DB held 75 ADRs).
 */

import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryStore } from './memory-store.js';
import type { MemoryEntryV2, EntryType } from './memory-types.js';
import { DeckentError } from './errors.js';

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
 * Sort entries by natural ID ordering (ADR-G-001 < ADR-G-005 < ADR-G-010).
 * Falls back to string comparison for non-numeric IDs.
 */
function sortById(a: MemoryEntryV2, b: MemoryEntryV2): number {
  return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
}

function normalizeAdrProjectionSections(content: string): string {
  return content
    .replace(
      /^(CONTEXT|DECISION|CONSEQUENCES?|ROLLOUT|ACCEPTANCE)$/gmu,
      (_match, section: string) =>
        `## ${section.charAt(0)}${section.slice(1).toLowerCase()}`,
    )
    .replace(/^Decision:\s*/gimu, '**Decision:** ');
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

  // Active Patterns — the auditor upserts one entry per sprint × violation
  // type, so raw titles repeat by the hundreds. Aggregate by title so the
  // summary stays within its size target instead of listing duplicates.
  const patterns = store.getByType('pattern').filter(p => p.status === 'active');
  lines.push('## Active Patterns');
  if (patterns.length > 0) {
    const counts = new Map<string, number>();
    for (const p of patterns) {
      counts.set(p.title, (counts.get(p.title) ?? 0) + 1);
    }
    for (const [title, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(count > 1 ? `- ${title} (×${count} sprints)` : `- ${title}`);
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
    let content = normalizeAdrProjectionSections(adr.content);
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
      const content = mem.content.replace(/[ \t]+$/gmu, '').trimEnd();
      lines.push(`- ${mem.title}: ${content}`);
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
 * adr-001   + "TypeScript ESM" → "001-typescript-esm.md"
 * ADR-G-037 + "Execution..."   → "adr-g-037-execution.md"
 */
function adrToFilename(id: string, title: string): string {
  const match = id.match(/^adr-(?:(g|d|ug|up)-)?(\d+)$/i);
  if (!match) {
    throw new DeckentError('E_NON_CANONICAL_ADR_ID', `non-canonical ADR id: ${id}`);
  }
  const adrClass = match[1]?.toLowerCase() ?? null;
  const number = match[2]!.padStart(3, '0');
  const idPrefix = adrClass ? `adr-${adrClass}-${number}` : number;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${idPrefix}-${slug}.md`;
}

function adrFilenamePrefix(id: string): string {
  const match = id.match(/^adr-(?:(g|d|ug|up)-)?(\d+)$/i);
  if (!match) {
    throw new DeckentError('E_NON_CANONICAL_ADR_ID', `non-canonical ADR id: ${id}`);
  }
  const adrClass = match[1]?.toLowerCase() ?? null;
  const number = match[2]!.padStart(3, '0');
  return adrClass ? `adr-${adrClass}-${number}-` : `${number}-`;
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
  const bodyContent = normalizeAdrProjectionSections(content) || '_To be backfilled_';
  const idClass = entry.id.match(/^adr-(g|d|ug|up)-\d+$/i)?.[1]?.toUpperCase();
  const taxonomyParts: string[] = [];
  const adrClass = entry.adr_class ?? idClass;
  if (adrClass) taxonomyParts.push(`**Class:** ADR-${adrClass.toUpperCase()}`);
  if (entry.scope) taxonomyParts.push(`**Scope:** ${entry.scope}`);
  if (entry.immutable != null) taxonomyParts.push(`**Immutable:** ${entry.immutable === 1 ? 'yes' : 'no'}`);
  if (entry.source_authority) taxonomyParts.push(`**Source:** ${entry.source_authority}`);
  if (entry.enforcement_level) taxonomyParts.push(`**Enforcement-Level:** ${entry.enforcement_level}`);

  const lines = [
    `# ${entry.id.toUpperCase()}: ${entry.title}`,
    '',
    `**Status:** ${entry.status || '_To be backfilled_'}`,
    '',
    `**Sprint:** ${sprintField}`,
    '',
  ];
  if (taxonomyParts.length > 0) {
    lines.push(taxonomyParts.join(' · '), '');
  }
  lines.push(
    '---',
    '',
    bodyContent,
    '',
  );
  return lines.join('\n');
}

/**
 * Export all ADR entries from the memory DB to individual markdown files
 * in `adrDir`. Implements the reverse (DB→FS) direction of the bi-directional
 * projection contract governed by ADR-G-035.
 *
 * Idempotency: byte-identical projections are left untouched. When content
 * differs, DB authority wins and the projection is rewritten. Human edits must
 * enter through the DB-authoring path; filesystem mtime is not authority.
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
  const existingFiles = existsSync(adrDir)
    ? readdirSync(adrDir).filter(name => name.endsWith('.md'))
    : [];

  for (const adr of adrs) {
    try {
      const prefix = adrFilenamePrefix(adr.id);
      const existingMatches = existingFiles.filter(name =>
        name.toLowerCase().startsWith(prefix.toLowerCase()),
      );
      if (existingMatches.length > 1) {
        throw new DeckentError('E_AMBIGUOUS_ADR_PROJECTION_FOR', 
          `ambiguous ADR projection for ${adr.id}: ${existingMatches.join(', ')}`,
        );
      }
      const filename = existingMatches[0] ?? adrToFilename(adr.id, adr.title);
      const filePath = join(adrDir, filename);
      const markdown = buildAdrMarkdown(adr);

      const fileExists = existsSync(filePath);

      if (fileExists) {
        if (readFileSync(filePath, 'utf-8') === markdown) {
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
  countDiskEntries?: (content: string) => number | null;
}

function countDecisionExportEntries(content: string): number | null {
  if (!content.startsWith('# Architecture Decision Records (auto-generated)')) return null;
  const lines = content.split('\n');
  let count = 0;
  for (let index = 0; index < lines.length - 2; index++) {
    if (
      /^## .+:\s*.+$/u.test(lines[index] ?? '')
      && (lines[index + 1] ?? '') === ''
      && /^\*\*Status:\*\*\s*\S+/u.test(lines[index + 2] ?? '')
    ) {
      count++;
    }
  }
  return count;
}

function countSummaryDecisionEntries(content: string): number | null {
  if (!content.startsWith('# Brain Summary (auto-generated)')) return null;
  const section = content
    .split('## Active Architecture Decisions')[1]
    ?.split('\n## ')[0];
  if (section === undefined) return null;
  return section
    .split('\n')
    .filter(line =>
      /^\| .+ \| .+ \| .+ \|$/u.test(line)
      && !line.includes('| ID | Title | Status |')
      && !line.includes('|-----|-------|--------|'))
    .length;
}

const GUARDED_EXPORT_SPECS: GuardedExportSpec[] = [
  {
    name: 'summary.md',
    render: exportSummaryMd,
    entryType: 'adr',
    emptyMarker: '_No architecture decisions recorded._',
    countDiskEntries: countSummaryDecisionEntries,
  },
  {
    name: 'decisions.md',
    render: exportDecisionsMd,
    entryType: 'adr',
    emptyMarker: '_No architecture decisions recorded._',
    countDiskEntries: countDecisionExportEntries,
  },
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
    const diskContent = existsSync(filePath)
      ? readFileSync(filePath, 'utf-8')
      : null;
    const diskCount = diskContent !== null && spec.countDiskEntries
      ? spec.countDiskEntries(diskContent)
      : null;

    if (dbCount > 0 && renderIsEmpty) {
      const warning =
        `export-wipe-guard: refused to write ${spec.name} — ` +
        `DB has ${dbCount} ${spec.entryType} entries but render is empty ` +
        `(preserving previous file at ${filePath})`;
      result.warnings.push(warning);
      result.skipped.push(spec.name);
      continue;
    }

    if (dbCount > 0 && diskCount !== null && diskCount > dbCount) {
      const warning =
        `export-wipe-guard: refused to write ${spec.name} — ` +
        `DB has ${dbCount} ${spec.entryType} entries but disk export has ${diskCount} ` +
        `(preserving previous file at ${filePath})`;
      result.warnings.push(warning);
      result.skipped.push(spec.name);
      continue;
    }

    if (dbCount === 0 && diskContent !== null) {
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
