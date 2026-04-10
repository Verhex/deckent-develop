// ═══ Local Observability ═══════════════════════════════════════════
// Lightweight, local-only observability for Deckent sprints.
// Data locality hard contract: ZERO network calls, all output to
// .deckent/metrics.jsonl (append-only, line-delimited JSON).
// Sprint 134 — Task 011

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ErrorRegistry } from './errors.js';

// ─── Types ───────────────────────────────────────────────────────

export interface MetricEntry {
  type: 'metric';
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: string;
}

export interface TraceEntry {
  type: 'trace';
  operation: string;
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

export interface LogEntry {
  type: 'log';
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  msg: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

export type ObservabilityEntry = MetricEntry | TraceEntry | LogEntry;

export interface LoadReportSection {
  operation: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

// ─── Constants ───────────────────────────────────────────────────

const METRICS_FILENAME = 'metrics.jsonl';
const METRICS_DIR = '.deckent';

/** Data locality: telemetry is ALWAYS disabled. No network calls ever. */
export const TELEMETRY_ENABLED = false;

// ─── Internal State ──────────────────────────────────────────────

let _projectRoot: string | null = null;

/**
 * Initialize observability with a project root.
 * Must be called before metric/trace/structuredLog if you want file output.
 * If not called, entries are silently discarded (safe no-op for tests/CLI).
 */
export function initObservability(projectRoot: string): void {
  _projectRoot = projectRoot;
}

/**
 * Reset observability state (for testing).
 */
export function resetObservability(): void {
  _projectRoot = null;
}

/**
 * Get the metrics file path for a given project root.
 */
export function getMetricsPath(projectRoot?: string): string {
  const root = projectRoot ?? _projectRoot;
  if (!root) throw ErrorRegistry.createError('DECKENT_E054');
  return join(root, METRICS_DIR, METRICS_FILENAME);
}

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Record a metric (counter/gauge). Appends a single JSON line to .deckent/metrics.jsonl.
 * Safe to call without initialization — silently discards if not initialized.
 */
export function metric(name: string, value: number, tags?: Record<string, string>): void {
  const entry: MetricEntry = {
    type: 'metric',
    name,
    value,
    ...(tags && Object.keys(tags).length > 0 ? { tags } : {}),
    timestamp: new Date().toISOString(),
  };
  appendEntry(entry);
}

/**
 * Trace an async operation. Wraps a function with timing using hrtime.bigint().
 * Records duration and success/failure to metrics file.
 * Returns the function's result (or re-throws its error after recording).
 */
export async function trace<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const start = process.hrtime.bigint();
  let success = true;
  let errorMsg: string | undefined;
  try {
    const result = await fn();
    return result;
  } catch (err: unknown) {
    success = false;
    errorMsg = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const entry: TraceEntry = {
      type: 'trace',
      operation,
      durationMs: Math.round(durationMs * 100) / 100,
      success,
      ...(errorMsg ? { error: errorMsg } : {}),
      timestamp: new Date().toISOString(),
    };
    appendEntry(entry);
  }
}

/**
 * Structured log output in pino-compatible JSON format.
 * Appends to .deckent/metrics.jsonl alongside metrics and traces.
 */
export function structuredLog(
  level: LogEntry['level'],
  msg: string,
  context?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    type: 'log',
    level,
    msg,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
    timestamp: new Date().toISOString(),
  };
  appendEntry(entry);
}

// ─── Report Generation ───────────────────────────────────────────

/**
 * Generate a load report from .deckent/metrics.jsonl.
 * Reads all entries, groups metrics by operation name, and computes
 * p50/p95/p99 percentiles for each.
 * Returns a markdown-formatted report string.
 */
export async function generateLoadReport(projectRoot?: string): Promise<string> {
  const root = projectRoot ?? _projectRoot;
  if (!root) return '# Load Report\n\nObservability not initialized.\n';

  const metricsPath = getMetricsPath(root);
  if (!existsSync(metricsPath)) {
    return '# Load Report\n\nNo metrics data found.\n';
  }

  const raw = readFileSync(metricsPath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);

  const entries: ObservabilityEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as ObservabilityEntry);
    } catch {
      // skip malformed lines
    }
  }

  if (entries.length === 0) {
    return '# Load Report\n\nNo parseable entries found.\n';
  }

  // Separate metrics and traces
  const metrics = entries.filter((e): e is MetricEntry => e.type === 'metric');
  const traces = entries.filter((e): e is TraceEntry => e.type === 'trace');

  // Group metrics by name for percentile calculation
  const metricGroups = new Map<string, number[]>();
  for (const m of metrics) {
    const values = metricGroups.get(m.name) ?? [];
    values.push(m.value);
    metricGroups.set(m.name, values);
  }

  // Group traces by operation for percentile calculation
  const traceGroups = new Map<string, number[]>();
  for (const t of traces) {
    const durations = traceGroups.get(t.operation) ?? [];
    durations.push(t.durationMs);
    traceGroups.set(t.operation, durations);
  }

  // Build report sections
  const sections: LoadReportSection[] = [];

  for (const [name, values] of metricGroups) {
    if (values.length === 0) continue;
    values.sort((a, b) => a - b);
    sections.push({
      operation: name,
      count: values.length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      p99: percentile(values, 99),
      min: values[0]!,
      max: values[values.length - 1]!,
    });
  }

  for (const [op, durations] of traceGroups) {
    if (durations.length === 0) continue;
    durations.sort((a, b) => a - b);
    sections.push({
      operation: `trace:${op}`,
      count: durations.length,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      min: durations[0]!,
      max: durations[durations.length - 1]!,
    });
  }

  // Build wave timeline from wave.start metrics
  const waveMetrics = metrics
    .filter(m => m.name === 'wave.start')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Build file lock histogram from lock-related metrics
  const lockMetrics = metrics.filter(m => m.name.includes('lock'));
  const lockBuckets = buildHistogramBuckets(lockMetrics.map(m => m.value));

  // Generate markdown
  const report = buildMarkdownReport(sections, waveMetrics, lockBuckets, entries.length);
  return report;
}

// ─── Percentile & Histogram Helpers ──────────────────────────────

/**
 * Calculate the p-th percentile of a sorted array of numbers.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0]!;
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower]!;
  const fraction = index - lower;
  return sortedValues[lower]! + fraction * (sortedValues[upper]! - sortedValues[lower]!);
}

/**
 * Build histogram buckets for a set of values.
 * Default buckets: [0, 10, 50, 100, 500, 1000, 5000, Infinity]
 */
export function buildHistogramBuckets(
  values: number[],
  boundaries: number[] = [0, 10, 50, 100, 500, 1000, 5000],
): Map<string, number> {
  const buckets = new Map<string, number>();
  const allBounds = [...boundaries, Infinity];
  const lastBoundary = boundaries[boundaries.length - 1] ?? 0;

  const bucketLabel = (i: number): string => {
    if (i === 0) return `<=${allBounds[0] ?? 0}`;
    if ((allBounds[i] ?? 0) === Infinity) return `>${lastBoundary}`;
    return `${boundaries[i - 1] ?? 0}-${allBounds[i] ?? 0}`;
  };

  // Initialize buckets
  for (let i = 0; i < allBounds.length; i++) {
    buckets.set(bucketLabel(i), 0);
  }

  // Distribute values into buckets
  for (const v of values) {
    let placed = false;
    for (let i = 0; i < allBounds.length; i++) {
      if (v <= (allBounds[i] ?? Infinity)) {
        const label = bucketLabel(i);
        buckets.set(label, (buckets.get(label) ?? 0) + 1);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const lastLabel = `>${lastBoundary}`;
      buckets.set(lastLabel, (buckets.get(lastLabel) ?? 0) + 1);
    }
  }

  return buckets;
}

// ─── Markdown Report Builder ─────────────────────────────────────

function buildMarkdownReport(
  sections: LoadReportSection[],
  waveMetrics: MetricEntry[],
  lockBuckets: Map<string, number>,
  totalEntries: number,
): string {
  const lines: string[] = [];

  lines.push('# Sprint Load Test Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total entries: ${totalEntries}`);
  lines.push('');

  // Wave Timeline
  lines.push('## Wave Timeline');
  lines.push('');
  if (waveMetrics.length > 0) {
    lines.push('| Time | Wave | Count |');
    lines.push('|------|------|-------|');
    for (const wm of waveMetrics) {
      lines.push(`| ${wm.timestamp} | ${wm.tags?.['wave'] ?? 'N/A'} | ${wm.tags?.['count'] ?? 'N/A'} |`);
    }
  } else {
    lines.push('No wave data recorded.');
  }
  lines.push('');

  // Percentile Table
  lines.push('## Percentile Distribution (p50/p95/p99)');
  lines.push('');
  lines.push('| Operation | Count | p50 | p95 | p99 | Min | Max |');
  lines.push('|-----------|-------|-----|-----|-----|-----|-----|');
  for (const s of sections) {
    lines.push(`| ${s.operation} | ${s.count} | ${s.p50.toFixed(2)} | ${s.p95.toFixed(2)} | ${s.p99.toFixed(2)} | ${s.min.toFixed(2)} | ${s.max.toFixed(2)} |`);
  }
  lines.push('');

  // File Lock Histogram
  lines.push('## File Lock Histogram');
  lines.push('');
  if (lockBuckets.size > 0) {
    lines.push('| Bucket (ms) | Count |');
    lines.push('|-------------|-------|');
    for (const [label, count] of lockBuckets) {
      lines.push(`| ${label} | ${count} |`);
    }
  } else {
    lines.push('No file lock data recorded.');
  }
  lines.push('');

  // Critical Path Analysis
  lines.push('## Critical Path Analysis');
  lines.push('');
  if (sections.length > 0) {
    const sorted = [...sections].sort((a, b) => b.p99 - a.p99);
    const critical = sorted.slice(0, 5);
    lines.push('Top 5 slowest operations by p99:');
    lines.push('');
    for (let i = 0; i < critical.length; i++) {
      const c = critical[i]!;
      lines.push(`${i + 1}. **${c.operation}** — p99: ${c.p99.toFixed(2)}ms (${c.count} samples)`);
    }
  } else {
    lines.push('No operation data for critical path analysis.');
  }
  lines.push('');

  return lines.join('\n');
}

// ─── Internal Helpers ────────────────────────────────────────────

/**
 * Append a single JSON entry to the metrics file.
 * Silently discards if observability is not initialized.
 */
function appendEntry(entry: ObservabilityEntry): void {
  if (!_projectRoot) return;

  try {
    const metricsPath = getMetricsPath(_projectRoot);
    const dir = dirname(metricsPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(metricsPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Silent failure — observability should never break the sprint
  }
}
