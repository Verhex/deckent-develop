import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProductionWiringPlanEvidenceV2 } from '../../src/core/task-types.js';
import { canonicalProjectRoot } from '../../src/core/task-result-settlement.js';
import {
  createExactProductionWiringHostObserver,
  type ExactProductionWiringHostObservationRequestV2,
} from '../../src/orchestra/production-wiring-host-observation.js';
import {
  PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
  type ProductionWiringHostProofCommandResult,
} from '../../src/orchestra/production-wiring-host-proof-runner.js';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';

const roots: string[] = [];
const sha = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const digestBytes = (bytes: Uint8Array): `sha256:${string}` => (
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`
);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function commandResult(overrides: Partial<ProductionWiringHostProofCommandResult> = {}):
ProductionWiringHostProofCommandResult {
  return {
    status: 0,
    signal: null,
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    error: false,
    overflow: false,
    timedOut: false,
    cancelled: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('production wiring normal host-observer composition', () => {
  it('keeps a direct low-level Docker constructor fail-closed unless a trusted observer is injected', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-production-wiring-low-level-'));
    roots.push(root);
    const noObserver = new DockerSpawnBackend(root, { image: 'fixture:image' });
    const trustedObserver = vi.fn();
    const injected = new DockerSpawnBackend(root, {
      image: 'fixture:image',
      productionWiringHostObserver: trustedObserver,
    });

    expect((noObserver as unknown as { productionWiringHostObserver?: unknown })
      .productionWiringHostObserver).toBeUndefined();
    expect((injected as unknown as { productionWiringHostObserver?: unknown })
      .productionWiringHostObserver).toBe(trustedObserver);
  });

  it('composes a trusted observer by default through the normal production factory', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-production-wiring-factory-'));
    roots.push(root);
    const backend = SpawnBackendFactory.create({
      backend: 'docker',
      projectDir: root,
      dockerImage: 'fixture:image',
    });

    expect(backend).toBeInstanceOf(DockerSpawnBackend);
    expect(typeof (backend as unknown as { productionWiringHostObserver?: unknown })
      .productionWiringHostObserver).toBe('function');
  });

  it('binds one hardened group outcome to the accepted attempt and COMMITTED effect authority', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-production-wiring-composition-'));
    roots.push(root);
    const registeredAssets = [
      { path: 'scripts/production-wiring-host-proof-harness.mjs', role: 'trusted-harness' as const },
      { path: 'scripts/lint-closure-dispositions.mjs', role: 'config-authority' as const },
      { path: 'scripts/closure-ledger/canonical.mjs', role: 'config-authority' as const },
      { path: 'scripts/master-plan-integrity.mjs', role: 'config-authority' as const },
      { path: 'scripts/approval-identity.mjs', role: 'config-authority' as const },
      { path: 'src/core/closure-classification-schema.json', role: 'config-authority' as const },
    ];
    const verifierAssets = registeredAssets.map(asset => {
      const bytes = Buffer.from(`fixture:${asset.path}\n`, 'utf8');
      const absolute = join(root, asset.path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, bytes);
      return { ...asset, sha256: digestBytes(bytes) };
    });
    const harnessPath = registeredAssets[0]!.path;
    chmodSync(join(root, harnessPath), 0o555);
    const targets = [
      { kind: 'producer' as const, targetId: 'closure-os.append-only-ledger' },
      { kind: 'canonical-consumer' as const, targetId: 'closure-os.authority-gate' },
      { kind: 'affected-ingress' as const, targetId: 'closure-os.ledger-file-ingress' },
      { kind: 'enablement-authority' as const, targetId: 'closure-os.reviewed-trust-anchor' },
      { kind: 'proof-target' as const, targetId: 'closure-os.chain-identity-lifecycle-authority' },
    ];
    const timeoutMs = 10_000;
    const outputLimitBytes = 64 * 1024;
    const harnessRequest = canonicalJson({
      adapterId: 'deckent-closure-os-authority-gate-v1',
      assets: verifierAssets,
      kind: 'deckent-production-wiring-host-proof-request-v1',
      outputLimitBytes,
      timeoutMs,
      version: 1,
    });
    const common = {
      observationGroupId: 'deckent:closure-os-authority-gate',
      harnessPath,
      verifierAssetPaths: registeredAssets.map(asset => asset.path),
      args: [harnessRequest],
      cwd: '.',
      timeoutMs,
      outputLimitBytes,
      expectation: {
        kind: 'adapter-structured-outcome' as const,
        schemaId: 'deckent.host-proof.closure-os-authority-gate.v1',
        outcome: 'observed' as const,
      },
    };
    const plan = createProductionWiringPlanEvidenceV2({
      version: 2,
      changeKind: 'runtime-change',
      producer: { producerId: 'closure-os.append-only-ledger' },
      canonicalConsumer: {
        consumerId: 'closure-os.authority-gate', relationship: 'invokes-producer',
      },
      affectedIngresses: [{ ingressId: 'closure-os.ledger-file-ingress', kind: 'entrypoint' }],
      enablementAuthority: {
        authorityId: 'closure-os.reviewed-trust-anchor', mechanism: 'policy',
      },
      disposition: { kind: 'production-wiring' },
      proofTargets: [{
        proofTargetId: 'closure-os.chain-identity-lifecycle-authority',
        kind: 'consumer-execution',
      }],
      hostProofProgram: {
        network: 'forbidden',
        verifierAssets,
        platforms: [{
          platform: 'linux',
          state: 'supported',
          runnerAdapterId: PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
          probes: targets.map(target => ({ target, ...common })),
        },
        { platform: 'wsl2-linux', state: 'unsupported', reasonCode: 'owner-deferred' },
        { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
        { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' }],
      },
    });
    const rootSha256 = createHash('sha256')
      .update(canonicalProjectRoot(realpathSync(root))).digest('hex');
    const request: ExactProductionWiringHostObservationRequestV2 = {
      schemaVersion: 2,
      kind: 'exact-production-wiring-host-observation-request-v2',
      identity: {
        schemaVersion: 2,
        backend: 'docker',
        projectRootSha256: rootSha256,
        projectId: 'project',
        taskId: 'task',
        attemptId: '123e4567-e89b-42d3-a456-426614174999',
        generation: 1,
      },
      acceptedResultArtifactReceiptDigest: sha('1'),
      acceptedResultChainDigest: sha('2'),
      acceptedResultPredecessorDigest: sha('3'),
      acceptedResultOccurredAt: '2026-09-02T12:00:00.000Z',
      resultDigest: sha('4'),
      effectAuthority: {
        disposition: 'COMMITTED',
        landingArtifactReceiptDigest: sha('5'),
        landingReceiptDigest: sha('6'),
        effectLandingChainDigest: sha('7'),
        effectDecisionDigest: sha('8'),
        transactionDigest: sha('9'),
        finalManifestDigest: sha('a'),
        committedAt: '2026-09-02T12:00:01.000Z',
        releasedAt: '2026-09-02T12:00:02.000Z',
      },
      taskWriteScope: { directories: ['product/'], filesWrite: ['product/feature.ts'] },
      plan,
    };
    const structured = Buffer.from(JSON.stringify({
      kind: 'deckent-production-wiring-host-proof-outcome',
      observationGroupId: common.observationGroupId,
      outcome: 'observed',
      schemaId: common.expectation.schemaId,
      targetKeys: targets.map(target => `${target.kind}:${target.targetId}`).sort(),
      version: 1,
    }), 'utf8');
    const imageId = sha('b');
    const runner = vi.fn(async (input: { args: readonly string[] }) => {
      if (input.args[0] === 'image') return commandResult({ stdout: Buffer.from(`${imageId}\n`) });
      if (input.args[0] === 'container' && input.args[1] === 'inspect') {
        return commandResult({
          status: 1,
          stderr: Buffer.from('Error: No such object: host-proof'),
        });
      }
      if (input.args[0] === 'run') return commandResult({ stdout: structured });
      return commandResult({ stdout: Buffer.from('removed\n') });
    });
    const observer = createExactProductionWiringHostObserver({
      projectRoot: root,
      image: 'mutable:tag',
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
      now: () => '2026-09-02T12:00:03.000Z',
    });

    const decision = await observer(request);

    expect(decision).toMatchObject({
      state: 'observed',
      consumerId: 'closure-os.authority-gate',
      observerId: 'deckent:docker-readonly-host-proof-v1',
    });
    if (decision.state !== 'observed' || !('proofRun' in decision)) return;
    expect(decision.proofRun.attemptBinding).toMatchObject({
      taskId: request.identity.taskId,
      attemptId: request.identity.attemptId,
      acceptedResultChainDigest: request.acceptedResultChainDigest,
      effectLandingReceiptDigest: request.effectAuthority.landingReceiptDigest,
      effectLandingChainDigest: request.effectAuthority.effectLandingChainDigest,
    });
    expect(decision.proofRun.targetObservations).toHaveLength(targets.length);
    expect(JSON.stringify(decision.proofRun)).not.toContain(structured.toString('utf8'));
  });
});
