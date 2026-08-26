// ─── WORKER-APPROVAL-GATE-WIRE real-site tests (born-573 REDO, task 382-001) ─
// Hermetic (tmpdir sandbox, cleaned up in afterEach). Deliberately uses a REAL,
// disk-backed `ApprovalBroker` — not a fake — so these tests prove genuine
// `new WorkerApprovalGate(...)` instantiation + enforcement reachable from
// `src/agents/worker.ts`, the file every real worker entrypoint imports (unlike
// Sprint-1's orphan `src/orchestra/worker.ts`, which nothing in production
// ever imported).
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createOrchestraWorkerApprovalGate,
  guardRiskyWorkerAction,
  classifyRiskyWorkerCommand,
  RISKY_APPROVAL_SCOPES,
} from '../../src/agents/worker.js';
import { WorkerApprovalGate } from '../../src/core/approval-worker-gate.js';
import { buildWorkerApprovalGateEnv, setupWorkerApprovalGateFromEnv, APPROVAL_GATE_ENV, APPROVAL_SCOPE_ENV, type WorkerApprovalGateSetup } from "../../src/agents/worker-approval-env.js";
import { wrapDispatcherWithApprovalGate, type ToolDispatcherLike } from "../../src/agents/agentic-worker-tools.js";
import { createWorkerApprovalGate } from "../../src/agent/permission-store.js";
import { ApprovalBroker } from "../../src/core/approval-broker.js";
import { runWorkerEntry } from "../../src/agents/agentic-worker-entry.js";
import { resolveApprovalConfig } from "../../src/core/config.js";
import { writeFileSync } from "node:fs";

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-workergate-real-wire-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function approvalsDir(projectRoot: string): string {
  return join(projectRoot, '.deckent', 'approvals');
}

// ─── classifyRiskyWorkerCommand ──────────────────────────────────────────────

describe('classifyRiskyWorkerCommand (src/agents/worker.ts)', () => {
  it('classifies a plain shell command as shell-exec/medium (baseline risky class)', () => {
    expect(classifyRiskyWorkerCommand('npx tsc --noEmit')).toEqual({
      scope: 'shell-exec',
      risk: 'medium',
      reason: 'shell command execution',
    });
  });

  it('classifies git push --force as git-mutation/critical', () => {
    const c = classifyRiskyWorkerCommand('git push --force origin main');
    expect(c.scope).toBe('git-mutation');
    expect(c.risk).toBe('critical');
  });

  it('classifies npm install as network/medium', () => {
    const c = classifyRiskyWorkerCommand('npm install left-pad');
    expect(c.scope).toBe('network');
    expect(c.risk).toBe('medium');
  });

  it('prioritizes git-mutation over network when a command matches both (git push)', () => {
    expect(classifyRiskyWorkerCommand('git push origin main').scope).toBe('git-mutation');
  });

  it('RISKY_APPROVAL_SCOPES is exactly the 3 named registry-risk-consistent classes', () => {
    expect(RISKY_APPROVAL_SCOPES).toEqual(['shell-exec', 'git-mutation', 'network']);
  });
});

// ─── createOrchestraWorkerApprovalGate — real instantiation, reachable from the real worker module ─

describe('createOrchestraWorkerApprovalGate (src/agents/worker.ts)', () => {
  it('returns a genuine WorkerApprovalGate instance backed by a real, disk-backed ApprovalBroker', () => {
    const projectRoot = sandbox();
    const { gate, broker } = createOrchestraWorkerApprovalGate(projectRoot, 'w-382-001');
    expect(gate).toBeInstanceOf(WorkerApprovalGate);
    expect(typeof broker.submit).toBe('function');
    // The broker's store directory is created eagerly (constructor), proving
    // this is the real fs-backed ApprovalBroker, not a fake.
    expect(existsSync(approvalsDir(projectRoot))).toBe(true);
  });
});

// ─── guardRiskyWorkerAction — real deny-on-timeout / allow-on-decide enforcement ─

describe('guardRiskyWorkerAction (src/agents/worker.ts)', () => {
  it('submits a REAL request to disk and fails closed (deny) when nobody decides before the timeout', async () => {
    const projectRoot = sandbox();
    const { gate } = createOrchestraWorkerApprovalGate(projectRoot, 'w-382-001', { timeoutMs: 20 });

    const result = await guardRiskyWorkerAction(gate, 'sprint-382', 'git push --force origin main');

    expect(result.verdict).toBe('deny');
    expect(result.deniedOutput).toMatch(/^\[approval-denied\] tool=run_bash scope=git-mutation risk=critical/);

    // Real broker persistence proof — a request file, and a decision file
    // (from the fallback resolver settling the broker), landed on disk.
    const files = readdirSync(approvalsDir(projectRoot));
    expect(files.some((f) => f.endsWith('.request.json'))).toBe(true);
    expect(files.some((f) => f.endsWith('.decision.json'))).toBe(true);
  });

  it('allows and returns no deniedOutput once the real broker decides allow', async () => {
    const projectRoot = sandbox();
    const { gate, broker } = createOrchestraWorkerApprovalGate(projectRoot, 'w-382-001', { timeoutMs: 5_000 });

    const resultPromise = guardRiskyWorkerAction(gate, 'sprint-382', 'curl https://example.com');
    // Race-free: broker.submit() (inside gate.guard()) runs synchronously before
    // guard() awaits the decision, so by the time guardRiskyWorkerAction's own
    // microtask queue drains to this point the request is already persisted.
    await Promise.resolve();
    const pendingFiles = readdirSync(approvalsDir(projectRoot)).filter((f) => f.endsWith('.request.json'));
    expect(pendingFiles).toHaveLength(1);
    const requestId = pendingFiles[0]!.replace('.request.json', '');

    broker.decide(requestId, { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: new Date().toISOString() });

    const result = await resultPromise;
    expect(result.verdict).toBe('allow');
    expect(result.deniedOutput).toBeUndefined();
  });
});

// ─── src/orchestra/worker.ts re-export shim — same symbols, single definition ─

describe('src/orchestra/worker.ts re-export shim', () => {
  it('re-exports the exact same functions as src/agents/worker.ts (no duplicate definition)', async () => {
    const orchestraModule = await import('../../src/orchestra/worker.js');
    const agentsModule = await import('../../src/agents/worker.js');

    expect(orchestraModule.createOrchestraWorkerApprovalGate).toBe(agentsModule.createOrchestraWorkerApprovalGate);
    expect(orchestraModule.guardRiskyWorkerAction).toBe(agentsModule.guardRiskyWorkerAction);
    expect(orchestraModule.classifyRiskyWorkerCommand).toBe(agentsModule.classifyRiskyWorkerCommand);
    expect(orchestraModule.RISKY_APPROVAL_SCOPES).toBe(agentsModule.RISKY_APPROVAL_SCOPES);
  });
});

// WIRE-001: physically merged from tests/agents/worker-approval-dispatcher-wire.test.ts.
{
const cleanups: Array<() => void> = [];

afterEach(() => {
    while (cleanups.length > 0)
        cleanups.pop()?.();
});

function makeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'apr-wire-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    return root;
}

function recordingDispatcher(): ToolDispatcherLike & {
    calls: string[];
} {
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
            if (req)
                return req.replace('.request.json', '');
        }
        catch { /* dir not created yet */ }
        if (Date.now() > deadline)
            throw new Error('no approval request appeared');
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
    function wireEnabled(root: string): {
        setup: WorkerApprovalGateSetup;
        base: ReturnType<typeof recordingDispatcher>;
        gated: ToolDispatcherLike;
    } {
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
    }, 15000);
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
    }, 15000);
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
        const { gate } = createWorkerApprovalGate(root, { role: 'worker', instanceId: 't-race' }, { timeoutMs: 400 });
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
    }, 10000);
});

describe('entry-level chain: env → runWorkerEntry → runner opts', () => {
    function seedTask(root: string, taskId: string): void {
        mkdirSync(join(root, '.tasks'), { recursive: true });
        writeFileSync(join(root, '.tasks', `task-${taskId}.json`), JSON.stringify({ id: taskId, description: 'd', scope: {}, goNogo: {} }));
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
        expect((captured as {
            enabled: boolean;
            scopeId: string;
        }).enabled).toBe(true);
        expect((captured as {
            scopeId: string;
        }).scopeId).toBe('sprint-5/t-e1');
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
}
