import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, PATTERNS_FILE } from '../core/constants.js';
import type { PatternEntry } from '../core/types.js';
import type { LearningEntry } from './pattern-recorder.js';
import { debugLog } from '../core/utils.js';

// ─── Constants ──────────────────────────────────────────────────────

const LEARNING_DIR = 'learning';

// ─── Keyword → TaskType Mapping ─────────────────────────────────────

const KEYWORD_MAP: Array<{ keywords: string[]; taskType: string }> = [
  { keywords: ['test', 'coverage', 'spec', 'vitest', 'jest'], taskType: 'testing' },
  { keywords: ['doc', 'readme', 'changelog', 'documentation'], taskType: 'documentation' },
  { keywords: ['refactor', 'cleanup', 'migration', 'debt'], taskType: 'refactoring' },
  { keywords: ['fix', 'bug', 'error', 'patch', 'hotfix'], taskType: 'bugfix' },
  { keywords: ['feature', 'implement', 'add', 'new', 'create'], taskType: 'feature' },
  { keywords: ['config', 'setup', 'init', 'configure'], taskType: 'configuration' },
  { keywords: ['security', 'auth', 'permission', 'credential'], taskType: 'security' },
  { keywords: ['performance', 'optimize', 'speed', 'cache'], taskType: 'performance' },
  { keywords: ['boundary', 'violation', 'scope'], taskType: 'boundary-enforcement' },
  { keywords: ['heartbeat', 'stale', 'monitor', 'health'], taskType: 'monitoring' },
  { keywords: ['lock', 'deadlock', 'circular'], taskType: 'concurrency' },
  { keywords: ['deploy', 'ci/', 'cd/', 'pipeline', 'release'], taskType: 'deployment' },
  { keywords: ['usage', 'threshold', 'budget'], taskType: 'resource-management' },
  { keywords: ['memory', 'brain', 'decay'], taskType: 'memory-management' },
];

// ─── Functions ──────────────────────────────────────────────────────

/**
 * Read .brain/PATTERNS.md, convert PatternEntry -> LearningEntry.
 * Map pattern string -> taskType via keywords.
 */
export function migratePatternsToLearning(
  projectRoot: string,
): { migrated: number; skipped: number } {
  const patternsPath = join(projectRoot, BRAIN_DIR, PATTERNS_FILE);
  if (!existsSync(patternsPath)) {
    return { migrated: 0, skipped: 0 };
  }

  let patterns: PatternEntry[];
  try {
    const content = readFileSync(patternsPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return { migrated: 0, skipped: 0 };
    }
    patterns = parsed as PatternEntry[];
  } catch {
    return { migrated: 0, skipped: 0 };
  }

  const learningPath = join(projectRoot, BRAIN_DIR, LEARNING_DIR);
  if (!existsSync(learningPath)) {
    mkdirSync(learningPath, { recursive: true });
  }

  let migrated = 0;
  let skipped = 0;

  // Group entries by their lastDetectedInSprint for file placement
  const bySprintId = new Map<string, LearningEntry[]>();

  for (const pattern of patterns) {
    const taskType = inferTaskType(pattern.pattern);
    if (!taskType) {
      skipped++;
      continue;
    }

    const entry: LearningEntry = {
      taskType,
      agent: null,
      skills: [],
      model: 'unknown',
      effort: 'normal',
      evaluation: pattern.resolved ? 'DONE' : 'NO_GO',
      coverage: 0,
      durationMs: 0,
      sprintId: pattern.lastDetectedInSprint || pattern.firstDetectedInSprint || 'sprint-000',
      recordedAt: new Date().toISOString(),
    };

    const sprintId = entry.sprintId;
    const existing = bySprintId.get(sprintId) ?? [];
    existing.push(entry);
    bySprintId.set(sprintId, existing);
    migrated++;
  }

  // Write grouped entries to sprint files
  for (const [sprintId, entries] of bySprintId) {
    const filePath = join(learningPath, `${sprintId}.json`);
    let existingEntries: LearningEntry[] = [];
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          existingEntries = parsed as LearningEntry[];
        }
      } catch (e) {
        debugLog('migratePatternsToPerId:readExisting', e);
      }
    }
    existingEntries.push(...entries);
    writeFileSync(filePath, JSON.stringify(existingEntries, null, 2) + '\n', 'utf-8');
  }

  return { migrated, skipped };
}

/**
 * Returns JSON string of all learning data.
 */
export function exportLearningData(projectRoot: string): string {
  const learningPath = join(projectRoot, BRAIN_DIR, LEARNING_DIR);
  if (!existsSync(learningPath)) {
    return JSON.stringify({ sprints: {} });
  }

  const result: Record<string, LearningEntry[]> = {};
  try {
    const files = readdirSync(learningPath);
    for (const file of files) {
      if (!file.endsWith('.json') || file === 'summary.json') continue;
      const sprintId = file.replace('.json', '');
      try {
        const content = readFileSync(join(learningPath, file), 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          result[sprintId] = parsed as LearningEntry[];
        }
      } catch (e) {
        debugLog('exportLearningData:parseFile', e);
      }
    }
  } catch (e) {
    debugLog('exportLearningData:readdirSync', e);
  }

  return JSON.stringify({ sprints: result }, null, 2);
}

/**
 * Imports from JSON backup.
 */
export function importLearningData(
  projectRoot: string,
  data: string,
): { imported: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { imported: 0 };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { imported: 0 };
  }

  const obj = parsed as Record<string, unknown>;
  const sprints = obj.sprints;
  if (!sprints || typeof sprints !== 'object') {
    return { imported: 0 };
  }

  const learningPath = join(projectRoot, BRAIN_DIR, LEARNING_DIR);
  if (!existsSync(learningPath)) {
    mkdirSync(learningPath, { recursive: true });
  }

  let imported = 0;
  const sprintsObj = sprints as Record<string, unknown>;

  for (const [sprintId, entries] of Object.entries(sprintsObj)) {
    if (!Array.isArray(entries)) continue;
    const filePath = join(learningPath, `${sprintId}.json`);

    // Merge with existing entries if the file already exists
    let existingEntries: LearningEntry[] = [];
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const prev = JSON.parse(content);
        if (Array.isArray(prev)) {
          existingEntries = prev as LearningEntry[];
        }
      } catch (e) {
        debugLog('importLearningData:readExisting', e);
      }
    }

    const validEntries = entries.filter(
      (e): e is LearningEntry =>
        e !== null && typeof e === 'object' && 'taskType' in e && 'sprintId' in e,
    );

    existingEntries.push(...validEntries);
    writeFileSync(filePath, JSON.stringify(existingEntries, null, 2) + '\n', 'utf-8');
    imported += validEntries.length;
  }

  return { imported };
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Infer a taskType from a pattern string using keyword matching.
 * Returns null if no keywords match.
 */
export function inferTaskType(patternString: string): string | null {
  const lower = patternString.toLowerCase();
  for (const mapping of KEYWORD_MAP) {
    for (const keyword of mapping.keywords) {
      if (lower.includes(keyword)) {
        return mapping.taskType;
      }
    }
  }
  return null;
}
