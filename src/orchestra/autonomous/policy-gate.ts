// src/orchestra/autonomous/policy-gate.ts
// G2 (per-task policy) + G3 (EffectClass risk). Decides auto-run vs park.
// Distinct from G1 RBAC authority (authority-adapter) — see spec §3 RESTRUCTURE.
import type { EffectClass } from '../rubric-registry.js';
import type { BacklogEntry } from './backlog-types.js';

export type PolicyDecision = 'auto' | 'park';
export interface PolicyResult { decision: PolicyDecision; reason: string; }

/** EffectClasses that may auto-run; the rest park for human approval. */
const AUTO_SAFE: ReadonlySet<EffectClass> = new Set<EffectClass>(['pure', 'reversible']);

// Keyword patterns for deriving EffectClass from a BacklogEntry's spec description.
// Checked in priority order: irreversible > compensable > idempotent.
const RE_IRREVERSIBLE = /\bnpm publish\b|\bpublish\b|\bdeploy to production\b|\bforce[- ]push\b|\bpayment capture\b|\bsend (email|notification)\b/i;
const RE_COMPENSABLE  = /\boutbound api\b|\bqueue dispatch\b|\bwebhook\b/i;
const RE_IDEMPOTENT   = /\bdb[- ]migration\b|\bschema migration\b|\bcreate table\b|\bdatabase migration\b/i;

// Capability verbs that only READ (no external side effect) — classify 'pure'.
// Anything else (shell.exec, mail.send, erp.write, unknown verbs) falls to the
// fail-safe default (F10-002 risk classes; ADR-040 default-deny).
const READ_ONLY_CAPABILITIES: ReadonlySet<string> = new Set([
  'echo', 'fs.read', 'http.get', 'env.read', 'db.query', 'mail.search', 'erp.read',
]);

/**
 * Derive an EffectClass from a BacklogEntry's nature (pure computation, no I/O).
 *
 * Signal priority:
 *   1. Description keywords → irreversible / compensable / idempotent
 *   2. kind=sprint          → reversible (working-tree changes, git-undoable)
 *   3. scopeDir=docs/audits → pure (read-only audit output)
 *   4. scopeDir=docs/       → reversible
 *   5. known scopeDir       → reversible (working-tree edit)
 *   6. ambiguous / unknown  → critical-irreversible (fail-safe, ADR-040 default-deny)
 *
 * The fail-safe default ensures that entries whose nature cannot be determined are
 * parked for human approval rather than auto-executed (ADR-040 no-auto-approve).
 */
export function computeEntryEffectClass(entry: BacklogEntry): EffectClass {
  const desc  = entry.spec.description ?? '';
  const scope = entry.spec.scopeDir    ?? '';

  if (RE_IRREVERSIBLE.test(desc)) return 'critical-irreversible';
  if (RE_COMPENSABLE.test(desc))  return 'compensable';
  if (RE_IDEMPOTENT.test(desc))   return 'idempotent';

  // Capability entries: classify by the verb — read-only verbs are pure;
  // side-effecting or unknown verbs fail safe to the most restrictive class.
  if (entry.kind === 'capability') {
    const verb = entry.spec.capabilityTarget?.capability ?? '';
    return READ_ONLY_CAPABILITIES.has(verb) ? 'pure' : 'critical-irreversible';
  }

  // Sprints orchestrate working-tree code changes — reversible via git.
  if (entry.kind === 'sprint') return 'reversible';

  // Task: derive from scope directory.
  if (scope.startsWith('docs/audits/')) return 'pure';
  if (scope.startsWith('docs/'))        return 'reversible';
  if (scope)                            return 'reversible';

  // No scope and no recognizable description — fail-safe: most restrictive (park).
  return 'critical-irreversible';
}

/**
 * Decide whether a backlog entry may auto-run or must park.
 *   - policy 'auto'              → auto
 *   - policy 'approval-required' → park
 *   - policy 'risk-tagged'       → auto iff EffectClass is pure|reversible
 * `effect` is supplied by the caller (derived via computeEntryEffectClass).
 * Defaults to 'reversible' — backward-compatible with callers that omit it.
 */
export function decidePolicy(entry: BacklogEntry, effect: EffectClass = 'reversible'): PolicyResult {
  if (entry.policy === 'auto') return { decision: 'auto', reason: 'policy=auto' };
  if (entry.policy === 'approval-required') return { decision: 'park', reason: 'policy=approval-required' };
  // risk-tagged
  return AUTO_SAFE.has(effect)
    ? { decision: 'auto', reason: `risk-tagged effect=${effect} (auto-safe)` }
    : { decision: 'park', reason: `risk-tagged effect=${effect} (requires approval)` };
}
