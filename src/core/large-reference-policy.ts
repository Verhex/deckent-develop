import { ExecutionBudgetPolicyError } from './execution-budget-policy.js';

/** Native large-reference admission. Disabled until owner acceptance enables it. */
export interface LargeReferencePolicy {
  enabled: boolean;
  maxSourceBytes: number;
  maxReferences: number;
  maxWallTimeMs: number;
  maxRequests: number;
  maxDepth: number;
  maxMapOutputTokens: number;
  maxReduceOutputTokens: number;
  finalAnswerReserveTokens: number;
  concurrencyCap: number;
  /**
   * 7113-E D2 — bytes of the FIRST outline part only. A latency shape: it makes
   * the first validated node exist sooner without changing coverage, budgets or
   * any ceiling. Every later part keeps the ordinary part size.
   */
  firstPartBytes: number;
}
export const DEFAULT_LARGE_REFERENCE_POLICY: Readonly<LargeReferencePolicy> = Object.freeze({
  enabled: false, maxSourceBytes: 8 * 1024 * 1024, maxReferences: 5, maxWallTimeMs: 600_000,
  maxRequests: 96, maxDepth: 8, maxMapOutputTokens: 2048, maxReduceOutputTokens: 4096,
  finalAnswerReserveTokens: 4096, concurrencyCap: 1,
  // 32 KiB: the same threshold under which a reference is inlined whole, so the
  // first digest step is no larger than work the session already does inline.
  firstPartBytes: 32 * 1024,
});
export function resolveLargeReferencePolicy(value: unknown): Readonly<LargeReferencePolicy> {
  if (value === undefined) return DEFAULT_LARGE_REFERENCE_POLICY;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ExecutionBudgetPolicyError('native_agent.largeReference must be an object');
  const result = { ...DEFAULT_LARGE_REFERENCE_POLICY };
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(result, key)) throw new ExecutionBudgetPolicyError(`native_agent.largeReference.${key} is unknown`);
    if (key === 'enabled') {
      if (typeof item !== 'boolean') throw new ExecutionBudgetPolicyError('native_agent.largeReference.enabled must be boolean');
      result.enabled = item;
    } else {
      if (!Number.isSafeInteger(item) || (item as number) < 1) throw new ExecutionBudgetPolicyError(`native_agent.largeReference.${key} must be a positive safe integer`);
      // 7113-E D2 — the outline cannot cut a part below 4 bytes (a UTF-8
      // sequence is up to 4). Admitting 1..3 here only to refuse it later is a
      // trap: the same floor is enforced at admission, typed.
      if (key === 'firstPartBytes' && (item as number) < 4) {
        throw new ExecutionBudgetPolicyError('native_agent.largeReference.firstPartBytes must be at least 4 bytes');
      }
      (result as unknown as Record<string, unknown>)[key] = item;
    }
  }
  if (result.maxWallTimeMs > 2_147_483_647 || result.maxRequests > 100_000 || result.maxReferences > 5
    || result.maxSourceBytes > 8 * 1024 * 1024) throw new ExecutionBudgetPolicyError('native_agent.largeReference exceeds the supported storage or scheduling bound');
  return Object.freeze(result);
}
