import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  getActiveWorkerIds,
  markPending,
  markActive,
  clearPending,
  _clearAllPending,
} from '../../src/core/active-workers.js';

const TEST_ROOT = '/tmp/test-docker-spawn-race';
const TASKS_DIR = join(TEST_ROOT, '.tasks');

/**
 * Mirror of `_cleanupOrphanedPromptFiles` selective filter logic from
 * `src/providers/claude.ts:147-164`. We don't import claude.ts directly to
 * avoid spawnSync side effects; the filter rule is what matters for this
 * race-window simulation.
 */
function simulateCleanupOrphanedPromptFiles(activeTaskIds: string[]): void {
  if (!existsSync(TASKS_DIR)) return;
  const files = readdirSync(TASKS_DIR);
  for (const file of files) {
    if (file.startsWith('.prompt-') && file.endsWith('.txt')) {
      if (activeTaskIds.some(id => file.includes(`-${id}-`))) continue;
      rmSync(join(TASKS_DIR, file), { force: true });
    }
  }
}

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TASKS_DIR, { recursive: true });
  _clearAllPending();
});

describe('Docker spawn race-window protection (Sprint 170 P0-5)', () => {
  it('prompt file is PRESERVED during the 3s race window after markPending', () => {
    // Simulate Bug 2A:
    //   t=0   : spawn-backend-docker writes prompt for 170-race (no .hb yet)
    //   t=1s  : sibling worker kill() triggers _cleanupOrphanedPromptFiles
    //   t=3s  : original spawn finally writes .hb (markActive)
    //
    // Without the fix: at t=1s, getActiveWorkerIds() sees no .hb → prompt
    // gets DELETED → spawned worker fails.
    // With the fix: markPending(170-race) added to PENDING_SPAWNS BEFORE
    // prompt write → cleanup sees it as active → prompt PROTECTED.

    const taskId = '170-race';
    const promptFile = `.prompt-${taskId}-deadbeefcafe1234.txt`;
    const promptPath = join(TASKS_DIR, promptFile);

    // Step 1: mark pending (fix point 1 — before prompt write)
    markPending(taskId);

    // Step 2: prompt written
    writeFileSync(promptPath, 'worker prompt body', 'utf-8');
    expect(existsSync(promptPath)).toBe(true);

    // Step 3: sibling worker kill — cleanup fires during the race window
    // (BEFORE the spawning worker has written its .hb file)
    const activeIds = getActiveWorkerIds(TEST_ROOT);
    expect(activeIds).toContain(taskId); // proves pending Set is consulted
    simulateCleanupOrphanedPromptFiles(activeIds);

    // Step 4: prompt MUST still exist — this is the bug being fixed.
    expect(existsSync(promptPath)).toBe(true);

    // Step 5: later, the spawning worker writes its .hb and calls markActive.
    writeFileSync(
      join(TASKS_DIR, `task-${taskId}.hb`),
      JSON.stringify({ workerId: `docker-${taskId}`, taskId, status: 'EXECUTING' }),
    );
    markActive(taskId);

    // Step 6: subsequent cleanups should also leave the prompt alone, this
    // time because the .hb is present.
    const activeIdsAfter = getActiveWorkerIds(TEST_ROOT);
    expect(activeIdsAfter).toContain(taskId);
    simulateCleanupOrphanedPromptFiles(activeIdsAfter);
    expect(existsSync(promptPath)).toBe(true);
  });

  it('spawn failure path clears pending so the Set does not leak across sprints', () => {
    const taskId = '170-leak-test';
    markPending(taskId);
    expect(getActiveWorkerIds(TEST_ROOT)).toContain(taskId);

    // Simulate spawn failure — error path must call clearPending
    clearPending(taskId);

    // After failure, taskId should not appear active (no .hb, not pending)
    expect(getActiveWorkerIds(TEST_ROOT)).not.toContain(taskId);

    // A future cleanup with no active workers must NOT find this taskId
    // protected — but there is also no prompt to worry about now.
    simulateCleanupOrphanedPromptFiles([]);
    expect(readdirSync(TASKS_DIR).filter(f => f.startsWith('.prompt-'))).toHaveLength(0);
  });
});
