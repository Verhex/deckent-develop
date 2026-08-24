import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRef,
  taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import { WorkerHeartbeatAuthorityStore } from '../../src/core/worker-heartbeat-authority-store.js';
import { parseWorkerActivityHeartbeat } from '../../src/core/worker-activity-heartbeat.js';
import { observeDockerHeartbeatAuthority } from '../../src/orchestra/spawn-backend-docker.js';

const roots: string[] = [];

function fixture(): { root: string; tasksDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'docker-heartbeat-authority-wire-'));
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  roots.push(root);
  return { root, tasksDir };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Docker heartbeat authority production wire', () => {
  it('routes host process and worker verdict facts through the exact-attempt store', () => {
    const { root, tasksDir } = fixture();
    const ref = createTaskResultSettlementRef(root, '487-012');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const identity = {
      runId: ref.projectRootSha256,
      taskId: ref.taskId,
      attemptId: ref.attemptId,
      workerId: `docker-${ref.taskId}`,
      fence: taskResultSettlementActiveClaimDigest(ref),
    };

    observeDockerHeartbeatAuthority({
      tasksDir,
      settlementRef: ref,
      hostProcessOutcome: { state: 'running', exitCode: null },
      workerTaskVerdict: 'pending',
      liveness: 'alive',
    });
    observeDockerHeartbeatAuthority({
      tasksDir,
      settlementRef: ref,
      hostProcessOutcome: { state: 'exited', exitCode: 143 },
      workerTaskVerdict: 'no-go',
      liveness: 'not-alive',
    });

    const authority = new WorkerHeartbeatAuthorityStore(
      join(tasksDir, 'worker-heartbeat-authority'),
    ).read(identity);
    expect(authority?.latest).toMatchObject({
      hostSequence: 2,
      hostProcessOutcome: { state: 'exited', exitCode: 143 },
      workerTaskVerdict: 'no-go',
      liveness: 'not-alive',
    });
    expect(authority?.latest?.hostObservedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);

    const projected = parseWorkerActivityHeartbeat(JSON.parse(readFileSync(
      join(tasksDir, `task-${ref.taskId}.hb`),
      'utf8',
    )) as unknown);
    expect(projected).toMatchObject({
      state: 'VALID',
      heartbeat: {
        taskId: ref.taskId,
        workerId: `docker-${ref.taskId}`,
        attemptId: ref.attemptId,
        backend: 'docker',
        status: 'NO_GO',
        currentAction: 'Host settled attempt: no-go',
        observedAt: authority?.latest?.hostObservedAt,
      },
    });
  });
});
