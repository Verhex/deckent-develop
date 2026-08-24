import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareCrossVerifyCandidateEvidence } from '../../src/orchestra/cross-verify-evidence-preparation.js';
import { bootstrapCrossVerifyRuntimeV2 } from '../../src/orchestra/cross-verify-runtime-bootstrap.js';
import {
  persistCrossVerifyAdjudicationReport,
  runCrossVerify,
  settleCrossVerifyTwinProjection,
} from '../../src/orchestra/cross-verify-runner.js';
import { AttendedExecutionApprovalError } from '../../src/core/attended-execution-approval.js';
import { TaskEvaluation } from '../../src/core/types.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS,
  CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES,
  CROSS_VERIFY_UTF8_WORST_CASE_BYTES_PER_JAVASCRIPT_CHAR,
} from '../../src/core/cross-verify-response-limits.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'xverify-channel-truth-'));
  roots.push(value);
  return value;
}

function preparationInput(projectRoot: string, runId: string, approval: object) {
  return {
    projectRoot,
    config: {
      auth_mode: 'subscription',
      execution_budget: {
        roles: { worker: { default: { maxTokens: 8_000_000 } } },
        purposes: {
          'reachability-probe': {
            maxInputTokens: 32_768,
            maxOutputTokens: 512,
            maxTokens: 33_280,
            timeoutMs: 60_000,
          },
        },
      },
    },
    providerAuthority: {
      state: 'ready',
      service: {
        tenantId: 'tenant-a',
        projectId: 'project-a',
        truthStore: {
          getLatestReachability: vi.fn(() => null),
          // 7081 carousel layer-2: preparation now asks account-agnostically
          // for fresh reachability before the approval step.
          getLatestReachabilityAnyAccount: vi.fn(() => null),
        },
        evidenceProducer: { refresh: vi.fn() },
      },
    },
    approvalRuntime: { attendedExecutionApprovalAuthority: approval },
    candidate: { provider: 'codex', model: 'gpt-5.6-sol' },
    dockerBackend: {
      inspectExactCrossVerifyRuntime: vi.fn(async () => ({
        state: 'ready',
        runtimeFingerprint: 'f'.repeat(64),
        executionProfileRef: `docker-execution-profile:${'a'.repeat(64)}`,
      })),
    },
    requester: { role: 'brain', instanceId: 'brain-test' },
    userId: 'operator',
    approvalSummary: 'probe',
    runId,
    decisionWindowMs: 0,
    now: () => new Date('2026-08-18T00:00:00.000Z'),
  } as never;
}

describe('cross-verify channel truth', () => {
  it('binds approval request identity to the run attempt nonce', async () => {
    const projectRoot = root();
    const subjects: unknown[] = [];
    const approval = {
      submitProviderEvidenceProbe: vi.fn((request: { subject: unknown }) => {
        subjects.push(request.subject);
      }),
      verifyAndClaimProviderEvidenceProbe: vi.fn(() => {
        throw new AttendedExecutionApprovalError('DECISION_NOT_FOUND', 'pending');
      }),
    };

    const first = await prepareCrossVerifyCandidateEvidence(
      preparationInput(projectRoot, 'run-one', approval),
    );
    const second = await prepareCrossVerifyCandidateEvidence(
      preparationInput(projectRoot, 'run-two', approval),
    );

    expect(first).toMatchObject({ state: 'hold', reasonCode: 'approval_undecided' });
    expect(second).toMatchObject({ state: 'hold', reasonCode: 'approval_undecided' });
    expect(first.state === 'hold' && first.approvalRequestId)
      .not.toBe(second.state === 'hold' && second.approvalRequestId);
    expect(subjects).toHaveLength(2);
    expect(subjects[0]).not.toEqual(subjects[1]);
  });

  it('persists the validation reason for a stale approval decision', async () => {
    const projectRoot = root();
    const stale = new AttendedExecutionApprovalError('DECISION_UNTRUSTED', 'request-expired');
    Object.assign(stale, { validationReason: 'request-expired' });
    const result = await prepareCrossVerifyCandidateEvidence(preparationInput(projectRoot, 'run-stale', {
      submitProviderEvidenceProbe: vi.fn(),
      verifyAndClaimProviderEvidenceProbe: vi.fn(() => { throw stale; }),
    }));

    expect(result).toMatchObject({ state: 'hold', reasonCode: 'approval_untrusted' });
    const record = JSON.parse(readFileSync(
      join(projectRoot, '.analysis/xverify/approval-validation-holds.jsonl'),
      'utf-8',
    ).trim()) as Record<string, unknown>;
    expect(record).toMatchObject({
      requestId: result.state === 'hold' ? result.approvalRequestId : undefined,
      validationReason: 'request-expired',
    });
  });

  it('writes readable bootstrap and composition hold details', async () => {
    const projectRoot = root();
    const task = {
      id: '556-example', title: 'truth', description: 'truth', model: 'gpt-5.6-sol',
      provider: 'codex', scope: { filesRead: [], filesWrite: [], directories: [] },
      goNogo: { items: [] },
    } as never;
    const result = { taskId: '556-example', filesChanged: [] } as never;
    const bootstrapped = bootstrapCrossVerifyRuntimeV2({
      projectRoot,
      task,
      result,
      settlementRef: {} as never,
      fenceTokenHash: 'a'.repeat(64),
      runtimeImageRef: `sha256:${'b'.repeat(64)}`,
      producerSettlementDigest: 'c'.repeat(64),
    });
    expect(bootstrapped).toMatchObject({
      state: 'hold', reasonCode: 'xverify_v2_structured_criteria_missing', detail: '556-example',
    });

    writeFileSync(join(projectRoot, '.tasks-placeholder'), '');
    const tasksDir = join(projectRoot, '.tasks');
    await import('node:fs').then(({ mkdirSync }) => mkdirSync(tasksDir));
    writeFileSync(join(tasksDir, 'task-556-example.result'), JSON.stringify({
      taskId: '556-example', selfAssessment: 'DONE', testsPassed: true,
    }));
    const run = await runCrossVerify(
      projectRoot,
      task,
      result,
      TaskEvaluation.DONE,
      { cross_verify: { enabled: true, enforce_refuted: true, high_stakes_only: false } } as never,
      { mandatoryInvocationFactory: { compose: vi.fn(() => ({
        state: 'hold',
        reasonCode: 'xverify_v2_bootstrap_failed',
        detail: 'readable composition failure',
        authorityEvidenceRef: `xverify-bootstrap:sha256:${'d'.repeat(64)}`,
      })) } },
    );
    expect(run).toMatchObject({ outcome: 'unavailable', blocked: true });
    const records = readFileSync(join(projectRoot, '.analysis/xverify/hold-details.jsonl'), 'utf-8')
      .trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ detail: '556-example' }),
      expect.objectContaining({ detail: 'readable composition failure' }),
    ]));
  });

  it('reaches ready when the semantic response byte capacity equals the durable receipt cap', () => {
    const projectRoot = root();
    const stateRoot = root();
    process.env.DECKENT_HOME = stateRoot;
    writeFileSync(join(projectRoot, 'evidence.ts'), 'export const evidence = true;\n');
    const settlementRef = createTaskResultSettlementRefForAttempt(projectRoot, 'capacity-parity', '11111111-1111-4111-8111-111111111111');
    writeTaskResultSettlementAttemptAtomic(settlementRef, '2026-08-24T00:00:00.000Z');
    claimTaskResultSettlementAttemptAtomic(settlementRef, '2026-08-24T00:00:00.000Z');

    const bootstrapped = bootstrapCrossVerifyRuntimeV2({
      projectRoot,
      task: {
        id: 'capacity-parity',
        title: 'capacity parity',
        scope: { filesRead: ['evidence.ts'] },
        goNogo: { items: [{
          id: 'C1', polarity: 'go', statement: 'evidence is true',
          evidenceRequirements: ['evidence.ts'],
        }] },
      } as never,
      result: { taskId: 'capacity-parity', filesChanged: ['evidence.ts'] } as never,
      settlementRef,
      fenceTokenHash: taskResultSettlementActiveClaimDigest(settlementRef),
      runtimeImageRef: `sha256:${'b'.repeat(64)}`,
      producerSettlementDigest: 'c'.repeat(64),
    });

    expect(CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS
      * CROSS_VERIFY_UTF8_WORST_CASE_BYTES_PER_JAVASCRIPT_CHAR)
      .toBe(CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES);
    expect(bootstrapped).toMatchObject({
      state: 'ready',
      executionBinding: { maxEvidenceOutputChars: 12_000 },
    });
  });

  it('persists bounded schema-rejected raw output and successful assertion breakdowns', () => {
    const projectRoot = root();
    const raw = 'x'.repeat(300 * 1024);
    persistCrossVerifyAdjudicationReport(projectRoot, 'raw-reject', {
      output: raw,
      adjudication: { reason: 'Expected object, received null' } as never,
      schemaRejected: true,
    });
    const rejected = JSON.parse(readFileSync(
      join(projectRoot, '.analysis/xverify/task-raw-reject-adjudication.json'),
      'utf-8',
    )) as Record<string, unknown>;
    expect(rejected).toMatchObject({
      schemaRejected: true,
      schemaRejectionReason: 'Expected object, received null',
      rawProviderOutputTruncated: true,
    });
    expect((rejected.rawProviderOutput as string).length).toBe(256 * 1024);

    const breakdown = [{
      assertionId: 'A1',
      status: 'undecidable',
      missingEvidence: [{ requirementId: 'R1', evidenceIds: ['E-missing'] }],
    }];
    persistCrossVerifyAdjudicationReport(projectRoot, 'valid', {
      output: 'valid',
      adjudication: { reason: 'bounded evidence incomplete' } as never,
      assertionBreakdown: breakdown,
      schemaRejected: false,
    });
    const valid = JSON.parse(readFileSync(
      join(projectRoot, '.analysis/xverify/task-valid-adjudication.json'),
      'utf-8',
    )) as Record<string, unknown>;
    expect(valid).toMatchObject({ schemaRejected: false, assertionBreakdown: breakdown });
  });

  it.each(['confirmed', 'unclear', 'unavailable', 'hold'] as const)(
    'settles the twin projection for terminal %s',
    outcome => {
      const projectRoot = root();
      const tasksDir = join(projectRoot, '.tasks');
      return import('node:fs').then(({ mkdirSync }) => {
        mkdirSync(tasksDir);
        writeFileSync(join(tasksDir, 'task-source-xverify.json'), JSON.stringify({
          id: 'source-xverify', status: 'PENDING',
        }));
        settleCrossVerifyTwinProjection(projectRoot, 'source-xverify', outcome);
        expect(JSON.parse(readFileSync(
          join(tasksDir, 'task-source-xverify.json'),
          'utf-8',
        ))).toMatchObject({
          status: outcome === 'confirmed' ? 'DONE' : 'FAILED',
          resultMarker: `xverify-terminal:${outcome}`,
        });
      });
    },
  );
});
