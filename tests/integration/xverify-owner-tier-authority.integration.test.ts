import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '../../src/core/config.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { CrossVerifyConfig, ResolvedConfig, Task, TaskResult } from '../../src/core/types.js';
import {
  CROSS_VERIFY_ADJUDICATION_PROTOCOL,
  CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
  createCrossVerifyAdjudicationContractV2,
} from '../../src/core/cross-verify-adjudication.js';
import { CROSS_VERIFY_ADJUDICATION_RESPONSE_PREFIX } from '../../src/core/cross-verify-prompt.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  runCrossVerify,
  type MandatoryCrossVerifyAdjudicationAuthority,
  type MandatoryCrossVerifyInvocationComposition,
} from '../../src/orchestra/cross-verify-runner.js';
import type { CrossVerifyInvocationCoordinatorResult } from '../../src/orchestra/cross-verify-invocation-coordinator.js';

const AUTHOR_MODEL = 'gpt-5.6-sol';
const VERIFIER_MODEL = 'claude-opus-5';
const DECISION_REF = 'owner-live-2026-08-24-opus5-xverify-accepted';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

let checkout = '';

beforeEach(() => {
  checkout = mkdtempSync(join(tmpdir(), 'deckent-xverify-owner-authority-'));
  mkdirSync(join(checkout, TASKS_DIR), { recursive: true });
});

afterEach(() => rmSync(checkout, { recursive: true, force: true }));

function exactAuthority(
  overrides: Partial<CrossVerifyConfig['verifier_tier_authority']['decisions'][number]> = {},
): NonNullable<CrossVerifyConfig['verifier_tier_authority']> {
  return {
    schema_version: 1,
    decisions: [{
      author_model: AUTHOR_MODEL,
      verifier_model: VERIFIER_MODEL,
      decision: 'allow',
      decision_ref: DECISION_REF,
      ...overrides,
    }],
  };
}

function writeProjectConfig(
  authority: CrossVerifyConfig['verifier_tier_authority'] | undefined,
): void {
  mkdirSync(join(checkout, '.deckent'), { recursive: true });
  writeFileSync(join(checkout, '.deckent', 'config.json'), `${JSON.stringify({
    spawn_backend: 'docker',
    execution_budget: {
      roles: { auditor: { default: { maxCacheReadTokens: 100_000, maxTurns: 12 } } },
      landing: { reserve_ratio: 0.25 },
      unmetered_backend: { action: 'reroute-or-hold', ordered_backends: ['docker'] },
    },
    cross_verify: {
      enabled: true,
      high_stakes_only: false,
      enforce_refuted: true,
      verifier_priority: ['claude'],
      verifier_model: { claude: VERIFIER_MODEL },
      ...(authority ? { verifier_tier_authority: authority } : {}),
    },
  }, null, 2)}\n`, 'utf8');
}

function task(id: string): Task {
  return {
    id, title: 'Owner authority integration', description: 'Verify production authority fan-in',
    model: AUTHOR_MODEL, provider: 'codex', effort: 'high', priority: 'CRITICAL', reason: 'security',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] }, dependencies: [],
    goNogo: { goCriteria: 'verification is evidenced', noGoCriteria: 'missing evidence', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE, sprintId: 'sprint-643',
  } as Task;
}

function result(id: string): TaskResult {
  return {
    taskId: id, workerId: 'w-643-004', filesChanged: [], linesAdded: 0,
    linesRemoved: 0, testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: 'fixture',
  };
}

function writeParentResult(id: string): void {
  writeFileSync(
    join(checkout, TASKS_DIR, `task-${id}.result`),
    `${JSON.stringify(result(id), null, 2)}\n`,
    'utf8',
  );
}

async function loadedConfig(): Promise<ResolvedConfig> {
  return loadConfig(checkout);
}

function adjudicationFixture() {
  const contentDigest = `sha256:${'1'.repeat(64)}`;
  const contract = createCrossVerifyAdjudicationContractV2({
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    claimId: 'claim-sprint-643-owner-tier',
    summary: 'The exact owner pair is production-wired.',
    assertions: [{
      id: 'A1', kind: 'factual', polarity: 'go',
      statement: 'The exact owner pair is production-wired.',
      evidenceRequirements: [{
        id: 'R1', statement: 'The bounded source snapshot supports the claim.',
        anyOfEvidenceIds: ['E1'],
      }],
    }],
  }, {
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    entries: [{
      evidenceId: 'E1', kind: 'file-snapshot', locator: 'src/orchestra/cross-verify-runner.ts',
      contentSha256: contentDigest,
    }],
  });
  return {
    contract,
    response: {
      schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
      protocol: CROSS_VERIFY_ADJUDICATION_PROTOCOL,
      claimDigest: contract.claimDigest,
      evidenceManifestDigest: contract.evidenceManifestDigest,
      assertionResults: [{
        assertionId: 'A1', status: 'supported' as const,
        citations: [{
          evidenceId: 'E1', locator: 'src/orchestra/cross-verify-runner.ts',
          evidenceSha256: contentDigest,
        }],
        reason: 'The exact source snapshot supports the claim.',
      }],
    },
  };
}

function settled(id: string, calledModel = VERIFIER_MODEL): Extract<
  CrossVerifyInvocationCoordinatorResult,
  { state: 'settled' }
> {
  const verifierTaskId = `${id}-xverify`;
  const terminalSettlementRef = createTaskResultSettlementRefForAttempt(
    checkout,
    verifierTaskId,
    ATTEMPT_ID,
  );
  writeTaskResultSettlementAttemptAtomic(terminalSettlementRef);
  claimTaskResultSettlementAttemptAtomic(terminalSettlementRef);
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref: terminalSettlementRef,
    exitCode: 0,
    result: {
      ...result(verifierTaskId),
      workerId: 'w-643-004-xverify',
      notes: 'typed XVerify coordinator fixture',
    },
  }));
  writeTaskResultSettlementClosureAtomic(terminalSettlementRef, {
    containerDisposition: 'stopped-removed',
    locksReleased: true,
  });
  const typed = adjudicationFixture();
  return {
    state: 'settled',
    output: `${CROSS_VERIFY_ADJUDICATION_RESPONSE_PREFIX}${JSON.stringify(typed.response)}\n`
      + 'VERDICT: CONFIRMED typed response agrees',
    execution: {
      outcome: 'completed', initialAttemptId: ATTEMPT_ID, terminalAttemptId: ATTEMPT_ID,
      cumulativeUsage: {
        turns: 1, inputTokens: 12, outputTokens: 8, cacheReadTokens: 2,
        cacheCreationTokens: 0, totalTokens: 22, maxContextTokens: 22,
      },
    },
    invocationReceiptRef: {
      schemaVersion: 1, tenantId: 'tenant-a', projectId: 'project-a', invocationId: `invocation-${id}`,
    },
    providerLimitReservationId: `reservation-${id}`,
    providerLimitDispatchEvidenceRef: `provider-limit-dispatch:${id}`,
    providerLimitSettlementEvidenceRef: `provider-limit-settlement:${id}`,
    executionContractEvidenceRef: `xverify-contract:${id}`,
    outputArtifactRef: `task-result-output:${id}`,
    hostObservationEvidenceRef: `xverify-host-observation:${id}`,
    terminalSettlementRef,
    calledProvider: 'claude',
    calledModel,
  };
}

function composition(
  id: string,
  coordinatorResult: CrossVerifyInvocationCoordinatorResult,
  adjudication?: MandatoryCrossVerifyAdjudicationAuthority,
) {
  const execute = vi.fn(async () => coordinatorResult);
  const composed: MandatoryCrossVerifyInvocationComposition = {
    coordinator: { execute },
    input: {
      executionContract: { verifierTaskId: `${id}-xverify`, attemptId: ATTEMPT_ID, provider: 'claude' },
      projection: { invocationReceipt: { receipt: { invocationId: `invocation-${id}` } } },
    } as MandatoryCrossVerifyInvocationComposition['input'],
    launcher: vi.fn() as MandatoryCrossVerifyInvocationComposition['launcher'],
    ...(adjudication ? { adjudication } : {}),
  };
  return { composed, execute };
}

function validatedAdjudicationAuthority(
  mode: 'valid' | 'missing' | 'mismatch' = 'valid',
): MandatoryCrossVerifyAdjudicationAuthority {
  const typed = adjudicationFixture();
  const digest = 'a'.repeat(64);
  return {
    contract: typed.contract,
    persist: vi.fn(() => {
      if (mode === 'missing') {
        return { verdictReceiptRef: `cross-verify-verdict:sha256:${digest}` };
      }
      const validatedReceipt = { verdictReceiptSha256: digest, receipt: {} } as never;
      return {
        verdictReceiptRef: `cross-verify-verdict:sha256:${mode === 'mismatch' ? 'b'.repeat(64) : digest}`,
        validatedReceipt,
      };
    }),
  };
}

describe('XVerify owner-tier authority production fan-in', () => {
  it('fresh-loads Sol→Opus authority and closes mandatory usage, settlement and verdict receipt', async () => {
    writeProjectConfig(exactAuthority());
    expect((await loadedConfig()).cross_verify?.verifier_tier_authority).toEqual(exactAuthority());
    writeProjectConfig(exactAuthority({ decision_ref: `${DECISION_REF}-reloaded` }));
    const config = await loadedConfig();
    const id = 'owner-pair-admitted';
    writeParentResult(id);
    const exact = composition(id, settled(id), validatedAdjudicationAuthority());

    const run = await runCrossVerify(
      checkout, task(id), result(id), TaskEvaluation.DONE, config,
      { verifierModel: VERIFIER_MODEL, mandatoryInvocation: exact.composed },
    );

    expect(exact.execute).toHaveBeenCalledOnce();
    expect(run).toMatchObject({
      outcome: 'confirmed', disposition: 'allow', ran: true, blocked: false,
      advisory: {
        verifier: 'claude', verifierModel: VERIFIER_MODEL,
        authorityEvidenceRef: `${DECISION_REF}-reloaded`,
        adjudicationReceiptRef: `cross-verify-verdict:sha256:${'a'.repeat(64)}`,
        execution: { cumulativeUsage: { totalTokens: 22 } },
      },
      taskSettlementReceipt: { authorityEvidenceRef: `${DECISION_REF}-reloaded` },
    });
    expect(run.validatedAdjudicationReceipt?.verdictReceiptSha256).toBe('a'.repeat(64));
    const stored = JSON.parse(readFileSync(
      join(checkout, TASKS_DIR, `task-${id}-xverify.result`),
      'utf8',
    )) as { xverifyTaskSettlement?: { authorityEvidenceRef?: string; settlementDigest?: string } };
    expect(stored.xverifyTaskSettlement).toMatchObject({
      authorityEvidenceRef: `${DECISION_REF}-reloaded`,
      settlementDigest: run.taskSettlementReceipt?.settlementDigest,
    });
  });

  it.each([
    ['absent authority', undefined],
    ['wrong author', exactAuthority({ author_model: 'gpt-5.6-terra' })],
    ['wrong verifier', exactAuthority({ verifier_model: 'claude-sonnet-5' })],
  ] as const)('refuses %s before mandatory provider execution', async (_name, authority) => {
    writeProjectConfig(authority);
    const id = `refusal-${_name.replaceAll(' ', '-')}`;
    writeParentResult(id);
    const exact = composition(id, {
      state: 'hold', reasonCode: 'must-not-execute', authorityEvidenceRef: 'xverify-authority:test',
      invocationReceiptRef: null,
    });
    const run = await runCrossVerify(
      checkout, task(id), result(id), TaskEvaluation.DONE, await loadedConfig(),
      { verifierModel: VERIFIER_MODEL, mandatoryInvocation: exact.composed },
    );

    expect(run).toMatchObject({ outcome: 'unavailable', ran: false, blocked: true });
    expect(run.skippedReason).toContain('xverify_verifier_tier_below_author');
    expect(exact.execute).not.toHaveBeenCalled();
  });

  it('revokes the grant on called-model drift after mandatory execution', async () => {
    writeProjectConfig(exactAuthority());
    const id = 'called-model-drift';
    writeParentResult(id);
    const exact = composition(id, settled(id, 'claude-sonnet-5'));
    const run = await runCrossVerify(
      checkout, task(id), result(id), TaskEvaluation.DONE, await loadedConfig(),
      { verifierModel: VERIFIER_MODEL, mandatoryInvocation: exact.composed },
    );

    expect(exact.execute).toHaveBeenCalledOnce();
    expect(run).toMatchObject({ outcome: 'unavailable', ran: false, blocked: true });
    expect(run.skippedReason).toContain('xverify_verifier_tier_below_author');
  });

  it.each([
    ['missing usage', {
      state: 'hold' as const,
      reasonCode: 'XVERIFY_INVOCATION_USAGE_HOLD:usage_unavailable',
      authorityEvidenceRef: 'xverify-authority:usage-hold',
      invocationReceiptRef: null,
    }],
    ['incomplete settlement', {
      state: 'reconciliation-required' as const,
      reasonCode: 'XVERIFY_INVOCATION_OBSERVATION_HOLD:settlement_incomplete',
      authorityEvidenceRef: 'xverify-authority:settlement-hold',
      invocationReceiptRef: {
        schemaVersion: 1 as const, tenantId: 'tenant-a', projectId: 'project-a',
        invocationId: 'invocation-incomplete',
      },
      providerLimitDispatchEvidenceRef: 'provider-limit-dispatch:incomplete',
    }],
  ])('keeps %s fail-closed without fallback', async (_name, coordinatorResult) => {
    writeProjectConfig(exactAuthority());
    const id = `hold-${_name.replaceAll(' ', '-')}`;
    writeParentResult(id);
    const exact = composition(id, coordinatorResult);
    const run = await runCrossVerify(
      checkout, task(id), result(id), TaskEvaluation.DONE, await loadedConfig(),
      { verifierModel: VERIFIER_MODEL, mandatoryInvocation: exact.composed },
    );

    expect(run).toMatchObject({ outcome: 'unavailable', disposition: 'hold', ran: false, blocked: true });
    expect(exact.execute).toHaveBeenCalledOnce();
  });

  it.each(['missing', 'mismatch'] as const)(
    'rejects %s durable verdict receipt authority',
    async mode => {
      writeProjectConfig(exactAuthority());
      const id = `receipt-${mode}`;
      writeParentResult(id);
      const exact = composition(id, settled(id), validatedAdjudicationAuthority(mode));
      const run = await runCrossVerify(
        checkout, task(id), result(id), TaskEvaluation.DONE, await loadedConfig(),
        { verifierModel: VERIFIER_MODEL, mandatoryInvocation: exact.composed },
      );

      expect(run).toMatchObject({ outcome: 'unavailable', disposition: 'hold', ran: false, blocked: true });
      expect(run.skippedReason).toContain('verifier-adjudication-receipt-persistence-failed');
    },
  );

  it('rejects corrupt, unknown-field and same-provider authority during fresh config loading', async () => {
    for (const invalid of [
      exactAuthority({ decision_ref: '' }),
      { ...exactAuthority(), default_decision: 'allow' },
      exactAuthority({ verifier_model: 'gpt-5.6-terra' }),
    ]) {
      writeProjectConfig(invalid as CrossVerifyConfig['verifier_tier_authority']);
      await expect(loadedConfig()).rejects.toThrow();
    }
  });
});
