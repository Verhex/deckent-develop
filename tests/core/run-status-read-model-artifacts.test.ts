import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadCanonicalRunTasks } from '../../src/core/run-status-read-model.js';
import type { CanonicalRunStatus } from '../../src/core/run-status-authority.js';

const roots: string[] = [];

function authority(): CanonicalRunStatus {
  return {
    schemaVersion: 1,
    lifecycle: 'ACTIVE',
    active: true,
    resumable: false,
    sprintId: 'sprint-489',
    phase: 'EXECUTE',
    status: 'RUNNING',
    reason: null,
    recoveryCommand: null,
    finalizeCommand: null,
    coordinator: 'alive',
    conflicts: [],
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('canonical run task artifact projection', () => {
  it('ignores a known landing proposal instead of publishing a malformed-task HOLD', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-status-artifacts-'));
    roots.push(root);
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'task-489-001.json'), JSON.stringify({
      id: '489-001',
      status: 'DONE',
      sprintId: 'sprint-489',
    }));
    writeFileSync(join(tasksDir, 'task-489-001.landing-proposal.json'), JSON.stringify({
      proposalId: 'proposal-489-001',
      state: 'READY',
    }));

    const projected = loadCanonicalRunTasks(root, authority());

    expect(projected.tasks.map(task => task.id)).toEqual(['489-001']);
    expect(projected.holds).toEqual([]);
  });

  it('retains an exact HOLD for a malformed canonical task record', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-status-artifacts-'));
    roots.push(root);
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'task-489-001.json'), '{broken');

    const projected = loadCanonicalRunTasks(root, authority());

    expect(projected.tasks).toEqual([]);
    expect(projected.holds).toEqual([
      expect.objectContaining({
        reasonCode: 'malformed-task-artifact',
        evidenceRef: 'task-artifact:task-489-001.json',
      }),
    ]);
  });
});
