// ─── Cross-Verify Prompt Builder (XVER-1 Task 6) ────────────────────────────
// Builds the adversarial "refute" prompt given to the verifier worker, and
// parses the VERDICT line from its output.
//
// Design notes:
// - Prompt text is ENGLISH (worker-prompt standard: mechanism content, not user-surface UI)
//   → no getMessage() calls; i18n applies only to user-facing strings (ADR-032)
// - Pure: no I/O, no LLM calls, no process spawning
// - ADR-008: core/ → no orchestra/ imports

import type { GoNoGoCriteria } from './task-types.js';

// ─── Input types ─────────────────────────────────────────────────────────────

/**
 * Minimal task fields needed to build the adversarial prompt.
 * A full {@link Task} object is structurally assignable here.
 */
export interface RefutePromptTask {
  title?: string;
  description?: string;
  goNogo: GoNoGoCriteria;
}

/**
 * Minimal result fields the prompt builder reads.
 * A full {@link TaskResult} object is structurally assignable here.
 */
export interface RefutePromptResult {
  taskId?: string;
  filesChanged?: string[];
  selfAssessment?: string;
  notes?: string;
}

/** Options for {@link buildRefutePrompt}. */
export interface BuildRefutePromptOpts {
  /** Name/id of the verifier (used for context labelling, e.g. 'codex', 'gemini'). */
  verifier?: string;
}

// ─── buildRefutePrompt ───────────────────────────────────────────────────────

/**
 * Build the adversarial "refute" prompt for the cross-verifier worker.
 *
 * The prompt instructs the verifier to INDEPENDENTLY verify the original result
 * by inspecting real disk state (git diff / actual files), hunt for hidden bugs,
 * missing criteria, or security gaps — and end with a mandatory VERDICT line:
 *
 *   `VERDICT: REFUTED <reason>`
 *   `VERDICT: CONFIRMED <evidence>`
 *
 * The verifier's job is to REFUTE, not to rubber-stamp. Self-confirmation bias
 * is explicitly broken by the framing.
 */
export function buildRefutePrompt(
  task: RefutePromptTask,
  result: RefutePromptResult,
  opts: BuildRefutePromptOpts = {},
): string {
  const verifierLabel = opts.verifier ? ` (verifier: ${opts.verifier})` : '';
  const taskTitle = task.title ?? '(untitled)';
  const taskDescription = task.description?.trim() ?? '(no description)';
  const filesChanged = result.filesChanged?.length
    ? result.filesChanged.join('\n  - ')
    : '(none reported)';
  const selfAssessment = result.selfAssessment ?? '(unknown)';
  const notes = result.notes?.trim() ?? '(none)';
  const goCriteria = task.goNogo.goCriteria.trim();
  const noGoCriteria = task.goNogo.noGoCriteria.trim();

  return `# Adversarial Cross-Verification${verifierLabel}

You are an INDEPENDENT verifier. Your mission is to REFUTE this task result, not to confirm it.
Approach every claim with skepticism. Do NOT take the original worker's self-assessment at face value.

## Task Under Verification

**Title:** ${taskTitle}

**Description:**
${taskDescription}

## Original Worker Result

**Self-Assessment:** ${selfAssessment}

**Files Changed:**
  - ${filesChanged}

**Worker Notes:**
${notes}

## GO Criteria (must ALL be satisfied for the result to be valid)

${goCriteria}

## NO-GO Criteria (any one of these means the result is invalid)

${noGoCriteria}

## Your Verification Instructions

1. **Inspect real disk state** — run \`git diff\` or read the actual changed files listed above.
   Do NOT rely on the worker's self-reported notes alone.

2. **Check each GO criterion** — verify it is ACTUALLY satisfied by the code on disk, not just claimed.

3. **Probe for hidden failures:**
   - Logic errors, off-by-one bugs, incorrect conditionals
   - Missing edge cases or error handling
   - Security vulnerabilities, injection risks, auth bypasses, missing input validation
   - Type errors or runtime crashes the type-checker cannot catch
   - Tests that pass vacuously or do not cover the stated behavior

4. **Challenge NO-GO criteria** — check whether any disqualifying condition is actually present.

5. **Be adversarial:** your job is to find reasons to REFUTE. Only output CONFIRMED if you have
   examined the actual code and found zero valid grounds for refutation.

## Required Output Format

End your response with EXACTLY one of these verdict lines (last non-empty line):

  VERDICT: REFUTED <concise reason — what specifically is wrong or missing>
  VERDICT: CONFIRMED <concise evidence — what you verified and found correct>

If you cannot determine the verdict with confidence, still output one of the two forms with
an honest explanation. Do NOT omit the VERDICT line.`;
}

// ─── RefuteVerdict ───────────────────────────────────────────────────────────

/**
 * Parsed outcome of the adversarial cross-verifier's output.
 */
export interface RefuteVerdict {
  verdict: 'refuted' | 'confirmed' | 'unclear';
  /** Reason text extracted from the VERDICT line, or a diagnostic when unclear. */
  reason: string;
}

// Matches "VERDICT: REFUTED <anything>" — captured group is the reason.
const REFUTED_RE = /VERDICT:\s*REFUTED\s+(.+)/i;
// Matches "VERDICT: CONFIRMED <anything>" — captured group is the evidence.
const CONFIRMED_RE = /VERDICT:\s*CONFIRMED\s+(.+)/i;

/**
 * Parse the adversarial verifier's raw output into a structured verdict.
 *
 * Extracts the final VERDICT line using regex. If no recognised pattern is
 * found the verdict is 'unclear' (honest non-result — never a silent success).
 *
 * @param output raw text output from the verifier worker
 */
export function parseRefuteVerdict(output: string): RefuteVerdict {
  if (typeof output !== 'string' || output.trim() === '') {
    return { verdict: 'unclear', reason: 'empty or non-string output from verifier' };
  }

  const refutedMatch = REFUTED_RE.exec(output);
  if (refutedMatch) {
    return { verdict: 'refuted', reason: refutedMatch[1]!.trim() };
  }

  const confirmedMatch = CONFIRMED_RE.exec(output);
  if (confirmedMatch) {
    return { verdict: 'confirmed', reason: confirmedMatch[1]!.trim() };
  }

  // No recognised VERDICT line — return unclear with a truncated excerpt.
  const excerpt = output.trim().slice(0, 120).replace(/\n/g, ' ');
  return { verdict: 'unclear', reason: `no VERDICT line found; output excerpt: "${excerpt}"` };
}
