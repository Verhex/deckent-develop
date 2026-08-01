import { describe, expect, it } from 'vitest';

import {
  SPRINT_TERMINAL_PUBLICATION_VERSION,
  SprintTerminalPublicationContractError,
  createSprintTerminalPublicationState,
  transitionSprintTerminalPublication,
  type SprintTerminalPublicationCommandV1,
} from '../../src/core/sprint-terminal-publication.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

function state() {
  return createSprintTerminalPublicationState({
    version: SPRINT_TERMINAL_PUBLICATION_VERSION,
    sprintId: 'sprint-486',
    runId: 'run-486-primary',
    coordinatorGeneration: 7,
    authorityVersion: 12,
  });
}

function command(
  overrides: Partial<SprintTerminalPublicationCommandV1> = {},
): SprintTerminalPublicationCommandV1 {
  return {
    version: SPRINT_TERMINAL_PUBLICATION_VERSION,
    sprintId: 'sprint-486',
    runId: 'run-486-primary',
    coordinatorGeneration: 7,
    terminalOutcome: 'COMPLETE',
    logicalSettlementDigest: DIGEST_A,
    priorAuthorityVersion: 12,
    ...overrides,
  };
}

describe('transitionSprintTerminalPublication', () => {
  it('publishes one immutable receipt bound to every authority fence', () => {
    const initial = state();
    const initialSnapshot = structuredClone(initial);

    const result = transitionSprintTerminalPublication(initial, command());

    expect(result).toEqual({
      decision: 'published',
      state: {
        version: 1,
        sprintId: 'sprint-486',
        runId: 'run-486-primary',
        coordinatorGeneration: 7,
        authorityVersion: 13,
        receipt: {
          version: 1,
          sprintId: 'sprint-486',
          runId: 'run-486-primary',
          coordinatorGeneration: 7,
          terminalOutcome: 'COMPLETE',
          logicalSettlementDigest: DIGEST_A,
          priorAuthorityVersion: 12,
          authorityVersion: 13,
        },
      },
      receipt: expect.objectContaining({ authorityVersion: 13 }),
    });
    expect(initial).toEqual(initialSnapshot);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.receipt)).toBe(true);
  });

  it('returns the exact terminal winner for an idempotent replay', () => {
    const first = transitionSprintTerminalPublication(state(), command());
    if (first.decision !== 'published') throw new Error('fixture did not publish');

    const replay = transitionSprintTerminalPublication(first.state, command());

    expect(replay.decision).toBe('idempotent');
    expect(replay.receipt).toEqual(first.receipt);
    expect(replay.state).toEqual(first.state);
    expect(replay.state.authorityVersion).toBe(13);
  });

  it('HOLDs a conflicting terminal payload without replacing the winner', () => {
    const first = transitionSprintTerminalPublication(state(), command());
    if (first.decision !== 'published') throw new Error('fixture did not publish');

    const conflict = transitionSprintTerminalPublication(
      first.state,
      command({ logicalSettlementDigest: DIGEST_B }),
    );

    expect(conflict).toMatchObject({
      decision: 'hold',
      reasonCode: 'terminal_payload_conflict',
      receipt: first.receipt,
      state: { authorityVersion: 13, receipt: first.receipt },
    });
  });

  it('HOLDs an ABORTED replay against a COMPLETE terminal winner', () => {
    const first = transitionSprintTerminalPublication(state(), command());
    if (first.decision !== 'published') throw new Error('fixture did not publish');

    const conflict = transitionSprintTerminalPublication(
      first.state,
      command({ terminalOutcome: 'ABORTED' }),
    );

    expect(conflict).toMatchObject({
      decision: 'hold',
      reasonCode: 'terminal_payload_conflict',
      receipt: { terminalOutcome: 'COMPLETE' },
    });
  });

  it('HOLDs stale and future coordinator generations', () => {
    expect(transitionSprintTerminalPublication(
      state(),
      command({ coordinatorGeneration: 6 }),
    )).toMatchObject({ decision: 'hold', reasonCode: 'stale_generation', receipt: null });
    expect(transitionSprintTerminalPublication(
      state(),
      command({ coordinatorGeneration: 8 }),
    )).toMatchObject({ decision: 'hold', reasonCode: 'generation_conflict', receipt: null });
  });

  it('HOLDs publication after a foreign sprint or run owns the authority', () => {
    expect(transitionSprintTerminalPublication(
      state(),
      command({ sprintId: 'sprint-foreign' }),
    )).toMatchObject({ decision: 'hold', reasonCode: 'foreign_ownership', receipt: null });
    expect(transitionSprintTerminalPublication(
      state(),
      command({ runId: 'run-foreign' }),
    )).toMatchObject({ decision: 'hold', reasonCode: 'foreign_ownership', receipt: null });
  });

  it('HOLDs a stale prior authority version before first publication', () => {
    const result = transitionSprintTerminalPublication(
      state(),
      command({ priorAuthorityVersion: 11 }),
    );

    expect(result).toMatchObject({
      decision: 'hold',
      reasonCode: 'authority_version_conflict',
      state: { authorityVersion: 12, receipt: null },
    });
  });

  it('rejects malformed authority and digest input at the pure boundary', () => {
    expect(() => createSprintTerminalPublicationState({
      version: SPRINT_TERMINAL_PUBLICATION_VERSION,
      sprintId: 'sprint-486',
      runId: 'run-486-primary',
      coordinatorGeneration: 0,
      authorityVersion: 12,
    })).toThrowError(SprintTerminalPublicationContractError);
    expect(() => transitionSprintTerminalPublication(
      state(),
      command({ logicalSettlementDigest: 'not-a-digest' }),
    )).toThrowError(expect.objectContaining({ code: 'INVALID_SETTLEMENT_DIGEST' }));
  });

  it('requires no timer, process, dashboard, or mutable adapter input', () => {
    expect(Object.keys(command()).sort()).toEqual([
      'coordinatorGeneration',
      'logicalSettlementDigest',
      'priorAuthorityVersion',
      'runId',
      'sprintId',
      'terminalOutcome',
      'version',
    ]);
    expect(Object.keys(state()).sort()).toEqual([
      'authorityVersion',
      'coordinatorGeneration',
      'receipt',
      'runId',
      'sprintId',
      'version',
    ]);
  });
});
