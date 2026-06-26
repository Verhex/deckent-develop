// ═══ Multi-Backend Output Collector ═══════════════════════════════════
// Captures worker output from Docker, tmux, and subprocess backends.
// Sprint 139 — Task 045: unified output collection with adaptive polling.
//
// Features:
//   - CircularBuffer: max 10k lines per worker (memory protection)
//   - Adaptive polling: active 1000ms, idle 5000ms
//   - Backend abstraction: docker logs, tmux capture-pane, subprocess pipe
//   - Fail-safe: backend errors → warn + continue
//   - File write: .deckent/sprint-NNN-outputs/task-NNN.out per task

import { spawnSync, spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from './constants.js';
import { DeckentError } from './errors.js';
import { debugLog } from './utils.js';
import type { LogEvent } from './log-event.js';

/** Output collector specific error type (error-handling unification rule compliance). */
export class OutputCollectorError extends DeckentError {
  constructor(message: string) {
    super('OUTPUT_COLLECTOR_ERROR', message);
    this.name = 'OutputCollectorError';
  }
}

// ─── Types ──────────────────────────────────────────────────────────

/** Single output entry from a worker. */
export interface OutputEntry {
  readonly timestamp: string;
  readonly line: string;
  readonly stream: 'stdout' | 'stderr' | 'mixed';
}

/** Backend type for output collection. */
export type OutputBackendType = 'docker' | 'tmux' | 'subprocess';

/** Options for collecting output from a specific worker. */
export interface CollectOptions {
  /** Worker identifier (task ID or container name). */
  workerId: string;
  /** Backend type to use for output capture. */
  backend: OutputBackendType;
  /** Task ID for file naming. */
  taskId: string;
  /** Container name (Docker backend). */
  containerName?: string;
  /** Tmux session:window target (tmux backend). */
  tmuxTarget?: string;
  /** Max lines to keep in circular buffer. Default: 10000. */
  maxLines?: number;
}

/** Worker polling state (internal). */
interface WorkerPollingState {
  readonly workerId: string;
  readonly backend: OutputBackendType;
  readonly taskId: string;
  readonly containerName?: string;
  readonly tmuxTarget?: string;
  timeout: ReturnType<typeof setTimeout> | null;
  lastLineCount: number;
  consecutiveIdlePolls: number;
}

/** Snapshot of a worker's collected output. */
export interface OutputSnapshot {
  readonly workerId: string;
  readonly taskId: string;
  readonly lines: readonly OutputEntry[];
  readonly totalLinesReceived: number;
  readonly droppedLines: number;
}

// ─── Circular Buffer ────────────────────────────────────────────────

/**
 * Fixed-capacity circular buffer for OutputEntry items.
 * When capacity is exceeded, oldest entries are dropped.
 */
export class CircularBuffer {
  private readonly items: OutputEntry[] = [];
  private readonly capacity: number;
  private totalReceived = 0;
  private totalDropped = 0;

  constructor(capacity: number) {
    if (capacity <= 0) throw new OutputCollectorError('CircularBuffer capacity must be positive');
    this.capacity = capacity;
  }

  /** Push one or more entries. Drops oldest if capacity exceeded. */
  push(...entries: OutputEntry[]): void {
    this.totalReceived += entries.length;
    this.items.push(...entries);

    if (this.items.length > this.capacity) {
      const overflow = this.items.length - this.capacity;
      this.items.splice(0, overflow);
      this.totalDropped += overflow;
    }
  }

  /** Current number of entries. */
  get length(): number {
    return this.items.length;
  }

  /** Total entries ever received (including dropped). */
  get received(): number {
    return this.totalReceived;
  }

  /** Total entries dropped due to overflow. */
  get dropped(): number {
    return this.totalDropped;
  }

  /** Get all entries (readonly snapshot). */
  getAll(): readonly OutputEntry[] {
    return [...this.items];
  }

  /** Clear all entries. */
  clear(): void {
    this.items.length = 0;
  }
}

// ─── Polling Intervals ──────────────────────────────────────────────

/** Polling interval when worker is actively producing output. */
const ACTIVE_POLL_MS = 1_000;
/** Polling interval when worker is idle (no new output). */
const IDLE_POLL_MS = 5_000;
/** Number of consecutive polls with no new output before switching to idle. */
const IDLE_THRESHOLD = 3;
/** Default maximum lines per worker buffer. */
const DEFAULT_MAX_LINES = 10_000;

// ─── Log-Event Tail (structured JSONL) ──────────────────────────────

/**
 * Structural guard for a JSONL `LogEvent` row read off disk. Defensive at the
 * parse boundary: a foreign/legacy/partial line that happens to be valid JSON
 * but is not a LogEvent is rejected rather than streamed as garbage.
 */
function isLogEvent(v: unknown): v is LogEvent {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.ts === 'string' &&
    typeof o.seq === 'number' &&
    typeof o.type === 'string' &&
    'content' in o
  );
}

// ─── Backend Capture Functions ──────────────────────────────────────

/**
 * Capture output from a Docker container using `docker logs`.
 * Returns raw lines from stdout+stderr.
 */
function captureDockerOutput(containerName: string, tailLines: number): string[] {
  try {
    const result = spawnSync('docker', [
      'logs', '--tail', String(tailLines), '--timestamps', containerName,
    ], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status !== 0 && result.status !== null) {
      debugLog('output-collector:docker', `docker logs failed for ${containerName}: ${result.stderr ?? 'unknown'}`);
      return [];
    }

    const combined = (result.stdout ?? '') + (result.stderr ?? '');
    return combined.split('\n').filter(l => l.trim().length > 0);
  } catch (err) {
    debugLog('output-collector:docker', err);
    return [];
  }
}

/**
 * Capture output from a tmux pane using `tmux capture-pane`.
 * Returns the last N lines from the pane buffer.
 */
function captureTmuxOutput(target: string, lines: number): string[] {
  try {
    const result = spawnSync('tmux', [
      'capture-pane', '-t', target, '-p', '-S', String(-lines),
    ], {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status !== 0 && result.status !== null) {
      debugLog('output-collector:tmux', `tmux capture-pane failed for ${target}: ${result.stderr ?? 'unknown'}`);
      return [];
    }

    return (result.stdout ?? '').split('\n').filter(l => l.trim().length > 0);
  } catch (err) {
    debugLog('output-collector:tmux', err);
    return [];
  }
}

/**
 * Capture output from a subprocess log file.
 * Reads the task log file and returns the last N lines.
 */
function captureSubprocessOutput(projectRoot: string, taskId: string, tailLines: number): string[] {
  try {
    const logPath = join(projectRoot, '.tasks', `task-${taskId}.log`);
    if (!existsSync(logPath)) return [];

    const content = readFileSync(logPath, 'utf-8');
    const allLines = content.split('\n').filter(l => l.trim().length > 0);
    return allLines.slice(-tailLines);
  } catch (err) {
    debugLog('output-collector:subprocess', err);
    return [];
  }
}

// ─── Output Collector ───────────────────────────────────────────────

/**
 * OutputCollector — multi-backend output aggregation with adaptive polling.
 *
 * Supports Docker, tmux, and subprocess backends. Each worker gets its own
 * CircularBuffer (max 10k lines by default). Polling interval adapts based
 * on output activity: 1s when active, 5s when idle.
 */
export class OutputCollector {
  private readonly buffers = new Map<string, CircularBuffer>();
  private readonly polling = new Map<string, WorkerPollingState>();
  private readonly projectRoot: string;
  private disposed = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Start collecting output from a worker.
   * Begins adaptive polling for the specified backend.
   */
  collect(opts: CollectOptions): void {
    if (this.disposed) {
      throw new OutputCollectorError('OutputCollector has been disposed');
    }

    const { workerId, backend, taskId, containerName, tmuxTarget, maxLines } = opts;

    if (this.polling.has(workerId)) {
      debugLog('output-collector', `Worker ${workerId} already being collected`);
      return;
    }

    // Validate backend-specific options
    if (backend === 'docker' && !containerName) {
      throw new OutputCollectorError('containerName is required for Docker backend');
    }
    if (backend === 'tmux' && !tmuxTarget) {
      throw new OutputCollectorError('tmuxTarget is required for tmux backend');
    }

    const capacity = maxLines ?? DEFAULT_MAX_LINES;
    const buffer = new CircularBuffer(capacity);
    this.buffers.set(workerId, buffer);

    const state: WorkerPollingState = {
      workerId,
      backend,
      taskId,
      containerName,
      tmuxTarget,
      timeout: null,
      lastLineCount: 0,
      consecutiveIdlePolls: 0,
    };
    this.polling.set(workerId, state);

    // Start first poll
    this.schedulePoll(state, ACTIVE_POLL_MS);
  }

  /**
   * Stop collecting output from a worker.
   * Optionally flushes remaining output to disk.
   */
  stop(workerId: string, flush = true): void {
    const state = this.polling.get(workerId);
    if (state?.timeout) {
      clearTimeout(state.timeout);
      state.timeout = null;
    }
    this.polling.delete(workerId);

    if (flush) {
      this.flushToDisk(workerId);
    }
  }

  /**
   * Get a snapshot of a worker's collected output.
   */
  getSnapshot(workerId: string): OutputSnapshot | null {
    const buffer = this.buffers.get(workerId);
    const state = this.polling.get(workerId);
    if (!buffer) return null;

    return {
      workerId,
      taskId: state?.taskId ?? workerId,
      lines: buffer.getAll(),
      totalLinesReceived: buffer.received,
      droppedLines: buffer.dropped,
    };
  }

  /**
   * Get all active worker IDs being collected.
   */
  getActiveWorkers(): string[] {
    return Array.from(this.polling.keys());
  }

  /**
   * Tail the structured JSONL log a worker subprocess appends to its per-task
   * log (`.tasks/task-<id>.log`, written by the spawn-backend via
   * `writeLogEvent`). This is the live source for the dashboard SSE stream
   * (spec §2.3): the SSE backfills with `readLogEvents(taskId)` on connect and
   * tails new appends with `readLogEvents(taskId, lastSeq)`.
   *
   * Provider-agnostic: every line is one JSONL `LogEvent`, whichever provider
   * produced the underlying chunk. A malformed/partial line (e.g. a half-flushed
   * final append) is skipped rather than throwing — the live stream degrades
   * gracefully instead of dying. A missing log file yields `[]`.
   *
   * @param taskId    Task identifier (log file is `.tasks/task-<id>.log`).
   * @param afterSeq  Only return events whose `seq` is greater than this. Default
   *                  `0` returns every event (full backfill); pass the last-seen
   *                  `seq` for an incremental tail.
   * @param maxEvents Cap on the number of returned events — backpressure for
   *                  million-scale logs (mirrors the buffer cap). Most-recent win.
   */
  readLogEvents(taskId: string, afterSeq = 0, maxEvents = DEFAULT_MAX_LINES): LogEvent[] {
    try {
      const logPath = join(this.projectRoot, '.tasks', `task-${taskId}.log`);
      if (!existsSync(logPath)) return [];

      const content = readFileSync(logPath, 'utf-8');
      const events: LogEvent[] = [];
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue; // partial/half-flushed line — skip, never throw
        }
        if (isLogEvent(parsed) && parsed.seq > afterSeq) {
          events.push(parsed);
        }
      }

      // Backpressure: keep only the most recent maxEvents (million-scale guard).
      return events.length > maxEvents ? events.slice(-maxEvents) : events;
    } catch (err) {
      debugLog('output-collector:log-events', err);
      return [];
    }
  }

  /**
   * Flush a worker's buffer to disk.
   * Writes to .deckent/sprint-NNN-outputs/task-NNN.out
   */
  flushToDisk(workerId: string, sprintId?: string): string | null {
    const buffer = this.buffers.get(workerId);
    const state = this.polling.get(workerId);
    if (!buffer || buffer.length === 0) return null;

    const taskId = state?.taskId ?? workerId;
    const sprint = sprintId ?? this.detectSprintId();
    const outputDir = join(this.projectRoot, DECKENT_DIR, `${sprint}-outputs`);

    try {
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = join(outputDir, `task-${taskId}.out`);
      const content = buffer.getAll()
        .map(e => `[${e.timestamp}] [${e.stream}] ${e.line}`)
        .join('\n') + '\n';

      writeFileSync(outputPath, content, 'utf-8');
      return outputPath;
    } catch (err) {
      debugLog('output-collector:flush', err);
      return null;
    }
  }

  /**
   * Stop all polling and flush all buffers.
   */
  dispose(sprintId?: string): void {
    this.disposed = true;

    for (const [workerId, state] of this.polling) {
      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }
      this.flushToDisk(workerId, sprintId);
    }
    this.polling.clear();
  }

  /**
   * Get the internal buffer for a worker (for testing).
   */
  getBuffer(workerId: string): CircularBuffer | undefined {
    return this.buffers.get(workerId);
  }

  // ─── Internal: Polling ────────────────────────────────────────────

  private schedulePoll(state: WorkerPollingState, delayMs: number): void {
    if (this.disposed || !this.polling.has(state.workerId)) return;

    state.timeout = setTimeout(() => {
      this.poll(state);
    }, delayMs);
  }

  private poll(state: WorkerPollingState): void {
    if (this.disposed || !this.polling.has(state.workerId)) return;

    const buffer = this.buffers.get(state.workerId);
    if (!buffer) return;

    // Capture from backend
    const lines = this.captureFromBackend(state);
    const now = new Date().toISOString();

    if (lines.length > 0) {
      const entries: OutputEntry[] = lines.map(line => ({
        timestamp: now,
        line,
        stream: 'mixed' as const,
      }));
      buffer.push(...entries);
    }

    // Adaptive interval calculation
    const currentCount = buffer.received;
    const newLines = currentCount - state.lastLineCount;

    if (newLines > 0) {
      state.consecutiveIdlePolls = 0;
      state.lastLineCount = currentCount;
      this.schedulePoll(state, ACTIVE_POLL_MS);
    } else {
      state.consecutiveIdlePolls++;
      const interval = state.consecutiveIdlePolls >= IDLE_THRESHOLD
        ? IDLE_POLL_MS
        : ACTIVE_POLL_MS;
      this.schedulePoll(state, interval);
    }
  }

  private captureFromBackend(state: WorkerPollingState): string[] {
    try {
      switch (state.backend) {
        case 'docker':
          return captureDockerOutput(state.containerName!, 1000);
        case 'tmux':
          return captureTmuxOutput(state.tmuxTarget!, 1000);
        case 'subprocess':
          return captureSubprocessOutput(this.projectRoot, state.taskId, 1000);
        default:
          debugLog('output-collector', `Unknown backend: ${String(state.backend)}`);
          return [];
      }
    } catch (err) {
      debugLog('output-collector:capture', err);
      return [];
    }
  }

  private detectSprintId(): string {
    try {
      const statePath = join(this.projectRoot, DECKENT_DIR, 'sprint-state.json');
      if (existsSync(statePath)) {
        const data = JSON.parse(readFileSync(statePath, 'utf-8')) as { sprintId?: string };
        if (data.sprintId) return data.sprintId;
      }
    } catch {
      // Fall through to default
    }
    return 'sprint-unknown';
  }
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create an OutputCollector instance for the given project root.
 */
export function createOutputCollector(projectRoot: string): OutputCollector {
  return new OutputCollector(projectRoot);
}

// ─── Follow Mode (async streaming) ──────────────────────────────────

/** Handle returned by followDockerOutput — call stop() to end the stream. */
export interface FollowHandle {
  stop(): void;
}

/**
 * Stream a docker container's logs in follow mode (`docker logs -f`).
 *
 * Uses async spawn so the event loop is never blocked. spawnFn is injectable
 * for unit tests — defaults to node:child_process spawn.
 *
 * @param containerName - Docker container name or ID to follow.
 * @param onLine - Called for each non-blank line received from stdout/stderr.
 * @param spawnFn - Injectable spawn implementation (for testing).
 * @returns A handle with stop() to terminate the follow stream.
 */
export function followDockerOutput(
  containerName: string,
  onLine: (line: string) => void,
  spawnFn: (cmd: string, args: string[]) => ChildProcess = (cmd, args) => nodeSpawn(cmd, args)
): FollowHandle {
  const proc = spawnFn('docker', ['logs', '-f', containerName]);

  let buf = '';
  const onData = (chunk: Buffer): void => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) onLine(line);
    }
  };

  proc.stdout?.on('data', onData);
  proc.stderr?.on('data', onData);

  proc.on('error', (err: Error) => {
    debugLog('output-collector:follow', `docker logs -f error for ${containerName}: ${err.message}`);
  });

  return {
    stop(): void {
      proc.kill();
    },
  };
}
