/**
 * prompt-lint.ts — PCOMP-6 D2: spawn-time static consistency linter for the
 * compiled worker-prompt contract (MASTER-PLAN 573).
 *
 * Ground-truth (prompt-refactor-6-step1, 2026-07-14): the 430-438 corpus showed
 * the prompt pipeline composes layers append-only with NO cross-layer
 * consistency check — the worker is left to arbitrate contradictions
 * ("follow the instruction and get flagged, or refuse and fail the task").
 * This module is the checker: pure, I/O-free, fed exclusively from plan-time
 * data the caller already holds.
 *
 * MODE: warn-only by rollout decision (Alperen, 2026-07-14 karar: warn →
 * ölçüm → fail-closed). Findings never mutate the prompt and never block the
 * spawn; the caller records them for measurement. The fail-closed flip is a
 * later, evidence-gated slice.
 *
 * Checks (id → corpus frequency at design time):
 *   W1 mentioned-file-outside-write-authority  (P1 — 7/31)
 *   W2 criteria-test-unresolved                (P5/C ailesi)
 *   W3 behavior-precedence-suspect             (P2 — 19/31 basılı, 19/19 tek-değere çökük)
 *   W4 persona-mismatch-test-authorship        (P4 — %61 refactorer)
 *   W5 skill-relevance-suspect                 (P3 — sh-portability 10/31)
 *   W6 unverified-write-path                   (scope-gate'in Unverified sınıfı)
 */

import type { Task } from '../core/types.js';
import { resolveTargetedTestPaths } from './prompt-god-template.js';
import { NARROW_SKILL_DOMAIN_SIGNALS } from './prompt-token-optimizer.js';
import { ADR_CONSTRAINTS } from '../core/adr-constraints.js';

export type PromptLintCheckId =
  | 'adr-constraint-violation'
  | 'mentioned-file-outside-write-authority'
  | 'criteria-test-unresolved'
  | 'behavior-precedence-suspect'
  | 'persona-mismatch-test-authorship'
  | 'skill-relevance-suspect'
  | 'unverified-write-path';

export interface PromptLintFinding {
  readonly check: PromptLintCheckId;
  /** warn-only rollout: every finding is 'warn' until the fail-closed flip. */
  readonly level: 'warn';
  readonly taskId: string;
  readonly detail: string;
}

const FILE_PATH_RE = /(?:src|tests|scripts)\/[\w\-/.]+\.(?:ts|tsx|mjs|cjs|js)/g;
/** Words that mark a mentioned file as deliberately read-only/untouchable —
 *  a mention inside such a clause is NOT a write-authority contradiction. */
const READ_ONLY_CONTEXT_RE =
  /(dokunma|dokunulmaz|değiştirme|degistirme|salt.?okur|read.?only|do not (?:touch|modify|change)|must not (?:touch|modify)|yalnız oku|only read)/i;

function taskText(task: Task): string {
  return `${task.title ?? ''}\n${task.description ?? ''}`;
}

function criteriaText(task: Task): string {
  return `${task.goNogo?.goCriteria ?? ''}\n${task.goNogo?.noGoCriteria ?? ''}`;
}

/** W1 — a file the task text tells the worker to change is missing from
 *  filesWrite. Mentions inside an explicit read-only clause (same line) are
 *  exempt; test-file mentions inside goCriteria are W2's business, not W1's. */
function checkMentionedWriteAuthority(task: Task): PromptLintFinding[] {
  const fw = new Set(task.scope?.filesWrite ?? []);
  const findings: PromptLintFinding[] = [];
  const offenders = new Set<string>();
  for (const line of taskText(task).split('\n')) {
    if (READ_ONLY_CONTEXT_RE.test(line)) continue;
    for (const m of line.matchAll(FILE_PATH_RE)) {
      if (!fw.has(m[0])) offenders.add(m[0]);
    }
  }
  if (offenders.size > 0) {
    findings.push({
      check: 'mentioned-file-outside-write-authority',
      level: 'warn',
      taskId: task.id,
      detail: `task text names ${offenders.size} file(s) missing from filesWrite: ${[...offenders].sort().slice(0, 6).join(', ')}`,
    });
  }
  return findings;
}

/** W2 — a test family explicitly demanded by goCriteria did not survive into
 *  the exact targeted-test set (so the worker's verify command will not run
 *  the very family the verdict depends on). */
function checkCriteriaTestsResolved(task: Task, trackedFiles?: readonly string[]): PromptLintFinding[] {
  const demanded = new Set<string>();
  for (const m of criteriaText(task).matchAll(/tests\/[\w\-/.]+?\.(?:test|spec)\.[cm]?[jt]sx?/g)) {
    demanded.add(m[0]);
  }
  if (demanded.size === 0) return [];
  const resolved = new Set(resolveTargetedTestPaths(task, trackedFiles));
  const missing = [...demanded].filter((p) => !resolved.has(p)).sort();
  if (missing.length === 0) return [];
  return [{
    check: 'criteria-test-unresolved',
    level: 'warn',
    taskId: task.id,
    detail: `goCriteria demands test file(s) absent from the exact verify set: ${missing.slice(0, 4).join(', ')}`,
  }];
}

/** Signals that a task is additive/test-authorship — i.e. NOT a behavior change. */
const NON_BEHAVIOR_SIGNAL_RE =
  /(additive[- ]only|yalnız test|yalniz test|test paketi|test ailesi|regression test|regresyon test|davranış değiş(?:tir)?me|davranis degis(?:tir)?me|behavior.{0,12}unchanged|preserve.{0,12}behavior|zero[- ]diff|sıfır[- ]diff)/i;

/** W3 — the behavior-precedence block will render (refactorer + non-refactor
 *  intent) while the task text itself claims to be additive/behavior-preserving:
 *  the exact self-contradiction class from the 438 external analyses. */
function checkBehaviorPrecedence(task: Task): PromptLintFinding[] {
  // routingMeta.taskDNA is typed `unknown` on Task (routing owns the shape) —
  // read the single field we need defensively, mirroring the template's own
  // buildBehaviorPrecedenceNote access pattern.
  const dna = task.routingMeta?.taskDNA as { intent?: { primary?: string } } | undefined;
  const intent = dna?.intent?.primary;
  // Mirror buildBehaviorPrecedenceNote's D3 suppression (sprint-440): an
  // all-test write scope means the block will NOT render — no finding.
  const fw = task.scope?.filesWrite ?? [];
  const allTests =
    fw.length > 0 &&
    fw.every((f) => /(^|\/)tests?\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
  const willRender =
    task.assignedAgent === 'refactorer' &&
    intent !== undefined &&
    !['refactor', 'unknown', 'documentation'].includes(intent) &&
    !allTests;
  if (!willRender) return [];
  const text = `${taskText(task)}\n${criteriaText(task)}`;
  if (!NON_BEHAVIOR_SIGNAL_RE.test(text)) return [];
  return [{
    check: 'behavior-precedence-suspect',
    level: 'warn',
    taskId: task.id,
    detail: `behavior-CHANGE precedence block will render (agent=refactorer, intent=${intent}) but the task text signals additive/behavior-preserving work`,
  }];
}

/** W4 — refactorer persona routed to a pure test-authorship task
 *  (every write target is a test file). */
function checkPersonaTestAuthorship(task: Task): PromptLintFinding[] {
  if (task.assignedAgent !== 'refactorer') return [];
  const fw = task.scope?.filesWrite ?? [];
  if (fw.length === 0) return [];
  const allTests = fw.every((f) => /(^|\/)tests\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
  if (!allTests) return [];
  return [{
    check: 'persona-mismatch-test-authorship',
    level: 'warn',
    taskId: task.id,
    detail: `refactorer persona assigned but every write target is a test file (${fw.length}) — test-authorship guidance would fit better`,
  }];
}

/** Skills whose domain is recognizably narrow, with the file/text signals that
 *  justify them. A listed skill with zero signal hits is suspect. Unlisted
 *  skills are never flagged (unknown domain ≠ irrelevant). */
// D4: single source shared with the prompt-time filter (prompt-token-optimizer).
const NARROW_SKILL_SIGNALS = NARROW_SKILL_DOMAIN_SIGNALS;

/** W5 — an assigned narrow-domain skill has no signal anywhere in the task's
 *  text or write targets (the relevance-inversion class: substring routing +
 *  never-empty floors let these through). */
function checkSkillRelevance(task: Task): PromptLintFinding[] {
  const skills = task.assignedSkills ?? [];
  if (skills.length === 0) return [];
  const haystack = `${taskText(task)}\n${criteriaText(task)}\n${(task.scope?.filesWrite ?? []).join('\n')}`;
  const suspects = skills.filter((s) => {
    const sig = NARROW_SKILL_SIGNALS[s];
    return sig !== undefined && !sig.test(haystack);
  });
  if (suspects.length === 0) return [];
  return [{
    check: 'skill-relevance-suspect',
    level: 'warn',
    taskId: task.id,
    detail: `assigned skill(s) with zero domain signal in task text/targets: ${suspects.join(', ')}`,
  }];
}

/** W6 — a write target that is neither tracked nor plausibly new-by-design
 *  (task text never mentions it). Catches typo'd/phantom paths at plan time. */
function checkUnverifiedWritePaths(task: Task, trackedFiles?: readonly string[]): PromptLintFinding[] {
  if (!trackedFiles || trackedFiles.length === 0) return [];
  const tracked = new Set(trackedFiles);
  const text = `${taskText(task)}\n${criteriaText(task)}`;
  const phantom = (task.scope?.filesWrite ?? []).filter(
    (f) => !tracked.has(f) && !text.includes(f),
  );
  if (phantom.length === 0) return [];
  return [{
    check: 'unverified-write-path',
    level: 'warn',
    taskId: task.id,
    detail: `write target(s) neither tracked nor named anywhere in the task text (typo/phantom?): ${phantom.slice(0, 4).join(', ')}`,
  }];
}

/**
 * Run every prompt-contract consistency check for one task. Pure: no I/O, no
 * clock, no environment — `trackedFiles` is the caller's `git ls-files`
 * snapshot (the same one buildWorkerPrompt already threads to the template).
 */
/** W7 (D4.5 — ADR-G-019 Amendment): a task whose text/criteria matches an
 *  accepted-ADR machine constraint is contradiction-at-birth: it should have
 *  died in the planner (which now sees the same table); catching it here means
 *  the left-shift leaked and MUST be measured. */
function checkAdrConstraints(task: Task): PromptLintFinding[] {
  const text = `${taskText(task)}\n${criteriaText(task)}`;
  const findings: PromptLintFinding[] = [];
  for (const c of ADR_CONSTRAINTS) {
    if (c.forbiddenPattern.test(text)) {
      findings.push({
        check: 'adr-constraint-violation',
        level: 'warn',
        taskId: task.id,
        detail: `[${c.adrId}] task ${c.message}`,
      });
    }
  }
  return findings;
}

export function lintWorkerPromptContract(
  task: Task,
  trackedFiles?: readonly string[],
): PromptLintFinding[] {
  return [
    ...checkAdrConstraints(task),
    ...checkMentionedWriteAuthority(task),
    ...checkCriteriaTestsResolved(task, trackedFiles),
    ...checkBehaviorPrecedence(task),
    ...checkPersonaTestAuthorship(task),
    ...checkSkillRelevance(task),
    ...checkUnverifiedWritePaths(task, trackedFiles),
  ];
}
