import { describe, expect, it } from 'vitest';

import {
  canonicalTaskAttemptCustodyJson,
  type Sha256Digest,
  type TaskAttemptCustodyStore,
} from '../../src/core/task-attempt-custody-store.js';
import { createExactAcceptedTaskResultRefV2 } from '../../src/core/task-settlement-authority.js';
import {
  exactDockerDispatchCanonicalDigest,
} from '../../src/orchestra/exact-docker-dispatch-task-authority.js';
import {
  readExactAcceptedTaskProviderExitAuthority,
} from '../../src/orchestra/exact-docker-provider-exit-authority.js';
import { readExactAcceptedTaskResultV2 } from '../../src/orchestra/task-result-authority.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';

const digest = (character: string): Sha256Digest => `sha256:${character.repeat(64)}`;

function authorityFixture(options: {
  readonly observation?: 'current' | 'missing' | 'forged-wait';
  readonly sibling?: boolean;
} = {}) {
  const fixture = createTaskResultSettlementV2Fixture({
    terminal: 'accepted-only',
    tailArtifactKey: `provider-exit-${options.observation ?? 'current'}-${options.sibling ?? false}`,
  });
  const acceptedResultRef = createExactAcceptedTaskResultRefV2(fixture.acceptedResultArtifact);
  const acceptedRead = readExactAcceptedTaskResultV2({
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
  if (acceptedRead.state !== 'exact-accepted' || acceptedRead.exactAcceptedAuthority === undefined) {
    throw new Error('accepted fixture unavailable');
  }
  const identity = options.sibling
    ? { ...fixture.identity, attemptId: '123e4567-e89b-42d3-a456-426614174999' }
    : fixture.identity;
  const admissionRef = Object.freeze({
    schemaVersion: 2,
    kind: 'task-attempt-custody-dispatch-admission-ref',
    state: 'admitted',
    dispatchRequestId: 'fixture-dispatch-request-4',
    dispatchRequestMaterialDigest: digest('1'),
    reservationReceiptDigest: digest('2'),
    identity,
    admissionReceiptDigest: fixture.admission.receiptDigest,
    refDigest: digest('3'),
  });
  const observedAt = '2026-08-30T20:00:06.000Z';
  const waitEvidence = Object.freeze({
    admissionRefDigest: admissionRef.refDigest,
    containerId: 'container-fixture-001',
    exitCode: 0,
    dockerWaitProcessExitCode: 0,
    dockerWaitSignal: null,
    stdoutSha256: digest('4'),
    stderrSha256: digest('5'),
    observedAt,
  });
  const record = Object.freeze({
    schemaVersion: 2,
    kind: 'exact-docker-provider-exit',
    ...waitEvidence,
    waitEvidenceDigest: options.observation === 'forged-wait'
      ? digest('f')
      : exactDockerDispatchCanonicalDigest(waitEvidence, fixture.policy),
  });
  const bytes = canonicalTaskAttemptCustodyJson(record, fixture.policy.jsonBounds);
  const store = {
    readAdmission: fixture.store.readAdmission.bind(fixture.store),
    readTaskSnapshot: fixture.store.readTaskSnapshot.bind(fixture.store),
    readDispatchAdmission: () => ({
      state: 'admitted',
      reservation: {
        receiptDigest: admissionRef.reservationReceiptDigest,
        dispatchRequestMaterialDigest: admissionRef.dispatchRequestMaterialDigest,
      },
      admission: options.sibling
        ? { ...fixture.admission, identity }
        : fixture.admission,
      ref: admissionRef,
    }),
    readDispatchAuthority: () => ({
      state: 'terminal',
      reconciliation: null,
      authority: {
        state: 'RELEASED',
        admissionRef,
        backendExecutionId: 'container-fixture-001',
        providerExecutionAttempt: {
          providerExecutionAttemptId: 'provider-attempt-fixture-001',
          backendExecutionId: 'container-fixture-001',
          custodyIdentity: identity,
          admissionReceiptDigest: fixture.admission.receiptDigest,
        },
        releaseEvidence: { releasedAt: '2026-08-30T20:00:04.000Z' },
        recordedAt: '2026-08-30T20:00:04.000Z',
        projectionFence: digest('6'),
        receiptDigest: digest('7'),
      },
    }),
    readDispatchObservationByClass: () => options.observation === 'missing'
      ? null
      : {
          receipt: {
            observedAt,
            receiptDigest: digest('8'),
            evidenceDigest: digest('9'),
          },
          bytes,
        },
  } as unknown as TaskAttemptCustodyStore;
  return {
    fixture,
    store,
    acceptedAuthority: acceptedRead.exactAcceptedAuthority,
  };
}

describe('exact Docker provider-exit authority', () => {
  it('derives exit only through accepted identity, dispatch release, and Store observation', () => {
    const fixture = authorityFixture();
    const read = readExactAcceptedTaskProviderExitAuthority({
      acceptedAuthority: fixture.acceptedAuthority,
      custodyStore: fixture.store,
      policy: fixture.fixture.policy,
    });
    expect(read).toMatchObject({
      state: 'current',
      authority: {
        exitCode: 0,
        backendExecutionId: 'container-fixture-001',
        providerExecutionAttemptId: 'provider-attempt-fixture-001',
      },
    });
    if (read.state !== 'current') return;
    expect(read.authority.identity).toEqual(fixture.acceptedAuthority.identity);
    expect(read.authority.authorityDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('holds when the provider-exit observation is missing', () => {
    const fixture = authorityFixture({ observation: 'missing' });
    expect(readExactAcceptedTaskProviderExitAuthority({
      acceptedAuthority: fixture.acceptedAuthority,
      custodyStore: fixture.store,
      policy: fixture.fixture.policy,
    })).toEqual({ state: 'hold', reasonCode: 'provider-exit-observation-missing' });
  });

  it('holds on forged wait evidence instead of accepting the caller exit code', () => {
    const fixture = authorityFixture({ observation: 'forged-wait' });
    expect(readExactAcceptedTaskProviderExitAuthority({
      acceptedAuthority: fixture.acceptedAuthority,
      custodyStore: fixture.store,
      policy: fixture.fixture.policy,
    })).toEqual({ state: 'hold', reasonCode: 'provider-exit-replay-mismatch' });
  });

  it('holds when dispatch authority belongs to a sibling attempt', () => {
    const fixture = authorityFixture({ sibling: true });
    expect(readExactAcceptedTaskProviderExitAuthority({
      acceptedAuthority: fixture.acceptedAuthority,
      custodyStore: fixture.store,
      policy: fixture.fixture.policy,
    })).toEqual({ state: 'hold', reasonCode: 'provider-exit-attempt-mismatch' });
  });
});
