import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  makeApprovalGate,
  type ApprovalGateAdapter,
} from '../../src/orchestra/autonomous/approval-adapter.js';
import type { AutonomousTrigger } from '../../src/orchestra/autonomous-runtime.js';

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
  pendingPath = join(workDir, '.deckent', 'nervous-pending.json');
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
  it('accept and reject also call executor.resolveApproval', () => {
    const resolveApproval = vi.fn();
    const gate: ApprovalGateAdapter = makeApprovalGate({
      executor: { resolveApproval },
    });

    gate.accept('t-1');
    gate.reject('t-2');

    expect(resolveApproval).toHaveBeenCalledWith('t-1', 'accepted');
    expect(resolveApproval).toHaveBeenCalledWith('t-2', 'rejected');
    expect(resolveApproval).toHaveBeenCalledTimes(2);
  });
});
