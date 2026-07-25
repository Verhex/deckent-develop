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

  it('forwards process-root provider admission and parks before task execution', async () => {
    writeFileSync(backlogPath, JSON.stringify({
      _version: '1.0',
      entries: [entry({ id: 'held-task', planned: true, summary: 'bounded work' })],
    }));
    const opts = baseOpts(() => new Date('2026-06-09T10:00:00Z'));
    const admitProviderExecution = vi.fn().mockResolvedValue({
      decision: 'hold',
      hold: {
        schemaVersion: 1,
        executionId: 'held-task',
        tenantId: 'local',
        projectId: null,
        reasonCode: 'candidate_authority_unavailable',
        authorityEvidenceRefs: ['provider-authority:test'],
        heldAt: '2026-07-25T00:00:00.000Z',
      },
    });
    const bundle = buildEngineRuntime({ ...opts, admitProviderExecution });

    await runAutonomousCycle({}, bundle.deps);

    expect(admitProviderExecution).toHaveBeenCalledOnce();
    expect(opts.runTask).not.toHaveBeenCalled();
    expect(loadBacklog(backlogPath).entries[0]).toMatchObject({
      status: 'parked',
      lastResult: {
        providerAuthorityHold: {
          reasonCode: 'candidate_authority_unavailable',
        },
      },
    });
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

  // ── Seam #4: evaluatePolicy RBAC enforcement on machine-initiated dispatch ──

  it('denies machine-initiated dispatch when rbac_policy is enabled with a role lacking execute', async () => {
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [entry({ id: 'a' })] }));
    const opts = baseOpts(() => new Date('2026-06-09T10:00:00Z'));
    opts.config = { deckent_style: 'sprint', autonomous: { enabled: true, rbac_policy: { enabled: true, role: 'viewer' } } } as never;
    const bundle = buildEngineRuntime(opts);

    const result = await runAutonomousCycle({}, bundle.deps);

    expect(result.outcome).toBe('denied');
    expect(result.reason).toMatch(/rbac/);
    expect(loadBacklog(backlogPath).entries[0]!.status).toBe('pending'); // never ran
  });

  it('permits machine-initiated dispatch when the enforced role has execute (operator)', async () => {
    const cap = entry({
      id: 'cap-echo-rbac', kind: 'capability', policy: 'auto',
      spec: { capabilityTarget: { capability: 'echo', args: {} } },
    });
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [cap] }));
    const opts = baseOpts(() => new Date('2026-06-09T10:00:00Z'));
    opts.config = { deckent_style: 'sprint', autonomous: { enabled: true, rbac_policy: { enabled: true, role: 'operator' } } } as never;
    const bundle = buildEngineRuntime(opts);

    const result = await runAutonomousCycle({}, bundle.deps);

    expect(result.outcome).toBe('executed');
    expect(loadBacklog(backlogPath).entries[0]!.status).toBe('done');
  });

  it('rbac_policy absent → dispatch ungated (backward-safe)', async () => {
    const cap = entry({
      id: 'cap-echo-plain', kind: 'capability', policy: 'auto',
      spec: { capabilityTarget: { capability: 'echo', args: {} } },
    });
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [cap] }));
    const bundle = buildEngineRuntime(baseOpts(() => new Date('2026-06-09T10:00:00Z')));

    const result = await runAutonomousCycle({}, bundle.deps);

    expect(result.outcome).toBe('executed');
  });

  // ── AUT-3: scheduled-flow → backlog bridge (user-configured flows actually run) ──

  function flowOpts(requiresApproval: boolean) {
    const opts = baseOpts(() => new Date('2026-06-10T03:00:00Z'));
    return {
      ...opts,
      flows: [{ id: 'nightly', cronExpr: '* * * * *', action: 'scan dependency tree', tenantId: 'local', enabled: true }] as never,
      policy: { id: 'p', trigger: 'scheduled', action: 'start', guard: { requiresApproval } } as never,
    };
  }

  it('a due user-configured flow EXECUTES end-to-end (no-approval guard): runTask runs, backlog records done', async () => {
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [] }));
    const opts = flowOpts(false);
    opts.runTask = vi.fn().mockResolvedValue({ taskId: 't-flow' });
    // CORE-UNIFORMITY (slice 1): the dispatcher's task branch now runs the real
    // Brain-Eval kernel on this result via the live composition root (no test-level
    // injection seam here). A schema-complete result (coverage present) drives the
    // kernel to DONE so the end-to-end flow records 'done' as before.
    opts.waitForResult = vi.fn().mockResolvedValue({ taskId: 't-flow', selfAssessment: 'DONE', testsPassed: true, coverage: 100, filesChanged: [], notes: '', linesAdded: 0, linesRemoved: 0 });
    const bundle = buildEngineRuntime(opts);

    const result = await runAutonomousCycle({}, bundle.deps);

    expect(result.outcome).toBe('executed');
    expect(opts.runTask).toHaveBeenCalledOnce();
    const entries = loadBacklog(backlogPath).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe('done');
    expect(entries[0]!.spec.description).toBe('scan dependency tree');
  });

  it('a due flow with the default approval guard PARKS for a human (ADR-040 preserved)', async () => {
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [] }));
    const opts = flowOpts(true);
    opts.runTask = vi.fn();
    const bundle = buildEngineRuntime(opts);

    const result = await runAutonomousCycle({}, bundle.deps);

    expect(result.outcome).toBe('pending');
    expect(opts.runTask).not.toHaveBeenCalled();
    expect(loadBacklog(backlogPath).entries[0]!.status).toBe('pending'); // enqueued, never ran
  });
});
