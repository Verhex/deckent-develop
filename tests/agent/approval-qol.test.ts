// ─── APPROVAL-QOL tests (task 406-002, born-630) ─────────────────────────────
// Hermetic (tmpdir sandbox, cleaned up in afterEach), REAL disk-backed
// ApprovalBroker/ApprovalAllowScopeStore — not fakes, mirroring the existing
// convention in tests/orchestra/worker-approval-gate-wire.test.ts and
// tests/core/allowscope-compose.test.ts. Covers the 3 born-630 QoL items:
//   1. allowStore wiring — createWorkerApprovalGate() now constructs + passes
//      a real ApprovalAllowScopeStore into WorkerApprovalGate, so an existing
//      always-allow grant actually short-circuits guard() (composition-pin).
//   2. deny-cache — a process-local (scopeId, scope, cmd) cache stops a
//      repeat-denied command from reaching the broker again (no notification
//      storm), cleared on dispose().
//   3. bekleme-heartbeat — setupWorkerApprovalGateFromEnv() now refreshes the
//      task .hb file on HEARTBEAT_WRITE_INTERVAL_MS cadence for the duration
//      of each guard() wait.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkerApprovalGate } from '../../src/agent/permission-store.js';
import {
  setupWorkerApprovalGateFromEnv,
  APPROVAL_GATE_ENV,
  APPROVAL_SCOPE_ENV,
} from '../../src/agents/worker-approval-env.js';
import { createOrchestraWorkerApprovalGate, guardRiskyWorkerAction } from '../../src/agents/worker.js';
import { ApprovalAllowScopeStore } from '../../src/core/approval-allowscope.js';
import { HEARTBEAT_WRITE_INTERVAL_MS, TASKS_DIR } from '../../src/core/constants.js';
import type { WorkerActionDescriptor } from '../../src/core/approval-worker-gate.js';
import type { Requester } from '../../src/core/approval-contract.js';
import { AgentStatus, type Heartbeat } from '../../src/core/types.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-approval-qol-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function approvalsDir(projectRoot: string): string {
  return join(projectRoot, '.deckent', 'approvals');
}

function requestFiles(projectRoot: string): string[] {
  return readdirSync(approvalsDir(projectRoot)).filter((f) => f.endsWith('.request.json'));
}

const REQUESTER: Requester = { role: 'worker', instanceId: 'w-406-002' };

function buildAction(overrides: Partial<WorkerActionDescriptor> = {}): WorkerActionDescriptor {
  return {
    summary: 'run_bash: test command',
    details: { tool: 'run_bash' },
    scopeId: 'sprint-406/task-406-002',
    scope: 'shell-exec',
    risk: 'medium',
    policy: 'require-approval',
    defaultAction: 'deny',
    rawArgs: { cmd: 'echo hi' },
    ...overrides,
  };
}

// ─── item 1: allowStore wiring (composition-pin) ─────────────────────────────

describe('createWorkerApprovalGate — allowStore wiring (born-630 item 1)', () => {
  it('a live ApprovalAllowScopeStore grant short-circuits guard() to allow, without waiting on the broker', async () => {
    const cwd = sandbox();
    // A SEPARATE store instance pointed at the same cwd — simulates a grant
    // created by a different channel (e.g. a terminal "always allow" click) —
    // proves genuine disk-backed pickup by the gate setup, not an in-memory shortcut.
    const grantStore = new ApprovalAllowScopeStore(cwd);
    grantStore.grantAllow({
      scopeId: 'sprint-406/task-406-002',
      scope: 'shell-exec',
      maxRisk: 'high',
      expiresAt: '2099-01-01T00:00:00.000Z',
      grantedBy: 'alperen',
      reason: 'qol-test always-allow',
    });

    // timeoutMs=20: if allowStore were NOT actually consulted before the wait
    // (today's bug — createWorkerApprovalGate never passed it in), guard()
    // falls through to the deny-on-timeout fallback and resolves 'deny' after
    // ~20ms. Resolving 'allow' here is only possible via the allowscope
    // guard-önü short-circuit actually firing.
    const { gate } = createWorkerApprovalGate(cwd, REQUESTER, { timeoutMs: 20 });

    const verdict = await gate.guard(buildAction({ risk: 'medium' }));

    expect(verdict).toBe('allow');

    // Audit trail is never skipped — submit + decide(channel='allowscope') land on disk.
    expect(requestFiles(cwd)).toHaveLength(1);
    const decisionFile = readdirSync(approvalsDir(cwd)).find((f) => f.endsWith('.decision.json'));
    expect(decisionFile).toBeDefined();
    const decision = JSON.parse(readFileSync(join(approvalsDir(cwd), decisionFile!), 'utf-8')) as { channel: string };
    expect(decision.channel).toBe('allowscope');
  });

  it('without a live grant, the same short timeout falls through to the deny fallback (no false-positive allow)', async () => {
    const cwd = sandbox();
    const { gate } = createWorkerApprovalGate(cwd, REQUESTER, { timeoutMs: 20 });

    const verdict = await gate.guard(buildAction());

    expect(verdict).toBe('deny');
  });

  it('exposes the constructed allowStore on the handle for callers to grant into', () => {
    const cwd = sandbox();
    const { allowStore } = createWorkerApprovalGate(cwd, REQUESTER);
    expect(typeof allowStore.matchesAllow).toBe('function');
  });
});

// ─── item 2: deny-cache (no broker round-trip on repeat denial) ─────────────

describe('createWorkerApprovalGate — deny-cache (born-630 item 2)', () => {
  it('the 2nd identical (scopeId, scope, cmd) guard() call after a real deny never reaches the broker again', async () => {
    const cwd = sandbox();
    const { gate } = createWorkerApprovalGate(cwd, REQUESTER, { timeoutMs: 20 });
    const action = buildAction({ risk: 'high', rawArgs: { cmd: 'rm -rf /tmp/scratch' } });

    const first = await gate.guard(action);
    expect(first).toBe('deny');
    expect(requestFiles(cwd)).toHaveLength(1);

    await expect(gate.guard(action)).rejects.toThrow(/already denied|do not retry/i);
    // No new broker submit — the request count stays at 1.
    expect(requestFiles(cwd)).toHaveLength(1);

    // A 3rd attempt is cached too (N=1 sonrası — every attempt after the first).
    await expect(gate.guard(action)).rejects.toThrow(/already denied|do not retry/i);
    expect(requestFiles(cwd)).toHaveLength(1);
  });

  it('a different cmd under the same scopeId is NOT cached — it still reaches the broker', async () => {
    const cwd = sandbox();
    const { gate } = createWorkerApprovalGate(cwd, REQUESTER, { timeoutMs: 20 });

    const first = await gate.guard(buildAction({ rawArgs: { cmd: 'rm -rf /tmp/a' } }));
    expect(first).toBe('deny');
    expect(requestFiles(cwd)).toHaveLength(1);

    const second = await gate.guard(buildAction({ rawArgs: { cmd: 'rm -rf /tmp/b' } }));
    expect(second).toBe('deny');
    expect(requestFiles(cwd)).toHaveLength(2);
  });

  it('dispose() clears the deny-cache — a repeat command reaches the broker again afterward', async () => {
    const cwd = sandbox();
    const { gate, dispose } = createWorkerApprovalGate(cwd, REQUESTER, { timeoutMs: 20 });
    const action = buildAction({ rawArgs: { cmd: 'rm -rf /tmp/scratch' } });

    await gate.guard(action);
    expect(requestFiles(cwd)).toHaveLength(1);
    await expect(gate.guard(action)).rejects.toThrow();
    expect(requestFiles(cwd)).toHaveLength(1);

    dispose();

    const verdict = await gate.guard(action);
    expect(verdict).toBe('deny');
    expect(requestFiles(cwd)).toHaveLength(2);
  });

  it('end-to-end: guardRiskyWorkerAction (unmodified, src/agents/worker.ts) surfaces the deny-cache guidance inside the [approval-denied] tool-result text', async () => {
    const cwd = sandbox();
    const { gate } = createOrchestraWorkerApprovalGate(cwd, 'w-406-002', { timeoutMs: 20 });

    const first = await guardRiskyWorkerAction(gate, 'sprint-406/task-406-002', 'rm -rf /tmp/scratch');
    expect(first.verdict).toBe('deny');
    expect(first.deniedOutput).toMatch(/^\[approval-denied\] tool=run_bash/);
    expect(requestFiles(cwd)).toHaveLength(1);

    // Same cmd again — the deny-cache throws, guardRiskyWorkerAction's existing
    // (unmodified) catch(err) path folds err.message into the tool-result text,
    // and no second broker submit() happens.
    const second = await guardRiskyWorkerAction(gate, 'sprint-406/task-406-002', 'rm -rf /tmp/scratch');
    expect(second.verdict).toBe('deny');
    expect(second.deniedOutput).toMatch(/already denied|do not retry/i);
    expect(requestFiles(cwd)).toHaveLength(1);
  });

  it('never caches an action with no discernible cmd (conservative — avoids empty-key collisions)', async () => {
    const cwd = sandbox();
    const { gate } = createWorkerApprovalGate(cwd, REQUESTER, { timeoutMs: 20 });
    const action = buildAction({ rawArgs: undefined });

    await gate.guard(action);
    expect(requestFiles(cwd)).toHaveLength(1);
    // No throw — the 2nd call still reaches the broker since nothing was cached.
    const second = await gate.guard(action);
    expect(second).toBe('deny');
    expect(requestFiles(cwd)).toHaveLength(2);
  });
});

// ─── item 3: bekleme-heartbeat (hb refresh while guard() awaits) ────────────

describe('setupWorkerApprovalGateFromEnv — bekleme-heartbeat (born-630 item 3)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function writeInitialHb(projectRoot: string, taskId: string, sequence: number): string {
    mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
    const hbPath = join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
    const hb: Heartbeat = {
      workerId: 'w-406-002',
      taskId,
      status: AgentStatus.EXECUTING,
      currentAction: 'executing',
      timestamp: '2020-01-01T00:00:00.000Z',
      filesChangedCount: 0,
      sequence,
      progress: 10,
    };
    writeFileSync(hbPath, JSON.stringify(hb), 'utf-8');
    return hbPath;
  }

  it('refreshes the task .hb file on HEARTBEAT_WRITE_INTERVAL_MS cadence while guard() is pending, and stops once it settles', async () => {
    const projectRoot = sandbox();
    const taskId = 'hb-test-1';
    const hbPath = writeInitialHb(projectRoot, taskId, 5);

    const env = { [APPROVAL_GATE_ENV]: '1', [APPROVAL_SCOPE_ENV]: `sprint-406/${taskId}` };
    const setup = setupWorkerApprovalGateFromEnv(projectRoot, taskId, env);
    expect(setup.approvalGate).toBeDefined();

    const guardPromise = setup.approvalGate!.gate.guard(
      buildAction({ scopeId: `sprint-406/${taskId}`, rawArgs: { cmd: 'sleep 999' } }),
    );

    // Advance past 2 refresh ticks while nobody has decided — the wait is
    // still pending (default gate timeout is 5 minutes).
    await vi.advanceTimersByTimeAsync(HEARTBEAT_WRITE_INTERVAL_MS * 2 + 500);

    const hbMid = JSON.parse(readFileSync(hbPath, 'utf-8')) as Heartbeat;
    expect(hbMid.sequence).toBeGreaterThanOrEqual(5 + 2);
    expect(hbMid.currentAction).toBe('awaiting approval decision');
    // Every other field is preserved as-is.
    expect(hbMid.workerId).toBe('w-406-002');
    expect(hbMid.status).toBe(AgentStatus.EXECUTING);

    // Let the gate's own timeout/fallback settle the call.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const verdict = await guardPromise;
    expect(verdict).toBe('deny');

    const seqAfterSettle = (JSON.parse(readFileSync(hbPath, 'utf-8')) as Heartbeat).sequence;

    // No further bumps once the call has settled — the refresh timer stopped.
    await vi.advanceTimersByTimeAsync(HEARTBEAT_WRITE_INTERVAL_MS * 3);
    const seqAfterMoreTime = (JSON.parse(readFileSync(hbPath, 'utf-8')) as Heartbeat).sequence;
    expect(seqAfterMoreTime).toBe(seqAfterSettle);

    setup.dispose();
  });

  it('is a no-op (no crash) when the .hb file does not exist yet — fail-soft', async () => {
    const projectRoot = sandbox();
    const taskId = 'hb-test-2';
    mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });

    const env = { [APPROVAL_GATE_ENV]: '1', [APPROVAL_SCOPE_ENV]: `sprint-406/${taskId}` };
    const setup = setupWorkerApprovalGateFromEnv(projectRoot, taskId, env);

    const guardPromise = setup.approvalGate!.gate.guard(
      buildAction({ scopeId: `sprint-406/${taskId}`, rawArgs: { cmd: 'sleep 999' } }),
    );

    await vi.advanceTimersByTimeAsync(HEARTBEAT_WRITE_INTERVAL_MS * 2);
    expect(existsSync(join(projectRoot, TASKS_DIR, `task-${taskId}.hb`))).toBe(false);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await guardPromise;
    setup.dispose();
  });
});

// ─── regression: existing importer surfaces stay intact ────────────────────

describe('permission-store / worker-approval-env — importer regression guard', () => {
  it('createWorkerApprovalGate still returns a genuine WorkerApprovalGate-shaped handle backed by a real broker', () => {
    const cwd = sandbox();
    const { gate, broker, allowStore, dispose } = createWorkerApprovalGate(cwd, REQUESTER);
    expect(typeof gate.guard).toBe('function');
    expect(typeof broker.submit).toBe('function');
    expect(typeof allowStore.matchesAllow).toBe('function');
    expect(existsSync(approvalsDir(cwd))).toBe(true);
    expect(() => dispose()).not.toThrow();
  });

  it('setupWorkerApprovalGateFromEnv stays disabled (byte-identical) when the gate env flag is off', () => {
    const projectRoot = sandbox();
    const setup = setupWorkerApprovalGateFromEnv(projectRoot, 'task-x', {});
    expect(setup.approvalGate).toBeUndefined();
    expect(() => setup.dispose()).not.toThrow();
  });
});
