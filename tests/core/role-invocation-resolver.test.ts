import { describe, it, expect } from 'vitest';
import {
  resolveRoleInvocation,
  defaultRoleInvocationPolicy,
  isReachabilityUsable,
  isLimitUsable,
} from '../../src/core/role-invocation-resolver.js';
import type {
  ProviderEvidence,
  ReachabilityEvidence,
  LimitEvidence,
  RoleInvocationRequest,
} from '../../src/core/role-invocation-resolver.js';
import type { InvocationEvidenceState, InvocationRole } from '../../src/core/invocation-receipt.js';

// ─── Evidence builders ─────────────────────────────────────────────────────

function reach(
  state: InvocationEvidenceState,
  reachable: boolean,
  evidenceRef: string | null = `reach:${state}`,
): ReachabilityEvidence {
  return { state, reachable, evidenceRef };
}

function limit(
  state: InvocationEvidenceState,
  limited: boolean,
  evidenceRefs: string[] = [`limit:${state}`],
): LimitEvidence {
  return { state, limited, evidenceRefs };
}

/** Fully healthy, known-reachable, known-unlimited evidence. */
function healthy(refPrefix = 'ok'): ProviderEvidence {
  return {
    reachability: reach('known', true, `${refPrefix}:reach`),
    limits: limit('known', false, [`${refPrefix}:limit`]),
  };
}

function ev(reachability: ReachabilityEvidence, limits: LimitEvidence): ProviderEvidence {
  return { reachability, limits };
}

const NON_STANDARD_STATES: InvocationEvidenceState[] = ['unknown', 'stale', 'unavailable'];

// ─── Primary selection ─────────────────────────────────────────────────────

describe('resolveRoleInvocation — primary selected', () => {
  it('selects the configured primary when it is known-reachable and unlimited', () => {
    const res = resolveRoleInvocation({
      role: 'brain',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: ['codex'],
      evidence: { claude: healthy('claude'), codex: healthy('codex') },
    });

    expect(res.selected).not.toBeNull();
    expect(res.selected!.provider).toBe('claude');
    expect(res.selected!.model).toBe('claude-opus-4-8');
    expect(res.selected!.source).toBe('config');
    expect(res.decisionReasonCode).toBe('none');
    expect(res.resolved.reasonCode).toBe('none');
    expect(res.resolved.source).toBe('config');
    // primary won → no transitions, only one attempt evaluated (fallback not probed)
    expect(res.fallbackChain).toHaveLength(0);
    expect(res.attempts).toHaveLength(1);
    expect(res.rejected).toHaveLength(0);
    expect(res.attempts[0]!.accepted).toBe(true);
  });

  it('never throws when a reachable candidate exists (no loud failure)', () => {
    expect(() =>
      resolveRoleInvocation({
        role: 'worker',
        primaryProvider: 'claude',
        model: 'claude-sonnet-5',
        fallbackProviders: [],
        evidence: { claude: healthy() },
      }),
    ).not.toThrow();
  });
});

// ─── Fallback on unreachable / limit-hold ──────────────────────────────────

describe('resolveRoleInvocation — fallback transitions', () => {
  it('falls back to the next provider when the primary is known-unreachable', () => {
    const res = resolveRoleInvocation({
      role: 'worker',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: ['codex'],
      evidence: {
        claude: ev(reach('known', false, 'claude:down'), limit('known', false)),
        codex: healthy('codex'),
      },
    });

    expect(res.selected!.provider).toBe('codex');
    expect(res.selected!.source).toBe('fallback');
    // Exact model equivalence: opus (premium) → the designated Codex premium
    // model. Fallback dispatches a billed model, so this assertion audits it.
    expect(res.selected!.model).toBe('gpt-5.5');
    expect(res.resolved.source).toBe('fallback');
    expect(res.resolved.reasonCode).toBe('provider_resolution_fallback');

    expect(res.attempts[0]!.accepted).toBe(false);
    expect(res.attempts[0]!.reasonCode).toBe('fallback_unreachable');
    expect(res.fallbackChain).toHaveLength(1);
    const t = res.fallbackChain[0]!;
    expect(t.fromProvider).toBe('claude');
    expect(t.toProvider).toBe('codex');
    expect(t.reasonCode).toBe('fallback_unreachable');
    expect(t.reachabilityRef).toBe('claude:down');
  });

  it('falls back with reason fallback_limit_hold when the primary is at its limit', () => {
    const res = resolveRoleInvocation({
      role: 'brain',
      primaryProvider: 'claude',
      model: 'claude-sonnet-5',
      fallbackProviders: ['codex'],
      evidence: {
        claude: ev(reach('known', true), limit('known', true, ['claude:429'])),
        codex: healthy('codex'),
      },
    });

    expect(res.attempts[0]!.reasonCode).toBe('fallback_limit_hold');
    expect(res.selected!.provider).toBe('codex');
    // sonnet (standard) → designated codex standard model (MASTER-PLAN 670).
    // Notably this replaces `gpt-4.1`, which the active ChatGPT account is
    // measured to refuse outright (sprint-460, HTTP 400).
    expect(res.selected!.model).toBe('gpt-5.6-terra');
    expect(res.fallbackChain[0]!.reasonCode).toBe('fallback_limit_hold');
    expect(res.fallbackChain[0]!.limitEvidenceRefs).toEqual(['claude:429']);
  });

  it('remaps economy-tier model on fallback (haiku → gpt-5.6-luna)', () => {
    const res = resolveRoleInvocation({
      role: 'worker',
      primaryProvider: 'claude',
      model: 'claude-haiku-4-5-20251001',
      fallbackProviders: ['codex'],
      evidence: {
        claude: ev(reach('known', false), limit('known', false)),
        codex: healthy(),
      },
    });
    expect(res.selected!.model).toBe('gpt-5.6-luna');
  });
});

// ─── THE CRUX: unknown/stale/unavailable are never reachable ───────────────

describe('resolveRoleInvocation — unknown/stale/unavailable is never reachable (unattended)', () => {
  it.each(NON_STANDARD_STATES)(
    'rejects a candidate with reachability state=%s even when reachable:true (degenerate trap)',
    (state) => {
      const res = resolveRoleInvocation({
        role: 'auditor',
        primaryProvider: 'claude',
        model: 'claude-opus-4-8',
        fallbackProviders: [],
        // reachable:true is a LIE for a non-known state — must NOT be trusted
        evidence: { claude: ev(reach(state, true), limit('known', false)) },
      });
      expect(res.selected).toBeNull();
      expect(res.decisionReasonCode).toBe('fallback_exhausted');
      expect(res.attempts[0]!.reasonCode).toBe('fallback_unreachable');
    },
  );

  it.each(NON_STANDARD_STATES)(
    'rejects a candidate with limit state=%s even when limited:false (unknown-limit != available)',
    (state) => {
      const res = resolveRoleInvocation({
        role: 'brain',
        primaryProvider: 'claude',
        model: 'claude-opus-4-8',
        fallbackProviders: [],
        evidence: { claude: ev(reach('known', true), limit(state, false)) },
      });
      expect(res.selected).toBeNull();
      expect(res.attempts[0]!.reasonCode).toBe('fallback_limit_hold');
    },
  );

  it('treats a provider absent from the evidence map as fully-unknown (rejected)', () => {
    const res = resolveRoleInvocation({
      role: 'worker',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: [],
      evidence: {}, // no entry for claude
    });
    expect(res.selected).toBeNull();
    expect(res.attempts[0]!.reachability.state).toBe('unknown');
    expect(res.attempts[0]!.reasonCode).toBe('fallback_unreachable');
  });

  it('the raw gate helpers reject non-known states with a positive signal', () => {
    const policy = defaultRoleInvocationPolicy('brain');
    for (const state of NON_STANDARD_STATES) {
      expect(isReachabilityUsable(reach(state, true), policy)).toBe(false);
      expect(isLimitUsable(limit(state, false), policy)).toBe(false);
    }
    expect(isReachabilityUsable(reach('known', true), policy)).toBe(true);
    expect(isReachabilityUsable(reach('known', false), policy)).toBe(false);
    expect(isLimitUsable(limit('known', false), policy)).toBe(true);
    expect(isLimitUsable(limit('known', true), policy)).toBe(false);
  });
});

// ─── Exhaustion (never throws) ─────────────────────────────────────────────

describe('resolveRoleInvocation — exhaustion is structured, not a throw', () => {
  it('returns selected:null + fallback_exhausted when no candidate is reachable', () => {
    let res!: ReturnType<typeof resolveRoleInvocation>;
    expect(() => {
      res = resolveRoleInvocation({
        role: 'brain',
        primaryProvider: 'claude',
        model: 'claude-opus-4-8',
        fallbackProviders: ['codex', 'gemini'],
        evidence: {
          claude: ev(reach('known', false), limit('known', false)),
          codex: ev(reach('unavailable', false), limit('known', false)),
          gemini: ev(reach('known', true), limit('known', true)),
        },
      });
    }).not.toThrow();

    expect(res.selected).toBeNull();
    expect(res.decisionReasonCode).toBe('fallback_exhausted');
    expect(res.resolved.provider).toBeNull();
    expect(res.resolved.reasonCode).toBe('fallback_exhausted');
    // all 3 candidates evaluated + rejected, 2 boundary transitions recorded
    expect(res.attempts).toHaveLength(3);
    expect(res.rejected).toHaveLength(3);
    expect(res.fallbackChain).toHaveLength(2);
    expect(res.attempts.map((a) => a.reasonCode)).toEqual([
      'fallback_unreachable',
      'fallback_unreachable',
      'fallback_limit_hold',
    ]);
  });
});

// ─── No equivalent model → validation_failed (not a throw) ─────────────────

describe('resolveRoleInvocation — model equivalence', () => {
  it('rejects a fallback with no equivalent model as validation_failed (model check precedes evidence)', () => {
    const res = resolveRoleInvocation({
      role: 'worker',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      // 'nonexistent-xyz' has no tier-equivalent model → getEquivalentModel throws
      fallbackProviders: ['nonexistent-xyz'],
      evidence: {
        claude: ev(reach('known', false), limit('known', false)),
        // reachable — proves validation_failed wins over the evidence gates
        'nonexistent-xyz': healthy(),
      },
    });

    expect(res.selected).toBeNull();
    const fallbackAttempt = res.attempts[1]!;
    expect(fallbackAttempt.provider).toBe('nonexistent-xyz');
    expect(fallbackAttempt.model).toBeNull();
    expect(fallbackAttempt.reasonCode).toBe('validation_failed');
  });

  it('the configured primary keeps its model verbatim (no equivalence remap)', () => {
    const res = resolveRoleInvocation({
      role: 'brain',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: [],
      evidence: { claude: healthy() },
    });
    expect(res.attempts[0]!.model).toBe('claude-opus-4-8');
  });
});

// ─── Configured order is authoritative ─────────────────────────────────────

describe('resolveRoleInvocation — configured order is honored (never re-sorted)', () => {
  it('picks the FIRST reachable candidate in the given order, not any other', () => {
    const evidence = {
      claude: ev(reach('known', false), limit('known', false)), // primary down
      codex: healthy('codex'),
      gemini: healthy('gemini'),
    };

    const first = resolveRoleInvocation({
      role: 'brain',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: ['codex', 'gemini'],
      evidence,
    });
    expect(first.selected!.provider).toBe('codex');

    // Reverse the CONFIGURED order → gemini wins. The resolver honors input
    // order; it does not impose any registry/alphabetical order of its own.
    const reversed = resolveRoleInvocation({
      role: 'brain',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: ['gemini', 'codex'],
      evidence,
    });
    expect(reversed.selected!.provider).toBe('gemini');
  });
});

// ─── All three roles + policy surface ──────────────────────────────────────

describe('resolveRoleInvocation — all three roles resolve through one contract', () => {
  const ROLES: InvocationRole[] = ['brain', 'worker', 'auditor'];
  const PURPOSE: Record<InvocationRole, string> = {
    brain: 'sprint-planning',
    worker: 'worker-execution',
    auditor: 'audit-evaluation',
  };

  it.each(ROLES)('resolves role=%s with the canonical purpose and its own policy', (role) => {
    const res = resolveRoleInvocation({
      role,
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: ['codex'],
      evidence: { claude: healthy(), codex: healthy() },
    });
    expect(res.role).toBe(role);
    expect(res.purpose).toBe(PURPOSE[role]);
    expect(res.policy.role).toBe(role);
    expect(res.selected!.provider).toBe('claude');
  });

  it('gives the auditor a first-class, strict-by-default policy surface', () => {
    const policy = defaultRoleInvocationPolicy('auditor');
    expect(policy.role).toBe('auditor');
    expect(policy.unattended).toBe(true);
    expect(policy.acceptableReachability).toEqual(['known']);
    expect(policy.acceptableLimits).toEqual(['known']);
  });
});

// ─── Attended policy relaxation (lists are the sole gate) ──────────────────

describe('resolveRoleInvocation — attended policy relaxes limits only, never reachability', () => {
  it('attended: tolerates an unknown LIMIT but still rejects an unknown REACHABILITY', () => {
    const attended = defaultRoleInvocationPolicy('brain', /* unattended */ false);
    expect(attended.acceptableLimits).toEqual(['known', 'unknown']);
    expect(attended.acceptableReachability).toEqual(['known']);

    // unknown limit + known-reachable → admitted under attended policy
    const okLimit = resolveRoleInvocation({
      role: 'brain',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: [],
      policy: attended,
      evidence: { claude: ev(reach('known', true), limit('unknown', false)) },
    });
    expect(okLimit.selected!.provider).toBe('claude');

    // unknown reachability is STILL rejected — reachability never opens
    const badReach = resolveRoleInvocation({
      role: 'brain',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: [],
      policy: attended,
      evidence: { claude: ev(reach('unknown', true), limit('known', false)) },
    });
    expect(badReach.selected).toBeNull();
    expect(badReach.attempts[0]!.reasonCode).toBe('fallback_unreachable');
  });
});

// ─── Receipt-ready projection shape ────────────────────────────────────────

describe('resolveRoleInvocation — receipt-ready provenance shape', () => {
  it('exposes configured/resolved selections, fallbackChain, reachability + limits', () => {
    const res = resolveRoleInvocation({
      role: 'brain',
      primaryProvider: 'claude',
      model: 'claude-opus-4-8',
      fallbackProviders: ['codex'],
      evidence: {
        claude: ev(reach('known', false, 'c:down'), limit('known', false, ['c:lim'])),
        codex: healthy('cx'),
      },
    });

    // configured is always the primary as authored
    expect(res.configured).toEqual({
      provider: 'claude',
      model: 'claude-opus-4-8',
      source: 'config',
      reasonCode: 'none',
    });
    // resolved reflects the selected fallback
    expect(res.resolved.provider).toBe('codex');
    expect(res.resolved.model).toBe('gpt-5.5');
    // top-level reachability/limits describe the terminal (selected) candidate
    expect(res.reachability.state).toBe('known');
    expect(res.reachability.evidenceRef).toBe('cx:reach');
    expect(res.limits.state).toBe('known');
    expect(res.limits.evidenceRefs).toEqual(['cx:limit']);
    // transition carries the from-candidate's evidence refs
    const t = res.fallbackChain[0]!;
    expect(t.reachabilityRef).toBe('c:down');
    expect(t.limitEvidenceRefs).toEqual(['c:lim']);
    expect(typeof t.sequence).toBe('number');
  });

  it('type-checks as a request literal without any casts', () => {
    const request: RoleInvocationRequest = {
      role: 'worker',
      primaryProvider: 'claude',
      model: 'claude-sonnet-5',
      fallbackProviders: ['codex'],
      evidence: { claude: healthy() },
    };
    expect(resolveRoleInvocation(request).selected!.provider).toBe('claude');
  });
});
