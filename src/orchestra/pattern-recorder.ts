import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR } from '../core/constants.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface LearningEntry {
  taskType: string;
  agent: string | null;
  skills: string[];
  model: string;
  effort: string;
  evaluation: string;  // 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'
  coverage: number;
  durationMs: number;
  sprintId: string;
  recordedAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const LEARNING_DIR = 'learning';

// ─── PatternRecorder ────────────────────────────────────────────────

export class PatternRecorder {
  private readonly learningPath: string;

  constructor(projectRoot: string) {
    this.learningPath = join(projectRoot, BRAIN_DIR, LEARNING_DIR);
  }

  /**
   * Record a learning entry. Appends to .brain/learning/{sprintId}.json.
   */
  record(entry: LearningEntry): void {
    this.ensureDir();
    const filePath = this.sprintFilePath(entry.sprintId);
    const existing = this.readSprintFile(filePath);
    existing.push(entry);
    writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  }

  /**
   * Read all learning entries for a given sprint.
   */
  readSprint(sprintId: string): LearningEntry[] {
    const filePath = this.sprintFilePath(sprintId);
    return this.readSprintFile(filePath);
  }

  /**
   * List all sprint IDs that have learning data.
   */
  listSprints(): string[] {
    if (!existsSync(this.learningPath)) {
      return [];
    }
    try {
      const files = readdirSync(this.learningPath);
      return files
        .filter(f => f.endsWith('.json') && f !== 'summary.json')
        .map(f => f.replace('.json', ''))
        .sort();
    } catch {
      return [];
    }
  }

  private sprintFilePath(sprintId: string): string {
    return join(this.learningPath, `${sprintId}.json`);
  }

  private readSprintFile(filePath: string): LearningEntry[] {
    if (!existsSync(filePath)) {
      return [];
    }
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed as LearningEntry[];
      }
      return [];
    } catch {
      return [];
    }
  }

  private ensureDir(): void {
    if (!existsSync(this.learningPath)) {
      mkdirSync(this.learningPath, { recursive: true });
    }
  }
}
