import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { TaskEvaluation, type Sprint, type Task, type TaskResult } from '../../src/core/types.js';
import {
  buildFinalizerTerminalTruth,
  publishFencedSprintTerminalReceipt,
} from '../../src/orchestra/sprint-finalizer.js';

let root: string | undefined;

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

function task(id: string, dependencies: readonly string[] = []): Task {
  return {
    id,
    title: `Terminal ${id}`,
    description: 'terminal publication regression fixture',
    type: 'code-development', status: 'DONE', priority: 'NORMAL',
    model: 'gpt-5.6-terra', effort: 'medium', provider: 'codex',
    dependencies: [...dependencies], sprintId: 'sprint-703',
    scope: { directories: ['src/orchestra'], filesRead: [], filesWrite: [] },
    goNogo: { goCriteria: 'fixture', noGoCriteria: 'fixture', techDebtAcceptable: 'none' },
  } as unknown as Task;
}

function sprint(tasks: readonly Task[]): Sprint {
  return {
    id: 'sprint-703', number: 703, status: 'COMPLETE', phase: 'COMPLETE', tasks,
    workers: [],
  } as unknown as Sprint;
}

function doneResult(taskId: string, assessment: 'DONE' | 'NO_GO' = 'DONE'): TaskResult {
  return {
    taskId, workerId: `w-${taskId}`, filesChanged: ['src/orchestra/fixture.ts'],
    linesAdded: 1, linesRemoved: 0, testsPassed: assessment === 'DONE', coverage: 80,
    selfAssessment: assessment, evaluationDecision: assessment, notes: 'real terminal fixture',
    workAttribution: {
      state: 'VERIFIED', attemptId: `attempt:${taskId}`,
      baselineRef: `task-result-work-attribution-baseline:sha256:${'a'.repeat(64)}`,
      baselineSha256: 'a'.repeat(64), scopeDigest: 'b'.repeat(64),
    },
  } as TaskResult;
}

async function createRoot(tasks: readonly Task[]): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'deckent-terminal-publication-'));
  const tasksDir = join(root, '.tasks');
  await mkdir(tasksDir, { recursive: true });
  await Promise.all(tasks.map(async item => {
    await writeFile(join(tasksDir, `task-${item.id}.json`), `${JSON.stringify(item)}\n`, 'utf8');
  }));
  return root;
}

describe('sprint finalizer terminal publication regression', () => {
  it('publishes COMPLETE for settled DONE, policy-skip, and cascade-skip lineages', async () => {
    const tasks = [task('703-901'), task('703-902'), task('703-903', ['703-902'])];
    const projectRoot = await createRoot(tasks);
    const truth = buildFinalizerTerminalTruth({
      tasks,
      results: [
        doneResult('703-901'),
        {
          taskId: '703-902', workerId: 'host-703-902', filesChanged: [], linesAdded: 0,
          linesRemoved: 0, testsPassed: false, coverage: 0, selfAssessment: 'NO_GO',
          notes: 'forced skill unavailable before dispatch',
          preDispatchSettlement: {
            version: 1, state: 'NOT_DISPATCHED',
            attemptId: 'host-pre-dispatch:703-902:forced-skill',
            reasonCode: 'FORCED_SKILL_UNAVAILABLE',
            evidenceRef: `host-pre-dispatch-settlement:sha256:${'c'.repeat(64)}`,
          },
        } as TaskResult,
        {
          taskId: '703-903', workerId: 'host-703-903', filesChanged: [], linesAdded: 0,
          linesRemoved: 0, testsPassed: false, coverage: 0, selfAssessment: 'NO_GO',
          evaluationDecision: 'NO_GO', cascadeSkipped: true, notes: 'dependency cascade skip',
        } as TaskResult,
      ],
      evaluations: new Map([
        ['703-901', TaskEvaluation.DONE],
        ['703-902', TaskEvaluation.NOT_DISPATCHED],
        ['703-903', TaskEvaluation.NO_GO],
      ]),
    });

    expect(truth.terminalEvidence.cleanupEligibility).toEqual({
      state: 'CANDIDATE', candidate: true, reasons: [],
    });
    expect(truth.terminalTruth).toEqual({
      completedLineages: 1, policySkippedLineages: 1, cascadeSkippedLineages: 1,
    });
    const publication = publishFencedSprintTerminalReceipt({
      projectRoot, sprint: sprint(tasks), truth, now: () => '2026-08-27T00:00:00.000Z',
    });
    const receipt = JSON.parse(await readFile(publication.artifactPath, 'utf8')) as {
      terminalOutcome: string;
      terminalTruth: typeof truth.terminalTruth;
    };
    expect(receipt.terminalOutcome).toBe('COMPLETE');
    expect(receipt.terminalTruth).toEqual(truth.terminalTruth);
  });

  it('refuses COMPLETE for a genuine unrepaired worker NO_GO', async () => {
    const tasks = [task('703-904')];
    const projectRoot = await createRoot(tasks);
    const truth = buildFinalizerTerminalTruth({
      tasks, results: [doneResult('703-904', 'NO_GO')],
      evaluations: new Map([['703-904', TaskEvaluation.NO_GO]]),
    });

    expect(truth.terminalEvidence.cleanupEligibility.reasons).toContain('LINEAGE_NOT_COMPLETED');
    expect(() => publishFencedSprintTerminalReceipt({ projectRoot, sprint: sprint(tasks), truth }))
      .toThrow(/TERMINAL_PUBLICATION_NOT_CLEANUP_CANDIDATE_BLOCKED/);
  });

  it('refuses COMPLETE for zero-task and evidence-hold shapes', async () => {
    const projectRoot = await createRoot([]);
    const emptySprint = sprint([]);
    const zeroTaskTruth = buildFinalizerTerminalTruth({ tasks: [], results: [], evaluations: new Map() });
    expect(() => publishFencedSprintTerminalReceipt({ projectRoot, sprint: emptySprint, truth: zeroTaskTruth }))
      .toThrow('TERMINAL_PUBLICATION_ZERO_TASK_HOLD');

    const tasks = [task('703-905')];
    await createRoot(tasks);
    const evidenceHoldTruth = buildFinalizerTerminalTruth({
      tasks, results: [doneResult('703-905')],
      evaluations: new Map([['703-905', TaskEvaluation.DONE]]),
      coordinatorEvidence: [{
        evidenceId: 'held-receipt', kind: 'terminal-receipt', state: 'HOLD', evidenceRef: null,
        reasonCode: 'EVIDENCE_HELD', requiredForCleanup: true,
      }],
    });
    expect(() => publishFencedSprintTerminalReceipt({
      projectRoot: root!, sprint: sprint(tasks), truth: evidenceHoldTruth,
    })).toThrow('TERMINAL_EVIDENCE_HOLD');
  });
});
