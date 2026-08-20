// ─── Acceptance Matrix (ADR-G-040 companion; owner direction 2026-08-20) ────
//
// "Kabul ayarlarını genişletmek": WHICH normative verdict is acceptable for
// WHICH kind of work is a policy decision, not a hardcoded constant — an ERP
// process evaluation and a solo assistant task read the same matrix with
// different rows configured. This module is the SSOT for that policy:
//
//   action ACCEPT  — the verdict settles as-is
//   action ROUTE   — hand the item to a custom-confirmation adapter
//                    (code / llm / human — the Evaluation Surface families)
//   action REJECT  — the verdict does not settle; the failure path owns it
//
// HOLD is deliberately OUTSIDE the matrix: procedural non-verdicts are never
// policy-acceptable — the type system excludes them (DecidableVerdict).
//
// This slice wires the matrix in OBSERVE mode: the resolved acceptance is
// stamped on evaluation audit records (disk evidence, no decision change).
// Enforcement (ROUTE dispatch, REJECT overriding settlement) is the next
// slice, together with the adapter runtime — the config field for it ships
// with that slice, not before (an enforce knob with no enforce code would be
// a fake enablement).

import { TASK_KINDS, type TaskKind } from './work-model.js';
import type { NormativeVerdict } from './verdict-types.js';

/**
 * Confirmation adapter families (Evaluation Surface capability table).
 * Canonical home of the union — the criterion kernel re-exports it.
 */
export type ConfirmationAdapter = 'deterministic' | 'code' | 'llm' | 'human';

/** Verdicts the acceptance policy may decide on. HOLD is type-excluded. */
export type DecidableVerdict = Exclude<NormativeVerdict, 'HOLD'>;

export const DECIDABLE_VERDICTS = Object.freeze([
  'CONFIRMED',
  'QUALIFIED',
  'UNDECIDABLE',
  'FAILED',
] as const satisfies readonly DecidableVerdict[]);

export type AcceptanceAction = 'ACCEPT' | 'ROUTE' | 'REJECT';

export interface AcceptanceRule {
  readonly action: AcceptanceAction;
  /** Required exactly when action is ROUTE — the adapter family to hand off to. */
  readonly adapter?: ConfirmationAdapter;
}

export type AcceptanceRow = Readonly<Record<DecidableVerdict, AcceptanceRule>>;
export type AcceptanceMatrix = Readonly<Record<TaskKind, AcceptanceRow>>;

/** Deep-partial config override shape (per-kind, per-verdict). */
export type AcceptanceMatrixOverride = Partial<Record<TaskKind, Partial<Record<DecidableVerdict, AcceptanceRule>>>>;

const BASE_ROW: AcceptanceRow = Object.freeze({
  CONFIRMED: Object.freeze({ action: 'ACCEPT' }),
  QUALIFIED: Object.freeze({ action: 'ACCEPT' }),
  UNDECIDABLE: Object.freeze({ action: 'ROUTE', adapter: 'llm' }),
  FAILED: Object.freeze({ action: 'REJECT' }),
} as const);

/**
 * Default policy. Every kind starts from the base row (CONFIRMED/QUALIFIED
 * accepted — the QUALIFIED reservation already travels as typed residualDebt;
 * UNDECIDABLE routes to the llm adapter; FAILED rejected). SECURITY work is
 * stricter by default: a qualified pass or an undecidable is a human call —
 * enterprise-safe first. Per-project relaxation arrives with the config
 * surface in the adapter-runtime slice (the override machinery below is the
 * ready seam for it).
 */
export const DEFAULT_ACCEPTANCE_MATRIX: AcceptanceMatrix = Object.freeze(
  Object.fromEntries(TASK_KINDS.map(kind => [
    kind,
    kind === 'security'
      ? Object.freeze({
          ...BASE_ROW,
          QUALIFIED: Object.freeze({ action: 'ROUTE', adapter: 'human' }),
          UNDECIDABLE: Object.freeze({ action: 'ROUTE', adapter: 'human' }),
        } as const)
      : BASE_ROW,
  ])) as Record<TaskKind, AcceptanceRow>,
);

export interface AcceptanceOutcome {
  readonly kind: TaskKind;
  readonly verdict: DecidableVerdict;
  readonly action: AcceptanceAction;
  readonly adapter?: ConfirmationAdapter;
  /** Which layer produced the winning rule — audit legibility. */
  readonly source: 'default' | 'override';
}

export interface NormalizedAcceptanceOverride {
  readonly override: AcceptanceMatrixOverride;
  /** Rules dropped as invalid, with the reason — the caller logs, never silent. */
  readonly rejected: readonly string[];
}

const CONFIRMATION_ADAPTERS: readonly ConfirmationAdapter[] =
  Object.freeze(['deterministic', 'code', 'llm', 'human']);

/**
 * Validate a config-supplied override. Invalid rules are DROPPED with a
 * typed reason (ROUTE without adapter, unknown action/adapter/kind/verdict)
 * — a malformed policy line must not silently widen or narrow acceptance.
 */
export function normalizeAcceptanceOverride(
  raw: AcceptanceMatrixOverride | undefined,
): NormalizedAcceptanceOverride {
  if (!raw) return { override: {}, rejected: [] };
  const rejected: string[] = [];
  const override: AcceptanceMatrixOverride = {};
  for (const [kind, row] of Object.entries(raw)) {
    if (!(TASK_KINDS as readonly string[]).includes(kind)) {
      rejected.push(`${kind}: unknown task kind`);
      continue;
    }
    if (row == null || typeof row !== 'object') {
      rejected.push(`${kind}: row is not an object`);
      continue;
    }
    const cleanRow: Partial<Record<DecidableVerdict, AcceptanceRule>> = {};
    for (const [verdict, rule] of Object.entries(row)) {
      const label = `${kind}.${verdict}`;
      if (!(DECIDABLE_VERDICTS as readonly string[]).includes(verdict)) {
        rejected.push(`${label}: not a decidable verdict`);
        continue;
      }
      if (rule == null || typeof rule !== 'object'
        || !['ACCEPT', 'ROUTE', 'REJECT'].includes((rule as AcceptanceRule).action)) {
        rejected.push(`${label}: invalid action`);
        continue;
      }
      const typed = rule as AcceptanceRule;
      if (typed.action === 'ROUTE'
        && !CONFIRMATION_ADAPTERS.includes(typed.adapter as ConfirmationAdapter)) {
        rejected.push(`${label}: ROUTE requires a valid adapter`);
        continue;
      }
      if (typed.action !== 'ROUTE' && typed.adapter !== undefined) {
        rejected.push(`${label}: adapter is only valid with ROUTE`);
        continue;
      }
      cleanRow[verdict as DecidableVerdict] = typed;
    }
    if (Object.keys(cleanRow).length > 0) override[kind as TaskKind] = cleanRow;
  }
  return { override, rejected };
}

/**
 * Resolve the acceptance policy for one (kind, verdict). Pure lookup:
 * override rule wins per-cell, else the default matrix. The override is
 * expected pre-normalized (config load path); a raw override passed here is
 * normalized defensively — rejected rules simply do not win.
 */
export function resolveAcceptance(
  kind: TaskKind,
  verdict: DecidableVerdict,
  override?: AcceptanceMatrixOverride,
): AcceptanceOutcome {
  const cleaned = normalizeAcceptanceOverride(override).override;
  const overridden = cleaned[kind]?.[verdict];
  const rule = overridden ?? DEFAULT_ACCEPTANCE_MATRIX[kind][verdict];
  return {
    kind,
    verdict,
    action: rule.action,
    ...(rule.adapter !== undefined ? { adapter: rule.adapter } : {}),
    source: overridden ? 'override' : 'default',
  };
}
