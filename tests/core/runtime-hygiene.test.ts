import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyRuntimeHygiene,
  planRuntimeHygiene,
} from '../../src/core/runtime-hygiene.js';

let root: string;
const now = new Date('2026-08-23T00:00:00.000Z');
const old = new Date('2026-01-01T00:00:00.000Z');

function write(relativePath: string, content: string): string {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  utimesSync(path, old, old);
  return path;
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'runtime-hygiene-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('unified runtime hygiene orchestration', () => {
  it('bounds a 10k synthetic inventory and produces deterministic counters and digest', () => {
    for (let index = 0; index < 10_000; index += 1) {
      write(`.deckent/runtime/evaluations/sprint-625/malformed-${String(index).padStart(5, '0')}.bin`, 'x');
    }
    const first = planRuntimeHygiene(root, { now, maxInventoryEntries: 10_000 });
    const second = planRuntimeHygiene(root, { now, maxInventoryEntries: 10_000 });
    expect(first.counters.evaluations).toMatchObject({ inventoryCount: 10_000, inventoryBytes: 10_000 });
    expect(first.planDigest).toBe(second.planDigest);

    write('.deckent/runtime/evaluations/sprint-625/overflow.bin', 'x');
    expect(() => planRuntimeHygiene(root, { now, maxInventoryEntries: 10_000 }))
      .toThrow('RUNTIME_HYGIENE_INVENTORY_LIMIT_EXCEEDED:10000');
  }, 30_000);

  it('composes archive/retire families and publishes a byte-stable FWW receipt', () => {
    const log = write('.deckent/runtime/telegram-bot.log', 'old bot output\n');
    const job = write('.deckent/runtime/jobs/job-1755900000001-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json', JSON.stringify({
      status: 'COMPLETE', jobId: 'old-job', completedAt: old.toISOString(),
    }));
    write('.deckent/runtime/jobs/job-1755900000002-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json', JSON.stringify({
      status: 'COMPLETE', jobId: 'anchor', completedAt: '2026-08-22T00:00:00.000Z',
    }));
    const plan = planRuntimeHygiene(root, {
      now,
      jobBounds: { max_age_days: 1, max_count: 1, max_size_mb: 1 },
      jobOwnership: view => view.identity === 'old-job' ? 'inactive' : 'unknown',
    });
    const first = applyRuntimeHygiene(plan);
    expect(first.receipt.status).toBe('complete');
    expect(existsSync(log)).toBe(false);
    expect(existsSync(job)).toBe(false);
    expect(first.receipt.outcomes.find(item => item.family === 'logs')).toMatchObject({ retired: 1 });
    expect(first.receipt.outcomes.find(item => item.family === 'jobs')).toMatchObject({ retired: 1 });
    const receiptPath = join(root, first.receiptPath);
    const bytes = readFileSync(receiptPath);

    const second = applyRuntimeHygiene(plan);
    expect(second.receiptState).toBe('existing');
    expect(readFileSync(receiptPath)).toEqual(bytes);
    expect(second.receipt).toEqual(first.receipt);
  });

  it('reports an injected family fault, preserves its bytes, and continues other families', () => {
    const job = write('.deckent/runtime/jobs/job-1755900000001-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json', JSON.stringify({
      status: 'COMPLETE', jobId: 'old-job', completedAt: old.toISOString(),
    }));
    write('.deckent/runtime/jobs/job-1755900000002-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json', JSON.stringify({
      status: 'COMPLETE', jobId: 'anchor', completedAt: '2026-08-22T00:00:00.000Z',
    }));
    const log = write('.deckent/runtime/telegram-bot.log', 'archive me\n');
    const plan = planRuntimeHygiene(root, {
      now,
      jobBounds: { max_age_days: 1, max_count: 1, max_size_mb: 1 },
      jobOwnership: view => view.identity === 'old-job' ? 'inactive' : 'unknown',
    });
    const result = applyRuntimeHygiene(plan, {
      beforeFamily: family => { if (family === 'jobs') throw new Error('injected fault'); },
    });
    expect(result.receipt.status).toBe('partial');
    expect(result.receipt.outcomes.find(item => item.family === 'jobs')?.failures)
      .toEqual(['jobs:injected fault']);
    expect(existsSync(job)).toBe(true);
    expect(readFileSync(job, 'utf8')).toContain('old-job');
    expect(existsSync(log)).toBe(false);
    expect(existsSync(join(root, result.receiptPath))).toBe(true);
  });

  it('fails the fresh authority check without archiving or retiring changed bytes', () => {
    const log = write('.deckent/runtime/telegram-bot.log', 'before\n');
    const plan = planRuntimeHygiene(root, { now });
    writeFileSync(log, 'after\n');
    const result = applyRuntimeHygiene(plan);
    expect(result.receipt.status).toBe('partial');
    expect(result.receipt.outcomes.find(item => item.family === 'logs')?.failures)
      .toEqual(['.deckent/runtime/telegram-bot.log:SOURCE_CHANGED']);
    expect(readFileSync(log, 'utf8')).toBe('after\n');
  });

  it('rejects any sprint listed in the current authority window', () => {
    write('.deckent/runtime/evaluations/sprint-625/625-001-attempt-1.json', 'evidence');
    expect(() => planRuntimeHygiene(root, {
      now, sprintIds: ['sprint-625'], currentSprintIds: ['sprint-625'],
    })).toThrow('RUNTIME_HYGIENE_CURRENT_SPRINT_MUTATION_REJECTED');
    expect(existsSync(join(root, '.deckent/runtime/evaluations/sprint-625/625-001-attempt-1.json'))).toBe(true);
  });
});
