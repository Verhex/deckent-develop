// src/orchestra/autonomous/policy-gate.ts
// G2 (per-task policy) + G3 (EffectClass risk). Decides auto-run vs park.
// Distinct from G1 RBAC authority (authority-adapter) — see spec §3 RESTRUCTURE.
import type { EffectClass } from '../rubric-registry.js';
import type { BacklogEntry } from './backlog-types.js';

export type PolicyDecision = 'auto' | 'park';
export interface PolicyResult { decision: PolicyDecision; reason: string; }

/** EffectClasses that may auto-run; the rest park for human approval. */
const AUTO_SAFE: ReadonlySet<EffectClass> = new Set<EffectClass>(['pure', 'reversible']);

/**
 * Decide whether a backlog entry may auto-run or must park.
 *   - policy 'auto'              → auto
 *   - policy 'approval-required' → park
 *   - policy 'risk-tagged'       → auto iff EffectClass is pure|reversible
 * `effect` is supplied by the caller (derived via getEffectClass for the entry's
 * task). Defaults to 'reversible' — the common case for working-tree edits, which
 * is auto-safe. Pass an explicit effect for entries with known irreversible impact.
 */
export function decidePolicy(entry: BacklogEntry, effect: EffectClass = 'reversible'): PolicyResult {
  if (entry.policy === 'auto') return { decision: 'auto', reason: 'policy=auto' };
  if (entry.policy === 'approval-required') return { decision: 'park', reason: 'policy=approval-required' };
  // risk-tagged
  return AUTO_SAFE.has(effect)
    ? { decision: 'auto', reason: `risk-tagged effect=${effect} (auto-safe)` }
    : { decision: 'park', reason: `risk-tagged effect=${effect} (requires approval)` };
}
