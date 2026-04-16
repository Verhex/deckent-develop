// src/core/memory-import.ts
//
// Parse existing .brain/ markdown files into CreateEntryInput objects
// for Memory V2 DB insertion.

import type { CreateEntryInput } from './memory-types.js';

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

// ─── parseDebtMd ─────────────────────────────────────────────────

/**
 * Parse DEBT.md pipe-delimited markdown table into CreateEntryInput[].
 * Columns: ID | Description | OriginTaskId | OriginSprintId | Priority |
 *          SprintsOpen | Resolved | ResolvedInSprintId | CreatedAt
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

    // Extract sprint number from originSprintId (sprint-NNN)
    const sprintNumMatch = originSprintId.match(/sprint-(\d+)/);
    const sprintNum = sprintNumMatch?.[1] ? parseInt(sprintNumMatch[1], 10) : 0;

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
      sprint_id: originSprintId,
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
