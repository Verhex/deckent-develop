import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createGoNoGoCriterionItem,
  TaskStatus,
  type Task,
} from '../../src/core/types.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import {
  assertExactPlanDependencies,
  assertExactPlanTaskUnchanged,
  captureExactPlanTaskAuthority,
  computeExactPlanDrift,
  ExactPlanSpawnAuthorityError,
  readSpawnTaskAuthority,
  routeSprintTasksForExecution,
} from '../../src/orchestra/sprint-spawner.js';
import { buildSpawnRetryHint, summarizeSpawnAttemptFailures } from '../../src/orchestra/sprint-utils.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-exact-plan-spawn-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: '461-001',
    title: 'Exact task',
    description: 'Execute only the approved task.',
    status: TaskStatus.PENDING,
    dependencies: [],
    scope: {
      directories: ['src/'],
      filesWrite: ['src/exact.ts'],
      filesRead: [],
    },
    ...overrides,
  } as Task;
}

const authority = {
  flowId: 'flow-exact',
  revision: 1,
  planDigest: 'digest-exact',
} as const;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('exact plan spawn authority', () => {
  it('accepts already-canonical dependencies without mutating the approved tasks', () => {
    const tasks = [
      task(),
      task({
        id: '461-002',
        title: 'Dependent task',
        dependencies: ['461-001'],
      }),
    ];
    const before = JSON.stringify(tasks);

    expect(() => assertExactPlanDependencies(tasks)).not.toThrow();
    expect(JSON.stringify(tasks)).toBe(before);
  });

  it('rejects a title dependency that would mutate after approval', () => {
    const tasks = [
      task(),
      task({
        id: '461-002',
        title: 'Dependent task',
        dependencies: ['Exact task'],
      }),
    ];

    expect(() => assertExactPlanDependencies(tasks)).toThrowError(
      expect.objectContaining<Partial<ExactPlanSpawnAuthorityError>>({
        code: 'EXACT_PLAN_DEPENDENCY_DRIFT',
      }),
    );
  });

  it('requires the materialized task artifact and rejects semantic drift', () => {
    const root = makeRoot();
    const approved = task();

    expect(() => readSpawnTaskAuthority(root, approved, authority)).toThrowError(
      expect.objectContaining<Partial<ExactPlanSpawnAuthorityError>>({
        code: 'EXACT_PLAN_TASK_ARTIFACT_MISSING',
        taskId: approved.id,
      }),
    );

    writeFileSync(
      join(root, '.tasks', `task-${approved.id}.json`),
      JSON.stringify({ ...approved, model: 'different-model' }),
      'utf8',
    );
    expect(() => readSpawnTaskAuthority(root, approved, authority)).toThrowError(
      expect.objectContaining<Partial<ExactPlanSpawnAuthorityError>>({
        code: 'EXACT_PLAN_TASK_ARTIFACT_DRIFT',
        taskId: approved.id,
      }),
    );
  });

  it('ignores prompt-build runtime fields when an exact spawn is retried', () => {
    const root = makeRoot();
    const approved = task({
      model: 'gpt-5.6-sol',
      assignedAgent: 'implementer',
      assignedSkills: [],
      goNogo: {
        goCriteria: 'The exact task is implemented.',
        noGoCriteria: 'The exact task is not implemented.',
        techDebtAcceptable: 'none',
        items: [
          createGoNoGoCriterionItem({
            polarity: 'go',
            statement: 'The exact task is implemented.',
            evidenceRequirements: ['The exact task is implemented.'],
          }),
          createGoNoGoCriterionItem({
            polarity: 'no-go',
            statement: 'The exact task is not implemented.',
            evidenceRequirements: ['The exact task is not implemented.'],
          }),
        ],
      },
    });
    writeFileSync(
      join(root, '.tasks', `task-${approved.id}.json`),
      JSON.stringify(approved),
      'utf8',
    );

    buildWorkerPrompt(approved, undefined, [], root);

    expect(approved.estimatedTokens).toBeTypeOf('number');
    expect(approved.promptCompilePlanId).toMatch(/^prompt-compile-plan:sha256:/u);
    expect(readSpawnTaskAuthority(root, approved, authority)).toEqual(
      expect.not.objectContaining({
        estimatedTokens: expect.anything(),
        promptCompilePlanId: expect.anything(),
      }),
    );

    expect(() => buildWorkerPrompt(approved, undefined, [], root)).not.toThrow();
  });

  it('allows legacy disk refresh but rejects exact runtime route mutation', () => {
    const root = makeRoot();
    const approved = task();
    const patched = { ...approved, assignedAgent: 'reviewer' };
    writeFileSync(
      join(root, '.tasks', `task-${approved.id}.json`),
      JSON.stringify(patched),
      'utf8',
    );

    expect(readSpawnTaskAuthority(root, approved)).toEqual(patched);
    const before = captureExactPlanTaskAuthority(approved, authority);
    approved.provider = 'claude';
    expect(() => assertExactPlanTaskUnchanged(approved, before)).toThrowError(
      expect.objectContaining<Partial<ExactPlanSpawnAuthorityError>>({
        code: 'EXACT_PLAN_RUNTIME_ROUTE_DRIFT',
        taskId: approved.id,
      }),
    );
  });

  it('does not re-route or mutate a digest-bound exact task at the execution boundary', () => {
    const approved = task({
      model: 'gpt-5.6-terra',
      provider: undefined,
      assignedAgent: 'core-architect',
      assignedSkills: ['typescript-expert'],
    });
    const before = JSON.stringify(approved);

    routeSprintTasksForExecution(
      [approved],
      {
        worker_provider: 'claude',
        skill_routing: { default: 'claude' },
      } as never,
      ['claude'],
      { projectRoot: '/unused', sprintId: 'sprint-481' },
      authority,
    );

    expect(JSON.stringify(approved)).toBe(before);
    expect(approved.provider).toBeUndefined();
  });
});

// ═══ Drift diagnosability (RECOVERY-DO-DOGFOOD visibility, 2026-08-09) ═══════
// The first real dogfood run died on a bare EXACT_PLAN_TASK_ARTIFACT_DRIFT: no
// task id in the operator output, no drifting field, and the spawn-retry hint
// blamed provider credentials. These pins hold the diagnosis in place.
describe('computeExactPlanDrift — field-level diagnosis', () => {
  it('reports nothing when the plan task and the disk artifact agree', () => {
    const t = { id: '1', model: 'm', scope: { filesWrite: ['a.ts'] } };
    expect(computeExactPlanDrift(t, { ...t })).toEqual([]);
  });

  it('names the exact top-level field, with both sides', () => {
    const drift = computeExactPlanDrift(
      { id: '1', model: 'plan-model' },
      { id: '1', model: 'disk-model' },
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]!.path).toBe('model');
    expect(drift[0]!.planValue).toContain('plan-model');
    expect(drift[0]!.diskValue).toContain('disk-model');
  });

  it('recurses one level so a nested scope drift is named scope.filesWrite', () => {
    const drift = computeExactPlanDrift(
      { scope: { filesWrite: ['a.ts'], filesRead: ['r.ts'] } },
      { scope: { filesWrite: ['b.ts'], filesRead: ['r.ts'] } },
    );
    expect(drift.map((d) => d.path)).toEqual(['scope.filesWrite']);
  });

  it('marks a field missing on one side as (absent) rather than silently skipping', () => {
    const drift = computeExactPlanDrift({ id: '1' }, { id: '1', extra: 'x' });
    expect(drift).toHaveLength(1);
    expect(drift[0]!.path).toBe('extra');
    expect(drift[0]!.planValue).toBe('(absent)');
  });

  it('truncates a huge value so the operator message stays readable', () => {
    const drift = computeExactPlanDrift({ big: 'x'.repeat(500) }, { big: 'y' });
    expect(drift[0]!.planValue.length).toBeLessThan(200);
    expect(drift[0]!.planValue.endsWith('…')).toBe(true);
  });
});

describe('ExactPlanSpawnAuthorityError — operator-facing message', () => {
  it('keeps the code as the first token so message.includes(code) consumers still match', () => {
    const err = new ExactPlanSpawnAuthorityError('EXACT_PLAN_TASK_ARTIFACT_DRIFT', 't-1', [
      { path: 'model', planValue: '"a"', diskValue: '"b"' },
    ]);
    expect(err.message.startsWith('EXACT_PLAN_TASK_ARTIFACT_DRIFT')).toBe(true);
    expect(err.message).toContain('t-1');
    expect(err.message).toContain('model');
    expect(err.message).toContain('"b"');
    expect(err.driftFields).toHaveLength(1);
  });

  it('stays a bare code when there is nothing extra to say (back-compat)', () => {
    expect(new ExactPlanSpawnAuthorityError('EXACT_PLAN_DEPENDENCY_DRIFT').message)
      .toBe('EXACT_PLAN_DEPENDENCY_DRIFT');
  });
});

// The hint is the CROSS-SURFACE half: start / run / runs / do / goal / process all
// render the same spawn-phase error, so fixing the remedy here fixes it everywhere.
describe('buildSpawnRetryHint — exact-plan refusals are not credential faults', () => {
  const sprint = { tasks: [{ id: '1' }] } as unknown as Parameters<typeof buildSpawnRetryHint>[1];

  it('EXACT_PLAN drift gets the artifact-identity remedy, NOT "check provider credentials"', () => {
    const hint = buildSpawnRetryHint(
      new Error('EXACT_PLAN_TASK_ARTIFACT_DRIFT (task 492-001) — 1 field(s) drifted: model: plan="a" disk="b"'),
      sprint,
    );
    expect(hint).toMatch(/artifact-identity refusal/u);
    expect(hint).toMatch(/stale `\.tasks\/task-\*\.json`/u);
    expect(hint).not.toMatch(/check provider credentials/u);
  });

  it('applies to every exact-plan code, including the missing-artifact case', () => {
    const hint = buildSpawnRetryHint(new Error('EXACT_PLAN_TASK_ARTIFACT_MISSING (task 1)'), sprint);
    expect(hint).toMatch(/artifact-identity refusal/u);
    expect(hint).not.toMatch(/check provider credentials/u);
  });

  it('a genuinely unknown spawn error still falls back to the generic hint', () => {
    expect(buildSpawnRetryHint(new Error('socket hang up'), sprint))
      .toMatch(/check provider credentials/u);
  });
});

// RECOVERY-DO-DOGFOOD retry-error visibility (measured 2026-08-09): runSpawnPhase
// retries spawn twice and its catch swallowed the FIRST attempt's error entirely —
// only the second reached the operator. The cost was measured: attempt 2 reported
// EXACT_PLAN_TASK_ARTIFACT_DRIFT, which was itself a retry artifact (buildWorkerPrompt
// mutated the approved task during attempt 1), so the reported error MASKED the real
// first-attempt spawn failure. It was absent from the detached child log too, making
// the root cause unrecoverable from artifacts. Same diagnosability class as #112.
describe('summarizeSpawnAttemptFailures — every attempt stays visible', () => {
  it('names each attempt and its error in order', () => {
    const summary = summarizeSpawnAttemptFailures([
      new Error('worker spawn refused: docker daemon unreachable'),
      new Error('EXACT_PLAN_TASK_ARTIFACT_DRIFT (task 493-001)'),
    ]);
    expect(summary).toMatch(/attempt 1/u);
    expect(summary).toMatch(/docker daemon unreachable/u);
    expect(summary).toMatch(/attempt 2/u);
    expect(summary).toMatch(/EXACT_PLAN_TASK_ARTIFACT_DRIFT/u);
    // Attempt 1 must precede attempt 2 so the ORIGINAL failure reads first.
    expect(summary.indexOf('attempt 1')).toBeLessThan(summary.indexOf('attempt 2'));
  });

  it('is empty for a single attempt — nothing was hidden, so nothing is added', () => {
    expect(summarizeSpawnAttemptFailures([new Error('only failure')])).toBe('');
  });

  it('is empty when there are no recorded attempts', () => {
    expect(summarizeSpawnAttemptFailures([])).toBe('');
  });

  it('carries a non-Error rejection without throwing', () => {
    const summary = summarizeSpawnAttemptFailures(['string rejection', new Error('second')]);
    expect(summary).toMatch(/string rejection/u);
    expect(summary).toMatch(/second/u);
  });

  it('preserves the error code when one is present', () => {
    const coded = Object.assign(new Error('provider ingress hold'), { code: 'E_INGRESS_HOLD' });
    expect(summarizeSpawnAttemptFailures([coded, new Error('second')])).toMatch(/E_INGRESS_HOLD/u);
  });
});
