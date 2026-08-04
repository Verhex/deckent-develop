import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildStatusJsonSnapshot } from '../../src/cli/commands/status.js';
import { publishCanonicalRunStatusReadModel } from '../../src/core/run-status-read-model.js';

const SPRINT_ID = 'sprint-487';
const DIGEST = 'a'.repeat(64);
const roots: string[] = [];

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value), 'utf8');
}

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'deckent-status-terminal-receipt-'));
  roots.push(root);
  await mkdir(join(root, '.deckent', 'recently-works'), { recursive: true });
  await mkdir(join(root, '.tasks'), { recursive: true });
  return root;
}

function receipt(sprintId = SPRINT_ID): Record<string, unknown> {
  return {
    version: 1,
    sprintId,
    runId: 'run-487',
    coordinatorGeneration: 1,
    logicalSettlementDigest: DIGEST,
    priorAuthorityVersion: 0,
    authorityVersion: 1,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

/**
 * The status surface projects `terminalPublication` ONLY from the persisted
 * canonical run-status read-model matching the current run authority
 * (RECOVERY-BORN-488-STATUS-PROJECTION-001); it never re-projects the receipt
 * CLI-locally. Each case therefore persists the read-model with the REAL
 * production publisher — whose terminalPublication comes from the SAME shared
 * projection (core/sprint-terminal-publication-status) the finalizer uses —
 * after all run-state fixtures are on disk. Hand-faked receipts never enter
 * the surface: an absent/stale read-model honestly renders null/UNAVAILABLE.
 */
function armPersistedReadModel(root: string): void {
  publishCanonicalRunStatusReadModel(root);
}

describe('CLI terminal receipt status projection', () => {
  it('keeps canonical COMPLETE and its receipt when stale dashboard and task residue remain', async () => {
    const root = await createRoot();
    await Promise.all([
      writeJson(join(root, '.deckent', 'sprint-state.json'), {
        sprintId: SPRINT_ID, phase: 'COMPLETE', status: 'COMPLETE',
      }),
      writeJson(join(root, '.deckent', 'recently-works', `${SPRINT_ID}-terminal-receipt.json`), receipt()),
      writeJson(join(root, '.dashboard'), {
        sprint: { id: SPRINT_ID, number: 487, phase: 'EXECUTE', status: 'EXECUTING' },
        agents: [{ id: 'stale-worker', status: 'EXECUTING' }],
        progress: { done: 0, active: 9, blocked: 0, total: 1 }, alerts: [], updatedAt: '2026-07-31T16:00:00.000Z',
      }),
      writeJson(join(root, '.tasks', 'task-487-001.json'), {
        id: '487-001', title: 'stale task', status: 'EXECUTING', sprintId: SPRINT_ID,
      }),
    ]);
    armPersistedReadModel(root);

    const snapshot = buildStatusJsonSnapshot(root, join(root, '.dashboard'), {});

    expect(snapshot).toMatchObject({
      active: false,
      lifecycle: 'COMPLETE',
      terminalPublication: {
        version: 1, state: 'receipt-observed',
        receipt: { sprintId: SPRINT_ID, logicalSettlementDigest: DIGEST },
      },
    });
    expect(snapshot).not.toHaveProperty('progress');
  });

  it('projects logical progress from task lineages rather than stale dashboard progress', async () => {
    const root = await createRoot();
    await Promise.all([
      writeJson(join(root, '.deckent', 'sprint-state.json'), {
        sprintId: SPRINT_ID, phase: 'RETRO', status: 'RETROSPECTIVE',
      }),
      writeJson(join(root, '.deckent', 'recently-works', `${SPRINT_ID}-terminal-receipt.json`), receipt()),
      writeJson(join(root, '.dashboard'), {
        sprint: { id: SPRINT_ID, number: 487, phase: 'EXECUTE', status: 'EXECUTING' },
        agents: [], progress: { done: 12, active: 1, blocked: 0, total: 1 }, alerts: [], updatedAt: '2026-07-31T16:00:00.000Z',
      }),
      writeJson(join(root, '.tasks', 'task-487-001.json'), {
        id: '487-001', title: 'root', status: 'NO_GO', sprintId: SPRINT_ID, createdAt: '2026-07-31T16:00:00.000Z',
      }),
      writeJson(join(root, '.tasks', 'task-487-001-fix.json'), {
        id: '487-001-fix', title: 'fix', status: 'DONE', sprintId: SPRINT_ID,
        isPriorityFix: true, fixForTaskId: '487-001', updatedAt: '2026-07-31T16:00:01.000Z',
      }),
    ]);
    armPersistedReadModel(root);

    const snapshot = buildStatusJsonSnapshot(root, join(root, '.dashboard'), {}) as {
      progress: { done: number; active: number; blocked: number; total: number };
      logicalProgress: { done: number; total: number; attemptCount: number };
      terminalPublication: { state: string };
    };

    expect(snapshot.progress).toEqual({ done: 1, active: 0, blocked: 0, total: 1 });
    expect(snapshot.logicalProgress).toMatchObject({ done: 1, total: 1, attemptCount: 2 });
    expect(snapshot.terminalPublication.state).toBe('receipt-observed');
  });

  it('reports a foreign receipt as a conflict without changing canonical lifecycle', async () => {
    const root = await createRoot();
    await Promise.all([
      writeJson(join(root, '.deckent', 'sprint-state.json'), {
        sprintId: SPRINT_ID, phase: 'COMPLETE', status: 'COMPLETE',
      }),
      writeJson(join(root, '.deckent', 'recently-works', `${SPRINT_ID}-terminal-receipt.json`), receipt('sprint-foreign')),
    ]);
    armPersistedReadModel(root);

    const snapshot = buildStatusJsonSnapshot(root, join(root, '.dashboard'), {});

    expect(snapshot).toMatchObject({
      lifecycle: 'COMPLETE',
      terminalPublication: { state: 'receipt-conflict', conflict: 'sprint-mismatch', receipt: null },
    });
  });
});
