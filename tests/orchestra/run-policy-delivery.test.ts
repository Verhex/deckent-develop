import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveRunPolicyFromDirectives,
  RUN_POLICY_DIRECTIVES_SECTION,
  RUN_POLICY_DIRECTIVES_SOURCE_REF,
} from '../../src/orchestra/run-policy-resolver.js';
import { buildRunPolicyAuthorityBlock } from '../../src/orchestra/prompt-god-template.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { gateRunPolicyParityVerdict, evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { safeRubricReconcile } from '../../src/orchestra/sprint-phases.js';
import { evaluateBacklogResult } from '../../src/orchestra/autonomous/backlog-eval.js';
import { buildFinalizerTerminalTruth } from '../../src/orchestra/sprint-finalizer.js';
import {
  createRunPolicyPlanAuthority,
  type EvaluationResult,
  type Task,
  type TaskEvaluation,
  type TaskResult,
} from '../../src/core/types.js';
import { DeckentError } from '../../src/core/errors.js';

const DIRECTIVES_WITH_CONTRACT = [
  '# DIRECTIVES — test wave',
  '',
  '## Goal',
  '',
  'Do the thing.',
  '',
  RUN_POLICY_DIRECTIVES_SECTION,
  '',
  '- No build or repository-wide test run during the sprint.',
  '- Effective concurrency is one; no parallel writer or',
  '  parallel full-tree verification.',
  '',
  '## Tasks',
  '',
  '- Task one',
  '',
].join('\n');

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '7140-001',
    title: 'run policy delivery',
    description: 'carry the digest-bound run policy',
    type: 'code-development',
    status: 'EXECUTING',
    priority: 'HIGH',
    model: 'gpt-5.6-sol',
    effort: 'high',
    dependencies: [],
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/run-policy-resolver.ts'],
    },
    goNogo: { goCriteria: 'delivered', noGoCriteria: 'unwired', techDebtAcceptable: '' },
    sprintId: 'sprint-7140',
    assignedAgent: 'implementer',
    assignedSkills: [],
    ...overrides,
  } as Task;
}

function extractPolicyBlock(prompt: string): string {
  const start = prompt.indexOf('## Run Execution Policy (digest-bound)');
  expect(start).toBeGreaterThan(-1);
  const rest = prompt.slice(start);
  const end = rest.indexOf('\n## ', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('resolveRunPolicyFromDirectives — plan-time producer', () => {
  it('resolves the Execution Contract section into a digest-bound authority (wrapped bullets joined)', () => {
    const authority = resolveRunPolicyFromDirectives(DIRECTIVES_WITH_CONTRACT);
    expect(authority).toBeDefined();
    expect(authority!.version).toBe(1);
    expect(authority!.sourceRef).toBe(RUN_POLICY_DIRECTIVES_SOURCE_REF);
    expect(authority!.constraints).toEqual([
      'No build or repository-wide test run during the sprint.',
      'Effective concurrency is one; no parallel writer or parallel full-tree verification.',
    ]);
    expect(authority!.policyDigest).toBe(
      createRunPolicyPlanAuthority({
        constraints: authority!.constraints,
        sourceRef: RUN_POLICY_DIRECTIVES_SOURCE_REF,
      }).policyDigest,
    );
  });

  it.each([
    '## Execution contract',
    '## execution contract',
    '## EXECUTION CONTRACT',
  ])('does not silently drop a declared policy because of heading case: %s', heading => {
    const directives = DIRECTIVES_WITH_CONTRACT.replace(RUN_POLICY_DIRECTIVES_SECTION, heading);
    const authority = resolveRunPolicyFromDirectives(directives);

    expect(authority?.constraints).toEqual([
      'No build or repository-wide test run during the sprint.',
      'Effective concurrency is one; no parallel writer or parallel full-tree verification.',
    ]);
  });

  it('returns undefined when no DIRECTIVES or no contract section exists (explicit absence)', () => {
    expect(resolveRunPolicyFromDirectives(undefined)).toBeUndefined();
    expect(resolveRunPolicyFromDirectives('')).toBeUndefined();
    expect(resolveRunPolicyFromDirectives('# DIRECTIVES\n\n## Goal\n\n- x\n')).toBeUndefined();
  });

  it('fail-closed: a declared section without bullets can never silently resolve empty', () => {
    const declaredButEmpty = `# D\n\n${RUN_POLICY_DIRECTIVES_SECTION}\n\nprose only, no bullets\n\n## Tasks\n- t\n`;
    expect(() => resolveRunPolicyFromDirectives(declaredButEmpty)).toThrow(DeckentError);
    try {
      resolveRunPolicyFromDirectives(declaredButEmpty);
    } catch (error) {
      expect((error as DeckentError).code).toBe('E_RUN_POLICY_SECTION_EMPTY');
    }
  });
});

describe('task-carried compile chain — provider-neutral, FIX-inherited, audited', () => {
  let projectRoot: string;
  const runPolicy = resolveRunPolicyFromDirectives(DIRECTIVES_WITH_CONTRACT)!;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-run-policy-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('renders the digest-bound block from the task itself and instructs the digest echo', () => {
    const task = makeTask({ runPolicy });
    const prompt = buildWorkerPrompt(task, 'AGENT', [], projectRoot);
    const block = extractPolicyBlock(prompt);
    expect(block).toContain(`Policy digest: sha256:${runPolicy.policyDigest}`);
    expect(block).toContain('No build or repository-wide test run during the sprint.');
    expect(block).toContain(`"observedPolicyDigest": "${runPolicy.policyDigest}"`);
    expect(block).toContain('"observedBy": "worker"');
  });

  it('renders NO policy block when the task carries no authority (explicit absence, no silent empty)', () => {
    const prompt = buildWorkerPrompt(makeTask(), 'AGENT', [], projectRoot);
    expect(prompt).not.toContain('## Run Execution Policy (digest-bound)');
  });

  it('provider-parity: Codex/Fable/Qwen-shaped tasks compile a byte-identical policy block', () => {
    const variants: Array<Partial<Task>> = [
      { provider: 'codex', model: 'gpt-5.6-sol' },
      { provider: 'claude', model: 'claude-fable-5' },
      { provider: 'local-llm', model: 'Qwen3.8-27B' },
    ];
    const blocks = variants.map(v =>
      extractPolicyBlock(buildWorkerPrompt(makeTask({ ...v, runPolicy }), 'AGENT', [], projectRoot)),
    );
    expect(blocks[1]).toBe(blocks[0]);
    expect(blocks[2]).toBe(blocks[0]);
    // The renderer's exact byte output is embedded unchanged in every variant.
    expect(blocks[0]).toContain(buildRunPolicyAuthorityBlock(runPolicy));
  });

  it('FIX inheritance: an attempt carrying the parent snapshot compiles the identical block', () => {
    const original = makeTask({ runPolicy });
    const fixAttempt = makeTask({
      id: '7140-001-fix1',
      isPriorityFix: true,
      fixForTaskId: original.id,
      runPolicy: original.runPolicy,
    });
    const originalBlock = extractPolicyBlock(buildWorkerPrompt(original, 'AGENT', [], projectRoot));
    const fixBlock = extractPolicyBlock(buildWorkerPrompt(fixAttempt, 'AGENT', [], projectRoot));
    expect(fixBlock).toBe(originalBlock);
  });

  it('appends the best-effort run-policy compile observation to the existing execution-authority jsonl (fail-soft surface — MASTER 9024; enforcement is the settlement parity chain)', () => {
    const task = makeTask({ runPolicy });
    buildWorkerPrompt(task, 'AGENT', [], projectRoot);
    const auditPath = join(projectRoot, '.deckent', 'runtime', 'prompt-authority', 'execution-authority.jsonl');
    expect(existsSync(auditPath)).toBe(true);
    const lines = readFileSync(auditPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    const entry = lines.find(l => l.kind === 'run-policy-authority');
    expect(entry).toMatchObject({
      schemaVersion: 1,
      kind: 'run-policy-authority',
      taskId: task.id,
      policyDigest: runPolicy.policyDigest,
      constraintCount: runPolicy.constraints.length,
      sourceRef: RUN_POLICY_DIRECTIVES_SOURCE_REF,
    });
  });
});

describe('production entrypoints — no path can bypass the parity gate (correction turu)', () => {
  const runPolicy = createRunPolicyPlanAuthority({ constraints: ['no build'], sourceRef: 'x' });

  function verificationResult(overrides: Partial<TaskResult> = {}): TaskResult {
    return {
      taskId: '7140-verify',
      selfAssessment: 'DONE',
      filesChanged: [],
      testsPassed: true,
      coverage: null,
      rubricScores: { correctness: 100, test_coverage: 100, scope_compliance: 100, documentation: 100 },
      evaluationDecision: 'DONE',
      notes: 'verified existing work — audit only',
      ...overrides,
    } as TaskResult;
  }

  function verificationTask(overrides: Partial<Task> = {}): Task {
    return makeTask({
      id: '7140-verify',
      title: 'Verify existing wiring',
      description: 'Audit and verify that the existing chain works.',
      runPolicy,
      ...overrides,
    });
  }

  it('D-1 verification fast-path + missing digest echo => NO_GO through the real evaluateWithRubric', () => {
    const evaluation = evaluateWithRubric(verificationResult(), verificationTask());
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores.at(-1)).toMatchObject({
      criterion: 'run_policy_parity',
      passed: false,
      reason: 'HOLD:missing-worker-policy-evidence',
    });
  });

  it('D-1 verification fast-path + digest mismatch => NO_GO', () => {
    const evaluation = evaluateWithRubric(
      verificationResult({ runPolicyEvidence: { version: 1, observedPolicyDigest: 'c'.repeat(64), observedBy: 'worker' } }),
      verificationTask(),
    );
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores.at(-1)).toMatchObject({ reason: 'HOLD:policy-digest-mismatch' });
  });

  it('D-1 verification fast-path + exact digest echo => DONE (fast-path preserved)', () => {
    const evaluation = evaluateWithRubric(
      verificationResult({ runPolicyEvidence: { version: 1, observedPolicyDigest: runPolicy.policyDigest, observedBy: 'worker' } }),
      verificationTask(),
    );
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.rubricScores.at(-1)).toMatchObject({ criterion: 'run_policy_parity', passed: true });
  });

  it('policy-free verification task keeps its historical fast-path DONE (no regression)', () => {
    const evaluation = evaluateWithRubric(verificationResult(), verificationTask({ runPolicy: undefined }));
    expect(evaluation.decision).toBe('DONE');
  });

  describe('rubric-fault reconstruction path (safeRubricReconcile catch)', () => {
    let projectRoot: string;

    beforeEach(() => { projectRoot = mkdtempSync(join(tmpdir(), 'deckent-rp-fault-')); });
    afterEach(() => { rmSync(projectRoot, { recursive: true, force: true }); });

    // Real fault injection: a task whose scope is structurally broken makes the
    // core rubric grader throw, driving the production catch/reconstruction path.
    function faultTask(overrides: Partial<Task> = {}): Task {
      return makeTask({ id: '7140-fault', runPolicy, ...overrides, scope: undefined as unknown as Task['scope'] });
    }

    it('reconstruction + missing digest echo => never DONE', async () => {
      const evaluation = await safeRubricReconcile(projectRoot, 'sprint-7140', faultTask(), verificationResult({ taskId: '7140-fault' }));
      expect(evaluation.decision).toBe('NO_GO');
      expect(evaluation.rubricScores.at(-1)).toMatchObject({ criterion: 'run_policy_parity', passed: false });
    });

    it('reconstruction + exact digest echo => can settle DONE (gate is parity, not a blanket veto)', async () => {
      const evaluation = await safeRubricReconcile(
        projectRoot,
        'sprint-7140',
        faultTask(),
        verificationResult({
          taskId: '7140-fault',
          runPolicyEvidence: { version: 1, observedPolicyDigest: runPolicy.policyDigest, observedBy: 'worker' },
        }),
      );
      expect(evaluation.decision).toBe('DONE');
    });

    it('backlog terminal producer routes through the same gate (policy-free entries pass through)', async () => {
      const entry = {
        id: 'bk-7140',
        title: 'Verify existing wiring',
        spec: { description: 'Audit and verify that the existing chain works.' },
        status: 'running',
        createdAt: new Date().toISOString(),
      } as unknown as Parameters<typeof evaluateBacklogResult>[0];
      const outcome = await evaluateBacklogResult(entry, verificationResult({ taskId: 'bk-7140' }), projectRoot);
      expect(outcome.decision).toBeDefined();
      expect(outcome.schemaRejected).toBe(false);
    });
  });
});

describe('correction-2 — finalizer terminal convergence veto (all finalize ingresses share this boundary)', () => {
  const runPolicy = createRunPolicyPlanAuthority({ constraints: ['no build'], sourceRef: 'x' });

  function terminalResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
    return {
      taskId,
      selfAssessment: 'DONE',
      filesChanged: ['src/x.ts'],
      testsPassed: true,
      coverage: 95,
      evaluationDecision: 'DONE',
      notes: 'done',
      ...overrides,
    } as TaskResult;
  }

  function attemptVerdict(task: Task, evaluation: TaskEvaluation, result: TaskResult): string | undefined {
    const truth = buildFinalizerTerminalTruth({
      tasks: [task],
      evaluations: new Map([[task.id, evaluation]]),
      results: [result],
    });
    const attempt = truth.attempts.find(a => a.identity.taskId === task.id);
    return attempt?.authority.state === 'TERMINAL' ? attempt.authority.verdict : undefined;
  }

  it('DONE claim + missing evidence => vetoed to NO_GO at the convergence point', () => {
    const task = makeTask({ id: '7140-fin', runPolicy });
    expect(attemptVerdict(task, 'DONE' as TaskEvaluation, terminalResult(task.id))).toBe('NO_GO');
  });

  it('DONE claim + digest mismatch => vetoed to NO_GO', () => {
    const task = makeTask({ id: '7140-fin', runPolicy });
    expect(attemptVerdict(task, 'DONE' as TaskEvaluation, terminalResult(task.id, {
      runPolicyEvidence: { version: 1, observedPolicyDigest: 'd'.repeat(64), observedBy: 'worker' },
    }))).toBe('NO_GO');
  });

  it('GO_WITH_TECH_DEBT claim + missing evidence => vetoed (a policy violation cannot settle as debt)', () => {
    const task = makeTask({ id: '7140-fin', runPolicy });
    expect(attemptVerdict(task, 'GO_WITH_TECH_DEBT' as TaskEvaluation, terminalResult(task.id))).toBe('NO_GO');
  });

  it('DONE claim + exact evidence => DONE preserved', () => {
    const task = makeTask({ id: '7140-fin', runPolicy });
    expect(attemptVerdict(task, 'DONE' as TaskEvaluation, terminalResult(task.id, {
      runPolicyEvidence: { version: 1, observedPolicyDigest: runPolicy.policyDigest, observedBy: 'worker' },
    }))).toBe('DONE');
  });

  it('tampered plan snapshot => vetoed even with a matching echo', () => {
    const tampered = { ...runPolicy, constraints: [...runPolicy.constraints, 'injected'] };
    const task = makeTask({ id: '7140-fin', runPolicy: tampered });
    expect(attemptVerdict(task, 'DONE' as TaskEvaluation, terminalResult(task.id, {
      runPolicyEvidence: { version: 1, observedPolicyDigest: tampered.policyDigest, observedBy: 'worker' },
    }))).toBe('NO_GO');
  });

  it('policy-free task => historical DONE byte-preserved', () => {
    const task = makeTask({ id: '7140-free' });
    expect(attemptVerdict(task, 'DONE' as TaskEvaluation, terminalResult(task.id))).toBe('DONE');
  });

  it('FIX attempt with inherited policy: exact evidence => DONE, missing => NO_GO', () => {
    const original = makeTask({ id: '7140-org', runPolicy });
    const fixExact = makeTask({ id: '7140-org-fix1', runPolicy, isPriorityFix: true, fixForTaskId: original.id });
    const fixMissing = makeTask({ id: '7140-org-fix2', runPolicy, isPriorityFix: true, fixForTaskId: original.id });
    expect(attemptVerdict(fixExact, 'DONE' as TaskEvaluation, terminalResult(fixExact.id, {
      runPolicyEvidence: { version: 1, observedPolicyDigest: runPolicy.policyDigest, observedBy: 'worker' },
    }))).toBe('DONE');
    expect(attemptVerdict(fixMissing, 'DONE' as TaskEvaluation, terminalResult(fixMissing.id))).toBe('NO_GO');
  });
});

describe('gateRunPolicyParityVerdict — evaluator consumer', () => {
  const runPolicy = createRunPolicyPlanAuthority({ constraints: ['no build'], sourceRef: 'x' });

  function doneCandidate(): EvaluationResult {
    return { decision: 'DONE', totalScore: 95, rubricScores: [], retryCount: 0 };
  }

  it('passes a policy-free task through untouched', () => {
    const verdict = gateRunPolicyParityVerdict(doneCandidate(), makeTask(), undefined);
    expect(verdict.decision).toBe('DONE');
    expect(verdict.rubricScores).toEqual([]);
  });

  it('downgrades DONE to typed NO_GO when the digest echo is missing', () => {
    const verdict = gateRunPolicyParityVerdict(doneCandidate(), makeTask({ runPolicy }), undefined);
    expect(verdict.decision).toBe('NO_GO');
    expect(verdict.rubricScores.at(-1)).toMatchObject({
      criterion: 'run_policy_parity',
      passed: false,
      reason: 'HOLD:missing-worker-policy-evidence',
    });
  });

  it('downgrades DONE to typed NO_GO on digest mismatch', () => {
    const verdict = gateRunPolicyParityVerdict(doneCandidate(), makeTask({ runPolicy }), {
      version: 1,
      observedPolicyDigest: 'b'.repeat(64),
      observedBy: 'worker',
    });
    expect(verdict.decision).toBe('NO_GO');
    expect(verdict.rubricScores.at(-1)).toMatchObject({ reason: 'HOLD:policy-digest-mismatch' });
  });

  it('keeps DONE and records a passing parity score on exact match', () => {
    const verdict = gateRunPolicyParityVerdict(doneCandidate(), makeTask({ runPolicy }), {
      version: 1,
      observedPolicyDigest: runPolicy.policyDigest,
      observedBy: 'worker',
    });
    expect(verdict.decision).toBe('DONE');
    expect(verdict.rubricScores.at(-1)).toMatchObject({ criterion: 'run_policy_parity', passed: true });
  });
});
