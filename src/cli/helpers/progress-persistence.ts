// ─── Progress Persistence ───────────────────────────────────────────
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export interface ProgressState {
  sprintId: string;
  phase: string;
  tasksTotal: number;
  tasksDone: number;
  tasksActive: number;
  updatedAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const PROGRESS_FILENAME = '.progress-state.json';
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

// ─── Filesystem abstraction ─────────────────────────────────────────

export interface FsAdapter {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options: { recursive: boolean }): void;
  readFileSync(path: string, encoding: 'utf-8'): string;
  writeFileSync(path: string, data: string, encoding: 'utf-8'): void;
  unlinkSync(path: string): void;
}

const defaultFs: FsAdapter = {
  existsSync,
  mkdirSync: (p, opts) => { mkdirSync(p, opts); },
  readFileSync: (p, enc) => readFileSync(p, enc),
  writeFileSync: (p, data, enc) => { writeFileSync(p, data, enc); },
  unlinkSync,
};

// ─── ProgressPersistence class ──────────────────────────────────────

export class ProgressPersistence {
  private filePath: string;
  private fs: FsAdapter;

  constructor(tasksDir: string, fs?: FsAdapter) {
    this.filePath = join(tasksDir, PROGRESS_FILENAME);
    this.fs = fs ?? defaultFs;
  }

  /**
   * Save a progress state to disk.
   */
  save(state: ProgressState): void {
    const dir = dirname(this.filePath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    const data = JSON.stringify(state, null, 2);
    this.fs.writeFileSync(this.filePath, data, 'utf-8');
  }

  /**
   * Load a progress state from disk.
   * Returns null if file does not exist or is invalid JSON.
   */
  load(): ProgressState | null {
    if (!this.fs.existsSync(this.filePath)) {
      return null;
    }
    try {
      const raw = this.fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as ProgressState;
    } catch {
      return null;
    }
  }

  /**
   * Check if the persisted progress state is stale (older than threshold).
   * Returns true if stale or missing.
   */
  isProgressStale(nowMs?: number): boolean {
    const state = this.load();
    if (!state) return true;

    const now = nowMs ?? Date.now();
    const updatedMs = new Date(state.updatedAt).getTime();
    if (isNaN(updatedMs)) return true;

    return (now - updatedMs) > STALE_THRESHOLD_MS;
  }

  /**
   * Delete the progress state file.
   */
  clear(): void {
    if (this.fs.existsSync(this.filePath)) {
      this.fs.unlinkSync(this.filePath);
    }
  }

  /**
   * Get the path of the progress state file.
   */
  getFilePath(): string {
    return this.filePath;
  }
}
