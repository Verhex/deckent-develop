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
  const test = commands?.test?.trim();
  const parts: string[] = [];
  if (build) parts.push(`\`${build}\` succeeds`);
  if (test) parts.push(`\`${test}\` passes`);
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
