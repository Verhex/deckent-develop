// ═══ Result Assembler Tests — git-authoritative, orchestrator-owned ══════════
// Worker Output Contract (spec §1.1/§1.2/§1.5), Plan PHASE 1 / Task 1.2.
// Faithful + hermetic: real git in os.tmpdir() proves files/lines are GIT-derived
// (not worker-claimed); the conflict + validation paths use injected providers.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/core/audit-writer.js';

import {
  assembleResult,
  assembleCanonicalIngressResult,
  assembleCanonicalIngressResultV2,
  computeBoundaryViolations,
  makeStaticGitChangeProvider,
  createDefaultGitChangeProvider,
  AssemblerError,
  type AssembleInput,
  type FileChange,
} from '../../src/orchestra/result-assembler.js';
import { validateTaskResult } from '../../src/core/task-result-schema.js';
import {
  buildPromptDeliveryReceipt,
  promptDeliveryReceiptPath,
  writePromptDeliveryReceipt,
} from '../../src/core/prompt-delivery-receipt.js';
import type { TokenUsage } from '../../src/core/token-usage.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskScope } from '../../src/core/types.js';
import { createTaskResultSettlementV2TestPolicy } from '../helpers/task-result-settlement-v2-fixture.js';
import {
  createExecutionEffectResultProjectionV1,
  createTaskAttemptEffectLandingBindingV2,
} from '../../src/core/execution-effect-persistence-contract.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTempDir(prefix = 'result-assembler-test'): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function git(dir: string, cmd: string): void {
  execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' });
}

function initRepo(dir: string): void {
  git(dir, 'init -q');
  git(dir, 'config user.email "test@test.com"');
  git(dir, 'config user.name "Test"');
  git(dir, 'commit --allow-empty -q -m init');
}

function makeScope(overrides: Partial<TaskScope> = {}): TaskScope {
  return {
    directories: ['src/orchestra/'],
    filesRead: [],
    filesWrite: ['src/orchestra/foo.ts'],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test',
    description: '',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: makeScope(),
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-326',
    ...overrides,
  } as Task;
}

const TOKENS: TokenUsage = {
  inputTokens: 1200,
  outputTokens: 800,
  cacheReadTokens: 100,
  cacheCreationTokens: 50,
  totalTokens: 2000,
  source: 'provider-adapter',
};

const COST = { usd: 0.42, pricingSource: 'test-pricing', isLocal: false };

const TIMING = {
  spawnedAt: '2026-06-26T10:00:00.000Z',
  startedAt: '2026-06-26T10:00:01.000Z',
  completedAt: '2026-06-26T10:00:05.000Z',
};

function baseInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    projectRoot: '/tmp/none',
    task: makeTask(),
    identity: { workerId: 'w-1', provider: 'claude', model: 'opus' },
    workerSubjective: {
      selfAssessment: 'DONE',
      notes: 'ok',
      goCriteria: [{ id: 'g1', description: 'tsc clean', met: true }],
      tests: { passed: 5, failed: 0, total: 5 },
      tsc: { clean: true, errors: 0 },
    },
    tokenUsage: TOKENS,
    cost: COST,
    timing: TIMING,
    gitProvider: makeStaticGitChangeProvider([]),
    ...overrides,
  };
}

// ─── 1. git-authoritative file/line derivation (the headline faithful test) ────

describe('assembleResult — git-authoritative work output', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir();
    initRepo(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('derives filesChanged/lines from a real git repo (NOT worker-claimed), 3-line new file → linesAdded===3', async () => {
    mkdirSync(join(dir, 'src/orchestra'), { recursive: true });
    writeFileSync(join(dir, 'src/orchestra/foo.ts'), 'a\nb\nc\n'); // 3 lines, untracked

    const result = await assembleResult(
      baseInput({ projectRoot: dir, gitProvider: undefined }), // real git provider
    );

    const foo = result.filesChanged.find(f => f.path === 'src/orchestra/foo.ts');
    expect(foo).toBeDefined();
    expect(foo!.status).toBe('added');
    expect(foo!.linesAdded).toBe(3); // git-derived, not the worker's claim
    expect(foo!.linesRemoved).toBe(0);
    expect(result.totalLinesAdded).toBe(3);
    expect(result.diskVerified).toBe(true);
    expect(result.boundaryViolations).toEqual([]);

    // injected authoritative resource accounting is copied verbatim
    expect(result.tokenUsage.inputTokens).toBe(1200);
    expect(result.tokenUsage.totalTokens).toBe(2000);
    expect(result.cost.usd).toBe(0.42);
    expect(result.cost.currency).toBe('USD'); // schema default applied

    // duration derived from timestamps (completed − spawned = 5000ms)
    expect(result.durationMs).toBe(5000);

    // identity + the assembled result is schema-valid
    expect(result.taskId).toBe('task-1');
    expect(result.workerId).toBe('w-1');
    expect(result.schemaVersion).toBe('1.0');
    expect(validateTaskResult(result).ok).toBe(true);
  });

  it('classifies modified and deleted tracked files by git status', async () => {
    mkdirSync(join(dir, 'src/orchestra'), { recursive: true });
    writeFileSync(join(dir, 'src/orchestra/keep.ts'), 'one\ntwo\n');
    writeFileSync(join(dir, 'src/orchestra/del.ts'), 'gone\n');
    git(dir, 'add -A');
    git(dir, 'commit -q -m base');

    // modify keep.ts, delete del.ts in the working tree
    writeFileSync(join(dir, 'src/orchestra/keep.ts'), 'one\ntwo\nthree\n');
    rmSync(join(dir, 'src/orchestra/del.ts'));

    const result = await assembleResult(
      baseInput({
        projectRoot: dir,
        gitProvider: undefined,
        task: makeTask({
          scope: makeScope({ filesWrite: ['src/orchestra/keep.ts', 'src/orchestra/del.ts'] }),
        }),
      }),
    );

    const keep = result.filesChanged.find(f => f.path === 'src/orchestra/keep.ts');
    const del = result.filesChanged.find(f => f.path === 'src/orchestra/del.ts');
    expect(keep?.status).toBe('modified');
    expect(keep?.linesAdded).toBe(1);
    expect(del?.status).toBe('deleted');
    expect(del?.linesRemoved).toBe(1);
    expect(result.boundaryViolations).toEqual([]);
  });

  it('flags out-of-scope changed files as boundary violations', async () => {
    mkdirSync(join(dir, 'src/other'), { recursive: true });
    writeFileSync(join(dir, 'src/other/leak.ts'), 'leak\n'); // outside scope

    const result = await assembleResult(
      baseInput({ projectRoot: dir, gitProvider: undefined }),
    );

    expect(result.boundaryViolations.map(v => v.path)).toContain('src/other/leak.ts');
    expect(result.diskVerified).toBe(true);
  });

  it('fails open on a non-git directory → diskVerified:false, no fabricated changes', async () => {
    const nonRepo = makeTempDir('not-a-repo');
    try {
      const result = await assembleResult(
        baseInput({ projectRoot: nonRepo, gitProvider: undefined }),
      );
      expect(result.diskVerified).toBe(false);
      expect(result.filesChanged).toEqual([]);
      expect(result.totalLinesAdded).toBe(0);
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});

// ─── 2. Conflict rule §1.5 (authoritative wins, claim preserved) ───────────────

describe('assembleResult — honestGate conflict (§1.5)', () => {
  it('claimed DONE while tsc dirty → honestGate.flagged, violation=claimed-done-tsc-fail', async () => {
    const result = await assembleResult(
      baseInput({
        workerSubjective: {
          selfAssessment: 'DONE',
          notes: 'all good',
          goCriteria: [],
          tests: { passed: 1, failed: 0, total: 1 },
          tsc: { clean: false, errors: 4 },
        },
      }),
    );
    expect(result.honestGate.flagged).toBe(true);
    expect(result.honestGate.violation).toBe('claimed-done-tsc-fail');
    // the worker claim is preserved verbatim, not silently overwritten
    expect(result.selfAssessment).toBe('DONE');
    expect(result.tsc.clean).toBe(false);
  });

  it('does NOT flag when tsc is clean, or when the worker did not claim DONE', async () => {
    const clean = await assembleResult(baseInput());
    expect(clean.honestGate.flagged).toBe(false);
    expect(clean.honestGate.violation).toBeNull();

    const honestNoGo = await assembleResult(
      baseInput({
        workerSubjective: {
          selfAssessment: 'NO_GO',
          notes: 'tsc failed, reporting honestly',
          goCriteria: [],
          tests: { passed: 0, failed: 1, total: 1 },
          tsc: { clean: false, errors: 2 },
        },
      }),
    );
    expect(honestNoGo.honestGate.flagged).toBe(false);
  });
});

// ─── 3. Validation + error contract ────────────────────────────────────────────

describe('assembleResult — validation', () => {
  it('normalizes legacy ingress into strict canonical V1 once', () => {
    const result = assembleCanonicalIngressResult({
      taskId: 'task-1',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: ['src/orchestra/foo.ts'],
      linesAdded: 2,
      linesRemoved: 0,
    }, { taskId: 'task-1', workerId: 'docker-task-1', provider: 'claude', model: 'opus' });
    expect(validateTaskResult(result).ok).toBe(true);
    expect(result).toMatchObject({ schemaVersion: '1.0', totalLinesAdded: 2 });
    expect(result.tests.outcome).toBe('PASSED');
  });

  it('preserves the host-authored xverify terminal projection through strict settlement', () => {
    // Live regression 2026-08-24: the cutover dropped this additive field and
    // every cross-provider verifier run degraded to framing-invalid.
    const result = assembleCanonicalIngressResult({
      taskId: 'xv-1',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      notes: 'Host-observed terminal xverify protocol completed.\nXVERIFY_RESPONSE_JSON: {}\nVERDICT: CONFIRMED ok',
      hostTerminalProjection: {
        version: 1,
        protocol: 'xverify-v1',
        observedBy: 'host',
        sourceMarker: { type: 'EXIT_WITHOUT_RESULT', exitCode: 0 },
      },
    }, { taskId: 'xv-1', workerId: 'docker-xv-1', provider: 'claude', model: 'opus' });
    expect(validateTaskResult(result).ok).toBe(true);
    expect(result.hostTerminalProjection).toMatchObject({
      version: 1,
      protocol: 'xverify-v1',
      observedBy: 'host',
    });
  });

  it('preserves digest-bound evaluator fields through strict canonical settlement', () => {
    const promptCompilePlanId = `prompt-compile-plan:sha256:${'a'.repeat(64)}`;
    const command = 'npx vitest run tests/orchestra/result-assembler.test.ts';
    const result = assembleCanonicalIngressResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      testVerification: {
        applicability: 'REQUIRED',
        outcome: 'PASSED',
        commands: [command],
      },
      criteriaEvidence: [{ criterionId: 'go-1', outcome: 'MET', evidence: ['test passed'] }],
      techDebtCriterionIds: [],
      promptCompilePlanId,
      filesChanged: [],
    }, {
      taskId: 'task-1',
      workerId: 'docker-task-1',
      provider: 'codex',
      model: 'gpt-test',
      sprintId: 'sprint-661',
      promptCompilePlanId,
      verificationCommands: [command],
      isPriorityFix: true,
      fixForTaskId: 'task-0',
    });

    expect(result).toMatchObject({
      promptCompilePlanId,
      testVerification: { applicability: 'REQUIRED', outcome: 'PASSED', commands: [command] },
      techDebtCriterionIds: [],
      sprintId: 'sprint-661',
      isPriorityFix: true,
      fixForTaskId: 'task-0',
    });
  });

  it('preserves run-policy and production-wiring evidence through canonical ingress', () => {
    const productionWiringEvidence = {
      version: 1 as const,
      contractDigest: 'b'.repeat(64),
      observedBy: 'worker' as const,
      evidence: {
        state: 'presence-only' as const,
        basis: 'static-reachability' as const,
        evidenceRefs: ['worker-observation:sha256:fixture'],
      },
    };
    const runPolicyEvidence = {
      version: 1 as const,
      observedPolicyDigest: 'c'.repeat(64),
      observedBy: 'worker' as const,
    };
    const result = assembleCanonicalIngressResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      productionWiringEvidence,
      runPolicyEvidence,
    }, {
      taskId: 'task-evidence',
      workerId: 'docker-task-evidence',
      provider: 'codex',
      model: 'gpt-test',
    });

    expect(result.productionWiringEvidence).toEqual(productionWiringEvidence);
    expect(result.runPolicyEvidence).toEqual(runPolicyEvidence);
  });

  it('promotes exact custody ingress to V2 without accepting worker-authored custody', () => {
    const policy = createTaskResultSettlementV2TestPolicy();
    const identity = {
      schemaVersion: 2 as const,
      backend: 'docker' as const,
      projectRootSha256: '0'.repeat(64),
      projectId: 'fixture-project',
      taskId: 'fixture-001',
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
      generation: 4,
    };
    const admissionReceiptDigest = `sha256:${'d'.repeat(64)}` as const;
    const sourceBinding = Object.freeze({
      version: 2 as const,
      identity,
      policyDigest: policy.policyDigest,
      admissionReceiptDigest,
      sourceResult: Object.freeze({
        artifactClass: 'worker-result' as const,
        artifactKey: 'primary',
        artifactReceiptDigest: `sha256:${'e'.repeat(64)}` as const,
        artifactSha256: `sha256:${'f'.repeat(64)}` as const,
        byteLength: 128,
      }),
    });
    const effectProjection = createExecutionEffectResultProjectionV1({
      disposition: 'COMMITTED_NO_CHANGE',
      effectDecisionDigest: `sha256:${'1'.repeat(64)}`,
      transactionDigest: `sha256:${'2'.repeat(64)}`,
      decisionEffectCount: 0,
      effects: [],
    });
    const effectBinding = createTaskAttemptEffectLandingBindingV2({
      identity: {
        projectId: identity.projectId,
        taskId: identity.taskId,
        attemptId: identity.attemptId,
        generation: identity.generation,
      },
      admissionReceiptDigest,
      custodyPolicyDigest: policy.policyDigest,
      landingArtifactKey: 'primary-landing',
      landingArtifactReceiptDigest: `sha256:${'3'.repeat(64)}`,
      landingReceiptDigest: `sha256:${'4'.repeat(64)}`,
      effectLandingChainDigest: `sha256:${'5'.repeat(64)}`,
      readyLifecycleAuthorityDigest: `sha256:${'6'.repeat(64)}`,
      disposition: effectProjection.disposition,
      effectDecisionDigest: effectProjection.effectDecisionDigest,
      transactionDigest: effectProjection.transactionDigest,
    });
    const hostEffectAuthority = Object.freeze({
      projection: effectProjection,
      binding: effectBinding,
    });
    const ingress = {
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      runPolicyEvidence: {
        version: 1 as const,
        observedPolicyDigest: 'd'.repeat(64),
        observedBy: 'worker' as const,
      },
    };
    const hostBilling = {
      source: 'provider-envelope' as const,
      provider: 'fixture-provider',
      currency: 'USD' as const,
      providerReportedUsd: 1.25,
      modelUsage: {
        'fixture-model': {
          inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheCreationTokens: 1,
        },
      },
      capturedAt: '2026-09-01T00:00:00.000Z',
    };
    const hostTerminalBilling = {
      evidence: hostBilling,
      evidenceDigest: `sha256:${createHash('sha256').update(canonicalJson(hostBilling)).digest('hex')}` as const,
      providerStreamReceiptDigest: `sha256:${'e'.repeat(64)}` as const,
      billingMode: 'api' as const,
    };
    const hostWorkEvidence = {
      filesChanged: [],
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      workAttribution: {
        state: 'VERIFIED' as const,
        attemptId: identity.attemptId,
        baselineRef: `provider-exit:${'f'.repeat(64)}#scope-baseline`,
        baselineSha256: 'a'.repeat(64),
        scopeDigest: 'b'.repeat(64),
      },
      providerExitObservationReceiptDigest: `sha256:${'f'.repeat(64)}` as const,
    };
    const hostWorkAuthorityFor = (evidence: Readonly<{
      filesChanged: readonly FileChange[];
      totalLinesAdded: number;
      totalLinesRemoved: number;
      workAttribution: typeof hostWorkEvidence.workAttribution;
      providerExitObservationReceiptDigest: `sha256:${string}`;
    }>) => ({
      ...evidence,
      evidenceDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(evidence)).digest('hex')}` as const,
    });
    const hostWorkAuthority = hostWorkAuthorityFor(hostWorkEvidence);
    const hostWorkArtifact = Object.freeze({
      artifactClass: 'host-work-attribution' as const,
      artifactKey: `host-work-${identity.attemptId}`,
      artifactReceiptDigest: `sha256:${'b'.repeat(64)}` as const,
      artifactSha256: `sha256:${'c'.repeat(64)}` as const,
      byteLength: Buffer.byteLength(canonicalJson(hostWorkAuthority), 'utf8'),
    });
    const promptCompilePlanId = `prompt-compile-plan:sha256:${'1'.repeat(64)}`;
    const hostPromptBody = {
      promptDeliveryAttribution: { state: 'CURRENT' as const },
      agentId: 'backend-specialist',
      skillIds: ['z-skill', 'ä-skill'],
      promptCompilePlanId,
      receiptIdentity: `prompt-delivery-receipt:sha256:${'2'.repeat(64)}` as const,
      promptDeliveryAuthorityDigest: `sha256:${'3'.repeat(64)}` as const,
      basePromptSha256: `sha256:${'4'.repeat(64)}` as const,
      segmentManifestDigest: `sha256:${'5'.repeat(64)}` as const,
      taskSnapshotSha256: `sha256:${'6'.repeat(64)}` as const,
      providerInvocationDigest: `sha256:${'7'.repeat(64)}` as const,
      providerStartObservationReceiptDigest: `sha256:${'8'.repeat(64)}` as const,
      providerStartObservationEvidenceDigest: `sha256:${'9'.repeat(64)}` as const,
      executionCommitNonceSha256: `sha256:${'a'.repeat(64)}` as const,
    };
    const hostPromptDeliveryAuthority = {
      ...hostPromptBody,
      bindingDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(hostPromptBody)).digest('hex')}` as const,
    };
    const result = assembleCanonicalIngressResultV2(ingress, {
      taskId: identity.taskId,
      workerId: 'docker-fixture-001',
      provider: 'fixture-provider',
      model: 'fixture-model',
      promptCompilePlanId,
    }, {
      attemptCustody: sourceBinding,
      hostWorkArtifact,
      jsonBounds: policy.jsonBounds,
      hostEffectAuthority,
      hostTerminalBilling,
      hostWorkAuthority,
      hostPromptDeliveryAuthority,
    });

    expect(result.schemaVersion).toBe('2.0');
    expect(result.attempt).toBe(identity.generation);
    expect(result.attemptCustody.identity).toEqual(identity);
    expect(result.attemptCustody.hostWorkAttribution).toEqual(hostWorkArtifact);
    expect(result.attemptCustody.hostPromotion.authority)
      .toBe('host-canonical-ingress-assembler');
    expect(result.runPolicyEvidence).toEqual(ingress.runPolicyEvidence);

    const workerSpoof = assembleCanonicalIngressResultV2({
      ...ingress,
      attemptCustody: { forged: true },
      tokenUsage: { inputTokens: 999999, outputTokens: 999999 },
      cost: { usd: 999999 },
      providerBilling: { providerReportedUsd: 999999 },
      filesChanged: [{ path: 'src/forged.ts', status: 'added', linesAdded: 999, linesRemoved: 0 }],
      totalLinesAdded: 999,
      totalLinesRemoved: 0,
      diskVerified: true,
      boundaryViolations: [{ path: 'src/forged.ts', reason: 'worker-forged' }],
      workAttribution: {
        state: 'VERIFIED', attemptId: 'forged', baselineRef: 'forged',
        baselineSha256: 'c'.repeat(64), scopeDigest: 'd'.repeat(64),
      },
      promptDeliveryAttribution: { state: 'LEGACY_FALLBACK' },
      hostTerminalProjection: { version: 1, protocol: 'forged', observedBy: 'host' },
      agentId: 'forged-agent',
      skillIds: ['forged-skill'],
    }, {
      taskId: identity.taskId,
      workerId: 'docker-fixture-001',
      provider: 'fixture-provider',
      model: 'fixture-model',
      promptCompilePlanId,
    }, {
      attemptCustody: sourceBinding,
      hostWorkArtifact,
      jsonBounds: policy.jsonBounds,
      hostEffectAuthority,
      hostTerminalBilling,
      hostWorkAuthority,
      hostPromptDeliveryAuthority,
    });
    expect(workerSpoof.attemptCustody.identity).toEqual(result.attemptCustody.identity);
    expect(workerSpoof.attemptCustody.admissionReceiptDigest)
      .toBe(result.attemptCustody.admissionReceiptDigest);
    expect(workerSpoof.attemptCustody.sourceResult).toEqual(result.attemptCustody.sourceResult);
    expect(workerSpoof.attemptCustody.hostWorkAttribution).toEqual(hostWorkArtifact);
    expect(workerSpoof.tokenUsage).toMatchObject({
      inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheCreationTokens: 1,
      totalTokens: 18, source: 'provider-adapter',
    });
    expect(workerSpoof.cost).toMatchObject({ usd: 1.25, billingMode: 'api' });
    expect(workerSpoof.providerBilling).toEqual(hostBilling);
    expect(workerSpoof.filesChanged).toEqual([]);
    expect(workerSpoof.totalLinesAdded).toBe(0);
    expect(workerSpoof.totalLinesRemoved).toBe(0);
    expect(workerSpoof.workAttribution).toEqual(hostWorkAuthority.workAttribution);
    expect(workerSpoof.promptDeliveryAttribution).toEqual({ state: 'CURRENT' });
    expect(workerSpoof.boundaryViolations).toEqual([]);
    expect(workerSpoof.hostTerminalProjection).toBeUndefined();
    expect(workerSpoof.agent).toBe('backend-specialist');
    expect(workerSpoof.skills).toEqual(['z-skill', 'ä-skill']);
    expect(workerSpoof.workerWorkClaim).toMatchObject({
      filesChanged: ['src/forged.ts'], linesAdded: 999, linesRemoved: 0, mismatch: true,
    });
    expect(workerSpoof.attemptCustody.effectLanding).toEqual(hostEffectAuthority.binding);

    const canonicalAuthority = {
      taskId: identity.taskId,
      workerId: 'docker-fixture-001',
      provider: 'fixture-provider',
      model: 'fixture-model',
      promptCompilePlanId,
    };
    const custodyBase = {
      attemptCustody: sourceBinding,
      hostWorkArtifact,
      jsonBounds: policy.jsonBounds,
      hostTerminalBilling,
      hostPromptDeliveryAuthority,
    };
    expect(() => assembleCanonicalIngressResultV2(
      ingress,
      canonicalAuthority,
      { ...custodyBase, hostWorkAuthority } as never,
    )).toThrow(/Host execution effect authority is invalid/u);
    expect(() => assembleCanonicalIngressResultV2(ingress, canonicalAuthority, {
      ...custodyBase,
      hostEffectAuthority: {
        ...hostEffectAuthority,
        projection: { ...hostEffectAuthority.projection, effectCount: 1 },
      },
      hostWorkAuthority,
    })).toThrow(/Host execution effect authority is invalid/u);
    expect(() => assembleCanonicalIngressResultV2(ingress, canonicalAuthority, {
      ...custodyBase,
      hostWorkArtifact: {
        ...hostWorkArtifact,
        artifactKey: `host-work-foreign-${identity.attemptId}`,
      },
      hostEffectAuthority,
      hostWorkAuthority,
    })).toThrow(/Host execution effect authority is invalid/u);
    const foreignBinding = createTaskAttemptEffectLandingBindingV2({
      identity: { ...hostEffectAuthority.binding.identity, attemptId: 'foreign-attempt' },
      admissionReceiptDigest: hostEffectAuthority.binding.admissionReceiptDigest,
      custodyPolicyDigest: hostEffectAuthority.binding.custodyPolicyDigest,
      landingArtifactKey: hostEffectAuthority.binding.landingArtifactKey,
      landingArtifactReceiptDigest: hostEffectAuthority.binding.landingArtifactReceiptDigest,
      landingReceiptDigest: hostEffectAuthority.binding.landingReceiptDigest,
      effectLandingChainDigest: hostEffectAuthority.binding.effectLandingChainDigest,
      readyLifecycleAuthorityDigest: hostEffectAuthority.binding.readyLifecycleAuthorityDigest,
      disposition: hostEffectAuthority.binding.disposition,
      effectDecisionDigest: hostEffectAuthority.binding.effectDecisionDigest,
      transactionDigest: hostEffectAuthority.binding.transactionDigest,
    });
    expect(() => assembleCanonicalIngressResultV2(ingress, canonicalAuthority, {
      ...custodyBase,
      hostEffectAuthority: { projection: effectProjection, binding: foreignBinding },
      hostWorkAuthority,
    })).toThrow(/Host execution effect authority is invalid/u);
    const noChangeWithWork = hostWorkAuthorityFor({
      ...hostWorkEvidence,
      filesChanged: [{
        path: 'src/host.ts', status: 'modified', linesAdded: 3, linesRemoved: 1,
      }],
      totalLinesAdded: 3,
      totalLinesRemoved: 1,
    });
    expect(() => assembleCanonicalIngressResultV2(ingress, canonicalAuthority, {
      ...custodyBase,
      hostEffectAuthority,
      hostWorkAuthority: noChangeWithWork,
    })).toThrow(/Host work attribution authority is invalid/u);

    const committedProjection = createExecutionEffectResultProjectionV1({
      disposition: 'COMMITTED',
      effectDecisionDigest: `sha256:${'b'.repeat(64)}`,
      transactionDigest: `sha256:${'c'.repeat(64)}`,
      decisionEffectCount: 1,
      effects: [{
        operationIndex: 0,
        path: 'src/host.ts',
        status: 'modified',
        operationKind: 'REPLACE',
        entryKind: 'regular-file',
        lineMetrics: 'REQUIRED',
        operationDigest: `sha256:${'d'.repeat(64)}`,
        effectDigests: [`sha256:${'e'.repeat(64)}`],
        derivedParentProvenanceDigest: null,
      }],
    });
    const committedBinding = createTaskAttemptEffectLandingBindingV2({
      identity: hostEffectAuthority.binding.identity,
      admissionReceiptDigest: hostEffectAuthority.binding.admissionReceiptDigest,
      custodyPolicyDigest: hostEffectAuthority.binding.custodyPolicyDigest,
      landingArtifactKey: hostEffectAuthority.binding.landingArtifactKey,
      landingArtifactReceiptDigest: hostEffectAuthority.binding.landingArtifactReceiptDigest,
      landingReceiptDigest: hostEffectAuthority.binding.landingReceiptDigest,
      effectLandingChainDigest: hostEffectAuthority.binding.effectLandingChainDigest,
      readyLifecycleAuthorityDigest: hostEffectAuthority.binding.readyLifecycleAuthorityDigest,
      disposition: 'COMMITTED',
      effectDecisionDigest: committedProjection.effectDecisionDigest,
      transactionDigest: committedProjection.transactionDigest,
    });
    const committedWork = hostWorkAuthorityFor({
      ...hostWorkEvidence,
      filesChanged: [{
        path: 'src/host.ts', status: 'modified', linesAdded: 3, linesRemoved: 1,
      }],
      totalLinesAdded: 3,
      totalLinesRemoved: 1,
    });
    const committedResult = assembleCanonicalIngressResultV2(ingress, canonicalAuthority, {
      ...custodyBase,
      hostEffectAuthority: { projection: committedProjection, binding: committedBinding },
      hostWorkAuthority: committedWork,
    });
    expect(committedResult.filesChanged).toEqual(committedWork.filesChanged);
    expect(committedResult.diskVerified).toBe(true);
    expect(committedResult.attemptCustody.effectLanding).toEqual(committedBinding);

    const reorderedProjection = createExecutionEffectResultProjectionV1({
      disposition: 'COMMITTED',
      effectDecisionDigest: `sha256:${'5'.repeat(64)}`,
      transactionDigest: `sha256:${'6'.repeat(64)}`,
      decisionEffectCount: 2,
      effects: [
        {
          operationIndex: 0,
          path: 'src/z.ts',
          status: 'modified',
          operationKind: 'REPLACE',
          entryKind: 'regular-file',
          lineMetrics: 'REQUIRED',
          operationDigest: `sha256:${'7'.repeat(64)}`,
          effectDigests: [`sha256:${'8'.repeat(64)}`],
          derivedParentProvenanceDigest: null,
        },
        {
          operationIndex: 1,
          path: 'src/a.ts',
          status: 'added',
          operationKind: 'ADD',
          entryKind: 'regular-file',
          lineMetrics: 'REQUIRED',
          operationDigest: `sha256:${'9'.repeat(64)}`,
          effectDigests: [`sha256:${'a'.repeat(64)}`],
          derivedParentProvenanceDigest: null,
        },
      ],
    });
    const reorderedBinding = createTaskAttemptEffectLandingBindingV2({
      identity: hostEffectAuthority.binding.identity,
      admissionReceiptDigest: hostEffectAuthority.binding.admissionReceiptDigest,
      custodyPolicyDigest: hostEffectAuthority.binding.custodyPolicyDigest,
      landingArtifactKey: hostEffectAuthority.binding.landingArtifactKey,
      landingArtifactReceiptDigest: hostEffectAuthority.binding.landingArtifactReceiptDigest,
      landingReceiptDigest: hostEffectAuthority.binding.landingReceiptDigest,
      effectLandingChainDigest: hostEffectAuthority.binding.effectLandingChainDigest,
      readyLifecycleAuthorityDigest: hostEffectAuthority.binding.readyLifecycleAuthorityDigest,
      disposition: 'COMMITTED',
      effectDecisionDigest: reorderedProjection.effectDecisionDigest,
      transactionDigest: reorderedProjection.transactionDigest,
    });
    const reorderedWork = hostWorkAuthorityFor({
      ...hostWorkEvidence,
      filesChanged: [
        { path: 'src/a.ts', status: 'added', linesAdded: 2, linesRemoved: 0 },
        { path: 'src/z.ts', status: 'modified', linesAdded: 1, linesRemoved: 1 },
      ],
      totalLinesAdded: 3,
      totalLinesRemoved: 1,
    });
    const reorderedResult = assembleCanonicalIngressResultV2(ingress, canonicalAuthority, {
      ...custodyBase,
      hostEffectAuthority: { projection: reorderedProjection, binding: reorderedBinding },
      hostWorkAuthority: reorderedWork,
    });
    expect(reorderedResult.filesChanged).toEqual([
      { path: 'src/z.ts', status: 'modified', linesAdded: 1, linesRemoved: 1 },
      { path: 'src/a.ts', status: 'added', linesAdded: 2, linesRemoved: 0 },
    ]);

    const directoryProjection = createExecutionEffectResultProjectionV1({
      disposition: 'COMMITTED',
      effectDecisionDigest: `sha256:${'1'.repeat(64)}`,
      transactionDigest: `sha256:${'2'.repeat(64)}`,
      decisionEffectCount: 1,
      effects: [{
        operationIndex: 0,
        path: 'src/generated',
        status: 'added',
        operationKind: 'ADD_DIRECTORY',
        entryKind: 'directory',
        lineMetrics: 'NOT_APPLICABLE_DIRECTORY',
        operationDigest: `sha256:${'3'.repeat(64)}`,
        effectDigests: [`sha256:${'4'.repeat(64)}`],
        derivedParentProvenanceDigest: null,
      }],
    });
    const directoryBinding = createTaskAttemptEffectLandingBindingV2({
      identity: hostEffectAuthority.binding.identity,
      admissionReceiptDigest: hostEffectAuthority.binding.admissionReceiptDigest,
      custodyPolicyDigest: hostEffectAuthority.binding.custodyPolicyDigest,
      landingArtifactKey: hostEffectAuthority.binding.landingArtifactKey,
      landingArtifactReceiptDigest: hostEffectAuthority.binding.landingArtifactReceiptDigest,
      landingReceiptDigest: hostEffectAuthority.binding.landingReceiptDigest,
      effectLandingChainDigest: hostEffectAuthority.binding.effectLandingChainDigest,
      readyLifecycleAuthorityDigest: hostEffectAuthority.binding.readyLifecycleAuthorityDigest,
      disposition: 'COMMITTED',
      effectDecisionDigest: directoryProjection.effectDecisionDigest,
      transactionDigest: directoryProjection.transactionDigest,
    });
    const directoryResult = assembleCanonicalIngressResultV2(ingress, canonicalAuthority, {
      ...custodyBase,
      hostEffectAuthority: { projection: directoryProjection, binding: directoryBinding },
      hostWorkAuthority,
    });
    expect(directoryResult.filesChanged).toEqual([{
      path: 'src/generated', status: 'added', linesAdded: 0, linesRemoved: 0,
    }]);
    expect(directoryResult.totalLinesAdded).toBe(0);
    expect(directoryResult.totalLinesRemoved).toBe(0);

    const wrongStatusWork = hostWorkAuthorityFor({
      ...hostWorkEvidence,
      filesChanged: [{
        path: 'src/host.ts', status: 'added', linesAdded: 3, linesRemoved: 0,
      }],
      totalLinesAdded: 3,
      totalLinesRemoved: 0,
    });
    expect(() => assembleCanonicalIngressResultV2(ingress, canonicalAuthority, {
      ...custodyBase,
      hostEffectAuthority: { projection: committedProjection, binding: committedBinding },
      hostWorkAuthority: wrongStatusWork,
    })).toThrow(/Host work attribution authority is invalid/u);
    const wrongLineTotals = hostWorkAuthorityFor({
      ...hostWorkEvidence,
      filesChanged: committedWork.filesChanged,
      totalLinesAdded: 4,
      totalLinesRemoved: 1,
    });
    expect(() => assembleCanonicalIngressResultV2(ingress, canonicalAuthority, {
      ...custodyBase,
      hostEffectAuthority: { projection: committedProjection, binding: committedBinding },
      hostWorkAuthority: wrongLineTotals,
    })).toThrow(/Host work attribution authority is invalid/u);

    expect(() => assembleCanonicalIngressResultV2(ingress, {
      taskId: identity.taskId,
      workerId: 'docker-fixture-001',
      provider: 'fixture-provider',
      model: 'fixture-model',
      promptCompilePlanId,
    }, {
      attemptCustody: sourceBinding,
      hostWorkArtifact,
      jsonBounds: policy.jsonBounds,
      hostEffectAuthority,
      hostTerminalBilling,
      hostWorkAuthority,
      hostPromptDeliveryAuthority: {
        ...hostPromptDeliveryAuthority,
        providerStartObservationReceiptDigest: `sha256:${'f'.repeat(64)}`,
      },
    })).toThrow(/Host prompt delivery authority is invalid/);
  }, 60_000);

  it('preserves worker-observed policy and wiring evidence in orchestrator assembly', async () => {
    const productionWiringEvidence = {
      version: 1 as const,
      contractDigest: 'e'.repeat(64),
      observedBy: 'worker' as const,
      evidence: {
        state: 'incomplete' as const,
        reasonCode: 'not-executed' as const,
        evidenceRefs: ['worker-observation:sha256:fixture'],
      },
    };
    const runPolicyEvidence = {
      version: 1 as const,
      observedPolicyDigest: 'f'.repeat(64),
      observedBy: 'worker' as const,
    };
    const input = baseInput();
    const result = await assembleResult({
      ...input,
      workerSubjective: {
        ...input.workerSubjective,
        productionWiringEvidence,
        runPolicyEvidence,
      },
    });

    expect(result.productionWiringEvidence).toEqual(productionWiringEvidence);
    expect(result.runPolicyEvidence).toEqual(runPolicyEvidence);
  });
  it('throws AssemblerError when the assembled result is invalid', async () => {
    await expect(
      assembleResult(baseInput({ task: makeTask({ id: '' }) })),
    ).rejects.toBeInstanceOf(AssemblerError);

    try {
      await assembleResult(baseInput({ task: makeTask({ id: '' }) }));
    } catch (e) {
      expect(e).toBeInstanceOf(AssemblerError);
      expect((e as AssemblerError).errors.some(msg => msg.startsWith('taskId'))).toBe(true);
    }
  });

  it('embeds the worker-subjective block and leaves brain/auditor slots null', async () => {
    const result = await assembleResult(
      baseInput({
        gitProvider: makeStaticGitChangeProvider([
          { path: 'src/orchestra/foo.ts', status: 'added', linesAdded: 2, linesRemoved: 0 },
        ]),
      }),
    );
    expect(result.notes).toBe('ok');
    expect(result.goCriteria[0]?.id).toBe('g1');
    expect(result.goCriteria[0]?.evidence).toBeNull(); // default applied
    expect(result.tests.passed).toBe(5);
    expect(result.tests.orchestratorVerified).toBe(false);
    expect(result.brainEvaluation).toBeNull();
    expect(result.auditorValidation).toBeNull();
    expect(result.totalLinesAdded).toBe(2);
  });

  it('preserves a false worker claim separately without erasing host-measured work', async () => {
    const result = await assembleResult(baseInput({
      workerSubjective: {
        ...baseInput().workerSubjective,
        workClaim: { filesChanged: [], linesAdded: 0, linesRemoved: 0 },
      },
      gitProvider: makeStaticGitChangeProvider([
        { path: 'src/orchestra/foo.ts', status: 'modified', linesAdded: 3, linesRemoved: 1 },
      ]),
    }));
    expect(result.totalLinesAdded).toBe(3);
    expect(result.filesChanged).toHaveLength(1);
    expect(result.workerWorkClaim).toMatchObject({ mismatch: true, filesChanged: [] });
  });
});

describe('assembleResult — prompt delivery identity authority', () => {
  it('credits only identities rendered into a current receipt', async () => {
    const root = makeTempDir('result-delivery-current');
    try {
      const planId = `prompt-compile-plan:sha256:${'a'.repeat(64)}`;
      const receipt = buildPromptDeliveryReceipt({
        taskId: 'task-1',
        prompt: 'final prompt bytes',
        promptCompilePlanId: planId,
        rolePolicyIdentity: 'worker:delivered-agent',
        assignedAgentId: 'claim-agent',
        assignedSkillIds: ['claim-skill'],
        segments: [
          { kind: 'persona', content: '=== Agent: delivered-agent ===\npersona' },
          { kind: 'skills', content: '=== Skills ===\n--- delivered-skill ---\nbody\n' },
        ],
      });
      expect(writePromptDeliveryReceipt(root, receipt)).toBe(true);
      const result = await assembleResult(baseInput({
        projectRoot: root,
        task: makeTask({ promptCompilePlanId: planId, assignedAgent: 'assigned-agent', assignedSkills: ['assigned-skill'] }),
        identity: { workerId: 'w-1', provider: 'claude', model: 'opus', agent: 'claim-agent', skills: ['claim-skill'] },
      }));
      expect(result.agent).toBe('delivered-agent');
      expect(result.skills).toEqual(['delivered-skill']);
      expect(result.promptDeliveryAttribution).toEqual({ state: 'CURRENT' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('gives no identity credit when a fresh current receipt is absent or malformed', async () => {
    const root = makeTempDir('result-delivery-hold');
    const planId = `prompt-compile-plan:sha256:${'b'.repeat(64)}`;
    const input = baseInput({
      projectRoot: root,
      task: makeTask({ promptCompilePlanId: planId, assignedAgent: 'assigned-agent', assignedSkills: ['assigned-skill'] }),
      identity: { workerId: 'w-1', provider: 'claude', model: 'opus', agent: 'claim-agent', skills: ['claim-skill'] },
    });
    try {
      const missing = await assembleResult(input);
      expect(missing.agent).toBeNull();
      expect(missing.skills).toEqual([]);
      expect(missing.promptDeliveryAttribution).toEqual({ state: 'HOLD', reason: 'missing' });

      mkdirSync(join(root, '.tasks'), { recursive: true });
      writeFileSync(promptDeliveryReceiptPath(root, 'task-1'), '{malformed', 'utf8');
      const malformed = await assembleResult(input);
      expect(malformed.agent).toBeNull();
      expect(malformed.skills).toEqual([]);
      expect(malformed.promptDeliveryAttribution).toEqual({ state: 'HOLD', reason: 'malformed' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── 4. Boundary helper unit coverage ──────────────────────────────────────────

describe('computeBoundaryViolations', () => {
  const changes: FileChange[] = [
    { path: 'src/orchestra/foo.ts', status: 'added', linesAdded: 1, linesRemoved: 0 },
    { path: 'src/secret/leak.ts', status: 'modified', linesAdded: 1, linesRemoved: 0 },
  ];

  it('allows files under scope.directories and in scope.filesWrite, flags the rest', () => {
    const v = computeBoundaryViolations(changes, makeScope());
    expect(v).toEqual([{ path: 'src/secret/leak.ts', reason: 'outside-declared-scope' }]);
  });

  it('matches a directory entry with or without a trailing slash', () => {
    const v = computeBoundaryViolations(changes, makeScope({ directories: ['src/orchestra'] }));
    expect(v.map(x => x.path)).toEqual(['src/secret/leak.ts']);
  });
});

// ─── 5. Static provider seam ────────────────────────────────────────────────────

describe('makeStaticGitChangeProvider', () => {
  it('reports diskVerified=false when ok=false', async () => {
    const result = await assembleResult(
      baseInput({ gitProvider: makeStaticGitChangeProvider([], false) }),
    );
    expect(result.diskVerified).toBe(false);
  });

  it('createDefaultGitChangeProvider is exported and returns a provider', () => {
    const p = createDefaultGitChangeProvider('/tmp/none');
    expect(typeof p.collect).toBe('function');
  });
});
