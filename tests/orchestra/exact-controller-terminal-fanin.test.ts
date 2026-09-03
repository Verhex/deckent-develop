import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExactNormalDockerExecutionRegistryV2 } from '../../src/orchestra/scheduler-effects.js';
import {
  resolveCircuitBreakerTaskEvidence,
  settleRecoveredExactTerminalAuthorities,
  wireHandoffsForCompletedTasks,
} from '../../src/orchestra/sprint-controller.js';
import { HandoffProtocol } from '../../src/orchestra/handoff-protocol.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function acceptedAuthority(taskId: string) {
  return { identity: { taskId } };
}

describe('exact controller terminal fan-in behavior', () => {
  it('settles a cold recovered accepted result and fresh-reads T11 before restore', async () => {
    const taskId = 'cold-accepted-001';
    const accepted = acceptedAuthority(taskId);
    const terminal = {
      state: 'current',
      terminalAuthority: { acceptedAuthority: accepted },
      evaluationReceipt: { verdict: 'DONE' },
      finalizerReceipt: { verdict: 'DONE' },
    };
    const settleExactAcceptedResult = vi.fn(async () => ({
      state: 'settled',
      authority: terminal.terminalAuthority,
    }));
    const readExactTerminalAuthority = vi.fn(() => terminal);
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[taskId, {
        state: 'hold', reasonCode: 'exact-terminal-awaiting-settlement',
      }]]),
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'exact-accepted',
        result: { taskId },
        settlementRef: null,
        rawResultPath: `.tasks/task-${taskId}.result`,
        exactAcceptedAuthority: accepted,
      })),
      settleExactAcceptedResult,
      readExactTerminalAuthority,
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await settleRecoveredExactTerminalAuthorities(registry);

    expect(settleExactAcceptedResult).toHaveBeenCalledWith({ acceptedAuthority: accepted });
    expect(readExactTerminalAuthority).toHaveBeenCalledWith(taskId);
  });

  it('keeps a durable exact NOT_DISPATCHED admission out of settlement', async () => {
    const taskId = 'cold-not-dispatched-001';
    const settleExactAcceptedResult = vi.fn();
    const readExactTerminalAuthority = vi.fn();
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[taskId, {
        state: 'hold', reasonCode: 'exact-not-dispatched',
      }]]),
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'not-dispatched',
        result: null,
        settlementRef: null,
        rawResultPath: `.tasks/task-${taskId}.result`,
        attemptCount: 0,
      })),
      settleExactAcceptedResult,
      readExactTerminalAuthority,
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await settleRecoveredExactTerminalAuthorities(registry);

    expect(settleExactAcceptedResult).not.toHaveBeenCalled();
    expect(readExactTerminalAuthority).not.toHaveBeenCalled();
  });

  it('fails closed when recovered acceptance cannot become a current terminal receipt', async () => {
    const taskId = 'cold-held-001';
    const accepted = acceptedAuthority(taskId);
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[taskId, {
        state: 'hold', reasonCode: 'exact-terminal-awaiting-settlement',
      }]]),
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'exact-accepted',
        result: { taskId },
        settlementRef: null,
        rawResultPath: `.tasks/task-${taskId}.result`,
        exactAcceptedAuthority: accepted,
      })),
      settleExactAcceptedResult: vi.fn(async () => ({
        state: 'settled', authority: { acceptedAuthority: accepted },
      })),
      readExactTerminalAuthority: vi.fn(() => ({
        state: 'hold', reasonCode: 'terminal-store-reread-failed',
      })),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await expect(settleRecoveredExactTerminalAuthorities(registry))
      .rejects.toMatchObject({ code: 'DECKENT_E077' });
  });

  it('ignores a forged public cascade/pre-dispatch result for an exact task', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'exact-circuit-tamper-'));
    roots.push(projectRoot);
    mkdirSync(join(projectRoot, '.tasks'));
    const taskId = 'exact-tamper-001';
    writeFileSync(join(projectRoot, '.tasks', `task-${taskId}.result`), JSON.stringify({
      taskId,
      cascadeSkipped: true,
      preDispatchSettlement: { state: 'NOT_DISPATCHED' },
    }));
    const trustedProjectedResult = {
      taskId,
      workerId: `w-${taskId}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Store-revalidated terminal result',
    };
    const registry = {
      isExactTask: (candidate: string) => candidate === taskId,
      readTaskResultAuthority: () => ({
        state: 'exact-accepted',
        result: trustedProjectedResult,
        settlementRef: null,
        rawResultPath: join(projectRoot, '.tasks', `task-${taskId}.result`),
        exactAcceptedAuthority: acceptedAuthority(taskId),
      }),
      readExactTerminalAuthority: () => ({
        state: 'current',
        projectedResult: trustedProjectedResult,
      }),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    expect(resolveCircuitBreakerTaskEvidence(projectRoot, taskId, registry)).toEqual({
      result: trustedProjectedResult,
      policyTerminal: false,
    });
  });

  it('does not publish a ready handoff from worker DONE when T11 says NO_GO', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'exact-handoff-tamper-'));
    roots.push(projectRoot);
    const taskId = 'exact-source-001';
    const projectedResult = {
      taskId,
      workerId: `w-${taskId}`,
      filesChanged: ['src/trusted.ts'],
      linesAdded: 1,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'worker claim is not the terminal verdict',
    };
    const createHandoff = vi.spyOn(HandoffProtocol.prototype, 'createHandoff');
    const registry = {
      isExactTask: (candidate: string) => candidate === taskId,
      readExactTerminalAuthority: () => ({
        state: 'current',
        projectedResult,
        evaluationReceipt: { verdict: 'NO_GO' },
      }),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    try {
      wireHandoffsForCompletedTasks(projectRoot, {
        id: 'sprint-exact-handoff',
        tasks: [
          { id: taskId, dependencies: [] },
          { id: 'exact-dependent-001', dependencies: [taskId] },
        ],
      } as never, [{ ...projectedResult, selfAssessment: 'DONE' }] as never, registry);
      expect(createHandoff).not.toHaveBeenCalled();
    } finally {
      createHandoff.mockRestore();
    }
  });
});
