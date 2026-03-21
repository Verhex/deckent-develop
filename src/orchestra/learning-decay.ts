import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR } from '../core/constants.js';
import type { LearningEntry } from './pattern-recorder.js';

// ─── Constants ──────────────────────────────────────────────────────

const LEARNING_DIR = 'learning';
const SUMMARY_FILE = 'summary.json';
const DEFAULT_MAX_SPRINTS = 10;

// ─── Types ──────────────────────────────────────────────────────────

export interface DecayResult {
  removed: string[];
  kept: string[];
}

export interface CompactResult {
  combinationCount: number;
}

export interface SummaryEntry {
  uses: number;
  successes: number;
  failures: number;
  avgCoverage: number;
}

export type SummaryData = Record<string, SummaryEntry>;

// ─── Functions ──────────────────────────────────────────────────────

/**
 * Remove .brain/learning/ files older than maxSprintsToKeep (default 10).
 * Sort sprint files by ID, keep newest N.
 */
export function decayLearningData(
  projectRoot: string,
  maxSprintsToKeep?: number,
): DecayResult {
  const max = maxSprintsToKeep ?? DEFAULT_MAX_SPRINTS;
  const learningPath = join(projectRoot, BRAIN_DIR, LEARNING_DIR);

  if (!existsSync(learningPath)) {
    return { removed: [], kept: [] };
  }

  const files = listSprintFiles(learningPath);
  if (files.length <= max) {
    return { removed: [], kept: files };
  }

  // Sort by sprint ID (ascending) — oldest first
  const sorted = [...files].sort();
  const removeCount = sorted.length - max;
  const toRemove = sorted.slice(0, removeCount);
  const toKeep = sorted.slice(removeCount);

  for (const file of toRemove) {
    try {
      unlinkSync(join(learningPath, `${file}.json`));
    } catch {
      // ignore removal errors
    }
  }

  return { removed: toRemove, kept: toKeep };
}

/**
 * After decay, merge remaining entries into .brain/learning/summary.json.
 * Summary: { [combo_key]: { uses, successes, failures, avgCoverage } }
 * combo_key = `${taskType}|${agent}|${skills.sort().join(',')}|${model}`
 */
export function compactPatterns(projectRoot: string): CompactResult {
  const learningPath = join(projectRoot, BRAIN_DIR, LEARNING_DIR);

  if (!existsSync(learningPath)) {
    return { combinationCount: 0 };
  }

  const allEntries = readAllEntries(learningPath);
  const summary: SummaryData = {};

  for (const entry of allEntries) {
    const key = comboKey(entry);
    const existing = summary[key];

    if (existing) {
      existing.uses++;
      if (entry.evaluation === 'DONE') existing.successes++;
      if (entry.evaluation === 'NO_GO') existing.failures++;
      // Running average for coverage
      existing.avgCoverage =
        (existing.avgCoverage * (existing.uses - 1) + entry.coverage) / existing.uses;
    } else {
      summary[key] = {
        uses: 1,
        successes: entry.evaluation === 'DONE' ? 1 : 0,
        failures: entry.evaluation === 'NO_GO' ? 1 : 0,
        avgCoverage: entry.coverage,
      };
    }
  }

  const summaryPath = join(learningPath, SUMMARY_FILE);
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf-8');

  return { combinationCount: Object.keys(summary).length };
}

// ─── Helpers ────────────────────────────────────────────────────────

function listSprintFiles(learningPath: string): string[] {
  try {
    const files = readdirSync(learningPath);
    return files
      .filter(f => f.endsWith('.json') && f !== SUMMARY_FILE)
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

function readAllEntries(learningPath: string): LearningEntry[] {
  const entries: LearningEntry[] = [];
  const files = listSprintFiles(learningPath);

  for (const sprintId of files) {
    try {
      const content = readFileSync(join(learningPath, `${sprintId}.json`), 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        entries.push(...(parsed as LearningEntry[]));
      }
    } catch {
      // skip malformed files
    }
  }

  return entries;
}

function comboKey(entry: LearningEntry): string {
  const agent = entry.agent ?? 'null';
  const skills = [...entry.skills].sort().join(',');
  return `${entry.taskType}|${agent}|${skills}|${entry.model}`;
}
