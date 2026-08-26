import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemoryStore } from '../../src/core/memory-store.js';
import {
  SprintPhase, SprintStatus, TaskStatus, type Sprint, type Task,
} from '../../src/core/types.js';
import {
  proveForceFinalizeCoordinatorRetirement,
} from '../../src/cli/commands/finalize.js';
import { forceAbortSprint } from '../../src/orchestra/sprint-finalizer.js';
import type {
  SprintRecoverySettlementIdentity,
} from '../../src/orchestra/sprint-recovery-operation.js';

const roots: string[] = [];

function makeFixture(segment: '480' | '481'): {
  root: string; sprint: Sprint; task: Task;
} {
  const root = mkdtempSync(join(tmpdir(), `deckent-retirement-${segment}-`));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  const memory = new MemoryStore(join(root, '.brain', 'memory.db'));
  memory.close();
  const sprintId = `sprint-${segment}`;
  const task: Task = {
    id: `${segment}-001`, title: 'coordinator retirement fixture', description: '',
    model: 'gpt-5.6-sol', effort: 'high', priority: 'NORMAL',
    reason: 'dual-polarity regression',
    scope: { directories: [], filesRead: [], filesWrite: [] }, dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId,
  };
  const sprint: Sprint = {
    id: sprintId, number: Number(segment), status: SprintStatus.PAUSED,
    phase: SprintPhase.FIX, tasks: [task], workers: [],
  };
  writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task));
  return { root, sprint, task };
}

function identity(sprintId: string): SprintRecoverySettlementIdentity {
  return {
    executionId: sprintId, generation: 7, taskId: sprintId,
    attemptId: `${sprintId}:recovery:7`, fenceToken: `fence-${sprintId}`,
  };
}

const terminationPolicy = {
  coordinator_termination_grace_ms: 1,
  termination_poll_interval_ms: 1,
  forced_termination_verify_ms: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('force-finalize recovery coordinator retirement', () => {
  it('sprint-480: live unowned coordinator produces terminal-red typed HOLD', async () => {
    const { root, sprint } = makeFixture('480');
    const contain = vi.fn().mockResolvedValue({
      action: 'ownership-unverified', pid: 4800, escalation: 'none',
    });

    await expect(proveForceFinalizeCoordinatorRetirement(
      root, sprint.id, identity(sprint.id), terminationPolicy, contain,
    )).rejects.toMatchObject({
      code: 'E_FORCE_FINALIZE_COORDINATOR_OWNERSHIP_HOLD',
      message: expect.stringContaining('ownership-unverified'),
    });
    expect(contain).toHaveBeenCalledOnce();
    expect(contain.mock.calls[0]?.[2]).toMatchObject({
      expectedIdentity: identity(sprint.id),
    });
  });

  it('sprint-481: dead coordinator permits terminal receipt with death proof', async () => {
    const { root, sprint } = makeFixture('481');
    const retirement = await proveForceFinalizeCoordinatorRetirement(
      root, sprint.id, identity(sprint.id), terminationPolicy,
      vi.fn().mockResolvedValue({
        action: 'already-stopped', pid: 4810, escalation: 'none',
      }),
    );
    const settlement = forceAbortSprint(root, sprint, new Map(), [], {
      runId: sprint.id, coordinatorGeneration: 7,
      coordinatorRetirementEvidence: retirement,
      requireCoordinatorRetirementEvidence: true,
    });
    const artifact = JSON.parse(readFileSync(join(
      root, '.deckent', 'recently-works', `${sprint.id}-terminal-receipt.json`,
    ), 'utf8')) as {
      terminalEvidence: { coordinatorEvidence: Array<{
        kind: string; state: string; evidenceRef?: string;
      }> };
    };

    expect(settlement.outcome).toBe('ABORTED');
    expect(artifact.terminalEvidence.coordinatorEvidence).toEqual(
      expect.arrayContaining([expect.objectContaining({
        kind: 'recovery-coordinator-retirement', state: 'VERIFIED',
        evidenceRef: expect.stringMatching(
          /generation=7;fence=fence-sprint-481;pid=4810;kill0=dead/,
        ),
      })]),
    );
  });

  it('rejects receipt publication when required retirement proof is HOLD', () => {
    const { root, sprint } = makeFixture('480');
    expect(() => forceAbortSprint(root, sprint, new Map(), [], {
      runId: sprint.id, coordinatorGeneration: 7,
      coordinatorRetirementEvidence: {
        evidenceId: `force-finalize-coordinator-retirement:${sprint.id}`,
        kind: 'recovery-coordinator-retirement', state: 'HOLD',
        reasonCode: 'ownership-unverified', requiredForCleanup: true,
      },
      requireCoordinatorRetirementEvidence: true,
    })).toThrowError('FORCE_FINALIZE_COORDINATOR_OWNERSHIP_HOLD');
  });
});
