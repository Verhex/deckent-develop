import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildStatusJsonSnapshot,
  projectDashboardThroughRunAuthority,
} from '../../src/cli/commands/status.js';
import { readCanonicalRunStatus } from '../../src/core/run-status-authority.js';
import { publishCanonicalRunStatusReadModel } from '../../src/core/run-status-read-model.js';
import type { DashboardState } from '../../src/core/types.js';

const SPRINT_ID = 'sprint-486';
const NOW = '2026-07-31T15:00:00.000Z';

function dashboard(): DashboardState {
  return {
    sprint: {
      id: SPRINT_ID,
      number: 486,
      phase: 'EXECUTE',
      status: 'EXECUTING',
    },
    agents: [{ id: 'stale-worker', status: 'EXECUTING' }],
    progress: { done: 99, active: 9, blocked: 0, total: 1 },
    alerts: [],
    updatedAt: NOW,
  } as DashboardState;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value), 'utf8');
}

describe('status terminal publication archive-window race', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('keeps JSON, human/watch projection inputs bounded while stale archive residue lingers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deckent-status-terminal-race-'));
    roots.push(root);
    const deckent = join(root, '.deckent');
    const tasks = join(root, '.tasks');
    await Promise.all([mkdir(join(deckent, 'pids'), { recursive: true }), mkdir(tasks)]);

    await Promise.all([
      writeJson(join(deckent, 'sprint-state.json'), {
        sprintId: SPRINT_ID,
        phase: 'RETRO',
        status: 'RETROSPECTIVE',
      }),
      writeJson(join(deckent, 'pids', `${SPRINT_ID}.pid`), {
        pid: process.pid,
        sprintId: SPRINT_ID,
        startedAt: NOW,
      }),
      // A stale checkpoint is read as resumability evidence only; it cannot publish terminal status.
      writeJson(join(deckent, `${SPRINT_ID}-checkpoint.json`), { sprintId: SPRINT_ID, stale: true }),
      writeJson(join(root, '.dashboard'), dashboard()),
      writeJson(join(tasks, 'task-486-009.json'), {
        id: '486-009', title: 'root', status: 'NO_GO', sprintId: SPRINT_ID, createdAt: NOW,
      }),
      writeJson(join(tasks, 'task-486-009-fix.json'), {
        id: '486-009-fix', title: 'repair', status: 'DONE', sprintId: SPRINT_ID,
        isPriorityFix: true, fixForTaskId: '486-009', updatedAt: '2026-07-31T15:00:01.000Z',
      }),
      writeJson(join(tasks, 'task-486-009.result'), { taskId: '486-009', selfAssessment: 'DONE' }),
      writeJson(join(tasks, 'task-486-009.hb'), { status: 'EXECUTING' }),
      writeJson(join(tasks, 'task-486-009.landing-proposal.json'), { sequence: 1 }),
      writeJson(join(tasks, 'task-486-009.json.partial'), { id: '486-009', status: 'DONE' }),
      writeFile(join(tasks, 'task-486-009.tmp'), 'partial', 'utf8'),
    ]);

    // The status surface serves ACTIVE projections only from the persisted
    // canonical read-model; arm it with the REAL publisher after all
    // run-state fixtures are on disk (same contract as status-terminal-receipt).
    publishCanonicalRunStatusReadModel(root);

    const dashPath = join(root, '.dashboard');
    const json = buildStatusJsonSnapshot(root, dashPath, {});
    const authority = readCanonicalRunStatus(root);
    const watchProjection = projectDashboardThroughRunAuthority(dashboard(), [
      {
        id: '486-009', title: 'root', status: 'NO_GO', sprintId: SPRINT_ID, createdAt: NOW,
      },
      {
        id: '486-009-fix', title: 'repair', status: 'DONE', sprintId: SPRINT_ID,
        isPriorityFix: true, fixForTaskId: '486-009', updatedAt: '2026-07-31T15:00:01.000Z',
      },
    ] as never, authority);

    expect(json).toMatchObject({
      active: true,
      lifecycle: 'ACTIVE',
      terminalPublication: { version: 1, state: 'open', receipt: null },
      progress: { done: 1, active: 0, blocked: 0, total: 1 },
      logicalProgress: { done: 1, active: 0, blocked: 0, total: 1, attemptCount: 2 },
    });
    // The human and --watch renderer both consume this projected dashboard,
    // never the stale 99/1 dashboard bytes or archive residue.
    expect(watchProjection.dashboard.progress).toEqual({ done: 1, active: 0, blocked: 0, total: 1 });
    expect(watchProjection.dashboard.progress.done).toBeLessThanOrEqual(
      watchProjection.dashboard.progress.total,
    );
    expect(watchProjection.dashboard.sprint.phase).toBe('RETRO');
  });
});
