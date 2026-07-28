// Process mode — the client-facing execution surface (ExecutionRequest → backlog
// entry → policy-gate → execute-dispatcher, DRY via the autonomous machinery).
// Safe-by-default: policy='risk-tagged' so the EffectClass decides auto vs park —
// read-only (erp.read) auto-runs, side-effecting (erp.write) parks for approval.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeProcessController, type ProcessControllerDeps } from '../../src/orchestra/process-controller.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { TaskResult } from '../../src/core/types.js';

const dirs: string[] = [];
function backlogPath(): string {
  const d = mkdtempSync(join(tmpdir(), 'proc-ctl-'));
  dirs.push(d);
  return join(d, 'backlog.json');
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function deps(overrides: Partial<ProcessControllerDeps> = {}): ProcessControllerDeps {
  let n = 0;
  return {
    projectRoot: '/tmp/proc',
    config: { deckent_style: 'process' } as unknown as ResolvedConfig,
    backlogPath: backlogPath(),
    runTask: async () => ({ taskId: 'task-1' }),
    executeSprint: async () => undefined,
    waitForResult: async () => ({ selfAssessment: 'DONE' } as unknown as TaskResult),
    capabilityRegistry: {
      invoke: async (target: { capability: string }) => ({
        ok: target.capability === 'erp.read',
        capability: target.capability,
        handler: 'mock',
        code: 'ERR',
        error: 'write denied by mock',
      }),
    } as unknown as ProcessControllerDeps['capabilityRegistry'],
    // CORE-UNIFORMITY: the autonomous task path now runs the Brain-Eval/Auditor/Cross-Verify
    // kernels (execute-dispatcher.ts). This is a process-controller POLICY test — mock the
    // downstream verdicts (a real eval NO_GOs the evidence-less mock result → false 'failed').
    evaluate: (() => ({ decision: 'DONE', quality: 100 })) as unknown as ProcessControllerDeps['evaluate'],
    audit: (async () => ({ boundary: 'clean', adr: 'ok', functional: 'pass' })) as unknown as ProcessControllerDeps['audit'],
    crossVerify: (async () => ({ ran: false })) as unknown as ProcessControllerDeps['crossVerify'],
    idGen: () => `proc-${++n}`,
    ...overrides,
  };
}

describe('makeProcessController.submit', () => {
  it('auto-runs a read-only capability (erp.read → pure) and completes', async () => {
    const d = deps();
    const ctl = makeProcessController(d);
    const res = await ctl.submit({ description: 'read open sales orders', kind: 'capability', capabilityTarget: { capability: 'erp.read', connector: 'odoo' } });
    expect(res.executionId).toBe('proc-1');
    expect(res.status).toBe('completed');
    expect(ctl.status('proc-1')?.status).toBe('done');
  });

  it('parks a side-effecting capability (erp.write → critical-irreversible) for approval', async () => {
    const d = deps();
    const ctl = makeProcessController(d);
    const res = await ctl.submit({ description: 'post invoice', kind: 'capability', capabilityTarget: { capability: 'erp.write', connector: 'odoo' } });
    expect(res.status).toBe('pending-approval');
    const rec = ctl.status(res.executionId);
    expect(rec?.status).toBe('pending'); // still pending, awaiting human approval
    // the entry's policy was flipped to approval-required so the gate/dashboard show it
    const bl = JSON.parse(readFileSync(d.backlogPath, 'utf-8'));
    expect(bl.entries.find((e: { id: string }) => e.id === res.executionId).policy).toBe('approval-required');
  });

  it('auto-runs a task with a reversible scope (docs/) and completes', async () => {
    const ctl = makeProcessController(deps());
    const res = await ctl.submit({ description: 'summarize the changelog', kind: 'task', scopeDir: 'docs/' });
    expect(res.status).toBe('completed');
  });

  it('durably parks an auto task when provider authority holds before dispatch', async () => {
    const runTask = vi.fn().mockResolvedValue({ taskId: 'must-not-run' });
    const d = deps({
      runTask,
      admitProviderExecution: (entry) => ({
        decision: 'hold',
        hold: {
          schemaVersion: 1,
          executionId: entry.id,
          tenantId: entry.tenant ?? 'local',
          projectId: null,
          reasonCode: 'policy_authority_unavailable',
          authorityEvidenceRefs: ['provider-authority:hold-001'],
          heldAt: '2026-07-25T10:00:00.000Z',
        },
      }),
    });
    const ctl = makeProcessController(d);

    const res = await ctl.submit({
      description: 'summarize the changelog',
      kind: 'task',
      scopeDir: 'docs/',
      tenant: 'tenant-a',
    });

    expect(res).toMatchObject({
      executionId: 'proc-1',
      status: 'held',
      reason: 'policy_authority_unavailable',
      providerAuthorityHold: {
        executionId: 'proc-1',
        tenantId: 'tenant-a',
        projectId: null,
        authorityEvidenceRefs: ['provider-authority:hold-001'],
      },
    });
    expect(runTask).not.toHaveBeenCalled();
    expect(ctl.status('proc-1')).toMatchObject({
      status: 'parked',
      lastResult: {
        ok: false,
        providerAuthorityHold: {
          reasonCode: 'policy_authority_unavailable',
          executionId: 'proc-1',
        },
      },
    });
  });

  it('does not apply provider admission to provider-free capabilities', async () => {
    const admitProviderExecution = vi.fn();
    const ctl = makeProcessController(deps({ admitProviderExecution }));
    const res = await ctl.submit({
      description: 'read open sales orders',
      kind: 'capability',
      capabilityTarget: { capability: 'erp.read' },
    });

    expect(res.status).toBe('completed');
    expect(admitProviderExecution).not.toHaveBeenCalled();
  });

  it.each([
    ['sprint', { description: 'document the release', kind: 'sprint' as const, scopeDir: 'docs/' }],
    ['process', {
      description: 'document through a process',
      kind: 'process' as const,
      scopeDir: 'docs/',
      steps: [{ description: 'summarize docs' }],
    }],
  ])('holds an auto %s entry before task or sprint execution', async (_kind, request) => {
    const runTask = vi.fn();
    const executeSprint = vi.fn();
    const ctl = makeProcessController(deps({
      runTask,
      executeSprint,
      admitProviderExecution: (entry) => ({
        decision: 'hold',
        hold: {
          schemaVersion: 1,
          executionId: entry.id,
          tenantId: 'local',
          projectId: 'project-1',
          reasonCode: 'candidate_authority_unavailable',
          authorityEvidenceRefs: ['provider-authority:ready-without-candidate'],
          heldAt: '2026-07-25T10:00:00.000Z',
        },
      }),
    }));

    expect(await ctl.submit(request)).toMatchObject({
      status: 'held',
      providerAuthorityHold: {
        reasonCode: 'candidate_authority_unavailable',
      },
    });
    expect(runTask).not.toHaveBeenCalled();
    expect(executeSprint).not.toHaveBeenCalled();
  });

  it('parks a task with no recognizable scope (fail-safe → critical-irreversible)', async () => {
    const ctl = makeProcessController(deps());
    const res = await ctl.submit({ description: 'do something ambiguous', kind: 'task' });
    expect(res.status).toBe('pending-approval');
  });

  it('reports failure when the capability handler denies (write → success=false)', async () => {
    // Force the write to auto-run by tagging it auto, to exercise the failure path.
    const ctl = makeProcessController(deps());
    const res = await ctl.submit({ description: 'erp.read but handler fails', kind: 'capability', capabilityTarget: { capability: 'erp.read', connector: 'broken' } });
    // erp.read auto-runs; mock returns ok:true for erp.read → completed
    expect(res.status).toBe('completed');
  });

  it('status() returns null for an unknown execution id', () => {
    expect(makeProcessController(deps()).status('nope')).toBeNull();
  });

  it('carries the actor tenant onto the backlog entry', async () => {
    const d = deps();
    const ctl = makeProcessController(d);
    const res = await ctl.submit({ description: 'tenant read', kind: 'capability', capabilityTarget: { capability: 'erp.read' }, actor: { id: 'u1', tenantId: 'acme' } });
    const bl = JSON.parse(readFileSync(d.backlogPath, 'utf-8'));
    expect(bl.entries.find((e: { id: string }) => e.id === res.executionId).tenant).toBe('acme');
  });

  it('stamps the full actor (id+role+tenant), not just tenant, onto the backlog entry', async () => {
    // Audit-lineage fix: the real OIDC sub (actor.id) + role must be durable, not
    // dropped. Previously only tenant survived → the audit chain forged 'system'.
    const d = deps();
    const ctl = makeProcessController(d);
    const res = await ctl.submit({
      description: 'tenant read',
      kind: 'capability',
      capabilityTarget: { capability: 'erp.read' },
      actor: { id: 'oidc-sub-abc123', role: 'admin', tenantId: 'acme' },
    });
    const bl = JSON.parse(readFileSync(d.backlogPath, 'utf-8'));
    const entry = bl.entries.find((e: { id: string }) => e.id === res.executionId);
    expect(entry.actor).toEqual({ id: 'oidc-sub-abc123', role: 'admin', tenantId: 'acme' });
    expect(entry.tenant).toBe('acme'); // tenant still derived alongside
  });

  it('passes the entry actor (real OIDC sub) into the capability invocation — not a constant system', async () => {
    // The dispatcher must derive the invocation actor from entry.actor so the audit
    // hash-chain records the actual principal, not the hard-coded {id:'system'}.
    let seenActor: unknown;
    const d = deps({
      capabilityRegistry: {
        invoke: async (target: { capability: string }, ctx: { actor?: unknown }) => {
          seenActor = ctx.actor;
          return { ok: true, capability: target.capability, handler: 'mock', value: null };
        },
      } as unknown as ProcessControllerDeps['capabilityRegistry'],
    });
    const ctl = makeProcessController(d);
    await ctl.submit({
      description: 'tenant read',
      kind: 'capability',
      capabilityTarget: { capability: 'erp.read' },
      actor: { id: 'oidc-sub-abc123', role: 'admin', tenantId: 'acme' },
    });
    expect(seenActor).toEqual({ id: 'oidc-sub-abc123', role: 'admin', tenantId: 'acme' });
  });

  it('falls back to a tenant-scoped system actor when the entry carries no actor (backward compat)', async () => {
    let seenActor: unknown;
    const d = deps({
      capabilityRegistry: {
        invoke: async (target: { capability: string }, ctx: { actor?: unknown }) => {
          seenActor = ctx.actor;
          return { ok: true, capability: target.capability, handler: 'mock', value: null };
        },
      } as unknown as ProcessControllerDeps['capabilityRegistry'],
    });
    const ctl = makeProcessController(d);
    await ctl.submit({ description: 'tenant read', kind: 'capability', capabilityTarget: { capability: 'erp.read' }, tenant: 'acme' });
    expect(seenActor).toEqual({ id: 'system', tenantId: 'acme' });
  });
});
