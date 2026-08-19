// ─── Timeout Watcher ────────────────────────────────────────────────
// Runtime extension prototype — Option B Watcher Daemon.
// Monitors worker timeouts and optionally extends them when progress
// is detected (heartbeat fresh + git diff substantial).
//
// Default: OFF (runtime_extension_enabled: false in config).
// Sprint 145 — Task 019

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { TASKS_DIR } from '../core/constants.js';
import { writeEvent, CHANNELS } from './event-stream.js';

// ─── Types ──────────────────────────────────────────────────────────

/** Configuration subset for runtime timeout extension. */
export interface TimeoutWatcherConfig {
  /** Enable runtime extension (default: false). */
  runtime_extension_enabled: boolean;
  /** Max extensions per worker (hard cap, config-independent fail-safe). */
  max_extensions?: number;
  /** Heartbeat freshness threshold in seconds (default: 60). */
  heartbeat_freshness_seconds?: number;
  /** Minimum git diff lines to consider "making progress" (default: 30). */
  min_diff_lines?: number;
}

/** Progress check result for a worker. */
export interface ProgressCheck {
  heartbeatFresh: boolean;
  diffLines: number;
  progressing: boolean;
}

/** Internal timer state for a single worker. */
interface TimerEntry {
  timer: ReturnType<typeof setTimeout>;
  timeoutMs: number;
  killFn: () => Promise<void>;
}

// ─── Defaults ───────────────────────────────────────────────────────

const DEFAULT_WATCHER_CONFIG: Required<TimeoutWatcherConfig> = {
  runtime_extension_enabled: false,
  max_extensions: 2,
  heartbeat_freshness_seconds: 60,
  min_diff_lines: 30,
};

/** Hard maximum extensions — never exceeded regardless of config. */
const MAX_EXTENSIONS_HARD_CAP = 2;

// ─── TimeoutWatcher ─────────────────────────────────────────────────

/**
 * Watches worker timeouts and optionally extends them when progress is detected.
 *
 * Lifecycle:
 *   1. `start(workerId, timeoutMs, killFn)` — arm a timeout for a worker
 *   2. When timeout fires:
 *      a. If runtime_extension_enabled AND extension count < cap → check progress
 *      b. If progressing → extend by 50% of original timeout
 *      c. Otherwise → call killFn()
 *   3. `stop(workerId)` — disarm the timeout (worker completed normally)
 *
 * The extension limit is hard-capped at 2 regardless of configuration.
 */
export class TimeoutWatcher {
  private timers = new Map<string, TimerEntry>();
  private extensions = new Map<string, number>();
  private config: Required<TimeoutWatcherConfig>;
  private projectRoot: string;
  private sprintId: string;

  constructor(
    projectRoot: string,
    sprintId: string,
    config?: Partial<TimeoutWatcherConfig>,
  ) {
    this.projectRoot = projectRoot;
    this.sprintId = sprintId;
    this.config = { ...DEFAULT_WATCHER_CONFIG, ...config };
    // Enforce hard cap
    if (this.config.max_extensions > MAX_EXTENSIONS_HARD_CAP) {
      this.config.max_extensions = MAX_EXTENSIONS_HARD_CAP;
    }
  }

  /**
   * Arm a timeout for a worker. When the timeout fires, the watcher
   * checks whether to extend or kill.
   */
  start(workerId: string, timeoutMs: number, killFn: () => Promise<void>): void {
    // Clear any existing timer for this worker
    this.clearTimer(workerId);

    const timer = setTimeout(async () => {
      this.timers.delete(workerId);
      await this.onTimeout(workerId, timeoutMs, killFn);
    }, timeoutMs);

    // Prevent timer from keeping the process alive
    if (timer.unref) timer.unref();

    this.timers.set(workerId, { timer, timeoutMs, killFn });
  }

  /**
   * Extend a worker's timeout by the given extra milliseconds.
   * Writes a TIMEOUT_EXTEND event to the event stream.
   */
  extend(workerId: string, extraMs: number, killFn: () => Promise<void>): void {
    this.clearTimer(workerId);
    const count = (this.extensions.get(workerId) ?? 0) + 1;
    this.extensions.set(workerId, count);

    writeEvent(
      this.projectRoot,
      this.sprintId,
      'brain',
      'worker',
      CHANNELS.TIMEOUT_EXTEND,
      { workerId, extraMs, extensionCount: count },
    );

    this.start(workerId, extraMs, killFn);
  }

  /**
   * Disarm the timeout for a worker (e.g., worker completed normally).
   */
  stop(workerId: string): void {
    this.clearTimer(workerId);
    this.extensions.delete(workerId);
  }

  /**
   * Get the current extension count for a worker.
   */
  getExtensionCount(workerId: string): number {
    return this.extensions.get(workerId) ?? 0;
  }

  /**
   * Check whether there are any active timers.
   */
  hasActiveTimers(): boolean {
    return this.timers.size > 0;
  }

  /**
   * Stop all active timers. Useful during sprint cleanup.
   */
  stopAll(): void {
    for (const [workerId] of this.timers) {
      this.clearTimer(workerId);
    }
    this.extensions.clear();
  }

  // ─── Internal ───────────────────────────────────────────────────

  /**
   * Called when a worker's timeout fires.
   * Decides whether to extend or kill based on config and progress.
   */
  private async onTimeout(
    workerId: string,
    originalTimeoutMs: number,
    killFn: () => Promise<void>,
  ): Promise<void> {
    const extCount = this.extensions.get(workerId) ?? 0;
    const maxExt = Math.min(this.config.max_extensions, MAX_EXTENSIONS_HARD_CAP);

    if (this.config.runtime_extension_enabled && extCount < maxExt) {
      const progress = this.checkProgress(workerId);
      if (progress.progressing) {
        const extraMs = Math.round(originalTimeoutMs * 0.5);
        this.extend(workerId, extraMs, killFn);
        return;
      }
    }

    // No extension — kill the worker
    await killFn();
  }

  /**
   * Check whether a worker is making progress.
   *
   * Progress = git diff line count exceeds minimum.
   *
   * 7094-F1d (2026-08-19): the heartbeat is a SINGLE write at worker start —
   * the file's in-file timestamp freezes at spawn by contract, so a
   * `heartbeatFresh` conjunct forced `progressing=false` for every worker
   * after `heartbeat_freshness_seconds` no matter how much real work the
   * diff showed. The diff is the honest, F1d-independent progress signal;
   * `heartbeatFresh` stays reported for observability but no longer gates.
   */
  checkProgress(workerId: string): ProgressCheck {
    const heartbeatFresh = this.isHeartbeatFresh(workerId);
    const diffLines = this.getGitDiffLines();
    const progressing = diffLines >= this.config.min_diff_lines;

    return { heartbeatFresh, diffLines, progressing };
  }

  /**
   * Check if the heartbeat file for this worker's task was updated recently.
   * Extracts the task ID from the workerId pattern "w-NNN-MMM" → "NNN-MMM".
   */
  private isHeartbeatFresh(workerId: string): boolean {
    const taskId = workerIdToTaskId(workerId);
    const hbPath = join(this.projectRoot, TASKS_DIR, `task-${taskId}.hb`);

    if (!existsSync(hbPath)) return false;

    try {
      const raw = readFileSync(hbPath, 'utf-8');
      const hb = JSON.parse(raw) as { timestamp?: string };
      if (!hb.timestamp) return false;

      const hbTime = new Date(hb.timestamp).getTime();
      const now = Date.now();
      const ageSeconds = (now - hbTime) / 1000;

      return ageSeconds < this.config.heartbeat_freshness_seconds;
    } catch {
      return false;
    }
  }

  /**
   * Get the total number of changed lines in the working tree.
   * Uses `git diff --stat` and parses the summary line.
   */
  private getGitDiffLines(): number {
    try {
      const output = execSync('git diff --stat', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        timeout: 5000,
      });
      return parseGitDiffStatLines(output);
    } catch {
      return 0;
    }
  }

  private clearTimer(workerId: string): void {
    const entry = this.timers.get(workerId);
    if (entry) {
      clearTimeout(entry.timer);
      this.timers.delete(workerId);
    }
  }
}

// ─── Utility Functions ──────────────────────────────────────────────

/**
 * Extract task ID from worker ID.
 * Pattern: "w-145-019" → "145-019"
 */
export function workerIdToTaskId(workerId: string): string {
  if (workerId.startsWith('w-')) {
    return workerId.slice(2);
  }
  return workerId;
}

/**
 * Parse the summary line of `git diff --stat` output to get total changed lines.
 *
 * Example summary line:
 *   " 5 files changed, 120 insertions(+), 30 deletions(-)"
 *
 * Returns insertions + deletions.
 */
export function parseGitDiffStatLines(output: string): number {
  const lines = output.trim().split('\n');
  if (lines.length === 0) return 0;

  // The summary is always the last line
  const summary = lines[lines.length - 1]!;

  let total = 0;
  const insertMatch = summary.match(/(\d+)\s+insertion/);
  if (insertMatch) total += parseInt(insertMatch[1]!, 10);

  const deleteMatch = summary.match(/(\d+)\s+deletion/);
  if (deleteMatch) total += parseInt(deleteMatch[1]!, 10);

  return total;
}

/**
 * Create a TimeoutWatcher if runtime extension is enabled in config.
 * Returns null if disabled (default behavior).
 */
export function createTimeoutWatcher(
  projectRoot: string,
  sprintId: string,
  config?: Partial<TimeoutWatcherConfig>,
): TimeoutWatcher | null {
  const merged = { ...DEFAULT_WATCHER_CONFIG, ...config };
  if (!merged.runtime_extension_enabled) return null;
  return new TimeoutWatcher(projectRoot, sprintId, config);
}
