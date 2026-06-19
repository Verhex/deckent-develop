/**
 * tests/orchestra/f10-deepen.test.ts
 *
 * F10-001/002 DEEPEN (306-007) — policy-engine RBAC+risk-gate live wire.
 *
 * Covers the wire that F10 (301) left dormant in execute-dispatcher:
 *  - RBAC layer added to policyInput (buildRbacInput builder, runtime-loop:332 pattern)
 *  - risk-gate: permit + HIGH-risk verb + risk_gate_enabled → park
 *  - activation+condition+rbac all-pass → execute
 *  - condition-false → park
 *  - viewer+shell+risk_gate:true → park (RBAC deny → parked)
 *  - admin → permit (RBAC passes → execute)
 *
 * Hermetic — tmpdir for backlog I/O, no process spawning, deterministic stubs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { makeExecuteDispatcher, AUTONOMOUS_EXECUTE_ACTION } from '../../src/orchestra/autonomous/execute-dispatcher.js';
import { loadBacklog } from '../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry, BacklogFile } from '../../src/orchestra/autonomous/backlog-types.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { TaskResult } from '../../src/core/types.js';
import type { PolicyActivationInput, PolicyConditionInput, PolicyRbacInput } from '../../src/core/policy-engine.js';
import type { TaskDNA, ActivationConfig } from '../../src/core/routing-types.js';
import { Permission } from '../../src/core/rbac.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return overrides as ResolvedConfig;
}

const doneResult: TaskResult = {
  taskId: 'tr1', selfAssessment: 'DONE', testsPassed: true,
  filesChanged: [], notes: '', linesAdded: 0, linesRemoved: 0,
};

const okEval = () => ({ decision: 'DONE' as const, quality: 100, reconciled: false, reason: 'ok' });
const okAudit = async () => ({ boundary: 'clean' as const, adr: 'ok' as const, functional: 'pass' as const });
const skipXVerify = async () => ({ ran: false });

function makeEntry(over: Partial<BacklogEntry> = {}): BacklogEntry {
  return {
    id: 'e1', title: 'test entry', kind: 'task',
    spec: { description: 'do something', scopeDir: 'src/' },
    policy: 'auto', trigger: { type: 'one-off' },
    status: 'pending', lastRun: null, lastResult: null,
    ...over,
  } as BacklogEntry;
}

function seedBacklog(dir: string, entry: BacklogEntry): string {
  const bl: BacklogFile = { _version: '1.0', entries: [entry] };
  const path = join(dir, 'backlog.json');
  writeFileSync(path, JSON.stringify(bl, null, 2), 'utf-8');
  return path;
}

/** Passing activation: implementation intent, score 80 ≥ minScore 50 → permit. */
function passingActivation(): PolicyActivationInput {
  const taskDNA: TaskDNA = {
    intent: { primary: 'implementation', secondary: [], confidence: 0.9 },
    tags: [], domains: [{ name: 'core', weight: 1.0 }],
    operations: [{ type: 'create', weight: 1.0 }],
    complexity: { fileCount: 1, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
    scope: { writeRatio: { 'src/': 1.0 }, primaryWriteTarget: 'src/', testWriteRatio: 0 },
  };
  const config: ActivationConfig = {
    rules: [{ name: 'impl', when: { 'intent.primary': 'implementation' }, score: 80 }],
    exclude: [], minScore: 50,
  };
  return { taskDNA, config };
}

/** RBAC input builder that derives role from the entry actor. */
function buildRbacFromActor(e: BacklogEntry): PolicyRbacInput | undefined {
  if (!e.actor?.role) return undefined;
  return { role: e.actor.role, action: Permission.EXECUTE, tenantId: e.actor.tenantId ?? 'local' };
}

// ─── Tmpdir ──────────────────────────────────────────────────────────────────

let tmpDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `f10-deepen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// ─── 1. activation+condition+rbac all pass → execute ─────────────────────────

describe('F10-001 execute-dispatcher — activation+condition+rbac all pass → execute', () => {
  it('activation(pass)+condition(pass)+rbac(admin,pass) → outcome=success, status=done', async () => {
    const entry = makeEntry({
      id: 'all-pass',
      actor: { id: 'admin-u', role: 'admin', tenantId: 'local' },
    });
    const backlogPath = seedBacklog(tmpDir, entry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-pass' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: makeConfig({ risk_gate_enabled: false }),
      backlogPath,
      runTask, runSprint: vi.fn(), waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      policyEngine: {
        enabled: true,
        buildActivationInput: () => passingActivation(),
        buildConditionInput: () => ({ data: { ready: true }, when: { ready: true } } satisfies PolicyConditionInput),
        buildRbacInput: buildRbacFromActor,
      },
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalled();
    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((e) => e.id === 'all-pass')?.status).toBe('done');
  });
});

// ─── 2. condition-false → park ────────────────────────────────────────────────

describe('F10-001 execute-dispatcher — condition-false → park', () => {
  it('condition gate false → entry parked, runTask not called', async () => {
    const entry = makeEntry({ id: 'cond-park' });
    const backlogPath = seedBacklog(tmpDir, entry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-cond' });

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: makeConfig(),
      backlogPath,
      runTask, runSprint: vi.fn(),
      waitForResult: vi.fn().mockResolvedValue(doneResult),
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      policyEngine: {
        enabled: true,
        buildConditionInput: () => ({ data: { ready: false }, when: { ready: true } } satisfies PolicyConditionInput),
      },
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/policy-engine.*park/i);
    expect(runTask).not.toHaveBeenCalled();
    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((e) => e.id === 'cond-park')?.status).toBe('parked');
  });
});

// ─── 3. viewer+shell+risk_gate:true → park ────────────────────────────────────

describe('F10-001/002 execute-dispatcher — viewer+shell+risk_gate:true → park', () => {
  it('viewer role (RBAC deny, EXECUTE) + shell capability → parked', async () => {
    const entry = makeEntry({
      id: 'viewer-shell',
      kind: 'capability',
      spec: { capabilityTarget: { capability: 'shell.exec' } },
      actor: { id: 'viewer-u', role: 'viewer', tenantId: 'local' },
    });
    const backlogPath = seedBacklog(tmpDir, entry);
    const runTask = vi.fn();

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: makeConfig({ risk_gate_enabled: true }),
      backlogPath,
      runTask, runSprint: vi.fn(),
      waitForResult: vi.fn(),
      policyEngine: {
        enabled: true,
        buildRbacInput: buildRbacFromActor,
      },
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    // viewer cannot EXECUTE → RBAC deny → parked
    expect(res.outcome).toBe('failure');
    expect(runTask).not.toHaveBeenCalled();
    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((e) => e.id === 'viewer-shell')?.status).toBe('parked');
  });

  it('risk-gate: permit+shell+risk_gate_enabled → park (independent of RBAC)', async () => {
    // Admin passes RBAC (verdict=permit); shell capability → HIGH risk → risk gate parks
    const entry = makeEntry({
      id: 'riskgate-shell',
      kind: 'capability',
      spec: { capabilityTarget: { capability: 'shell.exec' } },
      actor: { id: 'admin-u', role: 'admin', tenantId: 'local' },
    });
    const backlogPath = seedBacklog(tmpDir, entry);
    const runTask = vi.fn();

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: makeConfig({ risk_gate_enabled: true }),
      backlogPath,
      runTask, runSprint: vi.fn(),
      waitForResult: vi.fn(),
      policyEngine: {
        enabled: true,
        buildRbacInput: buildRbacFromActor,
      },
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    // admin RBAC passes (permit) but shell is HIGH risk + risk_gate_enabled → parked
    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/risk-gate/i);
    expect(runTask).not.toHaveBeenCalled();
    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((e) => e.id === 'riskgate-shell')?.status).toBe('parked');
  });

  it('risk-gate disabled (risk_gate_enabled:false) + shell → NOT parked (backward-safe)', async () => {
    // capability entry with shell verb — risk gate would park it if enabled.
    // With risk_gate_enabled=false, the gate never fires and the entry proceeds
    // to the dispatch path (which fails due to no capabilityRegistry — that's ok:
    // the key invariant is the entry is NOT 'parked' by the risk gate).
    const entry = makeEntry({
      id: 'riskgate-off',
      kind: 'capability',
      spec: { capabilityTarget: { capability: 'shell.exec' } },
      actor: { id: 'admin-u', role: 'admin', tenantId: 'local' },
    });
    const backlogPath = seedBacklog(tmpDir, entry);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: makeConfig({ risk_gate_enabled: false }),
      backlogPath,
      runTask: vi.fn(), runSprint: vi.fn(),
      waitForResult: vi.fn(),
      policyEngine: {
        enabled: true,
        buildRbacInput: buildRbacFromActor,
      },
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    // risk_gate_enabled=false → risk gate never fires → status is 'failed'
    // (no capabilityRegistry, not 'parked' which is what risk gate would produce)
    expect(res.outcome).toBe('failure');
    const bl = loadBacklog(backlogPath);
    const e = bl.entries.find((x) => x.id === 'riskgate-off');
    // Key: NOT 'parked' (risk gate didn't fire). It's 'failed' from missing registry.
    expect(e?.status).not.toBe('parked');
    expect(e?.status).toBe('failed');
    expect(res.error).not.toMatch(/risk-gate/);
  });
});

// ─── 4. admin → permit ────────────────────────────────────────────────────────

describe('F10-001 execute-dispatcher — admin → permit (execute)', () => {
  it('admin role + EXECUTE permission → RBAC permit → execution proceeds', async () => {
    const entry = makeEntry({
      id: 'admin-permit',
      kind: 'task',
      spec: { description: 'safe task', scopeDir: 'src/' },
      actor: { id: 'admin-u', role: 'admin', tenantId: 'local' },
    });
    const backlogPath = seedBacklog(tmpDir, entry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-admin' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: makeConfig({ risk_gate_enabled: false }),
      backlogPath,
      runTask, runSprint: vi.fn(), waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      policyEngine: {
        enabled: true,
        buildRbacInput: buildRbacFromActor,
      },
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    // admin has EXECUTE permission → RBAC permits → verdict=permit → no risk gate → execute
    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalled();
    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((e) => e.id === 'admin-permit')?.status).toBe('done');
  });

  it('operator role + EXECUTE permission → RBAC permit → execute', async () => {
    const entry = makeEntry({
      id: 'operator-permit',
      kind: 'task',
      spec: { description: 'operator task', scopeDir: 'src/' },
      actor: { id: 'op-u', role: 'operator', tenantId: 'local' },
    });
    const backlogPath = seedBacklog(tmpDir, entry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-op' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: makeConfig({ risk_gate_enabled: false }),
      backlogPath,
      runTask, runSprint: vi.fn(), waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      policyEngine: {
        enabled: true,
        buildRbacInput: buildRbacFromActor,
      },
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalled();
    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((e) => e.id === 'operator-permit')?.status).toBe('done');
  });
});

// ─── 5. policyEngine absent / disabled → backward compat ──────────────────────

describe('F10-001 execute-dispatcher — backward compatibility (no policyEngine)', () => {
  it('policyEngine absent → no gate applied, executes normally', async () => {
    const entry = makeEntry({ id: 'no-engine' });
    const backlogPath = seedBacklog(tmpDir, entry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-noengine' });

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: makeConfig({ risk_gate_enabled: true }), // risk_gate_enabled has no effect without policyEngine
      backlogPath,
      runTask, runSprint: vi.fn(),
      waitForResult: vi.fn().mockResolvedValue(doneResult),
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      // policyEngine intentionally absent
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalled();
  });

  it('policyEngine.enabled=false → gate skipped', async () => {
    const entry = makeEntry({ id: 'engine-off' });
    const backlogPath = seedBacklog(tmpDir, entry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-off2' });

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: makeConfig({ risk_gate_enabled: true }),
      backlogPath,
      runTask, runSprint: vi.fn(),
      waitForResult: vi.fn().mockResolvedValue(doneResult),
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      policyEngine: {
        enabled: false,
        buildRbacInput: () => ({ role: 'viewer', action: Permission.EXECUTE, tenantId: 'local' }),
      },
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    // enabled=false → block not entered → execute
    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalled();
  });
});
