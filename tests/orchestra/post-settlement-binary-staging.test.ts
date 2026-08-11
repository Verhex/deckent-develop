/**
 * 519-004 (row 3275) — source verification and built-binary proof are SEPARATE
 * planner authority stages.
 *
 * Root cause this file is the regression base for (measured, sprint-487):
 * a plan had exactly two proof surfaces —
 *   (a) IN-SPRINT: `**Smoke:** <cmd> → <expect>` (documented in task-builder as a
 *       "real-binary command") → `Task.smoke`, executed host-side by
 *       `verifyProofOfFunction` inside `runEvaluatePhase`; plus free-text
 *       `goNogo.goCriteria` / `testTarget`;
 *   (b) POST-SETTLEMENT: `- PromotionProof:` → `Task.postSettlementProjection`
 *       (488-013/014).
 * Nothing at plan time classified WHICH stage a proof belonged to, so a built-CLI
 * proof (`node dist/cli/entry.js …`) was accepted verbatim as an in-sprint
 * criterion — while a sprint is forbidden from building. Every retry therefore
 * evaluated against a stale `dist/`: impossible by construction, not by accident.
 *
 * Pins:
 *   1. an in-sprint binary demand is rejected TYPED (never silently dropped —
 *      it is restated as a bounded post-settlement obligation);
 *   2. a post-settlement obligation round-trips into the plan artifacts
 *      (directive → parsed task → `createTask` → the `.tasks/task-*.json` write shape);
 *   3. today's normal tasks plan byte-identically (staging is a provable no-op).
 *
 * Nothing here grants a sprint permission to build: the restatement is metadata
 * on the post-settlement stage, never an in-sprint command and never a Task.
 *
 * Hermetic: pure functions only — no disk I/O, no spawn, no network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseStructuredDirectives,
  createTask,
  extractSmoke,
  extractPromotionProofDeclaration,
  classifyBuiltBinaryProofDemand,
  stageBuiltBinaryProofObligation,
  stageDirectiveProofObligations,
} from '../../src/orchestra/task-builder.js';
import { lintProofStaging, type ProofStagingLintTask } from '../../src/orchestra/planner.js';
import { createPostSettlementPlanProjection } from '../../src/core/task-types.js';
import type { CreateTaskParams, TaskScope } from '../../src/core/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

const SCOPE: TaskScope = {
  directories: ['src/cli/'],
  filesRead: [],
  filesWrite: ['src/cli/entry.ts'],
};

/** The sprint-487 shape: an in-sprint smoke that can only run against a built dist/. */
const DIRECTIVE_BINARY_SMOKE = [
  '## Task 1: 519-001 — native REPL entry',
  '- Model: claude-sonnet-5',
  '- Effort: normal',
  '- Files: src/cli/entry.ts',
  '- Scope: src/cli/',
  '',
  '### Description',
  'Wire the default entry to open the REPL.',
  '',
  '- Smoke: node dist/cli/entry.js serve --port 3211 → 200',
].join('\n');

/** A source-satisfiable smoke — today's normal task. */
const DIRECTIVE_SOURCE_SMOKE = [
  '## Task 1: 519-002 — REPL default route',
  '- Model: claude-sonnet-5',
  '- Effort: normal',
  '- Files: src/cli/entry.ts',
  '- Scope: src/cli/',
  '',
  '### Description',
  'Rename an internal route table.',
  '',
  '- Smoke: npx vitest run tests/cli/default-repl.test.ts → 3 passed',
].join('\n');

const DIRECTIVE_NO_PROOF = [
  '## Task 1: 519-003 — internal refactor',
  '- Model: claude-haiku-4-5-20251001',
  '- Effort: low',
  '- Files: src/cli/entry.ts',
  '- Scope: src/cli/',
  '',
  '### Description',
  'Rename a few internal types — no user surface.',
].join('\n');

/** Explicit author intent: the obligation is already on the post-settlement stage. */
const DIRECTIVE_DECLARED_PROMOTION_PROOF = [
  '## Task 1: 519-004 — packaged CLI proof',
  '- Model: claude-sonnet-5',
  '- Effort: normal',
  '- Files: src/cli/entry.ts',
  '- Scope: src/cli/',
  '',
  '### Description',
  'Ship the packaged CLI entry.',
  '',
  '- PromotionProof: sprint/linux node dist/cli/entry.js --version',
  '- Smoke: node dist/cli/entry.js serve --port 3211 → 200',
].join('\n');

function baseParams(overrides: Partial<CreateTaskParams> = {}): CreateTaskParams {
  return {
    title: 'test task',
    description: 'test description',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: SCOPE,
    dependencies: [],
    goNogo: { goCriteria: 'passes', noGoCriteria: 'fails', techDebtAcceptable: 'no' },
    sprintId: 'sprint-519',
    ...overrides,
  };
}

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The staging warning is deliberately loud; keep the test output readable.
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stderrSpy.mockRestore();
});

// ─── 1. Classification: which stage does a proof belong to? ───────────

describe('classifyBuiltBinaryProofDemand — source verification vs built-binary proof', () => {
  it.each([
    ['node dist/cli/entry.js serve --port 3211', 'dist-artifact'],
    ['./dist/cli/entry.js --version', 'dist-artifact'],
    ['yarn build && node ./bin/deckent', 'build-command'],
    ['npm run rebuild', 'build-command'],
    ['npm pack && tar -tf deckent-1.0.0.tgz', 'package-artifact'],
    ['npm install -g deckent', 'global-install'],
  ])('classifies %s as a built-binary demand (%s)', (command, signal) => {
    const demand = classifyBuiltBinaryProofDemand(command);
    expect(demand).toBeDefined();
    expect(demand!.signal).toBe(signal);
    expect(command).toContain(demand!.token);
  });

  it.each([
    'npx tsc --noEmit',
    'npx vitest run tests/orchestra/post-settlement-binary-staging.test.ts',
    'npx eslint src/orchestra/planner.ts',
    'node --test tests/cli/entry.test.ts',
    'grep -rn "distribute" src/cli/',
  ])('treats %s as source verification (no demand)', (command) => {
    expect(classifyBuiltBinaryProofDemand(command)).toBeUndefined();
  });
});

// ─── 2. An in-sprint binary demand is rejected — typed, never dropped ──

describe('in-sprint built-binary demand is rejected with a typed finding', () => {
  it('a Smoke needing the built binary never becomes an in-sprint criterion', () => {
    const staging = stageDirectiveProofObligations(DIRECTIVE_BINARY_SMOKE, SCOPE, '519-001', {
      enforce: true,
    });

    // Rejected from the in-sprint stage…
    expect(staging.smoke).toBeUndefined();
    expect(staging.enforced).toBe(true);

    // …and typed, not silent.
    expect(staging.findings).toHaveLength(1);
    const finding = staging.findings[0]!;
    expect(finding.severity).toBe('BLOCK');
    expect(finding.code).toBe('IN_SPRINT_BUILT_BINARY_DEMAND');
    expect(finding.surface).toBe('smoke');
    expect(finding.signal).toBe('dist-artifact');
    expect(finding.demand).toBe('node dist/cli/entry.js serve --port 3211');
    expect(finding.taskRef).toBe('519-001');

    // The operator is told, every time.
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(String(stderrSpy.mock.calls[0]![0])).toContain('IN_SPRINT_BUILT_BINARY_DEMAND');
  });

  it('the rejected demand is restated as a bounded post-settlement obligation', () => {
    const staging = stageDirectiveProofObligations(DIRECTIVE_BINARY_SMOKE, SCOPE, '519-001', {
      enforce: true,
    });

    const obligation = staging.postSettlementProjection;
    expect(obligation).toBeDefined();
    // Nothing is dropped: the exact argv survives the restatement.
    expect(obligation!.command.executable).toBe('node');
    expect(obligation!.command.args).toEqual(['dist/cli/entry.js', 'serve', '--port', '3211']);
    expect(obligation!.command.cwdRef).toBe('src/cli/');
    expect(obligation!.platformCapability).toBe('any');
    expect(obligation!.ingress).toBe('sprint');
    expect(obligation!.contractDigest).toMatch(/^[0-9a-f]{64}$/);

    // The finding carries the same restatement, so a consumer that blocks the plan
    // still holds the obligation it must move rather than losing it.
    expect(staging.findings[0]!.stagedObligation).toEqual(obligation);
  });

  it('an explicitly declared PromotionProof wins over the restaged smoke', () => {
    const staging = stageDirectiveProofObligations(DIRECTIVE_DECLARED_PROMOTION_PROOF, SCOPE, undefined, {
      enforce: true,
    });

    expect(staging.smoke).toBeUndefined();
    expect(staging.postSettlementProjection).toEqual(
      extractPromotionProofDeclaration(DIRECTIVE_DECLARED_PROMOTION_PROOF, SCOPE),
    );
    expect(staging.postSettlementProjection!.command.args).toEqual([
      'dist/cli/entry.js',
      '--version',
    ]);
    expect(staging.findings[0]!.code).toBe('IN_SPRINT_BUILT_BINARY_DEMAND');
  });

  it('parseStructuredDirectives raises the demand loudly while the gate is advisory', () => {
    // ADR-G-020 V1.0 posture: the new authority gate warns + emits before it blocks.
    // Two fixtures still author an in-sprint dist/ smoke as the expected shape
    // (planner-smoke-wire.test.ts, planner-smoke-e2e.test.ts) and are outside this
    // task's write authority, so the parse output stays byte-identical for now —
    // but the demand is never silent.
    const parsed = parseStructuredDirectives(DIRECTIVE_BINARY_SMOKE);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.smoke).toEqual({
      command: 'node dist/cli/entry.js serve --port 3211',
      expect: '200',
    });
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(String(stderrSpy.mock.calls[0]![0])).toContain('IN_SPRINT_BUILT_BINARY_DEMAND');

    // The advisory pass never invents an obligation behind the operator's back…
    const advisory = stageDirectiveProofObligations(DIRECTIVE_BINARY_SMOKE, SCOPE, '519-001');
    expect(advisory.enforced).toBe(false);
    expect(advisory.postSettlementProjection).toBeUndefined();
    expect(advisory.findings).toHaveLength(1);

    // …and the exact split the hard-flip will apply is already decided and typed.
    expect(advisory.findings[0]!.stagedObligation!.command.args[0]).toBe('dist/cli/entry.js');
  });

  it('lintProofStaging blocks an executable in-sprint demand and warns on prose', () => {
    const tasks: ProofStagingLintTask[] = [
      {
        id: '519-001',
        scope: SCOPE,
        smoke: { command: 'node dist/cli/entry.js serve --port 3211', expect: '200' },
      },
      { id: '519-002', scope: SCOPE, testTarget: 'node dist/cli/entry.js --version' },
      {
        id: '519-003',
        scope: SCOPE,
        goNogo: {
          goCriteria: 'the built CLI at dist/cli/entry.js prints the version',
          noGoCriteria: 'the command exits non-zero',
        },
      },
    ];

    const findings = lintProofStaging(tasks);
    expect(findings).toHaveLength(3);

    const smokeFinding = findings.find(f => f.surface === 'smoke')!;
    expect(smokeFinding.severity).toBe('BLOCK');
    expect(smokeFinding.code).toBe('IN_SPRINT_BUILT_BINARY_DEMAND');
    expect(smokeFinding.taskRef).toBe('519-001');
    expect(smokeFinding.stagedObligation!.command.executable).toBe('node');

    const testTargetFinding = findings.find(f => f.surface === 'testTarget')!;
    expect(testTargetFinding.severity).toBe('BLOCK');
    expect(testTargetFinding.stagedObligation).toBeDefined();

    // Prose is not argv — flagged, but no command is synthesized from a sentence.
    const proseFinding = findings.find(f => f.surface === 'goCriteria')!;
    expect(proseFinding.severity).toBe('WARN');
    expect(proseFinding.signal).toBe('dist-artifact');
    expect(proseFinding.stagedObligation).toBeUndefined();
  });

  it('a criterion that FORBIDS touching the build output is never read as a demand', () => {
    const findings = lintProofStaging([
      {
        id: '519-004',
        scope: SCOPE,
        goNogo: {
          goCriteria: 'source-only change; npx tsc --noEmit passes',
          noGoCriteria: 'no dist/cli/entry.js mutation occurs during the sprint',
        },
      },
    ]);
    expect(findings).toEqual([]);
  });
});

// ─── 3. A post-settlement obligation round-trips into the plan artifacts ─

describe('post-settlement obligation round-trips into the plan artifacts', () => {
  it('directive → parsed task → createTask → task-JSON write shape', () => {
    const pt = parseStructuredDirectives(DIRECTIVE_DECLARED_PROMOTION_PROOF)[0]!;
    const staged = stageDirectiveProofObligations(
      DIRECTIVE_DECLARED_PROMOTION_PROOF,
      pt.scope,
      pt.title,
      { enforce: true },
    );
    const task = createTask(
      baseParams({
        title: pt.title,
        scope: pt.scope,
        smoke: staged.smoke,
        postSettlementProjection: pt.postSettlementProjection,
      }),
      4,
    );

    expect(task.postSettlementProjection).toEqual(pt.postSettlementProjection);
    // It rides ON a task; it never becomes executable in-sprint work.
    expect(task.smoke).toBeUndefined();

    // sprint-planner writes JSON.stringify(task, null, 2) — assert the exact
    // disk artifact keeps the digest-bound obligation intact.
    const onDisk = JSON.parse(JSON.stringify(task)) as typeof task;
    expect(onDisk.postSettlementProjection).toEqual(task.postSettlementProjection);

    // The digest is reproducible from the contract alone — nothing was re-authored.
    const recomputed = createPostSettlementPlanProjection({
      ingress: onDisk.postSettlementProjection!.ingress,
      scope: onDisk.postSettlementProjection!.scope,
      platformCapability: onDisk.postSettlementProjection!.platformCapability,
      command: onDisk.postSettlementProjection!.command,
    });
    expect(recomputed.contractDigest).toBe(task.postSettlementProjection!.contractDigest);
  });

  it('a restaged demand survives the same round-trip', () => {
    const pt = parseStructuredDirectives(DIRECTIVE_BINARY_SMOKE)[0]!;
    const staged = stageDirectiveProofObligations(DIRECTIVE_BINARY_SMOKE, pt.scope, pt.title, {
      enforce: true,
    });
    const task = createTask(
      baseParams({ title: pt.title, scope: pt.scope, postSettlementProjection: staged.postSettlementProjection }),
      5,
    );
    const onDisk = JSON.parse(JSON.stringify(task)) as typeof task;
    expect(onDisk.postSettlementProjection!.command.args).toEqual([
      'dist/cli/entry.js',
      'serve',
      '--port',
      '3211',
    ]);
  });

  it('a correctly staged task produces no findings at all', () => {
    const pt = parseStructuredDirectives(DIRECTIVE_DECLARED_PROMOTION_PROOF)[0]!;
    const findings = lintProofStaging([
      {
        id: '519-005',
        scope: pt.scope,
        goNogo: { goCriteria: 'npx tsc --noEmit passes', noGoCriteria: 'type check fails' },
        postSettlementProjection: pt.postSettlementProjection,
      },
    ]);
    expect(findings).toEqual([]);
  });

  it('stageBuiltBinaryProofObligation refuses an empty command instead of inventing one', () => {
    expect(stageBuiltBinaryProofObligation({ commandText: '   ', scope: SCOPE })).toBeUndefined();
  });
});

// ─── 4. Today's normal tasks plan byte-identically ────────────────────

describe("today's normal tasks plan byte-identically", () => {
  it.each([
    ['source-satisfiable smoke', DIRECTIVE_SOURCE_SMOKE],
    ['no proof directive at all', DIRECTIVE_NO_PROOF],
  ])('staging is a provable no-op for a task with a %s', (_label, directive) => {
    const staging = stageDirectiveProofObligations(directive, SCOPE, 'normal-task');

    // Byte-identical to what the two extractors produced before the staging pass.
    expect(JSON.stringify(staging.smoke ?? null)).toBe(
      JSON.stringify(extractSmoke(directive) ?? null),
    );
    expect(JSON.stringify(staging.postSettlementProjection ?? null)).toBe(
      JSON.stringify(extractPromotionProofDeclaration(directive, SCOPE) ?? null),
    );
    expect(staging.findings).toEqual([]);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('a source-satisfiable smoke still flows through to task.smoke', () => {
    const pt = parseStructuredDirectives(DIRECTIVE_SOURCE_SMOKE)[0]!;
    expect(pt.smoke).toEqual({
      command: 'npx vitest run tests/cli/default-repl.test.ts',
      expect: '3 passed',
    });
    expect(pt.postSettlementProjection).toBeUndefined();

    const task = createTask(baseParams({ title: pt.title, scope: pt.scope, smoke: pt.smoke }), 6);
    expect(task.smoke).toEqual(pt.smoke);
    expect(task.postSettlementProjection).toBeUndefined();
  });

  it('lintProofStaging is silent for a normal source-verification task', () => {
    expect(
      lintProofStaging([
        {
          id: '519-006',
          scope: SCOPE,
          testTarget: 'npx vitest run tests/cli/default-repl.test.ts',
          smoke: { command: 'npx vitest run tests/cli/default-repl.test.ts', expect: '3 passed' },
          goNogo: {
            goCriteria: 'npx tsc --noEmit passes and the targeted test file passes',
            noGoCriteria: 'the type check or the targeted test fails',
          },
        },
      ]),
    ).toEqual([]);
  });
});
