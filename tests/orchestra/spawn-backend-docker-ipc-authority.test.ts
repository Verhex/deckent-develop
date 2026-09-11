import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import {
  checkExactAttemptWorkerQuestions,
  createExactAttemptIpcTransientRegistry,
} from '../../src/orchestra/ipc-registry.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';
import {
  TaskAttemptCustodyStore,
  createTaskAttemptCustodyDirectoryScanReceiptV2,
  taskAttemptCustodyDigest,
  type TaskAttemptCustodyDirectoryScanReceiptV2,
} from '../../src/core/task-attempt-custody-store.js';

const sha256 = (bytes: Uint8Array): `sha256:${string}` => (
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`
);

function seedSealedQuestion(
  fixture: ReturnType<typeof createTaskResultSettlementV2Fixture>,
  store: TaskAttemptCustodyStore,
  dispatchRequestId: string,
  sequence: number,
  question: string,
): void {
  const access = store.openAttemptAccess({
    identity: fixture.identity,
    policy: fixture.policy,
    admissionReceiptDigest: fixture.admission.receiptDigest,
  });
  if (!access) throw new Error('expected fixture access');
  const padded = String(sequence).padStart(6, '0');
  const sealedChildRelativePath = `sealed-output-v1/${dispatchRequestId}/ipc/question-${padded}.bin`;
  const sealChildRelativePath = `sealed-output-v1/${dispatchRequestId}/ipc/question-${padded}.seal.json`;
  const questionBytes = Buffer.from(JSON.stringify({
    taskId: fixture.identity.taskId,
    workerId: 'worker-fixture-001',
    question,
    suggestedAction: 'continue',
    timestamp: new Date(Date.parse('2026-09-04T08:08:20.000Z') + sequence).toISOString(),
  }));
  const capturedAt = new Date(
    Date.parse('2026-09-04T08:08:20.000Z') + sequence,
  ).toISOString();
  const sealBytes = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    kind: 'exact-docker-private-output-seal',
    dispatchRequestId,
    sequence,
    sourceFileIdentityDigest: sha256(Buffer.from(`source-inode-${sequence}`)),
    sourceEpoch: sequence,
    sealedChildRelativePath,
    contentSha256: sha256(questionBytes),
    byteLength: questionBytes.byteLength,
    capturedAt,
  })}\n`);
  for (const entry of [
    {
      childRelativePath: sealedChildRelativePath,
      artifactClass: 'worker-ipc-question' as const,
      artifactKey: `ipc-question-${sequence}`,
      bytes: questionBytes,
    },
    {
      childRelativePath: sealChildRelativePath,
      artifactClass: 'worker-provider-observation' as const,
      artifactKey: `ipc-question-seal-${sequence}`,
      bytes: sealBytes,
    },
  ]) {
    const source = store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: entry.childRelativePath,
      artifactClass: entry.artifactClass,
      artifactKey: entry.artifactKey,
    });
    const sourcePath = fixture.adapter.capabilityPaths.get(source);
    if (!sourcePath) throw new Error('expected private output path');
    fixture.adapter.putAttemptOutput(sourcePath, entry.bytes);
  }
}

function exactIpcFixture(
  seed: string,
  options: Readonly<{ failAnsweredCursorOnce?: boolean }> = {},
) {
  const tailArtifactKey = `ipc-${seed}`;
  const fixture = createTaskResultSettlementV2Fixture({
    terminal: 'accepted-only',
    attemptId: '523e4567-e89b-42d3-a456-426614174000',
    reserveDispatch: true,
    tailArtifactKey,
  });
  Object.defineProperty(fixture.adapter, 'scanPrivateDirectoryBounded', {
    configurable: true,
    value: (input: Parameters<NonNullable<
      Parameters<typeof TaskAttemptCustodyStore.open>[0]['adapter']['scanPrivateDirectoryBounded']
    >>[0]): TaskAttemptCustodyDirectoryScanReceiptV2 => {
    const prefix = `${input.relativeDirectory}/`;
    const names = Object.freeze([...new Set(
      [...fixture.adapter.directories.keys(), ...fixture.adapter.files.keys()]
        .filter(path => path.startsWith(prefix))
        .map(path => path.slice(prefix.length))
        .filter(path => path.length > 0 && !path.includes('/')),
    )].sort());
    const directoryIdentityDigest = taskAttemptCustodyDigest(
      'fixture-ipc-directory-scan-identity',
      { rootId: input.root.rootId, relativeDirectory: input.relativeDirectory },
      fixture.policy.jsonBounds,
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
      nativeDirectoryIdentityBeforeDigest: directoryIdentityDigest,
      nativeDirectoryIdentityAfterDigest: directoryIdentityDigest,
      });
    },
  });
  const answeredCursorFault = { hits: 0 };
  const publishBytesFirstWriter = fixture.adapter.publishBytesFirstWriter.bind(fixture.adapter);
  fixture.adapter.publishBytesFirstWriter = input => {
    if (options.failAnsweredCursorOnce === true
      && answeredCursorFault.hits === 0
      && input.relativePath.endsWith('/ipc-conversation/000001.answered.json')) {
      answeredCursorFault.hits += 1;
      throw new Error('fixture-answer-cursor-publication-interrupted');
    }
    return publishBytesFirstWriter(input);
  };
  const store = TaskAttemptCustodyStore.open({
    adapter: fixture.adapter,
    absoluteRoot: '/fixture/host-custody',
    canonicalProjectRoot: '/fixture/project',
    projectId: fixture.identity.projectId,
    create: false,
  });
  const dispatchRequestId = `dreq-${createHash('sha256')
    .update(`/fixture/project:${tailArtifactKey}`)
    .digest('hex')}`;
  const dispatch = fixture.store.readDispatchAdmission({
    dispatchRequestId,
    policy: fixture.policy,
  });
  if (dispatch.state !== 'admitted') throw new Error('expected dispatch admission');
  const admissionRefDigest = `sha256:${'4'.repeat(64)}` as const;
  const projectionFence = `sha256:${'9'.repeat(64)}` as const;
  const query = {
    custodyRef: {
      identity: fixture.identity,
      admissionReceiptDigest: fixture.admission.receiptDigest,
      admissionRefDigest,
    },
    projectionFence,
  };
  return { fixture, store, dispatch, admissionRefDigest, query, answeredCursorFault };
}

function installCompletion(
  backend: DockerSpawnBackend,
  prepared: ReturnType<typeof exactIpcFixture>,
  store = prepared.store,
) {
  const access = store.openAttemptAccess({
    identity: prepared.fixture.identity,
    policy: prepared.fixture.policy,
    admissionReceiptDigest: prepared.fixture.admission.receiptDigest,
  });
  if (!access) throw new Error('expected fixture access');
  const internals = backend as unknown as { exactCustodyCompletions: Map<string, unknown> };
  internals.exactCustodyCompletions.set(prepared.admissionRefDigest, {
    scope: {
      store,
      policy: prepared.fixture.policy,
      identity: prepared.fixture.identity,
      admission: prepared.fixture.admission,
      admissionRef: prepared.dispatch.ref,
      access,
    },
    query: prepared.query,
    promise: Promise.resolve({ kind: 'capture-hold' }),
  });
}

describe('Docker exact-attempt private IPC authority port', () => {
  it('captures one private question, publishes the private answer, and rereads answered authority', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-docker-ipc-authority-'));
    onTestFinished(() => rmSync(projectRoot, { recursive: true, force: true }));
    const prepared = exactIpcFixture('multi');
    const { fixture, query } = prepared;
    seedSealedQuestion(
      fixture,
      prepared.store,
      prepared.dispatch.ref.dispatchRequestId,
      1,
      'May I continue with the verified plan?',
    );
    const backend = new DockerSpawnBackend(projectRoot, { custodyStateDir: '/fixture/state' });
    installCompletion(backend, prepared);

    const initial = backend.resolveExactAttemptIpcAuthority(query as never);
    expect(initial).toMatchObject({
      state: 'question-ready',
    });
    const report = await checkExactAttemptWorkerQuestions(
      projectRoot,
      new Set([fixture.identity.taskId]),
      new Set(),
      {
        transientRegistry: createExactAttemptIpcTransientRegistry(projectRoot),
        resolveAuthority: () => backend.resolveExactAttemptIpcAuthority(query as never),
      },
    );

    expect(report).toMatchObject({
      answered: [fixture.identity.taskId],
      holds: [],
    });
    const answered = backend.resolveExactAttemptIpcAuthority(query as never);
    expect(answered).toMatchObject({
      state: 'answered',
      authority: { sequence: 1, identity: fixture.identity },
      answerReceipt: {
        artifactKey: 'ipc-answer-1',
        destinationChildRelativePath: `task-${fixture.identity.taskId}.answer`,
      },
    });

    const firstAnswerPath = [...fixture.adapter.files.keys()].find(path => (
      path.endsWith(`/worker-output/task-${fixture.identity.taskId}.answer`)
    ));
    if (!firstAnswerPath) throw new Error('expected first private answer destination');
    fixture.adapter.files.delete(firstAnswerPath);
    seedSealedQuestion(
      fixture,
      prepared.store,
      prepared.dispatch.ref.dispatchRequestId,
      2,
      'May I continue with the second verified step?',
    );
    expect(backend.resolveExactAttemptIpcAuthority(query as never)).toMatchObject({
      state: 'question-ready',
      authority: { sequence: 2 },
    });
    const secondReport = await checkExactAttemptWorkerQuestions(
      projectRoot,
      new Set([fixture.identity.taskId]),
      new Set(),
      {
        transientRegistry: createExactAttemptIpcTransientRegistry(projectRoot),
        resolveAuthority: () => backend.resolveExactAttemptIpcAuthority(query as never),
      },
    );
    expect(secondReport.answered).toEqual([fixture.identity.taskId]);
    expect(secondReport.holds).toEqual([]);
    expect(backend.resolveExactAttemptIpcAuthority(query as never)).toMatchObject({
      state: 'answered',
      authority: { sequence: 2 },
      answerReceipt: { artifactKey: 'ipc-answer-2' },
    });
  });

  it('cold-reconciles a durable answer whose answered cursor publication failed', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-docker-ipc-reconcile-'));
    onTestFinished(() => rmSync(projectRoot, { recursive: true, force: true }));
    const prepared = exactIpcFixture('reconcile', { failAnsweredCursorOnce: true });
    const { fixture, query } = prepared;
    seedSealedQuestion(
      fixture,
      prepared.store,
      prepared.dispatch.ref.dispatchRequestId,
      1,
      'Publish one restart-safe answer?',
    );
    const firstBackend = new DockerSpawnBackend(projectRoot, { custodyStateDir: '/fixture/state' });
    installCompletion(firstBackend, prepared);
    const interrupted = await checkExactAttemptWorkerQuestions(
      projectRoot,
      new Set([fixture.identity.taskId]),
      new Set(),
      {
        transientRegistry: createExactAttemptIpcTransientRegistry(projectRoot),
        resolveAuthority: () => firstBackend.resolveExactAttemptIpcAuthority(query as never),
      },
    );
    expect(interrupted.answered).toEqual([]);
    expect(interrupted.holds).toHaveLength(1);
    expect(prepared.answeredCursorFault.hits).toBe(1);
    expect(prepared.store.readWorkerIpcAnswerDelivery({
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: fixture.admission.receiptDigest,
      sequence: 1,
      artifactKey: 'ipc-answer-1',
    })).toMatchObject({
      sequence: 1,
      artifactKey: 'ipc-answer-1',
    });

    const restartedStore = TaskAttemptCustodyStore.open({
      adapter: fixture.adapter,
      absoluteRoot: '/fixture/host-custody',
      canonicalProjectRoot: '/fixture/project',
      projectId: fixture.identity.projectId,
      create: false,
    });
    const restartedBackend = new DockerSpawnBackend(projectRoot, {
      custodyStateDir: '/fixture/state',
    });
    installCompletion(restartedBackend, prepared, restartedStore);
    const reconciled = restartedBackend.resolveExactAttemptIpcAuthority(query as never);
    expect(reconciled).toMatchObject({
      state: 'answered',
      authority: { sequence: 1 },
      answerReceipt: { artifactKey: 'ipc-answer-1' },
    });
  });
});
