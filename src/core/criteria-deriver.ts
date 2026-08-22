// ═══ Criteria Deriver — kind × stack aware GO/NO-GO base (WM-7) ══════════════
// Replaces the hardcoded `Tests pass; tsc clean` base in extractGoNogoCriteria.
// Task acceptance describes the task result; repository-wide verification belongs
// to the wave-level Brain contract. Pure + total: unknown stacks degrade to a
// neutral result criterion (never a language-specific command).
//
// This module is the KIND→shape mapper only. Stack commands may be passed for API
// compatibility but are deliberately ignored at task-criteria placement. See
// ADR-019 (language-agnostic verify),
// ADR-070 (evaluation integrity / zero-hard-code), ADR-053 (TaskKind).

import type { TaskKind, TechStackKind } from './work-model.js';

export interface DerivedBaseCriteria {
  goCriteria: string;
  noGoCriteria: string;
  techDebtAcceptable: string;
}

export interface StackCommands {
  /** Wave-level verification metadata. Task criteria derivation does not emit it. */
  build?: string;
  test?: string;
  /** Dedicated no-emit/no-artifact verification command (e.g. `npx tsc --noEmit`, `cargo check`),
   *  distinct from `build`. OPTIONAL — some (opts.commands) call sites only carry build/test and
   *  must remain assignable here. When present, this REPLACES the `build` proof line in goCriteria
   *  (a passing typecheck already implies the build compiles; naming both would be redundant and,
   *  for languages where `build` emits dist artifacts mid-sprint, actively unsafe to suggest). */
  typecheck?: string;
  /** Wave-level targeted test metadata; authored task Test criteria are composed by the caller. */
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
  // Commands remain part of stack discovery for wave verification, but they are
  // intentionally not projected into every task's acceptance contract.
  void commands;
  const stackContext = stack === 'generic' ? '' : ` for the ${stack} stack`;
  return {
    goCriteria: `Implementation satisfies the task requirements${stackContext}`,
    noGoCriteria: 'Implementation does not satisfy the task requirements',
    techDebtAcceptable: 'Minor style issues that do not affect the task requirements',
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
