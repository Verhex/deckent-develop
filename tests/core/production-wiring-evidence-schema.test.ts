import { describe, expect, it } from 'vitest';

import {
  createProductionWiringPlanEvidence,
  createProductionWiringPlanEvidenceV2,
  PRODUCTION_WIRING_EVIDENCE_VERSION,
  PRODUCTION_WIRING_PLAN_EVIDENCE_V2_VERSION,
  type ProductionWiringResultEvidence,
} from '../../src/core/task-types.js';
import {
  productionWiringResultEvidenceSchema,
  validateTaskResult,
} from '../../src/core/task-result-schema.js';
import type { ProductionWiringContractV1 } from '../../src/core/production-wiring-contract.js';
import type { ProductionWiringContractV2Input } from '../../src/core/production-wiring-contract.js';

const digest = 'a'.repeat(64);

function validResult(): Record<string, unknown> {
  return {
    taskId: '487-024',
    workerId: 'w-487-024',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    filesChanged: [],
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, source: 'provider-adapter' },
    cost: { usd: 0, pricingSource: 'host-finalizer' },
    tests: { passed: 1, failed: 0, total: 1 },
    tsc: { clean: true, errors: 0 },
    selfAssessment: 'DONE',
  };
}

function stagedContract(): ProductionWiringContractV1 {
  const closureTaskIds = ['487-025', '487-026', '487-027', '487-028', '487-029'];
  const evidence = {
    state: 'incomplete' as const,
    reasonCode: 'not-executed' as const,
    evidenceRefs: [] as readonly string[],
  };
  return {
    version: 1,
    changeKind: 'foundation',
    producer: { producerId: 'ProductionWiringContract/evidence', evidence },
    canonicalConsumer: { consumerId: 'closure-tasks-025/026/027/028/029', relationship: 'invokes-producer', evidence },
    affectedIngresses: [{ ingressId: 'all-mutation-tasks', kind: 'ingress', evidence }],
    enablementAuthority: { authorityId: 'task-schema', mechanism: 'registration', evidence },
    disposition: {
      kind: 'staged-foundation',
      foundationTaskId: '487-024',
      dagId: 'sprint-487',
      closureTasks: closureTaskIds.map(taskId => ({ taskId, dagId: 'sprint-487' })),
      outerSettlementBarrier: {
        kind: 'block-until-exact-closure-settles',
        dagId: 'sprint-487',
        closureTaskIds,
      },
    },
    proofTargets: [{ proofTargetId: 'production-wiring-evidence-schema', kind: 'consumer-execution', evidence }],
  };
}

function v2ContractInput(): ProductionWiringContractV2Input {
  const probe = (kind: 'producer' | 'canonical-consumer' | 'affected-ingress' | 'enablement-authority' | 'proof-target', targetId: string) => ({
    target: { kind, targetId }, observationGroupId: kind === 'producer' || kind === 'canonical-consumer' ? 'runtime-path-observation' : `${kind}:${targetId}`, harnessPath: 'scripts/production-wiring-proof.mjs', verifierAssetPaths: ['scripts/production-wiring-proof.mjs'],
    args: kind === 'producer' || kind === 'canonical-consumer' ? ['observe-runtime-relation'] : ['observe', targetId], cwd: '.', timeoutMs: 30_000, outputLimitBytes: 1_048_576,
    expectation: { kind: 'adapter-structured-outcome' as const, schemaId: 'deckent.production-wiring-observation.v1', outcome: 'observed' as const },
  });
  return {
    version: 2, changeKind: 'runtime-change', producer: { producerId: 'producer' },
    canonicalConsumer: { consumerId: 'consumer', relationship: 'invokes-producer' },
    affectedIngresses: [{ ingressId: 'cli', kind: 'entrypoint' }],
    enablementAuthority: { authorityId: 'effective-config', mechanism: 'configuration' },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{ proofTargetId: 'cli-proof', kind: 'ingress-execution' }],
    hostProofProgram: { network: 'forbidden', verifierAssets: [{ path: 'scripts/production-wiring-proof.mjs', sha256: `sha256:${'a'.repeat(64)}`, role: 'trusted-harness' }], platforms: [
      { platform: 'linux', state: 'unsupported', reasonCode: 'environment-unavailable' },
      { platform: 'wsl2-linux', state: 'supported', runnerAdapterId: 'native-v1', probes: [
        probe('producer', 'producer'),
        probe('canonical-consumer', 'consumer'), probe('affected-ingress', 'cli'),
        probe('enablement-authority', 'effective-config'), probe('proof-target', 'cli-proof'),
      ] },
      { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' },
    ] },
  };
}

describe('production wiring task/result evidence schema', () => {
  it('host-derives both V2 contract and proof program digests deterministically', () => {
    const first = createProductionWiringPlanEvidenceV2(v2ContractInput());
    const second = createProductionWiringPlanEvidenceV2(structuredClone(v2ContractInput()));

    expect(first.version).toBe(PRODUCTION_WIRING_PLAN_EVIDENCE_V2_VERSION);
    expect(first.contractDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.hostProofProgramDigest).toBe(first.contract.hostProofProgram.programDigest);
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('evidenceRefs');
  });

  it('retains V1 as a distinct historical evidence shape', () => {
    const historical = createProductionWiringPlanEvidence(stagedContract());
    expect(historical.version).toBe(PRODUCTION_WIRING_EVIDENCE_VERSION);
    expect(historical).not.toHaveProperty('hostProofProgramDigest');
  });

  it('creates deterministic versioned plan evidence with exact closure tasks and outer barrier', () => {
    const contract = stagedContract();
    const first = createProductionWiringPlanEvidence(contract);
    const reordered = createProductionWiringPlanEvidence({
      disposition: contract.disposition,
      proofTargets: contract.proofTargets,
      enablementAuthority: contract.enablementAuthority,
      affectedIngresses: contract.affectedIngresses,
      canonicalConsumer: contract.canonicalConsumer,
      producer: contract.producer,
      changeKind: contract.changeKind,
      version: contract.version,
    });

    expect(first.version).toBe(PRODUCTION_WIRING_EVIDENCE_VERSION);
    expect(first.contractDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered.contractDigest).toBe(first.contractDigest);
    expect(first.contract.disposition).toEqual(expect.objectContaining({
      closureTasks: ['487-025', '487-026', '487-027', '487-028', '487-029']
        .map(taskId => ({ taskId, dagId: 'sprint-487' })),
      outerSettlementBarrier: expect.objectContaining({
        kind: 'block-until-exact-closure-settles',
        closureTaskIds: ['487-025', '487-026', '487-027', '487-028', '487-029'],
      }),
    }));
  });

  it('accepts digest-bound presence-only worker evidence without promoting it to completion', () => {
    const evidence: ProductionWiringResultEvidence = {
      version: 1,
      contractDigest: digest,
      observedBy: 'worker',
      evidence: { state: 'presence-only', basis: 'static-reachability', evidenceRefs: ['graph:edge:1'] },
    };
    const parsed = validateTaskResult({ ...validResult(), productionWiringEvidence: evidence });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    expect(parsed.value.productionWiringEvidence.evidence.state).toBe('presence-only');
  });

  it.each([
    { name: 'missing structural evidence', value: { version: 1, contractDigest: digest, observedBy: 'worker' } },
    { name: 'malformed digest', value: { version: 1, contractDigest: 'digest', observedBy: 'worker', evidence: { state: 'incomplete', reasonCode: 'absent', evidenceRefs: [] } } },
    { name: 'worker completion claim', value: { version: 1, contractDigest: digest, observedBy: 'worker', evidence: { state: 'complete', basis: 'host-attested-execution', evidenceRefs: ['worker:self-attestation'] } } },
    { name: 'presence without a reference', value: { version: 1, contractDigest: digest, observedBy: 'worker', evidence: { state: 'presence-only', basis: 'test-presence', evidenceRefs: [] } } },
  ])('rejects $name', ({ value }) => {
    expect(productionWiringResultEvidenceSchema.safeParse(value).success).toBe(false);
    expect(validateTaskResult({ ...validResult(), productionWiringEvidence: value }).ok).toBe(false);
  });
});
