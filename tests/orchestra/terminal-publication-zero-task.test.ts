/**
 * A′ / ADR-D-007 bounded recovery (owner onayı, 2026-08-17) — sprint-535/536
 * chronology regression at the REAL production entrypoint.
 *
 * Chronology being pinned: an execute-handoff fault produced an EMPTY
 * logical-task set; the vacuous settled-attempts check passed on the empty
 * set, an empty "complete" terminal receipt WAS WRITTEN, and only the
 * post-publication archive guard failed — confusingly, with the receipt
 * already on disk. The correction fails closed BEFORE any byte is written:
 * zero logical tasks / unresolved evidence holds (missing or moved task
 * evidence) / non-candidate cleanup eligibility ⇒ typed HOLD, no receipt.
 * The operator-approved ABORTED path stays exempt — force-abort IS the
 * fail-closed closure mechanism for exactly these broken runs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildFinalizerTerminalTruth,
  publishFencedSprintTerminalReceipt,
  publishFencedAbortedSprintTerminalReceipt,
  FinalizerTerminalEvidenceError,
} from '../../src/orchestra/sprint-finalizer.js';
import type { Sprint, Task, TaskResult, TaskEvaluation } from '../../src/core/types.js';

function makeTask(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'terminal publication fixture',
    type: 'code-development',
    status: 'EXECUTING',
    priority: 'HIGH',
    model: 'claude-sonnet-5',
    effort: 'high',
    dependencies: [],
    scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/x.md'] },
    goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
    sprintId: 'sprint-990',
    assignedAgent: 'implementer',
    assignedSkills: [],
  } as unknown as Task;
}

function verifiedResult(taskId: string): TaskResult {
  return {
    taskId,
    selfAssessment: 'DONE',
    filesChanged: ['docs/x.md'],
    testsPassed: true,
    coverage: 95,
    evaluationDecision: 'DONE',
    notes: 'done',
    workAttribution: {
      state: 'VERIFIED',
      attemptId: `attempt-${taskId}-1`,
      baselineRef: `baseline-${taskId}`,
      scopeDigest: `scope-${taskId}`,
    },
  } as unknown as TaskResult;
}

function sprintFor(id: string, tasks: Task[]): Sprint {
  return { id, tasks } as unknown as Sprint;
}

function receiptsIn(root: string): string[] {
  const dir = join(root, '.deckent', 'recently-works');
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('-terminal-receipt.json')) : [];
}

describe('terminal receipt publication — zero-task/evidence fail-closed (535/536 chronology)', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'deckent-term-pub-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('COMPLETE publication with ZERO logical tasks is a typed HOLD and writes NO receipt (the 535/536 bug class)', () => {
    const truth = buildFinalizerTerminalTruth({ tasks: [], evaluations: new Map(), results: [] });
    expect(truth.terminalEvidence.logicalTasks.length).toBe(0);

    expect(() => publishFencedSprintTerminalReceipt({
      projectRoot: root,
      sprint: sprintFor('sprint-990', []),
      truth,
    })).toThrowError(FinalizerTerminalEvidenceError);
    try {
      publishFencedSprintTerminalReceipt({ projectRoot: root, sprint: sprintFor('sprint-990', []), truth });
    } catch (e) {
      expect((e as Error).message).toBe('TERMINAL_PUBLICATION_ZERO_TASK_HOLD');
    }
    expect(receiptsIn(root)).toEqual([]);
  });

  it('COMPLETE publication with missing/moved task evidence (unattributed hold) fails typed BEFORE any write', () => {
    const task = makeTask('990-001');
    // Result WITHOUT work attribution → logical task settles into a HOLD class,
    // which the pre-write guards refuse for a COMPLETE receipt.
    const bare = { ...verifiedResult(task.id) } as Record<string, unknown>;
    delete bare.workAttribution;
    const truth = buildFinalizerTerminalTruth({
      tasks: [task],
      evaluations: new Map([[task.id, 'DONE' as TaskEvaluation]]),
      results: [bare as unknown as TaskResult],
    });

    expect(() => publishFencedSprintTerminalReceipt({
      projectRoot: root,
      sprint: sprintFor('sprint-990', [task]),
      truth,
    })).toThrowError(FinalizerTerminalEvidenceError);
    expect(receiptsIn(root)).toEqual([]);
  });

  it('a fully settled single-task truth still publishes a COMPLETE receipt (healthy path preserved)', () => {
    const task = makeTask('990-001');
    const truth = buildFinalizerTerminalTruth({
      tasks: [task],
      evaluations: new Map([[task.id, 'DONE' as TaskEvaluation]]),
      results: [verifiedResult(task.id)],
    });

    const publication = publishFencedSprintTerminalReceipt({
      projectRoot: root,
      sprint: sprintFor('sprint-990', [task]),
      truth,
    });
    expect(publication.terminalEvidence.cleanupEligibility.candidate).toBe(true);
    expect(receiptsIn(root)).toEqual(['sprint-990-terminal-receipt.json']);
  });

  it('operator-approved ABORTED publication stays exempt — force-abort closes even a zero-task broken run', () => {
    const truth = buildFinalizerTerminalTruth({ tasks: [], evaluations: new Map(), results: [] });
    const publication = publishFencedAbortedSprintTerminalReceipt({
      projectRoot: root,
      sprint: sprintFor('sprint-991', []),
      truth,
    });
    expect(publication.receipt).toBeDefined();
    expect(receiptsIn(root)).toEqual(['sprint-991-terminal-receipt.json']);
  });
});
