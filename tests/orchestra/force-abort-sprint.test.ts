import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task } from '../../src/core/types.js';
import { forceAbortSprint } from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];

function fixture(): { root: string; sprint: Sprint; task: Task } {
  const root = mkdtempSync(join(tmpdir(), 'deckent-force-abort-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  const task: Task = {
    id: '488-003',
    title: 'Unresolved dependency producer',
    description: 'Must remain unresolved after force-finalize',
    model: 'gpt-5.6-sol',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'force-abort contract proof',
    provider: 'codex',
    authMode: 'subscription',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'done', noGoCriteria: 'unresolved', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-488',
    createdAt: '2026-08-01T00:00:00.000Z',
  };
  const sprint: Sprint = {
    id: 'sprint-488',
    number: 488,
    status: SprintStatus.PAUSED,
    phase: SprintPhase.FIX,
    tasks: [task],
    workers: [],
    startedAt: '2026-08-01T00:00:00.000Z',
  };
  writeFileSync(join(root, '.tasks', 'task-488-003.json'), JSON.stringify(task));
  writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
    sprintId: sprint.id,
    phase: sprint.phase,
    status: sprint.status,
    startedAt: sprint.startedAt,
    taskIds: [task.id],
  }));
  writeFileSync(join(root, '.deckent', 'pause-state.json'), JSON.stringify({
    sprintId: sprint.id,
    phase: sprint.phase,
    status: sprint.status,
  }));
  return { root, sprint, task };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('forceAbortSprint', () => {
  it('publishes ABORTED truth and preserves unresolved task evidence for cleanup', () => {
    const { root, sprint, task } = fixture();

    const settlement = forceAbortSprint(root, sprint, new Map(), [], {
      defaultAuthMode: 'subscription',
      runId: sprint.id,
      coordinatorGeneration: 4,
    });

    const receiptArtifact = JSON.parse(readFileSync(
      join(root, '.deckent', 'recently-works', 'sprint-488-terminal-receipt.json'),
      'utf-8',
    )) as Record<string, any>;
    const state = JSON.parse(readFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      'utf-8',
    )) as Record<string, unknown>;
    const dashboard = JSON.parse(readFileSync(join(root, '.dashboard'), 'utf-8')) as Record<string, any>;

    expect(settlement.outcome).toBe('ABORTED');
    expect(settlement.terminalTruth.logicalMetrics).toMatchObject({
      totalTasks: 1,
      completedTasks: 0,
      unevaluatedTasks: 1,
    });
    expect(receiptArtifact).toMatchObject({
      terminalOutcome: 'ABORTED',
      receipt: {
        sprintId: 'sprint-488',
        coordinatorGeneration: 4,
        terminalOutcome: 'ABORTED',
      },
      logicalProgress: { total: 1, done: 0 },
    });
    expect(receiptArtifact.terminalEvidence.cleanupEligibility.candidate).toBe(false);
    expect(state).toMatchObject({
      sprintId: 'sprint-488',
      phase: 'FIX',
      status: 'ABORTED',
    });
    expect(dashboard).toMatchObject({
      sprint: { id: 'sprint-488', phase: 'FIX', status: 'ABORTED' },
      progress: { done: 0, active: 0, blocked: 1, total: 1 },
      terminalAuthority: { sprintId: 'sprint-488', outcome: 'ABORTED' },
    });
    expect(existsSync(join(root, '.deckent', 'pause-state.json'))).toBe(false);
    expect(existsSync(join(root, '.tasks', `task-${task.id}.json`))).toBe(true);
  });
});
