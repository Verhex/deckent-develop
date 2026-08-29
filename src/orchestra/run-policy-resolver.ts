/**
 * run-policy-resolver.ts — plan-time, provider-neutral run policy resolution
 * (RUN-POLICY-DELIVERY-001: the production consumer chain of the 486-017
 * producer).
 *
 * A DIRECTIVES-backed run declares its binding execution constraints in a
 * `## Execution Contract` section. This resolver turns that section into ONE
 * digest-bound {@link RunPolicyPlanAuthority} snapshot per run; the planner
 * stamps the identical snapshot on every task (487-026 task-carried pattern),
 * the prompt compiler renders it from the task, workers echo the digest in
 * their result, and settlement verifies expected == observed.
 *
 * Fail-closed contract:
 * - No DIRECTIVES / no section → `undefined` (the run declares no policy —
 *   a legitimate, explicit absence; nothing renders).
 * - Section PRESENT but without constraint bullets → typed error. A declared
 *   policy can never silently resolve to an empty block (no-silent-empty).
 * - Bounds violations (too many / oversized constraints) → typed error.
 *
 * Source-neutral by design: tenant/org product policies arrive through the
 * same {@link RunPolicyPlanAuthority} shape via their own resolvers; this
 * module only adapts the DIRECTIVES source and never hardcodes repo-specific
 * policy content.
 */

import { DeckentError } from '../core/errors.js';
import {
  createRunPolicyPlanAuthority,
  RunPolicyAuthorityBoundsError,
  type RunPolicyPlanAuthority,
} from '../core/task-types.js';

/** Exact DIRECTIVES heading that declares a run's binding execution policy. */
export const RUN_POLICY_DIRECTIVES_SECTION = '## Execution Contract';
const RUN_POLICY_DIRECTIVES_SECTION_NAME = 'execution contract';
/** Digest source pointer rendered to workers — never the source content itself. */
export const RUN_POLICY_DIRECTIVES_SOURCE_REF = 'DIRECTIVES.md#execution-contract';

/**
 * Match the semantic H2 contract heading without making Markdown title casing
 * an authority boundary. Writers still emit {@link RUN_POLICY_DIRECTIVES_SECTION};
 * retained or externally-authored DIRECTIVES using another case can never make
 * a declared policy disappear silently.
 */
export function isRunPolicyDirectivesSectionHeading(line: string): boolean {
  const heading = /^##\s+(.+?)\s*$/u.exec(line.trim())?.[1];
  return heading?.toLocaleLowerCase('en-US') === RUN_POLICY_DIRECTIVES_SECTION_NAME;
}

/**
 * Resolve the run-wide policy authority from raw DIRECTIVES content.
 * @returns the digest-bound snapshot, or `undefined` when no policy is declared.
 * @throws DeckentError `E_RUN_POLICY_SECTION_EMPTY` when the section exists but
 *         carries no constraint bullets, `E_RUN_POLICY_BOUNDS` on bound breaches.
 */
export function resolveRunPolicyFromDirectives(
  directivesContent: string | null | undefined,
): RunPolicyPlanAuthority | undefined {
  if (!directivesContent || directivesContent.trim().length === 0) return undefined;

  const lines = directivesContent.split(/\r?\n/);
  const start = lines.findIndex(isRunPolicyDirectivesSectionHeading);
  if (start === -1) return undefined;

  const constraints: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    if (/^##\s/.test(line)) break; // next section heading ends the contract
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      constraints.push((bullet[1] ?? '').trim());
      continue;
    }
    // Markdown hard-wrap continuation of the previous bullet (indented text line).
    if (constraints.length > 0 && /^\s{2,}\S/.test(line)) {
      constraints[constraints.length - 1] = `${constraints[constraints.length - 1]} ${line.trim()}`;
    }
  }

  if (constraints.length === 0) {
    throw new DeckentError(
      'E_RUN_POLICY_SECTION_EMPTY',
      `DIRECTIVES declares "${RUN_POLICY_DIRECTIVES_SECTION}" but it contains no constraint bullets — a declared run policy can never silently resolve to an empty prompt block.`,
    );
  }

  try {
    return createRunPolicyPlanAuthority({
      constraints,
      sourceRef: RUN_POLICY_DIRECTIVES_SOURCE_REF,
    });
  } catch (error) {
    if (error instanceof RunPolicyAuthorityBoundsError) {
      throw new DeckentError(
        'E_RUN_POLICY_BOUNDS',
        `DIRECTIVES "${RUN_POLICY_DIRECTIVES_SECTION}" violates the bounded-authority contract: ${error.message}`,
      );
    }
    throw error;
  }
}
