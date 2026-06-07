import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeReactiveIngester } from '../../../../src/orchestra/autonomous/reactive/reactive-ingester.js';
import { loadBacklog } from '../../../../src/orchestra/autonomous/backlog.js';
import type { ReactiveMapFile } from '../../../../src/orchestra/autonomous/reactive/reactive-types.js';
import type { ReactiveEvent } from '../../../../src/orchestra/autonomous/reactive/reactive-types.js';

const map: ReactiveMapFile = { _version: '1.0', rules: [{
  match: { groupKey: 'debt_trend', minRisk: 'medium' },
  entryTemplate: { kind: 'task', policy: 'approval-required', spec: { description: 'Review debt' } },
  dedupKey: 'debt_trend',
}]};
const ev: ReactiveEvent = { sourceType: 'nervous', risk: 'high', groupKey: 'debt_trend' };

describe('reactive-ingester', () => {
  let dir: string; let backlogPath: string; let n: number;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ring-')); backlogPath = join(dir, 'backlog.json'); n = 0; });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const ingester = () => makeReactiveIngester({ backlogPath, map, idGen: () => `rx-${++n}` });

  it('ingest on match writes a pending reactive entry', () => {
    expect(ingester().ingest(ev)).toBe('written');
    const bl = loadBacklog(backlogPath);
    expect(bl.entries).toHaveLength(1);
    expect(bl.entries[0]!.trigger).toEqual({ type: 'reactive', detector: 'debt_trend' });
    expect(bl.entries[0]!.status).toBe('pending');
  });
  it('ingest with no matching rule returns unmatched, writes nothing', () => {
    expect(ingester().ingest({ ...ev, groupKey: 'nope' })).toBe('unmatched');
    expect(loadBacklog(backlogPath).entries).toHaveLength(0);
  });
  it('ingest dedups against an existing pending reactive entry with the same key', () => {
    const ing = ingester();
    expect(ing.ingest(ev)).toBe('written');
    expect(ing.ingest(ev)).toBe('deduped');
    expect(loadBacklog(backlogPath).entries).toHaveLength(1);
  });
  it('ingest preserves existing unrelated entries (atomic append)', () => {
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [
      { id: 'keep', title: 't', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null },
    ]}));
    expect(ingester().ingest(ev)).toBe('written');
    const ids = loadBacklog(backlogPath).entries.map(e => e.id);
    expect(ids).toContain('keep');
    expect(ids).toHaveLength(2);
  });
  it('ingest writes a new entry when a same-key reactive entry is already done (not pending/running)', () => {
    const ing = ingester();
    ing.ingest(ev);
    const bl = loadBacklog(backlogPath); bl.entries[0]!.status = 'done';
    writeFileSync(backlogPath, JSON.stringify(bl));
    expect(ing.ingest(ev)).toBe('written'); // prior is done → not a live dup
    expect(loadBacklog(backlogPath).entries).toHaveLength(2);
  });
});
