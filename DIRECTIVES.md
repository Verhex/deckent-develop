# DIRECTIVES — MINI-SPRINT: F3 implementer + U4-026 integration + F4-core sync (spec: .analysis/f3-sync-mini-spec-2026-07-14.md)

## Goal
Pre-SURF finish line (Alperen "ONAYLANDI" 2026-07-14). Three integrity gaps close:
(1) F3 — a neutral `implementer` builtin takes over the `implementation: 7` routing floor
from `refactorer` (whose zero-change mandate fights implementation work); Sprint-205's
"implementation routes to a builtin over temp agents" guarantee is PRESERVED.
(2) U4-026 — the cascade-skipped guidance-mode integration e2e is delivered.
(3) F4-core — `deckent sync` EISDIR crash fixed + three-way builtin→shadow prompt-file sync.
Read the spec FIRST: `.analysis/f3-sync-mini-spec-2026-07-14.md` (its §8 Blast Radius is binding context).

## 🔒 BINDING (every task)
- Write ONLY to your own Files list · real `.deckent/` is READ-ONLY (tests use tmpdir) · never touch `.brain/` or `.tasks/` · no git stash/reset · `npm run build` FORBIDDEN · notes ONE STRING · self-assessment HONEST.
- No string-throw (typed-error family). No report/summary markdown outside `.analysis/u4-olcum/`.
- Tests hermetic (tmpdir, no spawnSync). `tsc` alone is NOT proof — behavior tests/runs required.

## Task 1: F3 neutral implementer builtin agent
- Files: src/core/builtins/agents/implementer/agent.json, src/core/builtins/agents/implementer/PROMPT.md
- Scope: src/core/builtins/agents/implementer/
- Dependencies: none
### Description
Create the neutral feature-builder builtin. agent.json (manifestVersion 2, mirror the shape
of src/core/builtins/agents/bug-fixer/agent.json): id `implementer`, activation rules
`intent.primary: implementation → score 7` (the floor moving over from refactorer — spec §8),
expertise/triggerKeywords for general feature construction, preferredModel sonnet,
role implementer (default). The prompt file: a persona that BUILDS — think-before-code,
follow existing patterns, tests ship with code, honest self-assessment; explicitly NO
zero-functional-change mandate (that is refactorer's). Include guidance marker slices
(Task-1 grammar of sprint-443: implementation + bugfix + default, each 5-15 lines) and keep
the CORE body (above/outside the marked blocks) under the 4KB catalog cap.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/implementer → exit 0.
### goNogo
- goCriteria: validator exit 0; npx vitest run tests/core/builtins/ green (catalog conventions incl. core-body cap); manifest activation carries implementation score 7.
- nogo: any zero-functional-change wording in the persona NO_GO; core body over 4096 bytes NO_GO.

## Task 2: F3 refactorer demotion to refactor-only
- Files: src/core/builtins/agents/refactorer/agent.json
- Scope: src/core/builtins/agents/refactorer/
- Dependencies: Task 1
### Description
Remove the `intent.primary: implementation → score 7` activation rule from refactorer's
manifest — it becomes refactor-only (`intent.primary: refactor → 10` stays). Nothing else
in the manifest changes. The floor now lives on implementer (Task 1), so the Sprint-205
anti-temp guarantee holds; do NOT weaken minScore or other rules.
### goNogo
- goCriteria: refactorer manifest has no implementation activation rule; refactor rule intact; JSON valid (npx vitest run tests/core/builtins/ green).
- nogo: any change beyond deleting the one activation rule NO_GO.

## Task 3: F3 routing pins move to the implementer era
- Files: tests/core/routing-impl-builtin.test.ts, tests/core/routing-live-diversity.test.ts, tests/core/routing-diversity-guard.test.ts, tests/orchestra/agent-routing-health.test.ts
- Scope: tests/core/, tests/orchestra/
- Dependencies: Task 1, Task 2
### Description
Update the Sprint-205-era pins: a plain implementation-intent task now selects `implementer`
(score 7) over temp agents (6) — same guarantee, new owner; refactorer wins ONLY
intent=refactor fixtures; diversity/health suites' expected-agent lists gain implementer
where they enumerated refactorer for implementation shapes. Do NOT weaken any guard —
every assertion that protected "builtin beats temp" and "reviewer personas don't build"
must survive with the new owner. Run each file after editing.
### goNogo
- goCriteria: npx vitest run tests/core/routing-impl-builtin.test.ts tests/core/routing-live-diversity.test.ts tests/core/routing-diversity-guard.test.ts tests/orchestra/agent-routing-health.test.ts green; implementation→implementer and refactor→refactorer both pinned; temp-loses pin survives.
- nogo: deleting a guard assertion instead of re-aiming it NO_GO.

## Task 4: F4 sync EISDIR reproduce and fix
- Files: src/cli/commands/sync.ts, tests/cli/sync-eisdir.test.ts
- Scope: src/cli/, src/orchestra/, tests/cli/
- Dependencies: none
### Description
REPRODUCE-FIRST: `deckent sync` (adapter path; `--dry-run` works, the write path crashes)
fails with `Error: EISDIR: illegal operation on a directory, read` — live repro 2026-07-14
on this repo. Find the read call that hits a directory (likely an adapter-file sweep that
readFileSync's a directory entry), fix with an isFile guard or dirent-type filter, and make
per-entry failures typed + collected so one bad entry cannot abort the sweep (spec §3).
Hermetic regression test: tmpdir fixture with a directory where a file is expected → sync
completes and reports the entry, no throw. If the defect lives in a module sync.ts delegates
to, follow it there (scope covers src/cli/ and src/orchestra/) and name it in your result.
### goNogo
- goCriteria: failing-then-green regression test in tests/cli/sync-eisdir.test.ts; per-entry typed error collection (no sweep abort); dry-run output unchanged for a clean fixture.
- nogo: skipping reproduction and guessing the fix NO_GO; swallowing errors silently NO_GO.

## Task 5: F4 three-way builtin to shadow prompt-file sync
- Files: src/cli/commands/sync.ts, src/core/agent-prompt-sync.ts, tests/core/agent-prompt-sync.test.ts
- Scope: src/cli/, src/core/, tests/core/
- Dependencies: Task 4
### Description
New module `src/core/agent-prompt-sync.ts`: propagate builtin agent prompt files
(src/core/builtins/agents/<id>/) to their `.deckent/agents/<id>/` shadows with three-way
protection — (a) shadow byte-equal to the last-synced builtin content → safe update;
(b) shadow locally edited (differs from both) → KEEP local + collect a typed conflict
notice, never silent-overwrite; (c) shadow missing → create. For "last-synced" state reuse
the existing builtins-drift baseline mechanism if it fits (read src/core/ for it — do not
invent a second registry if one fits; if it does not fit, a small state file under
`.deckent/agents/.prompt-sync-state.json` written ONLY via this sync path is acceptable).
Wire it into `deckent sync` (adapter phase) behind the existing sync flags; returns a
structured report (updated / kept-local / created / conflicts) the CLI prints.
All tests tmpdir-hermetic — the REAL `.deckent/` is never touched by tests.
### goNogo
- goCriteria: all three branches behavior-tested hermetically; conflict branch never overwrites; report structure asserted; wired into the sync command path (unit-level, real run is a host-side post-sprint smoke).
- nogo: silent overwrite of a locally-edited shadow NO_GO; writing the real .deckent in tests NO_GO.

## Task 6: U4-026 guidance-mode integration e2e
- Files: tests/orchestra/u4-integration-compose.test.ts, .analysis/u4-olcum/integration-notes.md
- Scope: tests/orchestra/, .analysis/u4-olcum/
- Dependencies: none
### Description
The cascade-skipped sprint-443 Task-26, original contract: end-to-end through the
production compose path with persona_render='guidance' (hermetic tmpdir project fixture):
a devops-intent task with devops-engineer gets the devops slice + pointer and NOT the full
body; an implementation-intent coordinator-style task (sprint-442 shape) gets NO Docker
guidance; full mode with a marker-FREE persona stays byte-identical (post-F1 contract:
marker-carrying personas render core-body + appendix pointer in full mode — pin that too).
Shadow-precedence: assert via getAgentPrompt resolution order that a `.deckent/agents/<id>`
copy SHADOWS the builtin (tmpdir fixture). Document in .analysis/u4-olcum/integration-notes.md
which sync path now propagates guidance (Task 5's module) and the host-side smoke command.
### goNogo
- goCriteria: all four e2e assertions green; shadow-precedence pinned; notes file written; npx vitest run tests/orchestra/u4-integration-compose.test.ts green.
- nogo: writing the real .deckent NO_GO.

## Task 7: mini-sprint integration and routing smoke
- Files: tests/core/routing-implementer-era.test.ts
- Scope: tests/core/
- Dependencies: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
### Description
The last-task integration gate: one focused suite proving the era end-to-end with the REAL
builtin manifests loaded from disk (not synthetic makeAgent fixtures): (1) implementation
intent → implementer via routeTaskV2; (2) refactor intent → refactorer; (3) a devops task
still → devops-engineer (floor is not a magnet); (4) implementer's prompt file parses with
guidance slices (parseGuidanceSections ≥2 sections incl. default). Keep it hermetic
(read-only on src/core/builtins; tmpdir for anything written).
### goNogo
- goCriteria: four era assertions green against real disk manifests; npx vitest run tests/core/routing-implementer-era.test.ts green; npx tsc --noEmit clean.
- nogo: synthetic-only fixtures (not reading real manifests) NO_GO.
