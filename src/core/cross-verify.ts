// ─── Cross-Verify Core (XVER-1) ─────────────────────────────────────────────
// Pure decision layer for cross-provider adversarial verification.
//
// Sprint 276 (XVER-1): high-stakes tasks (security/auth · CRITICAL/P0 · risk-tagged)
// can have their result independently RE-VERIFIED by a DIFFERENT provider whose job
// is to REFUTE the result, not confirm it. This module answers two pure questions —
// "is this task high-stakes?" and "which other provider should verify it?" — and
// combines them into a `CrossVerifyDecision`. It performs NO LLM calls and NO process
// spawning: the actual adversarial dispatch lives in Task 7 (cross-verify-runner).
//
// The whole XVER-1 feature is config-gated default-OFF (Task 5). When disabled the
// caller never reaches this module, so behavior is byte-for-byte unchanged.
//
// ADR-008 (one-way imports): this is a core/ module — it imports only core/ types
// and is consumed by orchestra/ (Task 7), never the reverse.

import type { ProviderName, TaskPriority, TaskScope } from './task-types.js';
import type {
  InvocationAuthMode,
  InvocationExecutionBackend,
  InvocationEvidenceState,
  InvocationTransport,
} from './invocation-receipt.js';

// ─── High-stakes detection ──────────────────────────────────────────────────

/**
 * Security/auth keywords that mark a task as high-stakes.
 *
 * Matched with word boundaries (`\b`) so that substrings inside unrelated words do
 * NOT trigger a false positive — critically, "auth" must not match "author" or
 * "authority" (this codebase references the "Authority Matrix" / ADR-037 heavily).
 * `\w*` tails capture morphological variants (vulnerability/vulnerabilities,
 * encrypt/encryption, sanitize/sanitization).
 *
 * Kept local (not imported from intent-classifier's private INTENT_KEYWORDS) because
 * exporting that const is out of this task's scope, and this matcher needs precise
 * boundary semantics rather than the classifier's substring `.includes()` heuristics.
 */
const HIGH_STAKES_PATTERN =
  /\b(?:security|secure|auth|authn|authz|authentication|authorization|oauth|credentials?|password|passwd|secrets?|jwt|csrf|xss|injection|vulnerab\w*|exploit|encrypt\w*|decrypt\w*|cryptograph\w*|crypto|owasp|rbac|acl|sanitiz\w*|privilege)\b/i;

/** Standalone "P0" priority marker (text form of CRITICAL). */
const P0_PATTERN = /\bp0\b/i;

/** Agent id whose presence alone flags a task as security-sensitive. */
const SECURITY_AGENT = 'security-auditor';

/** Risk policy value (carried from an autonomous backlog entry) that flags high-stakes. */
const RISK_POLICY = 'risk-tagged';

/**
 * Structural subset of a {@link Task} that high-stakes detection inspects.
 *
 * Every field is optional so that a full `Task` is assignable AND lightweight test /
 * backlog-derived objects work too. `policy` is NOT a `Task` field today — it is read
 * ONLY when actually present (e.g. on autonomous backlog entries), never fabricated.
 */
export interface HighStakesTaskInput {
  title?: string;
  description?: string;
  scope?: { directories?: string[] } | TaskScope;
  priority?: TaskPriority;
  assignedAgent?: string;
  forceAgent?: string;
  /** Optional risk policy ('risk-tagged') carried from a backlog entry — never invented. */
  policy?: string;
}

/**
 * Decide whether a task is "high-stakes" and therefore a candidate for adversarial
 * cross-provider verification.
 *
 * A task is high-stakes when ANY of these evidence-based signals hold:
 *  - `priority === 'CRITICAL'` (deckent's P0 tier) or a standalone "P0" appears in text
 *  - the assigned/forced agent is `security-auditor`
 *  - `policy === 'risk-tagged'` (when the field is present)
 *  - a security/auth keyword appears in the title, description, or scope directories
 *
 * Pure: no I/O, no side effects, no fabricated signals.
 */
export function isHighStakesTask(task: HighStakesTaskInput): boolean {
  if (task.priority === 'CRITICAL') return true;
  if (task.policy === RISK_POLICY) return true;
  if (task.assignedAgent === SECURITY_AGENT || task.forceAgent === SECURITY_AGENT) return true;

  const directories = task.scope?.directories ?? [];
  const haystack = [task.title ?? '', task.description ?? '', ...directories].join('\n');
  if (P0_PATTERN.test(haystack)) return true;
  return HIGH_STAKES_PATTERN.test(haystack);
}

// ─── Verifier provider selection ────────────────────────────────────────────

/**
 * Default preference order for choosing the verifier provider.
 *
 * Mirrors the Task 5 config default (`verifier_priority: ['codex','gemini','claude']`)
 * with `ollama` appended as a last-resort fallback. Order expresses *preference* only —
 * any available provider different from the task's own provider is acceptable; the
 * priority just decides which one when several qualify.
 */
export const DEFAULT_VERIFIER_PRIORITY: readonly ProviderName[] = ['codex', 'gemini', 'claude', 'ollama'];

/**
 * Host-authority projection for one exact verifier candidate.
 *
 * This is deliberately evidence-shaped rather than registry-shaped: catalog
 * presence, local login and provider configuration are not verifier eligibility.
 * The model is the exact provider API identity already resolved for the source
 * task's capability tier.
 */
export interface VerifierEligibilityCandidate {
  readonly provider: ProviderName;
  readonly model: string;
  readonly auth: {
    readonly mode: InvocationAuthMode;
    readonly accountRefHash: string | null;
  };
  readonly backend: {
    readonly transport: InvocationTransport;
    readonly executionBackend: InvocationExecutionBackend;
    readonly endpointRefHash: string | null;
    readonly executionProfileRef: string;
  };
  readonly reachability: {
    readonly state: InvocationEvidenceState;
    readonly reachable: boolean;
    readonly evidenceRef: string | null;
  };
  readonly limits: {
    readonly state: InvocationEvidenceState;
    readonly limited: boolean;
    readonly evidenceRefs: readonly string[];
  };
}

function hasExactEligibilityEvidence(candidate: VerifierEligibilityCandidate): boolean {
  const hasAccountAuthority = candidate.auth.mode === 'local'
    || candidate.auth.accountRefHash !== null;
  return candidate.model.length > 0
    && candidate.model === candidate.model.trim()
    && hasAccountAuthority
    && candidate.backend.executionBackend !== 'unknown'
    && candidate.backend.executionProfileRef.length > 0
    && candidate.reachability.state === 'known'
    && candidate.reachability.reachable === true
    && candidate.reachability.evidenceRef !== null
    && candidate.limits.state === 'known'
    && candidate.limits.limited === false
    && candidate.limits.evidenceRefs.length > 0;
}

/**
 * Select only from exact, fresh, positive verifier evidence.
 *
 * Duplicate provider projections are ambiguous and therefore ineligible. The
 * caller-supplied priority remains the ordering authority; registration order
 * never participates.
 */
export function selectEligibleVerifierCandidate(
  taskProvider: ProviderName,
  candidates: readonly VerifierEligibilityCandidate[],
  priority: readonly ProviderName[] = DEFAULT_VERIFIER_PRIORITY,
): VerifierEligibilityCandidate | null {
  const counts = new Map<ProviderName, number>();
  for (const candidate of candidates) {
    counts.set(candidate.provider, (counts.get(candidate.provider) ?? 0) + 1);
  }
  const eligible = candidates.filter(candidate =>
    candidate.provider !== taskProvider
    && counts.get(candidate.provider) === 1
    && hasExactEligibilityEvidence(candidate),
  );
  const provider = selectVerifierProvider(
    taskProvider,
    eligible.map(candidate => candidate.provider),
    priority,
  );
  return provider === null
    ? null
    : (eligible.find(candidate => candidate.provider === provider) ?? null);
}

/**
 * Pick a provider DIFFERENT from the one that ran the task, to perform the adversarial
 * re-verification.
 *
 * @param taskProvider       provider that produced the original result
 * @param availableProviders providers actually bootstrapped in this environment (caller-supplied)
 * @param priority           preference order; defaults to {@link DEFAULT_VERIFIER_PRIORITY}
 * @returns the chosen verifier provider, or `null` when no *different* provider is
 *          available (single-provider env → honest-skip; never a silent self-verify)
 *
 * Pure: does not spawn or call anything.
 */
export function selectVerifierProvider(
  taskProvider: ProviderName,
  availableProviders: readonly ProviderName[],
  priority: readonly ProviderName[] = DEFAULT_VERIFIER_PRIORITY,
): ProviderName | null {
  // Distinct providers other than the one that ran the task.
  const candidates = availableProviders.filter(
    (p, i) => p !== taskProvider && availableProviders.indexOf(p) === i,
  );
  if (candidates.length === 0) return null;

  // Prefer the configured priority order; fall back to availability order for any
  // candidate not named in the priority list (e.g. a dynamically-registered provider).
  for (const preferred of priority) {
    if (candidates.includes(preferred)) return preferred;
  }
  // candidates is non-empty here (guarded above); `?? null` only satisfies the
  // compiler's noUncheckedIndexedAccess — it can never actually be undefined.
  return candidates[0] ?? null;
}

// ─── Combined decision ──────────────────────────────────────────────────────

/**
 * Outcome of the cross-verify decision layer. Advisory metadata — `reason` is a
 * developer-facing diagnostic (English default, like `RoutingDecision.reason`), not a
 * user-surface string.
 */
export interface CrossVerifyDecision {
  /** Whether an adversarial cross-verification should be dispatched (Task 7). */
  shouldVerify: boolean;
  /** Provider chosen to perform the adversarial verification (absent when skipping). */
  verifierProvider?: ProviderName;
  /** Exact admitted verifier model when host eligibility evidence was supplied. */
  verifierModel?: string;
  /** Human-readable diagnostic explaining the decision. */
  reason: string;
  /** Stable machine-readable reason; callers must not classify by parsing `reason`. */
  reasonCode: 'selected' | 'not-high-stakes' | 'no-second-provider';
}

/** Inputs to {@link decideCrossVerify}. */
export interface CrossVerifyDecisionInput {
  task: HighStakesTaskInput;
  /** Provider that produced the original task result. */
  taskProvider: ProviderName;
  /** Providers bootstrapped in this environment (caller-supplied). */
  availableProviders: readonly ProviderName[];
  /** Exact authority projections. When supplied, this overrides the legacy provider list. */
  eligibleCandidates?: readonly VerifierEligibilityCandidate[];
  /**
   * When true (default), only high-stakes tasks are eligible for cross-verify.
   * Mirrors config `cross_verify.high_stakes_only` (Task 5, default true).
   */
  highStakesOnly?: boolean;
  /** Verifier preference order (config `cross_verify.verifier_priority`). */
  verifierPriority?: readonly ProviderName[];
}

/**
 * Combine high-stakes detection and verifier selection into a single decision.
 *
 *  - `highStakesOnly` gate fails (task not high-stakes) → `shouldVerify: false`.
 *  - No different provider available → `shouldVerify: false` (honest-skip).
 *  - Otherwise → `shouldVerify: true` with the chosen `verifierProvider`.
 *
 * Pure: composes the two pure helpers above; performs no dispatch.
 */
export function decideCrossVerify(input: CrossVerifyDecisionInput): CrossVerifyDecision {
  const highStakesOnly = input.highStakesOnly ?? true;
  const highStakes = isHighStakesTask(input.task);

  if (highStakesOnly && !highStakes) {
    return {
      shouldVerify: false,
      reason: 'task is not high-stakes; cross-verify skipped',
      reasonCode: 'not-high-stakes',
    };
  }

  const exactCandidate = input.eligibleCandidates
    ? selectEligibleVerifierCandidate(
        input.taskProvider,
        input.eligibleCandidates,
        input.verifierPriority,
      )
    : null;
  const verifierProvider = input.eligibleCandidates
    ? exactCandidate?.provider ?? null
    : selectVerifierProvider(
        input.taskProvider,
        input.availableProviders,
        input.verifierPriority,
      );

  if (verifierProvider === null) {
    return {
      shouldVerify: false,
      reason: 'no second provider available; honest-skip',
      reasonCode: 'no-second-provider',
    };
  }

  return {
    shouldVerify: true,
    verifierProvider,
    ...(exactCandidate ? { verifierModel: exactCandidate.model } : {}),
    reasonCode: 'selected',
    reason: highStakes
      ? `high-stakes task → adversarial cross-verify via ${verifierProvider}`
      : `cross-verify via ${verifierProvider}`,
  };
}
