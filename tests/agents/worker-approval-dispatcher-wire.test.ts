/**
 * born-611 WORKER-APPROVAL-WIRE — enabled-path integration (cost-guard-enabled-path emsali).
 *
 * Chain under test (production composition, no mocks on the approval side):
 *   spawn-env (buildWorkerApprovalGateEnv) → entry setup (setupWorkerApprovalGateFromEnv:
 *   REAL disk-backed broker + external-decision poll driver) → runner opts →
 *   wrapDispatcherWithApprovalGate → guard() round-trip against `.deckent/approvals/`.
 *
 * Cross-process decisions are simulated the way production works: a SECOND
 * ApprovalBroker instance on the same store writes the decision file; the worker
 * side discovers it via its poll driver / fallback flush (advisor R1).
 * Hermetic: everything under a tmpdir; drivers disposed in afterEach.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildWorkerApprovalGateEnv,
  setupWorkerApprovalGateFromEnv,
  APPROVAL_GATE_ENV,
  APPROVAL_SCOPE_ENV,
  type WorkerApprovalGateSetup,
} from '../../src/agents/worker-approval-env.js';
import { wrapDispatcherWithApprovalGate, type ToolDispatcherLike } from '../../src/agents/agentic-worker-tools.js';
import { createWorkerApprovalGate } from '../../src/agent/permission-store.js';
import { ApprovalBroker } from '../../src/core/approval-broker.js';
import { runWorkerEntry } from '../../src/agents/agentic-worker-entry.js';
import { resolveApprovalConfig } from '../../src/core/config.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'apr-wire-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function recordingDispatcher(): ToolDispatcherLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async dispatch(name: string): Promise<string> {
      calls.push(name);
      return 'dispatched-ok';
    },
  };
}

/** Poll the store dir until one request file exists; return its id. */
async function waitForRequestId(root: string, timeoutMs = 3000): Promise<string> {
  const dir = join(root, '.deckent', 'approvals');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const req = readdirSync(dir).find(f => f.endsWith('.request.json'));
      if (req) return req.replace('.request.json', '');
    } catch { /* dir not created yet */ }
    if (Date.now() > deadline) throw new Error('no approval request appeared');
    await new Promise(r => setTimeout(r, 25));
  }
}

describe('spawn-side env contract', () => {
  it('disabled → undefined (zero footprint on the worker env)', () => {
    expect(buildWorkerApprovalGateEnv(false, 'sprint-1', 't-1')).toBeUndefined();
  });

  it('enabled → gate flag + sprint-scoped scopeId (grant leak guard, advisor S5)', () => {
    expect(buildWorkerApprovalGateEnv(true, 'sprint-7', '007-003')).toEqual({
      [APPROVAL_GATE_ENV]: '1',
      [APPROVAL_SCOPE_ENV]: 'sprint-7/007-003',
    });
  });

  it('resolveApprovalConfig carries question_bridge (typed, default-off)', () => {
    expect(resolveApprovalConfig({}).question_bridge).toBe(false);
    expect(resolveApprovalConfig({ approval: { question_bridge: true } }).question_bridge).toBe(true);
  });
});

describe('worker-side setup (env off/on)', () => {
  it('env off → no gate, dispose is a safe no-op', () => {
    const setup = setupWorkerApprovalGateFromEnv(makeRoot(), 't-1', {});
    expect(setup.approvalGate).toBeUndefined();
    expect(() => setup.dispose()).not.toThrow();
  });

  it('env on → real gate with env-provided scopeId', () => {
    const setup = setupWorkerApprovalGateFromEnv(makeRoot(), 't-1', {
      [APPROVAL_GATE_ENV]: '1',
      [APPROVAL_SCOPE_ENV]: 'sprint-9/t-1',
    });
    cleanups.push(() => setup.dispose());
    expect(setup.approvalGate?.enabled).toBe(true);
    expect(setup.approvalGate?.scopeId).toBe('sprint-9/t-1');
  });
});

describe('enabled-path: dispatcher gate round-trip against the real disk store', () => {
  function wireEnabled(root: string): { setup: WorkerApprovalGateSetup; base: ReturnType<typeof recordingDispatcher>; gated: ToolDispatcherLike } {
    const setup = setupWorkerApprovalGateFromEnv(root, 't-1', {
      [APPROVAL_GATE_ENV]: '1',
      [APPROVAL_SCOPE_ENV]: 'sprint-1/t-1',
    });
    cleanups.push(() => setup.dispose());
    const base = recordingDispatcher();
    const gated = wrapDispatcherWithApprovalGate(base, {
      enabled: true,
      gate: setup.approvalGate!.gate,
      scopeId: setup.approvalGate!.scopeId,
    });
    return { setup, base, gated };
  }

  it('cross-process ALLOW: second broker decides, poll driver discovers, dispatch proceeds', async () => {
    const root = makeRoot();
    const { base, gated } = wireEnabled(root);

    const pending = gated.dispatch('run_bash', { cmd: 'git push origin main' });
    const requestId = await waitForRequestId(root);
    // The "terminal/API process": an independent broker on the same store.
    new ApprovalBroker(root).decide(requestId, {
      decision: 'allow',
      decidedBy: 'human',
      channel: 'test-terminal',
      decidedAt: new Date().toISOString(),
    });

    const result = await pending; // poll driver (1s) must settle this
    expect(result).toBe('dispatched-ok');
    expect(base.calls).toEqual(['run_bash']);
  }, 15_000);

  it('cross-process DENY: structured [approval-denied], base never called', async () => {
    const root = makeRoot();
    const { base, gated } = wireEnabled(root);

    const pending = gated.dispatch('run_bash', { cmd: 'git push origin main' });
    const requestId = await waitForRequestId(root);
    new ApprovalBroker(root).decide(requestId, {
      decision: 'deny',
      decidedBy: 'human',
      channel: 'test-terminal',
      decidedAt: new Date().toISOString(),
    });

    const result = await pending;
    expect(result).toContain('[approval-denied]');
    expect(base.calls).toEqual([]);
  }, 15_000);

  it('non-risky tool bypasses the gate entirely (no request file)', async () => {
    const root = makeRoot();
    const { base, gated } = wireEnabled(root);
    const result = await gated.dispatch('read_file', { path: 'x.ts' });
    expect(result).toBe('dispatched-ok');
    expect(base.calls).toEqual(['read_file']);
    // Broker eagerly creates the store dir at construction — the invariant is
    // that a non-risky dispatch SUBMITS nothing, not that the dir is absent.
    const files = readdirSync(join(root, '.deckent', 'approvals'));
    expect(files.filter(f => f.endsWith('.request.json'))).toEqual([]);
  });
});

describe('R1: fallback flush — a late external ALLOW beats the timeout-DENY guess', () => {
  it('gate with tiny timeout + NO poll driver: external allow written pre-timeout wins', async () => {
    const root = makeRoot();
    // No poll driver on purpose: only the R1 flushing fallback can discover the decision.
    const { gate } = createWorkerApprovalGate(
      root,
      { role: 'worker', instanceId: 't-race' },
      { timeoutMs: 400 },
    );

    const pending = gate.guard({
      summary: 'race: git push',
      details: { tool: 'run_bash' },
      scopeId: 'sprint-1/t-race',
      scope: 'git-mutation',
      risk: 'high',
      policy: 'require-approval',
      defaultAction: 'deny',
    });
    const requestId = await waitForRequestId(root);
    // External process decides ALLOW well before the 400ms timeout — but the
    // worker-side broker has no driver, so ONLY the fallback flush can see it.
    new ApprovalBroker(root).decide(requestId, {
      decision: 'allow',
      decidedBy: 'human',
      channel: 'test-api',
      decidedAt: new Date().toISOString(),
    });

    const verdict = await pending;
    expect(verdict).toBe('allow'); // pre-R1 this was 'deny' (fallback overwrote the human allow)
  }, 10_000);
});

describe('entry-level chain: env → runWorkerEntry → runner opts', () => {
  function seedTask(root: string, taskId: string): void {
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(
      join(root, '.tasks', `task-${taskId}.json`),
      JSON.stringify({ id: taskId, description: 'd', scope: {}, goNogo: {} }),
    );
  }

  it('gate env set → runner receives approvalGate with env scopeId', async () => {
    const root = makeRoot();
    seedTask(root, 't-e1');
    process.env[APPROVAL_GATE_ENV] = '1';
    process.env[APPROVAL_SCOPE_ENV] = 'sprint-5/t-e1';
    cleanups.push(() => {
      delete process.env[APPROVAL_GATE_ENV];
      delete process.env[APPROVAL_SCOPE_ENV];
    });

    let captured: unknown;
    await runWorkerEntry(['t-e1', 'm', 'http://h'], root, {
      runner: async (opts) => {
        captured = opts.approvalGate;
        return {
          selfAssessment: 'DONE', notes: 'n', filesChanged: [], iterations: 1,
        } as never;
      },
    });
    expect((captured as { enabled: boolean; scopeId: string }).enabled).toBe(true);
    expect((captured as { scopeId: string }).scopeId).toBe('sprint-5/t-e1');
  });

  it('gate env absent → runner opts carry NO approvalGate (byte-identical default)', async () => {
    const root = makeRoot();
    seedTask(root, 't-e2');
    let captured: unknown = 'sentinel';
    await runWorkerEntry(['t-e2', 'm', 'http://h'], root, {
      runner: async (opts) => {
        captured = opts.approvalGate;
        return {
          selfAssessment: 'DONE', notes: 'n', filesChanged: [], iterations: 1,
        } as never;
      },
    });
    expect(captured).toBeUndefined();
  });
});
