import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { recordOutcome, readCellsSnapshot } from '../../src/core/routing/learning-cells.js';
import { BUILTIN_DOMAINS } from '../../src/core/routing/vocabulary-builtin.js';

/**
 * 673-002/007 wire pins (D1 catcher). The finalizer's V3 cells write now
 * (a) sources the domain from route-time `routingMeta.dominantDomain`,
 * (b) NEVER mints a fallback key, (c) lives outside the V2
 * `statsAlreadyRecorded` marker relying on learning-cells' own idempotency,
 * and (d) skips infra deaths. These pins exercise the ledger contract the
 * finalizer feeds — the exact drift class that let `core-runtime|*` keys
 * rot unread for 279 uses.
 */
describe('finalizer→learning-cells wire contract', () => {
  const root = () => {
    const r = mkdtempSync(join(tmpdir(), 'cells-wire-'));
    mkdirSync(join(r, '.deckent', 'stats'), { recursive: true });
    return r;
  };

  it('every written cell key carries a real vocabulary domain id (D1 catcher)', () => {
    const r = root();
    recordOutcome(r, { taskId: 't1', sprintId: 's1', workType: 'build',
      domain: 'core/runtime', agentId: 'implementer', verdict: 'DONE', quality: 80 });
    const file = readCellsSnapshot(r);
    const vocabularyIds = new Set(BUILTIN_DOMAINS.map((d) => d.id));
    const keys = Object.keys(file.cells);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const domainPart = key.split('|')[1]!;
      expect(vocabularyIds.has(domainPart), `${key} domain must be a vocabulary id`).toBe(true);
    }
  });

  it('is idempotent per (taskId, sprintId) — a re-finalize cannot double-count', () => {
    const r = root();
    const input = { taskId: 't1', sprintId: 's1', workType: 'build' as const,
      domain: 'core/runtime', agentId: 'implementer', verdict: 'DONE' as const, quality: 80 };
    recordOutcome(r, input);
    recordOutcome(r, input);
    const cell = readCellsSnapshot(r).cells['build|core/runtime|implementer'];
    expect(cell?.uses).toBe(1);
  });

  it('skips infra-classified failures entirely — no penalty, no reward, visible counter', () => {
    const r = root();
    recordOutcome(r, { taskId: 't1', sprintId: 's1', workType: 'build',
      domain: 'core/runtime', agentId: 'implementer', verdict: 'NO_GO', quality: 0,
      failureClass: 'oom' });
    const file = readCellsSnapshot(r);
    expect(Object.keys(file.cells)).toEqual([]);
    expect(file.skippedInfraOutcomes).toBe(1);
  });
});
