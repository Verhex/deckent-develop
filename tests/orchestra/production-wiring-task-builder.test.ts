import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ProductionWiringTaskHoldError,
  buildWorkerPrompt,
  createTask,
  parseStructuredDirectives,
  plannerTaskToParams,
  type CreateTaskParams,
  type WorkerPromptCompilationSinkV2,
} from '../../src/orchestra/task-builder.js';
import {
  createProductionWiringPlanEvidence,
  createProductionWiringPlanEvidenceV2,
  TaskStatus,
  type PlannerTask,
  type ProductionWiringPlanEvidence,
} from '../../src/core/types.js';
import type {
  ProductionWiringContractV2Input,
} from '../../src/core/production-wiring-contract.js';

function wiringContract(
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
  const args = [JSON.stringify({
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
  return {
    version: 2,
    changeKind: 'runtime-change',
    producer: { producerId: 'closure-os.append-only-ledger' },
    canonicalConsumer: {
      consumerId: 'closure-os.authority-gate',
      relationship: 'invokes-producer',
    },
    affectedIngresses: [{
      ingressId: 'closure-os.ledger-file-ingress',
      kind: 'ingress' as const,
    }],
    enablementAuthority: {
      authorityId: 'closure-os.reviewed-trust-anchor',
      mechanism: 'policy',
    },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{
      proofTargetId: 'closure-os.chain-identity-lifecycle-authority',
      kind: 'consumer-execution',
    }],
    hostProofProgram: { network: 'forbidden', verifierAssets, platforms: [
      { platform: 'linux', state: 'unsupported', reasonCode: 'environment-unavailable' },
      { platform: 'wsl2-linux', state: 'supported', runnerAdapterId: 'docker-readonly-host-proof-v1', probes: [
        probe('producer', 'closure-os.append-only-ledger'),
        probe('canonical-consumer', 'closure-os.authority-gate'),
        probe('affected-ingress', 'closure-os.ledger-file-ingress'),
        probe('enablement-authority', 'closure-os.reviewed-trust-anchor'),
        probe('proof-target', 'closure-os.chain-identity-lifecycle-authority'),
      ] },
      { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' },
    ] },
    ...overrides,
  };
}

function params(productionWiring?: ProductionWiringPlanEvidence): CreateTaskParams {
  return {
    title: 'Wire production mutation',
    description: 'Explicit contract test',
    model: 'gpt-5.6-sol',
    effort: 'high',
    priority: 'HIGH',
    reason: 'production wiring',
    scope: productionWiring ? {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/task-builder.ts'],
    } : {
      directories: ['tests/orchestra/'],
      filesRead: [],
      filesWrite: ['tests/orchestra/task-builder.test.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'wired', noGoCriteria: 'not wired', techDebtAcceptable: '' },
    sprintId: 'sprint-487',
    productionWiring,
  };
}

describe('production wiring task-builder authority', () => {
  it('binds a complete explicit contract at the common task creation boundary', () => {
    const authority = createProductionWiringPlanEvidenceV2(wiringContract());

    const task = createTask(params(authority), 25);

    expect(task.productionWiring).toEqual(authority);
    expect(task.productionWiring?.contract.canonicalConsumer.consumerId)
      .toBe('closure-os.authority-gate');
    expect(task.productionWiring?.contract.affectedIngresses.map(entry => entry.ingressId)).toEqual([
      'closure-os.ledger-file-ingress',
    ]);
  });

  it('returns typed HOLD evidence when the declared consumer scope is impossible', () => {
    const base = wiringContract();
    const authority = createProductionWiringPlanEvidenceV2(wiringContract({
      affectedIngresses: [base.affectedIngresses[0]!, base.affectedIngresses[0]!],
      hostProofProgram: {
        network: base.hostProofProgram.network,
        verifierAssets: base.hostProofProgram.verifierAssets,
        platforms: base.hostProofProgram.platforms.map(platform => platform.state !== 'supported'
          ? platform
          : { ...platform, probes: platform.probes.filter(probe => probe.target.kind !== 'affected-ingress' || probe.target.targetId === base.affectedIngresses[0]!.ingressId) }),
      },
    }));

    expect(() => createTask(params(authority), 25)).toThrowError(ProductionWiringTaskHoldError);
    try {
      createTask(params(authority), 25);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ProductionWiringTaskHoldError);
      if (!(error instanceof ProductionWiringTaskHoldError)) throw error;
      expect(error.decision).toMatchObject({
        decision: 'incomplete',
        disposition: 'hold',
        outerSettlement: 'blocked',
      });
    }
  });

  it('rejects a mutated contract whose digest still claims the reviewed plan', () => {
    const authority = createProductionWiringPlanEvidenceV2(wiringContract());
    const tampered = {
      ...authority,
      contract: wiringContract({
        canonicalConsumer: {
          consumerId: 'filename-inferred-consumer',
          relationship: 'invokes-producer',
        },
      }),
    };

    expect(() => createTask(params(tampered), 25)).toThrowError(
      expect.objectContaining({ code: 'E_PRODUCTION_WIRING_DIGEST_MISMATCH' }),
    );
  });

  it('accepts foundation work only with exact same-DAG closure IDs and barrier', () => {
    const closureTaskIds = ['487-025', '487-026', '487-027', '487-028', '487-029'];
    const authority = createProductionWiringPlanEvidenceV2(wiringContract({
      changeKind: 'foundation',
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
    }));

    const task = createTask(params(authority), 24);

    expect(task.productionWiring?.contract.disposition).toMatchObject({
      kind: 'staged-foundation',
      closureTasks: closureTaskIds.map(taskId => ({ taskId, dagId: 'sprint-487' })),
    });
  });

  it('threads AI planner authority without deriving a consumer from task filenames', () => {
    const productionWiring = createProductionWiringPlanEvidenceV2(wiringContract());
    const plannerTask: PlannerTask = {
      ...params(),
      productionWiring,
    };

    const converted = plannerTaskToParams(plannerTask, 'sprint-487', 'gpt-5.6-sol', TaskStatus.DRAFT);

    expect(converted.productionWiring).toBe(productionWiring);
    expect(converted.productionWiring?.contract.canonicalConsumer.consumerId)
      .toBe('closure-os.authority-gate');
  });

  it('rejects an unregistered planner-selected harness at task creation', () => {
    const unregistered = wiringContract();
    const arbitraryPath = 'scripts/planner-selected-proof.mjs';
    const productionWiring = createProductionWiringPlanEvidenceV2({
      ...unregistered,
      hostProofProgram: {
        ...unregistered.hostProofProgram,
        verifierAssets: [{
          path: arbitraryPath,
          sha256: `sha256:${'1'.repeat(64)}`,
          role: 'trusted-harness',
        }],
        platforms: unregistered.hostProofProgram.platforms.map(platform => (
          platform.state !== 'supported' ? platform : {
            ...platform,
            probes: platform.probes.map(probe => ({
              ...probe,
              harnessPath: arbitraryPath,
              verifierAssetPaths: [arbitraryPath],
              args: ['{}'],
            })),
          }
        )),
      },
    });

    expect(() => createTask(params(productionWiring), 35)).toThrowError(expect.objectContaining({
      code: 'E_PRODUCTION_WIRING_HOST_PROOF_ADAPTER_UNREGISTERED',
    }));
  });

  it('canonicalizes an exact structured DIRECTIVES ProductionWiring JSON declaration', () => {
    const authored = wiringContract();
    const parsed = parseStructuredDirectives([
      '# Plan',
      '## Task 1: Wire exact production path',
      '- Files: src/orchestra/task-builder.ts',
      `- ProductionWiring: ${JSON.stringify(authored)}`,
      '### Description',
      'The declaration is structured data, not evidence prose.',
    ].join('\n'));

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.productionWiring).toMatchObject({ version: 2 });
    expect(parsed[0]?.productionWiring?.contractDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(parsed[0]?.productionWiring?.hostProofProgramDigest).toBe(
      parsed[0]?.productionWiring?.contract.hostProofProgram.programDigest,
    );
  });

  it('fails closed instead of dropping a malformed structured wiring declaration', () => {
    expect(() => parseStructuredDirectives([
      '# Plan',
      '## Task 1: Wire exact production path',
      '- Files: src/orchestra/task-builder.ts',
      '- ProductionWiring: {"version":2}',
    ].join('\n'))).toThrowError(expect.objectContaining({
      code: 'E_PRODUCTION_WIRING_DIRECTIVE_INVALID',
    }));
  });

  it('keeps V1 readable but rejects it at the new task admission boundary', () => {
    const historical = createProductionWiringPlanEvidence({
      version: 1,
      changeKind: 'runtime-change',
      producer: { producerId: 'historical', evidence: { state: 'complete', basis: 'authority-record', evidenceRefs: ['old'] } },
      canonicalConsumer: { consumerId: 'historical', relationship: 'invokes-producer', evidence: { state: 'complete', basis: 'host-attested-execution', evidenceRefs: ['old'] } },
      affectedIngresses: [{ ingressId: 'historical', kind: 'ingress', evidence: { state: 'complete', basis: 'host-attested-execution', evidenceRefs: ['old'] } }],
      enablementAuthority: { authorityId: 'historical', mechanism: 'policy', evidence: { state: 'complete', basis: 'authority-record', evidenceRefs: ['old'] } },
      disposition: { kind: 'production-wiring' },
      proofTargets: [{ proofTargetId: 'historical', kind: 'consumer-execution', evidence: { state: 'complete', basis: 'host-attested-execution', evidenceRefs: ['old'] } }],
    });
    expect(() => createTask(params(historical), 32)).toThrowError(expect.objectContaining({
      code: 'E_PRODUCTION_WIRING_V1_HISTORICAL_ONLY',
    }));
  });

  it('preserves legacy non-production tasks without silently manufacturing wiring authority', () => {
    const input = params();
    input.scope = {
      directories: ['tests/orchestra/'],
      filesRead: [],
      filesWrite: ['tests/orchestra/task-builder.test.ts'],
    };
    const task = createTask(input, 30);

    expect(task).not.toHaveProperty('productionWiring', expect.anything());
    expect(task.productionWiringApplicability).toEqual({
      state: 'not-applicable', reasonCode: 'test-only-scope',
    });
  });

  it('rejects an omitted production-scope contract instead of silently exempting it', () => {
    const input = params();
    input.scope = {
      directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/task-builder.ts'],
    };
    expect(() => createTask(input, 33)).toThrowError(expect.objectContaining({
      code: 'E_PRODUCTION_WIRING_REQUIRED',
    }));
  });

  it('rejects a verifier asset that is inside the worker write authority', () => {
    const input = wiringContract();
    const assetPath = 'src/orchestra/task-builder.ts';
    const productionWiring = createProductionWiringPlanEvidenceV2({
      ...input,
      hostProofProgram: {
        ...input.hostProofProgram,
        verifierAssets: [{ path: assetPath, sha256: `sha256:${'a'.repeat(64)}`, role: 'trusted-harness' }],
        platforms: input.hostProofProgram.platforms.map(platform => platform.state !== 'supported'
          ? platform
          : {
              ...platform,
              probes: platform.probes.map(probe => ({
                ...probe,
                harnessPath: assetPath,
                verifierAssetPaths: [assetPath],
              })),
            }),
      },
    });
    expect(() => createTask(params(productionWiring), 34)).toThrowError(expect.objectContaining({
      code: 'E_PRODUCTION_WIRING_VERIFIER_ASSET_WRITE_SCOPE',
    }));
  });

  it('compiles the exact prompt entirely in memory before public admission', () => {
    const root = mkdtempSync(join(tmpdir(), 'task-builder-exact-'));
    try {
      mkdirSync(join(root, '.tasks'), { recursive: true });
      const sourceTask = createTask(params(), 31);
      const compileTask = structuredClone(sourceTask);
      const sink: WorkerPromptCompilationSinkV2 = {};

      const prompt = buildWorkerPrompt(
        compileTask,
        undefined,
        [],
        root,
        undefined,
        undefined,
        undefined,
        'docker',
        {
          publicationMode: 'deferred',
          dependencyIds: [],
          dependencyResults: new Map(),
          sink,
        },
      );

      expect(sink.artifact).toMatchObject({ prompt });
      expect(sink.artifact?.segments.length).toBeGreaterThan(0);
      expect(sink.receipt).toMatchObject({
        taskId: sourceTask.id,
        promptCompilePlanId: sink.artifact?.planId,
      });
      expect(sourceTask).not.toHaveProperty('promptCompilePlanId');
      expect(compileTask.promptCompilePlanId).toBe(sink.artifact?.planId);
      expect(existsSync(join(root, '.tasks', `task-${sourceTask.id}.skill-delivery.json`)))
        .toBe(false);
      expect(existsSync(join(root, '.deckent', 'runtime', 'prompt-lint.jsonl')))
        .toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
