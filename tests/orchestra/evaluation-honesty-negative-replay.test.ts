import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { reconcileSpuriousNoGo } from '../../src/orchestra/mid-sprint-adapter.js';
import {
  applyTechDebtDowngrade,
  evaluateWithRubric,
} from '../../src/orchestra/result-evaluator.js';
import { enforceRecoveryBornEvaluationHonesty } from '../../src/orchestra/sprint-phases.js';
import {
  createEvaluationHonestyFixture,
  EVALUATION_HONESTY_ATTEMPT_ID,
  type EvaluationHonestyFixture,
} from '../helpers/evaluation-honesty-fixture.js';

const fixtures: EvaluationHonestyFixture[] = [];

function fixture(): EvaluationHonestyFixture {
  const created = createEvaluationHonestyFixture();
  fixtures.push(created);
  return created;
}

afterEach(() => {
  for (const created of fixtures.splice(0)) created.cleanup();
});

describe('Sprint-483 evaluation honesty negative replay', () => {
  it('keeps explicit failure repairable and refuses score-only debt or completed settlement', async () => {
    const replay = fixture();

    expect(existsSync(replay.mandatoryArtifactPath)).toBe(false);
    const rawRubric = evaluateWithRubric(replay.negativeResult, replay.task);
    // This is the Sprint-483 trap: the aggregate scorer looks debt-eligible.
    // It is evidence input, never terminal authority by itself.
    expect(rawRubric.decision).toBe('GO_WITH_TECH_DEBT');

    const attemptedPromotion = enforceRecoveryBornEvaluationHonesty(
      replay.negativeResult,
      {
        ...replay.superficiallyPositiveFailure,
        totalScore: Math.max(rawRubric.totalScore, replay.superficiallyPositiveFailure.totalScore),
      },
    );
    expect(replay.superficiallyPositiveFailure.totalScore).toBe(97);
    expect(attemptedPromotion.decision).toBe('NO_GO');

    const spuriousRecovery = await reconcileSpuriousNoGo(
      replay.negativeResult,
      replay.task,
      replay.root,
      replay.reconciliationDeps,
    );
    expect(spuriousRecovery).toMatchObject({ decision: 'NO_GO', reconciled: false });

    const debtAttempt = applyTechDebtDowngrade(
      attemptedPromotion.decision,
      replay.negativeResult,
      1,
    );
    expect(debtAttempt).toMatchObject({ decision: 'NO_GO', downgraded: false });

    handleEvaluation(
      replay.root,
      replay.task,
      TaskEvaluation.NO_GO,
      replay.negativeResult,
    );
    const persistedTask = JSON.parse(readFileSync(
      join(replay.root, '.tasks', `task-${replay.task.id}.json`),
      'utf-8',
    )) as { status: string };
    const repairTask = JSON.parse(readFileSync(
      join(replay.root, '.tasks', `task-${replay.task.id}-fix.json`),
      'utf-8',
    )) as { status: string; fixForTaskId: string };

    expect(persistedTask.status).toBe(TaskStatus.NO_GO);
    expect(persistedTask.status).not.toBe(TaskStatus.DONE);
    expect(repairTask).toMatchObject({
      status: TaskStatus.PENDING,
      fixForTaskId: replay.task.id,
    });
  });

  it('allows spurious reconciliation only for exact-attempt material work with all criteria passing', async () => {
    const control = fixture();
    control.materializePositiveControl();

    expect(existsSync(control.mandatoryArtifactPath)).toBe(true);
    expect(control.positiveResult.workAttribution).toMatchObject({
      state: 'VERIFIED',
      attemptId: EVALUATION_HONESTY_ATTEMPT_ID,
    });
    expect(control.positiveResult.filesChanged).toEqual(control.task.scope.filesWrite);
    expect(control.positiveResult.linesAdded).toBeGreaterThan(0);
    expect(control.mandatoryCriteriaPass.rubricScores.every(score => score.passed)).toBe(true);

    const reconciled = await reconcileSpuriousNoGo(
      control.positiveResult,
      control.task,
      control.root,
      control.reconciliationDeps,
    );
    expect(reconciled).toMatchObject({
      decision: 'GO_WITH_TECH_DEBT',
      reconciled: true,
      linesChanged: 1,
      scopeCompliant: true,
      tscPassed: true,
      vitestPassRatio: 1,
    });

    expect(enforceRecoveryBornEvaluationHonesty(
      control.positiveResult,
      control.mandatoryCriteriaPass,
    ).decision).toBe('GO_WITH_TECH_DEBT');
  });
});
