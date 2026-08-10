// ═══ replan-proposal — what an escalated failure needs, without granting it ═══
//
// `classifyFixFailure` routes two classes away from a fix task: `reviseScope`
// (the declared scope or write authority is what broke) and `escalateReplan`
// (the task cannot succeed as written). Both were parked as a typed PAUSE with a
// reason string, which stops the waste but leaves the operator to reconstruct
// the situation by hand.
//
// This module turns that stop into an actionable record. It does NOT grant
// anything. `fix-repair-authority` deliberately refuses to let worker prose
// widen scope — "worker-authored prose is evidence for diagnosis, never scope
// authority" — and ADR-G-020 puts the write-authority contract under host
// control. An automatic re-plan that quietly added the directory a worker asked
// for would defeat both. So the proposal states the case and names the exact
// paths the failure referenced, separating those already inside the task's
// reviewed directories from those that would require a NEW grant. The decision
// stays with the owner (and, later, an approval-gated Brain step).
//
// Pure: callers own persistence, events and any approval workflow.

import type { TaskResult } from '../core/task-types.js';
import type { FixClassification } from './fix-failure-classification.js';

/** A path the failed attempt referenced, with whether it is already authorised. */
export interface ReplanPathRequest {
  readonly path: string;
  readonly access: 'read' | 'write';
  /** True when the path already sits inside a directory the task declared. */
  readonly alreadyReviewed: boolean;
}

export interface ReplanProposal {
  readonly schemaVersion: 1;
  readonly taskId: string;
  /** The classifier's verdict — the reason this task cannot simply be re-run. */
  readonly classificationCode: string;
  readonly disposition: FixClassification['disposition'];
  readonly summary: string;
  /** The authority the task ran with, verbatim. */
  readonly currentScope: {
    readonly directories: readonly string[];
    readonly filesRead: readonly string[];
    readonly filesWrite: readonly string[];
  };
  /** Paths the failure named. Never granted here — only stated. */
  readonly requestedPaths: readonly ReplanPathRequest[];
  /** True when satisfying this task would require authority it does not hold. */
  readonly requiresNewAuthority: boolean;
  /** What a human (or an approval-gated Brain step) must decide. */
  readonly decisionRequired: string;
}

export interface BuildReplanProposalInput {
  readonly taskId: string;
  readonly classification: FixClassification;
  readonly scope: {
    readonly directories?: readonly string[];
    readonly filesRead?: readonly string[];
    readonly filesWrite?: readonly string[];
  } | undefined;
  readonly result: TaskResult | null | undefined;
}

/**
 * Repo-relative path shapes a worker's notes plausibly reference. The trailing
 * class deliberately excludes `.` so a sentence-final period is not captured as
 * part of the filename — measured on sprint-503, where a proposal recorded
 * `src/core/run-status-read-model.ts.` and would have sent an operator hunting
 * for a file that does not exist.
 */
const PATH_IN_PROSE =
  /(?:^|[\s'"`(])((?:src|tests|docs|scripts|\.deckent)\/[A-Za-z0-9._/-]*[A-Za-z0-9_/-])/g;

function normalizeDir(dir: string): string {
  return dir.replace(/^\.\//, '').replace(/\/+$/, '');
}

function insideReviewed(path: string, directories: readonly string[]): boolean {
  const p = path.replace(/^\.\//, '');
  return directories.some((dir) => {
    const d = normalizeDir(dir);
    return d.length > 0 && p.startsWith(`${d}/`);
  });
}

/**
 * Extract the paths a failed attempt referenced. Evidence only: appearing here
 * neither grants access nor asserts the path is correct — it records what the
 * attempt said it needed so a human can judge the request.
 */
export function extractReferencedPaths(
  result: TaskResult | null | undefined,
  scope: BuildReplanProposalInput['scope'],
): ReplanPathRequest[] {
  const notes = result?.notes ?? '';
  const directories = scope?.directories ?? [];
  const declaredWrites = new Set((scope?.filesWrite ?? []).map(p => p.replace(/^\.\//, '')));
  const seen = new Set<string>();
  const out: ReplanPathRequest[] = [];
  for (const match of notes.matchAll(PATH_IN_PROSE)) {
    const path = match[1];
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);
    out.push({
      path,
      // A path the task already planned to write is a write request; anything
      // else the notes name is, at most, a read the attempt could not perform.
      access: declaredWrites.has(path) ? 'write' : 'read',
      alreadyReviewed: insideReviewed(path, directories),
    });
  }
  // Host-authored attribution outranks prose: a claim outside the write scope is
  // a write request whether or not the notes mention it.
  for (const claimed of result?.workAttribution?.claimedOutsideScope ?? []) {
    if (seen.has(claimed)) continue;
    seen.add(claimed);
    out.push({ path: claimed, access: 'write', alreadyReviewed: false });
  }
  return out;
}

/**
 * Build the record an escalated failure hands to its decision owner. Returns
 * `null` for dispositions that keep a fix task — those need no proposal.
 */
export function buildReplanProposal(input: BuildReplanProposalInput): ReplanProposal | null {
  const { classification } = input;
  if (classification.allowsFixTask) return null;

  const requestedPaths = extractReferencedPaths(input.result, input.scope);
  const requiresNewAuthority = requestedPaths.some(p => !p.alreadyReviewed);

  const decisionRequired = classification.disposition === 'reviseScope'
    ? 'Decide whether this task keeps its scope and is re-run, or is re-planned with a '
      + 'corrected scope. Any additional path must be granted by the owner — a failed '
      + 'attempt naming a path is evidence, never authority.'
    : 'Decide whether this task is re-planned with a changed definition, dropped, or '
      + 'deferred. Re-running it unchanged cannot succeed.';

  return {
    schemaVersion: 1,
    taskId: input.taskId,
    classificationCode: classification.code,
    disposition: classification.disposition,
    summary: classification.reason,
    currentScope: {
      directories: [...(input.scope?.directories ?? [])],
      filesRead: [...(input.scope?.filesRead ?? [])],
      filesWrite: [...(input.scope?.filesWrite ?? [])],
    },
    requestedPaths,
    requiresNewAuthority,
    decisionRequired,
  };
}
