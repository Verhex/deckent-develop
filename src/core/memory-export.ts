/**
 * memory-export.ts — Generate .md snapshots from the SQLite DB.
 *
 * Four export functions produce markdown strings for git tracking
 * and human review. Each takes a MemoryStore instance and returns
 * a markdown string.
 */

import type { MemoryStore } from './memory-store.js';
import type { MemoryEntryV2 } from './memory-types.js';

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

  // Active Technical Debt
  const debts = store.getByType('debt').filter(d => d.status === 'active');
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
