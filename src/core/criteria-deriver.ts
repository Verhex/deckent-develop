// ═══ Criteria Deriver — kind × stack aware GO/NO-GO base (WM-7) ══════════════
// Replaces the hardcoded `Tests pass; tsc clean` base in extractGoNogoCriteria.
// A doc/mail/audit task must NOT be judged by a build/test; a Go/Python/C++ code
// task must be judged by ITS stack's commands, never `tsc`. Pure + total: unknown
// kind/stack degrade to a neutral, stack-agnostic phrasing (never re-hardcodes tsc).
//
// This module is the KIND→shape mapper only. The build/test COMMANDS come from
// the single source (stack-detector STACK_COMMANDS) and are passed in — no second
// command table here (avoids drift). See ADR-019 (language-agnostic verify),
// ADR-070 (evaluation integrity / zero-hard-code), ADR-053 (TaskKind).

import type { TaskKind, TechStackKind } from './work-model.js';

export interface DerivedBaseCriteria {
  goCriteria: string;
  noGoCriteria: string;
  techDebtAcceptable: string;
}

export interface StackCommands {
  build?: string;
  test?: string;
  /** Dedicated no-emit/no-artifact verification command (e.g. `npx tsc --noEmit`, `cargo check`),
   *  distinct from `build`. OPTIONAL — some (opts.commands) call sites only carry build/test and
   *  must remain assignable here. When present, this REPLACES the `build` proof line in goCriteria
   *  (a passing typecheck already implies the build compiles; naming both would be redundant and,
   *  for languages where `build` emits dist artifacts mid-sprint, actively unsafe to suggest). */
  typecheck?: string;
  /** Specific test file paths to target (e.g. extracted from task Files/Kanıt). When absent
   *  the test criterion uses the "targeted test file(s)" generic phrase rather than the bare
   *  run-all command, avoiding a "run the full suite" implication in goCriteria. */
  testFiles?: string[];
}

/** TaskKinds whose definition-of-done is artifacts-on-disk, NOT a build/test. */
const NON_BUILD_KINDS: ReadonlySet<TaskKind> = new Set<TaskKind>([
  'documentation',
  'design',
  'audit',
  'data',
]);

export function isNonBuildKind(kind: TaskKind): boolean {
  return NON_BUILD_KINDS.has(kind);
}

/**
 * Derive the BASE go/no-go criteria from the task's {@link TaskKind} × the
 * project's {@link TechStackKind}. The caller composes any task-specific proof
 * lines on top (see extractGoNogoCriteria).
 */
export function deriveBaseCriteria(
  kind: TaskKind,
  stack: TechStackKind,
  commands?: StackCommands,
): DerivedBaseCriteria {
  switch (kind) {
    case 'documentation':
    case 'design':
      return {
        goCriteria: 'Target file(s) written to disk with the required content',
        noGoCriteria: 'Target file(s) missing or empty',
        techDebtAcceptable: 'Minor formatting or wording issues',
      };
    case 'audit':
      return {
        goCriteria: 'Findings written to the scope file(s) with evidence/citations',
        noGoCriteria: 'No findings written, or the scope file is empty',
        techDebtAcceptable: 'Minor gaps in finding coverage',
      };
    case 'data':
      return {
        goCriteria: 'Data outputs produced and schema/row checks pass',
        noGoCriteria: 'Output missing or schema/row validation fails',
        techDebtAcceptable: 'Minor data-quality warnings',
      };
    default:
      // code-development / test / refactor / security / devops / config / generic
      return deriveCodeCriteria(stack, commands);
  }
}

function deriveCodeCriteria(stack: TechStackKind, commands?: StackCommands): DerivedBaseCriteria {
  const build = commands?.build?.trim();
  const typecheck = commands?.typecheck?.trim();
  const test = commands?.test?.trim();
  const testFiles = commands?.testFiles;
  const parts: string[] = [];
  // Preference chain: a dedicated typecheck command REPLACES the build proof line (never both —
  // e.g. `npx tsc --noEmit` passes, not `npx tsc` succeeds); absent that, fall back to build.
  if (typecheck) {
    parts.push(`\`${typecheck}\` passes`);
  } else if (build) {
    parts.push(`\`${build}\` succeeds`);
  }
  if (test) {
    // Use a targeted-file command when file paths are known; otherwise use the
    // generic "targeted" phrase so goCriteria never implies running the full suite
    // (bare `npx vitest run` would trigger that implication — Sprint 273 T-009).
    if (testFiles && testFiles.length > 0) {
      parts.push(`\`${test} ${testFiles.join(' ')}\` passes`);
    } else {
      parts.push('the targeted test file(s) for the modules you changed pass');
    }
  }
  // No detected commands → neutral phrasing naming the stack (never hardcode tsc).
  const goCriteria = parts.length > 0
    ? parts.join('; ')
    : stack !== 'generic'
      ? `Project builds and tests pass for the ${stack} stack`
      : 'Build succeeds; tests pass';
  return {
    goCriteria,
    noGoCriteria: 'Build fails or tests fail',
    techDebtAcceptable: 'Minor style issues if build and tests pass',
  };
}

/**
 * Strip leading markdown bold/label prefixes from a proof-line.
 *
 * Handles both well-formed and asymmetric bold markers that appear in DIRECTIVES:
 *   `**Kanıt:** content`  → `content`
 *   `*Kanıt:** content`   → `content`  (single-star prefix, asymmetric)
 *   `- **Proof:** content` → `content`
 *   `- \`grep ...\``       → `` \`grep ...\` ``
 *
 * Exported so callers (e.g. sprint-utils.ts extractGoNogoCriteria) can reuse this
 * normalizer to prevent `*Kanıt:**` leaking into goCriteria strings.
 */
export function cleanProofLine(line: string): string {
  let s = line.trimStart();
  // Strip leading list marker (- or *) followed by at least one space
  s = s.replace(/^[-*]\s+/, '');
  // Strip bold label prefix in form: **Label:** or *Label:**
  // The colon comes AFTER the label text and BEFORE any closing stars.
  // Handles both symmetric `**Label:**` and asymmetric `*Label:**` (single leading star).
  s = s.replace(/^\*{1,2}[^*:\n]+:\*{0,2}\s*/, '');
  return s;
}
