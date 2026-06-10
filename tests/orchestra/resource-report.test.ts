import { describe, it, expect } from 'vitest';
import {
  parseResourceLog,
  summarizeByTask,
  summarizeSprint,
  formatBytes,
  type TaskResourceSummary,
  type SprintResourceSummary,
} from '../../src/orchestra/resource-report.js';
import type { ResourceSample } from '../../src/orchestra/resource-report.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeSample(overrides: Partial<ResourceSample> = {}): ResourceSample {
  return {
    ts: '2026-06-10T10:00:00.000Z',
    container: 'deckent-w-001-001',
    taskId: '001-001',
    memUsageBytes: 536_870_912, // 512 MB
    memLimitBytes: 4_294_967_296, // 4 GB
    memPerc: 12.5,
    cpuPerc: 25.0,
    netIO: '100MB / 50MB',
    blockIO: '0B / 0B',
    ...overrides,
  };
}

// ─── parseResourceLog ────────────────────────────────────────────────────

describe('parseResourceLog', () => {
  it('parses valid JSONL content into ResourceSample array', () => {
    const sample1 = makeSample({ ts: '2026-06-10T10:00:00.000Z', taskId: 'a' });
    const sample2 = makeSample({ ts: '2026-06-10T10:00:05.000Z', taskId: 'b' });
    const content = JSON.stringify(sample1) + '\n' + JSON.stringify(sample2) + '\n';

    const result = parseResourceLog(content);

    expect(result).toHaveLength(2);
    expect(result[0]!.taskId).toBe('a');
    expect(result[1]!.taskId).toBe('b');
  });

  it('skips malformed JSON lines silently', () => {
    const valid = makeSample({ taskId: 'good' });
    const content = JSON.stringify(valid) + '\n' + 'NOT_JSON\n' + '{ broken\n';

    const result = parseResourceLog(content);

    expect(result).toHaveLength(1);
    expect(result[0]!.taskId).toBe('good');
  });

  it('skips lines missing required ts or container fields', () => {
    const bad = { memUsageBytes: 1024 }; // no ts, no container
    const content = JSON.stringify(bad) + '\n';

    const result = parseResourceLog(content);

    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty string', () => {
    expect(parseResourceLog('')).toEqual([]);
  });

  it('handles trailing newlines and blank lines without error', () => {
    const valid = makeSample();
    const content = '\n' + JSON.stringify(valid) + '\n\n\n';

    const result = parseResourceLog(content);

    expect(result).toHaveLength(1);
  });
});

// ─── summarizeByTask ─────────────────────────────────────────────────────

describe('summarizeByTask', () => {
  it('computes peak and average mem for a single task', () => {
    const samples: ResourceSample[] = [
      makeSample({ memUsageBytes: 100, memPerc: 10, cpuPerc: 5, ts: '2026-06-10T10:00:00.000Z' }),
      makeSample({ memUsageBytes: 300, memPerc: 30, cpuPerc: 20, ts: '2026-06-10T10:00:05.000Z' }),
      makeSample({ memUsageBytes: 200, memPerc: 20, cpuPerc: 10, ts: '2026-06-10T10:00:10.000Z' }),
    ];

    const result = summarizeByTask(samples);

    expect(result).toHaveLength(1);
    const summary = result[0]!;
    expect(summary.peakMemBytes).toBe(300);
    expect(summary.avgMemBytes).toBeCloseTo((100 + 300 + 200) / 3);
    expect(summary.peakMemPerc).toBe(30);
    expect(summary.peakCpuPerc).toBe(20);
  });

  it('groups multiple tasks into separate summaries', () => {
    const samples: ResourceSample[] = [
      makeSample({ taskId: 'task-a', container: 'deckent-w-task-a', memUsageBytes: 100 }),
      makeSample({ taskId: 'task-b', container: 'deckent-w-task-b', memUsageBytes: 200 }),
      makeSample({ taskId: 'task-a', container: 'deckent-w-task-a', memUsageBytes: 150 }),
    ];

    const result = summarizeByTask(samples);

    expect(result).toHaveLength(2);
    const taskA = result.find((s) => s.taskId === 'task-a')!;
    const taskB = result.find((s) => s.taskId === 'task-b')!;
    expect(taskA.peakMemBytes).toBe(150);
    expect(taskB.peakMemBytes).toBe(200);
    expect(taskA.samples).toHaveLength(2);
  });

  it('computes durationMs from first and last ts', () => {
    const samples: ResourceSample[] = [
      makeSample({ ts: '2026-06-10T10:00:00.000Z' }),
      makeSample({ ts: '2026-06-10T10:00:30.000Z' }),
      makeSample({ ts: '2026-06-10T10:01:00.000Z' }),
    ];

    const result = summarizeByTask(samples);

    expect(result).toHaveLength(1);
    expect(result[0]!.durationMs).toBe(60_000); // 1 minute
    expect(result[0]!.firstTs).toBe('2026-06-10T10:00:00.000Z');
    expect(result[0]!.lastTs).toBe('2026-06-10T10:01:00.000Z');
  });

  it('returns empty array for empty samples', () => {
    expect(summarizeByTask([])).toEqual([]);
  });
});

// ─── summarizeSprint ─────────────────────────────────────────────────────

describe('summarizeSprint', () => {
  it('returns zeroed summary for empty samples', () => {
    const result = summarizeSprint([]);

    expect(result.peakConcurrentMemBytes).toBe(0);
    expect(result.peakConcurrentMemPerc).toBe(0);
    expect(result.totalContainers).toBe(0);
  });

  it('sums concurrent container mem in the same ts window', () => {
    const ts = '2026-06-10T10:00:00.000Z';
    const samples: ResourceSample[] = [
      makeSample({ ts, container: 'deckent-w-001', taskId: '001', memUsageBytes: 200_000_000 }),
      makeSample({ ts, container: 'deckent-w-002', taskId: '002', memUsageBytes: 300_000_000 }),
    ];

    const result = summarizeSprint(samples);

    expect(result.peakConcurrentMemBytes).toBe(500_000_000);
    expect(result.totalContainers).toBe(2);
  });

  it('returns max concurrent peak across multiple time windows', () => {
    const ts1 = '2026-06-10T10:00:00.000Z';
    const ts2 = '2026-06-10T10:00:05.000Z';
    const samples: ResourceSample[] = [
      // window 1: sum = 200MB + 100MB = 300MB
      makeSample({ ts: ts1, container: 'deckent-w-001', taskId: '001', memUsageBytes: 200_000_000 }),
      makeSample({ ts: ts1, container: 'deckent-w-002', taskId: '002', memUsageBytes: 100_000_000 }),
      // window 2: sum = 400MB + 250MB = 650MB (higher)
      makeSample({ ts: ts2, container: 'deckent-w-001', taskId: '001', memUsageBytes: 400_000_000 }),
      makeSample({ ts: ts2, container: 'deckent-w-002', taskId: '002', memUsageBytes: 250_000_000 }),
    ];

    const result = summarizeSprint(samples);

    expect(result.peakConcurrentMemBytes).toBe(650_000_000);
    expect(result.totalContainers).toBe(2);
  });

  it('counts unique containers correctly', () => {
    const ts1 = '2026-06-10T10:00:00.000Z';
    const ts2 = '2026-06-10T10:00:05.000Z';
    // same containers appear in both windows — should count 3 unique
    const samples: ResourceSample[] = [
      makeSample({ ts: ts1, container: 'deckent-w-001', taskId: '001' }),
      makeSample({ ts: ts1, container: 'deckent-w-002', taskId: '002' }),
      makeSample({ ts: ts2, container: 'deckent-w-001', taskId: '001' }),
      makeSample({ ts: ts2, container: 'deckent-w-003', taskId: '003' }),
    ];

    const result = summarizeSprint(samples);

    expect(result.totalContainers).toBe(3);
  });
});

// ─── formatBytes ─────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats bytes below 1 KB as B', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats KB range', () => {
    expect(formatBytes(1_024)).toBe('1.00 KB');
    expect(formatBytes(2_048)).toBe('2.00 KB');
  });

  it('formats MB range', () => {
    expect(formatBytes(1_048_576)).toBe('1.00 MB');
    expect(formatBytes(536_870_912)).toBe('512.00 MB');
  });

  it('formats GB range', () => {
    expect(formatBytes(1_073_741_824)).toBe('1.00 GB');
    expect(formatBytes(4_294_967_296)).toBe('4.00 GB');
  });
});
