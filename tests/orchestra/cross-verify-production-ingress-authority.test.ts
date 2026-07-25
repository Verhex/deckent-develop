import { describe, expect, it } from 'vitest';

import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../src/core/provider-authority-composition.js';
import { TaskStatus, type Task, type TaskResult } from '../../src/core/task-types.js';
import {
  CrossVerifyProductionIngressAuthority,
} from '../../src/orchestra/cross-verify-production-ingress-authority.js';

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
  it('touches no provider authority while enforcement is default-off', () => {
    const providerAuthority = new Proxy({}, {
      get() {
        throw new Error('default-off touched provider authority');
      },
    }) as ProviderAuthorityRuntimeServiceOpenResult;
    const ingress = new CrossVerifyProductionIngressAuthority({ providerAuthority });
    expect(ingress.compose({
      projectRoot: '/tmp/provider-free-xverify',
      task: task(),
      result: result(),
      config: config(false),
      operationClass: 'verify-implementation',
      timeoutMs: 120_000,
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_enforcement_disabled',
    });
  });

  it('HOLDs before selector, claim, reservation or dispatch when profile authority is absent', () => {
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
    expect(ingress.compose({
      projectRoot: '/tmp/provider-free-xverify',
      task: task(),
      result: result(),
      config: config(true),
      operationClass: 'verify-implementation',
      timeoutMs: 120_000,
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_execution_profile_unavailable',
    });
  });
});
