/**
 * Host RAM Detection — Sprint 194 Task 194-005 (W-M M-3 carry-over).
 *
 * `os.totalmem()` is sufficient on bare-metal Linux and macOS but is
 * surprising on WSL2: the value returned reflects what the WSL VM was
 * provisioned with, which may not match what the user expects when sizing
 * `max_workers`. `/proc/meminfo`'s `MemTotal:` line is the same source the
 * kernel exposes to every Linux process and is the authoritative reading
 * for "RAM available to a worker process on this host". When `/proc/meminfo`
 * cannot be read (non-Linux, restricted filesystem, etc.) we fall back to
 * `os.totalmem()`.
 *
 * This module is intentionally tiny — see `system-profile.ts` and
 * `system-capacity.ts` for the broader-scope helpers that compose CPU + RAM
 * + Docker probes. Host-detector is single-purpose so it can be unit-tested
 * against fixture content without touching the real /proc.
 */

import { readFileSync } from 'node:fs';
import { totalmem } from 'node:os';

/** Outcome of {@link detectHostMemory}. */
export interface HostMemoryDetection {
  /** Total host RAM in GB, rounded to one decimal. */
  totalGB: number;
  /** Which source produced the reading — useful for `doctor --memory` output. */
  source: 'meminfo' | 'os.totalmem';
}

/** Path to the Linux meminfo pseudo-file. Exposed as a constant for tests. */
export const PROC_MEMINFO_PATH = '/proc/meminfo';

/**
 * Parse a `/proc/meminfo` body and return the `MemTotal` value in GB.
 * Returns `null` when the line is missing or unreadable so the caller can
 * fall back. The `MemTotal:` line is always expressed in kB (the trailing
 * `kB` unit suffix is a kernel convention, not real kibibytes — it is
 * 1024-byte kilobytes, which the man page documents).
 *
 * Exposed for direct testing without touching the real /proc.
 */
export function parseMemTotalKB(meminfoContent: string): number | null {
  const match = meminfoContent.match(/^MemTotal:\s+(\d+)\s+kB/m);
  if (!match || !match[1]) return null;
  const kb = parseInt(match[1], 10);
  if (!Number.isFinite(kb) || kb <= 0) return null;
  return kb;
}

/**
 * Read total host RAM, preferring `/proc/meminfo` on Linux/WSL2 and falling
 * back to `os.totalmem()` everywhere else. Returns the value in GB rounded
 * to one decimal place so the output is friendly for human-facing CLI
 * messages without losing meaningful precision.
 *
 * The function is synchronous and never throws — callers that hit a denied
 * read or non-Linux host transparently receive the `os.totalmem()` reading.
 */
export function detectHostMemory(): HostMemoryDetection {
  try {
    const body = readFileSync(PROC_MEMINFO_PATH, 'utf-8');
    const kb = parseMemTotalKB(body);
    if (kb !== null) {
      const totalGB = Math.round((kb * 1024) / 1e9 * 10) / 10;
      return { totalGB, source: 'meminfo' };
    }
  } catch {
    // /proc/meminfo unreadable (non-Linux, permission denied, sandbox) —
    // fall through to os.totalmem().
  }
  const totalBytes = totalmem();
  return {
    totalGB: Math.round((totalBytes / 1e9) * 10) / 10,
    source: 'os.totalmem',
  };
}

/** Default per-worker RAM budget — matches `worker_memory_limit: "2g"` (task 194-003). */
export const DEFAULT_WORKER_MEM_GB = 2;
/** Minimum recommendation — at least one worker must always be allowed. */
export const MIN_MAX_WORKERS = 1;
/** Upper safety cap — beyond 16 workers OS / Docker overhead dominates and benefits diminish. */
export const MAX_MAX_WORKERS = 16;

/**
 * Suggest a `max_workers` value from total host RAM. The formula is
 * `floor(totalGB / workerMemGB) - 1`, reserving 1 GB-worth of headroom for
 * the host (Brain, Auditor, OS pagecache). Result is clamped to
 * `[MIN_MAX_WORKERS, MAX_MAX_WORKERS]` so callers get a usable number
 * regardless of input pathology (e.g. 0.5 GB host, 1 TB host).
 *
 * The defaults (`workerMemGB = 2`) line up with the Sprint 194 / task
 * 194-003 docker memory budget. Pass a different value to model VDS / VPS
 * sizing experiments.
 */
export function suggestMaxWorkers(totalGB: number, workerMemGB: number = DEFAULT_WORKER_MEM_GB): number {
  if (!Number.isFinite(totalGB) || totalGB <= 0) return MIN_MAX_WORKERS;
  if (!Number.isFinite(workerMemGB) || workerMemGB <= 0) return MIN_MAX_WORKERS;
  const raw = Math.floor(totalGB / workerMemGB) - 1;
  if (raw < MIN_MAX_WORKERS) return MIN_MAX_WORKERS;
  if (raw > MAX_MAX_WORKERS) return MAX_MAX_WORKERS;
  return raw;
}
