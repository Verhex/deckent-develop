import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyRecentWorkRetention,
  planRecentWorkRetention,
} from '../../src/core/recent-work-retention.js';
import { reconcileSprintArchive, resolveSprintArchiveDir } from '../../src/core/sprint-archive.js';

let root: string;

function write(relativePath: string, bytes: string): string {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, bytes);
  return path;
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'recent-work-retention-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('lossless recent-work retirement', () => {
  it('retires an exact canonical phase5 duplicate only after verified manifest proof', () => {
    const live = write('.deckent/recently-works/sprint-610-phase5-staging.json', 'same-bytes');
    write('.deckent/archive/sprints/sprint-610/sprint-610-phase5-staging.json', 'same-bytes');
    reconcileSprintArchive(root, 'sprint-610', { apply: true, indexMemory: false });

    const plan = planRecentWorkRetention(root, 'sprint-610');
    expect(plan.retire).toEqual([expect.objectContaining({
      name: 'sprint-610-phase5-staging.json',
      kind: 'canonical-duplicate',
    })]);
    expect(existsSync(live)).toBe(true);

    const result = applyRecentWorkRetention(plan);
    expect(result).toMatchObject({ archiveVerified: true, failures: [] });
    expect(result.retired).toEqual(['.deckent/recently-works/sprint-610-phase5-staging.json']);
    expect(existsSync(live)).toBe(false);
  });

  it('HOLDs a phase5 file before publication and never confuses sprint-610 with sprint-611', () => {
    const owned = write('.deckent/recently-works/sprint-610-phase5-staging.json', 'owned');
    const foreign = write('.deckent/recently-works/sprint-611-phase5-staging.json', 'foreign');

    const plan = planRecentWorkRetention(root, 'sprint-610');
    expect(plan.retire).toEqual([]);
    expect(plan.hold).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'sprint-610-phase5-staging.json', reason: 'archive-proof-missing' }),
      expect.objectContaining({ name: 'sprint-611-phase5-staging.json', reason: 'foreign-sprint' }),
    ]));
    expect(existsSync(owned)).toBe(true);
    expect(existsSync(foreign)).toBe(true);
  });

  it('archives sprint-479 recovery-not-dispatched evidence before retiring the live bytes', () => {
    const live = write(
      '.deckent/recently-works/sprint-479-recovery-not-dispatched.json',
      '{"reason":"provider unavailable"}',
    );
    const plan = planRecentWorkRetention(root, 'sprint-479');
    expect(plan.retire).toEqual([expect.objectContaining({ kind: 'archive-then-retire' })]);
    expect(existsSync(live)).toBe(true);

    const result = applyRecentWorkRetention(plan);
    expect(result.failures).toEqual([]);
    expect(existsSync(live)).toBe(false);
    expect(readFileSync(
      join(resolveSprintArchiveDir(root, 'sprint-479'), 'sprint-479-recovery-not-dispatched.json'),
      'utf8',
    )).toBe('{"reason":"provider unavailable"}');
  });

  it('preserves conflicting recovery bytes as a manifested variant', () => {
    const live = write(
      '.deckent/recently-works/sprint-479-recovery-not-dispatched.json',
      'live-conflict',
    );
    const canonical = write(
      '.deckent/archive/sprints/sprint-479/sprint-479-recovery-not-dispatched.json',
      'prior-canonical',
    );

    const result = applyRecentWorkRetention(planRecentWorkRetention(root, 'sprint-479'));
    expect(result.failures).toEqual([]);
    expect(existsSync(live)).toBe(false);
    expect(readFileSync(canonical, 'utf8')).toBe('prior-canonical');
    const manifest = reconcileSprintArchive(root, 'sprint-479').manifest;
    const conflict = manifest.conflicts.find(item =>
      item.path === 'sprint-479-recovery-not-dispatched.json');
    expect(conflict?.variants).toHaveLength(2);
    expect(conflict?.variants.some(path =>
      readFileSync(join(resolveSprintArchiveDir(root, 'sprint-479'), path), 'utf8') === 'live-conflict'))
      .toBe(true);
  });

  it('HOLDs nested and unknown content and performs no directory-wide removal', () => {
    const nested = write('.deckent/recently-works/sprint-479-nested/evidence.json', 'nested');
    const unknown = write('.deckent/recently-works/sprint-479-future-family.bin', 'unknown');

    const plan = planRecentWorkRetention(root, 'sprint-479');
    expect(plan.retire).toEqual([]);
    expect(plan.hold).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'sprint-479-nested', reason: 'nested-content' }),
      expect.objectContaining({ name: 'sprint-479-future-family.bin', reason: 'unknown-content' }),
    ]));
    const result = applyRecentWorkRetention(plan);
    expect(result.retired).toEqual([]);
    expect(existsSync(nested)).toBe(true);
    expect(existsSync(unknown)).toBe(true);
  });

  it('keeps changed source bytes when applying a stale plan', () => {
    const live = write(
      '.deckent/recently-works/sprint-479-recovery-not-dispatched.json',
      'original',
    );
    const plan = planRecentWorkRetention(root, 'sprint-479');
    writeFileSync(live, 'changed-after-plan');

    const result = applyRecentWorkRetention(plan);
    expect(result.failures).toContain(
      '.deckent/recently-works/sprint-479-recovery-not-dispatched.json:SOURCE_CHANGED',
    );
    expect(readFileSync(live, 'utf8')).toBe('changed-after-plan');
  });
});
