import { describe, it, expect } from 'vitest';
import { makeBacklogTriggerSource, makeHybridTriggerSource } from '../../../src/orchestra/autonomous/backlog-trigger.js';
import type { BacklogFile } from '../../../src/orchestra/autonomous/backlog-types.js';

const bl: BacklogFile = { _version: '1.0', entries: [
  { id: 'a', title: 't', kind: 'task', spec: { description: 'x' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null },
]};

describe('backlog trigger', () => {
  it('yields a trigger carrying the due entry, then null when none due', async () => {
    const src = makeBacklogTriggerSource(() => bl, () => new Date('2026-06-07T00:00:00Z'));
    const first = await src.next();
    expect(first?.action).toBe('autonomous.execute');
    expect(first?.source).toBe('backlog');
    expect((first?.payload as { entry: { id: string } }).entry.id).toBe('a');
  });

  it('yields null when backlog has no due entries', async () => {
    const src = makeBacklogTriggerSource(() => ({ _version: '1.0', entries: [] }), () => new Date());
    expect(await src.next()).toBeNull();
  });

  it('requestedBy reflects tenant when present', async () => {
    const tbl: BacklogFile = { _version: '1.0', entries: [{ ...bl.entries[0]!, tenant: 'acme' }] };
    const src = makeBacklogTriggerSource(() => tbl, () => new Date());
    const t = await src.next();
    expect(t?.requestedBy).toBe('system:acme');
  });

  it('hybrid returns first source that yields, falls through when earlier idle', async () => {
    const empty = makeBacklogTriggerSource(() => ({ _version: '1.0', entries: [] }), () => new Date());
    const fallback = { next: () => ({ id: 'f', source: 'scheduled-flow', action: 'x', requestedBy: 'system' }) };
    const hybrid = makeHybridTriggerSource([empty, fallback]);
    const res = await hybrid.next();
    expect(res?.id).toBe('f');
  });

  it('hybrid returns null when all sources idle', async () => {
    const hybrid = makeHybridTriggerSource([{ next: () => null }, { next: () => null }]);
    expect(await hybrid.next()).toBeNull();
  });

  it('hybrid prefers the earlier source when both would yield', async () => {
    const first = { next: () => ({ id: '1', source: 'a', action: 'x', requestedBy: 'system' }) };
    const second = { next: () => ({ id: '2', source: 'b', action: 'x', requestedBy: 'system' }) };
    const hybrid = makeHybridTriggerSource([first, second]);
    expect((await hybrid.next())?.id).toBe('1');
  });
});
