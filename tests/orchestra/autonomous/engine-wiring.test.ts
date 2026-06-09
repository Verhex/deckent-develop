// tests/orchestra/autonomous/engine-wiring.test.ts
// Engine-level wiring tests for the two autonomous dormant-seam closures
// (capability-maturity top-5 #1 + #2):
//   1. reenqueueRecurring → buildEngineRuntime backlog loader (recurring cadence live)
//   2. makeWorkGeneratorSource → buildEngineRuntime trigger composition (self-generated work)
// Hermetic: tmpdir backlog file, injected clock, mock runTask/runSprint.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEngineRuntime } from '../../../src/orchestra/autonomous/runtime-loop.js';
import { loadBacklog } from '../../../src/orchestra/autonomous/backlog.js';
import { runAutonomousCycle } from '../../../src/orchestra/autonomous-runtime.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

function entry(over: Partial<BacklogEntry> = {}): BacklogEntry {
  return {
    id: 'e1', title: 'demo', kind: 'task',
    spec: { description: 'do x', scopeDir: '.' },
    policy: 'auto', trigger: { type: 'one-off' },
    status: 'pending', lastRun: null, lastResult: null, ...over,
  };
}

describe('engine wiring — recurring re-enqueue + work-generator', () => {
  let dir: string;
  let backlogPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'engine-wiring-'));
    backlogPath = join(dir, 'backlog.json');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  function baseOpts(clock: () => Date) {
    return {
      projectRoot: dir,
      config: { deckent_style: 'sprint' } as never,
      backlogPath,
      flows: [],
      policy: { id: 'p', trigger: 'scheduled', action: 'noop', disabled: true, guard: { requiresApproval: true } } as never,
      runTask: vi.fn(),
      runSprint: vi.fn(),
      waitForResult: vi.fn().mockResolvedValue(null),
      clock,
    };
  }

  // ── Seam #1: recurring re-enqueue lives inside the engine's backlog loader ──

  it('dispatches a due recurring done entry and persists the pending flip', async () => {
    // lastRun 10:00, cron hourly, now 11:30 → nextRun 11:00 ≤ now → flip + dispatch
    const rec = entry({ id: 'rec', status: 'done', trigger: { type: 'recurring', cron: '0 * * * *' }, lastRun: '2026-06-09T10:00:00Z' });
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [rec] }));
    const bundle = buildEngineRuntime(baseOpts(() => new Date('2026-06-09T11:30:00Z')));

    const t = await bundle.deps.triggerSource.next();

    expect(t?.id).toBe('backlog-rec');
    expect((t?.payload as { entry: BacklogEntry }).entry.status).toBe('pending');
    expect(loadBacklog(backlogPath).entries[0]!.status).toBe('pending'); // flip persisted
  });

  it('stays idle while the recurring entry is not yet due', async () => {
    // lastRun 10:00, cron hourly, now 10:30 → nextRun 11:00 > now → no flip, no trigger
    const rec = entry({ id: 'rec', status: 'done', trigger: { type: 'recurring', cron: '0 * * * *' }, lastRun: '2026-06-09T10:00:00Z' });
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [rec] }));
    const bundle = buildEngineRuntime(baseOpts(() => new Date('2026-06-09T10:30:00Z')));

    const t = await bundle.deps.triggerSource.next();

    expect(t).toBeNull();
    expect(loadBacklog(backlogPath).entries[0]!.status).toBe('done');
  });

  // ── Seam #2: work-generator source composed into the hybrid trigger source ──

  it('enqueues + dispatches self-generated candidates when generateWork is provided', async () => {
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [] }));
    const candidate = entry({ id: 'wg-debt-D1', title: 'Fix flaky lock' });
    const bundle = buildEngineRuntime({
      ...baseOpts(() => new Date('2026-06-09T10:00:00Z')),
      generateWork: () => [candidate],
    });

    const t = await bundle.deps.triggerSource.next();

    expect(t?.id).toBe('work-gen-wg-debt-D1');
    expect(t?.source).toBe('work-generator');
    // The candidate is now IN the backlog → execute-dispatcher's updateStatus can find it.
    expect(loadBacklog(backlogPath).entries.map(e => e.id)).toEqual(['wg-debt-D1']);
  });

  it('does not duplicate or re-yield an already-known candidate id (any status)', async () => {
    const known = entry({ id: 'wg-debt-D1', status: 'done' });
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [known] }));
    const bundle = buildEngineRuntime({
      ...baseOpts(() => new Date('2026-06-09T10:00:00Z')),
      generateWork: () => [entry({ id: 'wg-debt-D1' })],
    });

    const t = await bundle.deps.triggerSource.next();

    expect(t).toBeNull();
    expect(loadBacklog(backlogPath).entries).toHaveLength(1);
  });

  it('polls the work-generator only when backlog + scheduled sources are idle', async () => {
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [entry({ id: 'a' })] }));
    const generateWork = vi.fn(() => [entry({ id: 'wg-debt-D1' })]);
    const bundle = buildEngineRuntime({
      ...baseOpts(() => new Date('2026-06-09T10:00:00Z')),
      generateWork,
    });

    const t = await bundle.deps.triggerSource.next();

    expect(t?.id).toBe('backlog-a'); // pending backlog work outranks self-generated work
    expect(generateWork).not.toHaveBeenCalled();
  });

  it('omits the work-generator source when generateWork is absent (backward-safe)', async () => {
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [] }));
    const bundle = buildEngineRuntime(baseOpts(() => new Date('2026-06-09T10:00:00Z')));
    expect(await bundle.deps.triggerSource.next()).toBeNull();
  });

  // ── Seam #3: capability-broker cluster reachable through the live dispatch path ──

  it('executes a capability backlog entry end-to-end through a full autonomous cycle', async () => {
    const cap = entry({
      id: 'cap-echo', kind: 'capability', policy: 'auto',
      spec: { capabilityTarget: { capability: 'echo', args: { hello: 'world' } } },
    });
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [cap] }));
    const bundle = buildEngineRuntime(baseOpts(() => new Date('2026-06-09T10:00:00Z')));

    const result = await runAutonomousCycle({}, bundle.deps);

    expect(result.outcome).toBe('executed');
    const e = loadBacklog(backlogPath).entries.find((x) => x.id === 'cap-echo');
    expect(e?.status).toBe('done');
    expect(e?.lastResult?.ok).toBe(true);
  });

  it('parks a risk-tagged side-effecting capability entry instead of executing it', async () => {
    const cap = entry({
      id: 'cap-shell', kind: 'capability', policy: 'risk-tagged',
      spec: { capabilityTarget: { capability: 'shell.exec', args: { command: 'rm' } } },
    });
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [cap] }));
    const bundle = buildEngineRuntime(baseOpts(() => new Date('2026-06-09T10:00:00Z')));

    const result = await runAutonomousCycle({}, bundle.deps);

    expect(result.outcome).toBe('pending'); // parked for human approval (G3)
    expect(loadBacklog(backlogPath).entries[0]!.status).toBe('pending'); // never ran
  });
});
