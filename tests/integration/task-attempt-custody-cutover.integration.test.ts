import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TaskResult } from '../../src/core/types.js';
import { createExactAcceptedTaskResultRefV2 } from '../../src/core/task-settlement-authority.js';
import { loadBacklog } from '../../src/orchestra/autonomous/backlog.js';
import type {
  BacklogEntry,
  BacklogFile,
} from '../../src/orchestra/autonomous/backlog-types.js';
import { makeExecuteDispatcher } from '../../src/orchestra/autonomous/execute-dispatcher.js';
import {
  projectExactAcceptedTaskResult,
  readExactAcceptedTaskResultV2,
} from '../../src/orchestra/task-result-authority.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function seedBacklog(root: string, entry: BacklogEntry): string {
  const path = join(root, 'backlog.json');
  const backlog: BacklogFile = { _version: '1.0', entries: [entry] };
  writeFileSync(path, JSON.stringify(backlog, null, 2), 'utf8');
  return path;
}

describe('autonomous exact-attempt custody cutover', () => {
  it('consumes the same accepted-attempt identity without reading or rewriting public result bytes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-autonomous-cutover-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'), { recursive: true });

    const fixture = createTaskResultSettlementV2Fixture({
      terminal: 'accepted-only',
      tailArtifactKey: 't13-autonomous-cutover',
    });
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(
      fixture.acceptedResultArtifact,
    );
    const accepted = readExactAcceptedTaskResultV2({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot: '/fixture/project',
      taskId: fixture.identity.taskId,
      custodyStore: fixture.store,
      policy: fixture.policy,
      expectedIdentity: fixture.identity,
      admission: fixture.admission,
      acceptedResultRef,
      expectedAcceptedResultChainDigest: fixture.acceptedResultChain.receiptDigest,
    });
    expect(accepted.state).toBe('exact-accepted');
    expect(accepted.result).not.toBeNull();
    expect(accepted.exactAcceptedAuthority).toBeDefined();
    if (accepted.result === null || accepted.exactAcceptedAuthority === undefined) {
      throw new Error('fixture exact accepted authority unavailable');
    }
    const projectedAcceptedResult = projectExactAcceptedTaskResult(
      accepted.result,
      accepted.exactAcceptedAuthority,
    );

    const publicResultPath = join(root, '.tasks', `task-${fixture.identity.taskId}.result`);
    const forgedPublicBytes = JSON.stringify({
      taskId: fixture.identity.taskId,
      selfAssessment: 'NO_GO',
      filesChanged: ['forged-public-result.ts'],
    }, null, 2) + '\n';
    writeFileSync(publicResultPath, forgedPublicBytes, 'utf8');

    const entry: BacklogEntry = {
      id: 'autonomous-cutover-entry',
      title: 'Use the exact accepted attempt',
      kind: 'task',
      spec: { description: 'Consume canonical result authority', scopeDir: 'src/' },
      policy: 'auto',
      provider: 'claude',
      model: 'fixture-model',
      trigger: { type: 'one-off' },
      status: 'pending',
      lastRun: null,
      lastResult: null,
    };
    const backlogPath = seedBacklog(root, entry);
    const waitForResult = vi.fn(async () => ({
      taskId: fixture.identity.taskId,
      selfAssessment: 'NO_GO',
      filesChanged: ['forged-public-result.ts'],
    } as TaskResult));
    let evaluated: TaskResult | null = null;
    const evaluate = vi.fn(async (_entry: BacklogEntry, result: TaskResult) => {
      evaluated = result;
      return { decision: 'DONE' as const, quality: 100, reconciled: false, reason: 'exact' };
    });

    const handler = makeExecuteDispatcher({
      projectRoot: root,
      config: {} as never,
      runTask: vi.fn(async () => ({
        taskId: fixture.identity.taskId,
        executionMode: 'normal-docker-exact' as const,
        resultAuthority: {
          ...accepted,
          result: projectedAcceptedResult,
          rawResultPath: publicResultPath,
        },
      })),
      executeSprint: vi.fn(),
      backlogPath,
      waitForResult,
      evaluate,
      audit: vi.fn(async () => ({
        boundary: 'clean' as const,
        adr: 'ok' as const,
        functional: 'pass' as const,
      })),
      crossVerify: vi.fn(async () => ({ ran: false })),
      runBudgetedDecay: vi.fn(),
    });

    const outcome = await handler('autonomous.execute', { entry });

    expect(outcome).toEqual({ outcome: 'success' });
    expect(waitForResult).not.toHaveBeenCalled();
    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluated).toMatchObject({
      taskId: fixture.identity.taskId,
      linesAdded: fixture.result.totalLinesAdded,
      linesRemoved: fixture.result.totalLinesRemoved,
      diskVerified: true,
      exactAcceptedResultAuthority: {
        identity: fixture.identity,
        resultDigest: accepted.exactAcceptedAuthority?.resultDigest,
      },
    });
    expect((evaluated as unknown as Record<string, unknown>)['attemptCustody']).toBeUndefined();
    expect(typeof evaluated?.testsPassed).toBe('boolean');
    expect(evaluated?.filesChanged.every(path => typeof path === 'string')).toBe(true);
    expect(readFileSync(publicResultPath, 'utf8')).toBe(forgedPublicBytes);
    expect(loadBacklog(backlogPath).entries[0]?.status).toBe('done');
  }, 60_000);
});
