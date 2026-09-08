import { fileURLToPath } from 'node:url';
import { createProductionWiringPlanEvidenceV2 } from '../../src/core/task-types.js';
import {
  completeProductionWiringFromProposal,
  type ProductionWiringContractV2Input,
} from '../../src/core/production-wiring-contract.js';
import { TERMINAL_NATIVE_PROVIDER_PROOF_IDENTITY } from '../../src/core/production-wiring-host-proof.js';

/** Canonical test-only V2 plan authority. It is not runtime proof or a receipt. */
export function productionWiringContractFixture(
  overrides: Partial<ProductionWiringContractV2Input> = {},
): ProductionWiringContractV2Input {
  const verifierAssets = [
    { path: 'scripts/production-wiring-host-proof-harness.mjs', role: 'trusted-harness' as const, sha256: `sha256:${'a'.repeat(64)}` as const },
    { path: 'scripts/lint-closure-dispositions.mjs', role: 'config-authority' as const, sha256: `sha256:${'b'.repeat(64)}` as const },
    { path: 'scripts/closure-ledger/canonical.mjs', role: 'config-authority' as const, sha256: `sha256:${'c'.repeat(64)}` as const },
    { path: 'scripts/master-plan-integrity.mjs', role: 'config-authority' as const, sha256: `sha256:${'d'.repeat(64)}` as const },
    { path: 'scripts/approval-identity.mjs', role: 'config-authority' as const, sha256: `sha256:${'e'.repeat(64)}` as const },
    { path: 'src/core/closure-classification-schema.json', role: 'config-authority' as const, sha256: `sha256:${'f'.repeat(64)}` as const },
  ];
  const timeoutMs = 30_000;
  const outputLimitBytes = 1_048_576;
  const args = [JSON.stringify({ adapterId: 'deckent-closure-os-authority-gate-v1', assets: verifierAssets, kind: 'deckent-production-wiring-host-proof-request-v1', outputLimitBytes, timeoutMs, version: 1 })];
  const probe = (kind: 'producer' | 'canonical-consumer' | 'affected-ingress' | 'enablement-authority' | 'proof-target', targetId: string) => ({
    target: { kind, targetId }, observationGroupId: 'deckent:closure-os-authority-gate',
    harnessPath: 'scripts/production-wiring-host-proof-harness.mjs', verifierAssetPaths: verifierAssets.map(asset => asset.path),
    args, cwd: '.', timeoutMs, outputLimitBytes,
    expectation: { kind: 'adapter-structured-outcome' as const, schemaId: 'deckent.host-proof.closure-os-authority-gate.v1', outcome: 'observed' as const },
  });
  return {
    version: 2, changeKind: 'runtime-change', producer: { producerId: 'closure-os.append-only-ledger' },
    canonicalConsumer: { consumerId: 'closure-os.authority-gate', relationship: 'invokes-producer' },
    affectedIngresses: [{ ingressId: 'closure-os.ledger-file-ingress', kind: 'ingress' }],
    enablementAuthority: { authorityId: 'closure-os.reviewed-trust-anchor', mechanism: 'policy' },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{ proofTargetId: 'closure-os.chain-identity-lifecycle-authority', kind: 'consumer-execution' }],
    hostProofProgram: { network: 'forbidden', verifierAssets, platforms: [
      { platform: 'linux', state: 'unsupported', reasonCode: 'environment-unavailable' },
      { platform: 'wsl2-linux', state: 'supported', runnerAdapterId: 'docker-readonly-host-proof-v1', probes: [
        probe('producer', 'closure-os.append-only-ledger'), probe('canonical-consumer', 'closure-os.authority-gate'),
        probe('affected-ingress', 'closure-os.ledger-file-ingress'), probe('enablement-authority', 'closure-os.reviewed-trust-anchor'),
        probe('proof-target', 'closure-os.chain-identity-lifecycle-authority'),
      ] },
      { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' },
    ] },
    ...overrides,
  };
}

export function productionWiringPlanFixture() {
  return createProductionWiringPlanEvidenceV2(productionWiringContractFixture());
}

/** Registry-completed fixture whose trusted assets stay outside broad src/ task scopes. */
export function terminalNativeProviderWiringContractFixture(): ProductionWiringContractV2Input {
  const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
  const contract = completeProductionWiringFromProposal({
    version: 1,
    changeKind: 'runtime-change',
    ...TERMINAL_NATIVE_PROVIDER_PROOF_IDENTITY,
    disposition: { kind: 'production-wiring' },
  }, { projectRoot });
  return {
    ...contract,
    hostProofProgram: {
      network: contract.hostProofProgram.network,
      verifierAssets: contract.hostProofProgram.verifierAssets,
      platforms: contract.hostProofProgram.platforms.map(platform => {
        if (platform.state === 'unsupported') return platform;
        return {
          ...platform,
          probes: platform.probes.map(({ probeId: _probeId, ...probe }) => probe),
        };
      }),
    },
  };
}

export function terminalNativeProviderWiringPlanFixture() {
  return createProductionWiringPlanEvidenceV2(
    terminalNativeProviderWiringContractFixture(),
  );
}
