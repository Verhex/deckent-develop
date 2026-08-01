import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  constants as fsConstants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../src/core/provider-authority-composition.js';
import {
  TaskStatus,
  createGoNoGoCriterionItem,
  type Task,
  type TaskResult,
} from '../../src/core/task-types.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  CrossVerifyProductionIngressAuthority,
} from '../../src/orchestra/cross-verify-production-ingress-authority.js';
import { bootstrapCrossVerifyRuntimeV2 } from '../../src/orchestra/cross-verify-runtime-bootstrap.js';

function task(): Task {
  return {
    id: 'm4-110-001',
    title: 'Exact xverify ingress',
    description: 'Verify one bounded change',
    model: 'claude-sonnet-5',
    provider: 'claude',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'authority test',
    scope: { directories: [], filesRead: ['src/example.ts'], filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: 'Exact authority is used',
      noGoCriteria: 'Authority is guessed',
      techDebtAcceptable: 'none',
      items: [
        createGoNoGoCriterionItem({
          polarity: 'go',
          statement: 'Exact authority is used',
          evidenceRequirements: ['src/example.ts contains the exact authority path'],
        }),
        createGoNoGoCriterionItem({
          polarity: 'no-go',
          statement: 'Authority is guessed',
          evidenceRequirements: ['src/example.ts contains guessed authority'],
        }),
      ],
    },
    status: TaskStatus.DONE,
    type: 'audit',
    sprintId: 'sprint-m4-110',
  };
}

function result(): TaskResult {
  return {
    taskId: 'm4-110-001',
    workerId: 'worker-m4-110',
    filesChanged: ['src/example.ts'],
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 100,
    selfAssessment: 'DONE',
    notes: 'bounded result',
  };
}

function config(enforce: boolean): ResolvedConfig {
  return {
    cross_verify: {
      enabled: true,
      enforce_refuted: enforce,
      high_stakes_only: false,
      verifier_priority: ['codex'],
    },
  } as unknown as ResolvedConfig;
}

describe('CrossVerifyProductionIngressAuthority', () => {
  it('bootstraps a typed claim from structured criteria and an immutable broker snapshot', () => {
    const pinnedRuntimeAvailable =
      process.platform === 'linux'
      && existsSync('/proc/self/fd')
      && typeof fsConstants.O_NOFOLLOW === 'number'
      && fsConstants.O_NOFOLLOW !== 0
      && typeof fsConstants.O_DIRECTORY === 'number'
      && fsConstants.O_DIRECTORY !== 0;
    if (!pinnedRuntimeAvailable) return;

    const base = mkdtempSync(join(tmpdir(), 'deckent-xverify-runtime-'));
    const projectRoot = join(base, 'project');
    const stateRoot = join(base, 'host-state');
    const originalDeckentHome = process.env.DECKENT_HOME;
    try {
      mkdirSync(join(projectRoot, 'src'), { recursive: true });
      mkdirSync(stateRoot, { recursive: true });
      writeFileSync(
        join(projectRoot, 'src/example.ts'),
        'export const authority = "exact";\n',
        'utf8',
      );
      process.env.DECKENT_HOME = stateRoot;
      const ref = createTaskResultSettlementRefForAttempt(
        projectRoot,
        'm4-110-001-xverify',
        randomUUID(),
      );
      writeTaskResultSettlementAttemptAtomic(ref, '2026-07-28T00:00:00.000Z');
      claimTaskResultSettlementAttemptAtomic(ref, '2026-07-28T00:00:00.000Z');

      const bootstrapped = bootstrapCrossVerifyRuntimeV2({
        projectRoot,
        task: { ...task(), description: 'untrusted-worker-context '.repeat(4_000) },
        result: result(),
        settlementRef: ref,
        fenceTokenHash: taskResultSettlementActiveClaimDigest(ref),
        runtimeImageRef: `sha256:${'9'.repeat(64)}`,
      });

      expect(bootstrapped).toMatchObject({
        state: 'ready',
        executionBinding: {
          protocol: 'xverify-adjudication-v2',
          evidenceMountPath: '/deckent/xverify-evidence',
          evidenceManifestRelativePath: 'manifest.json',
          evidenceAccess: 'snapshot-read-only',
          artifactMutationPolicy: 'attempt-private-output-only',
        },
      });
      if (bootstrapped.state !== 'ready') return;
      expect(bootstrapped.adjudicationContract.claim.assertions)
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ polarity: 'go' }),
          expect.objectContaining({ polarity: 'no-go' }),
        ]));
      expect(bootstrapped.evidenceSnapshot.manifest.entries).toHaveLength(1);
      expect(bootstrapped.prompt).toContain('XVerify Typed Adjudication Protocol v2');
      expect(bootstrapped.prompt).not.toContain('material field host-truncated');
      expect(bootstrapped.prompt).not.toContain('untrusted-worker-context');
    } finally {
      if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
      else process.env.DECKENT_HOME = originalDeckentHome;
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('touches no provider authority while cross-verification is disabled', async () => {
    const providerAuthority = new Proxy({}, {
      get() {
        throw new Error('default-off touched provider authority');
      },
    }) as ProviderAuthorityRuntimeServiceOpenResult;
    const ingress = new CrossVerifyProductionIngressAuthority({ providerAuthority });
    await expect(ingress.compose({
      projectRoot: '/tmp/provider-free-xverify',
      task: task(),
      result: result(),
      config: {
        ...config(false),
        cross_verify: { ...config(false).cross_verify!, enabled: false },
      },
      operationClass: 'verify-implementation',
      timeoutMs: 120_000,
    })).resolves.toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_disabled',
    });
  });

  it('resolves exact production authority in advisory mode without changing policy', async () => {
    const providerAuthority = {
      state: 'ready',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      authorityEvidenceRef: 'provider-authority:test',
      service: new Proxy({}, {
        get() {
          throw new Error('advisory transport advanced beyond missing profile authority');
        },
      }),
      close() {},
    } as unknown as ProviderAuthorityRuntimeServiceOpenResult;
    const ingress = new CrossVerifyProductionIngressAuthority({ providerAuthority });
    await expect(ingress.compose({
      projectRoot: '/tmp/provider-free-xverify',
      task: task(),
      result: result(),
      config: config(false),
      operationClass: 'verify-implementation',
      timeoutMs: 120_000,
    })).resolves.toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_execution_profile_unavailable',
      verifierProvider: 'codex',
      verifierModel: expect.any(String),
    });
  });

  it('HOLDs before selector, claim, reservation or dispatch when profile authority is absent', async () => {
    const providerAuthority = {
      state: 'ready',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      authorityEvidenceRef: 'provider-authority:test',
      service: new Proxy({}, {
        get() {
          throw new Error('profile HOLD touched provider stores');
        },
      }),
      close() {},
    } as unknown as ProviderAuthorityRuntimeServiceOpenResult;
    const ingress = new CrossVerifyProductionIngressAuthority({ providerAuthority });
    await expect(ingress.compose({
      projectRoot: '/tmp/provider-free-xverify',
      task: task(),
      result: result(),
      config: config(true),
      operationClass: 'verify-implementation',
      timeoutMs: 120_000,
    })).resolves.toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_execution_profile_unavailable',
      verifierProvider: 'codex',
      verifierModel: expect.any(String),
    });
  });

  it('rejects an exact verifier model owned by another provider before profile resolution', async () => {
    const providerAuthority = {
      state: 'ready',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      authorityEvidenceRef: 'provider-authority:test',
      service: new Proxy({}, {
        get() {
          throw new Error('model mismatch touched provider stores');
        },
      }),
      close() {},
    } as unknown as ProviderAuthorityRuntimeServiceOpenResult;
    const executionProfiles = {
      resolve() {
        throw new Error('model mismatch touched execution profile authority');
      },
    };
    const ingress = new CrossVerifyProductionIngressAuthority({
      providerAuthority,
      executionProfiles,
    });

    await expect(ingress.compose({
      projectRoot: '/tmp/provider-free-xverify',
      task: task(),
      result: result(),
      config: config(true),
      operationClass: 'verify-implementation',
      timeoutMs: 120_000,
      verifierModel: 'claude-fable-5',
    })).resolves.toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_model_scope_mismatch',
    });
  });
});
