// tests/cli/autonomous-v2-goaldeps.test.ts
//
// Hermetic tests for the live Type-2 goal-loop wiring (Task 297-002):
//   1. buildLiveGoalDeps — planner parses the LLM `{items:[…]}` output into
//      NewWorkItem[] (and goes dry on an empty list); accepter parses the
//      `{reached:boolean}` verdict. A fake LlmComplete is injected so the REAL
//      adapter logic (prompt build + parse) is asserted — never a live LLM.
//   2. handleStart (engine=v2) actually passes `goalDeps` into runV2Engine —
//      the wiring-gap this task closes. runV2Engine + bootstrapProviders are
//      mocked so no spawn / no real scheduler runs.

// Mock the v2 engine wire so handleStart's v2 path is captured WITHOUT running the
// real MissionScheduler. `...actual` keeps isV2Engine real (handleStart gates on it).
const { runV2Spy, runTaskModeSpy, waitForRunResultSpy, plannerResolveAdapterSpy } = vi.hoisted(() => ({
  runV2Spy: vi.fn(),
  runTaskModeSpy: vi.fn().mockResolvedValue({ taskId: 'v2-safe-task' }),
  waitForRunResultSpy: vi.fn().mockResolvedValue({ selfAssessment: 'DONE', notes: 'ok' }),
  plannerResolveAdapterSpy: vi.fn(() => { throw new Error('planner provider must not be reached'); }),
}));
vi.mock('../../src/orchestra/autonomous/mission-store/mission-engine-wire.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    runV2Engine: (...args: unknown[]) => {
      runV2Spy(...args);
      return Promise.resolve({ iterations: 0, dispatched: 0, reason: 'drained' });
    },
  };
});

vi.mock('../../src/orchestra/task-mode-runner.js', () => ({
  runTaskMode: (...args: unknown[]) => runTaskModeSpy(...args),
}));

vi.mock('../../src/cli/commands/run.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, waitForRunResult: (...args: unknown[]) => waitForRunResultSpy(...args) };
});

vi.mock('../../src/orchestra/planner.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, resolveAdapter: (...args: unknown[]) => plannerResolveAdapterSpy(...args) };
});

// Mock bootstrapProviders so the ollama HTTP probe does not run in CI (hermetic + fast).
vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [] }) };
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildLiveGoalDeps,
  handleStart,
  resolvePlannerModelIdentity,
} from '../../src/cli/commands/autonomous.js';
import type { LlmComplete } from '../../src/orchestra/autonomous/goal-planner-types.js';
import type {
  MissionDispatchClaim,
  WorkItem,
} from '../../src/orchestra/autonomous/mission-store/mission-types.js';
import { createGoalAcceptanceContract } from '../../src/orchestra/autonomous/mission-store/mission-acceptance.js';
import { GoalInvocationHeldError } from '../../src/orchestra/autonomous/mission-store/goal-mission.js';
import type { ResolvedConfig } from '../../src/core/types.js';
import { useSandboxHome } from '../helpers/sandbox-home.js';

// ─── Helpers ──────────────────────────────────────────────────────────

const dirs: string[] = [];
function mkRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'goaldeps-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Minimal settled WorkItem fixture (only the fields the adapters read). */
function wi(partial: Partial<WorkItem>): WorkItem {
  return {
    id: 'wi', missionId: 'm', kind: 'task', status: 'done', spec: null,
    policy: 'auto', renderAs: 'task', progress: null, dependsOn: [], trigger: null,
    claimedAt: null, claimedBy: null, createdAt: 'T', updatedAt: 'T', lastResult: null,
    ...partial,
  };
}

describe('resolvePlannerModelIdentity — canonical Brain role', () => {
  const config = {
    mode: 'balanced',
    projectRoot: '/hermetic/project',
    modes: {
      balanced: {
        brain_model: 'claude-fable-5',
        default_model: 'claude-sonnet-5',
      },
    },
  } as unknown as ResolvedConfig;

  it('uses the configured Brain model rather than the worker default', () => {
    expect(resolvePlannerModelIdentity(config, 'en')).toBe('claude-fable-5');
  });

  it('preserves an explicit canonical API model identity', () => {
    expect(resolvePlannerModelIdentity(config, 'en', 'gpt-5.6-sol', 'codex')).toBe('gpt-5.6-sol');
  });

  it('fails loud when an explicit provider does not own the model', () => {
    expect(() => resolvePlannerModelIdentity(config, 'en', 'claude-fable-5', 'codex')).toThrow();
  });
});

// ─── buildLiveGoalDeps — planner adapter ───────────────────────────────

describe('buildLiveGoalDeps — planner', () => {
  it('runs the injected role admission before either provider completion', async () => {
    const complete = vi.fn(async () => JSON.stringify({ items: [] }));
    const admitted: Array<{ role: string; purpose: string }> = [];
    const deps = buildLiveGoalDeps(complete, {
      admitInvocation: async (input) => {
        admitted.push(input);
        throw new GoalInvocationHeldError({
          schemaVersion: 1,
          reasonCode: 'authority_unavailable',
          evidenceRefs: [`host-role-admission:${input.purpose}`],
          invocationReceiptRef: null,
          heldAt: '2026-07-22T06:00:00.000Z',
        });
      },
    });

    await expect(deps.author('goal', [])).rejects.toBeInstanceOf(GoalInvocationHeldError);
    await expect(deps.accept('goal', [])).rejects.toBeInstanceOf(GoalInvocationHeldError);
    expect(admitted).toEqual([
      { role: 'brain', purpose: 'goal-authoring' },
      { role: 'auditor', purpose: 'goal-acceptance' },
    ]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('parses the LLM {items:[…]} output into NewWorkItem[] (id/kind/description)', async () => {
    const complete: LlmComplete = async () =>
      JSON.stringify({
        items: [
          { id: 'step-1', title: 'Step 1', kind: 'task', scopeDir: 'src/api/', summary: 'do step 1', policy: 'auto', trigger: 'one-off' },
          { id: 'step-2', title: 'Step 2', kind: 'sprint', scopeDir: 'src/', summary: 'do step 2', policy: 'auto', trigger: 'one-off' },
        ],
      });
    const deps = buildLiveGoalDeps(complete);

    const items = await deps.author('reach the goal', []);

    expect(items.map((i) => i.id)).toEqual(['step-1', 'step-2']);
    expect(items[0]!.kind).toBe('task');
    expect(items[0]!.spec?.['description']).toBe('do step 1');
    expect(items[0]!.spec?.['scopeDir']).toBe('src/api/');
    expect(items[1]!.kind).toBe('sprint');
  });

  it('returns [] when the LLM emits an empty item list (goal-reached / dry signal)', async () => {
    const complete: LlmComplete = async () => JSON.stringify({ items: [] });
    const deps = buildLiveGoalDeps(complete);

    const items = await deps.author('goal', [wi({ id: 'prev', status: 'done' })]);

    expect(items).toEqual([]);
  });

  it('tolerates a code-fenced provider envelope and still parses items', async () => {
    // realPlannerComplete-style: model text fenced + provider `.result` wrapping.
    const complete: LlmComplete = async () =>
      JSON.stringify({
        result: '```json\n{ "items": [ { "id": "a", "title": "A", "kind": "task", "scopeDir": "src/", "summary": "a", "policy": "auto", "trigger": "one-off" } ] }\n```',
      });
    const deps = buildLiveGoalDeps(complete);

    const items = await deps.author('goal', []);

    expect(items.map((i) => i.id)).toEqual(['a']);
  });

  it('feeds the goal + prior-work into the planner prompt (so the model can go dry)', async () => {
    const prompts: string[] = [];
    const complete: LlmComplete = async (p) => { prompts.push(p); return JSON.stringify({ items: [] }); };
    const deps = buildLiveGoalDeps(complete);
    const contract = createGoalAcceptanceContract('all integration tests pass exactly', {
      authoredAt: '2026-07-22T00:00:00.000Z',
      authoredBy: { surface: 'cli', actorId: null },
    });

    await deps.author(
      'ship feature X',
      [wi({ id: 'done-1', status: 'done', spec: { description: 'built X core' } })],
      contract,
    );

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('ship feature X');
    expect(prompts[0]).toContain('built X core');
    expect(prompts[0]).toContain('Runtime-admitted kinds: task');
    expect(prompts[0]).toContain(contract.digest);
    expect(prompts[0]).toContain('all integration tests pass exactly');
  });
});

// ─── buildLiveGoalDeps — accepter adapter ──────────────────────────────

describe('buildLiveGoalDeps — accepter', () => {
  it('returns true when the LLM verdict is { reached: true }', async () => {
    const deps = buildLiveGoalDeps(async () => JSON.stringify({ reached: true }));
    expect(await deps.accept('goal', [wi({ status: 'done' })])).toBe(true);
  });

  it('returns false when the LLM verdict is { reached: false }', async () => {
    const deps = buildLiveGoalDeps(async () => JSON.stringify({ reached: false }));
    expect(await deps.accept('goal', [wi({ status: 'done' })])).toBe(false);
  });

  it('defaults to false on an unparseable / ambiguous verdict (conservative)', async () => {
    const deps = buildLiveGoalDeps(async () => 'I think we are not quite there yet.');
    expect(await deps.accept('goal', [])).toBe(false);
  });

  it('injects the exact contract and returns host-provenanced criterion evidence', async () => {
    const prompts: string[] = [];
    const contract = createGoalAcceptanceContract('targeted tests pass', {
      authoredAt: '2026-07-22T00:00:00.000Z',
      authoredBy: { surface: 'cli', actorId: null },
    });
    const item = wi({
      id: 'targeted-test',
      status: 'done',
      spec: { description: 'run targeted tests' },
      lastResult: { ok: true, reason: '27 tests passed' },
    });
    const deps = buildLiveGoalDeps(async () => JSON.stringify({ items: [] }), {
      now: () => new Date('2026-07-22T00:05:00.000Z'),
      acceptanceComplete: async (prompt) => {
        prompts.push(prompt);
        return {
          output: JSON.stringify({
            outcome: 'accepted',
            criteria: [{
              criterionId: contract.criteria[0]!.id,
              verdict: 'met',
              evidenceRefs: ['work-item:targeted-test'],
              rationale: 'the durable targeted-test result records 27 passing tests',
            }],
          }),
          evaluatorRole: 'auditor',
          evaluatorInstanceId: 'goal-evaluator-live-1',
          invocationReceiptRef: {
            schemaVersion: 1,
            invocationId: 'inv-goal-accept-live-1',
            tenantId: 'local',
            projectId: 'project-test',
          },
        };
      },
    });

    const result = await deps.accept('ship', [item], contract);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(contract.digest);
    expect(prompts[0]).toContain(contract.criteria[0]!.id);
    expect(prompts[0]).toContain('targeted tests pass');
    expect(prompts[0]).toContain('evidenceRef=work-item:targeted-test');
    expect(result).toMatchObject({
      outcome: 'accepted',
      evaluator: { role: 'auditor', instanceId: 'goal-evaluator-live-1' },
      invocationReceiptRef: { invocationId: 'inv-goal-accept-live-1' },
      decidedAt: '2026-07-22T00:05:00.000Z',
      criteria: [{
        criterionId: contract.criteria[0]!.id,
        evidenceRefs: ['work-item:targeted-test'],
      }],
    });
  });

  it('does not apply the legacy positive-token regex to an explicit contract', async () => {
    const contract = createGoalAcceptanceContract('tests pass', {
      authoredAt: '2026-07-22T00:00:00.000Z',
    });
    const deps = buildLiveGoalDeps(async () => 'accepted');

    await expect(deps.accept('ship', [], contract)).resolves.toMatchObject({
      outcome: 'unknown',
      criteria: [],
      evaluator: { instanceId: null },
      invocationReceiptRef: null,
    });
  });
});

// ─── handleStart (engine=v2) wires goalDeps into runV2Engine ───────────

describe('handleStart — engine=v2 passes live goalDeps to runV2Engine', () => {
  const { beforeEach: sandboxBefore, afterEach: sandboxAfter } = useSandboxHome();
  beforeEach(sandboxBefore);
  afterEach(sandboxAfter);

  beforeEach(() => { process.exitCode = undefined; });
  afterEach(() => { process.exitCode = undefined; });

  it('passes goalDeps (with author + accept fns) into runV2Engine', async () => {
    const root = mkRoot();
    const cfgDir = join(root, '.deckent');
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(
      join(cfgDir, 'config.json'),
      JSON.stringify({ autonomous: { enabled: true, engine: 'v2' } }, null, 2),
      'utf-8',
    );
    runV2Spy.mockClear();

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await handleStart({ root, lang: 'en', maxIterations: '1' });
    } finally {
      stdout.mockRestore();
    }

    expect(runV2Spy).toHaveBeenCalledTimes(1);
    const deps = runV2Spy.mock.calls[0]![2] as { goalDeps?: { author?: unknown; accept?: unknown } };
    expect(deps.goalDeps).toBeDefined();
    expect(typeof deps.goalDeps!.author).toBe('function');
    expect(typeof deps.goalDeps!.accept).toBe('function');
  });

  it('holds production Goal author/accepter before the planner provider when authority is unavailable', async () => {
    const root = mkRoot();
    const cfgDir = join(root, '.deckent');
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(
      join(cfgDir, 'config.json'),
      JSON.stringify({ autonomous: { enabled: true, engine: 'v2' } }, null, 2),
      'utf-8',
    );
    runV2Spy.mockClear();
    plannerResolveAdapterSpy.mockClear();

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await handleStart({ root, lang: 'en', maxIterations: '1' });
    } finally {
      stdout.mockRestore();
    }

    const runtime = runV2Spy.mock.calls[0]![2] as {
      goalDeps: {
        author: (goal: string, items: WorkItem[]) => Promise<unknown>;
        accept: (goal: string, items: WorkItem[]) => Promise<unknown>;
      };
    };
    const authorError = await runtime.goalDeps.author('goal', []).catch((error: unknown) => error);
    const acceptError = await runtime.goalDeps.accept('goal', []).catch((error: unknown) => error);

    expect(authorError).toMatchObject({
      name: 'GoalInvocationHeldError',
      hold: { reasonCode: 'authority_unavailable', invocationReceiptRef: null },
    });
    expect(acceptError).toMatchObject({
      name: 'GoalInvocationHeldError',
      hold: { reasonCode: 'authority_unavailable', invocationReceiptRef: null },
    });
    expect(authorError.hold.evidenceRefs[0]).not.toBe(acceptError.hold.evidenceRefs[0]);
    expect(plannerResolveAdapterSpy).not.toHaveBeenCalled();
  });

  it('parks v2 task work before Task JSON or provider spawn when host authority is unavailable', async () => {
    const root = mkRoot();
    const cfgDir = join(root, '.deckent');
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(
      join(cfgDir, 'config.json'),
      JSON.stringify({ autonomous: { enabled: true, engine: 'v2' } }, null, 2),
      'utf-8',
    );
    runV2Spy.mockClear();
    runTaskModeSpy.mockClear();
    waitForRunResultSpy.mockClear();

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await handleStart({ root, lang: 'en', maxIterations: '1' });
    } finally {
      stdout.mockRestore();
    }

    const deps = runV2Spy.mock.calls[0]![2] as {
      runTask: (
        ctx: { description: string; projectRoot: string },
        claim: MissionDispatchClaim,
      ) => Promise<unknown>;
    };
    const claim = Object.freeze({
      schemaVersion: 1 as const,
      workItemId: 'safe-task',
      missionId: 'safe-mission',
      claimedBy: 'scheduler',
      claimedAt: '2026-07-22T00:00:00.000Z',
      itemRevision: 1,
      attemptId: 'attempt-1',
      fenceToken: 'host-private',
      fenceTokenHash: 'a'.repeat(64),
      claimRegistryRevision: 'goal-v2-production-v2',
      claimRegistryDigest: 'b'.repeat(64),
    });
    const result = await deps.runTask({ description: 'safe task', projectRoot: root }, claim);

    expect(result).toEqual({
      ok: false,
      dispatchDisposition: 'parked',
      reason: 'MISSION_WORKER_INVOCATION_AUTHORITY_UNAVAILABLE',
      authorityEvidenceRef: `mission-dispatch-claim:${claim.fenceTokenHash}`,
      invocationReceiptRef: null,
    });
    expect(runTaskModeSpy).not.toHaveBeenCalled();
    expect(waitForRunResultSpy).not.toHaveBeenCalled();
  });
});
