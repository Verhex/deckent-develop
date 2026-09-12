// Shared hermetic adapter: real custody/lifecycle producers, simulated OS boundary.
import { createHash } from 'node:crypto';
import { TaskAttemptCustodyHold, createTaskAttemptCustodyBackendMountTransferReceipt,
  createTaskAttemptCustodyDirectoryScanReceiptV2, type TaskAttemptCustodyAdapter }
  from '../../src/core/task-attempt-custody-store.js';
import { taskAttemptCustodyPosixDockerAuthorityLabelDigestV2, type TaskAttemptCustodyPosixMountConsumerInput }
  from '../../src/core/task-attempt-custody-posix-adapter.js';
import { InMemoryTaskAttemptCustodyAdapter } from './task-result-settlement-v2-fixture.js';
const sha = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}` as const;
export class ExactMountMemoryAdapter extends InMemoryTaskAttemptCustodyAdapter {
  mountInput: TaskAttemptCustodyPosixMountConsumerInput | null = null;
  mountFailureStage: 'LABEL_DIGEST' | 'TRANSFER_RECEIPT' | null = null;

  scanPrivateDirectoryBounded(input: Parameters<NonNullable<
    TaskAttemptCustodyAdapter['scanPrivateDirectoryBounded']
  >>[0]) {
    const prefix = `${input.relativeDirectory}/`;
    const children = new Set<string>();
    for (const path of [...this.directories.keys(), ...this.files.keys()]) {
      if (!path.startsWith(prefix)) continue;
      const remainder = path.slice(prefix.length);
      if (remainder.length !== 0 && !remainder.includes('/')) children.add(remainder);
    }
    const names = Object.freeze([...children].sort());
    if (names.length > input.maxEntries
      || names.some(name => Buffer.byteLength(name, 'utf8') > input.maxNameBytes)) {
      throw new TaskAttemptCustodyHold('DISPATCH_DISCOVERY_BOUNDS_EXCEEDED', 'read');
    }
    const identityDigest = sha(
      `committed-unsettled-scan:${input.root.rootId}:${input.relativeDirectory}`,
    );
    return createTaskAttemptCustodyDirectoryScanReceiptV2({
      rootId: input.root.rootId,
      relativeDirectory: input.relativeDirectory,
      names,
      entryCount: names.length,
      maxEntries: input.maxEntries,
      maxNameBytes: input.maxNameBytes,
      deadlineUnixMs: input.deadlineUnixMs,
      nativeMutationEvidence: 'DIRECTORY_IDENTITY_STABLE',
      nativeDirectoryIdentityBeforeDigest: identityDigest,
      nativeDirectoryIdentityAfterDigest: identityDigest,
    });
  }

  override async consumeBackendMountCapability(input: Parameters<
    InMemoryTaskAttemptCustodyAdapter['consumeBackendMountCapability']
  >[0]) {
    const mountInput = Object.freeze({
      schemaVersion: 2,
      kind: 'task-attempt-custody-posix-mount-consumer-input',
      taskSnapshot: Object.freeze({ sourcePath: '/private/task.json', readOnly: true }),
      workerOutput: Object.freeze({ sourcePath: '/private/output', readOnly: false }),
      rootId: input.root.rootId,
      scopeDigest: input.scopeDigest,
      effectOpDigest: input.effectOpDigest,
      attemptId: input.attemptId,
      generation: input.generation,
    });
    this.mountInput = mountInput;
    let authorityLabelDigest: ReturnType<
      typeof taskAttemptCustodyPosixDockerAuthorityLabelDigestV2
    >;
    try {
      authorityLabelDigest = taskAttemptCustodyPosixDockerAuthorityLabelDigestV2(
        Object.freeze({
          rootId: mountInput.rootId,
          scopeDigest: mountInput.scopeDigest,
          effectOpDigest: mountInput.effectOpDigest,
          attemptId: mountInput.attemptId,
          generation: mountInput.generation,
        }),
      );
    } catch (error) {
      this.mountFailureStage = 'LABEL_DIGEST';
      throw error;
    }
    try {
      return createTaskAttemptCustodyBackendMountTransferReceipt({
        state: 'CONSUMED',
        rootId: input.root.rootId,
        scopeDigest: input.scopeDigest,
        effectOpDigest: input.effectOpDigest,
        attemptId: input.attemptId,
        generation: input.generation,
        backend: 'docker',
        backendExecutionId: 'c'.repeat(64),
        backendImageDigest: sha('image'),
        backendAuthorityLabelDigest: authorityLabelDigest,
        taskSnapshotMountEvidenceDigest: sha('task-mount'),
        workerOutputMountEvidenceDigest: sha('output-mount'),
        backendBootstrapProbeEvidenceDigest: sha('bootstrap'),
        daemonMountReceiptDigest: sha('daemon-mount'),
        cleanupEvidenceDigest: null,
      });
    } catch (error) {
      this.mountFailureStage = 'TRANSFER_RECEIPT';
      throw error;
    }
  }
}
