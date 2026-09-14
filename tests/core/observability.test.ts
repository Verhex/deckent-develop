import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import {
  metric,
  trace,
  structuredLog,
  generateLoadReport,
  initObservability,
  resetObservability,
  getMetricsPath,
  percentile,
  buildHistogramBuckets,
  TELEMETRY_ENABLED,
  setObservabilitySprintId,
} from '../../src/core/observability.js';

import type {
  MetricEntry,
  TraceEntry,
  LogEntry,
} from '../../src/core/observability.js';

import {
  resolveRotationMaxBytes,
  rotateMetricsFile,
  listArchives,
} from '../../src/core/observability-rotation.js';

// 744-002 / 747-001: hermetic, call-through spies used to prove the
// size-trigger ingress amortizes configured-ceiling checks and that a rotation
// failure never escapes to the caller. Every other export keeps its real implementation — only these
// named bindings become vi.fn wrappers.
vi.mock('../../src/core/observability-rotation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/observability-rotation.js')>();
  return {
    ...actual,
    resolveRotationMaxBytes: vi.fn(actual.resolveRotationMaxBytes),
    rotateMetricsFile: vi.fn(actual.rotateMetricsFile),
  };
});

// Use a temp directory for test isolation
const TEST_ROOT = join(process.cwd(), '.test-observability-' + process.pid);
const METRICS_PATH = join(TEST_ROOT, '.deckent', 'metrics.jsonl');

function readMetricsLines(): string[] {
  if (!existsSync(METRICS_PATH)) return [];
  return readFileSync(METRICS_PATH, 'utf-8').split('\n').filter(l => l.trim().length > 0);
}

function parseMetricsEntries(): Array<MetricEntry | TraceEntry | LogEntry> {
  return readMetricsLines().map(l => JSON.parse(l));
}

beforeEach(() => {
  mkdirSync(join(TEST_ROOT, '.deckent'), { recursive: true });
  initObservability(TEST_ROOT);
});

afterEach(() => {
  resetObservability();
  try {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  } catch {
    // cleanup best effort
  }
});

// ═══ Test 1: metric roundtrip ═══════════════════════════════════
describe('metric()', () => {
  it('should write a metric entry and read it back correctly', () => {
    metric('test.counter', 42, { env: 'test' });

    const lines = readMetricsLines();
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]) as MetricEntry;
    expect(entry.type).toBe('metric');
    expect(entry.name).toBe('test.counter');
    expect(entry.value).toBe(42);
    expect(entry.tags).toEqual({ env: 'test' });
    expect(entry.timestamp).toBeTruthy();
  });

  it('should append multiple metrics (append-only)', () => {
    metric('a', 1);
    metric('b', 2);
    metric('c', 3);

    const lines = readMetricsLines();
    expect(lines).toHaveLength(3);

    const entries = lines.map(l => JSON.parse(l) as MetricEntry);
    expect(entries[0].name).toBe('a');
    expect(entries[1].name).toBe('b');
    expect(entries[2].name).toBe('c');
  });

  it('should silently discard when not initialized', () => {
    resetObservability();
    metric('dropped', 99);
    // No file written, no error thrown
    expect(existsSync(METRICS_PATH)).toBe(false);
  });

  it('should omit tags when empty or undefined', () => {
    metric('no.tags', 5);

    const entry = JSON.parse(readMetricsLines()[0]) as MetricEntry;
    expect(entry.tags).toBeUndefined();
  });
});

// ═══ Test 2: trace span start/end + exception capture ═══════════
describe('trace()', () => {
  it('should measure duration and record success', async () => {
    const result = await trace('test.op', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'hello';
    });

    expect(result).toBe('hello');

    const entries = parseMetricsEntries();
    expect(entries).toHaveLength(1);

    const traceEntry = entries[0] as TraceEntry;
    expect(traceEntry.type).toBe('trace');
    expect(traceEntry.operation).toBe('test.op');
    expect(traceEntry.success).toBe(true);
    expect(traceEntry.durationMs).toBeGreaterThan(0);
    expect(traceEntry.error).toBeUndefined();
  });

  it('should capture error on exception and re-throw', async () => {
    const err = new Error('boom');

    await expect(
      trace('failing.op', async () => {
        throw err;
      }),
    ).rejects.toThrow('boom');

    const entries = parseMetricsEntries();
    expect(entries).toHaveLength(1);

    const traceEntry = entries[0] as TraceEntry;
    expect(traceEntry.type).toBe('trace');
    expect(traceEntry.success).toBe(false);
    expect(traceEntry.error).toBe('boom');
    expect(traceEntry.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ═══ Test 3: structuredLog JSON format ══════════════════════════
describe('structuredLog()', () => {
  it('should write pino-compatible JSON log entry', () => {
    structuredLog('info', 'Sprint started', { sprintId: 'sprint-134' });

    const entries = parseMetricsEntries();
    expect(entries).toHaveLength(1);

    const logEntry = entries[0] as LogEntry;
    expect(logEntry.type).toBe('log');
    expect(logEntry.level).toBe('info');
    expect(logEntry.msg).toBe('Sprint started');
    expect(logEntry.context).toEqual({ sprintId: 'sprint-134' });
    expect(logEntry.timestamp).toBeTruthy();
  });

  it('should support all log levels', () => {
    const levels = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
    for (const level of levels) {
      structuredLog(level, `test ${level}`);
    }

    const entries = parseMetricsEntries();
    expect(entries).toHaveLength(5);
    for (let i = 0; i < levels.length; i++) {
      expect((entries[i] as LogEntry).level).toBe(levels[i]);
    }
  });
});

// ═══ Test 4: append-only line-delimited ═════════════════════════
describe('JSONL format', () => {
  it('should produce valid line-delimited JSON', () => {
    metric('m1', 10);
    structuredLog('info', 'log1');
    metric('m2', 20);

    const raw = readFileSync(METRICS_PATH, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim().length > 0);

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    // Each line ends with newline
    expect(raw.endsWith('\n')).toBe(true);
  });
});

// ═══ Test 5: data locality — no network calls ══════════════════
describe('data locality', () => {
  it('should have TELEMETRY_ENABLED hard-coded to false', () => {
    expect(TELEMETRY_ENABLED).toBe(false);
  });

  it('should not import or call net.connect', async () => {
    // Verify that observability module does not make network calls
    // by checking that the module source doesn't import 'net', 'http', or 'https'
    const modulePath = join(process.cwd(), 'src', 'core', 'observability.ts');
    const source = readFileSync(modulePath, 'utf-8');

    expect(source).not.toContain("import.*from 'node:net'");
    expect(source).not.toContain("import.*from 'node:http'");
    expect(source).not.toContain("import.*from 'node:https'");
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('net.connect');
    expect(source).not.toContain('http.request');
  });

  it('should only write to local filesystem', () => {
    metric('local.only', 1);
    structuredLog('info', 'local log');

    // Verify file exists at expected local path
    expect(existsSync(METRICS_PATH)).toBe(true);
    const content = readFileSync(METRICS_PATH, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });
});

// ═══ Test 6: generateLoadReport happy path ═════════════════════
describe('generateLoadReport()', () => {
  it('should generate markdown report from metrics data', async () => {
    // Write sample data
    metric('eval.duration_ms', 50, { taskId: '001' });
    metric('eval.duration_ms', 100, { taskId: '002' });
    metric('eval.duration_ms', 150, { taskId: '003' });
    metric('wave.start', 0, { wave: 'wave-1', count: '3' });

    const report = await generateLoadReport(TEST_ROOT);

    expect(report).toContain('# Sprint Load Test Report');
    expect(report).toContain('## Wave Timeline');
    expect(report).toContain('## Percentile Distribution');
    expect(report).toContain('eval.duration_ms');
    expect(report).toContain('wave-1');
    expect(report).toContain('## Critical Path Analysis');
  });

  it('should return placeholder when no metrics file exists', async () => {
    // Remove the metrics file
    try { unlinkSync(METRICS_PATH); } catch { /* ok */ }

    const report = await generateLoadReport(TEST_ROOT);
    expect(report).toContain('No metrics data found');
  });
});

// ═══ Test 7: spawnWorkers instrument integration ════════════════
describe('instrument integration', () => {
  it('should record wave.start metric format correctly', () => {
    // Simulate what spawnWorkers would emit
    metric('wave.start', 0, { wave: 'dep-pipeline', count: '4' });

    const entries = parseMetricsEntries();
    const waveEntry = entries[0] as MetricEntry;
    expect(waveEntry.name).toBe('wave.start');
    expect(waveEntry.tags?.wave).toBe('dep-pipeline');
    expect(waveEntry.tags?.count).toBe('4');
  });
});

// ═══ Test 8: wave.transition metric (T-001 dogfood) ═════════════
describe('wave.transition metric', () => {
  it('should record wave transition events', () => {
    // Simulate respawnEligibleTasks wave transition
    metric('wave.transition', 125, { from_wave: 'dep-wait', to_wave: 'wave-3' });

    const entries = parseMetricsEntries();
    const transition = entries[0] as MetricEntry;
    expect(transition.name).toBe('wave.transition');
    expect(transition.value).toBe(125);
    expect(transition.tags?.from_wave).toBe('dep-wait');
    expect(transition.tags?.to_wave).toBe('wave-3');
  });
});

// ═══ Test 9: p50/p95/p99 calculation with 100 samples ══════════
describe('percentile()', () => {
  it('should calculate p50/p95/p99 correctly for 100 samples', () => {
    // Generate 100 samples: 1, 2, 3, ..., 100
    const values = Array.from({ length: 100 }, (_, i) => i + 1);

    const p50 = percentile(values, 50);
    const p95 = percentile(values, 95);
    const p99 = percentile(values, 99);

    // p50 of 1..100 should be ~50.5
    expect(p50).toBeCloseTo(50.5, 0);
    // p95 should be ~95.05
    expect(p95).toBeCloseTo(95.05, 0);
    // p99 should be ~99.01
    expect(p99).toBeCloseTo(99.01, 0);
  });

  it('should handle single element', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  it('should handle empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('should handle two elements', () => {
    const p50 = percentile([10, 20], 50);
    expect(p50).toBe(15); // midpoint
  });
});

// ═══ Test 10: file lock histogram bucket distribution ═══════════
describe('buildHistogramBuckets()', () => {
  it('should distribute values into correct buckets', () => {
    const values = [0, 5, 15, 55, 99, 100, 150, 600, 1500, 6000];
    const buckets = buildHistogramBuckets(values);

    // Check that all values are accounted for
    let total = 0;
    for (const count of buckets.values()) {
      total += count;
    }
    expect(total).toBe(values.length);

    // <=0 bucket should have 1 value (0)
    expect(buckets.get('<=0')).toBe(1);
    // 0-10 bucket should have 1 value (5)
    expect(buckets.get('0-10')).toBe(1);
    // 10-50 bucket should have 1 value (15)
    expect(buckets.get('10-50')).toBe(1);
    // 50-100 bucket should have 3 values (55, 99, 100) — v<=100 inclusive
    expect(buckets.get('50-100')).toBe(3);
    // 100-500 bucket should have 1 value (150) — 100 goes to 50-100 bucket
    expect(buckets.get('100-500')).toBe(1);
    // 500-1000 bucket should have 1 value (600)
    expect(buckets.get('500-1000')).toBe(1);
    // 1000-5000 bucket should have 1 value (1500)
    expect(buckets.get('1000-5000')).toBe(1);
    // >5000 bucket should have 1 value (6000)
    expect(buckets.get('>5000')).toBe(1);
  });

  it('should handle empty values', () => {
    const buckets = buildHistogramBuckets([]);
    let total = 0;
    for (const count of buckets.values()) {
      total += count;
    }
    expect(total).toBe(0);
  });
});

// ═══ Test 11: eval.duration_ms metric format ════════════════════
describe('eval.duration_ms metric', () => {
  it('should record per-task evaluation duration', () => {
    // Simulate what evaluateResult would emit
    metric('eval.duration_ms', 35, { taskId: '134-001' });
    metric('eval.duration_ms', 22, { taskId: '134-002' });

    const entries = parseMetricsEntries();
    expect(entries).toHaveLength(2);
    expect((entries[0] as MetricEntry).name).toBe('eval.duration_ms');
    expect((entries[0] as MetricEntry).tags?.taskId).toBe('134-001');
    expect((entries[1] as MetricEntry).tags?.taskId).toBe('134-002');
  });
});

// ═══ Test 12: getMetricsPath ════════════════════════════════════
describe('getMetricsPath()', () => {
  it('should return correct path for project root', () => {
    const path = getMetricsPath(TEST_ROOT);
    expect(path).toBe(join(TEST_ROOT, '.deckent', 'metrics.jsonl'));
  });

  it('should throw when no root is available', () => {
    resetObservability();
    expect(() => getMetricsPath()).toThrow(/DECKENT_E054|observability not initialized/i);
  });
});

// ═══ 744-002: size-triggered rotation wired into the writer ingress ═══
// Rotation authority existed but no production write path
// called them — rotation only ever happened at sprint finalize. These tests
// prove the append path (`metric()`, which every writer funnels through)
// amortizes configured size checks and rotates without waiting for finalize, and
// that a rotation failure can never lose a metric write or throw to the
// caller. The suppression latch is cleared by initObservability/
// resetObservability (747-001), so test order no longer matters.
describe('size-triggered rotation ingress (744-002 / 747-001)', () => {
  it('amortizes configured size-ceiling checks via the resolved policy', () => {
    const policySpy = vi.mocked(resolveRotationMaxBytes);
    policySpy.mockClear();

    for (let i = 0; i < 20; i++) {
      metric('ceiling.per.append.test', i, { i: String(i) });
    }

    // The writer queries the existing resolver at observed-byte gates, not on
    // every append. No threshold is supplied by the ingress.
    expect(policySpy.mock.calls.length).toBeGreaterThan(0);
    expect(policySpy.mock.calls.length).toBeLessThan(20);
    for (const call of policySpy.mock.calls) {
      expect(call[0]).toBe(TEST_ROOT);
      // No ceiling literal is passed at the ingress: the value is resolved
      // from effective configuration inside the canonical resolver.
      expect(call[1]).toBeUndefined();
    }
    // The writes themselves still happened.
    expect(readMetricsLines()).toHaveLength(20);
  });

  it('evaluates the ceiling BEFORE the record is written', () => {
    const linesSeenAtCheck: number[] = [];
    vi.mocked(resolveRotationMaxBytes).mockImplementationOnce(() => {
      linesSeenAtCheck.push(readMetricsLines().length);
      return Number.MAX_SAFE_INTEGER;
    });

    metric('ordering.probe', 3);

    // The ceiling saw the PRE-append state — the record was not yet on
    // disk when the ceiling was evaluated.
    expect(linesSeenAtCheck).toEqual([0]);
    expect(readMetricsLines()).toHaveLength(1);
  });

  it('rotates once the configured size ceiling is crossed, without waiting for sprint finalize', () => {
    writeFileSync(
      join(TEST_ROOT, '.deckent', 'config.json'),
      JSON.stringify({ observability: { rotation: { maxSizeMB: 0.001 } } }),
      'utf-8',
    );
    setObservabilitySprintId('sprint-744002');

    expect(listArchives(TEST_ROOT)).toHaveLength(0);

    // ~0.001MB (≈1KB) ceiling; a couple dozen small entries reliably cross
    // it via the plain `metric()` ingress — no finalize/sprint-controller
    // code is imported or invoked anywhere in this test.
    for (let i = 0; i < 30; i++) {
      metric('size.trigger.test', i, { i: String(i) });
    }

    const archives = listArchives(TEST_ROOT);
    expect(archives.length).toBeGreaterThan(0);
    expect(archives[0]).toMatch(/metrics-[0-9a-f]{16}\.jsonl\.gz$/);
  });

  it('recovers from a transient rotation failure in the same session without losing or duplicating records', () => {
    vi.mocked(resolveRotationMaxBytes).mockClear();
    writeFileSync(
      join(TEST_ROOT, '.deckent', 'config.json'),
      JSON.stringify({ observability: { rotation: { maxSizeMB: 0.001 } } }),
      'utf-8',
    );
    setObservabilitySprintId('sprint-744003');

    // Seed a file over the actual configured ceiling. The failure uses the
    // real policy resolver, so retries prove production behavior rather than a
    // perpetual-due mock.
    writeFileSync(METRICS_PATH, `{"type":"metric","name":"seed","value":0,"tags":{"payload":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},"timestamp":"2026-09-12T18:53:02.199Z"}\n`, 'utf-8');
    vi.mocked(rotateMetricsFile).mockImplementationOnce(() => {
      throw new Error('simulated rotation failure');
    });

    expect(() => {
      for (let i = 0; i < 20; i++) {
        metric('failure.isolation.test', i, { i: String(i) });
      }
    }).not.toThrow();

    expect(vi.mocked(rotateMetricsFile).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(vi.mocked(resolveRotationMaxBytes).mock.calls.length).toBeLessThan(20);

    const persistedNames = [
      ...readMetricsLines(),
      ...listArchives(TEST_ROOT).flatMap(path => gunzipSync(readFileSync(path)).toString('utf-8').split('\n').filter(Boolean)),
    ].map(line => (JSON.parse(line) as MetricEntry).name);
    expect(persistedNames.filter(name => name === 'failure.isolation.test')).toHaveLength(20);

    // The caller keeps working after a rotation failure — the failure never
    // breaks subsequent telemetry writes.
    expect(() => metric('after.failure', 1)).not.toThrow();
    const namesAfterRecovery = [
      ...readMetricsLines(),
      ...listArchives(TEST_ROOT).flatMap(path => gunzipSync(readFileSync(path)).toString('utf-8').split('\n').filter(Boolean)),
    ].map(line => (JSON.parse(line) as MetricEntry).name);
    expect(namesAfterRecovery.filter(name => name === 'after.failure')).toHaveLength(1);
  });
});
