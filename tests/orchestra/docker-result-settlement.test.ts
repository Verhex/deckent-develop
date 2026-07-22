import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createTaskResultSettlementRef,
  readTaskResultSettlement,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import { persistDockerTaskResultSettlement } from '../../src/orchestra/spawn-backend-docker.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; tasks: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-docker-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasks = join(root, '.tasks');
  mkdirSync(tasks, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return { root, tasks };
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('persistDockerTaskResultSettlement', () => {
  it('embeds the final result under the exact project/task/attempt authority', () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-a';
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: 'host final',
    }), 'utf-8');

    expect(persistDockerTaskResultSettlement(root, tasks, ref, 137)).toBe(true);
    expect(readTaskResultSettlement(ref)).toMatchObject({
      exitCode: 137,
      result: { taskId, selfAssessment: 'NO_GO', notes: 'host final' },
    });

    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'DONE',
    }), 'utf-8');
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({ selfAssessment: 'NO_GO' });
  });

  it('does not invent authority for direct legacy backend calls and rejects cross-project refs', () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-b';
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({ taskId, selfAssessment: 'DONE' }), 'utf-8');
    expect(persistDockerTaskResultSettlement(root, tasks, undefined, 0)).toBe(false);

    const ref = createTaskResultSettlementRef(root, taskId);
    const otherRoot = join(root, '..', 'other');
    mkdirSync(otherRoot, { recursive: true });
    expect(() => persistDockerTaskResultSettlement(otherRoot, tasks, ref, 0)).toThrow(/authority/);
  });
});
