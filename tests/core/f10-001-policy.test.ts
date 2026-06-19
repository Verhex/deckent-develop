// tests/core/f10-001-policy.test.ts
// F10-001: policy-engine activation+condition layer wire tests.
//
// Two concerns verified here:
//   1. evaluatePolicy direct — activation-score 30 + minScore 50 → 'suggest';
//      condition-gate false → 'park'. (Exercises the existing policy-engine contract.)
//   2. execute-dispatcher wire — policyEngine.enabled drives 'parked' status when
//      the condition gate fails, and proceeds for 'suggest'.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluatePolicy } from '../../src/core/policy-engine.js';
import type { PolicyInput, PolicyActivationInput, PolicyConditionInput } from '../../src/core/policy-engine.js';
import type { TaskDNA, ActivationConfig } from '../../src/core/routing-types.js';
import { makeExecuteDispatcher } from '../../src/orchestra/autonomous/execute-dispatcher.js';
import { loadBacklog } from '../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry, BacklogFile } from '../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult } from '../../src/core/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** TaskDNA for an 'implementation' intent — generic for activation testing. */
function implDNA(): TaskDNA {
  return {
    intent: { primary: 'implementation', secondary: [], confidence: 0.9 },
    tags: [],
    domains: [{ name: 'core', weight: 1.0 }],
    operations: [{ type: 'create', weight: 1.0 }],
    complexity: { fileCount: 1, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
    scope: { writeRatio: { 'src/': 1.0 }, primaryWriteTarget: 'src/', testWriteRatio: 0 },
  };
}

/**
 * Activation config where NO rule matches implDNA (intent.primary='design' ≠ 'implementation')
 * → score 0; minScore 50 → meetsMinScore=false → 'suggest'.
 */
function lowScoreActivation(): ActivationConfig {
  return {
    rules: [{ name: 'design-only', when: { 'intent.primary': 'design' }, score: 30 }],
    exclude: [],
    minScore: 50,
  };
}

const taskEntry: BacklogEntry = {
  id: 'f10-e1', title: 'test task', kind: 'task',
  spec: { description: 'do something', scopeDir: 'src/' },
  policy: 'auto', trigger: { type: 'one-off' },
  status: 'pending', lastRun: null, lastResult: null,
};

function seedBacklog(dir: string, entry: BacklogEntry): string {
  const bl: BacklogFile = { _version: '1.0', entries: [entry] };
  const path = join(dir, 'backlog.json');
  writeFileSync(path, JSON.stringify(bl, null, 2), 'utf-8');
  return path;
}

const doneResult: TaskResult = {
  taskId: 'tr1', selfAssessment: 'DONE', testsPassed: true,
  filesChanged: [], notes: '', linesAdded: 0, linesRemoved: 0,
};

// Deterministic stubs for CORE-UNIFORMITY Brain-Eval (keeps hermetic — no real disk eval).
const okEval = () => ({ decision: 'DONE' as const, quality: 100, reconciled: false, reason: 'ok' });
const okAudit = async () => ({ boundary: 'clean' as const, adr: 'ok' as const, functional: 'pass' as const });
const skipXVerify = async () => ({ ran: false });

// ─── Tmpdir ──────────────────────────────────────────────────────────────────

let tmpDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `f10-001-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// ─── 1. evaluatePolicy direct — activation layer ──────────────────────────────

describe('evaluatePolicy — activation layer', () => {
  it('score 30 < minScore 50 → suggest', () => {
    // Rule matches (score=30), minScore=50 → meetsMinScore=false → 'suggest'.
    const activation: ActivationConfig = {
      rules: [{ name: 'impl-match', when: { 'intent.primary': 'implementation' }, score: 30 }],
      exclude: [],
      minScore: 50,
    };
    const input: PolicyInput = { activation: { taskDNA: implDNA(), config: activation } };
    const result = evaluatePolicy(input);
    expect(result.decision).toBe('suggest');
    expect(result.layers.activation?.score).toBe(30);
    expect(result.layers.activation?.minScore).toBe(50);
    expect(result.layers.activation?.meetsMinScore).toBe(false);
  });

  it('score 30 ≥ minScore 20 → permit', () => {
    const activation: ActivationConfig = {
      rules: [{ name: 'impl-match', when: { 'intent.primary': 'implementation' }, score: 30 }],
      exclude: [],
      minScore: 20,
    };
    const result = evaluatePolicy({ activation: { taskDNA: implDNA(), config: activation } });
    expect(result.decision).toBe('permit');
    expect(result.layers.activation?.meetsMinScore).toBe(true);
  });
});

// ─── 2. evaluatePolicy direct — condition layer ──────────────────────────────

describe('evaluatePolicy — condition layer', () => {
  it('condition-gate false → park', () => {
    const input: PolicyInput = {
      condition: { data: { ready: false }, when: { ready: true } },
    };
    const result = evaluatePolicy(input);
    expect(result.decision).toBe('park');
    expect(result.layers.condition?.passed).toBe(false);
  });

  it('condition-gate true → permit', () => {
    const result = evaluatePolicy({
      condition: { data: { ready: true }, when: { ready: true } },
    });
    expect(result.decision).toBe('permit');
    expect(result.layers.condition?.passed).toBe(true);
  });
});

// ─── 3. execute-dispatcher wire ───────────────────────────────────────────────

describe('execute-dispatcher — policyEngine gate', () => {
  it('condition gate false → entry status=parked, outcome=failure', async () => {
    const backlogPath = seedBacklog(tmpDir, { ...taskEntry, id: 'pe-park' });
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-park' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    const conditionInput: PolicyConditionInput = { data: { ready: false }, when: { ready: true } };

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, runSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      policyEngine: {
        enabled: true,
        buildConditionInput: () => conditionInput,
      },
    });

    const res = await handler('autonomous.execute', { entry: { ...taskEntry, id: 'pe-park' } });

    // Execution must be blocked
    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/policy-engine.*park/);
    // Entry must be parked (not failed)
    const bl = loadBacklog(backlogPath);
    const e = bl.entries.find((x) => x.id === 'pe-park');
    expect(e?.status).toBe('parked');
    // runTask must NOT have been called
    expect(runTask).not.toHaveBeenCalled();
  });

  it('low activation score → suggest (advisory) — execution proceeds', async () => {
    const backlogPath = seedBacklog(tmpDir, { ...taskEntry, id: 'pe-suggest' });
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-suggest' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    // lowScoreActivation → score=0 < minScore=50 → 'suggest' (not blocking)
    const activationInput: PolicyActivationInput = { taskDNA: implDNA(), config: lowScoreActivation() };

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, runSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      policyEngine: {
        enabled: true,
        buildActivationInput: () => activationInput,
      },
    });

    const res = await handler('autonomous.execute', { entry: { ...taskEntry, id: 'pe-suggest' } });

    // 'suggest' is advisory — execution must proceed
    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalled();
    // Entry must be done (not parked)
    const bl = loadBacklog(backlogPath);
    const e = bl.entries.find((x) => x.id === 'pe-suggest');
    expect(e?.status).toBe('done');
  });

  it('policyEngine absent → backward-compat, no gate applied', async () => {
    const backlogPath = seedBacklog(tmpDir, { ...taskEntry, id: 'pe-absent' });
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-absent' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    // No policyEngine in deps — condition gate false would park, but gate doesn't run
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, runSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      // policyEngine intentionally omitted
    });

    const res = await handler('autonomous.execute', { entry: { ...taskEntry, id: 'pe-absent' } });

    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalled();
  });

  it('policyEngine.enabled=false → gate skipped even with builders provided', async () => {
    const backlogPath = seedBacklog(tmpDir, { ...taskEntry, id: 'pe-disabled' });
    const runTask = vi.fn().mockResolvedValue({ taskId: 'tr-disabled' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, runSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      runBudgetedDecay: async () => {},
      policyEngine: {
        enabled: false,
        buildConditionInput: () => ({ data: { ready: false }, when: { ready: true } }),
      },
    });

    const res = await handler('autonomous.execute', { entry: { ...taskEntry, id: 'pe-disabled' } });

    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalled();
  });
});
