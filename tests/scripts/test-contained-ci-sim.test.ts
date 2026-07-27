import {
  mkdir,
  mkdtemp,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  authorizeCiCandidateBirth,
  beginCiWorkspaceCleanupAttempt,
  ciManifestCleanupDisposition,
  claimCiPrebirthWorkspaceCleanup,
  claimCiWorkspaceCleanup,
  commitCiWorkspaceCleanupAttempt,
  createCiManifest,
  markCiWorkspaceReady,
  recordCiContainmentPrepareIntent,
  readCiContainmentResourceClaim,
  readCiManifest,
  releaseCiWorkspaceCleanupAttempt,
  verifyCiWorkspaceCleanupAttempt,
} from '../../scripts/ci-sim-state.mjs';
import { pinCiWorkspace } from '../../scripts/ci-sim-workspace.mjs';
import {
  closeContainmentAuthoritySession,
  createContainmentAuthoritySession,
} from '../../scripts/hermeticity/containment-authority.mjs';
import {
  buildContainedCiCandidate,
  runContainedCiSim,
} from '../../scripts/test-ci-sim-contained.mjs';
import { superviseContainedExecution } from '../../scripts/hermeticity/containment-supervisor.mjs';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const IDENTITY_DIGEST = 'b'.repeat(64);

const ADMISSION_FACETS = [
  'adapter-identity-verified',
  'bootstrap-first',
  'candidate-pre-go-excluded',
  'child-boundary-inherited',
  'control-plane-trusted',
  'descriptor-allowlist-verified',
  'host-state-unavailable',
  'native-code-constrained',
  'network-denied',
  'no-writable-source-descriptor',
  'node-permission-active',
  'process-tree-owned',
  'scratch-only-writable',
  'source-read-only',
  'startup-sanitized',
];

const SETTLEMENT_FACETS = [
  'bootstrap-observed',
  'cleanup-verified',
  'descendant-tree-empty',
  'receipt-host-owned',
  'termination-verified',
  'test-process-exited',
];

function provenFacets(ids: string[]) {
  const offset = ids === ADMISSION_FACETS ? 1 : 1_001;
  return ids.map((id, index) => ({
    id,
    state: 'PROVEN',
    evidenceRef: `sha256:${(index + offset).toString(16).padStart(64, '0')}`,
    evidenceBindingRef:
      `sha256:${(index + offset + 100).toString(16).padStart(64, '0')}`,
  }));
}

function workspace() {
  return {
    runNonce: 'contained-run-001',
    rootDir: '/fixture/root',
    baseDir: '/fixture/base',
    workspaceDir: '/fixture/base/worktree',
    homeDir: '/fixture/base/home',
    manifestPath: '/fixture/base/manifest.json',
    snapshotRef: `ci-sim-snapshot:${'c'.repeat(64)}`,
    receipt: { source: 'fixture' },
  };
}

function liveOptions(overrides: Record<string, unknown> = {}) {
  const created = workspace();
  const order: string[] = [];
  const cleanupAuthority = {};
  let handedOffAuthority: object | undefined;
  const recordCiFinality = vi.fn(async (evidence: Record<string, unknown>) => {
    order.push(`finality:${String(evidence.status)}`);
    return evidence.status === 'PROVEN'
      ? {
          manifest: {
            schemaVersion: 3,
            state: 'resource-released',
          },
          cleanupAuthority,
        }
      : {
          manifest: {
            schemaVersion: 3,
            state: 'finality-hold',
          },
          cleanupAuthority: null,
        };
  });
  const disposeWorkspace = vi.fn(async () => {
    order.push('dispose');
    return [];
  });
  const runLegacy = vi.fn(async (options: {
    onWorkspace: (value: ReturnType<typeof workspace>) => void;
    pinWorkspace: (value: ReturnType<typeof workspace>) => Promise<void>;
    runner: (
      value: ReturnType<typeof workspace>,
      args: string[],
    ) => Promise<{ outcome: Promise<{ code: number; signal: string | null }> }>;
  }) => {
    order.push('legacy');
    options.onWorkspace(created);
    const execution = await options.runner(created, []);
    const outcome = await execution.outcome;
    await options.pinWorkspace(created);
    return {
      ...outcome,
      snapshotRef: created.snapshotRef,
      receipt: created.receipt,
      workspaceDir: created.workspaceDir,
    };
  });
  const executionAdapter = {
    adapterId: 'fixture-kernel-v1',
    resourceType: 'linux-namespace',
    recoveryRef: DIGEST,
    prepareSuspendedResource: vi.fn(async (intent: Record<string, unknown>) => {
      order.push('prepare');
      return {
        state: 'PREPARED',
        verified: true,
        adapterId: 'fixture-kernel-v1',
        resourceType: 'linux-namespace',
        resourceId: 'fixture-resource-001',
        identity: {
          schemaVersion: 1,
          runNonce: created.runNonce,
          adapterId: 'fixture-kernel-v1',
          resourceType: 'linux-namespace',
          resourceId: 'fixture-resource-001',
          birthToken: '12345',
          claimNonce: intent.claimNonce,
          preparedAt: intent.preparedAt,
          recoveryRef: intent.recoveryRef,
          cgroupIdentity: 'fixture-resource-001',
          leaderBirthTicks: '12345',
          leaderPid: 4242,
          mountNamespaceInode: '1001',
          pidNamespaceInode: '1002',
          userNamespaceInode: '1003',
        },
        spawn: vi.fn(),
        terminateAndVerify: vi.fn(),
      };
    }),
  };
  const options = {
    mode: 'enforce',
    liveAuthorized: true,
    rootDir: '/fixture/root',
    runLegacy,
    disposeWorkspace,
    pinWorkspace: vi.fn(async () => {
      order.push('pin');
    }),
    buildCandidate: async () => ({
      command: process.execPath,
      args: [
        '--permission',
        '/fixture/base/worktree/scripts/hermeticity/process-bootstrap.mjs',
        '--entry',
        '/fixture/base/worktree/node_modules/vitest/vitest.mjs',
        '--',
        'run',
      ],
      cwd: '/fixture/base/worktree',
      env: { CI: '1' },
    }),
    adapterPlan: {
      decision: 'ADMITTED',
      code: 'CONTAINMENT_FIXTURE_PLAN',
      adapterId: 'fixture-kernel-v1',
      proofEligible: false,
      facets: {},
      plan: {},
    },
    boundaryClass: 'kernel',
    admissionFacets: provenFacets(ADMISSION_FACETS),
    settlementFacets: provenFacets(SETTLEMENT_FACETS),
    executionAdapter,
    resourceType: 'linux-namespace',
    resourceId: 'fixture-resource-001',
    policyRef: DIGEST,
    controlPlaneRef: DIGEST,
    sourceRef: DIGEST,
    dependencyProjectionRef: DIGEST,
    runtimeProjectionRef: DIGEST,
    randomBytes: () => Buffer.alloc(32, 7),
    now: () => '2026-07-27T00:00:00.000Z',
    recordPrepareIntent: vi.fn(async () => {
      order.push('prepare-intent');
      return { schemaVersion: 3, state: 'prepare-intent' };
    }),
    claimResource: vi.fn(async (identity: Record<string, unknown>) => {
      order.push('claim');
      return {
        schemaVersion: 1,
        runNonce: created.runNonce,
        identity,
        identityDigest: IDENTITY_DIGEST,
        claimedAt: '2026-07-27T00:00:01.000Z',
      };
    }),
    authorizeBirth: vi.fn(async () => {
      order.push('authorize');
      return {
        schemaVersion: 3,
        state: 'gate-released',
        containment: {
          mode: 'enforce',
          candidateBirthAuthorized: true,
          resourceClaimDigest: IDENTITY_DIGEST,
          adapterId: 'fixture-kernel-v1',
          finality: { status: 'UNPROVEN' },
        },
      };
    }),
    recordRunning: vi.fn(async () => {
      order.push('running');
      return { schemaVersion: 3, state: 'running' };
    }),
    recordCompletion: vi.fn(async () => {
      order.push('completion');
      return { schemaVersion: 3, state: 'completion-recorded' };
    }),
    executeOwned: vi.fn(async (input: {
      binding: { identityDigest: string };
      preparedResource: { identityDigest: string };
      onCandidateBirth: (evidence: { pid: number }) => Promise<void>;
      onCompletion: (outcome: { code: number; signal: null }) => Promise<void>;
    }) => {
      order.push('execute');
      expect(input.binding.identityDigest).toBe(IDENTITY_DIGEST);
      expect(input.preparedResource.identityDigest).toBe(IDENTITY_DIGEST);
      await input.onCandidateBirth({ pid: 4243 });
      await input.onCompletion({ code: 0, signal: null });
      return {
        state: 'SETTLED',
        code: 'CONTAINMENT_EXECUTION_SETTLED',
        retain: false,
        candidateBirth: 'BORN',
        outcome: { code: 0, signal: null },
        finality: {
          status: 'PROVEN',
          authenticated: false,
          terminationVerified: true,
          adapterIdentityVerified: true,
        },
        output: {
          stdout: {
            text: '',
            capturedBytes: 0,
            observedBytes: 0,
            limitBytes: 1024,
            truncated: false,
          },
          stderr: {
            text: '',
            capturedBytes: 0,
            observedBytes: 0,
            limitBytes: 1024,
            truncated: false,
          },
        },
      };
    }),
    recordFinality: recordCiFinality,
    acceptCleanupAuthority: vi.fn(async (authority: object) => {
      order.push('authority-handoff');
      handedOffAuthority = authority;
    }),
    ...overrides,
  };
  return {
    options,
    order,
    runLegacy,
    disposeWorkspace,
    recordCiFinality,
    cleanupAuthority,
    handedOffAuthority: () => handedOffAuthority,
  };
}

async function runSyntheticSupervisor(
  fixture: ReturnType<typeof liveOptions>,
) {
  const created = workspace();
  return superviseContainedExecution({
    ...fixture.options,
    workspace: created,
    runNonce: created.runNonce,
    candidate: await fixture.options.buildCandidate(),
  });
}

describe('contained CI simulation wrapper', () => {
  it('makes the pristine bootstrap the first external JavaScript module', () => {
    const candidate = buildContainedCiCandidate(workspace(), ['fixture.test.ts']);
    const bootstrapIndex = candidate.args.findIndex(argument => !argument.startsWith('-'));
    const vitestIndex = candidate.args.indexOf(
      '/fixture/base/worktree/node_modules/vitest/vitest.mjs',
    );

    expect(candidate.command).toBe(process.execPath);
    expect(candidate.args).toContain('--permission');
    expect(candidate.args[bootstrapIndex]).toBe(
      '/fixture/base/worktree/scripts/hermeticity/process-bootstrap.mjs',
    );
    expect(bootstrapIndex).toBeLessThan(vitestIndex);
    expect(candidate.env).not.toHaveProperty('NODE_OPTIONS');
    expect(candidate.env).not.toHaveProperty('NODE_PATH');
  });

  it('uses typed probe HOLD without workspace materialization or candidate execution', async () => {
    const runLegacy = vi.fn();
    const planAdapter = vi.fn(() => ({
      decision: 'ADMITTED',
      adapterId: 'host-presence-only',
      proofEligible: false,
    }));

    const result = await runContainedCiSim({
      mode: 'probe',
      runLegacy,
      planAdapter,
    });

    expect(result).toMatchObject({
      code: 2,
      state: 'HOLD',
      executed: false,
      containment: {
        state: 'HOLD',
        code: 'E_CONTAINMENT_HOLD_PROBE_ONLY',
        candidateBirth: 'NOT_BORN',
        liveExecution: false,
      },
    });
    expect(runLegacy).not.toHaveBeenCalled();
  });

  it('serializes pristine-v3 cleanup against prepare and leaves failed cleanup durably held', async () => {
    const raceBaseDir = await mkdtemp(join(tmpdir(), 'containment-prebirth-race-'));
    let fallbackBaseDir: string | undefined;
    let authoritySession: unknown;
    try {
      const raceWorkspaceDir = join(raceBaseDir, 'worktree');
      const raceHomeDir = join(raceBaseDir, 'home');
      await mkdir(raceWorkspaceDir);
      await mkdir(raceHomeDir);
      const raceWorkspace = {
        runNonce: 'prebirth-race-001',
        rootDir: raceBaseDir,
        baseDir: raceBaseDir,
        workspaceDir: raceWorkspaceDir,
        homeDir: raceHomeDir,
        manifestPath: join(raceBaseDir, 'manifest.json'),
        containmentMode: 'enforce',
      };
      await createCiManifest(raceWorkspace);
      await markCiWorkspaceReady(raceWorkspace, {
        snapshotRef: `ci-sim-snapshot:${'1'.repeat(64)}`,
        receipt: { source: 'prebirth-race' },
        preview: [],
      });

      const sessionResult = createContainmentAuthoritySession({
        randomBytes: (size: number) => new Uint8Array(size).fill(5),
      });
      if (!sessionResult.ok) {
        throw new Error('E_TEST_CONTAINMENT_AUTHORITY_SESSION_MISSING');
      }
      authoritySession = sessionResult.value;
      const prepareIntent = {
        adapterId: 'fixture-kernel-v1',
        resourceType: 'linux-namespace',
        claimNonce: '5'.repeat(64),
        planRef: DIGEST,
        recoveryRef: DIGEST,
        policyRef: DIGEST,
        controlPlaneRef: DIGEST,
        sourceRef: DIGEST,
        dependencyProjectionRef: DIGEST,
        runtimeProjectionRef: DIGEST,
        executionIntentRef: DIGEST,
      };

      let releaseBarrier: (() => void) | undefined;
      const barrier = new Promise<void>(resolveBarrier => {
        releaseBarrier = resolveBarrier;
      });
      const cleanupContender = (async () => {
        await barrier;
        return claimCiPrebirthWorkspaceCleanup(raceWorkspace);
      })();
      const prepareContender = (async () => {
        await barrier;
        return recordCiContainmentPrepareIntent(
          raceWorkspace,
          prepareIntent,
          authoritySession,
        );
      })();
      releaseBarrier?.();
      const contenders = await Promise.allSettled([
        cleanupContender,
        prepareContender,
      ]);
      expect(contenders.filter(result => result.status === 'fulfilled'))
        .toHaveLength(1);
      expect(contenders.filter(result => result.status === 'rejected'))
        .toHaveLength(1);

      let cleanupClaim:
        Awaited<ReturnType<typeof claimCiPrebirthWorkspaceCleanup>>;
      let cleanupWorkspace = raceWorkspace;
      if (contenders[0].status === 'fulfilled') {
        cleanupClaim = contenders[0].value;
      } else {
        expect(contenders[1]).toMatchObject({
          status: 'fulfilled',
          value: expect.objectContaining({ state: 'prepare-intent' }),
        });
        fallbackBaseDir = await mkdtemp(
          join(tmpdir(), 'containment-prebirth-cleanup-'),
        );
        const fallbackWorkspaceDir = join(fallbackBaseDir, 'worktree');
        const fallbackHomeDir = join(fallbackBaseDir, 'home');
        await mkdir(fallbackWorkspaceDir);
        await mkdir(fallbackHomeDir);
        cleanupWorkspace = {
          runNonce: 'prebirth-cleanup-001',
          rootDir: fallbackBaseDir,
          baseDir: fallbackBaseDir,
          workspaceDir: fallbackWorkspaceDir,
          homeDir: fallbackHomeDir,
          manifestPath: join(fallbackBaseDir, 'manifest.json'),
          containmentMode: 'enforce',
        };
        await createCiManifest(cleanupWorkspace);
        await markCiWorkspaceReady(cleanupWorkspace, {
          snapshotRef: `ci-sim-snapshot:${'2'.repeat(64)}`,
          receipt: { source: 'prebirth-cleanup' },
          preview: [],
        });
        cleanupClaim = await claimCiPrebirthWorkspaceCleanup(
          cleanupWorkspace,
        );
      }

      expect(cleanupClaim.manifest).toMatchObject({
        state: 'prebirth-cleanup-claimed',
        containment: {
          candidateBirthAuthorized: false,
          prepareIntent: null,
          prebirthCleanupClaim: {
            runNonce: cleanupWorkspace.runNonce,
          },
        },
      });
      await expect(recordCiContainmentPrepareIntent(
        cleanupWorkspace,
        prepareIntent,
        authoritySession,
      )).rejects.toThrow('E_CI_SIM_CONTAINMENT_PREPARE_STATE_INVALID');
      await expect(authorizeCiCandidateBirth(cleanupWorkspace, {
        identityDigest: 'b'.repeat(64),
        authoritySession,
        authorityClaim: {},
      })).rejects.toThrow('E_CI_SIM_CONTAINMENT_GATE_CLAIM_MISMATCH');

      const cleanupLease = cleanupClaim.cleanupLease;
      expect(Object.isFrozen(cleanupLease)).toBe(true);
      expect(verifyCiWorkspaceCleanupAttempt(
        cleanupLease,
        cleanupClaim.manifest,
        null,
      )).toBe(true);
      for (const forgedLease of [
        Object.create(Object.getPrototypeOf(cleanupLease)),
        new Proxy(cleanupLease, {}),
        JSON.parse(JSON.stringify(cleanupLease)),
      ]) {
        expect(verifyCiWorkspaceCleanupAttempt(
          forgedLease,
          cleanupClaim.manifest,
          null,
        )).toBe(false);
        expect(commitCiWorkspaceCleanupAttempt(forgedLease)).toBe(false);
      }

      const removeWorkspace = vi.fn()
        .mockRejectedValueOnce(
          new Error('E_TEST_INJECTED_PREBIRTH_CLEANUP_FAILURE'),
        );
      await expect(removeWorkspace()).rejects.toThrow(
        'E_TEST_INJECTED_PREBIRTH_CLEANUP_FAILURE',
      );
      expect(releaseCiWorkspaceCleanupAttempt(cleanupLease)).toBe(true);
      expect(verifyCiWorkspaceCleanupAttempt(
        cleanupLease,
        cleanupClaim.manifest,
        null,
      )).toBe(false);
      expect(commitCiWorkspaceCleanupAttempt(cleanupLease)).toBe(false);

      const heldManifest = await readCiManifest(
        cleanupWorkspace.manifestPath,
      );
      expect(heldManifest).toMatchObject({
        state: 'prebirth-cleanup-claimed',
        containment: {
          candidateBirthAuthorized: false,
          prepareIntent: null,
          resourceReleased: false,
        },
      });
      expect(ciManifestCleanupDisposition(
        heldManifest,
        null,
        null,
      )).toMatchObject({
        decision: 'HOLD',
        code: 'E_CI_SIM_STALE_HOLD:RESOURCE_CLAIM_MISSING',
      });
    } finally {
      if (authoritySession) {
        closeContainmentAuthoritySession(authoritySession);
      }
      if (fallbackBaseDir) {
        await rm(fallbackBaseDir, { recursive: true, force: true });
      }
      await rm(raceBaseDir, { recursive: true, force: true });
    }
  });

  it('orders durable claim before birth and releases cleanup only after HMAC finality', async () => {
    const fixture = liveOptions();
    const result = await runSyntheticSupervisor(fixture);

    expect(result).toMatchObject({
      state: 'GO',
      receiptAuthenticated: true,
      proofEligible: true,
      finality: {
        status: 'PROVEN',
        terminationVerified: true,
        adapterIdentityVerified: true,
      },
    });
    await fixture.disposeWorkspace(workspace(), fixture.handedOffAuthority());
    expect(fixture.order).toEqual([
      'prepare-intent',
      'prepare',
      'claim',
      'authorize',
      'execute',
      'running',
      'completion',
      'finality:PROVEN',
      'authority-handoff',
      'dispose',
    ]);
    expect(fixture.disposeWorkspace).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secretHex');
    expect(serialized).not.toContain(Buffer.alloc(32, 7).toString('hex'));
  });

  it('keeps cleanup authority opaque, manifest-bound, and one-shot under forgery attempts', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'containment-capability-'));
    try {
      const workspaceDir = join(sandbox, 'worktree');
      const homeDir = join(sandbox, 'home');
      const created = {
        runNonce: 'contained-run-001',
        rootDir: sandbox,
        baseDir: sandbox,
        workspaceDir,
        homeDir,
        manifestPath: join(sandbox, 'manifest.json'),
        containmentMode: 'enforce',
        snapshotRef: `ci-sim-snapshot:${'c'.repeat(64)}`,
        receipt: { source: 'fixture' },
      };
      await mkdir(workspaceDir);
      await mkdir(homeDir);
      await createCiManifest(created);
      await markCiWorkspaceReady(created, {
        snapshotRef: created.snapshotRef,
        receipt: created.receipt,
        preview: [],
      });

      const fixture = liveOptions();
      let cleanupAuthority: object | undefined;
      const result = await superviseContainedExecution({
        ...fixture.options,
        workspace: created,
        runNonce: created.runNonce,
        candidate: {
          command: process.execPath,
          args: [
            '--permission',
            join(
              created.workspaceDir,
              'scripts',
              'hermeticity',
              'process-bootstrap.mjs',
            ),
            '--entry',
            join(created.workspaceDir, 'node_modules', 'vitest', 'vitest.mjs'),
            '--',
            'run',
          ],
          cwd: created.workspaceDir,
          env: { CI: '1' },
        },
        recordPrepareIntent: undefined,
        claimResource: undefined,
        authorizeBirth: undefined,
        recordRunning: undefined,
        recordCompletion: undefined,
        recordFinality: undefined,
        executeOwned: async (input: {
          onCandidateBirth: (evidence: { pid: number }) => Promise<void>;
          onCompletion: (
            outcome: { code: number; signal: null },
          ) => Promise<void>;
        }) => {
          await input.onCandidateBirth({ pid: 4243 });
          await input.onCompletion({ code: 0, signal: null });
          return {
            state: 'SETTLED',
            code: 'CONTAINMENT_EXECUTION_SETTLED',
            retain: false,
            candidateBirth: 'BORN',
            outcome: { code: 0, signal: null },
            finality: {
              status: 'PROVEN',
              authenticated: false,
              terminationVerified: true,
              adapterIdentityVerified: true,
            },
            output: {
              stdout: {
                text: '',
                capturedBytes: 0,
                observedBytes: 0,
                limitBytes: 1_024,
                truncated: false,
              },
              stderr: {
                text: '',
                capturedBytes: 0,
                observedBytes: 0,
                limitBytes: 1_024,
                truncated: false,
              },
            },
          };
        },
        acceptCleanupAuthority: async authority => {
          cleanupAuthority = authority;
        },
      });
      expect(result).toMatchObject({
        state: 'GO',
        receiptAuthenticated: true,
      });
      expect(cleanupAuthority).toBeDefined();

      const manifest = await readCiManifest(created.manifestPath);
      const resourceClaim = await readCiContainmentResourceClaim(
        created.manifestPath,
      );
      if (!cleanupAuthority || !resourceClaim) {
        throw new Error('E_TEST_CONTAINMENT_CLEANUP_AUTHORITY_MISSING');
      }
      const authority = cleanupAuthority;
      const prototype = Object.getPrototypeOf(authority);
      expect(Object.isFrozen(authority)).toBe(true);
      expect(Object.isFrozen(prototype)).toBe(true);
      expect(() => Object.defineProperty(prototype, 'forged', {
        value: true,
      })).toThrow();

      const forgedByPrototype = Object.create(prototype);
      expect(ciManifestCleanupDisposition(
        manifest,
        resourceClaim,
        forgedByPrototype,
      )).toMatchObject({
        decision: 'HOLD',
        code: 'E_CI_SIM_STALE_HOLD:VERIFIED_FINALITY_CAPABILITY_REQUIRED',
      });

      const proxied = new Proxy(authority, {});
      expect(ciManifestCleanupDisposition(
        manifest,
        resourceClaim,
        proxied,
      )).toMatchObject({
        decision: 'HOLD',
        code: 'E_CI_SIM_STALE_HOLD:VERIFIED_FINALITY_CAPABILITY_REQUIRED',
      });

      const serializedForgery = JSON.parse(JSON.stringify(authority));
      expect(ciManifestCleanupDisposition(
        manifest,
        resourceClaim,
        serializedForgery,
      )).toMatchObject({
        decision: 'HOLD',
        code: 'E_CI_SIM_STALE_HOLD:VERIFIED_FINALITY_CAPABILITY_REQUIRED',
      });

      const crossRunManifest = structuredClone(manifest);
      const crossRunClaim = structuredClone(resourceClaim);
      crossRunManifest.runNonce = 'contained-run-foreign';
      crossRunClaim.runNonce = 'contained-run-foreign';
      crossRunClaim.identity.runNonce = 'contained-run-foreign';
      expect(ciManifestCleanupDisposition(
        crossRunManifest,
        crossRunClaim,
        authority,
      )).toMatchObject({
        decision: 'HOLD',
        code: 'E_CI_SIM_STALE_HOLD:VERIFIED_FINALITY_CAPABILITY_REQUIRED',
      });

      const crossManifest = structuredClone(manifest);
      crossManifest.revision += 1;
      expect(ciManifestCleanupDisposition(
        crossManifest,
        resourceClaim,
        authority,
      )).toMatchObject({
        decision: 'HOLD',
        code: 'E_CI_SIM_STALE_HOLD:VERIFIED_FINALITY_CAPABILITY_REQUIRED',
      });

      const originalWeakMapGet = WeakMap.prototype.get;
      let prototypeOverrideResult;
      try {
        Object.defineProperty(WeakMap.prototype, 'get', {
          configurable: true,
          writable: true,
          value: () => () => true,
        });
        prototypeOverrideResult = ciManifestCleanupDisposition(
          manifest,
          resourceClaim,
          {},
        );
      } finally {
        Object.defineProperty(WeakMap.prototype, 'get', {
          configurable: true,
          writable: true,
          value: originalWeakMapGet,
        });
      }
      expect(prototypeOverrideResult).toMatchObject({
        decision: 'HOLD',
        code: 'E_CI_SIM_STALE_HOLD:VERIFIED_FINALITY_CAPABILITY_REQUIRED',
      });

      expect(ciManifestCleanupDisposition(
        manifest,
        resourceClaim,
        authority,
      )).toEqual({
        decision: 'DISPOSE',
        code: 'E_CI_SIM_CONTAINMENT_FINALITY_PROVEN',
      });
      expect(ciManifestCleanupDisposition(
        manifest,
        resourceClaim,
        authority,
      )).toEqual({
        decision: 'DISPOSE',
        code: 'E_CI_SIM_CONTAINMENT_FINALITY_PROVEN',
      });

      const cleanupManifest = await claimCiWorkspaceCleanup(
        created,
        resourceClaim,
        authority,
      );
      expect(cleanupManifest).toMatchObject({
        state: 'cleanup-claimed',
        containment: {
          cleanupClaim: {
            runNonce: created.runNonce,
            resourceIdentityRef:
              manifest.containment.resourceIdentityRef,
          },
        },
      });
      const concurrentMutation = await Promise.allSettled([
        pinCiWorkspace(created),
        claimCiWorkspaceCleanup(created, resourceClaim, authority),
      ]);
      expect(concurrentMutation[0]).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({
          message: 'E_CI_SIM_CONTAINMENT_STATE_TRANSITION_INVALID',
        }),
      });
      expect(concurrentMutation[1]).toMatchObject({
        status: 'fulfilled',
        value: expect.objectContaining({ state: 'cleanup-claimed' }),
      });

      const firstLease = beginCiWorkspaceCleanupAttempt(
        cleanupManifest,
        resourceClaim,
        authority,
      );
      if (!firstLease) {
        throw new Error('E_TEST_CONTAINMENT_CLEANUP_LEASE_MISSING');
      }
      const leasePrototype = Object.getPrototypeOf(firstLease);
      expect(Object.isFrozen(firstLease)).toBe(true);
      expect(Object.isFrozen(leasePrototype)).toBe(true);
      expect(() => Object.defineProperty(leasePrototype, 'forged', {
        value: true,
      })).toThrow();
      for (const forgedLease of [
        Object.create(leasePrototype),
        new Proxy(firstLease, {}),
        JSON.parse(JSON.stringify(firstLease)),
      ]) {
        expect(verifyCiWorkspaceCleanupAttempt(
          forgedLease,
          cleanupManifest,
          resourceClaim,
        )).toBe(false);
        expect(commitCiWorkspaceCleanupAttempt(forgedLease)).toBe(false);
      }

      const removeWorkspace = vi.fn()
        .mockRejectedValueOnce(new Error('E_TEST_INJECTED_CLEANUP_FAILURE'))
        .mockResolvedValueOnce(undefined);
      await expect(removeWorkspace()).rejects.toThrow(
        'E_TEST_INJECTED_CLEANUP_FAILURE',
      );
      expect(releaseCiWorkspaceCleanupAttempt(firstLease)).toBe(true);
      expect(verifyCiWorkspaceCleanupAttempt(
        firstLease,
        cleanupManifest,
        resourceClaim,
      )).toBe(false);
      expect(commitCiWorkspaceCleanupAttempt(firstLease)).toBe(false);

      const retryLease = beginCiWorkspaceCleanupAttempt(
        cleanupManifest,
        resourceClaim,
        authority,
      );
      if (!retryLease) {
        throw new Error('E_TEST_CONTAINMENT_CLEANUP_RETRY_LEASE_MISSING');
      }
      expect(verifyCiWorkspaceCleanupAttempt(
        retryLease,
        cleanupManifest,
        resourceClaim,
      )).toBe(true);
      await expect(removeWorkspace()).resolves.toBeUndefined();
      expect(commitCiWorkspaceCleanupAttempt(retryLease)).toBe(true);
      expect(commitCiWorkspaceCleanupAttempt(retryLease)).toBe(false);
      expect(beginCiWorkspaceCleanupAttempt(
        cleanupManifest,
        resourceClaim,
        authority,
      )).toBeNull();
      expect(ciManifestCleanupDisposition(
        cleanupManifest,
        resourceClaim,
        authority,
      )).toMatchObject({
        decision: 'HOLD',
        code: 'E_CI_SIM_STALE_HOLD:VERIFIED_FINALITY_CAPABILITY_REQUIRED',
      });
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('holds and retains on a forged supervisor receipt', async () => {
    const fixture = liveOptions({
      receiptTransport: (receipt: Record<string, unknown>) => ({
        ...receipt,
        executionRef: `sha256:${'f'.repeat(64)}`,
      }),
    });
    const result = await runSyntheticSupervisor(fixture);

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_RECEIPT_FORGED',
      retain: true,
    });
    expect(fixture.recordCiFinality).toHaveBeenCalledWith(expect.objectContaining({
      status: 'UNPROVEN',
    }));
    expect(fixture.disposeWorkspace).not.toHaveBeenCalled();
  });

  it('holds and retains when the trusted receipt transport loses the receipt', async () => {
    const fixture = liveOptions({
      receiptTransport: () => null,
    });
    const result = await runSyntheticSupervisor(fixture);

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_RECEIPT_MISSING',
      retain: true,
    });
    expect(fixture.disposeWorkspace).not.toHaveBeenCalled();
  });

  it('rejects replayed facet evidence before candidate birth', async () => {
    const admissionFacets = provenFacets(ADMISSION_FACETS);
    const replayedEvidence = admissionFacets[0]!;
    admissionFacets[1] = {
      ...admissionFacets[1]!,
      evidenceBindingRef: replayedEvidence.evidenceBindingRef,
    };
    const fixture = liveOptions({ admissionFacets });
    const result = await runSyntheticSupervisor(fixture);

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_FACET_EVIDENCE_INVALID',
      candidateBirth: 'NOT_BORN',
      retain: true,
    });
    expect(fixture.options.executeOwned).not.toHaveBeenCalled();
    expect(fixture.recordCiFinality).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'UNPROVEN' }),
    );
  });

  it('does not clean a workspace whose process-tree finality is unknown', async () => {
    const fixture = liveOptions({
      executeOwned: async (input: {
        onCandidateBirth: (evidence: { pid: number }) => Promise<void>;
        onCompletion: (outcome: { code: number; signal: null }) => Promise<void>;
      }) => {
        await input.onCandidateBirth({ pid: 4243 });
        await input.onCompletion({ code: 0, signal: null });
        return {
          state: 'HOLD',
          code: 'E_CONTAINMENT_HOLD_FINALITY_UNKNOWN',
          retain: true,
          candidateBirth: 'BORN',
          finality: {
            status: 'UNKNOWN',
            authenticated: false,
            terminationVerified: false,
            adapterIdentityVerified: false,
          },
          output: {},
        };
      },
    });
    const result = await runSyntheticSupervisor(fixture);

    expect(result).toMatchObject({
      state: 'HOLD',
      retain: true,
    });
    expect(fixture.disposeWorkspace).not.toHaveBeenCalled();
  });

  it('never promotes plain injected facets or adapters through the public wrapper', async () => {
    const fixture = liveOptions();
    const result = await runContainedCiSim(fixture.options);

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 2,
      containment: {
        code: 'E_CONTAINMENT_HOLD_LIVE_EVIDENCE_AUTHORITY_REQUIRED',
        candidateBirth: 'NOT_BORN',
        proofEligible: false,
      },
    });
    expect(fixture.options.executeOwned).not.toHaveBeenCalled();
    expect(fixture.runLegacy).not.toHaveBeenCalled();
    expect(fixture.disposeWorkspace).not.toHaveBeenCalled();
    expect(fixture.order).toEqual([]);
  });

  it('rejects Node preload flags before durable prepare intent or candidate birth', async () => {
    const fixture = liveOptions({
      buildCandidate: async () => ({
        command: process.execPath,
        args: [
          '--permission',
          '--require=/fixture/malicious-preload.cjs',
          '/fixture/base/worktree/scripts/hermeticity/process-bootstrap.mjs',
          '--entry',
          '/fixture/base/worktree/node_modules/vitest/vitest.mjs',
          '--',
          'run',
        ],
        cwd: '/fixture/base/worktree',
        env: { CI: '1' },
      }),
    });

    const result = await runSyntheticSupervisor(fixture);

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_BOOTSTRAP_CANDIDATE_REQUIRED',
      candidateBirth: 'NOT_BORN',
    });
    expect(fixture.options.recordPrepareIntent).not.toHaveBeenCalled();
    expect(fixture.options.executeOwned).not.toHaveBeenCalled();
    expect(fixture.order).toEqual([]);
  });

  it('rejects an alternate external entry before durable prepare or candidate birth', async () => {
    const fixture = liveOptions({
      buildCandidate: async () => ({
        command: process.execPath,
        args: [
          '--permission',
          '/fixture/base/worktree/scripts/hermeticity/process-bootstrap.mjs',
          '--entry',
          '/fixture/base/worktree/malicious-entry.mjs',
          '--',
          'run',
        ],
        cwd: '/fixture/base/worktree',
        env: { CI: '1' },
      }),
    });

    const result = await runSyntheticSupervisor(fixture);

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_BOOTSTRAP_CANDIDATE_REQUIRED',
      candidateBirth: 'NOT_BORN',
    });
    expect(fixture.options.recordPrepareIntent).not.toHaveBeenCalled();
    expect(fixture.options.executeOwned).not.toHaveBeenCalled();
    expect(fixture.order).toEqual([]);
  });
});
