import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  evaluateExecutionEffectContainment,
  parseExecutionEffectManifest,
  type ExecutionEffectContainmentDecision,
  type ExecutionEffectManifest,
  type ExecutionEffectManifestEntry,
} from '../../src/core/execution-effect-containment.js';
import {
  executionEffectLandingIntentDigestV1 as canonicalExecutionEffectLandingIntentDigestV1,
} from '../../src/core/execution-effect-persistence-contract.js';
import { compileExecutionEffectWritePolicy } from '../../src/core/execution-write-scope-policy.js';
import { executionEffectStoreJournalArtifactKeyV1 } from '../../src/orchestra/execution-effect-store-adapter.js';
import {
  applyExecutionEffectLandingV1,
  createExecutionEffectLandingEntryStateV1,
  createExecutionEffectLandingFinalVerificationReceiptV1,
  createExecutionEffectLandingJournalCapabilityV1,
  createExecutionEffectLandingLeaseCapabilityV1,
  createExecutionEffectLandingLeaseResumeResultV1,
  createExecutionEffectLandingNativeCapabilityV1,
  createExecutionEffectLandingNativeMutationReceiptV1,
  createExecutionEffectLandingStagedChunkV1,
  createExecutionEffectLandingStagedSourceV1,
  executionEffectLandingIntentDigestV1,
  executionEffectLandingWorkspaceIdentityDigestV1,
  prepareExecutionEffectLandingV1,
  readExecutionEffectLandingLocatorV1,
  readExecutionEffectLandingReceiptV1,
  reconcileExecutionEffectLandingV1,
  type ExecutionEffectLandingAdaptersV1,
  type ExecutionEffectLandingEntryStateV1,
  type ExecutionEffectLandingJournalAdapterV1,
  type ExecutionEffectLandingJournalArtifactV1,
  type ExecutionEffectLandingLeaseAdapterV1,
  type ExecutionEffectLandingLeaseTerminalV1,
  type ExecutionEffectLandingNativeAdapterV1,
  type ExecutionEffectLandingNativeMutationReceiptV1,
  type ExecutionEffectLandingOperationV1,
  type ExecutionEffectLandingPathStateV1,
  type ExecutionEffectLandingStagedSourceV1,
} from '../../src/orchestra/execution-effect-landing-coordinator.js';

const attempt = Object.freeze({
  projectId: 'project-1',
  taskId: 'task-1',
  attemptId: '018f0000-0000-7000-8000-000000000001',
  generation: 1,
});

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(domain: string, value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8').update('\0', 'utf8').update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function rawDigest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function file(path: string, content: string, mode = 0o644): ExecutionEffectManifestEntry {
  return Object.freeze({
    path,
    kind: 'regular-file' as const,
    mode,
    size: Buffer.byteLength(content),
    contentDigest: digest('test-content', content),
  });
}

function directory(path: string, mode = 0o755): ExecutionEffectManifestEntry {
  return Object.freeze({ path, kind: 'directory' as const, mode });
}

function manifest(
  phase: 'baseline' | 'final',
  filesWrite: readonly string[],
  suppliedEntries: readonly ExecutionEffectManifestEntry[],
): ExecutionEffectManifest {
  const compiled = compileExecutionEffectWritePolicy(filesWrite);
  if (!compiled.ok) throw new Error('invalid policy');
  const body = Object.freeze({
    version: 1 as const,
    phase,
    attempt,
    attemptDigest: digest('execution-effect-attempt-v1', attempt),
    workspaceIdentity: Object.freeze({
      filesystemId: 'dev:2049',
      directoryId: 'ino:1001',
      rootHandleEvidenceDigest: digest('test-workspace-root', 'root'),
    }),
    captureAuthority: Object.freeze({
      adapter: 'native-descriptor-relative' as const,
      platform: 'wsl2-linux' as const,
      traversal: 'iterative-openat-no-follow' as const,
      sameFilesystem: true as const,
      mountBoundaryPolicy: 'reject' as const,
      hardlinkPolicy: 'reject-before-content-read' as const,
      cancellationState: 'not-cancelled' as const,
      nativeManifestDigest: digest('test-native-manifest', phase),
      nativeEntryIdentitySetDigest: digest('test-native-entry-identities', phase),
      startedAt: '2026-09-01T08:00:00.000Z',
      completedAt: '2026-09-01T08:01:00.000Z',
      deadlineAt: '2026-09-01T08:05:00.000Z',
      limits: Object.freeze({
        maxEntries: 1_000,
        maxFileBytes: 16 * 1024 * 1024 * 1024,
        maxTotalBytes: 256 * 1024 * 1024 * 1024,
        maxDepth: 256,
        maxPathBytes: 16 * 1024,
        maxNameBytes: 255,
        maxManifestBytes: 16 * 1024 * 1024,
      }),
    }),
    landingSemantics: Object.freeze({
      regularFile: 'reconstruct-bytes-and-safe-mode' as const,
      directory: 'exact-directory-add-and-derived-parent-create' as const,
      unsupportedMetadata: 'strip-xattr-acl-capability-sparse-ads-owner-times' as const,
      linksAndSpecialFiles: 'reject' as const,
    }),
    policy: compiled.policy,
    entries: Object.freeze([...suppliedEntries]
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
  });
  const parsed = parseExecutionEffectManifest(Object.freeze({
    ...body,
    digest: digest('execution-effect-manifest-v1', body),
  }));
  if (!parsed) throw new Error('invalid manifest');
  return parsed;
}

function decision(
  baseline: ExecutionEffectManifest,
  final: ExecutionEffectManifest,
): Extract<ExecutionEffectContainmentDecision, { state: 'VERIFIED' }> {
  const result = evaluateExecutionEffectContainment({
    baseline: { ok: true, manifest: baseline },
    final: { ok: true, manifest: final },
  });
  if (result.state !== 'VERIFIED') throw new Error('test decision held');
  return result;
}

function pathState(path: string, entry: ExecutionEffectLandingEntryStateV1): ExecutionEffectLandingPathStateV1 {
  return Object.freeze({ path, entry });
}

interface FakeEnvironment {
  readonly adapters: ExecutionEffectLandingAdaptersV1;
  readonly journalEntries: Map<string, ExecutionEffectLandingJournalArtifactV1>;
  readonly projectEntries: Map<string, ExecutionEffectLandingEntryStateV1>;
  readonly stagedSources: Map<string, ExecutionEffectLandingStagedSourceV1>;
  readonly quarantines: string[];
  readonly quarantineEvidence: string[][];
  failStepPublication: boolean;
  failStepPublicationAtIndex: number | null;
  failLocatorPublication: boolean;
  forceLeaseAssertionFailure: boolean;
  resumeCalls: number;
  corruptFinalVerification: boolean;
  hardlinkPostimage: boolean;
  suppressTerminal: boolean;
}

function fakeEnvironment(baseline: ExecutionEffectManifest): FakeEnvironment {
  const rootDigest = digest('test-project-root', 'root');
  const workspaceDigest = executionEffectLandingWorkspaceIdentityDigestV1(
    baseline.workspaceIdentity,
  );
  const projectEntries = new Map<string, ExecutionEffectLandingEntryStateV1>();
  for (const entry of baseline.entries) {
    projectEntries.set(entry.path, createExecutionEffectLandingEntryStateV1({
      entry,
      objectIdentityDigest: digest('test-object', { path: entry.path, entry }),
      linkCount: entry.kind === 'regular-file' ? 1 : null,
    }));
  }
  const journalEntries = new Map<string, ExecutionEffectLandingJournalArtifactV1>();
  const stagedSources = new Map<string, ExecutionEffectLandingStagedSourceV1>();
  const appliedReceipts = new Map<string, ExecutionEffectLandingNativeMutationReceiptV1>();
  const terminals = new Map<string, ExecutionEffectLandingLeaseTerminalV1>();
  const quarantines: string[] = [];
  const quarantineEvidence: string[][] = [];
  const environment = {
    adapters: undefined as unknown as ExecutionEffectLandingAdaptersV1,
    journalEntries,
    projectEntries,
    stagedSources,
    quarantines,
    quarantineEvidence,
    failStepPublication: false,
    failStepPublicationAtIndex: null,
    failLocatorPublication: false,
    forceLeaseAssertionFailure: false,
    resumeCalls: 0,
    corruptFinalVerification: false,
    hardlinkPostimage: false,
    suppressTerminal: false,
  };

  const nativeCapability = createExecutionEffectLandingNativeCapabilityV1({
    adapterId: 'native-test-adapter',
    platform: 'wsl',
    projectRootIdentityDigest: rootDigest,
    workspaceIdentityDigest: workspaceDigest,
    attemptDigest: baseline.attemptDigest,
    admissionReceiptDigest: digest('test-admission-receipt', attempt),
    custodyPolicyDigest: digest('test-custody-policy', attempt),
    nativeContractDigest: digest('test-native-contract', 'v1'),
    stagingRootIdentityDigest: digest('test-store-staging-root', attempt),
    maxStagedChunkBytes: 3,
    maxOperations: 100_000,
    maxPlanEnvelopeBytes: 16 * 1024 * 1024,
  });
  const stateForExpected = (
    operation: ExecutionEffectLandingOperationV1,
  ): readonly ExecutionEffectLandingPathStateV1[] => operation.entryPostimages.map(post => {
    if (post.entry.state === 'ABSENT') {
      return pathState(post.path, createExecutionEffectLandingEntryStateV1({ entry: null }));
    }
    const existing = projectEntries.get(post.path);
    const identity = operation.kind === 'MODE' && existing?.state === 'PRESENT'
      ? existing.objectIdentityDigest
      : digest('test-landed-object', {
        operationDigest: operation.operationDigest,
        path: post.path,
      });
    return pathState(post.path, createExecutionEffectLandingEntryStateV1({
      entry: post.entry.entry,
      objectIdentityDigest: identity,
      linkCount: post.entry.entry.kind === 'directory'
        ? null
        : environment.hardlinkPostimage ? 2 : 1,
    }));
  });
  const semanticMatches = (
    actual: ExecutionEffectLandingEntryStateV1 | undefined,
    expected: ExecutionEffectLandingOperationV1['entryPostimages'][number]['entry'],
  ): boolean => expected.state === 'ABSENT'
    ? actual?.state === 'ABSENT'
    : actual?.state === 'PRESENT' && canonicalJson(actual.entry) === canonicalJson(expected.entry);

  const native: ExecutionEffectLandingNativeAdapterV1 = {
    capability: nativeCapability,
    inspectProjectEntry(path) {
      return projectEntries.get(path) ?? createExecutionEffectLandingEntryStateV1({ entry: null });
    },
    async stageSource(input) {
      const chunks = [];
      let offset = 0;
      let index = 0;
      do {
        const byteLength = Math.min(nativeCapability.maxStagedChunkBytes, input.entry.kind === 'regular-file'
          ? input.entry.size - offset : 0);
        chunks.push(createExecutionEffectLandingStagedChunkV1({
          index,
          byteOffset: offset,
          byteLength,
          artifactKey: `stage-${input.path.replace(/[^A-Za-z0-9._-]/gu, '-')}-${index}`,
          contentDigest: digest('test-staged-chunk', { path: input.path, index, byteLength }),
          artifactReceiptDigest: digest('test-store-artifact-receipt', { path: input.path, index }),
        }));
        offset += byteLength;
        index += 1;
      } while (input.entry.kind === 'regular-file' && offset < input.entry.size);
      const source = createExecutionEffectLandingStagedSourceV1({
        path: input.path,
        contentDigest: input.entry.kind === 'regular-file'
          ? input.entry.contentDigest : digest('test-directory', input.path),
        byteLength: input.entry.kind === 'regular-file' ? input.entry.size : 0,
        workspaceIdentityDigest: input.workspaceIdentityDigest,
        attemptDigest: nativeCapability.attemptDigest,
        admissionReceiptDigest: nativeCapability.admissionReceiptDigest,
        custodyPolicyDigest: nativeCapability.custodyPolicyDigest,
        landingIntentDigest: input.landingIntentDigest,
        chunks: Object.freeze(chunks),
      });
      stagedSources.set(source.stageAuthorityDigest, source);
      return source;
    },
    verifyStagedSource(source) {
      return canonicalJson(stagedSources.get(source.stageAuthorityDigest)) === canonicalJson(source);
    },
    applyOperation(input) {
      const { operation, dependencyReceipts } = input;
      if (operation.stagedSource && !stagedSources.has(operation.stagedSource.stageAuthorityDigest)) {
        throw new Error('staged source unavailable');
      }
      for (const preimage of operation.entryPreimages) {
        if (canonicalJson(projectEntries.get(preimage.path)
          ?? createExecutionEffectLandingEntryStateV1({ entry: null }))
          !== canonicalJson(preimage.entry)) throw new Error('entry CAS mismatch');
      }
      for (const parent of operation.parentAuthorities) {
        const current = projectEntries.get(parent.path)
          ?? createExecutionEffectLandingEntryStateV1({ entry: null });
        if (parent.source === 'PREPARED_PREIMAGE') {
          if (canonicalJson(current) !== canonicalJson(parent.entry)) throw new Error('parent CAS mismatch');
        } else {
          const dependency = dependencyReceipts.find(
            receipt => receipt.operationDigest === parent.operationDigest,
          );
          const landedParent = dependency?.entryPostimages.find(value => value.path === parent.path);
          if (!dependency || !landedParent || canonicalJson(current) !== canonicalJson(landedParent.entry)) {
            throw new Error('parent dependency mismatch');
          }
        }
      }
      const postimages = stateForExpected(operation);
      for (const postimage of postimages) projectEntries.set(postimage.path, postimage.entry);
      const receipt = createExecutionEffectLandingNativeMutationReceiptV1({
        operation,
        entryPostimages: postimages,
        durabilityEvidenceDigest: digest('test-native-durability', operation.operationDigest),
      });
      appliedReceipts.set(operation.operationDigest, receipt);
      return receipt;
    },
    reconcileOperation(input) {
      const receipt = appliedReceipts.get(input.operation.operationDigest);
      if (receipt && input.operation.entryPostimages.every(post =>
        semanticMatches(projectEntries.get(post.path), post.entry))) {
        return Object.freeze({ state: 'APPLIED' as const, receipt });
      }
      if (input.operation.entryPreimages.every(pre => canonicalJson(
        projectEntries.get(pre.path) ?? createExecutionEffectLandingEntryStateV1({ entry: null }),
      ) === canonicalJson(pre.entry))) return Object.freeze({ state: 'NOT_APPLIED' as const });
      return Object.freeze({
        state: 'AMBIGUOUS' as const,
        evidenceDigest: digest('test-ambiguous', input.operation.operationDigest),
      });
    },
    verifyTransactionPostimages(input) {
      if (environment.corruptFinalVerification) throw new Error('final verification failed');
      for (const receipt of input.operationReceipts) {
        for (const postimage of receipt.entryPostimages) {
          if (canonicalJson(projectEntries.get(postimage.path)) !== canonicalJson(postimage.entry)) {
            throw new Error('final postimage mismatch');
          }
        }
      }
      return createExecutionEffectLandingFinalVerificationReceiptV1({
        transaction: input.transaction,
        operations: input.operations,
        operationReceipts: input.operationReceipts,
        durabilityEvidenceDigest: digest(
          'test-final-durability',
          input.transaction.transactionDigest,
        ),
      });
    },
  };

  const journalCapability = createExecutionEffectLandingJournalCapabilityV1({
    adapterId: 'journal-test-adapter',
    projectRootIdentityDigest: rootDigest,
  });
  const journal: ExecutionEffectLandingJournalAdapterV1 = {
    capability: journalCapability,
    publishImmutable(input) {
      if (environment.failLocatorPublication
        && Buffer.from(input.bytes).includes(Buffer.from('execution-effect-landing-locator'))) {
        environment.failLocatorPublication = false;
        throw new Error('injected crash before durable locator');
      }
      const stepMatch = /\/step-(\d{7})\.json$/u.exec(input.key);
      const shouldFailIndexedStep = stepMatch !== null
        && environment.failStepPublicationAtIndex === Number(stepMatch[1]);
      if ((environment.failStepPublication && input.key.includes('/step-'))
        || shouldFailIndexedStep) {
        environment.failStepPublication = false;
        environment.failStepPublicationAtIndex = null;
        throw new Error('injected crash after native effect');
      }
      const previous = journalEntries.get(input.key);
      if (previous) {
        if (previous.contentDigest !== input.contentDigest) throw new Error('no-replace conflict');
        return previous;
      }
      const bytes = Uint8Array.from(input.bytes);
      const artifact = Object.freeze({
        key: input.key,
        bytes,
        contentDigest: rawDigest(bytes),
        byteLength: bytes.byteLength,
        publicationReceiptDigest: digest('test-journal-publication', {
          key: input.key,
          contentDigest: input.contentDigest,
        }),
      });
      journalEntries.set(input.key, artifact);
      return artifact;
    },
    readImmutable(key) {
      return journalEntries.get(key) ?? null;
    },
  };

  const leaseCapability = createExecutionEffectLandingLeaseCapabilityV1({
    adapterId: 'lease-test-adapter',
    projectRootIdentityDigest: rootDigest,
  });
  let activeLease: ReturnType<ExecutionEffectLandingLeaseAdapterV1['acquire']> | null = null;
  let activeBoundary: ReturnType<ExecutionEffectLandingLeaseAdapterV1['beginBoundary']> | null = null;
  let leaseGeneration = 0;
  const acquireLease = (transactionDigest: string, adopted = false) => {
    leaseGeneration += 1;
    activeLease = Object.freeze({
      transactionDigest,
      fencingTokenDigest: digest('test-fence', { transactionDigest, leaseGeneration }),
      leaseReceiptDigest: digest(adopted ? 'test-adopted-lease' : 'test-lease', {
        transactionDigest,
        leaseGeneration,
      }),
    });
    return activeLease;
  };
  const assertLease = (candidate: NonNullable<typeof activeLease>) => {
    if (environment.forceLeaseAssertionFailure) {
      throw new Error('injected fresh-process lease assertion failure');
    }
    if (canonicalJson(candidate) !== canonicalJson(activeLease)) throw new Error('lost lease');
  };
  const lease: ExecutionEffectLandingLeaseAdapterV1 = {
    capability: leaseCapability,
    acquire(transactionDigest) {
      return acquireLease(transactionDigest);
    },
    resume(context) {
      environment.resumeCalls += 1;
      environment.forceLeaseAssertionFailure = false;
      const adopted = acquireLease(context.transaction.transactionDigest, true);
      activeBoundary = context.applying === null ? null : Object.freeze({
        transactionDigest: context.transaction.transactionDigest,
        fencingTokenDigest: adopted.fencingTokenDigest,
        boundaryId: `boundary-resume-${leaseGeneration}`,
        boundaryReceiptDigest: digest('test-resumed-boundary', {
          contextDigest: context.contextDigest,
          leaseGeneration,
        }),
      });
      return createExecutionEffectLandingLeaseResumeResultV1({
        context,
        lease: adopted,
        currentBoundary: activeBoundary,
        durableEvidenceDigests: [digest('test-resume-durable-event', {
          contextDigest: context.contextDigest,
          leaseGeneration,
        })],
        resumedAt: new Date().toISOString(),
      });
    },
    assert(candidate) {
      assertLease(candidate);
    },
    renew(candidate) {
      assertLease(candidate);
      return candidate;
    },
    beginBoundary(candidate) {
      assertLease(candidate);
      activeBoundary = Object.freeze({
        transactionDigest: candidate.transactionDigest,
        fencingTokenDigest: candidate.fencingTokenDigest,
        boundaryId: `boundary-${leaseGeneration}`,
        boundaryReceiptDigest: digest('test-boundary', {
          transactionDigest: candidate.transactionDigest,
          leaseGeneration,
        }),
      });
      return activeBoundary;
    },
    quarantine(_candidate, _boundary, evidenceDigests) {
      const receipt = digest('test-quarantine', evidenceDigests);
      quarantines.push(receipt);
      quarantineEvidence.push([...evidenceDigests]);
      return receipt;
    },
    completeBoundary(candidate, boundary, committedJournalDigest) {
      assertLease(candidate);
      if (canonicalJson(boundary) !== canonicalJson(activeBoundary)) {
        throw new Error('stale boundary');
      }
      const terminal = Object.freeze({
        transactionDigest: candidate.transactionDigest,
        terminal: 'COMPLETED' as const,
        committedJournalDigest,
        terminalReceiptDigest: digest('test-lease-terminal', {
          transactionDigest: candidate.transactionDigest,
          committedJournalDigest,
        }),
      });
      if (!environment.suppressTerminal) terminals.set(committedJournalDigest, terminal);
      return terminal;
    },
    releaseNoChange(candidate, committedJournalDigest) {
      assertLease(candidate);
      const terminal = Object.freeze({
        transactionDigest: candidate.transactionDigest,
        terminal: 'RELEASED_NO_CHANGE' as const,
        committedJournalDigest,
        terminalReceiptDigest: digest('test-no-change-terminal', {
          transactionDigest: candidate.transactionDigest,
          committedJournalDigest,
        }),
      });
      if (!environment.suppressTerminal) terminals.set(committedJournalDigest, terminal);
      return terminal;
    },
    readTerminal(transactionDigest, committedJournalDigest) {
      const terminal = terminals.get(committedJournalDigest);
      return terminal?.transactionDigest === transactionDigest ? terminal : null;
    },
  };

  environment.adapters = Object.freeze({ native, journal, lease });
  return environment;
}

function basicChange() {
  const baseline = manifest('baseline', ['source.ts'], [directory('.'), file('source.ts', 'old')]);
  const final = manifest('final', ['source.ts'], [directory('.'), file('source.ts', 'new-content')]);
  return { baseline, final, decision: decision(baseline, final) };
}

function locatorInput(
  change: ReturnType<typeof basicChange>,
  environment: FakeEnvironment,
  planId: string,
) {
  return Object.freeze({
    projectId: change.baseline.attempt.projectId,
    taskId: change.baseline.attempt.taskId,
    attemptId: change.baseline.attempt.attemptId,
    generation: change.baseline.attempt.generation,
    attemptDigest: change.baseline.attemptDigest,
    baselineManifestDigest: change.baseline.digest,
    finalManifestDigest: change.final.digest,
    containmentDecisionDigest: change.decision.decisionDigest,
    planId,
    nativeCapabilityDigest: environment.adapters.native.capability.capabilityDigest,
    adapters: environment.adapters,
  });
}

function landingLocatorKey(attemptDigest: string): string {
  return `effect-landing/${digest(
    'execution-effect-landing-locator-key-v1', { attemptDigest },
  ).slice(7)}/prepared.json`;
}

describe('execution effect landing coordinator', () => {
  it('derives landing intent through one deterministic strict authority helper', () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const input = Object.freeze({
      attemptDigest: change.baseline.attemptDigest,
      baselineManifestDigest: change.baseline.digest,
      finalManifestDigest: change.final.digest,
      containmentDecisionDigest: change.decision.decisionDigest,
      planId: 'plan-intent',
      nativeCapabilityDigest: environment.adapters.native.capability.capabilityDigest,
    });
    const expected = executionEffectLandingIntentDigestV1(input);
    expect(executionEffectLandingIntentDigestV1)
      .toBe(canonicalExecutionEffectLandingIntentDigestV1);
    expect(executionEffectLandingIntentDigestV1(Object.freeze({ ...input }))).toBe(expected);
    expect(expected).toBe(digest('execution-effect-landing-intent-v1', input));

    const { nativeCapabilityDigest: _missing, ...missingField } = input;
    const accessor = Object.defineProperty({ ...input }, 'planId', {
      enumerable: true,
      get: () => 'plan-intent',
    });
    const malformed: unknown[] = [
      { ...input, extra: true },
      missingField,
      { ...input, attemptDigest: 'sha256:invalid' },
      { ...input, planId: '../unsafe' },
      accessor,
      new Proxy({ ...input }, {}),
    ];
    for (const candidate of malformed) {
      expect(() => executionEffectLandingIntentDigestV1(
        candidate as Parameters<typeof executionEffectLandingIntentDigestV1>[0],
      )).toThrow(TypeError);
    }
  });

  it('passes the canonical landing intent from prepare into staged source authority', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const expected = executionEffectLandingIntentDigestV1({
      attemptDigest: change.baseline.attemptDigest,
      baselineManifestDigest: change.baseline.digest,
      finalManifestDigest: change.final.digest,
      containmentDecisionDigest: change.decision.decisionDigest,
      planId: 'plan-intent-fan-in',
      nativeCapabilityDigest: environment.adapters.native.capability.capabilityDigest,
    });
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-intent-fan-in', ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    expect([...environment.stagedSources.values()]).toHaveLength(1);
    expect([...environment.stagedSources.values()][0]?.landingIntentDigest).toBe(expected);
  });

  it('never exposes an apply session before the durable locator and completes an exact retry', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const locatorKey = landingLocatorKey(change.baseline.attemptDigest);
    expect(executionEffectStoreJournalArtifactKeyV1(locatorKey)).not.toBeNull();
    environment.failLocatorPublication = true;
    const interrupted = await prepareExecutionEffectLandingV1({
      planId: 'plan-locator-publication-crash', ...change, adapters: environment.adapters,
    });
    expect(interrupted).toMatchObject({ state: 'HOLD', code: 'JOURNAL_CONFLICT' });
    expect(environment.projectEntries.get('source.ts')).toMatchObject({
      state: 'PRESENT', entry: { contentDigest: file('source.ts', 'old').contentDigest },
    });
    expect(environment.quarantines).toHaveLength(0);
    expect(environment.journalEntries.has(locatorKey)).toBe(false);
    const preparedArtifact = [...environment.journalEntries.values()]
      .find(value => value.key.endsWith('/prepared.json'))!;
    const interruptedTransaction = (JSON.parse(
      Buffer.from(preparedArtifact.bytes).toString('utf8'),
    ) as { transaction: { transactionDigest: string } }).transaction.transactionDigest;

    environment.forceLeaseAssertionFailure = true;
    const retried = await prepareExecutionEffectLandingV1({
      planId: 'plan-locator-publication-crash', ...change, adapters: environment.adapters,
    });
    expect(retried.state).toBe('PREPARED');
    if (retried.state !== 'PREPARED') return;
    expect(retried.transaction.transactionDigest).toBe(interruptedTransaction);
    expect(environment.journalEntries.has(locatorKey)).toBe(true);
    const locatorRecord = JSON.parse(Buffer.from(
      environment.journalEntries.get(locatorKey)!.bytes,
    ).toString('utf8')) as Record<string, unknown>;
    expect(locatorRecord).not.toHaveProperty('acquiredLease');
    expect(canonicalJson(locatorRecord)).not.toContain('fencingTokenDigest');
    expect(environment.resumeCalls).toBe(1);
    expect((await applyExecutionEffectLandingV1(retried.session)).state).toBe('COMMITTED');
  });

  it('recovers a locator-published apply-not-started crash without process-local session state', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const planId = 'plan-locator-before-apply-crash';
    const prepared = await prepareExecutionEffectLandingV1({
      planId, ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const located = readExecutionEffectLandingLocatorV1(
      locatorInput(change, environment, planId),
    );
    expect(located).toMatchObject({
      state: 'LOCATED',
      transaction: { transactionDigest: prepared.transaction.transactionDigest },
      preparedJournalDigest: prepared.preparedJournalDigest,
    });
    if (located.state !== 'LOCATED') return;
    expect((await reconcileExecutionEffectLandingV1({
      transaction: located.transaction,
      adapters: environment.adapters,
    })).state).toBe('COMMITTED');
  });

  it('fails closed for stale, sibling and tampered durable locators', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const locatorKey = landingLocatorKey(change.baseline.attemptDigest);
    const planId = 'plan-locator-adversarial';
    const prepared = await prepareExecutionEffectLandingV1({
      planId, ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect(readExecutionEffectLandingLocatorV1({
      ...locatorInput(change, environment, planId),
      taskId: 'sibling-task',
    })).toMatchObject({ state: 'HOLD', code: 'AUTHORITY_MISMATCH' });
    expect(await prepareExecutionEffectLandingV1({
      planId: 'sibling-plan', ...change, adapters: environment.adapters,
    })).toMatchObject({ state: 'HOLD', code: 'JOURNAL_CONFLICT' });

    const locator = environment.journalEntries.get(locatorKey)!;
    const parsed = JSON.parse(Buffer.from(locator.bytes).toString('utf8')) as Record<string, unknown>;
    parsed.preparedJournalDigest = digest('forged-prepared', 'sibling');
    const tamperedBytes = Buffer.from(canonicalJson(parsed), 'utf8');
    environment.journalEntries.set(locator.key, Object.freeze({
      ...locator,
      bytes: Uint8Array.from(tamperedBytes),
      contentDigest: rawDigest(tamperedBytes),
      byteLength: tamperedBytes.byteLength,
    }));
    expect(readExecutionEffectLandingLocatorV1(
      locatorInput(change, environment, planId),
    )).toMatchObject({ state: 'HOLD', code: 'JOURNAL_MALFORMED' });
    expect(await applyExecutionEffectLandingV1(prepared.session)).toMatchObject({
      state: 'HOLD', code: 'JOURNAL_MALFORMED',
    });
  });

  it('never backfills a missing locator after an APPLYING or COMMITTED journal exists', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const locatorKey = landingLocatorKey(change.baseline.attemptDigest);
    const planId = 'plan-missing-locator-after-mutation';
    const prepared = await prepareExecutionEffectLandingV1({
      planId, ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect((await applyExecutionEffectLandingV1(prepared.session)).state).toBe('COMMITTED');
    environment.journalEntries.delete(locatorKey);
    expect(await prepareExecutionEffectLandingV1({
      planId, ...change, adapters: environment.adapters,
    })).toMatchObject({ state: 'HOLD', code: 'PREIMAGE_MISMATCH' });
    expect(environment.journalEntries.has(locatorKey)).toBe(false);
    expect(await reconcileExecutionEffectLandingV1({
      transaction: prepared.transaction,
      adapters: environment.adapters,
    })).toMatchObject({ state: 'HOLD', code: 'JOURNAL_MALFORMED' });
  });

  it('lands only through staged chunks, immutable journal steps, final fan-in and terminal lease evidence', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-1', ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect(Object.isFrozen(prepared.session)).toBe(true);
    expect([...environment.stagedSources.values()][0]?.chunks).toHaveLength(4);

    const outcome = await applyExecutionEffectLandingV1(prepared.session);
    expect(outcome.state).toBe('COMMITTED');
    if (outcome.state !== 'COMMITTED') return;
    expect(outcome.finalVerificationReceiptDigest).toMatch(/^sha256:/u);
    expect([...environment.journalEntries.keys()]).toEqual(expect.arrayContaining([
      expect.stringContaining('/prepared.json'),
      expect.stringContaining('/applying.json'),
      expect.stringContaining('/step-0000000.json'),
      expect.stringContaining('/committed.json'),
    ]));
    expect(environment.quarantines).toHaveLength(0);

    const reread = readExecutionEffectLandingReceiptV1({
      transaction: prepared.transaction,
      adapters: {
        journal: environment.adapters.journal,
        lease: environment.adapters.lease,
      },
    });
    expect(reread).toEqual(outcome);
    expect((await applyExecutionEffectLandingV1(prepared.session)).state).toBe('HOLD');
  });

  it('commits an empty diff as COMMITTED_NO_CHANGE without opening an irreversible boundary', async () => {
    const baseline = manifest('baseline', [], [directory('.')]);
    const final = manifest('final', [], [directory('.')]);
    const environment = fakeEnvironment(baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-empty', baseline, final, decision: decision(baseline, final),
      adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const outcome = await applyExecutionEffectLandingV1(prepared.session);
    expect(outcome.state).toBe('COMMITTED_NO_CHANGE');
    if (outcome.state !== 'COMMITTED_NO_CHANGE') return;
    expect(outcome.operationReceiptDigests).toEqual([]);
    expect(outcome.finalVerificationReceiptDigest).toBeNull();
    expect([...environment.journalEntries.keys()].some(key => key.includes('/applying'))).toBe(false);
  });

  it('fails closed when production adapters are missing, proxied or accessor-authored', async () => {
    const change = basicChange();
    expect((await prepareExecutionEffectLandingV1({
      planId: 'plan-1', ...change,
    })).state).toBe('HOLD');
    const environment = fakeEnvironment(change.baseline);
    const proxied = new Proxy(environment.adapters, {});
    const proxyOutcome = await prepareExecutionEffectLandingV1({
      planId: 'plan-1', ...change, adapters: proxied,
    });
    expect(proxyOutcome).toMatchObject({ state: 'HOLD', code: 'ADAPTER_UNSUPPORTED' });
    const accessorInput = {
      planId: 'plan-1', ...change,
      get adapters() { return environment.adapters; },
    };
    expect((await prepareExecutionEffectLandingV1(accessorInput)).state).toBe('HOLD');
  });

  it('preserves an immutable authority snapshot after caller-owned manifest mutation', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const mutableBaseline = JSON.parse(JSON.stringify(change.baseline)) as ExecutionEffectManifest;
    const mutableFinal = JSON.parse(JSON.stringify(change.final)) as ExecutionEffectManifest;
    const mutableDecision = JSON.parse(JSON.stringify(change.decision)) as typeof change.decision;
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-1', baseline: mutableBaseline, final: mutableFinal,
      decision: mutableDecision, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    (mutableFinal as { digest: string }).digest = digest('forged', 'later');
    (mutableDecision as { decisionDigest: string }).decisionDigest = digest('forged', 'later');
    expect((await applyExecutionEffectLandingV1(prepared.session)).state).toBe('COMMITTED');
  });

  it('derives missing parent creation before child add and binds the child parent CAS to that step', async () => {
    const baseline = manifest('baseline', ['new/file.txt'], [directory('.')]);
    const final = manifest('final', ['new/file.txt'], [
      directory('.'), directory('new'), file('new/file.txt', 'content'),
    ]);
    const environment = fakeEnvironment(baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-parent', baseline, final, decision: decision(baseline, final),
      adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const preparedArtifact = [...environment.journalEntries.values()]
      .find(value => value.key.endsWith('/prepared.json'))!;
    const journal = JSON.parse(Buffer.from(preparedArtifact.bytes).toString('utf8')) as {
      operations: ExecutionEffectLandingOperationV1[];
    };
    expect(journal.operations.map(operation => [operation.kind, operation.path])).toEqual([
      ['ADD_DIRECTORY', 'new'], ['ADD', 'new/file.txt'],
    ]);
    expect(journal.operations[1]!.parentAuthorities[0]).toMatchObject({
      source: 'OPERATION_POSTIMAGE', operationIndex: 0,
    });
    expect((await applyExecutionEffectLandingV1(prepared.session)).state).toBe('COMMITTED');
  });

  it('lands an explicitly allowed empty directory as one real ADD_DIRECTORY effect', async () => {
    const baseline = manifest('baseline', ['empty'], [directory('.')]);
    const final = manifest('final', ['empty'], [directory('.'), directory('empty', 0o750)]);
    const environment = fakeEnvironment(baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-empty-directory', baseline, final, decision: decision(baseline, final),
      adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const preparedArtifact = [...environment.journalEntries.values()]
      .find(value => value.key.endsWith('/prepared.json'))!;
    const journal = JSON.parse(Buffer.from(preparedArtifact.bytes).toString('utf8')) as {
      operations: ExecutionEffectLandingOperationV1[];
    };
    expect(journal.operations).toHaveLength(1);
    expect(journal.operations[0]).toMatchObject({
      kind: 'ADD_DIRECTORY',
      path: 'empty',
      derivedParent: null,
      entryPostimages: [{ entry: { state: 'PRESENT', entry: { mode: 0o750 } } }],
    });
    expect(journal.operations[0]!.effectDigests).toHaveLength(1);
    expect((await applyExecutionEffectLandingV1(prepared.session)).state).toBe('COMMITTED');
  });

  it('derives every missing nested ancestor from the exact real child effect', async () => {
    const baseline = manifest('baseline', ['new/a/file.txt'], [directory('.')]);
    const final = manifest('final', ['new/a/file.txt'], [
      directory('.'), directory('new'), directory('new/a'), file('new/a/file.txt', 'content'),
    ]);
    const verifiedDecision = decision(baseline, final);
    const environment = fakeEnvironment(baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-nested-parent', baseline, final, decision: verifiedDecision,
      adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const preparedArtifact = [...environment.journalEntries.values()]
      .find(value => value.key.endsWith('/prepared.json'))!;
    const journal = JSON.parse(Buffer.from(preparedArtifact.bytes).toString('utf8')) as {
      operations: ExecutionEffectLandingOperationV1[];
    };
    expect(journal.operations.map(operation => [operation.kind, operation.path])).toEqual([
      ['ADD_DIRECTORY', 'new'],
      ['ADD_DIRECTORY', 'new/a'],
      ['ADD', 'new/a/file.txt'],
    ]);
    expect(journal.operations.slice(0, 2).map(operation => operation.derivedParent)).toEqual([
      expect.objectContaining({ childEffectDigests: [verifiedDecision.effects[0]!.digest] }),
      expect.objectContaining({ childEffectDigests: [verifiedDecision.effects[0]!.digest] }),
    ]);
    expect(journal.operations[2]!.derivedParent).toBeNull();
    expect(journal.operations[2]!.parentAuthorities[0]).toMatchObject({
      source: 'OPERATION_POSTIMAGE', operationIndex: 1,
    });
    expect((await applyExecutionEffectLandingV1(prepared.session)).state).toBe('COMMITTED');
  });

  it('reconciles the exact applied crash prefix without replaying the native effect', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const planId = 'plan-crash';
    environment.failStepPublication = true;
    const prepared = await prepareExecutionEffectLandingV1({
      planId, ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const interrupted = await applyExecutionEffectLandingV1(prepared.session);
    expect(interrupted).toMatchObject({ state: 'HOLD', code: 'NATIVE_EFFECT_UNCERTAIN' });
    expect(environment.quarantines).toHaveLength(1);
    const applyingBefore = [...environment.journalEntries.values()]
      .find(value => value.key.endsWith('/applying.json'))!;
    const immutableApplyingBytes = Buffer.from(applyingBefore.bytes).toString('utf8');

    const located = readExecutionEffectLandingLocatorV1(
      locatorInput(change, environment, planId),
    );
    expect(located.state).toBe('LOCATED');
    if (located.state !== 'LOCATED') return;
    const reconciled = await reconcileExecutionEffectLandingV1({
      transaction: located.transaction,
      adapters: environment.adapters,
    });
    expect(reconciled.state).toBe('COMMITTED');
    const step = [...environment.journalEntries.values()]
      .find(value => value.key.includes('/step-'))!;
    expect(JSON.parse(Buffer.from(step.bytes).toString('utf8'))).toMatchObject({
      reconciledAfterCrash: true,
    });
    const applyingAfter = [...environment.journalEntries.values()]
      .find(value => value.key.endsWith('/applying.json'))!;
    expect(environment.resumeCalls).toBe(1);
    expect(Buffer.from(applyingAfter.bytes).toString('utf8')).toBe(immutableApplyingBytes);
  });

  it('adopts a PREPARED-only crash from the immutable acquired lease snapshot', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-prepared-restart', ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const preparedArtifact = [...environment.journalEntries.values()]
      .find(value => value.key.endsWith('/prepared.json'))!;
    expect(JSON.parse(Buffer.from(preparedArtifact.bytes).toString('utf8')))
      .toMatchObject({ acquiredLease: { transactionDigest: prepared.transaction.transactionDigest } });

    const reconciled = await reconcileExecutionEffectLandingV1({
      transaction: prepared.transaction,
      adapters: environment.adapters,
    });
    expect(reconciled.state).toBe('COMMITTED');
    expect(environment.resumeCalls).toBe(1);
  });

  it('finishes a verified changed COMMITTED journal whose terminal publication crashed', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const planId = 'plan-committed-restart';
    environment.suppressTerminal = true;
    const prepared = await prepareExecutionEffectLandingV1({
      planId, ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect(await applyExecutionEffectLandingV1(prepared.session)).toMatchObject({
      state: 'HOLD', code: 'TRANSACTION_QUARANTINED',
    });
    environment.suppressTerminal = false;
    const located = readExecutionEffectLandingLocatorV1(
      locatorInput(change, environment, planId),
    );
    expect(located.state).toBe('LOCATED');
    if (located.state !== 'LOCATED') return;
    const reconciled = await reconcileExecutionEffectLandingV1({
      transaction: located.transaction,
      adapters: environment.adapters,
    });
    expect(reconciled.state).toBe('COMMITTED');
    expect(environment.resumeCalls).toBe(1);
  });

  it('finishes a verified no-change COMMITTED journal whose terminal publication crashed', async () => {
    const baseline = manifest('baseline', [], [directory('.')]);
    const final = manifest('final', [], [directory('.')]);
    const environment = fakeEnvironment(baseline);
    environment.suppressTerminal = true;
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-no-change-restart', baseline, final,
      decision: decision(baseline, final), adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect(await applyExecutionEffectLandingV1(prepared.session)).toMatchObject({
      state: 'HOLD', code: 'TRANSACTION_QUARANTINED',
    });
    environment.suppressTerminal = false;

    const reconciled = await reconcileExecutionEffectLandingV1({
      transaction: prepared.transaction,
      adapters: environment.adapters,
    });
    expect(reconciled.state).toBe('COMMITTED_NO_CHANGE');
    expect(environment.resumeCalls).toBe(1);
  });

  it('returns an already terminal transaction read-only without lease adoption', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-terminal-reread', ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const committed = await applyExecutionEffectLandingV1(prepared.session);
    expect(committed.state).toBe('COMMITTED');
    expect(await reconcileExecutionEffectLandingV1({
      transaction: prepared.transaction,
      adapters: environment.adapters,
    })).toEqual(committed);
    expect(environment.resumeCalls).toBe(0);
  });

  it('bounds quarantine evidence after a late failure in a large operation set', async () => {
    const paths = Array.from({ length: 96 }, (_, index) => `file-${String(index).padStart(3, '0')}.txt`);
    const baseline = manifest('baseline', paths, [directory('.')]);
    const final = manifest('final', paths, [
      directory('.'),
      ...paths.map(path => file(path, `content-${path}`)),
    ]);
    const environment = fakeEnvironment(baseline);
    environment.failStepPublicationAtIndex = paths.length - 1;
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-bounded-evidence', baseline, final,
      decision: decision(baseline, final), adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect(await applyExecutionEffectLandingV1(prepared.session)).toMatchObject({
      state: 'HOLD', code: 'NATIVE_EFFECT_UNCERTAIN',
    });
    expect(environment.quarantineEvidence).toHaveLength(1);
    expect(environment.quarantineEvidence[0]!.length).toBeLessThanOrEqual(8);
    expect(environment.quarantineEvidence[0]).toEqual(
      expect.arrayContaining([prepared.transaction.transactionDigest]),
    );
  });

  it('quarantines instead of committing when the native final full-postimage fan-in fails', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    environment.corruptFinalVerification = true;
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-final-hold', ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect(await applyExecutionEffectLandingV1(prepared.session)).toMatchObject({
      state: 'HOLD', code: 'NATIVE_EFFECT_UNCERTAIN',
    });
    expect(environment.quarantines).toHaveLength(1);
    expect([...environment.journalEntries.keys()].some(key => key.endsWith('/committed.json')))
      .toBe(false);
  });

  it('rejects a native hardlink postimage even when its semantic content matches', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    environment.hardlinkPostimage = true;
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-hardlink', ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect(await applyExecutionEffectLandingV1(prepared.session)).toMatchObject({
      state: 'HOLD', code: 'NATIVE_EFFECT_UNCERTAIN',
    });
    expect(environment.quarantines).toHaveLength(1);
  });

  it('holds after COMMITTED publication when durable lease terminal evidence is missing', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    environment.suppressTerminal = true;
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-terminal-hold', ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect(await applyExecutionEffectLandingV1(prepared.session)).toMatchObject({
      state: 'HOLD', code: 'TRANSACTION_QUARANTINED',
    });
    expect([...environment.journalEntries.keys()].some(key => key.endsWith('/committed.json')))
      .toBe(true);
    expect(readExecutionEffectLandingReceiptV1({
      transaction: prepared.transaction,
      adapters: { journal: environment.adapters.journal, lease: environment.adapters.lease },
    })).toMatchObject({ state: 'HOLD', code: 'TRANSACTION_QUARANTINED' });
  });

  it('rejects malformed journal bytes and missing durable lease terminal evidence on reread', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-read', ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect((await applyExecutionEffectLandingV1(prepared.session)).state).toBe('COMMITTED');
    const committedKey = [...environment.journalEntries.keys()]
      .find(key => key.endsWith('/committed.json'))!;
    const original = environment.journalEntries.get(committedKey)!;
    const corruptedBytes = Buffer.from('{"corrupted":true}', 'utf8');
    environment.journalEntries.set(committedKey, Object.freeze({
      ...original,
      bytes: Uint8Array.from(corruptedBytes),
      contentDigest: rawDigest(corruptedBytes),
      byteLength: corruptedBytes.byteLength,
    }));
    expect(readExecutionEffectLandingReceiptV1({
      transaction: prepared.transaction,
      adapters: { journal: environment.adapters.journal, lease: environment.adapters.lease },
    })).toMatchObject({ state: 'HOLD', code: 'JOURNAL_MALFORMED' });
  });

  it('rereads and rejects a corrupted STEP instead of trusting COMMITTED alone', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-step-corrupt', ...change, adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    expect((await applyExecutionEffectLandingV1(prepared.session)).state).toBe('COMMITTED');
    const stepKey = [...environment.journalEntries.keys()].find(key => key.includes('/step-'))!;
    const step = environment.journalEntries.get(stepKey)!;
    const parsed = JSON.parse(Buffer.from(step.bytes).toString('utf8')) as Record<string, unknown>;
    parsed.operationDigest = digest('forged-operation', 'step');
    const bytes = Buffer.from(canonicalJson(parsed), 'utf8');
    environment.journalEntries.set(stepKey, Object.freeze({
      ...step,
      bytes: Uint8Array.from(bytes),
      contentDigest: rawDigest(bytes),
      byteLength: bytes.byteLength,
    }));
    expect(readExecutionEffectLandingReceiptV1({
      transaction: prepared.transaction,
      adapters: { journal: environment.adapters.journal, lease: environment.adapters.lease },
    })).toMatchObject({ state: 'HOLD', code: 'JOURNAL_MALFORMED' });
  });

  it('rejects a nested proxy before manifest parsing can execute proxy traps', async () => {
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const proxiedEntries = new Proxy(change.final.entries, {});
    const proxiedFinal = { ...change.final, entries: proxiedEntries } as ExecutionEffectManifest;
    expect(await prepareExecutionEffectLandingV1({
      planId: 'plan-proxy-manifest', baseline: change.baseline, final: proxiedFinal,
      decision: change.decision, adapters: environment.adapters,
    })).toMatchObject({ state: 'HOLD', code: 'MANIFEST_MISMATCH' });
  });

  it('uses deterministic code-point ordering for Unicode paths', async () => {
    const baseline = manifest('baseline', ['z.txt', 'Ä.txt'], [directory('.')]);
    const final = manifest('final', ['z.txt', 'Ä.txt'], [
      directory('.'), file('z.txt', 'z'), file('Ä.txt', 'a'),
    ]);
    const environment = fakeEnvironment(baseline);
    const prepared = await prepareExecutionEffectLandingV1({
      planId: 'plan-unicode', baseline, final, decision: decision(baseline, final),
      adapters: environment.adapters,
    });
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const artifact = [...environment.journalEntries.values()]
      .find(value => value.key.endsWith('/prepared.json'))!;
    const parsed = JSON.parse(Buffer.from(artifact.bytes).toString('utf8')) as {
      operations: Array<{ path: string }>;
    };
    expect(parsed.operations.map(operation => operation.path)).toEqual(['z.txt', 'Ä.txt']);
  });

  it('rejects a forged opaque session and stale project preimage under the acquired lease', async () => {
    expect(await applyExecutionEffectLandingV1(Object.freeze({}) as never)).toMatchObject({
      state: 'HOLD', code: 'SESSION_INVALID',
    });
    const change = basicChange();
    const environment = fakeEnvironment(change.baseline);
    const originalAcquire = environment.adapters.lease.acquire;
    const adapters: ExecutionEffectLandingAdaptersV1 = {
      ...environment.adapters,
      lease: {
        ...environment.adapters.lease,
        acquire(transactionDigest) {
          const lease = originalAcquire(transactionDigest);
          environment.projectEntries.set('source.ts', createExecutionEffectLandingEntryStateV1({
            entry: file('source.ts', 'foreign'),
            objectIdentityDigest: digest('foreign-object', 'source.ts'),
            linkCount: 1,
          }));
          return lease;
        },
      },
    };
    expect(await prepareExecutionEffectLandingV1({
      planId: 'plan-stale', ...change, adapters,
    })).toMatchObject({ state: 'HOLD', code: 'PREIMAGE_MISMATCH' });
  });
});
