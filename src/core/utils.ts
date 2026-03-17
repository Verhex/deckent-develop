import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, ARCHIVE_DIR, SPRINTS_DIR } from './constants.js';

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
