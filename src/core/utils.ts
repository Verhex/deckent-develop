import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, ARCHIVE_DIR, SPRINTS_DIR, DEBT_TABLE_HEADER, DECKENT_FILE } from './constants.js';
import type { DebtItem } from './types.js';
import { DebtPriority } from './types.js';

/**
 * Count total lines in .brain/ directory (excluding archive/).
 * Used by brain decay and doctor health checks.
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
 * Scan .brain/sprints/ directory, find max sprint-NNN.md number,
 * return sprint-{max+1} padded to 3 digits.
 * If no sprints dir or empty, return "sprint-001".
 */
export function getNextSprintId(projectRoot: string): string {
  const sprintsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  let maxNumber = 0;
  if (existsSync(sprintsDir)) {
    for (const file of readdirSync(sprintsDir)) {
      const match = file.match(/^sprint-(\d+)\.md$/);
      if (match?.[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }
  }
  return `sprint-${String(maxNumber + 1).padStart(3, '0')}`;
}

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
      id: cols[0]!,
      description: cols[1]!,
      originTaskId: cols[2]!,
      originSprintId: cols[3]!,
      priority: cols[4] as DebtPriority,
      sprintsOpen: parseInt(cols[5]!, 10) || 0,
      resolved: cols[6] === 'true',
      resolvedInSprintId: cols[7] === '-' ? undefined : cols[7],
      createdAt: cols[8]!,
    });
  }
  return items;
}

export function generateDebtTable(items: DebtItem[]): string {
  const separator = '|----|-------------|------|--------|----------|------|----------|----------|---------|';
  const rows = items.map(d =>
    `| ${d.id} | ${d.description} | ${d.originTaskId} | ${d.originSprintId} | ${d.priority} | ${d.sprintsOpen} | ${d.resolved} | ${d.resolvedInSprintId ?? '-'} | ${d.createdAt} |`,
  );
  return [DEBT_TABLE_HEADER, separator, ...rows].join('\n');
}

/**
 * Ensure a file contains `@DECKENT.md` reference.
 * - File doesn't exist → create with `@DECKENT.md\n`
 * - File exists without reference → prepend `@DECKENT.md\n\n` to existing content
 * - File exists with reference → no-op (idempotent)
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
