// ─── Evaluation Surface — deterministic criterion core (EVALUATION-001) ─────
//
// Owner architectural positioning (2026-08-20): evaluation is a SURFACE with
// one deterministic kernel and task-shaped confirmation adapters, equally
// rigorous for an ERP process evaluation and a solo assistant task. This
// module is the kernel's first brick (7097 item-3): it binds the typed
// `goNogo.items` criteria — until now written by planners and read ONLY by
// the xverify adjudication machinery — to the evaluator itself, so a task's
// own contract participates in its verdict instead of a free-text heuristic.
//
// Confirmation modes are first-class and typed. THIS slice implements only
// the `deterministic` mode (disk/result evidence). The other modes are
// declared, never silently skipped: a criterion whose requirements need a
// mode this kernel does not run yet resolves to `undecidable` with the mode
// recorded — honest typed incompleteness, never a fabricated pass/fail
// (the same honesty contract as D2/B3: undecidable is NEVER a penalty).

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Task, TaskResult } from '../core/types.js';
import type { GoNoGoCriterionItem } from '../core/task-types.js';
import type { ConfirmationAdapter } from '../core/acceptance-matrix.js';

/**
 * How a criterion's satisfaction is confirmed. Only `deterministic` runs in
 * this kernel today; `code`, `llm` and `human` are the adapter families the
 * Evaluation Surface grows into (brief §3.5 capability table). The union's
 * canonical home is core/acceptance-matrix.ts (single vocabulary source).
 */
export type CriterionConfirmationMode = ConfirmationAdapter;

export type CriterionStatus = 'satisfied' | 'unsatisfied' | 'undecidable';

export interface CriterionVerdict {
  readonly itemId: string;
  readonly polarity: 'go' | 'no-go';
  readonly mode: CriterionConfirmationMode;
  readonly status: CriterionStatus;
  /** One evidence line per requirement, in requirement order. */
  readonly evidence: readonly string[];
}

export interface CriterionEvaluationOutcome {
  readonly items: readonly CriterionVerdict[];
  /**
   * True when the typed contract itself decides NO_GO: a `no-go` item is
   * SATISFIED (the failure condition provably holds) or a `go` item is
   * deterministically UNSATISFIED (its required evidence provably absent).
   * Undecidable items never contribute here.
   */
  readonly decisiveNoGo: boolean;
  /** Decided (satisfied|unsatisfied) vs total item count — coverage truth. */
  readonly decided: number;
  readonly total: number;
}

/** `path:START-END` — the shared bounded-target grammar (xverify / bootstrap). */
const RANGED_REQUIREMENT_RE = /^(.+):(\d+)-(\d+)$/u;

/**
 * A requirement string this deterministic kernel can decide: a repo-relative
 * file path (optionally ranged). Anything else (prose acceptance language)
 * belongs to the llm/human confirmation adapters and stays undecidable here.
 */
function requirementPath(requirement: string): string | null {
  const trimmed = requirement.trim();
  if (!trimmed || trimmed.includes('\n')) return null;
  const ranged = RANGED_REQUIREMENT_RE.exec(trimmed);
  const candidate = ranged ? ranged[1]! : trimmed;
  // Path shape: contains a separator or a dot-extension, no spaces — the
  // narrow, false-positive-averse subset (prose almost always has spaces).
  if (/\s/u.test(candidate)) return null;
  if (!candidate.includes('/') && !/\.[A-Za-z0-9]+$/u.test(candidate)) return null;
  return candidate;
}

function requirementHolds(
  path: string,
  projectRoot: string,
  result: TaskResult,
): boolean {
  if (result.filesChanged?.some(changed => changed.trim() === path)) return true;
  return existsSync(join(projectRoot, path));
}

function evaluateItem(
  item: GoNoGoCriterionItem,
  projectRoot: string,
  result: TaskResult,
): CriterionVerdict {
  const requirements = item.evidenceRequirements ?? [];
  if (requirements.length === 0) {
    return {
      itemId: item.id,
      polarity: item.polarity,
      mode: 'deterministic',
      status: 'undecidable',
      evidence: ['no evidence requirements authored'],
    };
  }

  const evidence: string[] = [];
  let decidable = 0;
  let held = 0;
  for (const requirement of requirements) {
    const path = requirementPath(requirement);
    if (path === null) {
      evidence.push(`undecidable (non-deterministic requirement): ${requirement}`);
      continue;
    }
    decidable += 1;
    const holds = requirementHolds(path, projectRoot, result);
    if (holds) held += 1;
    evidence.push(`${holds ? 'present' : 'absent'}: ${path}`);
  }

  if (decidable === 0) {
    return {
      itemId: item.id,
      polarity: item.polarity,
      mode: 'llm',
      status: 'undecidable',
      evidence,
    };
  }
  // Any-of semantics, mirroring the adjudication contract's
  // anyOfEvidenceIds: one held deterministic requirement satisfies the item.
  const status: CriterionStatus = held > 0 ? 'satisfied' : 'unsatisfied';
  return { itemId: item.id, polarity: item.polarity, mode: 'deterministic', status, evidence };
}

/**
 * True when the rubric score list carries a deterministic typed-contract
 * failure (`goNogo:<id>` row with passed=false). Such a NO_GO is CONCRETE
 * disk evidence — the salvage/reconciliation paths must never soften it:
 * a green tsc/vitest run is unrelated evidence against "required file is
 * provably absent" or "the no-go condition provably holds". Structural
 * parameter type so both reconciliation gates can call it without
 * importing the evaluator's result shape.
 */
export function hasUnsalvageableContractFailure(
  rubricScores: readonly { criterion: string; passed: boolean }[],
): boolean {
  // `goNogo:` — deterministic typed-contract evidence (this kernel).
  // `acceptance:` — an enforced acceptance-policy REJECT (ADR-G-040): a
  // policy decision the owner configured; worker-reported signals and green
  // probe runs are equally unrelated evidence against it.
  return rubricScores.some(row => !row.passed
    && (row.criterion.startsWith('goNogo:') || row.criterion.startsWith('acceptance:')));
}

/**
 * Deterministically evaluate a task's typed goNogo criteria against disk and
 * result evidence. Pure read: no writes, no provider calls, no scoring — the
 * caller (the rubric bridge) decides how verdicts affect the decision.
 */
export function evaluateGoNogoCriteria(
  task: Task,
  result: TaskResult,
  projectRoot: string,
): CriterionEvaluationOutcome | null {
  const items = task.goNogo?.items;
  if (!items || items.length === 0) return null;

  const verdicts = items.map(item => evaluateItem(item, projectRoot, result));
  const decided = verdicts.filter(v => v.status !== 'undecidable').length;
  const decisiveNoGo = verdicts.some(v =>
    (v.polarity === 'no-go' && v.status === 'satisfied')
    || (v.polarity === 'go' && v.status === 'unsatisfied'));
  return Object.freeze({
    items: Object.freeze(verdicts),
    decisiveNoGo,
    decided,
    total: verdicts.length,
  });
}
