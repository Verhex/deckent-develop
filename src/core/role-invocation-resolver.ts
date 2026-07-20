// ─── Role-Aware Provider Fallback Resolution Contract ───────────────────────
//
// One PURE, testable contract shared by all three orchestration roles — Brain,
// Worker, Auditor — for resolving which provider+model actually runs a call,
// given a configured primary, an ordered role/global fallback chain, exact
// cross-provider model equivalence, per-candidate reachability evidence, and
// per-candidate limit state.
//
// Load-bearing invariant (unattended execution): a candidate whose reachability
// or limit evidence is `unknown` / `stale` / `unavailable` is NEVER treated as
// reachable. Only a fresh, KNOWN positive signal (reachable === true /
// limited === false) admits a candidate. Absence of evidence is unknown, never
// "assume available".
//
// The output is decision provenance shaped to drop straight into an
// InvocationReceipt (invocation-receipt.ts): it REUSES that module's vocabulary
// (InvocationEvidenceState, InvocationReasonCode, InvocationSelection,
// InvocationFallbackTransition, InvocationRole, InvocationPurpose) rather than
// defining parallel unions — parallel unions are exactly what would make the
// output *not* "suitable for InvocationReceipt".
//
// This module is the CONTRACT only. It performs no I/O, touches no provider
// registry, and probes nothing — reachability/limit evidence and the ordered
// chain are supplied by the caller. Consumer wiring (Brain planner, worker
// spawner, auditor evaluation) is a separate follow-up and is intentionally NOT
// done here.

import { getEquivalentModel } from './model-equivalence.js';
import type { ModelType, ProviderName } from './task-types.js';
import type {
  InvocationEvidenceState,
  InvocationFallbackTransition,
  InvocationPurpose,
  InvocationReasonCode,
  InvocationRole,
  InvocationSelection,
  InvocationSelectionSource,
} from './invocation-receipt.js';

// ─── Evidence Types ─────────────────────────────────────────────────────────

/**
 * Reachability evidence for ONE provider candidate.
 *
 * `state` is the freshness/confidence of the signal; `reachable` is the signal
 * itself and is only meaningful when `state === 'known'`. A resolver NEVER
 * trusts `reachable` for a non-known state — see {@link isReachabilityUsable}.
 */
export interface ReachabilityEvidence {
  readonly state: InvocationEvidenceState;
  /** Positive signal — trusted ONLY when `state === 'known'`. */
  readonly reachable: boolean;
  /** Opaque pointer to the evidence for the receipt (never a secret/credential). */
  readonly evidenceRef: string | null;
}

/**
 * Rate/usage-limit evidence for ONE provider candidate.
 *
 * `limited === true` means the candidate is at or over a limit (a "hold").
 * Only meaningful when `state === 'known'`.
 */
export interface LimitEvidence {
  readonly state: InvocationEvidenceState;
  /** True = at/over a limit (hold). Trusted ONLY when `state === 'known'`. */
  readonly limited: boolean;
  /** Opaque pointers to the limit evidence for the receipt. */
  readonly evidenceRefs: readonly string[];
}

/** Combined evidence for one provider candidate. */
export interface ProviderEvidence {
  readonly reachability: ReachabilityEvidence;
  readonly limits: LimitEvidence;
}

/** A provider candidate with no evidence at all is fully-unknown — never reachable. */
const UNKNOWN_REACHABILITY: ReachabilityEvidence = { state: 'unknown', reachable: false, evidenceRef: null };
const UNKNOWN_LIMITS: LimitEvidence = { state: 'unknown', limited: false, evidenceRefs: [] };
const UNKNOWN_EVIDENCE: ProviderEvidence = { reachability: UNKNOWN_REACHABILITY, limits: UNKNOWN_LIMITS };

// ─── Role Policy Surface ────────────────────────────────────────────────────

/**
 * Per-role decision policy — the explicit "policy surface" every role
 * (including the Auditor) carries. `acceptableReachability` /
 * `acceptableLimits` are the SOLE evidence-state gate at decision time;
 * `unattended` is only the factory input that produced them, kept for
 * provenance. The two must never be consulted independently, so a drift can
 * never open a bypass.
 */
export interface RoleInvocationPolicy {
  readonly role: InvocationRole;
  /**
   * Autonomous/unattended execution — no human is watching to react to a soft
   * or unknown signal. When true (the default for every orchestration role),
   * only fresh KNOWN evidence admits a candidate.
   */
  readonly unattended: boolean;
  /** Reachability states that MAY be treated as reachable (with `reachable===true`). */
  readonly acceptableReachability: readonly InvocationEvidenceState[];
  /** Limit states that MAY be treated as usable (with `limited===false`). */
  readonly acceptableLimits: readonly InvocationEvidenceState[];
}

/**
 * Build the default policy for a role.
 *
 * Reachability is ALWAYS strict (`['known']`) in both modes — an unknown/stale/
 * unavailable reachability means "cannot reach", so it can never admit a
 * candidate. Under attended execution (`unattended === false`) the LIMIT gate
 * relaxes to also tolerate `unknown` (a human is watching quota); reachability
 * does not. Every role — brain, worker AND auditor — gets a first-class policy
 * from this one factory.
 */
export function defaultRoleInvocationPolicy(
  role: InvocationRole,
  unattended = true,
): RoleInvocationPolicy {
  return {
    role,
    unattended,
    acceptableReachability: ['known'],
    acceptableLimits: unattended ? ['known'] : ['known', 'unknown'],
  };
}

// ─── Request / Result Types ─────────────────────────────────────────────────

/** One candidate in the ordered chain, tagged with its receipt selection source. */
export interface RoleInvocationCandidate {
  readonly provider: ProviderName | string;
  /** 'config' for the configured primary; 'fallback' for every subsequent candidate. */
  readonly source: InvocationSelectionSource;
}

/**
 * Pure input to {@link resolveRoleInvocation}. No registry, no I/O — the ordered
 * chain and all evidence are supplied by the caller. The fallback order is
 * honored EXACTLY as given (configured order); it is never re-sorted by provider
 * registration order.
 */
export interface RoleInvocationRequest {
  readonly role: InvocationRole;
  /** Defaults to the canonical purpose for `role`. */
  readonly purpose?: InvocationPurpose;
  /** Configured primary provider (head of the configured order). */
  readonly primaryProvider: ProviderName | string;
  /** Model the caller wants, in the primary provider's namespace. */
  readonly model: string;
  /**
   * Ordered fallback providers — role chain then global chain, already
   * assembled by the caller. Honored in THIS order.
   */
  readonly fallbackProviders: readonly (ProviderName | string)[];
  /**
   * Evidence keyed by provider name. A provider absent from this map is treated
   * as fully-unknown (never silently reachable).
   */
  readonly evidence: Readonly<Record<string, ProviderEvidence>>;
  /** Role policy; defaults to `defaultRoleInvocationPolicy(role)`. */
  readonly policy?: RoleInvocationPolicy;
}

/** One evaluated candidate — accepted or rejected — with its evidence + reason. */
export interface RoleInvocationAttempt {
  /** 1-based position in the ordered chain. */
  readonly sequence: number;
  readonly provider: ProviderName | string;
  /** Exact resolved model, or null when no equivalent model exists for the candidate. */
  readonly model: string | null;
  readonly source: InvocationSelectionSource;
  readonly reachability: ReachabilityEvidence;
  readonly limits: LimitEvidence;
  readonly accepted: boolean;
  /** 'none' when accepted; the explicit rejection reason otherwise. */
  readonly reasonCode: InvocationReasonCode;
}

/** The chosen provider+model, or null when the chain is exhausted. */
export interface RoleInvocationSelected {
  readonly provider: ProviderName | string;
  readonly model: string;
  readonly source: InvocationSelectionSource;
  readonly sequence: number;
}

/**
 * Full decision provenance. `attempts`/`rejected`/`selected`/`decisionReasonCode`
 * are the human-facing record; `configured`/`resolved`/`fallbackChain`/
 * `reachability`/`limits` are receipt-ready projections that drop straight into
 * an {@link InvocationReceipt}.
 */
export interface RoleInvocationResolution {
  readonly role: InvocationRole;
  readonly purpose: InvocationPurpose;
  readonly policy: RoleInvocationPolicy;
  /** The chosen candidate, or null when no candidate was reachable+unlimited. */
  readonly selected: RoleInvocationSelected | null;
  /** Every candidate evaluated, in order (accepted + rejected). */
  readonly attempts: readonly RoleInvocationAttempt[];
  /** Rejected subset — a convenience view over `attempts`. */
  readonly rejected: readonly RoleInvocationAttempt[];
  /** 'none' when selected; 'fallback_exhausted' when nothing passed. */
  readonly decisionReasonCode: InvocationReasonCode;

  // Receipt-ready projections ------------------------------------------------
  readonly configured: InvocationSelection;
  readonly resolved: InvocationSelection;
  readonly fallbackChain: readonly InvocationFallbackTransition[];
  readonly reachability: { readonly state: InvocationEvidenceState; readonly evidenceRef: string | null };
  readonly limits: { readonly state: InvocationEvidenceState; readonly evidenceRefs: readonly string[] };
}

// ─── Canonical role → purpose map ───────────────────────────────────────────
const ROLE_PURPOSE: Record<InvocationRole, InvocationPurpose> = {
  brain: 'sprint-planning',
  worker: 'worker-execution',
  auditor: 'audit-evaluation',
};

// ─── Evidence Gates (the crux) ──────────────────────────────────────────────
// Each gate checks the STATE membership FIRST, then the positive signal. An
// `unknown`/`stale`/`unavailable` state fails the membership check before its
// (untrusted) `reachable`/`limited` value is ever read — so a degenerate
// `{ state: 'unknown', reachable: true }` can NEVER admit a candidate.

/** True only when the reachability evidence positively admits the candidate. */
export function isReachabilityUsable(ev: ReachabilityEvidence, policy: RoleInvocationPolicy): boolean {
  if (!policy.acceptableReachability.includes(ev.state)) return false;
  return ev.reachable === true;
}

/** True only when the limit evidence positively admits the candidate. */
export function isLimitUsable(ev: LimitEvidence, policy: RoleInvocationPolicy): boolean {
  if (!policy.acceptableLimits.includes(ev.state)) return false;
  return ev.limited === false;
}

// ─── The Contract ───────────────────────────────────────────────────────────

/**
 * Resolve the role's provider+model through the ordered fallback chain.
 *
 * TOTAL function — it NEVER throws on the resolution path. A reachable candidate
 * is always selected (never a loud failure); when NO candidate is reachable the
 * result carries `selected: null` + `decisionReasonCode: 'fallback_exhausted'`
 * with every rejected attempt recorded. A candidate whose provider has no
 * tier-equivalent model becomes a `validation_failed` rejected attempt rather
 * than a thrown error.
 */
export function resolveRoleInvocation(request: RoleInvocationRequest): RoleInvocationResolution {
  const role = request.role;
  const purpose = request.purpose ?? ROLE_PURPOSE[role];
  const policy = request.policy ?? defaultRoleInvocationPolicy(role);

  // Configured order: primary first, then the caller's fallback chain verbatim.
  const candidates: RoleInvocationCandidate[] = [
    { provider: request.primaryProvider, source: 'config' },
    ...request.fallbackProviders.map(
      (p): RoleInvocationCandidate => ({ provider: p, source: 'fallback' }),
    ),
  ];

  const configured: InvocationSelection = {
    provider: request.primaryProvider,
    model: request.model,
    source: 'config',
    reasonCode: 'none',
  };

  const attempts: RoleInvocationAttempt[] = [];
  let selectedAttempt: RoleInvocationAttempt | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const evidence = request.evidence[String(candidate.provider)] ?? UNKNOWN_EVIDENCE;

    // Exact model equivalence. The primary keeps its configured model; a
    // fallback remaps via cross-provider tier equivalence. A provider with no
    // equivalent model is a rejected attempt, never a thrown error.
    let model: string | null;
    try {
      model =
        candidate.source === 'config'
          ? request.model
          : getEquivalentModel(request.model as ModelType, candidate.provider as ProviderName);
    } catch {
      model = null;
    }

    let accepted = false;
    let reasonCode: InvocationReasonCode;
    if (model === null) {
      reasonCode = 'validation_failed';
    } else if (!isReachabilityUsable(evidence.reachability, policy)) {
      reasonCode = 'fallback_unreachable';
    } else if (!isLimitUsable(evidence.limits, policy)) {
      reasonCode = 'fallback_limit_hold';
    } else {
      accepted = true;
      reasonCode = 'none';
    }

    const attempt: RoleInvocationAttempt = {
      sequence: i + 1,
      provider: candidate.provider,
      model,
      source: candidate.source,
      reachability: evidence.reachability,
      limits: evidence.limits,
      accepted,
      reasonCode,
    };
    attempts.push(attempt);

    if (accepted) {
      selectedAttempt = attempt;
      break;
    }
  }

  // fallbackChain: one transition per boundary crossed — from each rejected
  // candidate to the next one tried, carrying the from-candidate's reason and
  // evidence refs. When a candidate is accepted the loop above stops, so every
  // pair here is (rejected → next).
  const fallbackChain: InvocationFallbackTransition[] = [];
  for (let i = 0; i < attempts.length - 1; i++) {
    const from = attempts[i]!;
    const to = attempts[i + 1]!;
    fallbackChain.push({
      sequence: fallbackChain.length + 1,
      fromProvider: from.provider,
      fromModel: from.model,
      toProvider: to.provider,
      toModel: to.model ?? 'unknown',
      reasonCode: from.reasonCode,
      reachabilityRef: from.reachability.evidenceRef,
      limitEvidenceRefs: from.limits.evidenceRefs,
    });
  }

  const selected: RoleInvocationSelected | null = selectedAttempt
    ? {
        provider: selectedAttempt.provider,
        model: selectedAttempt.model!,
        source: selectedAttempt.source,
        sequence: selectedAttempt.sequence,
      }
    : null;

  const decisionReasonCode: InvocationReasonCode = selectedAttempt ? 'none' : 'fallback_exhausted';

  const resolved: InvocationSelection = selectedAttempt
    ? {
        provider: selectedAttempt.provider,
        model: selectedAttempt.model,
        source: selectedAttempt.source,
        reasonCode: selectedAttempt.source === 'fallback' ? 'provider_resolution_fallback' : 'none',
      }
    : { provider: null, model: null, source: 'none', reasonCode: 'fallback_exhausted' };

  // Descriptive provenance (NOT a second gate): the terminal candidate's
  // evidence — the selected one, else the last one evaluated.
  const terminal = selectedAttempt ?? attempts[attempts.length - 1];
  const reachability = terminal
    ? { state: terminal.reachability.state, evidenceRef: terminal.reachability.evidenceRef }
    : { state: 'unknown' as InvocationEvidenceState, evidenceRef: null };
  const limits = terminal
    ? { state: terminal.limits.state, evidenceRefs: terminal.limits.evidenceRefs }
    : { state: 'unknown' as InvocationEvidenceState, evidenceRefs: [] };

  return {
    role,
    purpose,
    policy,
    selected,
    attempts,
    rejected: attempts.filter((a) => !a.accepted),
    decisionReasonCode,
    configured,
    resolved,
    fallbackChain,
    reachability,
    limits,
  };
}
