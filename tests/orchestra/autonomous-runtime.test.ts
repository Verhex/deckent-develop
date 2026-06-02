import { describe, it, expect, vi } from 'vitest';
import {
  runAutonomousCycle,
  type AutonomousTrigger,
  type AutonomousRuntimeDeps,
  type AuthorityDecision,
  type ApprovalDecision,
  type ActionResult,
  type AuditRecord,
} from '../../src/orchestra/autonomous-runtime.js';

// ─── Helpers ─────────────────────────────────────────────────────────

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

function makeDeps(overrides: {
  trigger?: AutonomousTrigger | null;
  authority?: AuthorityDecision;
  approval?: ApprovalDecision;
  action?: ActionResult;
} = {}): { deps: AutonomousRuntimeDeps; audit: AuditRecord[]; spies: {
  triggerNext: ReturnType<typeof vi.fn>;
  authorityCheck: ReturnType<typeof vi.fn>;
  approvalRequest: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  auditRecord: ReturnType<typeof vi.fn>;
}; } {
  const audit: AuditRecord[] = [];
  const trigger = overrides.trigger === undefined ? makeTrigger() : overrides.trigger;
  const authority = overrides.authority ?? { outcome: 'allowed' as const, reason: 'within policy' };
  const approval = overrides.approval ?? { outcome: 'approved' as const };
  const action = overrides.action ?? { ok: true, result: { rows: 42 } };

  const triggerNext = vi.fn().mockResolvedValue(trigger);
  const authorityCheck = vi.fn().mockReturnValue(authority);
  const approvalRequest = vi.fn().mockResolvedValue(approval);
  const execute = vi.fn().mockResolvedValue(action);
  const auditRecord = vi.fn((r: AuditRecord) => { audit.push(r); });

  const deps: AutonomousRuntimeDeps = {
    triggerSource: { next: triggerNext },
    authority: { check: authorityCheck },
    approvalGate: { request: approvalRequest },
    executor: { execute },
    audit: { record: auditRecord },
    now: () => '2026-06-02T00:00:00.000Z',
  };
  return { deps, audit, spies: { triggerNext, authorityCheck, approvalRequest, execute, auditRecord } };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('runAutonomousCycle — trigger → cycle (happy path, allowed)', () => {
  it('executes action when authority allows, writes audit, no approval gate call', async () => {
    const { deps, audit, spies } = makeDeps();
    const result = await runAutonomousCycle({ tenantId: 'acme' }, deps);

    expect(result.outcome).toBe('executed');
    expect(result.action?.ok).toBe(true);
    expect(spies.triggerNext).toHaveBeenCalledTimes(1);
    expect(spies.authorityCheck).toHaveBeenCalledWith('mrp.refresh', 'tenant-acme');
    expect(spies.approvalRequest).not.toHaveBeenCalled();
    expect(spies.execute).toHaveBeenCalledTimes(1);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      triggerId: 't-1',
      action: 'mrp.refresh',
      outcome: 'executed',
      timestamp: '2026-06-02T00:00:00.000Z',
    });
  });

  it('returns no_trigger and skips downstream calls when source is idle', async () => {
    const { deps, audit, spies } = makeDeps({ trigger: null });
    const result = await runAutonomousCycle({}, deps);

    expect(result.outcome).toBe('no_trigger');
    expect(result.trigger).toBeNull();
    expect(spies.authorityCheck).not.toHaveBeenCalled();
    expect(spies.execute).not.toHaveBeenCalled();
    expect(audit).toHaveLength(0);
  });
});

describe('runAutonomousCycle — authority needs_approval branch', () => {
  it('approved → executes action + audit("executed")', async () => {
    const { deps, audit, spies } = makeDeps({
      authority: { outcome: 'needs_approval', reason: 'medium risk action' },
      approval: { outcome: 'approved', reason: 'user accepted' },
    });
    const result = await runAutonomousCycle({}, deps);

    expect(result.outcome).toBe('executed');
    expect(result.authority?.outcome).toBe('needs_approval');
    expect(result.approval?.outcome).toBe('approved');
    expect(spies.approvalRequest).toHaveBeenCalledTimes(1);
    expect(spies.execute).toHaveBeenCalledTimes(1);
    expect(audit[0]?.outcome).toBe('executed');
  });

  it('rejected → does NOT execute, audit("rejected")', async () => {
    const { deps, audit, spies } = makeDeps({
      authority: { outcome: 'needs_approval', reason: 'high risk' },
      approval: { outcome: 'rejected', reason: 'user denied' },
    });
    const result = await runAutonomousCycle({}, deps);

    expect(result.outcome).toBe('rejected');
    expect(result.action).toBeNull();
    expect(spies.execute).not.toHaveBeenCalled();
    expect(audit[0]?.outcome).toBe('rejected');
    expect(audit[0]?.reason).toBe('user denied');
  });

  it('pending → does NOT execute, audit("pending")', async () => {
    const { deps, audit, spies } = makeDeps({
      authority: { outcome: 'needs_approval', reason: 'awaiting human' },
      approval: { outcome: 'pending', reason: 'no response yet' },
    });
    const result = await runAutonomousCycle({}, deps);

    expect(result.outcome).toBe('pending');
    expect(spies.execute).not.toHaveBeenCalled();
    expect(audit[0]?.outcome).toBe('pending');
  });
});

describe('runAutonomousCycle — authority denied', () => {
  it('does NOT call approval or executor, audit("denied")', async () => {
    const { deps, audit, spies } = makeDeps({
      authority: { outcome: 'denied', reason: 'RBAC: tenant lacks mrp.write' },
    });
    const result = await runAutonomousCycle({}, deps);

    expect(result.outcome).toBe('denied');
    expect(result.action).toBeNull();
    expect(result.approval).toBeNull();
    expect(spies.approvalRequest).not.toHaveBeenCalled();
    expect(spies.execute).not.toHaveBeenCalled();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      outcome: 'denied',
      reason: 'RBAC: tenant lacks mrp.write',
      triggerId: 't-1',
    });
  });
});

describe('runAutonomousCycle — execution failure', () => {
  it('records audit("failed") with executor error when action.ok=false', async () => {
    const { deps, audit } = makeDeps({
      action: { ok: false, error: 'ERP write timeout' },
    });
    const result = await runAutonomousCycle({}, deps);

    expect(result.outcome).toBe('failed');
    expect(result.action?.ok).toBe(false);
    expect(audit[0]?.outcome).toBe('failed');
    expect(audit[0]?.reason).toBe('ERP write timeout');
  });
});
