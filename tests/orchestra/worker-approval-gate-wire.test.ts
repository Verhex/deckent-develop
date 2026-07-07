// ─── WORKER-APPROVAL-GATE-WIRE tests (sprint-380 task-380-003) ───────────────
// Hermetic (tmpdir sandbox, cleaned up in afterEach). Deliberately uses a REAL,
// disk-backed `ApprovalBroker` — not a fake — so these tests prove genuine
// `new WorkerApprovalGate(...)` instantiation + enforcement (audit §4.4 item 7:
// "WorkerApprovalGate hiç instantiate edilmiyor"), matching the goCriteria's
// "log/test-kanıtlı" requirement literally.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createOrchestraWorkerApprovalGate,
  guardRiskyWorkerAction,
  classifyRiskyWorkerCommand,
  RISKY_APPROVAL_SCOPES,
} from '../../src/orchestra/worker.js';
import { createWorkerApprovalGate, guardRiskyToolCall, createRuleStore } from '../../src/agent/permission-store.js';
import { WorkerApprovalGate } from '../../src/core/approval-worker-gate.js';
import type { Requester } from '../../src/core/approval-contract.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-workergate-wire-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function approvalsDir(projectRoot: string): string {
  return join(projectRoot, '.deckent', 'approvals');
}

// ─── classifyRiskyWorkerCommand ──────────────────────────────────────────────

describe('classifyRiskyWorkerCommand', () => {
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

// ─── createOrchestraWorkerApprovalGate — real instantiation ─────────────────

describe('createOrchestraWorkerApprovalGate', () => {
  it('returns a genuine WorkerApprovalGate instance backed by a real, disk-backed ApprovalBroker', () => {
    const projectRoot = sandbox();
    const { gate, broker } = createOrchestraWorkerApprovalGate(projectRoot, 'w-380-003');
    expect(gate).toBeInstanceOf(WorkerApprovalGate);
    expect(typeof broker.submit).toBe('function');
    // The broker's store directory is created eagerly (constructor), proving
    // this is the real fs-backed ApprovalBroker, not a fake.
    expect(existsSync(approvalsDir(projectRoot))).toBe(true);
  });
});

// ─── guardRiskyWorkerAction — real deny-on-timeout enforcement ──────────────

describe('guardRiskyWorkerAction', () => {
  it('submits a REAL request to disk and fails closed (deny) when nobody decides before the timeout', async () => {
    const projectRoot = sandbox();
    const { gate } = createOrchestraWorkerApprovalGate(projectRoot, 'w-380-003', { timeoutMs: 20 });

    const result = await guardRiskyWorkerAction(gate, 'sprint-380', 'git push --force origin main');

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
    const { gate, broker } = createOrchestraWorkerApprovalGate(projectRoot, 'w-380-003', { timeoutMs: 5_000 });

    const resultPromise = guardRiskyWorkerAction(gate, 'sprint-380', 'curl https://example.com');
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

// ─── agent/permission-store.ts — createWorkerApprovalGate + guardRiskyToolCall ─

describe('createWorkerApprovalGate (agent/permission-store.ts)', () => {
  it('returns a genuine WorkerApprovalGate instance backed by a real, disk-backed ApprovalBroker', () => {
    const cwd = sandbox();
    const requester: Requester = { role: 'worker', instanceId: 'native-loop' };
    const { gate, broker } = createWorkerApprovalGate(cwd, requester);
    expect(gate).toBeInstanceOf(WorkerApprovalGate);
    expect(typeof broker.submit).toBe('function');
    expect(existsSync(approvalsDir(cwd))).toBe(true);
  });
});

describe('guardRiskyToolCall — consumption via permission-store', () => {
  it('persists an allow verdict as an always RuleStore grant (tüket via permission-store)', async () => {
    const cwd = sandbox();
    const requester: Requester = { role: 'worker', instanceId: 'native-loop' };
    const { gate, broker } = createWorkerApprovalGate(cwd, requester, { timeoutMs: 5_000 });
    const ruleStore = createRuleStore(cwd);

    const resultPromise = guardRiskyToolCall(gate, ruleStore, 'bash', 'npm test*', {
      summary: 'bash: npm test',
      details: { tool: 'bash' },
      scopeId: 'session-1',
      scope: 'shell-exec',
      risk: 'medium',
      policy: 'require-approval',
      defaultAction: 'deny',
      rawArgs: { cmd: 'npm test' },
    });

    await Promise.resolve();
    const pendingFiles = readdirSync(approvalsDir(cwd)).filter((f) => f.endsWith('.request.json'));
    expect(pendingFiles).toHaveLength(1);
    const requestId = pendingFiles[0]!.replace('.request.json', '');
    broker.decide(requestId, { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: new Date().toISOString() });

    const result = await resultPromise;
    expect(result.verdict).toBe('allow');
    expect(result.persisted).toBe(true);
    expect(ruleStore.activeRules()).toContainEqual({ tool: 'bash', pattern: 'npm test*' });
  });

  it('never persists a deny verdict — asking again next time stays the safe default', async () => {
    const cwd = sandbox();
    const requester: Requester = { role: 'worker', instanceId: 'native-loop' };
    const { gate } = createWorkerApprovalGate(cwd, requester, { timeoutMs: 20 });
    const ruleStore = createRuleStore(cwd);

    const result = await guardRiskyToolCall(gate, ruleStore, 'bash', 'rm -rf /tmp/scratch', {
      summary: 'bash: rm -rf /tmp/scratch',
      details: { tool: 'bash' },
      scopeId: 'session-1',
      scope: 'shell-exec',
      risk: 'high',
      policy: 'require-approval',
      defaultAction: 'deny',
      rawArgs: { cmd: 'rm -rf /tmp/scratch' },
    });

    expect(result.verdict).toBe('deny');
    expect(result.persisted).toBe(false);
    expect(ruleStore.activeRules()).toHaveLength(0);
  });
});
