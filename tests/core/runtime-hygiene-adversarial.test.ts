import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyRuntimeHygiene,
  planRuntimeHygiene,
  type RuntimeHygienePlan,
} from '../../src/core/runtime-hygiene.js';

const now = new Date('2026-08-23T00:00:00.000Z');
const old = new Date('2026-01-01T00:00:00.000Z');
const bounds = { max_age_days: 1, max_count: 1, max_size_mb: 1 } as const;
let root: string;
let outside: string;

function write(relativePath: string, bytes: string): string {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  utimesSync(absolute, old, old);
  return absolute;
}

function job(name: string, record: Readonly<Record<string, unknown>>): string {
  return write(`.deckent/runtime/jobs/${name}`, `${JSON.stringify(record)}\n`);
}

function oldJobPlan(ownership: 'inactive' | 'unknown' = 'inactive'): RuntimeHygienePlan {
  job('job-1755900000001-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json', {
    status: 'COMPLETE', jobId: 'old-job', completedAt: old.toISOString(), pid: 4242, tenantId: 'tenant-a',
  });
  job('job-1755900000002-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json', {
    status: 'COMPLETE', jobId: 'anchor', completedAt: '2026-08-22T00:00:00.000Z',
  });
  return planRuntimeHygiene(root, { now, jobBounds: bounds, jobOwnership: () => ownership });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'runtime-hygiene-adversarial-'));
  outside = mkdtempSync(join(tmpdir(), 'runtime-hygiene-outside-'));
});

afterEach(() => {
  chmodSync(root, 0o700);
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('runtime hygiene adversarial filesystem and liveness assurance', () => {
  it('does not follow symlink or hardlink escape candidates', () => {
    const external = join(outside, 'authority.log');
    writeFileSync(external, 'outside authority\n');
    utimesSync(external, old, old);
    mkdirSync(join(root, '.deckent/runtime'), { recursive: true });
    symlinkSync(external, join(root, '.deckent/runtime/symlink-bot.log'));
    linkSync(external, join(root, '.deckent/runtime/hardlink-bot.log'));

    const plan = planRuntimeHygiene(root, { now });

    expect(plan.authority.map(item => item.source)).not.toContain('.deckent/runtime/symlink-bot.log');
    expect(plan.authority.map(item => item.source)).not.toContain('.deckent/runtime/hardlink-bot.log');
    expect(readFileSync(external, 'utf8')).toBe('outside authority\n');
  });

  it('HOLDs a path swap after the fresh authority check without touching either target', () => {
    const source = write('.deckent/runtime/telegram-bot.log', 'planned bytes\n');
    const replacement = join(outside, 'replacement.log');
    writeFileSync(replacement, 'foreign bytes\n');
    const plan = planRuntimeHygiene(root, { now });

    const result = applyRuntimeHygiene(plan, { beforeFamily: family => {
      if (family === 'logs') {
        unlinkSync(source);
        symlinkSync(replacement, source);
      }
    } });

    expect(result.receipt.status).toBe('partial');
    expect(result.receipt.outcomes.find(item => item.family === 'logs')?.retired).toBe(0);
    expect(readFileSync(replacement, 'utf8')).toBe('foreign bytes\n');
    expect(readFileSync(source, 'utf8')).toBe('foreign bytes\n');
  });

  it('HOLDs a concurrent writer and preserves the writer\'s complete new bytes', () => {
    const source = write('.deckent/runtime/telegram-bot.log', 'before\n');
    const plan = planRuntimeHygiene(root, { now });
    const result = applyRuntimeHygiene(plan, { beforeFamily: family => {
      if (family === 'logs') writeFileSync(source, 'after-from-writer\n');
    } });

    expect(result.receipt.status).toBe('partial');
    expect(result.receipt.outcomes.find(item => item.family === 'logs')?.failures.join('\n'))
      .toContain('SOURCE_CHANGED');
    expect(readFileSync(source, 'utf8')).toBe('after-from-writer\n');
  });

  it('HOLDs malformed JSON, recycled PID evidence, and a foreign tenant record', () => {
    const malformed = write(
      '.deckent/runtime/jobs/job-1755900000000-00000000-0000-0000-0000-000000000000.json',
      '{not-json',
    );
    const plan = oldJobPlan('unknown');

    expect(plan.jobs?.hold).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: expect.stringContaining('00000000'), reason: 'invalid-record' }),
      expect.objectContaining({ source: expect.stringContaining('aaaaaaaa'), reason: 'live-or-unknown-owner' }),
    ]));
    expect(plan.jobs?.retire).toHaveLength(0);
    expect(readFileSync(malformed, 'utf8')).toBe('{not-json');
    expect(readFileSync(join(root, '.deckent/runtime/jobs/job-1755900000001-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json'), 'utf8'))
      .toContain('tenant-a');
  });

  it('rejects plan tampering before any source mutation', () => {
    const source = write('.deckent/runtime/telegram-bot.log', 'original\n');
    const plan = planRuntimeHygiene(root, { now });
    const tampered = { ...plan, maxApplyItems: plan.maxApplyItems + 1 };

    expect(() => applyRuntimeHygiene(tampered)).toThrow('RUNTIME_HYGIENE_PLAN_DIGEST_INVALID');
    expect(readFileSync(source, 'utf8')).toBe('original\n');
  });

  it('treats malformed/conflicting first-writer receipt JSON as a pre-apply HOLD', () => {
    const source = write('.deckent/runtime/telegram-bot.log', 'original\n');
    const plan = planRuntimeHygiene(root, { now });
    const receipt = join(root, plan.receiptRoot, `${plan.planDigest}.json`);
    mkdirSync(dirname(receipt), { recursive: true });
    writeFileSync(receipt, '{malformed');

    expect(() => applyRuntimeHygiene(plan)).toThrow();
    expect(readFileSync(receipt, 'utf8')).toBe('{malformed');
    expect(readFileSync(source, 'utf8')).toBe('original\n');
  });

  it('HOLDs an archive destination fault and neither overwrites it nor retires source bytes', () => {
    const source = write('.deckent/runtime/telegram-bot.log', 'original\n');
    const obstruction = write('.deckent/blocked-archive', 'do not overwrite\n');
    const plan = planRuntimeHygiene(root, { now, logs: { archiveRoot: '.deckent/blocked-archive' } });
    const result = applyRuntimeHygiene(plan);

    expect(result.receipt.status).toBe('partial');
    expect(result.receipt.outcomes.find(item => item.family === 'logs')?.retired).toBe(0);
    expect(readFileSync(obstruction, 'utf8')).toBe('do not overwrite\n');
    expect(readFileSync(source, 'utf8')).toBe('original\n');
  });

  it('publishes an interrupted-apply receipt and a retry cannot overwrite it or retire held bytes', () => {
    const plan = oldJobPlan();
    const source = join(root, '.deckent/runtime/jobs/job-1755900000001-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json');
    const first = applyRuntimeHygiene(plan, { beforeFamily: family => {
      if (family === 'jobs') throw new Error('simulated interruption');
    } });
    const receiptPath = join(root, first.receiptPath);
    const originalReceipt = readFileSync(receiptPath);

    const retry = applyRuntimeHygiene(plan);

    expect(first.receipt.status).toBe('partial');
    expect(retry.receiptState).toBe('existing');
    expect(readFileSync(receiptPath)).toEqual(originalReceipt);
    expect(existsSync(source)).toBe(true);
    expect(readFileSync(source, 'utf8')).toContain('old-job');
  });
});
