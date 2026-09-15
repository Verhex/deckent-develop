import { describe, it, expect, vi } from 'vitest';
import * as fileLock from '../../src/core/file-lock.js';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import { isExactDockerReleaseRetryable, type ExactDockerReleaseHold } from '../../src/orchestra/exact-docker-release-outcome.js';
const hold = (code: string): ExactDockerReleaseHold => ({ kind: 'release-hold', code,
  stage: 'DEPENDENCY_VOLUME_DELETE_INTENT_COMMAND_DELETE', command: null,
  diagnostic: null, diagnosticPublicationFailed: false });
describe('release recovery classification and publication isolation', () => {
  it('never retries identity contradictions or diagnostic publication failures', () => {
    expect(isExactDockerReleaseRetryable(hold('RELEASE_VOLUME_DELETE_UNCONFIRMED'))).toBe(true);
    expect(isExactDockerReleaseRetryable(hold('RELEASE_VOLUME_IDENTITY_MISMATCH'))).toBe(false);
    expect(isExactDockerReleaseRetryable({ ...hold('RELEASE_VOLUME_DELETE_UNCONFIRMED'), diagnosticPublicationFailed: true })).toBe(false);
    expect(isExactDockerReleaseRetryable(hold('RELEASE_OPERATION_EXCEPTION'))).toBe(false);
  });
  it('distinguishes a competing replay owner from a consumed replay receipt', async () => {
    const backend = new DockerSpawnBackend('/tmp/deckent-release-no-io');
    const lock = vi.spyOn(fileLock, 'withExecutionLock').mockRejectedValueOnce(
      new fileLock.ExecutionLockError('held', 'release-test', 'held'),
    );
    try {
      const internals = backend as unknown as {
        replayExactDockerEffectReleaseOnce: (scope: unknown, previous: ExactDockerReleaseHold) => Promise<ExactDockerReleaseHold>;
      };
      const result = await internals.replayExactDockerEffectReleaseOnce({
        identity: { taskId: 'release-test', generation: 1 },
      }, hold('RELEASE_VOLUME_DELETE_UNCONFIRMED'));
      expect(result.replayInProgress).toBe(true);
      expect(result.replayBudgetExhausted).toBeUndefined();
      expect(result.replayPublicationFailed).toBeUndefined();
      expect(result.replayReceiptDigest).toBeUndefined();
      expect(isExactDockerReleaseRetryable(result)).toBe(false);
    } finally { lock.mockRestore(); }
  });
  it('retains live custody lookup when completion is held without absence evidence', async () => {
    const backend = new DockerSpawnBackend('/tmp/deckent-release-no-io');
    const digest = `sha256:${'a'.repeat(64)}`;
    const internals = backend as unknown as {
      clearExactDockerLiveAttempt: (digest: string) => void;
      observeExactDockerCompletionAcceptance: (scope: unknown, query: unknown, completion: Promise<unknown>) => void;
      exactCustodyAutomaticAcceptances: Map<string, Promise<unknown>>;
    };
    const clear = vi.spyOn(internals, 'clearExactDockerLiveAttempt');
    const observed = { kind: 'capture-hold', reasonCode: 'EFFECT_RELEASE_HOLD',
      custodyRef: {}, releaseReceipt: {}, projectionFence: digest };
    internals.observeExactDockerCompletionAcceptance({ admissionRef: { refDigest: digest } }, {}, Promise.resolve(observed));
    await expect(internals.exactCustodyAutomaticAcceptances.get(digest)).resolves.toMatchObject(observed);
    expect(clear).not.toHaveBeenCalled();
  });
  it('preserves live lookup through the public acceptance API on HOLD', async () => {
    const backend = new DockerSpawnBackend('/tmp/deckent-release-no-io');
    const digest = `sha256:${'a'.repeat(64)}`;
    const internals = backend as unknown as {
      clearExactDockerLiveAttempt: (digest: string) => void;
      acceptExactDockerCustodyResultInternal: (input: unknown) => Promise<unknown>;
      exactCustodyAcceptanceSetups: Map<string, Promise<unknown>>;
    };
    const clear = vi.spyOn(internals, 'clearExactDockerLiveAttempt');
    const query = { custodyRef: { dispatchRequestId: 'dispatch', identity: {},
      admissionReceiptDigest: digest, admissionRefDigest: digest,
      providerStartReceipt: { ref: digest, digest } },
      releaseReceipt: { ref: digest, digest }, providerStartReceipt: { ref: digest, digest },
      projectionFence: digest };
    const outcome = { kind: 'capture-hold', reasonCode: 'EFFECT_RELEASE_HOLD',
      custodyRef: query.custodyRef, releaseReceipt: query.releaseReceipt, projectionFence: digest };
    vi.spyOn(internals, 'acceptExactDockerCustodyResultInternal').mockResolvedValue(outcome);
    await expect(backend.acceptExactDockerCustodyResult({ query, authority: {} } as never)).resolves.toEqual(outcome);
    expect(clear).not.toHaveBeenCalled();
    expect(internals.exactCustodyAcceptanceSetups.size).toBe(0);
  });
  it.each(['exit-read', 'diagnostic-write'])('preserves original release failure when %s throws', async fault => {
    const backend = new DockerSpawnBackend('/tmp/deckent-release-no-io');
    const internals = backend as unknown as {
      readExactDockerRecoveryProviderExit: ReturnType<typeof vi.fn>;
      publishExactDockerEffectDiagnostic: ReturnType<typeof vi.fn>;
      releaseExactDockerEffectLanding: (scope: unknown, committed: unknown) => Promise<ExactDockerReleaseHold>;
    };
    internals.readExactDockerRecoveryProviderExit = vi.fn(() => {
      if (fault === 'exit-read') throw new Error('unreadable');
      return {};
    });
    internals.publishExactDockerEffectDiagnostic = vi.fn(() => { throw new Error('cannot publish'); });
    const result = await internals.releaseExactDockerEffectLanding({
      store: { readDispatchAuthority: () => ({ state: 'absent' }) },
    }, { captured: { lifecycleAuthority: {} }, storeAdapter: { readPreparedWorkspace: () => null }, receipt: { receiptDigest: `sha256:${'a'.repeat(64)}` } });
    expect(result).toMatchObject({ kind: 'release-hold', code: 'RELEASE_AUTHORITY_MISMATCH', diagnosticPublicationFailed: true });
  });
});
