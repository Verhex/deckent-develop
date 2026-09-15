import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TaskAttemptCustodyHold,
  TaskAttemptCustodyStore,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyPolicyV2,
} from '../../src/core/task-attempt-custody-store.js';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import type { ExactAcceptedResultTerminalAuthorityV2 } from '../../src/orchestra/exact-accepted-result-terminal-authority.js';
import type {
  ExactAcceptedTaskResultAuthorityMetadata,
  ExactTaskResultAuthorityMetadata,
} from '../../src/orchestra/task-result-authority.js';

const digest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

function fixture(taskId: string, attemptId: string): {
  accepted: ExactAcceptedTaskResultAuthorityMetadata;
  terminal: ExactAcceptedResultTerminalAuthorityV2;
} {
  const identity: TaskAttemptCustodyIdentityV2 = {
    schemaVersion: 2,
    backend: 'docker',
    projectRootSha256: 'a'.repeat(64),
    projectId: 'snapshot-boundary-project',
    taskId,
    attemptId,
    generation: 1,
  };
  const accepted: ExactAcceptedTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity,
    admissionReceiptDigest: digest('1'),
    acceptedResultRef: {
      schemaVersion: 2,
      kind: 'task-accepted-result-v2-ref',
      identity,
      artifactKey: 'accepted-result',
      artifactReceiptDigest: digest('2'),
    },
    acceptedResultChainDigest: digest('3'),
    resultDigest: digest('4'),
  };
  const terminalResultAuthority: ExactTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity,
    admissionReceiptDigest: accepted.admissionReceiptDigest,
    settlementRef: {
      schemaVersion: 2,
      kind: 'task-result-settlement-v2-ref',
      identity,
      artifactKey: 'settlement',
      artifactReceiptDigest: digest('5'),
    },
    settlementDigest: digest('6'),
    resultDigest: accepted.resultDigest,
    acceptedResultChainDigest: accepted.acceptedResultChainDigest,
    evaluationChainDigest: digest('7'),
    finalizerChainDigest: digest('8'),
    evaluationArtifact: {
      artifactReceiptDigest: digest('9'),
      chainDigest: digest('7'),
      artifactSha256: digest('a'),
      byteLength: 128,
    },
    finalizerArtifact: {
      artifactReceiptDigest: digest('b'),
      chainDigest: digest('8'),
      artifactSha256: digest('c'),
      byteLength: 96,
    },
  };
  return {
    accepted,
    terminal: {
      schemaVersion: 2,
      kind: 'exact-accepted-result-terminal-authority-v2',
      acceptedAuthority: accepted,
      terminalResultAuthority,
      terminalDecisionAuthority: {
        schemaVersion: 2,
        kind: 'exact-task-terminal-decision-authority-v2',
        identity,
        evaluationReceipt: {
          verdict: 'DONE',
          artifactReceiptDigest: terminalResultAuthority.evaluationArtifact.artifactReceiptDigest,
          artifactSha256: terminalResultAuthority.evaluationArtifact.artifactSha256,
          byteLength: terminalResultAuthority.evaluationArtifact.byteLength,
          chainDigest: terminalResultAuthority.evaluationChainDigest,
        },
        finalizerReceipt: {
          state: 'terminal-ready',
          artifactReceiptDigest: terminalResultAuthority.finalizerArtifact.artifactReceiptDigest,
          artifactSha256: terminalResultAuthority.finalizerArtifact.artifactSha256,
          byteLength: terminalResultAuthority.finalizerArtifact.byteLength,
          chainDigest: terminalResultAuthority.finalizerChainDigest,
        },
      },
    },
  };
}

type StoreInternals = TaskAttemptCustodyStore & {
  readSnapshot: unknown;
  verifyingReadSnapshot: unknown;
  readSnapshotAdmissionProbe: boolean;
  readSnapshotCapabilities: Set<object>;
  revokedPathCapabilities: WeakSet<object>;
};

/**
 * Mocked boundary: only the Store's native-I/O-facing admission read is supplied by
 * the fixture. The real Store prototype owns withVerifiedReadSnapshot and all of
 * its synchronous, nested-operation, verification, and cleanup behavior.
 */
function storeHarness(
  readAdmission: (identity: TaskAttemptCustodyIdentityV2) => unknown,
): TaskAttemptCustodyStore {
  const store = Object.create(TaskAttemptCustodyStore.prototype) as StoreInternals;
  store.readSnapshot = null;
  store.verifyingReadSnapshot = null;
  store.readSnapshotAdmissionProbe = false;
  store.readSnapshotCapabilities = new Set();
  store.revokedPathCapabilities = new WeakSet();
  Object.defineProperty(store, 'readAdmission', {
    value: readAdmission,
    configurable: true,
  });
  return store;
}

function injectStore(
  backend: DockerSpawnBackend,
  store: TaskAttemptCustodyStore,
): void {
  Object.defineProperty(backend, 'openExactDockerRecoveryStore', {
    value: () => ({ store, policy: {} as TaskAttemptCustodyPolicyV2 }),
    configurable: true,
  });
}

const roots: string[] = [];
function backend(): DockerSpawnBackend {
  const root = join(tmpdir(), `deckent-terminal-snapshot-${randomBytes(6).toString('hex')}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return new DockerSpawnBackend(root);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Docker terminal-authority revalidation snapshot boundary', () => {
  it('opens one fresh verified snapshot per invocation and never reuses a verdict across identities', () => {
    const observedTaskIds: string[] = [];
    const store = storeHarness((identity) => {
      observedTaskIds.push(identity.taskId);
      return null;
    });
    const snapshot = vi.spyOn(store, 'withVerifiedReadSnapshot');
    const docker = backend();
    injectStore(docker, store);
    const first = fixture('761-001-a', 'attempt-a');
    const sibling = fixture('761-001-b', 'attempt-b');

    const reads = [first, first, sibling].map(({ accepted, terminal }) =>
      docker.readExactDockerAcceptedTaskTerminalAuthority({
        expectedAcceptedAuthority: accepted,
        expectedTerminalAuthority: terminal,
      }));

    expect(reads).toEqual([
      { state: 'hold', reasonCode: 'accepted-identity-mismatch' },
      { state: 'hold', reasonCode: 'accepted-identity-mismatch' },
      { state: 'hold', reasonCode: 'accepted-identity-mismatch' },
    ]);
    expect(observedTaskIds).toEqual(['761-001-a', '761-001-a', '761-001-b']);
    expect(snapshot).toHaveBeenCalledTimes(3);
    expect(snapshot.mock.calls.every(([, read]) => read.constructor.name !== 'AsyncFunction')).toBe(true);
    expect(reads.every(read => !(read instanceof Promise))).toBe(true);
  });

  it('propagates a native snapshot verification failure instead of returning authority', () => {
    let nativeAdmission = 'missing';
    const store = storeHarness(() => {
      const snapshot = (store as unknown as { readSnapshot: {
        observe<T>(key: string, read: () => T, encode: (value: T) => string,
          size: (value: T) => number, copy: (value: T) => T): T;
      } }).readSnapshot;
      const observed = snapshot.observe(
        'fixture:admission',
        () => nativeAdmission,
        value => value,
        value => value.length,
        value => value,
      );
      expect(observed).toBe('missing');
      nativeAdmission = 'published-after-read';
      return null;
    });
    const docker = backend();
    injectStore(docker, store);
    const expected = fixture('761-001-change', 'attempt-change');

    expect(() => docker.readExactDockerAcceptedTaskTerminalAuthority({
      expectedAcceptedAuthority: expected.accepted,
      expectedTerminalAuthority: expected.terminal,
    })).toThrowError(expect.objectContaining({
      state: 'HOLD',
      code: 'ARTIFACT_CHANGED',
      operation: 'read',
    }));
  });

  it('keeps missing admission as HOLD and rejects a nested snapshot before authority escapes', () => {
    const missingStore = storeHarness(() => null);
    const docker = backend();
    injectStore(docker, missingStore);
    const missing = fixture('761-001-missing', 'attempt-missing');

    expect(docker.readExactDockerAcceptedTaskTerminalAuthority({
      expectedAcceptedAuthority: missing.accepted,
      expectedTerminalAuthority: missing.terminal,
    })).toEqual({ state: 'hold', reasonCode: 'accepted-identity-mismatch' });

    const nestedStore = storeHarness(() => nestedStore.withVerifiedReadSnapshot(
      { maxEntries: 1, maxBytes: 1, maxDurationMs: 1 },
      () => null,
    ));
    injectStore(docker, nestedStore);

    expect(() => docker.readExactDockerAcceptedTaskTerminalAuthority({
      expectedAcceptedAuthority: missing.accepted,
      expectedTerminalAuthority: missing.terminal,
    })).toThrowError(expect.objectContaining({
      state: 'HOLD',
      code: 'CAPABILITY_UNVERIFIED',
      operation: 'read',
    } satisfies Partial<TaskAttemptCustodyHold>));
  });
});
