// ─── Resource Report ────────────────────────────────────────────────────────
// Pure analysis functions for resource log data produced by resource-monitor.
// No I/O — callers read the log file and pass the content string.

import type { ResourceSample } from './resource-monitor.js';

export type { ResourceSample };

// ─── Types ────────────────────────────────────────────────────────────────

export interface TaskResourceSummary {
  taskId: string;
  container: string;
  samples: ResourceSample[];
  peakMemBytes: number;
  avgMemBytes: number;
  peakMemPerc: number;
  peakCpuPerc: number;
  firstTs: string;
  lastTs: string;
  durationMs: number;
}

export interface SprintResourceSummary {
  /** Max sum of memUsageBytes across all concurrent containers in any single tick window. */
  peakConcurrentMemBytes: number;
  /** Max average memPerc across containers in any single tick window. */
  peakConcurrentMemPerc: number;
  /** Total unique containers observed. */
  totalContainers: number;
}

// ─── Parse ────────────────────────────────────────────────────────────────

/**
 * Parse a JSONL resource log string into ResourceSample objects.
 * Malformed or empty lines are silently skipped.
 */
export function parseResourceLog(content: string): ResourceSample[] {
  const samples: ResourceSample[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as ResourceSample;
      // Basic shape validation — ts and container are required
      if (typeof parsed.ts === 'string' && typeof parsed.container === 'string') {
        samples.push(parsed);
      }
    } catch {
      // skip malformed lines
    }
  }
  return samples;
}

// ─── Summarize by task ────────────────────────────────────────────────────

/**
 * Group samples by taskId and compute per-task peak/avg resource usage.
 * Returns one summary entry per unique taskId (using the first container name seen).
 */
export function summarizeByTask(samples: ResourceSample[]): TaskResourceSummary[] {
  const groups = new Map<string, ResourceSample[]>();

  for (const sample of samples) {
    const existing = groups.get(sample.taskId);
    if (existing) {
      existing.push(sample);
    } else {
      groups.set(sample.taskId, [sample]);
    }
  }

  const summaries: TaskResourceSummary[] = [];

  for (const [taskId, taskSamples] of groups) {
    let peakMemBytes = 0;
    let peakMemPerc = 0;
    let peakCpuPerc = 0;
    let totalMemBytes = 0;
    let firstTs = taskSamples[0]!.ts;
    let lastTs = taskSamples[0]!.ts;

    for (const s of taskSamples) {
      if (s.memUsageBytes > peakMemBytes) peakMemBytes = s.memUsageBytes;
      if (s.memPerc > peakMemPerc) peakMemPerc = s.memPerc;
      if (s.cpuPerc > peakCpuPerc) peakCpuPerc = s.cpuPerc;
      totalMemBytes += s.memUsageBytes;
      if (s.ts < firstTs) firstTs = s.ts;
      if (s.ts > lastTs) lastTs = s.ts;
    }

    const avgMemBytes = taskSamples.length > 0 ? totalMemBytes / taskSamples.length : 0;
    const firstMs = Date.parse(firstTs);
    const lastMs = Date.parse(lastTs);
    const durationMs = Number.isFinite(firstMs) && Number.isFinite(lastMs) ? lastMs - firstMs : 0;

    summaries.push({
      taskId,
      container: taskSamples[0]!.container,
      samples: taskSamples,
      peakMemBytes,
      avgMemBytes,
      peakMemPerc,
      peakCpuPerc,
      firstTs,
      lastTs,
      durationMs,
    });
  }

  return summaries;
}

// ─── Summarize sprint ─────────────────────────────────────────────────────

/**
 * Compute the peak concurrent resource usage across all containers in any single tick window.
 * Concurrent peak = max sum of memUsageBytes for containers sharing the same ts timestamp.
 * This represents the system memory ceiling — critical for capacity planning.
 */
export function summarizeSprint(samples: ResourceSample[]): SprintResourceSummary {
  if (samples.length === 0) {
    return { peakConcurrentMemBytes: 0, peakConcurrentMemPerc: 0, totalContainers: 0 };
  }

  // Group by ts window (exact ts match = same docker stats tick)
  const windows = new Map<string, ResourceSample[]>();
  const containers = new Set<string>();

  for (const sample of samples) {
    containers.add(sample.container);
    const existing = windows.get(sample.ts);
    if (existing) {
      existing.push(sample);
    } else {
      windows.set(sample.ts, [sample]);
    }
  }

  let peakConcurrentMemBytes = 0;
  let peakConcurrentMemPerc = 0;

  for (const windowSamples of windows.values()) {
    let windowMemSum = 0;
    let windowPercSum = 0;

    for (const s of windowSamples) {
      windowMemSum += s.memUsageBytes;
      windowPercSum += s.memPerc;
    }

    const windowAvgPerc = windowSamples.length > 0 ? windowPercSum / windowSamples.length : 0;

    if (windowMemSum > peakConcurrentMemBytes) peakConcurrentMemBytes = windowMemSum;
    if (windowAvgPerc > peakConcurrentMemPerc) peakConcurrentMemPerc = windowAvgPerc;
  }

  return {
    peakConcurrentMemBytes,
    peakConcurrentMemPerc,
    totalContainers: containers.size,
  };
}

// ─── Format helpers ───────────────────────────────────────────────────────

const GB = 1_073_741_824;
const MB = 1_048_576;
const KB = 1_024;

/**
 * Format a byte count as a human-readable string (GB / MB / KB / B).
 */
export function formatBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(2)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(2)} MB`;
  if (n >= KB) return `${(n / KB).toFixed(2)} KB`;
  return `${n} B`;
}
