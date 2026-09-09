import { describe, expect, it, vi } from 'vitest';
import { resolveGoalPurposeAdmissionPolicy } from '../../../../src/core/execution-budget-policy.js';
import type { HostRoleInvocationAdmissionRequest } from '../../../../src/core/host-role-invocation-admission-runtime.js';
import { defaultRoleInvocationPolicy } from '../../../../src/core/role-invocation-resolver.js';
import { admitGoalInvocation } from '../../../../src/orchestra/autonomous/mission-store/goal-invocation-admission-authority.js';
import { GoalInvocationHeldError } from '../../../../src/orchestra/autonomous/mission-store/goal-mission.js';

const goalPolicy = {
  roles: { brain: { default: { maxTokens: 1_000, maxTurns: 8 } } },
  landing: { reserve_ratio: 0.25 },
  final_only_usage: { action: 'allow-wall-clock-containment' as const, roles: ['brain'], max_wall_clock_seconds: 120 },
  purposes: { 'goal-authoring': { maxTokens: 400, maxTurns: 2 } },
  purpose_admission: {
    'goal-authoring': {
      non_reservable_subscription: 'allow-role-ceiling' as const,
      max_tokens: 400,
      max_wall_clock_seconds: 90,
    },
  },
};

function readyProjection() {
  return {
    state: 'ready' as const,
    candidate: {
      provider: 'claude',
      model: 'claude-fable-5',
      reachability: { state: 'known' as const, reachable: true, evidenceRef: 'reachability:test-0001' },
      limits: { state: 'known' as const, limited: false, evidenceRefs: ['limit:test-0001'] },
    },
    authority: {
      provider: 'claude',
      model: 'claude-fable-5',
      reachabilityQuery: {} as never,
      limitQuery: {} as never,
    },
    requiredWindows: [{ windowId: 'weekly', unit: 'percent' as const, model: null }],
    expiresAt: '2026-07-20T01:00:00.000Z',
    authorityEvidenceRef: 'host-role-admission:test',
  };
}

function admissionRequest(): HostRoleInvocationAdmissionRequest {
  return {
    invocation: {
      role: 'brain',
      purpose: 'goal-authoring',
      primaryProvider: 'claude',
      model: 'claude-fable-5',
      fallbackProviders: [],
      policy: defaultRoleInvocationPolicy('brain'),
    },
    candidates: { claude: {} as never },
    buildReservation: vi.fn(() => {
      throw new Error('buildReservation must not run on non-reservable arm');
    }),
  };
}

describe('admitGoalInvocation', () => {
  it('delegates byte-identically to admissionRuntime.admit when estimates are ready', () => {
    const allowed = { decision: 'allow', reservation: { reservationId: 'res-1' } } as never;
    const admit = vi.fn(() => allowed);
    const admission = admissionRequest();
    const buildReservation = vi.fn(() => ({ reservationId: 'res-1' }));
    admission.buildReservation = buildReservation;
    const result = admitGoalInvocation({
      admissionRuntime: { admit } as never,
      admission,
      estimates: { state: 'ready', estimates: [{ windowId: 'tokens', unit: 'tokens', amount: 10 }], evidenceRefs: ['execution-budget-policy:abc'] },
      projection: readyProjection(),
      authMode: 'subscription',
      purposeAdmission: resolveGoalPurposeAdmissionPolicy({ policy: goalPolicy, purpose: 'goal-authoring' }),
      provider: 'claude',
      model: 'claude-fable-5',
    });
    expect(admit).toHaveBeenCalledWith(admission);
    expect(buildReservation).not.toHaveBeenCalled();
    expect(result).toBe(allowed);
  });

  it('admits non-reservable subscription without calling buildReservation', () => {
    const admit = vi.fn(() => {
      throw new Error('admit must not run on non-reservable arm');
    });
    const admission = admissionRequest();
    const result = admitGoalInvocation({
      admissionRuntime: { admit } as never,
      admission,
      estimates: { state: 'hold', reasonCode: 'goal_invocation_budget_unit_unsupported' },
      projection: readyProjection(),
      authMode: 'subscription',
      purposeAdmission: resolveGoalPurposeAdmissionPolicy({ policy: goalPolicy, purpose: 'goal-authoring' }),
      provider: 'claude',
      model: 'claude-fable-5',
    });
    expect(admit).not.toHaveBeenCalled();
    expect(admission.buildReservation).not.toHaveBeenCalled();
    expect(result.decision).toBe('non_reservable_subscription');
    if (result.decision === 'non_reservable_subscription') {
      expect(result.reservation).toBeNull();
      expect(result.basis.ownerBoundRef).toBe('config:execution_budget.purpose_admission.goal-authoring');
      expect(result.resolution.role).toBe('brain');
      expect(result.resolution.purpose).toBe('goal-authoring');
    }
  });

  it('holds when purpose admission is missing', () => {
    expect(() => admitGoalInvocation({
      admissionRuntime: { admit: vi.fn() } as never,
      admission: admissionRequest(),
      estimates: { state: 'hold', reasonCode: 'goal_invocation_budget_unit_unsupported' },
      projection: readyProjection(),
      authMode: 'subscription',
      purposeAdmission: resolveGoalPurposeAdmissionPolicy({ policy: { ...goalPolicy, purpose_admission: undefined }, purpose: 'goal-authoring' }),
      provider: 'claude',
      model: 'claude-fable-5',
    })).toThrow(GoalInvocationHeldError);
    try {
      admitGoalInvocation({
        admissionRuntime: { admit: vi.fn() } as never,
        admission: admissionRequest(),
        estimates: { state: 'hold', reasonCode: 'goal_invocation_budget_unit_unsupported' },
        projection: readyProjection(),
        authMode: 'subscription',
        purposeAdmission: resolveGoalPurposeAdmissionPolicy({ policy: { ...goalPolicy, purpose_admission: undefined }, purpose: 'goal-authoring' }),
        provider: 'claude',
        model: 'claude-fable-5',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(GoalInvocationHeldError);
      expect((error as GoalInvocationHeldError).hold.reasonCode).toBe('reservation_not_executable');
      expect((error as GoalInvocationHeldError).hold.providerAuthorityReasonCode).toBe('goal_limit_unit_unreservable');
      expect((error as GoalInvocationHeldError).hold.evidenceRefs[0]).toMatch(/^goal-purpose-admission:/u);
    }
  });

  it('holds percent windows under api authMode', () => {
    expect(() => admitGoalInvocation({
      admissionRuntime: { admit: vi.fn() } as never,
      admission: admissionRequest(),
      estimates: { state: 'hold', reasonCode: 'goal_invocation_budget_unit_unsupported' },
      projection: readyProjection(),
      authMode: 'api',
      purposeAdmission: resolveGoalPurposeAdmissionPolicy({ policy: goalPolicy, purpose: 'goal-authoring' }),
      provider: 'claude',
      model: 'claude-fable-5',
    })).toThrow(GoalInvocationHeldError);
  });

  it('holds when projection authority provider mismatches caller provider', () => {
    const projection = readyProjection();
    projection.authority = { ...projection.authority, provider: 'codex' };
    expect(() => admitGoalInvocation({
      admissionRuntime: { admit: vi.fn() } as never,
      admission: admissionRequest(),
      estimates: { state: 'hold', reasonCode: 'goal_invocation_budget_unit_unsupported' },
      projection,
      authMode: 'subscription',
      purposeAdmission: resolveGoalPurposeAdmissionPolicy({ policy: goalPolicy, purpose: 'goal-authoring' }),
      provider: 'claude',
      model: 'claude-fable-5',
    })).toThrow(GoalInvocationHeldError);
  });

  it('holds when purpose admission policy is hold', () => {
    const holdPolicy = {
      ...goalPolicy,
      purpose_admission: {
        'goal-authoring': {
          non_reservable_subscription: 'hold' as const,
          max_tokens: 400,
          max_wall_clock_seconds: 90,
        },
      },
    };
    expect(() => admitGoalInvocation({
      admissionRuntime: { admit: vi.fn() } as never,
      admission: admissionRequest(),
      estimates: { state: 'hold', reasonCode: 'goal_invocation_budget_unit_unsupported' },
      projection: readyProjection(),
      authMode: 'subscription',
      purposeAdmission: resolveGoalPurposeAdmissionPolicy({ policy: holdPolicy, purpose: 'goal-authoring' }),
      provider: 'claude',
      model: 'claude-fable-5',
    })).toThrow(GoalInvocationHeldError);
  });
});
