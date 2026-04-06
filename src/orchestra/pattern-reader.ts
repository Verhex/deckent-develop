import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR } from '../core/constants.js';
import type { LearningEntry } from './pattern-recorder.js';
import { debugLog } from '../core/utils.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface PatternFilter {
  taskType?: string;
  agent?: string;
  model?: string;
  evaluation?: string;
  minCoverage?: number;
  sprintRange?: { from: string; to: string };
}

export interface SuccessfulCombination {
  agent: string | null;
  skills: string[];
  model: string;
  count: number;
}

export interface FailedCombination {
  agent: string | null;
  skills: string[];
  model: string;
  count: number;
  lastSprint: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const LEARNING_DIR = 'learning';

// ─── PatternReader ──────────────────────────────────────────────────

export class PatternReader {
  private readonly learningPath: string;

  constructor(projectRoot: string) {
    this.learningPath = join(projectRoot, BRAIN_DIR, LEARNING_DIR);
  }

  /**
   * Query all learning entries across all sprints, applying the given filter.
   */
  queryPatterns(filter: PatternFilter): LearningEntry[] {
    const allEntries = this.readAllEntries();
    return allEntries.filter(entry => this.matchesFilter(entry, filter));
  }

  /**
   * Get successful agent/skill/model combinations for a task type.
   * DONE + coverage > 80%, sorted by count descending.
   */
  getSuccessfulCombinations(taskType: string): SuccessfulCombination[] {
    const allEntries = this.readAllEntries();
    const matching = allEntries.filter(
      e => e.taskType === taskType && e.evaluation === 'DONE' && e.coverage > 80,
    );

    const comboMap = new Map<string, SuccessfulCombination>();
    for (const entry of matching) {
      const key = this.comboKey(entry.agent, entry.skills, entry.model);
      const existing = comboMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        comboMap.set(key, {
          agent: entry.agent,
          skills: [...entry.skills],
          model: entry.model,
          count: 1,
        });
      }
    }

    return Array.from(comboMap.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * Get failed agent/skill/model combinations for a task type.
   * NO_GO entries, sorted by recency (most recent last sprint first).
   */
  getFailedCombinations(taskType: string): FailedCombination[] {
    const allEntries = this.readAllEntries();
    const matching = allEntries.filter(
      e => e.taskType === taskType && e.evaluation === 'NO_GO',
    );

    const comboMap = new Map<string, FailedCombination>();
    for (const entry of matching) {
      const key = this.comboKey(entry.agent, entry.skills, entry.model);
      const existing = comboMap.get(key);
      if (existing) {
        existing.count++;
        if (entry.sprintId > existing.lastSprint) {
          existing.lastSprint = entry.sprintId;
        }
      } else {
        comboMap.set(key, {
          agent: entry.agent,
          skills: [...entry.skills],
          model: entry.model,
          count: 1,
          lastSprint: entry.sprintId,
        });
      }
    }

    return Array.from(comboMap.values()).sort((a, b) => {
      // Sort by recency first (most recent first), then by count
      if (b.lastSprint !== a.lastSprint) {
        return b.lastSprint > a.lastSprint ? 1 : -1;
      }
      return b.count - a.count;
    });
  }

  private readAllEntries(): LearningEntry[] {
    if (!existsSync(this.learningPath)) {
      return [];
    }
    const entries: LearningEntry[] = [];
    try {
      const files = readdirSync(this.learningPath);
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'summary.json') continue;
        try {
          const content = readFileSync(join(this.learningPath, file), 'utf-8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            entries.push(...(parsed as LearningEntry[]));
          }
        } catch (e) {
          debugLog('PatternReader:loadFromDisk:parseFile', e);
        }
      }
    } catch (e) {
      debugLog('PatternReader:loadFromDisk:readdirSync', e);
    }
    return entries;
  }

  private matchesFilter(entry: LearningEntry, filter: PatternFilter): boolean {
    if (filter.taskType !== undefined && entry.taskType !== filter.taskType) return false;
    if (filter.agent !== undefined && entry.agent !== filter.agent) return false;
    if (filter.model !== undefined && entry.model !== filter.model) return false;
    if (filter.evaluation !== undefined && entry.evaluation !== filter.evaluation) return false;
    if (filter.minCoverage !== undefined && entry.coverage < filter.minCoverage) return false;
    if (filter.sprintRange) {
      if (entry.sprintId < filter.sprintRange.from) return false;
      if (entry.sprintId > filter.sprintRange.to) return false;
    }
    return true;
  }

  private comboKey(agent: string | null, skills: string[], model: string): string {
    return `${agent ?? 'null'}|${[...skills].sort().join(',')}|${model}`;
  }
}
