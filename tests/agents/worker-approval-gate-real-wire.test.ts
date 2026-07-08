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
