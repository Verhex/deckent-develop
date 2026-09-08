/**
 * Git change-detection provenance contract for `deckent sync` (7104).
 *
 * The SINGLE runtime source for the closed enums that `SyncResult.detection`
 * (`src/cli/commands/sync.ts`, the producer), `SyncAggregateSummary.git`
 * (`sync-aggregate.ts`, the `--json` summary) and the REPL raw-report
 * validators (`src/cli/repl/tool-read-model.ts`, the consumer) all agree on.
 * Every consumer validates against these arrays — never against a literal of
 * its own — so adding a mode or an issue code is one edit, and a producer /
 * consumer drift is a type error, not a silent "no changes".
 *
 * Kept free of `sync.ts` imports on purpose: the REPL must be able to load
 * this contract without pulling the whole sync command module in.
 */

/**
 * How the file lists on a `SyncResult` were established:
 * - 'range': a normal `HEAD~N..HEAD` comparison.
 * - 'root-fallback': the requested commit window reaches (or exceeds) the
 *   full repository history, so every path present at HEAD is reported as
 *   added (the comparison base is "nothing", i.e. the empty tree — derived
 *   from the repository itself, never a fixed object id, so it holds for
 *   both the SHA-1 and the SHA-256 object formats).
 * - 'unavailable': git itself failed at some step — the file lists (and,
 *   for a failed log, the commit count) are empty and MUST NOT be presented
 *   as "no changes". `issue` names the failing step.
 */
export const SYNC_CHANGE_DETECTION_MODES = ['range', 'root-fallback', 'unavailable'] as const;
export type SyncChangeDetectionMode = (typeof SYNC_CHANGE_DETECTION_MODES)[number];

/**
 * Which git step failed when `mode === 'unavailable'`:
 * - 'GIT_LOG_FAILED': `git log --since` failed, so the commit count itself is
 *   unknown (reported as 0 — distinguish it from a SUCCESSFUL zero via this
 *   code; a caller must never treat the two alike).
 * - 'GIT_REV_LIST_FAILED': the history-depth probe (`rev-list --count`) failed.
 * - 'GIT_LS_TREE_FAILED': the root-fallback enumeration (`ls-tree -r HEAD`) failed.
 * - 'GIT_DIFF_FAILED': the range diff (`diff --name-status HEAD~N HEAD`) failed.
 */
export const SYNC_CHANGE_DETECTION_ISSUE_CODES = [
  'GIT_LOG_FAILED',
  'GIT_REV_LIST_FAILED',
  'GIT_LS_TREE_FAILED',
  'GIT_DIFF_FAILED',
] as const;
export type SyncChangeDetectionIssueCode = (typeof SYNC_CHANGE_DETECTION_ISSUE_CODES)[number];

export interface SyncChangeDetectionIssue {
  code: SyncChangeDetectionIssueCode;
  /** First non-empty stderr line of the failing git step, or `exit <status>`. */
  detail: string;
}

export interface SyncChangeDetection {
  mode: SyncChangeDetectionMode;
  issue: SyncChangeDetectionIssue | null;
}

export function isSyncChangeDetectionMode(value: unknown): value is SyncChangeDetectionMode {
  return typeof value === 'string' && (SYNC_CHANGE_DETECTION_MODES as readonly string[]).includes(value);
}

export function isSyncChangeDetectionIssueCode(value: unknown): value is SyncChangeDetectionIssueCode {
  return typeof value === 'string' && (SYNC_CHANGE_DETECTION_ISSUE_CODES as readonly string[]).includes(value);
}
