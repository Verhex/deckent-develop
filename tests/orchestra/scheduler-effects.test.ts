import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskStatus, type Task } from '../../src/core/types.js';
import { executeSpawnTask } from '../../src/orchestra/scheduler-effects.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('scheduler effects repair disposition gate', () => {
  it('returns typed no-mint without resolving a prompt or dispatching', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-no-mint-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'));
    writeFileSync(join(root, '.tasks', 'task-root.result'), JSON.stringify({
      taskId: 'root', workerId: 'host', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: false, coverage: 0, selfAssessment: 'NO_GO', notes: 'host rejection',
      preDispatchSettlement: { state: 'NOT_DISPATCHED', reasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE', attemptId: 'a', evidenceRef: 'e' },
    }));
    const task = { id: 'root-fix', fixForTaskId: 'root', isPriorityFix: true, status: TaskStatus.PENDING } as Task;
    const resolveAgentPrompt = vi.fn(async () => undefined);

    await expect(executeSpawnTask({ task }, {
      projectRoot: root, sprintFallbackId: 's', config: undefined,
      resolveAgentPrompt, resolveSkillPrompts: async () => [], buildWriteTargets: () => [],
    })).resolves.toMatchObject({ kind: 'no-mint', taskId: 'root-fix', fixForTaskId: 'root' });
    expect(resolveAgentPrompt).not.toHaveBeenCalled();
  });
});
