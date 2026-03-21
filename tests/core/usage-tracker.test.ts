import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UsageTracker } from '../../src/core/usage-tracker.js';

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `usage-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('UsageTracker', () => {
  let tmpRoot: string;
  let tracker: UsageTracker;

  beforeEach(() => {
    tmpRoot = makeTmpDir();
    tracker = new UsageTracker(tmpRoot);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  // ─── recordCall ──────────────────────────────────────────────────────────

  it('recordCall creates usage directory if missing', () => {
    tracker.recordCall('opus', 1000, 'task-001', 'sprint-001');
    expect(existsSync(join(tmpRoot, '.deckent', 'usage'))).toBe(true);
  });

  it('recordCall creates sprint JSON file', () => {
    tracker.recordCall('opus', 1000, 'task-001', 'sprint-001');
    expect(existsSync(join(tmpRoot, '.deckent', 'usage', 'sprint-001.json'))).toBe(true);
  });

  it('recordCall stores model correctly', () => {
    tracker.recordCall('sonnet', 500, 'task-001', 'sprint-001');
    const usage = tracker.getSprintUsage('sprint-001');
    const entry = usage.entries[0];
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('sonnet');
  });

  it('recordCall stores tokenEstimate correctly', () => {
    tracker.recordCall('haiku', 250, 'task-001', 'sprint-001');
    const usage = tracker.getSprintUsage('sprint-001');
    const entry = usage.entries[0];
    expect(entry).toBeDefined();
    expect(entry!.tokenEstimate).toBe(250);
  });

  it('recordCall stores taskId correctly', () => {
    tracker.recordCall('opus', 1000, 'task-042', 'sprint-001');
    const usage = tracker.getSprintUsage('sprint-001');
    const entry = usage.entries[0];
    expect(entry).toBeDefined();
    expect(entry!.taskId).toBe('task-042');
  });

  it('recordCall stores valid ISO timestamp', () => {
    tracker.recordCall('opus', 1000, 'task-001', 'sprint-001');
    const usage = tracker.getSprintUsage('sprint-001');
    const entry = usage.entries[0];
    expect(entry).toBeDefined();
    const ts = entry!.timestamp;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('recordCall accumulates multiple entries in same sprint', () => {
    tracker.recordCall('opus', 1000, 'task-001', 'sprint-001');
    tracker.recordCall('sonnet', 500, 'task-002', 'sprint-001');
    tracker.recordCall('haiku', 100, 'task-003', 'sprint-001');
    const usage = tracker.getSprintUsage('sprint-001');
    expect(usage.entries).toHaveLength(3);
  });

  it('recordCall uses "default" sprint when no sprintId given', () => {
    tracker.recordCall('opus', 1000, 'task-001');
    const usage = tracker.getSprintUsage('default');
    expect(usage.totalCalls).toBe(1);
  });

  it('recordCall separates entries by sprint', () => {
    tracker.recordCall('opus', 1000, 'task-001', 'sprint-001');
    tracker.recordCall('sonnet', 500, 'task-002', 'sprint-002');
    expect(tracker.getSprintUsage('sprint-001').totalCalls).toBe(1);
    expect(tracker.getSprintUsage('sprint-002').totalCalls).toBe(1);
  });

  // ─── getSprintUsage ──────────────────────────────────────────────────────

  it('getSprintUsage returns empty data for missing sprint', () => {
    const usage = tracker.getSprintUsage('nonexistent');
    expect(usage.totalCalls).toBe(0);
    expect(usage.totalTokens).toBe(0);
    expect(usage.entries).toHaveLength(0);
    expect(usage.modelBreakdown).toHaveLength(0);
  });

  it('getSprintUsage returns correct sprintId', () => {
    tracker.recordCall('opus', 100, 'task-001', 'sprint-007');
    const usage = tracker.getSprintUsage('sprint-007');
    expect(usage.sprintId).toBe('sprint-007');
  });

  it('getSprintUsage totalCalls matches entry count', () => {
    tracker.recordCall('opus', 100, 'task-001', 'sprint-001');
    tracker.recordCall('opus', 200, 'task-002', 'sprint-001');
    const usage = tracker.getSprintUsage('sprint-001');
    expect(usage.totalCalls).toBe(2);
  });

  it('getSprintUsage totalTokens sums all token estimates', () => {
    tracker.recordCall('opus', 1000, 'task-001', 'sprint-001');
    tracker.recordCall('sonnet', 500, 'task-002', 'sprint-001');
    const usage = tracker.getSprintUsage('sprint-001');
    expect(usage.totalTokens).toBe(1500);
  });

  it('getSprintUsage totalTokens is 0 for empty sprint', () => {
    const usage = tracker.getSprintUsage('missing');
    expect(usage.totalTokens).toBe(0);
  });

  // ─── modelBreakdown ───────────────────────────────────────────────────────

  it('modelBreakdown groups calls and tokens by model', () => {
    tracker.recordCall('opus', 1000, 'task-001', 'sprint-001');
    tracker.recordCall('opus', 2000, 'task-002', 'sprint-001');
    tracker.recordCall('sonnet', 500, 'task-003', 'sprint-001');
    const { modelBreakdown } = tracker.getSprintUsage('sprint-001');
    const opus = modelBreakdown.find((m) => m.model === 'opus');
    const sonnet = modelBreakdown.find((m) => m.model === 'sonnet');
    expect(opus?.calls).toBe(2);
    expect(opus?.tokens).toBe(3000);
    expect(sonnet?.calls).toBe(1);
    expect(sonnet?.tokens).toBe(500);
  });

  it('modelBreakdown covers all three model types', () => {
    tracker.recordCall('opus', 100, 'task-001', 'sprint-001');
    tracker.recordCall('sonnet', 200, 'task-002', 'sprint-001');
    tracker.recordCall('haiku', 300, 'task-003', 'sprint-001');
    const { modelBreakdown } = tracker.getSprintUsage('sprint-001');
    const models = modelBreakdown.map((m) => m.model).sort();
    expect(models).toEqual(['haiku', 'opus', 'sonnet']);
  });

  it('getModelBreakdown aggregates across all sprints', () => {
    tracker.recordCall('opus', 1000, 'task-001', 'sprint-001');
    tracker.recordCall('opus', 2000, 'task-002', 'sprint-002');
    const breakdown = tracker.getModelBreakdown();
    const opus = breakdown.find((m) => m.model === 'opus');
    expect(opus?.calls).toBe(2);
    expect(opus?.tokens).toBe(3000);
  });

  it('getModelBreakdown returns empty array when no data', () => {
    expect(tracker.getModelBreakdown()).toEqual([]);
  });

  // ─── getTotalUsage ────────────────────────────────────────────────────────

  it('getTotalUsage totalCalls sums entries from all sprints', () => {
    tracker.recordCall('opus', 100, 'task-001', 'sprint-001');
    tracker.recordCall('sonnet', 200, 'task-002', 'sprint-002');
    tracker.recordCall('haiku', 300, 'task-003', 'sprint-003');
    expect(tracker.getTotalUsage().totalCalls).toBe(3);
  });

  it('getTotalUsage totalTokens sums all sprints', () => {
    tracker.recordCall('opus', 1000, 'task-001', 'sprint-001');
    tracker.recordCall('sonnet', 2000, 'task-002', 'sprint-002');
    expect(tracker.getTotalUsage().totalTokens).toBe(3000);
  });

  it('getTotalUsage sprintCount reflects file count', () => {
    tracker.recordCall('opus', 100, 'task-001', 'sprint-001');
    tracker.recordCall('sonnet', 200, 'task-002', 'sprint-002');
    expect(tracker.getTotalUsage().sprintCount).toBe(2);
  });

  it('getTotalUsage returns zeros when no data', () => {
    const total = tracker.getTotalUsage();
    expect(total.totalCalls).toBe(0);
    expect(total.totalTokens).toBe(0);
    expect(total.sprintCount).toBe(0);
    expect(total.modelBreakdown).toEqual([]);
  });

  // ─── listSprints ──────────────────────────────────────────────────────────

  it('listSprints returns all recorded sprint IDs', () => {
    tracker.recordCall('opus', 100, 'task-001', 'sprint-001');
    tracker.recordCall('sonnet', 200, 'task-002', 'sprint-002');
    const sprints = tracker.listSprints().sort();
    expect(sprints).toEqual(['sprint-001', 'sprint-002']);
  });

  it('listSprints returns empty array when no data', () => {
    expect(tracker.listSprints()).toEqual([]);
  });

  it('listSprints strips .json extension from results', () => {
    tracker.recordCall('opus', 100, 'task-001', 'sprint-001');
    const sprints = tracker.listSprints();
    expect(sprints.every((s) => !s.endsWith('.json'))).toBe(true);
  });

  // ─── Error resilience ─────────────────────────────────────────────────────

  it('getSprintUsage handles corrupted JSON gracefully', () => {
    const usageDir = join(tmpRoot, '.deckent', 'usage');
    mkdirSync(usageDir, { recursive: true });
    writeFileSync(join(usageDir, 'corrupted.json'), 'not-valid-json');
    const usage = tracker.getSprintUsage('corrupted');
    expect(usage.totalCalls).toBe(0);
    expect(usage.entries).toHaveLength(0);
  });

  it('getSprintUsage handles non-array JSON gracefully', () => {
    const usageDir = join(tmpRoot, '.deckent', 'usage');
    mkdirSync(usageDir, { recursive: true });
    writeFileSync(join(usageDir, 'bad-format.json'), JSON.stringify({ not: 'an-array' }));
    const usage = tracker.getSprintUsage('bad-format');
    expect(usage.entries).toHaveLength(0);
  });

  it('getTotalUsage handles corrupted sprint files without throwing', () => {
    const usageDir = join(tmpRoot, '.deckent', 'usage');
    mkdirSync(usageDir, { recursive: true });
    writeFileSync(join(usageDir, 'sprint-bad.json'), 'INVALID');
    expect(() => tracker.getTotalUsage()).not.toThrow();
  });

  it('multiple recordCall calls persist across tracker instances', () => {
    tracker.recordCall('opus', 500, 'task-001', 'sprint-001');
    tracker.recordCall('haiku', 100, 'task-002', 'sprint-001');

    // New tracker instance pointing to same root
    const tracker2 = new UsageTracker(tmpRoot);
    const usage = tracker2.getSprintUsage('sprint-001');
    expect(usage.totalCalls).toBe(2);
    expect(usage.totalTokens).toBe(600);
  });
});
