import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  makeApprovalGate,
  type ApprovalGateAdapter,
} from '../../src/orchestra/autonomous/approval-adapter.js';
import type { AutonomousTrigger } from '../../src/orchestra/autonomous-runtime.js';
import { readAuditEvents } from '../../src/core/audit-query.js';

function makeTrigger(overrides: Partial<AutonomousTrigger> = {}): AutonomousTrigger {
  return {
    id: 't-1',
    source: 'scheduled-flow',
    action: 'mrp.refresh',
    requestedBy: 'tenant-acme',
    payload: { foo: 'bar' },
    ...overrides,
  };
}

let workDir: string;
let pendingPath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'approval-adapter-'));
  pendingPath = join(workDir, '.deckent', 'nervous', 'nervous-pending.json');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('makeApprovalGate — enqueue → pending', () => {
  it('first request returns pending and queues the trigger', async () => {
    const gate = makeApprovalGate({ now: () => '2026-06-04T12:00:00.000Z' });
    const decision = await gate.request(makeTrigger());

    expect(decision.outcome).toBe('pending');
    expect(decision.reason).toBe('awaiting human approval');
    expect(gate.pending()).toHaveLength(1);
    expect(gate.pending()[0]).toMatchObject({
      triggerId: 't-1',
      action: 'mrp.refresh',
      requestedBy: 'tenant-acme',
      enqueuedAt: '2026-06-04T12:00:00.000Z',
    });
  });

  it('repeated request for same trigger does not duplicate queue entry', async () => {
    const gate = makeApprovalGate();
    await gate.request(makeTrigger());
    await gate.request(makeTrigger());
    await gate.request(makeTrigger());

    expect(gate.pending()).toHaveLength(1);
  });
});

describe('makeApprovalGate — accept → approved', () => {
  it('after accept(), next request returns approved and clears the queue', async () => {
    const gate = makeApprovalGate();
    const first = await gate.request(makeTrigger());
    expect(first.outcome).toBe('pending');

    gate.accept('t-1', 'user clicked approve');
    const second = await gate.request(makeTrigger());

    expect(second.outcome).toBe('approved');
    expect(second.reason).toBe('user clicked approve');
    expect(gate.pending()).toHaveLength(0);
  });
});

describe('makeApprovalGate — reject → rejected', () => {
  it('after reject(), next request returns rejected and clears the queue', async () => {
    const gate = makeApprovalGate();
    await gate.request(makeTrigger());

    gate.reject('t-1', 'too risky');
    const result = await gate.request(makeTrigger());

    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('too risky');
    expect(gate.pending()).toHaveLength(0);
  });
});

describe('makeApprovalGate — 🔴 OTO-APPROVE-YOK invariant', () => {
  it('repeated requests without accept/reject NEVER return approved', async () => {
    const gate = makeApprovalGate();
    const trigger = makeTrigger();

    const outcomes: string[] = [];
    for (let i = 0; i < 50; i++) {
      const d = await gate.request(trigger);
      outcomes.push(d.outcome);
    }

    expect(outcomes.every(o => o === 'pending')).toBe(true);
    expect(outcomes).not.toContain('approved');
    expect(outcomes).not.toContain('rejected');
  });

  it('time alone does not auto-approve — clock advances make no difference', async () => {
    let t = 0;
    const gate = makeApprovalGate({ now: () => new Date(t).toISOString() });
    const trigger = makeTrigger();

    for (let i = 0; i < 10; i++) {
      t += 1_000_000; // jump 1000 seconds per request
      const d = await gate.request(trigger);
      expect(d.outcome).toBe('pending');
    }
  });
});

describe('makeApprovalGate — persistence + hydration (224-008 compat shape)', () => {
  it('persists pending entries and a fresh adapter hydrates from disk', async () => {
    const first = makeApprovalGate({ pendingPath });
    await first.request(makeTrigger({ id: 't-A' }));
    await first.request(makeTrigger({ id: 't-B' }));

    expect(existsSync(pendingPath)).toBe(true);
    const raw = JSON.parse(readFileSync(pendingPath, 'utf-8')) as Array<{ triggerId: string }>;
    expect(raw.map(e => e.triggerId).sort()).toEqual(['t-A', 't-B']);

    const second = makeApprovalGate({ pendingPath });
    const hydrated = second.pending().map(e => e.triggerId).sort();
    expect(hydrated).toEqual(['t-A', 't-B']);
  });
});

describe('makeApprovalGate — nervous Executor delegation', () => {
  it('accept and reject also call executor.resolveApproval', async () => {
    const resolveApproval = vi.fn();
    const gate: ApprovalGateAdapter = makeApprovalGate({
      executor: { resolveApproval },
    });

    // APPROVAL-001 T1: a decision may only resolve a trigger that was parked
    // first, so enqueue both before deciding (the realistic loop → human flow).
    await gate.request(makeTrigger({ id: 't-1' }));
    await gate.request(makeTrigger({ id: 't-2' }));
    gate.accept('t-1');
    gate.reject('t-2');

    expect(resolveApproval).toHaveBeenCalledWith('t-1', 'accepted');
    expect(resolveApproval).toHaveBeenCalledWith('t-2', 'rejected');
    expect(resolveApproval).toHaveBeenCalledTimes(2);
  });
});

// ═══ APPROVAL-001 T1 — fail-closed on unknown/forged trigger ════════════════
// Root cause: accept()/reject() recorded a decision for ANY triggerId, so a
// forged/stale id from the dashboard or MCP minted an `approved` outcome for a
// request that was never parked. The gate now refuses an id it cannot tie to a
// live pending request (in-memory OR fresh on-disk), persists NO decision, and
// writes the refused attempt to the durable audit trail.
describe('makeApprovalGate — unknown-ID fail-closed guard (APPROVAL-001 T1)', () => {
  it('accept() on an unparked trigger throws APR_UNKNOWN_REQUEST and persists no decision', () => {
    const decisionsPath = join(workDir, 'decisions.json');
    const resolveApproval = vi.fn();
    const gate = makeApprovalGate({
      pendingPath,
      decisionsPath,
      projectRoot: workDir,
      executor: { resolveApproval },
    });

    expect(() => gate.accept('forged-id')).toThrowError(/not a known pending request/u);
    try {
      gate.accept('forged-id');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('APR_UNKNOWN_REQUEST');
    }

    // No decision was minted, and the nervous executor was never told to resolve.
    expect(existsSync(decisionsPath)).toBe(false);
    expect(resolveApproval).not.toHaveBeenCalled();
  });

  it('reject() on an unparked trigger is refused the same way', () => {
    const gate = makeApprovalGate({ pendingPath, projectRoot: workDir });
    expect(() => gate.reject('never-seen')).toThrowError(/not a known pending request/u);
  });

  it('writes a durable audit record for the refused attempt', async () => {
    const gate = makeApprovalGate({ pendingPath, projectRoot: workDir });
    expect(() => gate.accept('forged-id')).toThrow();

    const events = readAuditEvents(workDir, 'autonomous');
    const refusal = events.find((e) => e.action === 'approval.unknown_request_rejected');
    expect(refusal).toBeDefined();
    expect(refusal?.target).toBe('forged-id');
  });

  it('a genuinely parked trigger still accepts (guard does not block the real flow)', async () => {
    const gate = makeApprovalGate({ pendingPath, projectRoot: workDir });
    await gate.request(makeTrigger({ id: 't-real' }));

    expect(() => gate.accept('t-real', 'ok')).not.toThrow();
    const second = await gate.request(makeTrigger({ id: 't-real' }));
    expect(second.outcome).toBe('approved');
  });

  it('a separate gate instance accepts an id parked on shared disk (cross-process, no false refusal)', async () => {
    const loop = makeApprovalGate({ pendingPath, projectRoot: workDir });
    await loop.request(makeTrigger({ id: 't-xproc' }));

    // Fresh instance (the CLI/API process) hydrates the parked id from disk.
    const cli = makeApprovalGate({ pendingPath, projectRoot: workDir });
    expect(() => cli.accept('t-xproc')).not.toThrow();
  });
});
