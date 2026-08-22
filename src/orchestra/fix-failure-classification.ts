// ═══ fix-failure-classification — why a task failed decides what happens next ═══
//
// Before this module the FIX phase had exactly two structural exits from
// "NO_GO → build a fix task": a cascade-skipped result (dead upstream) and an
// exhausted retry budget. Everything else became a same-scope re-run. The rich
// failure evidence the evaluator already gathers — honest-gate violation codes,
// rubric scores, tests-passed, files-changed, lines-added — was concatenated into
// a prose `reason` string and handed to the fix worker's prompt, which left the
// actual decision to whichever model happened to read it.
//
// Measured cost (sprint-496, 2026-08-09): the failure was a scope contradiction —
// the task demanded source verification while its read scope allowed one absent
// directory. No worker can repair that. Three FIX rounds re-ran the identical
// task, burned roughly 210k tokens, and wrote the same honest NO_GO three times.
//
// Two owner rules shape this module (Alperen, 2026-08-10):
//   - The decision belongs to Deckent, not to the Brain's provider. The same
//     failure must route the same way whichever model is behind the Brain; the
//     model is left with the CONTENT of a revision, never the choice of whether
//     to revise. A classifier that lives in a prompt is not a classifier.
//   - The goal is MINIMUM FIX triggering, with FIX still correct as a fallback.
//     A retry is legitimate when the environment failed; it is waste when the
//     task itself, or its scope, is what is broken.
//
// Pure and side-effect free: callers own persistence, events and task creation.

import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import { PROVIDER_LIMIT_DEATH_ZERO_WRITE, type TaskResult } from '../core/task-types.js';

/** Typed, provider-independent evidence for one decisive acceptance failure. */
export interface AcceptanceFailureEvidence {
  readonly criterionId: string;
  readonly evidenceKind: 'file' | 'command' | 'assertion';
  readonly subject: string;
  readonly observedState: 'present' | 'absent' | 'passed' | 'failed';
}

function normalizeFailureSubject(kind: AcceptanceFailureEvidence['evidenceKind'], subject: string): string {
  const trimmed = subject.normalize('NFC').trim();
  if (kind !== 'file') return trimmed.replace(/\s+/gu, ' ');
  const slashNormalized = trimmed.replace(/\\/gu, '/').replace(/^\.\//u, '');
  return posix.normalize(slashNormalized);
}

/**
 * Stable fingerprint of the failure itself, not of task scope or worker prose.
 * Sorting makes requirement order irrelevant while retaining every typed
 * provenance coordinate named by the acceptance contract.
 */
export function buildAcceptanceFailureFingerprint(
  evidence: readonly AcceptanceFailureEvidence[],
): string | null {
  if (evidence.length === 0) return null;
  const canonical = evidence.map(item => ({
    criterionId: item.criterionId.normalize('NFC').trim(),
    evidenceKind: item.evidenceKind,
    subject: normalizeFailureSubject(item.evidenceKind, item.subject),
    observedState: item.observedState,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
}

/**
 * What the run should do with a failed task. Ordered from cheapest to most
 * disruptive; `escalateReplan` is the conservative default for anything this
 * module cannot positively identify.
 */
export type FixDisposition =
  /** Environment failed, the work definition is sound — re-run it unchanged. */
  | 'retrySame'
  /** The worker claimed completion without doing the work — same task, hardened. */
  | 'hardenSame'
  /** Substantially complete, one narrow defect — correct that, do not re-run all. */
  | 'narrowCorrection'
  /** The declared scope or authority is what broke — the scope must change first. */
  | 'reviseScope'
  /** The task itself cannot succeed as written — Brain must re-plan it. */
  | 'escalateReplan';

export interface FixClassification {
  readonly disposition: FixDisposition;
  /** Stable machine code for journals and tests — never a prose sentence. */
  readonly code: string;
  /** One operator-facing line explaining the routing decision. */
  readonly reason: string;
  /** True when a fix task may be created; false means park for an operator/Brain decision. */
  readonly allowsFixTask: boolean;
}

/** Honest-gate violation codes the evaluator and worker emit into `notes`. */
const SCOPE_VIOLATION_CODES = ['BOUNDARY_VIOLATION', 'SCOPE_VIOLATION_OR_EMPTY_WRITE'] as const;

/**
 * Infrastructure signatures. These say the environment died, not that the work
 * was wrong: an OOM/SIGKILL exit, a coordinator that crashed before the backend
 * was even prepared, or a runtime budget circuit breaker that cut a worker
 * mid-flight. Re-running the identical task is the correct response.
 */
const INFRASTRUCTURE_MARKERS = [
  'coordinator-crashed-before-docker-prepare',
  'runtime budget circuit breaker',
  'budget exceeded',
  'exited without result',
  'container was likely oom-killed',
  'econnreset',
  'etimedout',
  'socket hang up',
  'network',
  'rate limit',
] as const;

/** SIGKILL/OOM exit status; the worker was killed rather than finishing badly. */
const SIGKILL_EXIT_CODE = 137;

function notesOf(result: TaskResult | null | undefined): string {
  return (result?.notes ?? '').toLowerCase();
}

function hasScopeViolation(result: TaskResult | null | undefined): string | undefined {
  const notes = result?.notes ?? '';
  const hit = SCOPE_VIOLATION_CODES.find(code => notes.includes(code));
  if (hit) return hit;
  // The host-authored attribution hold is authority even when prose says otherwise.
  if (result?.workAttribution?.state === 'HOLD'
    && (result.workAttribution.claimedOutsideScope?.length ?? 0) > 0) {
    return 'CLAIM_OUTSIDE_WRITE_SCOPE';
  }
  return undefined;
}

export interface ClassifyFixFailureInput {
  readonly result: TaskResult | null | undefined;
  /** Process exit status when the runtime captured one. */
  readonly exitCode?: number | null;
  /**
   * True when the task's own acceptance criteria are unsatisfiable as written —
   * e.g. a scope contradiction the worker reported rather than invented. The
   * caller derives this from evaluation evidence; absent means "not established".
   */
  readonly taskDefinitionUnsatisfiable?: boolean;
  /**
   * How many attempts in THIS logical lineage already ended as a NO_GO that
   * changed nothing. Structural, host-measured evidence — never worker prose.
   *
   * Repetition is the proof. A worker saying "this task cannot be done" is a
   * claim; a lineage that has produced consecutive zero-diff NO_GOs has already
   * demonstrated that re-running does not work, whatever anyone says about why.
   * Measured twice — sprint-496 and sprint-502 each burned three rounds this way.
   * A typed worker flag would instead hand every worker a lever for declining
   * work; counting outcomes cannot be talked into anything.
   */
  readonly priorZeroDiffAttempts?: number;
  /** Current decisive acceptance failure, derived from typed criterion evidence. */
  readonly acceptanceFailureFingerprint?: string | null;
  /** Fingerprint persisted on the FIX task when its parent failed. */
  readonly priorAcceptanceFailureFingerprint?: string | null;
}

/**
 * Consecutive zero-diff NO_GOs that make re-running provably futile. Two — the
 * original attempt plus one fix — is enough: the same definition has by then
 * failed to produce a single changed line twice, and each further round spends a
 * whole worker to re-learn what is already in hand.
 */
export const ZERO_DIFF_FUTILITY_THRESHOLD = 2;

/**
 * Decide how a NO_GO should be handled. Never throws: an unreadable or absent
 * result is exactly the case that must NOT quietly become a retry.
 */
export function classifyFixFailure(input: ClassifyFixFailureInput): FixClassification {
  const { result, exitCode } = input;
  const notes = notesOf(result);

  // 0. Provider-limit death with a measured zero-write diff (born 3324). This
  //    runs FIRST for two reasons. It is host-minted into `workAttribution` —
  //    structural evidence that outranks whatever the notes prose says — and it
  //    must reach the decision before the zero-diff futility rule below, which
  //    would otherwise read a lineage the provider kept killing as a task
  //    definition that cannot be satisfied. The work definition was never
  //    tested: the provider ran out of allowance before the worker wrote a
  //    line, so the honest response is a clean restart of the same task.
  if (result?.workAttribution?.state === 'HOLD'
    && result.workAttribution.reasonCode === PROVIDER_LIMIT_DEATH_ZERO_WRITE) {
    return {
      disposition: 'retrySame',
      code: 'PROVIDER_LIMIT_DEATH_ZERO_WRITE',
      reason: 'the provider hit its limit and the attempt died having written nothing, so the '
        + 'task definition is untested and the same task is restarted cleanly',
      allowsFixTask: true,
    };
  }

  // 1. Infrastructure — the environment failed, the work definition did not.
  if (exitCode === SIGKILL_EXIT_CODE || INFRASTRUCTURE_MARKERS.some(m => notes.includes(m))) {
    return {
      disposition: 'retrySame',
      code: 'INFRASTRUCTURE_FAILURE',
      reason: 'the execution environment failed, so the same task is re-run unchanged',
      allowsFixTask: true,
    };
  }

  // 2. Scope or authority violation — re-running the same scope reproduces it.
  const violation = hasScopeViolation(result);
  if (violation) {
    return {
      disposition: 'reviseScope',
      code: violation,
      reason: `the declared scope or write authority was violated (${violation}), `
        + 'so the scope must be revised before this work is attempted again',
      allowsFixTask: false,
    };
  }

  // 3. A FIX that observes the exact same typed acceptance failure as its
  //    parent made no semantic progress. Stop after that one bounded attempt.
  //    Scope/authority fingerprints never enter these fields, and changed
  //    evidence deliberately falls through to an ordinary bounded FIX.
  if (input.acceptanceFailureFingerprint
    && input.priorAcceptanceFailureFingerprint
    && input.acceptanceFailureFingerprint === input.priorAcceptanceFailureFingerprint) {
    return {
      disposition: 'escalateReplan',
      code: 'REPEATED_ACCEPTANCE_FAILURE',
      reason: 'the FIX reproduced the identical typed acceptance failure, so another '
        + 'fix-of-fix is refused and the task must be re-planned',
      allowsFixTask: false,
    };
  }

  // 4. The task cannot succeed as written — no worker can repair its definition.
  //    Either the caller established that directly, or the lineage has already
  //    proven it by producing repeated NO_GOs that changed nothing.
  const futileRepetition = (input.priorZeroDiffAttempts ?? 0) >= ZERO_DIFF_FUTILITY_THRESHOLD
    && (result?.filesChanged?.length ?? 0) === 0
    && (result?.linesAdded ?? 0) === 0;
  if (input.taskDefinitionUnsatisfiable === true || futileRepetition) {
    return {
      disposition: 'escalateReplan',
      code: input.taskDefinitionUnsatisfiable === true
        ? 'TASK_DEFINITION_UNSATISFIABLE'
        : 'REPEATED_ZERO_DIFF_NO_GO',
      reason: input.taskDefinitionUnsatisfiable === true
        ? 'the task cannot be satisfied as written, so it is escalated for re-planning '
          + 'instead of being re-run against the same definition'
        : `${input.priorZeroDiffAttempts} prior attempts in this lineage changed nothing, so `
          + 're-running the same definition is provably futile and it is escalated instead',
      allowsFixTask: false,
    };
  }

  // 4. Dishonest completion claim — the work is undone, but the task is sound.
  //    Distinct from a retry: the SAME task is re-issued with a hardened
  //    instruction, because a plain re-run invites the same stub.
  if (notes.includes('worker-self-stub')) {
    return {
      disposition: 'hardenSame',
      code: 'DISHONEST_COMPLETION_CLAIM',
      reason: 'the worker claimed completion without performing the work, so the same task '
        + 'is re-issued with a hardened instruction rather than trusted prose',
      allowsFixTask: true,
    };
  }

  // 5. Substantially complete, one narrow defect. Owner note (2026-08-10): a
  //    small violation should not re-run work that is essentially done. Real
  //    files changed plus real lines written is the evidence that work happened;
  //    the remaining defect is corrected narrowly.
  const filesChanged = result?.filesChanged?.length ?? 0;
  const linesAdded = result?.linesAdded ?? 0;
  if (filesChanged > 0 && linesAdded > 0 && result?.testsPassed === false) {
    return {
      disposition: 'narrowCorrection',
      code: 'SUBSTANTIALLY_COMPLETE_VERIFICATION_GAP',
      reason: `real work landed (${filesChanged} file(s), ${linesAdded} line(s) added) but `
        + 'verification did not pass, so only that gap is corrected',
      allowsFixTask: true,
    };
  }

  // 6. Ordinary shortfall — a worker ran, produced a result and fell short of the
  //    acceptance criteria. This is the case the FIX phase exists to serve, and it
  //    stays a fix task. An earlier revision of this module escalated it as
  //    "unclassified"; the existing suite caught that immediately by failing every
  //    "NORMAL NO_GO creates a fix task" test, which is exactly right — the owner
  //    asked for MINIMUM FIX triggering with FIX still functional as a fallback,
  //    not for the fallback to be switched off.
  if (result) {
    return {
      disposition: 'retrySame',
      code: 'ACCEPTANCE_SHORTFALL',
      reason: 'the worker ran and reported a result that did not meet the acceptance '
        + 'criteria, which is the ordinary case a fix attempt is for',
      allowsFixTask: true,
    };
  }

  // 7. No result at all — nothing was measured, so nothing can be classified.
  //    Owner decision (2026-08-10): escalate rather than re-run on an unproven
  //    assumption. This is genuinely unidentifiable, unlike case 6.
  return {
    disposition: 'escalateReplan',
    code: 'NO_RESULT_EVIDENCE',
    reason: 'no result evidence exists for this task, so the failure cannot be classified '
      + 'and is escalated for a decision instead of re-run blindly',
    allowsFixTask: false,
  };
}
