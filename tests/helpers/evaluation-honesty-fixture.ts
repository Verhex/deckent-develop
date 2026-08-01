import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  EvaluationResult,
  Task,
  TaskResult,
} from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import type { ReconciliationDeps } from '../../src/orchestra/mid-sprint-adapter.js';

export const EVALUATION_HONESTY_ATTEMPT_ID =
  '00000000-0000-4000-8000-000000048504';

const TASK_ID = '485-004-replay';
const MATERIAL_ARTIFACT = 'scoped/evaluation-honesty-proof.ts';

export interface EvaluationHonestyFixture {
  root: string;
  task: Task;
  negativeResult: TaskResult;
  positiveResult: TaskResult;
  superficiallyPositiveFailure: EvaluationResult;
  mandatoryCriteriaPass: EvaluationResult;
  reconciliationDeps: ReconciliationDeps;
  mandatoryArtifactPath: string;
  materializePositiveControl(): void;
  cleanup(): void;
}

function evaluation(
  mandatoryArtifactPassed: boolean,
  decision: EvaluationResult['decision'] = 'GO_WITH_TECH_DEBT',
): EvaluationResult {
  return {
    decision,
    // Deliberately attractive aggregate: the mandatory per-criterion failure,
    // not a score threshold, must control the terminal decision.
    totalScore: 97,
    rubricScores: [
      {
        criterion: 'correctness',
        score: 100,
        passed: true,
        reason: 'superficially positive aggregate evidence',
      },
      {
        criterion: 'mandatory_artifact',
        score: mandatoryArtifactPassed ? 100 : 0,
        passed: mandatoryArtifactPassed,
        reason: mandatoryArtifactPassed
          ? 'exact in-scope artifact exists'
          : 'mandatory artifact is absent',
      },
      {
        criterion: 'authored_acceptance',
        score: 100,
        passed: true,
        reason: 'remaining authored checks pass',
      },
    ],
    retryCount: 0,
  };
}

export function createEvaluationHonestyFixture(): EvaluationHonestyFixture {
  const root = mkdtempSync(join(tmpdir(), 'deckent-evaluation-honesty-'));
  const tasksDir = join(root, '.tasks');
  const materialArtifactPath = join(root, MATERIAL_ARTIFACT);
  mkdirSync(tasksDir, { recursive: true });

  const task = {
    id: TASK_ID,
    title: 'Evaluation honesty replay',
    description: 'Prove exact-attempt, material-change, and mandatory-criterion gates',
    model: 'test-model',
    effort: 'high',
    priority: 'HIGH',
    reason: 'Sprint-483 deterministic negative replay',
    scope: {
      directories: ['scoped/'],
      filesRead: [],
      filesWrite: [MATERIAL_ARTIFACT],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'mandatory artifact exists; authored acceptance passes',
      noGoCriteria: 'failed tests or absent mandatory artifact',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-485',
    assignedWorker: `w-${TASK_ID}`,
  } as Task;
  writeFileSync(
    join(tasksDir, `task-${TASK_ID}.json`),
    `${JSON.stringify(task, null, 2)}\n`,
    'utf-8',
  );

  const negativeResult = {
    taskId: TASK_ID,
    workerId: `w-${TASK_ID}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 100,
    selfAssessment: 'NO_GO',
    notes: 'Explicit NO_GO: focused tests failed and the mandatory artifact is absent.',
  } as TaskResult;

  const positiveResult = {
    taskId: TASK_ID,
    workerId: `w-${TASK_ID}`,
    filesChanged: [MATERIAL_ARTIFACT],
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 100,
    selfAssessment: 'DONE',
    notes: 'Exact-attempt attributed material change passes every mandatory criterion.',
    workAttribution: {
      state: 'VERIFIED',
      attemptId: EVALUATION_HONESTY_ATTEMPT_ID,
      baselineRef: `task-result-work-attribution-baseline:sha256:${'a'.repeat(64)}`,
      baselineSha256: 'a'.repeat(64),
      scopeDigest: 'b'.repeat(64),
    },
  } as TaskResult;

  const reconciliationDeps: ReconciliationDeps = {
    getGitDiffStats: () => existsSync(materialArtifactPath)
      ? { linesChanged: 1, filesChanged: [MATERIAL_ARTIFACT] }
      : { linesChanged: 0, filesChanged: [] },
    runTscCheck: () => existsSync(materialArtifactPath),
    runVitestScopeCheck: () => ({
      passRatio: existsSync(materialArtifactPath) ? 1 : 0,
      passed: existsSync(materialArtifactPath),
    }),
  };

  return {
    root,
    task,
    negativeResult,
    positiveResult,
    superficiallyPositiveFailure: evaluation(false),
    mandatoryCriteriaPass: evaluation(true),
    reconciliationDeps,
    mandatoryArtifactPath: materialArtifactPath,
    materializePositiveControl: () => {
      mkdirSync(join(root, 'scoped'), { recursive: true });
      writeFileSync(materialArtifactPath, 'export const evaluationHonestyProof = true;\n', 'utf-8');
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
