// ═══ Rubric Registry — Task-Type Aware Evaluation ═════════════════════
// Sprint 154 Bug B fix: doc-only tasks were being evaluated with the code
// rubric (correctness/coverage/scope/docs), producing false NO_GO when
// coverage=null. This registry maps task scope-shape → rubric so that
// audit and doc-write tasks use criteria appropriate to their output.
//
// Detection is scope-shape based (i18n-neutral, gaming-proof):
// scope.filesWrite + scope.directories patterns determine type, not
// description text. Worker prompt/title language never influences routing.

import type { Task, EvaluationRubric } from '../core/types.js';

/**
 * Task taxonomy for rubric selection.
 *
 * - `audit`: producing a single audit report file under `docs/audits/`
 * - `document-write`: producing one or more markdown docs anywhere under `docs/`
 *   (excluding `docs/audits/` which is the audit territory)
 * - `code-development`: anything else (default) — implementation, tests, refactors
 */
export type TaskType = 'audit' | 'document-write' | 'code-development';

/**
 * Code rubric — mirrors DEFAULT_RUBRIC in result-evaluator.ts.
 *
 * Used for code-development tasks where unit tests + coverage are meaningful
 * quality signals. Weights and thresholds match the historical default so
 * existing callers without an explicit rubric see identical behaviour.
 *
 * @security Weights and passingScore are not user-overridable. Allowing
 * runtime override of these constants would enable gaming the evaluator
 * (e.g., set passingScore=0 to mark every task DONE). See ADR-038.
 */
export const CODE_RUBRIC: EvaluationRubric = {
  criteria: [
    { name: 'correctness', weight: 0.4, threshold: 60, evaluator: 'auto' },
    { name: 'test_coverage', weight: 0.25, threshold: 50, evaluator: 'metric' },
    { name: 'scope_compliance', weight: 0.2, threshold: 80, evaluator: 'auto' },
    { name: 'documentation', weight: 0.15, threshold: 30, evaluator: 'pattern' },
  ],
  passingScore: 70,
  maxRetries: 0,
};

/**
 * Audit rubric — for `docs/audits/` report tasks.
 *
 * Coverage is meaningless for audits (no code under test), so the rubric
 * focuses on completeness (headings/structure), finding density, citation
 * density (file:line references), and migration triage (P0/P1/P2 labels).
 *
 * @security Same override prohibition as CODE_RUBRIC.
 */
export const AUDIT_RUBRIC: EvaluationRubric = {
  criteria: [
    { name: 'audit_completeness', weight: 0.4, threshold: 60, evaluator: 'auto' },
    { name: 'finding_count', weight: 0.3, threshold: 40, evaluator: 'metric' },
    { name: 'citation_density', weight: 0.2, threshold: 40, evaluator: 'pattern' },
    { name: 'migration_triage', weight: 0.1, threshold: 40, evaluator: 'pattern' },
  ],
  passingScore: 70,
  maxRetries: 0,
};

/**
 * Document-write rubric — for narrative `docs/` content.
 *
 * Coverage is also irrelevant here. We grade correctness (worker
 * self-assessment + tests trivially pass), word count (target met),
 * scope compliance (no source files touched), and documentation quality
 * (heading structure).
 *
 * @security Same override prohibition as CODE_RUBRIC.
 */
export const DOC_WRITE_RUBRIC: EvaluationRubric = {
  criteria: [
    { name: 'correctness', weight: 0.3, threshold: 60, evaluator: 'auto' },
    { name: 'word_count', weight: 0.25, threshold: 50, evaluator: 'metric' },
    { name: 'scope_compliance', weight: 0.25, threshold: 80, evaluator: 'auto' },
    { name: 'documentation_quality', weight: 0.2, threshold: 30, evaluator: 'pattern' },
  ],
  passingScore: 70,
  maxRetries: 0,
};

/**
 * Internal registry mapping task type → rubric.
 *
 * @security Frozen object — runtime mutation rejected by the engine.
 * Do not export; consumers use {@link getRubric} which performs the lookup.
 */
const RUBRIC_REGISTRY: Readonly<Record<TaskType, EvaluationRubric>> = Object.freeze({
  audit: AUDIT_RUBRIC,
  'document-write': DOC_WRITE_RUBRIC,
  'code-development': CODE_RUBRIC,
});

/** Source-code directory prefixes — match anything that lives in code, not docs. */
const SOURCE_CODE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];

function isSourceCodeDir(dir: string): boolean {
  if (dir === 'src' || dir === 'tests' || dir === 'lib') return true;
  return SOURCE_CODE_PREFIXES.some(p => dir.startsWith(p));
}

function hasSourceDirectories(task: Task): boolean {
  const dirs = task.scope?.directories ?? [];
  return dirs.some(d => isSourceCodeDir(d));
}

/**
 * Returns true when the task is an audit report task.
 *
 * Rules (all must hold):
 * 1. scope.filesWrite has exactly one entry
 * 2. that entry starts with `docs/audits/` and ends with `.md`
 * 3. scope.directories does not contain any source-code directory
 *
 * Empty filesWrite or multi-file outputs disqualify (audit reports are
 * one-file-per-task by convention).
 */
export function isAuditTask(task: Task): boolean {
  const writes = task.scope?.filesWrite ?? [];
  if (writes.length !== 1) return false;
  const target = writes[0];
  if (!target) return false;
  if (!target.startsWith('docs/audits/')) return false;
  if (!target.endsWith('.md')) return false;
  if (hasSourceDirectories(task)) return false;
  return true;
}

/**
 * Returns true when the task writes only narrative documentation
 * (markdown under `docs/` but outside `docs/audits/`).
 *
 * Rules (all must hold):
 * 1. scope.filesWrite is non-empty
 * 2. every entry starts with `docs/` AND ends with `.md`
 * 3. no entry starts with `docs/audits/` (those are audit tasks)
 * 4. scope.directories does not contain any source-code directory
 */
export function isDocumentWriteTask(task: Task): boolean {
  const writes = task.scope?.filesWrite ?? [];
  if (writes.length === 0) return false;
  for (const f of writes) {
    if (!f.startsWith('docs/')) return false;
    if (!f.endsWith('.md')) return false;
    if (f.startsWith('docs/audits/')) return false;
  }
  if (hasSourceDirectories(task)) return false;
  return true;
}

/**
 * Detect the {@link TaskType} for a given task.
 *
 * Priority order (first match wins):
 * 1. audit
 * 2. document-write
 * 3. code-development (default)
 *
 * Audit takes precedence over document-write because audit reports also
 * live under `docs/`, but with stricter shape (single file, `docs/audits/`).
 */
export function detectTaskType(task: Task): TaskType {
  if (isAuditTask(task)) return 'audit';
  if (isDocumentWriteTask(task)) return 'document-write';
  return 'code-development';
}

/**
 * Look up the rubric appropriate for the given task.
 *
 * Equivalent to `RUBRIC_REGISTRY[detectTaskType(task)]` but exposed as a
 * function so callers cannot mutate the underlying registry object.
 */
export function getRubric(task: Task): EvaluationRubric {
  return RUBRIC_REGISTRY[detectTaskType(task)];
}

/**
 * Returns true when the task's rubric treats coverage as optional.
 *
 * Audit and document-write tasks do not produce executable code, so
 * coverage:null in their result file is acceptable. Code-development
 * tasks must report a numeric coverage value.
 *
 * Used by validateResultSchema to suppress the "missing coverage" error
 * for non-code task types — fixes Sprint 153 Bug B (coverage:null → NO_GO
 * on doc tasks).
 */
export function coverageOptional(task: Task): boolean {
  return detectTaskType(task) !== 'code-development';
}

// ═══ EffectClass — Reversibility Tag (ADR-055 placeholder) ════════════
// Sprint 156 Task 11: seed for hybrid scoring pipeline. Tasks differ in
// the *blast radius* of their side-effects: an audit doc is read-only
// scaffolding, a config edit is reversible via git, but a DB migration
// or an external `npm publish` is irreversible. The Brain / Nervous
// system needs a structural tag to decide whether a task can be retried
// blindly, must run inside a compensation envelope, or requires Alperen
// approval.
//
// This is the *default* mapping per TaskType. Specific tasks may
// override via task metadata in a future revision (ADR-055).

/**
 * Reversibility classification for a task's side-effects.
 *
 * - `pure`: read-only. No persisted side-effect. Safe to retry N times.
 *   Examples: audit reports (read code → write a doc summary), static
 *   analysis, doctor checks.
 * - `reversible`: side-effect lives in the working tree and is undoable
 *   via `git restore` / branch reset. Examples: source edits, test files,
 *   narrative docs. Default for most worker output.
 * - `idempotent`: side-effect persists but re-running produces the same
 *   end state (no duplication). Examples: schema migrations guarded by
 *   `CREATE TABLE IF NOT EXISTS`, config upserts. Safe to retry but the
 *   first run already changed external state.
 * - `compensable`: side-effect cannot be undone by re-running, but a
 *   companion "undo" task exists. Examples: outbound API calls with a
 *   refund endpoint, queue dispatches with cancellation. Retry requires
 *   explicit compensation, not naive re-execution.
 * - `critical-irreversible`: side-effect is final and externally visible.
 *   Examples: `npm publish`, production deploy, force-push to main,
 *   external email/notification send, payment capture. Retry is NEVER
 *   safe; failure requires manual recovery and likely human approval
 *   (per ADR-037 RBAC and Alperen-approval gates).
 *
 * @see ADR-055 (proposed, Sprint 156) — Hybrid Scoring 5-Layer Pipeline.
 * The EffectClass feeds Layer 4 (Outcome) and Layer 5 (Auditor) of that
 * pipeline by attaching a risk weight to each task type.
 */
export type EffectClass =
  | 'pure'
  | 'reversible'
  | 'idempotent'
  | 'compensable'
  | 'critical-irreversible';

/**
 * Default EffectClass per TaskType.
 *
 * Today every TaskType maps to either `pure` (read-only audit reports)
 * or `reversible` (working-tree edits undoable via git). The richer
 * classes (`idempotent`, `compensable`, `critical-irreversible`) are
 * reserved for future task taxonomies — e.g., a `db-migration` or
 * `package-publish` TaskType — and are part of the type union so callers
 * can pattern-match exhaustively today.
 *
 * @security Frozen object — runtime mutation rejected by the engine.
 * Same override prohibition as RUBRIC_REGISTRY (gaming-proof): allowing
 * runtime relaxation of EffectClass would let a task downgrade itself
 * from `critical-irreversible` to `reversible` and bypass approval gates.
 * Do not export; consumers use {@link getEffectClass}.
 *
 * @see ADR-055 (proposed, Sprint 156).
 */
const EFFECT_CLASS_REGISTRY: Readonly<Record<TaskType, EffectClass>> = Object.freeze({
  audit: 'pure',
  'document-write': 'reversible',
  'code-development': 'reversible',
});

/**
 * Return the default {@link EffectClass} for the given task.
 *
 * Composition: `EFFECT_CLASS_REGISTRY[detectTaskType(task)]`. The lookup
 * is wrapped in a function (rather than exposing the map) so callers
 * cannot mutate the underlying registry and so future revisions can
 * honour per-task overrides (e.g., a `task.effectClass` field) without
 * breaking the API.
 *
 * The total function never throws: every TaskType has a registry entry,
 * and detectTaskType always returns a valid TaskType (defaulting to
 * code-development).
 *
 * @see ADR-055 (proposed, Sprint 156) — Hybrid Scoring 5-Layer Pipeline.
 *
 * @example
 * ```ts
 * const cls = getEffectClass(task);
 * if (cls === 'critical-irreversible') {
 *   await requireAlperenApproval(task);
 * }
 * ```
 */
export function getEffectClass(task: Task): EffectClass {
  return EFFECT_CLASS_REGISTRY[detectTaskType(task)];
}
