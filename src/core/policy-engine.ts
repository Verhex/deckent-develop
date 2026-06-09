// ─── Policy Engine ───────────────────────────────────────────────────────────
// F10-001 (Sprint 261): Unified policy decision surface.
//
// Composes the three pre-existing decision layers into ONE declarative call:
//   1. RBAC          — `can()` from rbac.js              (role → permission authorization)
//   2. Activation    — `evaluateActivation()` from activation-engine.js (task-DNA scoring)
//   3. Condition     — `evaluateCondition()` from condition-evaluator.js (structured gate)
//
// This module DELEGATES to those functions — it reimplements none of their logic.
// `evaluatePolicy` is a PURE function: no I/O, no side effects. (RBAC's `can()` only
// writes an audit event when an `auditCtx` is supplied; this module never supplies one,
// so the composition stays side-effect-free.)
//
// Create-only / additive: nothing in the live path wires this yet (a follow-up does).
// Backward-safe by construction — new file, zero existing callers. Each layer is OPTIONAL
// in the input; an empty policy (no layers) permits.

import { can } from './rbac.js';
import type { Permission } from './rbac.js';
import { evaluateActivation } from './activation-engine.js';
import { evaluateCondition } from './condition-evaluator.js';
import type { TaskDNA, ActivationConfig } from './routing-types.js';

// ─── Decision Contract ────────────────────────────────────────────────────────

/**
 * The unified policy outcome. The union + the `reasons` array ARE the contract;
 * downstream callers branch on `decision` and surface `reasons` as a diagnostic trail
 * (English-default, mirroring `RoutingDecision.reasoning`).
 *
 * Semantics (deterministic precedence, first match wins):
 *   permit  — every evaluated layer passes (or no layer was provided).
 *   deny    — a HARD authorization failure: RBAC denied, or an activation exclusion matched.
 *   park    — not forbidden, but a precondition is unmet: the condition gate evaluated false.
 *             The request should be held/deferred until conditions change.
 *   suggest — permitted-but-weak: nothing blocks, but the activation score is below
 *             `minScore` — advisory "could apply, low confidence" rather than a firm permit.
 */
export type PolicyDecisionKind = 'permit' | 'deny' | 'park' | 'suggest';

/** Outcome of the RBAC layer when its inputs were provided. */
export interface RbacLayerOutcome {
  allowed: boolean;
  role: string;
  action: Permission;
  tenantId: string;
}

/** Outcome of the activation layer when its inputs were provided. */
export interface ActivationLayerOutcome {
  score: number;
  minScore: number;
  meetsMinScore: boolean;
  excluded: boolean;
  matchedRules: string[];
  excludeReason?: string;
}

/** Outcome of the condition-gate layer when its inputs were provided. */
export interface ConditionLayerOutcome {
  passed: boolean;
}

/**
 * Per-layer breakdown. A layer is `null` when its inputs were not supplied
 * (so callers can distinguish "not evaluated" from a concrete pass/fail).
 */
export interface PolicyLayers {
  rbac: RbacLayerOutcome | null;
  activation: ActivationLayerOutcome | null;
  condition: ConditionLayerOutcome | null;
}

/** The composed decision returned by `evaluatePolicy`. */
export interface PolicyDecision {
  decision: PolicyDecisionKind;
  reasons: string[];
  layers: PolicyLayers;
}

// ─── Input Contract ───────────────────────────────────────────────────────────

/** RBAC layer inputs — when present, the actor's role authorization is checked via `can()`. */
export interface PolicyRbacInput {
  role: string;
  action: Permission;
  tenantId: string;
}

/** Activation layer inputs — when present, task-DNA activation is scored. */
export interface PolicyActivationInput {
  taskDNA: TaskDNA;
  config: ActivationConfig;
}

/** Condition-gate inputs — when present, the structured gate must hold. */
export interface PolicyConditionInput {
  data: Record<string, unknown>;
  when: Record<string, unknown>;
}

/**
 * Declarative policy input. Every layer is optional and independent; supply only the
 * layers relevant to the decision. Supplying none yields `permit` (nothing blocks).
 */
export interface PolicyInput {
  rbac?: PolicyRbacInput;
  activation?: PolicyActivationInput;
  condition?: PolicyConditionInput;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a unified policy by composing the RBAC, activation, and condition layers.
 *
 * Pure: delegates to `can()` (no auditCtx ⇒ no write), `evaluateActivation()`, and
 * `evaluateCondition()`, then folds their results into a single `PolicyDecision` via a
 * deterministic precedence (see `PolicyDecisionKind`). No I/O, no mutation of inputs.
 */
export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const reasons: string[] = [];
  const layers: PolicyLayers = { rbac: null, activation: null, condition: null };

  // ─ Layer 1: RBAC authorization ─
  if (input.rbac) {
    const { role, action, tenantId } = input.rbac;
    const allowed = can(role, action, tenantId); // no auditCtx → pure
    layers.rbac = { allowed, role, action, tenantId };
    reasons.push(
      allowed
        ? `rbac: '${role}' permitted '${action}'`
        : `rbac: '${role}' denied '${action}'`,
    );
  }

  // ─ Layer 2: activation scoring ─
  if (input.activation) {
    const { taskDNA, config } = input.activation;
    const result = evaluateActivation(taskDNA, config);
    const meetsMinScore = result.score >= config.minScore;
    layers.activation = {
      score: result.score,
      minScore: config.minScore,
      meetsMinScore,
      excluded: result.excluded,
      matchedRules: result.matchedRules,
      excludeReason: result.excludeReason,
    };
    if (result.excluded) {
      reasons.push(`activation: excluded — ${result.excludeReason ?? 'rule'}`);
    } else {
      reasons.push(
        `activation: score ${result.score}/${config.minScore} ` +
          `(${result.matchedRules.length} rule(s) matched)`,
      );
    }
  }

  // ─ Layer 3: condition gate ─
  if (input.condition) {
    const passed = evaluateCondition(input.condition.data, input.condition.when);
    layers.condition = { passed };
    reasons.push(passed ? 'condition: gate satisfied' : 'condition: gate not satisfied');
  }

  return { decision: composeDecision(layers), reasons, layers };
}

// ─── Decision Composition ───────────────────────────────────────────────────

/**
 * Fold the per-layer outcomes into a single decision via deterministic precedence.
 * Each branch is driven by exactly one layer, keeping the union exhaustive and the
 * composition order auditable.
 */
function composeDecision(layers: PolicyLayers): PolicyDecisionKind {
  // 1. Hard deny — RBAC refused the action.
  if (layers.rbac && !layers.rbac.allowed) return 'deny';
  // 2. Hard deny — an activation exclusion rule matched.
  if (layers.activation && layers.activation.excluded) return 'deny';
  // 3. Park — a precondition gate failed (held, not forbidden).
  if (layers.condition && !layers.condition.passed) return 'park';
  // 4. Suggest — permitted but the activation signal is below minScore.
  if (layers.activation && !layers.activation.meetsMinScore) return 'suggest';
  // 5. Permit — nothing blocks.
  return 'permit';
}
