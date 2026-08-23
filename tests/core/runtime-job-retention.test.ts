import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyRuntimeJobRetention,
  planRuntimeJobRetention,
  type RuntimeJobRecordView,
} from '../../src/core/runtime-job-retention.js';

let root: string;
const now = Date.parse('2026-08-23T00:00:00Z');
const bounds = { max_age_days: 7, max_count: 20, max_size_mb: 20 };

function job(name: string, record: Record<string, unknown>, ageDays: number): string {
  const path = join(root, '.deckent/runtime/jobs', name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record)}\n`);
  const time = new Date(now - ageDays * 86_400_000);
  utimesSync(path, time, time);
  return path;
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'runtime-job-retention-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('runtime job retention', () => {
  it('archives then retires old terminal records while retaining the latest identity view', () => {
    const old = job('sprint-625.json', { status: 'COMPLETE', sprintId: 'sprint-625', completedAt: '2026-08-01T00:00:00Z' }, 22);
    const latest = job('job-1755900000000-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json', { status: 'COMPLETE', sprintId: 'sprint-625', completedAt: '2026-08-22T00:00:00Z' }, 1);
    const plan = planRuntimeJobRetention(root, { bounds, now: () => now, ownership: () => 'inactive' });
    expect(plan.retire.map(item => item.fileName)).toEqual(['sprint-625.json']);
    expect(plan.retain.map(item => item.fileName)).toContain('job-1755900000000-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json');

    const result = applyRuntimeJobRetention(plan);
    expect(result.failures).toEqual([]);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(latest)).toBe(true);
    expect(readFileSync(join(root, result.publications[0]!.contentPath), 'utf8')).toContain('COMPLETE');
  });

  it.each(['live', 'unknown'] as const)('never retires RUNNING records with %s ownership', ownership => {
    const path = job('sprint-1234567890123.json', { status: 'RUNNING', jobId: 'legacy-session' }, 40);
    const plan = planRuntimeJobRetention(root, { bounds: { ...bounds, max_count: 1 }, now: () => now, ownership: () => ownership });
    expect(plan.retire).toEqual([]);
    expect(plan.hold).toContainEqual(expect.objectContaining({ reason: 'active-or-nonterminal' }));
    expect(applyRuntimeJobRetention(plan).retired).toEqual([]);
    expect(existsSync(path)).toBe(true);
  });

  it('does not let a terminal status string authorize deletion without inactive ownership', () => {
    job('sprint-701.json', { status: 'FAILED', sprintId: 'sprint-701' }, 50);
    job('job-1755900000001-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json', { status: 'COMPLETE', sprintId: 'sprint-701' }, 1);
    const plan = planRuntimeJobRetention(root, { bounds, now: () => now });
    expect(plan.retire).toEqual([]);
    expect(plan.hold).toContainEqual(expect.objectContaining({ fileName: 'sprint-701.json', reason: 'live-or-unknown-owner' }));
  });

  it('supports current, legacy detached, and real sprint namespaces in archive lineage', () => {
    job('job-1755900000002-cccccccc-cccc-cccc-cccc-cccccccccccc.json', { status: 'COMPLETE', jobId: 'generic-a' }, 30);
    job('sprint-1234567890124.json', { status: 'FAILED', jobId: 'generic-b' }, 30);
    job('sprint-88.json', { status: 'COMPLETE', sprintId: 'sprint-88' }, 30);
    const plan = planRuntimeJobRetention(root, { bounds: { ...bounds, max_count: 1 }, now: () => now, ownership: () => 'inactive' });
    expect([...plan.retire, ...plan.retain].map(item => [item.identity, item.namespace])).toEqual(expect.arrayContaining([
      ['generic-a', 'current-job'], ['generic-b', 'legacy-job'], ['sprint-88', 'sprint'],
    ]));
    expect(plan.retain).toHaveLength(1);
    expect(plan.retire).toHaveLength(2);
  });

  it('uses count pressure only against independently inactive terminal records', () => {
    const names = [
      ['sprint-900.json', { status: 'RUNNING', sprintId: 'sprint-900' }, 20],
      ['job-1755900000003-dddddddd-dddd-dddd-dddd-dddddddddddd.json', { status: 'COMPLETE', sprintId: 'sprint-901' }, 20],
      ['job-1755900000004-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.json', { status: 'COMPLETE', sprintId: 'sprint-901' }, 1],
    ] as const;
    for (const [name, record, age] of names) job(name, record, age);
    const ownership = (view: RuntimeJobRecordView) => view.identity === 'sprint-901' ? 'inactive' as const : 'unknown' as const;
    const plan = planRuntimeJobRetention(root, { bounds: { max_age_days: 365, max_count: 1, max_size_mb: 20 }, now: () => now, ownership });
    expect(plan.retire.map(item => item.fileName)).toEqual(['job-1755900000003-dddddddd-dddd-dddd-dddd-dddddddddddd.json']);
    expect(plan.retain.some(item => item.status === 'RUNNING')).toBe(true);
  });
});
