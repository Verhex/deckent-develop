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
import { isAbsolute, posix, resolve } from 'node:path';

import type { Task, TaskResult } from '../core/types.js';
import type { GoNoGoCriterionItem } from '../core/task-types.js';
import type { TaskResultV2 } from '../core/task-result-schema.js';
import type { ConfirmationAdapter } from '../core/acceptance-matrix.js';
import {
  executionEffectPolicyAllowsPath,
} from '../core/execution-write-scope-policy.js';
import {
  taskAttemptCustodyDigest,
  type Sha256Digest,
  type TaskAttemptCustodyPolicyV2,
  type TaskAttemptCustodyVerifiedEffectLandingV2,
} from '../core/task-attempt-custody-store.js';

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

export interface ExactCriterionEvaluationAuthorityV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-criterion-evaluation-authority-v2';
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
  readonly effectLandingReceiptDigest: Sha256Digest;
  readonly finalManifestDigest: string;
  readonly writePolicyDigest: string;
  readonly outcome: CriterionEvaluationOutcome | null;
  readonly authorityDigest: Sha256Digest;
}

export type EvaluateExactGoNogoCriteriaResult =
  | {
      readonly state: 'evaluated';
      readonly authority: ExactCriterionEvaluationAuthorityV2;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: 'effect-landing-identity-mismatch' | 'effect-manifest-invalid';
    };

/**
 * Return the sole deterministic locator: a normalized, repo-relative path
 * authored with the explicit `file` kind. Legacy strings and unsafe paths do
 * not gain filesystem authority through pattern matching.
 */
function parseExplicitRequirement(
  requirement: string,
): { kind: 'file' | 'command' | 'assertion'; value: string } | null {
  const match = /^(file|command|assertion):(.*)$/su.exec(requirement);
  if (!match) return null;
  try {
    const value: unknown = JSON.parse(match[2]!);
    return typeof value === 'string'
      ? { kind: match[1] as 'file' | 'command' | 'assertion', value }
      : null;
  } catch {
    return null;
  }
}

function requirementPath(requirement: string): string | null {
  const explicit = parseExplicitRequirement(requirement);
  if (explicit?.kind !== 'file') return null;
  const candidate = explicit.value.trim();
  if (!candidate || candidate.includes('\n') || candidate.includes('\\')) return null;
  if (isAbsolute(candidate) || /^[A-Za-z]:/u.test(candidate)) return null;
  const normalized = posix.normalize(candidate);
  if (normalized !== candidate || normalized === '.' || normalized.startsWith('../')) return null;
  return normalized;
}

function displayRequirement(requirement: string): string {
  const explicit = parseExplicitRequirement(requirement);
  return explicit ? `${explicit.kind}: ${explicit.value}` : requirement;
}

function requirementHolds(
  path: string,
  projectRoot: string,
  result: TaskResult,
): boolean {
  if (result.filesChanged?.some(changed => changed.trim() === path)) return true;
  const absoluteRoot = resolve(projectRoot);
  const absolutePath = resolve(absoluteRoot, path);
  if (absolutePath === absoluteRoot || !absolutePath.startsWith(`${absoluteRoot}/`)) return false;
  return existsSync(absolutePath);
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
      evidence.push(`undecidable (non-deterministic requirement): ${displayRequirement(requirement)}`);
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

function evaluateExactItem(
  item: GoNoGoCriterionItem,
  finalManifest: TaskAttemptCustodyVerifiedEffectLandingV2['verifiedBundle']['final'],
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
  const entries = new Map(finalManifest.entries.map(entry => [entry.path, entry]));
  const evidence: string[] = [];
  let decidable = 0;
  let held = 0;
  for (const requirement of requirements) {
    const path = requirementPath(requirement);
    if (path === null) {
      evidence.push(`undecidable (non-deterministic requirement): ${displayRequirement(requirement)}`);
      continue;
    }
    const entry = entries.get(path);
    if (entry?.kind === 'regular-file') {
      decidable += 1;
      held += 1;
      evidence.push(`present in committed final manifest: ${path}`);
      continue;
    }
    if (entry?.kind === 'directory') {
      evidence.push(`undecidable (file requirement resolved to directory): ${path}`);
      continue;
    }
    if (!executionEffectPolicyAllowsPath(finalManifest.policy, path)) {
      evidence.push(`undecidable (outside captured write policy): ${path}`);
      continue;
    }
    decidable += 1;
    evidence.push(`absent from committed final manifest: ${path}`);
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
  return {
    itemId: item.id,
    polarity: item.polarity,
    mode: 'deterministic',
    status: held > 0 ? 'satisfied' : 'unsatisfied',
    evidence,
  };
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

/**
 * Exact normal-Docker criterion authority. It never reads the mutable host
 * project tree: file facts come only from the verified COMMITTED final
 * manifest and its exact write-policy coverage.
 */
export function evaluateExactGoNogoCriteria(input: {
  readonly task: Task;
  readonly result: TaskResultV2;
  readonly effectLanding: TaskAttemptCustodyVerifiedEffectLandingV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): EvaluateExactGoNogoCriteriaResult {
  try {
    const identity = input.result.attemptCustody.identity;
    const bundle = input.effectLanding.verifiedBundle;
    const attempt = bundle.final.attempt;
    if (
      input.task.id !== input.result.taskId
      || input.task.id !== attempt.taskId
      || identity.projectId !== attempt.projectId
      || identity.taskId !== attempt.taskId
      || identity.attemptId !== attempt.attemptId
      || identity.generation !== attempt.generation
      || input.effectLanding.landing.identity.taskId !== identity.taskId
      || input.effectLanding.landing.identity.attemptId !== identity.attemptId
      || input.effectLanding.landing.identity.generation !== identity.generation
    ) return { state: 'hold', reasonCode: 'effect-landing-identity-mismatch' };
    const items = input.task.goNogo?.items;
    const outcome = !items || items.length === 0
      ? null
      : Object.freeze({
          items: Object.freeze(items.map(item => evaluateExactItem(item, bundle.final))),
          decisiveNoGo: false,
          decided: 0,
          total: items.length,
        });
    const resolvedOutcome = outcome === null ? null : Object.freeze({
      ...outcome,
      decisiveNoGo: outcome.items.some(item =>
        (item.polarity === 'no-go' && item.status === 'satisfied')
        || (item.polarity === 'go' && item.status === 'unsatisfied')),
      decided: outcome.items.filter(item => item.status !== 'undecidable').length,
    });
    const body = Object.freeze({
      schemaVersion: 2 as const,
      kind: 'exact-criterion-evaluation-authority-v2' as const,
      taskId: input.task.id,
      attemptId: identity.attemptId,
      generation: identity.generation,
      effectLandingReceiptDigest: input.effectLanding.landing.receiptDigest,
      finalManifestDigest: bundle.final.digest,
      writePolicyDigest: bundle.final.policy.digest,
      outcome: resolvedOutcome,
    });
    return Object.freeze({
      state: 'evaluated' as const,
      authority: Object.freeze({
        ...body,
        authorityDigest: taskAttemptCustodyDigest(
          'exact-criterion-evaluation-authority-v2',
          body,
          input.policy.jsonBounds,
        ),
      }),
    });
  } catch {
    return { state: 'hold', reasonCode: 'effect-manifest-invalid' };
  }
}
