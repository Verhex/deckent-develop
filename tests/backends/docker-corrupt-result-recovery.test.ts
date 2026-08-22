import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createTaskResultSettlementRefForAttempt,
  readTaskResultSettlement,
  taskResultSettlementPath,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import { persistDockerTaskResultSettlement } from '../../src/orchestra/spawn-backend-docker.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(taskId: string): {
  root: string;
  resultPath: string;
  ref: ReturnType<typeof createTaskResultSettlementRefForAttempt>;
} {
  const base = mkdtempSync(join(tmpdir(), 'docker-corrupt-result-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasks = join(root, '.tasks');
  mkdirSync(tasks, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  const ref = createTaskResultSettlementRefForAttempt(root, taskId, randomUUID());
  writeTaskResultSettlementAttemptAtomic(ref);
  return { root, resultPath: join(tasks, `task-${taskId}.result`), ref };
}

afterEach(() => {
  process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Docker exit-zero corrupt result recovery', () => {
  it('preserves corrupt bytes and deterministically replays a typed NO_GO receipt', () => {
    const taskId = 'exit-zero-corrupt';
    const { root, resultPath, ref } = fixture(taskId);
    const corruptBytes = Buffer.from('{"taskId":"exit-zero-corrupt","selfAssessment":"DONE"', 'utf8');
    writeFileSync(resultPath, corruptBytes);

    expect(persistDockerTaskResultSettlement(
      root,
      join(root, '.tasks'),
      ref,
      0,
      'codex',
    )).toBe(true);

    expect(readFileSync(resultPath)).toEqual(corruptBytes);
    const settlementPath = taskResultSettlementPath(ref);
    const firstReceipt = readFileSync(settlementPath);
    expect(readTaskResultSettlement(ref)).toMatchObject({
      exitCode: 0,
      result: {
        taskId,
        selfAssessment: 'NO_GO',
        testsPassed: false,
        markerType: 'RECOVERY_RESULT_INVALID',
        recovery: {
          attemptId: ref.attemptId,
          resultArtifactState: 'corrupt',
          resultArtifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          forensicEvidenceRef: expect.stringMatching(/^invalid-worker-result:sha256:/),
        },
      },
    });
    const forensic = JSON.parse(readFileSync(
      join(dirname(settlementPath), 'invalid-worker-result.json'),
      'utf8',
    )) as Record<string, unknown>;
    expect(Buffer.from(String(forensic['rawBase64']), 'base64')).toEqual(corruptBytes);

    expect(persistDockerTaskResultSettlement(
      root,
      join(root, '.tasks'),
      ref,
      0,
      'codex',
    )).toBe(true);
    expect(readFileSync(resultPath)).toEqual(corruptBytes);
    expect(readFileSync(settlementPath)).toEqual(firstReceipt);
  });

  it('keeps a valid worker result authoritative instead of fabricating recovery', () => {
    const taskId = 'exit-zero-valid';
    const { root, resultPath, ref } = fixture(taskId);
    writeFileSync(resultPath, JSON.stringify({
      taskId,
      workerId: 'w-exit-zero-valid',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'verified',
    }));

    expect(persistDockerTaskResultSettlement(
      root,
      join(root, '.tasks'),
      ref,
      0,
      'codex',
    )).toBe(true);
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      workerId: 'w-exit-zero-valid',
      selfAssessment: 'DONE',
      testsPassed: true,
    });
  });

  it.each([
    ['schema', { taskId: 'exit-zero-invalid-schema', selfAssessment: 'DONE', testsPassed: 'yes' }],
    ['identity', { taskId: 'different-task', attemptId: 'different-attempt', selfAssessment: 'DONE' }],
  ])('rejects %s-invalid exit-zero bytes without replacing them', (_case, value) => {
    const taskId = `exit-zero-invalid-${_case}`;
    const { root, resultPath, ref } = fixture(taskId);
    const raw = Buffer.from(JSON.stringify(value), 'utf8');
    writeFileSync(resultPath, raw);

    expect(persistDockerTaskResultSettlement(
      root,
      join(root, '.tasks'),
      ref,
      0,
      'codex',
    )).toBe(true);
    expect(readFileSync(resultPath)).toEqual(raw);
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      taskId,
      selfAssessment: 'NO_GO',
      markerType: 'RECOVERY_RESULT_INVALID',
    });
  });
});
