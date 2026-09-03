import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { canonicalTaskAttemptCustodyJson } from '../../src/core/task-attempt-custody-store.js';
import {
  createGoNoGoCriterionItem,
  createProductionWiringPlanEvidence,
  createProductionWiringPlanEvidenceV2,
  createRunPolicyPlanAuthority,
  deriveProductionWiringApplicability,
  type Task,
} from '../../src/core/task-types.js';
import {
  createExactDockerDispatchTaskMaterialAuthority,
  exactDockerDispatchCanonicalDigest,
  parseExactDockerDispatchTaskMaterial,
  parseExactDockerDispatchTaskSnapshotAuthority,
} from '../../src/orchestra/exact-docker-dispatch-task-authority.js';
import { createExactNormalTaskApprovedMaterialV3 } from '../../src/orchestra/exact-evaluation-policy-authority.js';
import { createTaskResultSettlementV2TestPolicy } from '../helpers/task-result-settlement-v2-fixture.js';

const policy = createTaskResultSettlementV2TestPolicy();

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

function v2Wiring() {
  const verifierAssets = [
    { path: 'scripts/production-wiring-host-proof-harness.mjs', sha256: `sha256:${'a'.repeat(64)}` as const, role: 'trusted-harness' as const },
    { path: 'scripts/lint-closure-dispositions.mjs', sha256: `sha256:${'b'.repeat(64)}` as const, role: 'config-authority' as const },
    { path: 'scripts/closure-ledger/canonical.mjs', sha256: `sha256:${'c'.repeat(64)}` as const, role: 'config-authority' as const },
    { path: 'scripts/master-plan-integrity.mjs', sha256: `sha256:${'d'.repeat(64)}` as const, role: 'config-authority' as const },
    { path: 'scripts/approval-identity.mjs', sha256: `sha256:${'e'.repeat(64)}` as const, role: 'config-authority' as const },
    { path: 'src/core/closure-classification-schema.json', sha256: `sha256:${'f'.repeat(64)}` as const, role: 'config-authority' as const },
  ];
  const timeoutMs = 30_000;
  const outputLimitBytes = 1_048_576;
  const args = [canonicalJson({
    adapterId: 'deckent-closure-os-authority-gate-v1',
    assets: verifierAssets,
    kind: 'deckent-production-wiring-host-proof-request-v1',
    outputLimitBytes,
    timeoutMs,
    version: 1,
  })];
  const probe = (kind: 'producer' | 'canonical-consumer' | 'affected-ingress' | 'enablement-authority' | 'proof-target', targetId: string) => ({
    target: { kind, targetId }, observationGroupId: 'deckent:closure-os-authority-gate', harnessPath: 'scripts/production-wiring-host-proof-harness.mjs', verifierAssetPaths: verifierAssets.map(asset => asset.path),
    args, cwd: '.', timeoutMs, outputLimitBytes,
    expectation: { kind: 'adapter-structured-outcome' as const, schemaId: 'deckent.host-proof.closure-os-authority-gate.v1', outcome: 'observed' as const },
  });
  return createProductionWiringPlanEvidenceV2({
    version: 2, changeKind: 'runtime-change', producer: { producerId: 'closure-os.append-only-ledger' },
    canonicalConsumer: { consumerId: 'closure-os.authority-gate', relationship: 'invokes-producer' },
    affectedIngresses: [{ ingressId: 'closure-os.ledger-file-ingress', kind: 'ingress' }],
    enablementAuthority: { authorityId: 'closure-os.reviewed-trust-anchor', mechanism: 'policy' },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{ proofTargetId: 'closure-os.chain-identity-lifecycle-authority', kind: 'consumer-execution' }],
    hostProofProgram: { network: 'forbidden', verifierAssets, platforms: [
      { platform: 'linux', state: 'unsupported', reasonCode: 'environment-unavailable' },
      { platform: 'wsl2-linux', state: 'supported', runnerAdapterId: 'docker-readonly-host-proof-v1', probes: [
        probe('producer', 'closure-os.append-only-ledger'),
        probe('canonical-consumer', 'closure-os.authority-gate'), probe('affected-ingress', 'closure-os.ledger-file-ingress'),
        probe('enablement-authority', 'closure-os.reviewed-trust-anchor'), probe('proof-target', 'closure-os.chain-identity-lifecycle-authority'),
      ] },
      { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' },
    ] },
  });
}

function unregisteredV2Wiring() {
  const valid = v2Wiring();
  const arbitraryPath = 'scripts/planner-designated-proof.mjs';
  return createProductionWiringPlanEvidenceV2({
    ...valid.contract,
    hostProofProgram: {
      network: valid.contract.hostProofProgram.network,
      verifierAssets: [{
        path: arbitraryPath,
        sha256: `sha256:${'1'.repeat(64)}`,
        role: 'trusted-harness',
      }],
      platforms: valid.contract.hostProofProgram.platforms.map(platform => {
        if (platform.state === 'unsupported') return platform;
        return {
          platform: platform.platform,
          state: 'supported' as const,
          runnerAdapterId: platform.runnerAdapterId,
          probes: platform.probes.map(({ probeId: _probeId, ...probe }) => ({
            ...probe,
            harnessPath: arbitraryPath,
            verifierAssetPaths: [arbitraryPath],
            args: ['{}'],
          })),
        };
      }),
    },
  });
}

function task(overrides: Record<string, unknown> = {}): Task {
  const criterion = createGoNoGoCriterionItem({
    polarity: 'go',
    statement: 'host evaluator decides from durable evidence',
    evidenceRequirements: ['accepted-result receipt'],
  });
  return {
    id: 'dispatch-001',
    title: 'Exact dispatch authority',
    description: 'Preserve the complete admitted task snapshot.',
    model: 'opaque-registry-model',
    effort: 'normal',
    priority: 'HIGH',
    reason: 'T11 canonical dispatch truth',
    scope: {
      directories: ['tests/orchestra'],
      filesRead: ['src/orchestra/result-evaluator.ts'],
      filesWrite: ['tests/orchestra/evaluation-audit-trail.test.ts'],
    },
    productionWiringApplicability: deriveProductionWiringApplicability({
      directories: ['tests/orchestra'],
      filesRead: ['src/orchestra/result-evaluator.ts'],
      filesWrite: ['tests/orchestra/evaluation-audit-trail.test.ts'],
    }),
    dependencies: ['dispatch-000'],
    goNogo: {
      goCriteria: 'durable accepted result is evaluated',
      noGoCriteria: 'worker score is trusted',
      techDebtAcceptable: 'none',
      items: [criterion],
    },
    status: 'EXECUTING' as Task['status'],
    assignedWorker: 'worker-dispatch-001',
    sprintId: 'sprint-dispatch',
    type: 'code-development',
    provider: 'codex',
    verification: {
      version: 1,
      source: 'directive',
      commands: ['npx tsc --noEmit'],
    },
    budget: { maxTurns: 4, maxTokens: 20_000 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'code-development',
      resolvedProvider: 'codex',
      executionCostClass: 'remote',
      profileRef: 'execution_budget.roles.worker.default',
      policyDigest: 'a'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
    runPolicy: createRunPolicyPlanAuthority({
      constraints: ['accepted result must be re-read from custody'],
      sourceRef: 'DIRECTIVES.md#T11',
    }),
    ...overrides,
  } as Task;
}

function snapshot(value: Task): Uint8Array {
  const dispatchDigest = exactDockerDispatchCanonicalDigest(value, policy);
  const approved = createExactNormalTaskApprovedMaterialV3({
    sprintId: value.sprintId ?? 'sprint-dispatch',
    task: value,
    dispatchTaskMaterialDigest: dispatchDigest,
    policy,
  });
  const lineage = { predecessor: null };
  return canonicalTaskAttemptCustodyJson({
    schemaVersion: 2,
    kind: 'exact-docker-dispatch-snapshot',
    dispatchRequestId: 'dispatch-request-001',
    projectId: 'project-001',
    taskId: value.id,
    material: {
      approved,
      approvedSha256: exactDockerDispatchCanonicalDigest(approved, policy),
      dispatch: value,
      dispatchSha256: dispatchDigest,
      lineage,
      lineageSha256: exactDockerDispatchCanonicalDigest(lineage, policy),
    },
    dispatch: { backend: 'docker', promptDigest: 'b'.repeat(64) },
  }, policy.jsonBounds);
}

describe('exact Docker dispatch Task authority', () => {
  it('accepts the complete canonical Task including arrays and preserves every field', () => {
    const source = task();
    const parsed = parseExactDockerDispatchTaskMaterial(source, policy);
    expect(parsed).not.toBeNull();
    expect(parsed?.dependencies).toEqual(['dispatch-000']);
    expect(parsed?.goNogo.items?.[0]?.id).toBe(source.goNogo.items?.[0]?.id);
    expect(parsed?.budgetPolicy?.landingPolicy).toEqual({ reserve_ratio: 0.25 });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.dependencies)).toBe(true);
  });

  it('preserves and freezes the immutable V2 proof program in the exact dispatch snapshot', () => {
    const source = task({ productionWiring: v2Wiring() });
    const parsed = parseExactDockerDispatchTaskMaterial(source, policy);
    expect(parsed?.productionWiring).toEqual(source.productionWiring);
    expect(parsed?.productionWiring?.version).toBe(2);
    expect(Object.isFrozen(parsed?.productionWiring?.contract.hostProofProgram)).toBe(true);
  });

  it('rejects an unregistered planner-designated harness before exact dispatch admission', () => {
    expect(parseExactDockerDispatchTaskMaterial(task({
      productionWiring: unregisteredV2Wiring(),
    }), policy)).toBeNull();
  });

  it('rejects historical V1 wiring and any forged V2 proof program digest', () => {
    const historical = createProductionWiringPlanEvidence({
      version: 1, changeKind: 'runtime-change',
      producer: { producerId: 'p', evidence: { state: 'complete', basis: 'authority-record', evidenceRefs: ['old'] } },
      canonicalConsumer: { consumerId: 'c', relationship: 'invokes-producer', evidence: { state: 'complete', basis: 'host-attested-execution', evidenceRefs: ['old'] } },
      affectedIngresses: [{ ingressId: 'i', kind: 'ingress', evidence: { state: 'complete', basis: 'host-attested-execution', evidenceRefs: ['old'] } }],
      enablementAuthority: { authorityId: 'a', mechanism: 'policy', evidence: { state: 'complete', basis: 'authority-record', evidenceRefs: ['old'] } },
      disposition: { kind: 'production-wiring' },
      proofTargets: [{ proofTargetId: 't', kind: 'consumer-execution', evidence: { state: 'complete', basis: 'host-attested-execution', evidenceRefs: ['old'] } }],
    });
    expect(parseExactDockerDispatchTaskMaterial(task({ productionWiring: historical }), policy)).toBeNull();

    const valid = v2Wiring();
    const forged = {
      ...valid,
      contract: {
        ...valid.contract,
        hostProofProgram: { ...valid.contract.hostProofProgram, programDigest: 'f'.repeat(64) },
      },
    };
    expect(parseExactDockerDispatchTaskMaterial(task({ productionWiring: forged }), policy)).toBeNull();
  });

  it('rejects exact production write scope when its host-derived classification has no V2 contract', () => {
    const productionScope = {
      directories: ['src/orchestra'], filesRead: [], filesWrite: ['src/orchestra/planner.ts'],
    };
    expect(parseExactDockerDispatchTaskMaterial(task({
      scope: productionScope,
      productionWiringApplicability: deriveProductionWiringApplicability(productionScope),
    }), policy)).toBeNull();
    expect(parseExactDockerDispatchTaskMaterial(task({
      productionWiringApplicability: { state: 'required', reasonCode: 'production-write-scope' },
    }), policy)).toBeNull();
  });

  it('repeats the verifier-asset write-scope guard at immutable snapshot admission', () => {
    const overlappingScope = {
      directories: ['scripts'], filesRead: [], filesWrite: ['scripts/production-wiring-host-proof-harness.mjs'],
    };
    expect(parseExactDockerDispatchTaskMaterial(task({
      scope: overlappingScope,
      productionWiringApplicability: deriveProductionWiringApplicability(overlappingScope),
      productionWiring: v2Wiring(),
    }), policy)).toBeNull();
  });

  it.each([
    'id', 'title', 'description', 'model', 'effort', 'priority', 'reason', 'scope',
    'dependencies', 'goNogo', 'status', 'assignedWorker',
  ])('rejects a task missing required field %s', field => {
    const candidate = { ...task() } as Record<string, unknown>;
    delete candidate[field];
    expect(parseExactDockerDispatchTaskMaterial(candidate, policy)).toBeNull();
  });

  it('rejects unknown, undefined, malformed nested, and forged digest fields', () => {
    expect(parseExactDockerDispatchTaskMaterial({ ...task(), surprise: true }, policy)).toBeNull();
    expect(parseExactDockerDispatchTaskMaterial({ ...task(), updatedAt: undefined }, policy)).toBeNull();
    expect(parseExactDockerDispatchTaskMaterial({
      ...task(),
      scope: { directories: [], filesRead: [], filesWrite: [], extra: [] },
    }, policy)).toBeNull();
    const source = task();
    expect(parseExactDockerDispatchTaskMaterial({
      ...source,
      goNogo: {
        ...source.goNogo,
        items: [{ ...source.goNogo.items![0], id: `criterion:${'f'.repeat(64)}` }],
      },
    }, policy)).toBeNull();
    expect(parseExactDockerDispatchTaskMaterial({
      ...source,
      runPolicy: { ...source.runPolicy!, policyDigest: 'f'.repeat(64) },
    }, policy)).toBeNull();
    expect(parseExactDockerDispatchTaskMaterial({
      ...source,
      budgetPolicy: { ...source.budgetPolicy!, landingPolicy: { reserve_ratio: 1 } },
    }, policy)).toBeNull();
  });

  it('rejects proxies/accessors before invoking caller code', () => {
    let invoked = 0;
    const proxy = new Proxy(task(), { get: (target, key, receiver) => {
      invoked += 1;
      return Reflect.get(target, key, receiver);
    } });
    expect(parseExactDockerDispatchTaskMaterial(proxy, policy)).toBeNull();
    expect(invoked).toBe(0);

    const accessor = { ...task() } as Record<string, unknown>;
    Object.defineProperty(accessor, 'title', {
      enumerable: true,
      get: () => {
        invoked += 1;
        return 'forged';
      },
    });
    expect(parseExactDockerDispatchTaskMaterial(accessor, policy)).toBeNull();
    expect(invoked).toBe(0);
  });

  it('overrides assignedWorker through the producer and isolates caller mutation', () => {
    const source = task();
    const parsed = createExactDockerDispatchTaskMaterialAuthority(source, 'worker-host', policy);
    source.dependencies.push('caller-mutation');
    expect(parsed.assignedWorker).toBe('worker-host');
    expect(parsed.dependencies).toEqual(['dispatch-000']);
  });

  it('omits undefined optional fields and derives scope applicability only at the producer boundary', () => {
    const source = task() as Task & Record<string, unknown>;
    delete source.productionWiringApplicability;
    source.updatedAt = undefined;
    source.actor = undefined;
    source.modelEffort = undefined;

    const parsed = createExactDockerDispatchTaskMaterialAuthority(source, 'worker-host', policy);

    expect(Object.hasOwn(parsed, 'updatedAt')).toBe(false);
    expect(Object.hasOwn(parsed, 'actor')).toBe(false);
    expect(Object.hasOwn(parsed, 'modelEffort')).toBe(false);
    expect(parsed.productionWiringApplicability).toEqual(
      deriveProductionWiringApplicability(parsed.scope),
    );
    expect(parseExactDockerDispatchTaskMaterial({ ...parsed, updatedAt: undefined }, policy))
      .toBeNull();
  });

  it('binds canonical snapshot bytes, task identity, material digests, and size', () => {
    const source = task();
    const bytes = snapshot(source);
    const parsed = parseExactDockerDispatchTaskSnapshotAuthority(bytes, policy);
    expect(parsed?.task.id).toBe(source.id);
    expect(parsed?.snapshotSha256).toBe(
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    );

    const decoded = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>;
    const material = decoded.material as Record<string, unknown>;
    const forged = canonicalTaskAttemptCustodyJson({
      ...decoded,
      material: { ...material, dispatchSha256: `sha256:${'f'.repeat(64)}` },
    }, policy.jsonBounds);
    expect(parseExactDockerDispatchTaskSnapshotAuthority(forged, policy)).toBeNull();
    expect(parseExactDockerDispatchTaskSnapshotAuthority(
      Buffer.from(JSON.stringify(decoded, null, 2), 'utf8'),
      policy,
    )).toBeNull();
    expect(parseExactDockerDispatchTaskSnapshotAuthority(
      Buffer.alloc(policy.artifactLimits['task-admission-snapshot'].maxBytes + 1, 0x20),
      policy,
    )).toBeNull();
  });
});
