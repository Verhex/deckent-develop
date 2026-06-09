import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeBacklogTriggerSource, makeHybridTriggerSource, makeFlowBacklogBridge } from '../../../src/orchestra/autonomous/backlog-trigger.js';
import { loadBacklog } from '../../../src/orchestra/autonomous/backlog.js';
import type { AutonomousTrigger } from '../../../src/orchestra/autonomous-runtime.js';
import type { BacklogFile, BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

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

// ─── makeFlowBacklogBridge (AUT-3 — scheduled-flow → backlog dispatch bridge) ──

describe('makeFlowBacklogBridge', () => {
  let dir: string;
  let backlogPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flow-bridge-'));
    backlogPath = join(dir, 'backlog.json');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const flowTrigger = (over: Partial<AutonomousTrigger> = {}): AutonomousTrigger => ({
    id: 'auto-nightly-2026-06-10T03:00:00.000Z',
    source: 'scheduled-flow',
    action: 'scan dependencies',
    requestedBy: 'acme',
    payload: { policyId: 'p', requiresApproval: true, nextRun: '2026-06-10T03:00:00.000Z', flowId: 'nightly' },
    ...over,
  });

  function bridge() {
    return makeFlowBacklogBridge(
      { next: () => flowTrigger() },
      () => loadBacklog(backlogPath),
      backlogPath,
    );
  }

  it('normalizes a scheduled-flow trigger to autonomous.execute with a persisted backlog entry', async () => {
    const t = await bridge().next();
    expect(t?.action).toBe('autonomous.execute');
    expect(t?.requestedBy).toBe('system:acme');
    const entry = (t?.payload as { entry: BacklogEntry }).entry;
    expect(entry.kind).toBe('task'); // no 'sprint' keyword in the action
    expect(entry.spec.description).toBe('scan dependencies');
    expect(entry.policy).toBe('approval-required'); // requiresApproval=true → park via G2
    expect(entry.tenant).toBe('acme');
    // The entry is PERSISTED so the dispatcher's status writeback finds it.
    expect(loadBacklog(backlogPath).entries.map((e) => e.id)).toEqual([entry.id]);
  });

  it("detects 'sprint' actions as kind=sprint and requiresApproval=false as policy=auto", async () => {
    const src = { next: () => flowTrigger({ action: 'run sprint nightly', payload: { policyId: 'p', requiresApproval: false, nextRun: 'n', flowId: 'f1' } }) };
    const t = await makeFlowBacklogBridge(src, () => loadBacklog(backlogPath), backlogPath).next();
    const entry = (t?.payload as { entry: BacklogEntry }).entry;
    expect(entry.kind).toBe('sprint');
    expect(entry.policy).toBe('auto');
  });

  it('passes non-flow triggers through untouched', async () => {
    const raw: AutonomousTrigger = { id: 'b1', source: 'backlog', action: 'autonomous.execute', requestedBy: 'system', payload: {} };
    const t = await makeFlowBacklogBridge({ next: () => raw }, () => loadBacklog(backlogPath), backlogPath).next();
    expect(t).toBe(raw);
    expect(loadBacklog(backlogPath).entries).toHaveLength(0);
  });

  it('passes an approval-redrive replay (payload already carries an entry) through untouched — no re-enqueue', async () => {
    const first = await bridge().next(); // normalize + enqueue once
    const replay = { ...flowTrigger(), payload: first!.payload };
    const t = await makeFlowBacklogBridge({ next: () => replay }, () => loadBacklog(backlogPath), backlogPath).next();
    expect(t).toBe(replay);
    expect(loadBacklog(backlogPath).entries).toHaveLength(1); // still just one
  });

  it('same cadence re-fire does not duplicate the backlog entry (id dedupe)', async () => {
    await bridge().next();
    await bridge().next();
    expect(loadBacklog(backlogPath).entries).toHaveLength(1);
  });

  it('idle inner source stays idle', async () => {
    const t = await makeFlowBacklogBridge({ next: () => null }, () => loadBacklog(backlogPath), backlogPath).next();
    expect(t).toBeNull();
  });
});
