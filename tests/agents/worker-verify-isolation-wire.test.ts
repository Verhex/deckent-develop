import { describe, expect, it } from 'vitest';

import {
  enforceVerifyLoop,
  runAdmittedWorkerTypeScriptVerification,
} from '../../src/agents/worker-verify.js';
import type { VerificationIsolationDecision } from '../../src/core/verification-isolation-authority.js';
import type { TypeScriptScopedVerificationRequest } from '../../src/core/verification-typescript-adapter.js';
import { classifyRiskyToolCall, RISKY_APPROVAL_SCOPES, wrapDispatcherWithApprovalGate, type ToolDispatcherLike } from "../../src/agents/agentic-worker-tools.js";
import { WorkerApprovalGate, type ApprovalBrokerLike } from "../../src/core/approval-worker-gate.js";
import type { ApprovalRequestInput, ApprovalDecisionInput } from "../../src/core/approval-broker.js";
import type { ApprovalRequest, ApprovalDecision, Requester } from "../../src/core/approval-contract.js";

function request(observations: TypeScriptScopedVerificationRequest['observations'] = []): TypeScriptScopedVerificationRequest {
  const grant: VerificationIsolationDecision = {
    decision: 'immutable-snapshot',
    binding: {
      taskId: '488-010', attemptId: 'attempt-a', generationId: 'generation-a',
      contentDigest: 'digest-a', consumer: 'worker-verify',
    },
    impactedUnitIds: ['root'],
    verificationPaths: ['src/task.ts', 'tsconfig.json'],
    allowedConsumers: ['worker-verify'],
    authorityEvidenceRef: 'verification-isolation:test',
  };
  return {
    grant,
    projectRoot: '/admitted-snapshot',
    config: {
      configId: 'tsconfig', configPath: 'tsconfig.json', contentDigest: 'config-digest',
      filePaths: ['src/task.ts', 'tsconfig.json'],
    },
    timeoutMs: 1_000,
    observations,
  };
}

describe('worker admitted TypeScript verification wire', () => {
  it('accepts a passing adapter result exactly once', async () => {
    let executions = 0;

    const result = await runAdmittedWorkerTypeScriptVerification(
      { request: request() },
      async () => {
        executions++;
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false };
      },
    );

    expect(result.kind).toBe('passed');
    expect(executions).toBe(1);
  });

  it('returns HOLD for a foreign concurrent error without consuming a retry', async () => {
    let executions = 0;
    const result = await runAdmittedWorkerTypeScriptVerification(
      {
        request: request([{
          source: 'concurrent-worker', errorCode: 'TS9999', attemptId: 'attempt-b',
          generationId: 'generation-a', paths: ['src/task.ts'],
        }]),
      },
      async () => {
        executions++;
        return { exitCode: 1, stdout: '', stderr: 'foreign error', timedOut: false };
      },
    );

    expect(result).toMatchObject({ kind: 'hold', foreignErrorDiagnostics: { reasonCodes: ['foreign_attempt'] } });
    expect(executions).toBe(1);
  });

  it('reports an attributed compiler failure as failed, not a false pass', async () => {
    const result = await runAdmittedWorkerTypeScriptVerification(
      { request: request() },
      async () => ({ exitCode: 2, stdout: '', stderr: 'TS2322', timedOut: false }),
    );

    expect(result).toMatchObject({ kind: 'failed', reason: 'Admitted TypeScript verification failed with exit code 2' });
  });

  it('fails closed when the legacy worker gate receives no admission', async () => {
    await expect(enforceVerifyLoop('/project', '488-010', 'tests/agents')).resolves.toEqual({
      ok: false,
      reason: 'Verification isolation admission is required',
      attempts: 0,
    });
  });
});

// WIRE-003: physically merged from tests/agents/workergate-wire.test.ts.
{
// ─── FakeApprovalBroker — in-memory, zero fs I/O (mirrors approval-worker-gate.test.ts) ─
class FakeApprovalBroker implements ApprovalBrokerLike {
    readonly submitted: ApprovalRequestInput[] = [];
    private readonly requests = new Map<string, ApprovalRequest>();
    private readonly decisions = new Map<string, ApprovalDecision>();
    private readonly waiters = new Map<string, Array<(d: ApprovalDecision) => void>>();
    submit(request: ApprovalRequestInput): ApprovalRequest {
        this.submitted.push(request);
        const full: ApprovalRequest = { version: '1.0', maskedArgs: null, rawArgsRef: null, ...request };
        this.requests.set(full.id, full);
        return full;
    }
    decide(id: string, input: ApprovalDecisionInput): ApprovalDecision {
        if (this.decisions.has(id))
            throw new Error(`already decided: ${id}`);
        const decision: ApprovalDecision = { requestId: id, reason: '', ...input };
        this.decisions.set(id, decision);
        const waiters = this.waiters.get(id);
        if (waiters) {
            this.waiters.delete(id);
            for (const resolve of waiters)
                resolve(decision);
        }
        return decision;
    }
    awaitDecision(id: string): Promise<ApprovalDecision> {
        const existing = this.decisions.get(id);
        if (existing)
            return Promise.resolve(existing);
        return new Promise((resolve) => {
            const list = this.waiters.get(id);
            if (list)
                list.push(resolve);
            else
                this.waiters.set(id, [resolve]);
        });
    }
}

const REQUESTER: Requester = { role: 'worker', instanceId: 'w-354-005' };

function makeGate(broker: FakeApprovalBroker, timeoutMs = 60000): WorkerApprovalGate {
    return new WorkerApprovalGate({ broker, requester: REQUESTER, tenantId: 'local', userId: 'alperen', timeoutMs });
}

function fakeBaseDispatcher(calls: Array<{
    name: string;
    args: Record<string, unknown>;
}>): ToolDispatcherLike {
    return {
        async dispatch(name, args) {
            calls.push({ name, args });
            return `[ok] ${name}`;
        },
    };
}

// ─── flag-off: byte-identical passthrough ────────────────────────────────────
describe('wrapDispatcherWithApprovalGate — flag off', () => {
    it('returns the exact same dispatcher reference (byte-identical, zero wrapping)', () => {
        const calls: Array<{
            name: string;
            args: Record<string, unknown>;
        }> = [];
        const base = fakeBaseDispatcher(calls);
        const broker = new FakeApprovalBroker();
        const gate = makeGate(broker);
        const wrapped = wrapDispatcherWithApprovalGate(base, { enabled: false, gate, scopeId: 'sprint-354' });
        expect(wrapped).toBe(base);
    });
    it('never calls gate.guard when disabled, even for a shell-exec command', async () => {
        const calls: Array<{
            name: string;
            args: Record<string, unknown>;
        }> = [];
        const base = fakeBaseDispatcher(calls);
        const broker = new FakeApprovalBroker();
        const gate = makeGate(broker);
        const wrapped = wrapDispatcherWithApprovalGate(base, { enabled: false, gate, scopeId: 'sprint-354' });
        const result = await wrapped.dispatch('run_bash', { cmd: 'git push --force' });
        expect(result).toBe('[ok] run_bash');
        expect(broker.submitted).toHaveLength(0);
        expect(calls).toHaveLength(1);
    });
});

// ─── flag-on: allow-flow (fake broker, real WorkerApprovalGate) ─────────────
describe('wrapDispatcherWithApprovalGate — flag on, allow flow', () => {
    it('dispatches through to the base dispatcher once the broker decides allow', async () => {
        const calls: Array<{
            name: string;
            args: Record<string, unknown>;
        }> = [];
        const base = fakeBaseDispatcher(calls);
        const broker = new FakeApprovalBroker();
        const gate = makeGate(broker);
        const wrapped = wrapDispatcherWithApprovalGate(base, { enabled: true, gate, scopeId: 'sprint-354' });
        const resultPromise = wrapped.dispatch('run_bash', { cmd: 'git push origin main' });
        expect(broker.submitted).toHaveLength(1);
        expect(broker.submitted[0].scope).toBe('git-mutation');
        const id = broker.submitted[0].id;
        broker.decide(id, { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: '2026-07-02T00:00:00.000Z' });
        expect(await resultPromise).toBe('[ok] run_bash');
        expect(calls).toHaveLength(1);
    });
    it('bypasses the gate entirely for a non-risky tool (read_file) even when enabled', async () => {
        const calls: Array<{
            name: string;
            args: Record<string, unknown>;
        }> = [];
        const base = fakeBaseDispatcher(calls);
        const broker = new FakeApprovalBroker();
        const gate = makeGate(broker);
        const wrapped = wrapDispatcherWithApprovalGate(base, { enabled: true, gate, scopeId: 'sprint-354' });
        const result = await wrapped.dispatch('read_file', { path: 'src/index.ts' });
        expect(result).toBe('[ok] read_file');
        expect(broker.submitted).toHaveLength(0);
    });
});

// ─── flag-on: deny-flow ───────────────────────────────────────────────────────
describe('wrapDispatcherWithApprovalGate — flag on, deny flow', () => {
    it('returns a structured [approval-denied] string and never calls the base dispatcher', async () => {
        const calls: Array<{
            name: string;
            args: Record<string, unknown>;
        }> = [];
        const base = fakeBaseDispatcher(calls);
        const broker = new FakeApprovalBroker();
        const gate = makeGate(broker);
        const wrapped = wrapDispatcherWithApprovalGate(base, { enabled: true, gate, scopeId: 'sprint-354' });
        const resultPromise = wrapped.dispatch('run_bash', { cmd: 'rm -rf /tmp/scratch' });
        const id = broker.submitted[0].id;
        broker.decide(id, { decision: 'deny', decidedBy: 'alperen', channel: 'terminal', decidedAt: '2026-07-02T00:00:00.000Z' });
        const result = await resultPromise;
        expect(result).toMatch(/^\[approval-denied\] tool=run_bash scope=shell-exec risk=medium/);
        expect(calls).toHaveLength(0);
    });
    it('never leaks raw secret-bearing args unmasked onto the submitted request', async () => {
        const base = fakeBaseDispatcher([]);
        const broker = new FakeApprovalBroker();
        const gate = makeGate(broker);
        const wrapped = wrapDispatcherWithApprovalGate(base, { enabled: true, gate, scopeId: 'sprint-354' });
        const resultPromise = wrapped.dispatch('run_bash', {
            cmd: 'curl -H "Authorization: Bearer sk-ABCDEFGHIJKLMNOPQRSTUVWX1234567890" https://api.example.com',
        });
        const id = broker.submitted[0].id;
        expect(JSON.stringify(broker.submitted[0].maskedArgs)).not.toContain('sk-ABCDEFGHIJKLMNOPQRSTUVWX1234567890');
        broker.decide(id, { decision: 'deny', decidedBy: 'alperen', channel: 'terminal', decidedAt: '2026-07-02T00:00:00.000Z' });
        await resultPromise;
    });
});

// ─── timeout: delegated to the gate's own FallbackResolver, not reimplemented ─
describe('wrapDispatcherWithApprovalGate — timeout delegates to the gate', () => {
    it('a never-decided request settles via the gate default fallback (deny) — no second timeout path here', async () => {
        const base = fakeBaseDispatcher([]);
        const broker = new FakeApprovalBroker();
        const gate = makeGate(broker, 5); // tiny real timeout — proves no local override races it
        const wrapped = wrapDispatcherWithApprovalGate(base, { enabled: true, gate, scopeId: 'sprint-354' });
        const result = await wrapped.dispatch('run_bash', { cmd: 'echo hi' });
        expect(result).toMatch(/^\[approval-denied\]/);
    });
});

// ─── classifyRiskyToolCall ────────────────────────────────────────────────────
describe('classifyRiskyToolCall', () => {
    it('returns null for non-run_bash tools', () => {
        expect(classifyRiskyToolCall('read_file', { path: 'x' })).toBeNull();
        expect(classifyRiskyToolCall('write_file', { path: 'x', content: 'y' })).toBeNull();
        expect(classifyRiskyToolCall('edit_file', { path: 'x', old: 'a', new: 'b' })).toBeNull();
        expect(classifyRiskyToolCall('task_done', { selfAssessment: 'DONE', notes: 'n' })).toBeNull();
    });
    it('classifies a plain shell command as shell-exec/medium (the baseline risky class)', () => {
        expect(classifyRiskyToolCall('run_bash', { cmd: 'npx tsc --noEmit' })).toEqual({
            scope: 'shell-exec',
            risk: 'medium',
            reason: 'shell command execution',
        });
    });
    it('classifies git push --force as git-mutation/critical', () => {
        const c = classifyRiskyToolCall('run_bash', { cmd: 'git push --force origin main' });
        expect(c?.scope).toBe('git-mutation');
        expect(c?.risk).toBe('critical');
    });
    it('classifies git reset --hard as git-mutation/critical', () => {
        const c = classifyRiskyToolCall('run_bash', { cmd: 'git reset --hard HEAD~1' });
        expect(c?.scope).toBe('git-mutation');
        expect(c?.risk).toBe('critical');
    });
    it('classifies plain git commit as git-mutation/high', () => {
        const c = classifyRiskyToolCall('run_bash', { cmd: 'git commit -m "wip"' });
        expect(c?.scope).toBe('git-mutation');
        expect(c?.risk).toBe('high');
    });
    it('classifies npm install as network/medium', () => {
        const c = classifyRiskyToolCall('run_bash', { cmd: 'npm install left-pad' });
        expect(c?.scope).toBe('network');
        expect(c?.risk).toBe('medium');
    });
    it('classifies curl as network/medium', () => {
        const c = classifyRiskyToolCall('run_bash', { cmd: 'curl https://example.com' });
        expect(c?.scope).toBe('network');
    });
    it('prioritizes git-mutation over network when a command matches both (git push)', () => {
        const c = classifyRiskyToolCall('run_bash', { cmd: 'git push origin main' });
        expect(c?.scope).toBe('git-mutation');
    });
    it('supports the `command` arg alias, same as the runner test-sniffer convention', () => {
        const c = classifyRiskyToolCall('run_bash', { command: 'git push --force' });
        expect(c?.scope).toBe('git-mutation');
    });
    it('RISKY_APPROVAL_SCOPES is exactly the 3 named registry-risk-consistent classes', () => {
        expect(RISKY_APPROVAL_SCOPES).toEqual(['shell-exec', 'git-mutation', 'network']);
    });
});
}
