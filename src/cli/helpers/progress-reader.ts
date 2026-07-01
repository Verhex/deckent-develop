// ─── WLT-READ — progress-stream reader/aggregator (Sprint 355, Task 355-002) ──
//
// Reads `.tasks/task-<id>.progress.jsonl` (written by the WLT-EMIT worker-runner
// slice, Task 355-001, under ADR-G-025 §4 — WORKER-LIVE-TRACE) and aggregates,
// per worker, the last-N step events + a "what's happening now" summary.
//
// Shape is keyed by taskId — analogous to how run-state-feed.ts keys heartbeats
// by taskId — so a future consumer can merge this into LiveFooterState's
// worker-detail field without reshaping. This module never writes to
// run-state-feed.ts or any other feed; it only produces data.
//
// A missing directory, missing file, or empty file degrades to an absent/empty
// result, never a thrown error (same "file-absence -> honest idle" rule as
// run-state-feed.ts). A malformed line (invalid JSON, or valid JSON missing the
// required `step`/`ts` fields) is skipped and counted, never fatal.

import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';

// ─── fs seam ────────────────────────────────────────────────────────────────

export interface ProgressReaderFs {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  statSync(path: string): { size: number };
  openSync(path: string, flags: string): number;
  readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number): number;
  closeSync(fd: number): void;
}

const REAL_FS: ProgressReaderFs = {
  existsSync: (path) => existsSync(path),
  readdirSync: (path) => readdirSync(path),
  statSync: (path) => statSync(path),
  openSync: (path, flags) => openSync(path, flags),
  readSync: (fd, buffer, offset, length, position) => readSync(fd, buffer, offset, length, position),
  closeSync: (fd) => closeSync(fd),
};

// ─── Raw on-disk shape ──────────────────────────────────────────────────────
// Deliberately permissive beyond `step`/`ts`: the WLT-EMIT writer (Task 355-001)
// may land with a slightly different concrete shape — this reader must not
// throw or drop the whole file over a shape mismatch on optional fields.

interface RawProgressLine {
  ts?: unknown;
  step?: unknown;
  detail?: unknown;
  seq?: unknown;
}

// ─── Public types ───────────────────────────────────────────────────────────

export interface ProgressEvent {
  ts: string;
  step: string;
  detail?: string;
  seq?: number;
}

export interface WorkerProgressSummary {
  taskId: string;
  /** Last-N step events, oldest first. */
  recentSteps: ProgressEvent[];
  /** "şu an ne yapıyor" — derived from the newest valid step. */
  currentAction: string;
  /** Count of lines that failed to parse into a valid ProgressEvent, skipped. */
  corruptLineCount: number;
}

export interface ReadWorkerProgressOptions {
  /** Number of most-recent steps to keep per worker. Default 5 (matches the
   * `.slice(-5)` "recent activity" convention used elsewhere in cli/helpers). */
  tailSize?: number;
  /** Defaults to real node:fs. Inject a fake for hermetic tests. */
  fs?: ProgressReaderFs;
}

const DEFAULT_TAIL_SIZE = 5;
const PROGRESS_FILE_RE = /^task-(.+)\.progress\.jsonl$/;
const CHUNK_SIZE = 64 * 1024;
/** Extra raw lines fetched beyond tailSize so a few corrupt lines near EOF
 * don't starve the valid-event tail below tailSize. Still a small constant,
 * not the whole file — the read stays bounded either way. */
const TAIL_FETCH_MARGIN = 20;

// ─── Pure core: line parsing ────────────────────────────────────────────────

function parseLine(line: string): ProgressEvent | null {
  let raw: RawProgressLine;
  try {
    raw = JSON.parse(line) as RawProgressLine;
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  if (typeof raw.ts !== 'string' || typeof raw.step !== 'string') return null;

  const event: ProgressEvent = { ts: raw.ts, step: raw.step };
  if (typeof raw.detail === 'string') event.detail = raw.detail;
  if (typeof raw.seq === 'number') event.seq = raw.seq;
  return event;
}

function describeCurrentAction(event: ProgressEvent | undefined): string {
  if (!event) return '';
  return event.detail ? `${event.step}: ${event.detail}` : event.step;
}

/**
 * Pure — turns already-split raw lines into a WorkerProgressSummary, zero I/O.
 * Blank/whitespace-only lines (split artifacts, e.g. a trailing newline) are
 * silently dropped, not counted as corrupt. Anything else that fails to parse
 * into a valid ProgressEvent is counted as a corrupt line.
 */
export function summarizeProgressLines(taskId: string, lines: string[], tailSize: number = DEFAULT_TAIL_SIZE): WorkerProgressSummary {
  const events: ProgressEvent[] = [];
  let corruptLineCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') continue;
    const event = parseLine(line);
    if (event === null) {
      corruptLineCount++;
      continue;
    }
    events.push(event);
  }

  const recentSteps = events.slice(-tailSize);
  return {
    taskId,
    recentSteps,
    currentAction: describeCurrentAction(recentSteps[recentSteps.length - 1]),
    corruptLineCount,
  };
}

// ─── Efficient tail read ────────────────────────────────────────────────────

/**
 * Reads the last `maxLines` newline-separated lines of a file without loading
 * the whole file into memory: reads fixed-size chunks backwards from EOF,
 * prepending each chunk, until enough newlines have been seen (or start of
 * file is reached). Bytes read stay bounded by ~(maxLines * avg-line-length),
 * not the full file size — the point of "tail", not `readFileSync().split()`.
 */
function readLastLines(fs: ProgressReaderFs, filePath: string, maxLines: number): string[] {
  const size = fs.statSync(filePath).size;
  if (size === 0 || maxLines <= 0) return [];

  const fd = fs.openSync(filePath, 'r');
  try {
    let position = size;
    let accumulated = '';
    let newlineCount = 0;
    const buffer = Buffer.alloc(CHUNK_SIZE);

    while (position > 0 && newlineCount <= maxLines) {
      const readSize = Math.min(CHUNK_SIZE, position);
      position -= readSize;
      const bytesRead = fs.readSync(fd, buffer, 0, readSize, position);
      const chunkStr = buffer.toString('utf-8', 0, bytesRead);
      for (let i = 0; i < chunkStr.length; i++) {
        if (chunkStr.charCodeAt(i) === 10 /* \n */) newlineCount++;
      }
      accumulated = chunkStr + accumulated;
    }

    const rawLines = accumulated.split('\n');
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();
    return rawLines.slice(-maxLines);
  } finally {
    fs.closeSync(fd);
  }
}

// ─── fs-seam reader ─────────────────────────────────────────────────────────

/**
 * Scans `dir` for `task-<id>.progress.jsonl` files and returns a per-taskId
 * WorkerProgressSummary map. A missing `dir` yields an empty map, not an
 * error. Files that exist but are unreadable/empty are skipped honestly.
 */
export function readWorkerProgress(dir: string, options: ReadWorkerProgressOptions = {}): Record<string, WorkerProgressSummary> {
  const fs = options.fs ?? REAL_FS;
  const tailSize = options.tailSize ?? DEFAULT_TAIL_SIZE;
  const result: Record<string, WorkerProgressSummary> = {};

  if (!fs.existsSync(dir)) return result;

  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return result;
  }

  for (const file of files) {
    const match = PROGRESS_FILE_RE.exec(file);
    if (!match) continue;
    const taskId = match[1] as string;
    const filePath = join(dir, file);

    let lines: string[];
    try {
      lines = readLastLines(fs, filePath, tailSize + TAIL_FETCH_MARGIN);
    } catch {
      continue;
    }

    result[taskId] = summarizeProgressLines(taskId, lines, tailSize);
  }

  return result;
}
