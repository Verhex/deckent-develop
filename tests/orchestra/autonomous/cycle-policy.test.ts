import { describe, it, expect, vi } from 'vitest';
import { runAutonomousCycle } from '../../../src/orchestra/autonomous-runtime.js';
import type { AutonomousRuntimeDeps, AutonomousTrigger } from '../../../src/orchestra/autonomous-runtime.js';

const trig: AutonomousTrigger = { id: 't1', source: 'backlog', action: 'autonomous.execute', requestedBy: 'system', payload: {} };

function deps(over: Partial<AutonomousRuntimeDeps>): AutonomousRuntimeDeps {
  return {
    triggerSource: { next: () => trig },
    authority: { check: () => ({ outcome: 'allowed', reason: 'ok' }) },
    approvalGate: { request: () => ({ outcome: 'pending', reason: 'parked' }) },
    executor: { execute: vi.fn().mockResolvedValue({ ok: true }) },
    audit: { record: () => {} },
    ...over,
  };
}

describe('cycle policy gate (G2/G3 split from RBAC)', () => {
  it('policyGate=park → cycle parks (pending), executor NOT called', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({ executor: { execute: exec }, policyGate: { decide: () => ({ decision: 'park', reason: 'approval-required' }) } });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('pending');
    expect(exec).not.toHaveBeenCalled();
  });

  it('policyGate=park + approvalGate rejects → rejected, executor NOT called', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({
      executor: { execute: exec },
      approvalGate: { request: () => ({ outcome: 'rejected', reason: 'no' }) },
      policyGate: { decide: () => ({ decision: 'park', reason: 'approval-required' }) },
    });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('rejected');
    expect(exec).not.toHaveBeenCalled();
  });

  it('policyGate=park + approvalGate approves → executes', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({
      executor: { execute: exec },
      approvalGate: { request: () => ({ outcome: 'approved', reason: 'yes' }) },
      policyGate: { decide: () => ({ decision: 'park', reason: 'x' }) },
    });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
    expect(exec).toHaveBeenCalledOnce();
  });

  it('policyGate=auto → executor runs', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({ executor: { execute: exec }, policyGate: { decide: () => ({ decision: 'auto', reason: 'auto' }) } });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
    expect(exec).toHaveBeenCalledOnce();
  });

  it('no policyGate → legacy behavior preserved (executes when authority allowed)', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({ executor: { execute: exec } });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
  });

  it('authority denied still short-circuits before policy gate', async () => {
    const policyDecide = vi.fn().mockReturnValue({ decision: 'auto', reason: 'x' });
    const d = deps({
      authority: { check: () => ({ outcome: 'denied', reason: 'nope' }) },
      policyGate: { decide: policyDecide },
    });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('denied');
    expect(policyDecide).not.toHaveBeenCalled();
  });

  it('authority needs_approval (approved) + policyGate=park → approvalGate.request called ONCE', async () => {
    const requestSpy = vi.fn().mockResolvedValue({ outcome: 'approved', reason: 'yes' });
    const d = deps({
      authority: { check: () => ({ outcome: 'needs_approval', reason: 'risk' }) },
      approvalGate: { request: requestSpy },
      policyGate: { decide: () => ({ decision: 'park', reason: 'policy' }) },
    });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });
});
