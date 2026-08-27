import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assembleSprintTerminalEvidence,
  type ExactAttemptEvidence,
} from '../../src/orchestra/sprint-terminal-evidence.js';

let root: string | undefined;

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('terminal evidence mixed-outcome classifier', () => {
  it('classifies host policy and cascade skips as settled without hiding their distinction', async () => {
    root = await mkdtemp(join(tmpdir(), 'deckent-terminal-classifier-'));
    const attempts: ExactAttemptEvidence<{ readonly marker: string }>[] = [
      {
        logicalTaskId: 'done', identity: { taskId: '703-901', attemptId: 'attempt:703-901' },
        authority: { state: 'TERMINAL', verdict: 'DONE', evidenceRef: 'settlement:done' },
        result: { state: 'COMPLETE', verdict: 'DONE', evidenceRef: 'result:done', payload: { marker: 'done' } },
        attribution: { state: 'VERIFIED', evidenceRef: 'attribution:done', filesChanged: ['src/a.ts'], linesAdded: 1, linesRemoved: 0 },
      },
      {
        logicalTaskId: 'policy', identity: { taskId: '703-902', attemptId: 'host:forced-skill' },
        authority: { state: 'TERMINAL', verdict: 'NO_GO', evidenceRef: 'host:forced-skill', reasonCode: 'FORCED_SKILL_UNAVAILABLE', hostTerminalNotDispatched: true },
        result: { state: 'NOT_APPLICABLE', evidenceRef: 'host:forced-skill', reasonCode: 'FORCED_SKILL_UNAVAILABLE' },
        attribution: { state: 'VERIFIED', evidenceRef: 'host:zero-work', filesChanged: [], linesAdded: 0, linesRemoved: 0 },
      },
      {
        logicalTaskId: 'cascade', identity: { taskId: '703-903', attemptId: 'host:cascade-skip:703-903' },
        authority: { state: 'TERMINAL', verdict: 'NO_GO', evidenceRef: 'host:cascade' },
        result: { state: 'COMPLETE', verdict: 'NO_GO', evidenceRef: 'result:cascade', payload: { marker: 'cascade' } },
        attribution: { state: 'UNAVAILABLE', reasonCode: 'ATTRIBUTION_AUTHORITY_UNAVAILABLE' },
      },
    ];
    await writeFile(join(root, 'attempt-count.txt'), String(attempts.length), 'utf8');

    const evidence = assembleSprintTerminalEvidence({ attempts, coordinatorEvidence: [] });

    expect(evidence.settledAttempts.map(item => item.evidenceState).sort()).toEqual([
      'CASCADE_SKIP', 'HOST_TERMINAL_NOT_DISPATCHED',
    ]);
    expect(evidence.summary).toMatchObject({
      logicalTaskCount: 3, completedLogicalTaskCount: 1, settledAttemptCount: 2,
      activeOrUnsettledAttemptCount: 0, partialResultCount: 0, holdCount: 0,
    });
    expect(evidence.logicalTasks.map(item => [item.logicalTaskId, item.state, item.policySettledSkip]))
      .toEqual([
        ['cascade', 'FAILED', true], ['done', 'COMPLETED', undefined], ['policy', 'FAILED', true],
      ]);
    expect(evidence.cleanupEligibility).toEqual({ state: 'CANDIDATE', candidate: true, reasons: [] });
  });
});
