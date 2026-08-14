import { describe, expect, it, vi } from 'vitest';

import {
  isProviderExecutionIngressHoldError,
  preflightProviderExecutionIngress,
  preflightProviderRoleExecutionIngress,
  ProviderExecutionIngressHoldError,
} from '../../src/core/provider-execution-ingress-authority.js';

const REQUEST = Object.freeze({
  runId: 'run-ingress-0001',
  taskId: 'task-ingress-0001',
  provider: 'claude',
  model: 'claude-sonnet-5',
  configuredBackend: 'docker',
  fallbackProviders: Object.freeze(['codex']),
  unattended: true,
});

describe('preflightProviderExecutionIngress', () => {
  it('classifies both native and cross-realm-shaped authority HOLD errors', () => {
    const request = {
      ...REQUEST,
      role: 'worker' as const,
      purpose: 'worker-execution' as const,
    };
    expect(isProviderExecutionIngressHoldError(
      new ProviderExecutionIngressHoldError('authority_unavailable', ['evidence:1'], request),
    )).toBe(true);
    expect(isProviderExecutionIngressHoldError({
      code: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      reasonCode: 'authority_unavailable',
      authorityEvidenceRefs: ['evidence:1'],
      request,
    })).toBe(true);
    expect(isProviderExecutionIngressHoldError({
      code: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      reasonCode: 'authority_unavailable',
    })).toBe(false);
  });

  it('preserves the separately gated default when no authored authority is injected', () => {
    expect(preflightProviderExecutionIngress(undefined, REQUEST)).toEqual({
      decision: 'not-configured',
    });
  });

  it('projects an authority-open HOLD with an exact opaque ingress evidence ref', () => {
    const authority = {
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      retryable: false,
      close: vi.fn(),
    } as const;

    const first = preflightProviderExecutionIngress(authority, REQUEST);
    const second = preflightProviderExecutionIngress(authority, REQUEST);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      decision: 'hold',
      reasonCode: 'policy_authority_unavailable',
      authorityEvidenceRefs: [
        authority.authorityEvidenceRef,
        expect.stringMatching(/^provider-execution-ingress:[a-f0-9]{64}$/u),
      ],
    });
  });

  it('passes a healthy composition as ready WITHOUT running the role admission', () => {
    const admit = vi.fn();
    const authority = {
      state: 'ready',
      tenantId: 'local',
      projectId: 'project-ingress-0001',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      service: { roleAdmissionRuntime: { admit } },
      close: vi.fn(),
    } as never;

    const first = preflightProviderExecutionIngress(authority, REQUEST);
    const second = preflightProviderExecutionIngress(authority, REQUEST);

    // The front door checks composition health only: the real, candidate-bound
    // admission runs at the stage where the exact candidate/backend resolves.
    expect(admit).not.toHaveBeenCalled();
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      decision: 'ready',
      authorityEvidenceRefs: [
        `provider-authority:${'a'.repeat(64)}`,
        expect.stringMatching(/^provider-execution-ingress:[a-f0-9]{64}$/u),
      ],
    });
  });

  it('grants no role an execution permit — Brain preflight is composition health only', () => {
    const admit = vi.fn();
    const authority = {
      state: 'ready',
      tenantId: 'local',
      projectId: 'project-ingress-0001',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      service: { roleAdmissionRuntime: { admit } },
      close: vi.fn(),
    } as never;

    const result = preflightProviderRoleExecutionIngress(authority, {
      ...REQUEST,
      role: 'brain',
      purpose: 'sprint-planning',
      configuredBackend: 'unresolved-before-provider-bootstrap',
    });

    expect(admit).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      decision: 'ready',
      authorityEvidenceRefs: [
        `provider-authority:${'a'.repeat(64)}`,
        expect.stringMatching(/^provider-execution-ingress:[a-f0-9]{64}$/u),
      ],
    });
    // The pre-fix behaviour (empty-candidate admission → permanent
    // candidate_authority_unavailable) must never come back.
    expect(JSON.stringify(result)).not.toContain('candidate_authority_unavailable');
  });
});
