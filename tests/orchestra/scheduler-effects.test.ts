import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskStatus, type Task } from '../../src/core/types.js';
import {
  createExactNormalDockerExecutionRegistry,
  executeSpawnTask,
} from '../../src/orchestra/scheduler-effects.js';

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

describe('exact registry historical unsettleable retirement', () => {
  it('removes the entry so no consumer can read it back as an authority hold', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-historical-retire-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'));
    const registry = createExactNormalDockerExecutionRegistry(root);
    const taskId = '728-001';
    registry.registerHold(taskId, 'exact-terminal-awaiting-settlement');

    expect(registry.readTaskResultAuthority(taskId).state).toBe('authority-hold');
    expect(registry.snapshotExactTerminalAuthorities().has(taskId)).toBe(true);

    registry.retireHistoricalUnsettleableAttempt(
      taskId,
      'production-wiring-verifier-asset-invalid',
    );

    // A held entry is what sprint-lifecycle.ts:200-206 and
    // sprint-spawner.ts:1994-2003 turn into E077. Retirement must remove it
    // from the registry, not park it in another held state.
    expect(registry.snapshotExactTerminalAuthorities().has(taskId)).toBe(false);
    expect(registry.readTaskResultAuthority(taskId).state).toBe('pending-settlement');
    expect(registry.readExactTerminalAuthority(taskId)).toMatchObject({
      state: 'hold', reasonCode: 'exact-registry-entry-unavailable',
    });
    expect(registry.snapshotHistoricalUnsettleableAttempts().get(taskId))
      .toMatchObject({ reasonCode: 'production-wiring-verifier-asset-invalid' });
    expect(registry.snapshotHistoricalUnsettleableAttempts().get(taskId)?.retiredAt)
      .toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });
});
