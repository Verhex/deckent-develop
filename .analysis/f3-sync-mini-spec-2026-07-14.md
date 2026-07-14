# MINI-SPRINT SPEC — F3 implementer + U4-026 integration + F4-core sync (pre-SURF finish line)
> Format: docs/templates/spec-template.md (incl. §8 Blast Radius — first mandatory use).
> Alperen approval: "ONAYLANDI" 2026-07-14 (plan: this mini-sprint, then SURF-1c).

## 1 · PURPOSE
Close the three routing/persona-integrity gaps blocking a clean SURF re-entry:
(a) **F3** — the `implementation: 7` catch-all currently lives on `refactorer`, whose
zero-functional-change mandate fights every implementation task (the %61-refactorer P4
pattern; 21/26 in sprint-443). A neutral `implementer` builtin takes over that score;
refactorer becomes refactor-only. Sprint-205's guarantee (implementation → builtin beats
temp agents) is PRESERVED — the score moves, it does not disappear.
(b) **U4-026** — the cascade-skipped integration e2e (guidance-mode compose through the
production path + shadow-precedence proof) is delivered.
(c) **F4-core** — `deckent sync` crashes with EISDIR (live repro 2026-07-14) and has NO
path that propagates builtin PROMPT.md guidance to the `.deckent/agents/` shadows
(live-verified: 0 markers in shadows → guidance mode falls back to full body in THIS repo).
Fix the crash; build the three-way PROMPT.md sync (builtin changed + local unedited →
update; local edited → keep + notify; never silent-overwrite).

## 2 · FILE SCOPE
- **Write:** new: `src/core/builtins/agents/implementer/agent.json` + `src/core/builtins/agents/implementer/PROMPT.md` ·
  `src/core/builtins/agents/refactorer/agent.json` · routing-era test updates
  (`tests/core/routing-impl-builtin.test.ts`, `tests/core/routing-live-diversity.test.ts`,
  `tests/core/routing-diversity-guard.test.ts`, `tests/orchestra/agent-routing-health.test.ts`) ·
  `src/cli/commands/sync.ts` (+ the module it delegates adapter-sync to) · new sync tests ·
  new: `tests/orchestra/u4-integration-compose.test.ts` · `.analysis/u4-olcum/integration-notes.md`
- **Read-critical:** `src/core/routing-engine.ts` (selectBestAgent scoring + role-mismatch),
  `src/core/agent-pool.ts` getAgentPrompt (shadow precedence), `scripts/validate-guidance.mjs`
  (content smoke), `tests/core/builtins/agent-catalog-*.test.ts` (catalog conventions).
- **Separate-test decision:** together.

## 3 · EDGE POLICIES
- Routing with BOTH implementer(7) and a domain specialist activating → specialist's higher
  score wins as today (implementer is the FLOOR, not a magnet). Tie vs temp agents:
  implementer(7) > temp(6) — Sprint-205 preserved.
- refactorer after demotion: activates ONLY on intent=refactor; an implementation task with
  zero activations now lands on implementer, never generic, never refactorer.
- Sync three-way: local shadow byte-equal to LAST-SYNCED builtin → safe update; local
  differs from both → keep local + emit a conflict notice (typed result, no throw, no
  silent overwrite); shadow missing → create. State for "last-synced" rides the existing
  builtins-drift baseline mechanism if present — do NOT invent a second registry if one fits.
- Sync EISDIR: REPRODUCE-FIRST (`--adapters-only` path reads a directory as a file);
  fix must keep dry-run behavior identical.
- Error path: sync failures per-entry typed + collected (one bad entry must not abort the
  sweep); string-throw forbidden.

## 4 · RETURN/MUTATION SEMANTICS
- Sync returns a structured report (updated / kept-local / created / conflicts) — CLI prints
  it; JSON mode passes it through. No mutable internal state leaks.
- `.deckent/agents/**` writes happen ONLY via the sync command run host-side — worker tests
  use tmpdir fixtures exclusively (BINDING: real `.deckent/` is read-only for workers).

## 5 · PROOF (behavior run MANDATORY)
- implementer: `node scripts/validate-guidance.mjs src/core/builtins/agents/implementer` exit 0;
  catalog conventions green (`npx vitest run tests/core/builtins/`).
- Routing: a plain implementation-intent task selects `implementer`; a refactor-intent task
  selects `refactorer`; temp(6) still loses to implementer(7) — pinned in the era-update tests.
- Sync: hermetic tmpdir test for all three three-way branches + EISDIR regression test;
  host-side real-binary smoke after the sprint: `node dist/cli/entry.js sync --adapters-only`
  exit 0 (run by Brain post-build).
- 026 e2e: guidance-mode devops task gets slice+pointer, 442-shape task gets NO Docker text,
  full mode marker-free byte-parity, shadow-precedence via tmpdir fixture.

## 6 · PROHIBITIONS (fixed block)
- No report/summary markdown outside `.analysis/u4-olcum/`. goNogo names only genuinely
  written paths. No commas in titles. No string-throw. Existing export signatures unchanged
  unless demanded. ADR constraints binding; conflict → amendment note.
- Real `.deckent/` and `.brain/` untouched by workers; `npm run build` forbidden in-sprint.

## 7 · SIZE
**mini** (explicitly, per law 8): 7 tasks / high parallelism; content+manifest work is small
and the sync mechanism is the only meaty slice.

## 8 · BLAST RADIUS
- **Consumers of the moved score:** `routeTaskV2`/`selectBestAgent` (activation scoring),
  outcome-tracker stats (implementer starts with zero stats — success-rate bonuses may
  briefly disadvantage it vs seasoned agents; acceptable, self-corrects via outcome loop),
  Sprint-205 pins in 3 test files + diversity/health suites (updated in-sprint, listed in §2).
- **What the old behavior silently protected:** "implementation always routes to a BUILTIN"
  (anti-temp guarantee) — preserved by implementer@7. Also refactorer's W3/W4 lint
  interplay: behavior-precedence suppressions keyed to refactorer persona stay valid for
  genuine refactor tasks; no lint reads the implementation-catchall.
- **Mode/flag matrix:** new agent's PROMPT.md carries guidance markers → in persona_render
  'full' it renders core-body via F1 (personaCoreBody); in 'guidance' the intent slice.
  Catalog byte-cap tests measure core-body (post-F1 amendment) — new file must respect the
  4KB core cap. Builtins-drift publish-gate: adding a builtin changes the drift set — the
  baseline refresh runs HOST-SIDE by Brain after the sprint (workers cannot touch .deckent);
  until then `validate:publish` may flag drift (known, intended, noted in integration notes).
