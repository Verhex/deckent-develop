# DIRECTIVES — Sprint-B3: six approved slices, claude-weighted

## Goal

Six MASTER-PLAN rows advance: spawnsync hot-path (3315), scoped typecheck authority
(3277), plugin sandbox wiring (7031), spend-gate enforcement (4091), generated-skill
durability (3310), model-catalog endpoint (539). Every slice is scope-disjoint; none
writes a repository-root file, touches provider auth, or runs build tooling.
Codex-provider routing is unavailable for this run (row 3308 continuation defect);
model hints below are Brain-assigned claude-tier choices under the owner's weighting
directive and the owner-approved wave roster.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test passing
  today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass; report the
  conflict in result notes instead.
- Read the existing mechanism before designing; every task EXTENDS something present.
  A second parallel mechanism is a NO-GO in all six.
- Fail closed on ambiguity; nothing may make a destructive action easier to trigger.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.
- Enforcement-class changes (tasks 3 and 4) ship flag-gated with today's default
  behaviour unchanged; blind default-on is a NO-GO.

---

## Task 1: The DIRECTIVES scope chain stops producing phantoms and silent shrinks (row 3312)

- Files: src/orchestra/task-builder.ts, src/orchestra/scope-sanitizer.ts, tests/orchestra/scope-parser-phantom.test.ts
- Scope: src/orchestra/task-builder.ts, src/orchestra/scope-sanitizer.ts, tests/orchestra/scope-parser-phantom.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3312, five live-evidenced cases from tonight's runs — filenames below are
written with bracketed dots so this very parser does not re-trigger on its own bug report):
(a) the doc-file regex in extractScopeFromDirective captures the TAIL of a multi-dot root
basename as its own token — README[.]tr[.]md yields a phantom tr[.]md entry, which the
sanitizer drops and the prompt-gate reads as a write-authority shrink BLOCK; (b) the same
phantom fires even for slash-qualified multi-dot paths like tests/PLATFORM[.]md and
scripts/spawnsync-baseline[.]json at render time; (c) the Scope-label parser appends a
slash to EVERY entry, turning files into phantom directories (real task JSON evidence:
directories containing README[.]md/ and Dockerfile/); (d) render-time re-sanitization
runs WITHOUT the trackedRootFiles vouch that plan-time had, silently dropping root files
like [.]dockerignore from the worker's canonical write view — the worker then honestly
refuses (sprint-507-002); (e) a bare test-file mention in prose produced a
test-discoverability false BLOCK.

Required: one sanitize authority — the plan-time sanitized scope is the canonical result
and render/prompt stages may project but never re-narrow it; the multi-dot basename and
root-file handling already present in the sanitizer covers every extractor path (the
doc-file regex must not emit a token that is the tail of a longer path on the same line);
the Scope-label parser distinguishes files from directories instead of appending a slash
blindly (the existing normalizeScopeDir file-vs-directory fix is the pattern to follow);
regression tests pin all five cases end-to-end from a DIRECTIVES fixture to the rendered
worker scope. Behaviour for today's already-working single-dot slash-qualified paths
stays byte-identical.

**Test:** `npx vitest run tests/orchestra/scope-parser-phantom.test.ts`

**NO-GO:** loosening scope enforcement itself (a file the operator never granted must
still be rejected), rewriting the sanitizer's rule order beyond the stated defects, or a
fix that special-cases specific filenames instead of the token classes.

---

## Task 2: Worker verification cannot judge unrelated concurrent partial writes (row 3277)

- Files: src/agents/worker-verify.ts, tests/agents/scoped-typecheck-authority.test.ts
- Scope: src/agents/worker-verify.ts, src/agents/, tests/agents/scoped-typecheck-authority.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3277, sprint-487): workers ran repository-wide `tsc --noEmit` while
parallel writers were mid-change — another task's partial source created false NO_GOs
and consumed FIX retries; a supervisor rerun after quiescence passed. Timing-dependent
global judgment is the defect.

Required: worker typecheck authority becomes scoped or snapshot-based — the verification
a worker runs must be unable to fail on files outside its own task scope. Read how
src/agents/worker-verify.ts composes verification commands first; prefer the smallest
sound mechanism (scoped tsc project/file-list if sound for the scope shape, or an
immutable settled-snapshot check) and record the chosen mechanism and its soundness
argument in the result notes. A cross-contamination regression test proves: task A's
scoped verify stays green while an unrelated file contains a type error, and still fails
when the error is inside A's own scope.

**Test:** `npx vitest run tests/agents/scoped-typecheck-authority.test.ts`

**NO-GO:** dropping type verification entirely, a mechanism that misses in-scope errors,
or global-state coordination that serializes all workers.

---

## Task 3: Wire validatePluginSecurity into the production plugin load path, flag-gated (row 7031)

- Files: src/orchestra/sprint-controller.ts, src/core/plugin-hooks.ts, tests/core/plugin-sandbox-wire.test.ts
- Scope: src/orchestra/sprint-controller.ts, src/core/plugin-hooks.ts, src/core/plugin.ts, tests/core/plugin-sandbox-wire.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 7031, the inventory's number-one real risk, code-line verified):
src/orchestra/sprint-controller.ts around line 1654 calls `loadPluginHooks` with no
options, so securityConfig is undefined and the 4-step security pipeline (allowed-path
containment + AST scan + SHA-256 integrity + Ed25519 publisher signature) never runs in
production; src/core/plugin-hooks.ts lines 225-238 downgrade PluginSecurityError to a
stderr line ("Non-fatal — log and continue").

Required: the production `loadPluginHooks` call receives the real security config
(plugin_require_signature and trusted publisher keys reachable from effective config);
PluginSecurityError becomes typed fail-closed under an advisory-to-enforce flag whose
DEFAULT keeps today's advisory behaviour byte-identical (the default flip is an owner
decision, not this slice); negative test proves an unsigned or out-of-scope hook blocks
the load when the flag is enforce, and only warns exactly as today when advisory.

**Test:** `npx vitest run tests/core/plugin-sandbox-wire.test.ts`

**NO-GO:** default-on enforcement, weakening any of the 4 pipeline steps, silently
skipping the pipeline when config is absent (absent config means advisory plus a typed
warning, never an undefined-skip), or breaking currently-loading legitimate plugins
under the default.

---

## Task 4: enforce_spend_gate becomes a real typed pre-spawn gate, flag-gated (row 4091)

- Files: src/cli/commands/start.ts, src/orchestra/sprint-finalizer.ts, tests/orchestra/spend-gate-enforce.test.ts
- Scope: src/cli/commands/start.ts, src/orchestra/sprint-finalizer.ts, src/core/cost-config-loader.ts, tests/orchestra/spend-gate-enforce.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 4091, 2026-08-05 code-truth scan): src/orchestra/sprint-finalizer.ts lines
1886-1889 document "HARD spend gate ... NOT implemented"; src/cli/commands/start.ts line
951 carries a TODO(post-beta); the cost_limits enforce_spend_gate key today only enables
a warning emission — the inventory's largest name-behaviour gap.

Required (owner principle from the row, binding): pre-spawn cumulative daily/monthly
spend over the ceiling produces the typed hard block (COST_GATE_EXCEEDED) when
enforce_spend_gate is true; an ACTIVE sprint is never cut mid-flight — graceful landing,
only new admission stops; when the flag is false, today's warning behaviour stays
byte-identical. Tests pin both modes and the mid-flight non-interruption property.

**Test:** `npx vitest run tests/orchestra/spend-gate-enforce.test.ts`

**NO-GO:** killing or pausing an active sprint on breach, changing the flag's default,
renaming the config key in this slice, or a gate that reads spend from anywhere but the
canonical cost/usage authority.

---

## Task 5: A PLAN-generated skill survives every FIX turn (row 3310)

- Files: src/orchestra/temp-agent-generator.ts, src/core/skill-pool.ts, src/orchestra/sprint-phases.ts, tests/orchestra/generated-skill-durability.test.ts
- Scope: src/orchestra/temp-agent-generator.ts, src/core/skill-pool.ts, src/orchestra/sprint-phases.ts, tests/orchestra/generated-skill-durability.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (sprint-491, owner-recorded 2026-08-01): a skill generated during PLAN was gone
by the FIX turn — the FIX-round worker prompt could not resolve it and the run produced
FORCED_SKILL_UNAVAILABLE. Acceptance (row 3310): a PLAN-generated skill reaches the
worker prompt with identical content across the whole FIX/XFIX lineage, and the
FORCED_SKILL_UNAVAILABLE class fails closed with a regression test.

Required: root-cause first — read the generated-skill write path (where PLAN persists
it), the FIX respawn path (where the worker prompt resolves skills), and find the exact
step where availability is lost (cleanup between phases, a temp dir FIX does not
re-create, a pool that reloads only built-ins — whatever the evidence shows). State the
root cause explicitly in the result notes BEFORE the fix. Fix at the root: the generated
skill persists across FIX/XFIX rounds of the same lineage with identical content; do not
re-generate per round; do not widen any skill-loading surface beyond the run's own
lineage. When a forced skill genuinely cannot be resolved, the failure stays typed and
fail-closed. Regression test pins durability (skill present in round-two prompt input)
and the typed failure when truly absent. Tests hermetic (tmpdir fixture, no provider
calls, no real spawn).

**Test:** `npx vitest run tests/orchestra/generated-skill-durability.test.ts`

**NO-GO:** regenerating the skill per round instead of persisting it, weakening the
typed failure into a warning, touching provider dispatch, or a fix that only works for
the first FIX round.

---

## Task 6: Point the model catalog at the live models.dev endpoint, typed on drift (row 539)

- Files: src/core/model-catalog.ts, tests/core/model-catalog.test.ts
- Scope: src/core/model-catalog.ts, tests/core/model-catalog.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 539): the current remote catalog URL answers HTTP 302 to the HTML
homepage, so every remote refresh dies at res.json() with "Unexpected token '<'" and the
loader silently lives on the bundled catalog. Live probe: https://models.dev/api.json
answers 200 application/json (~3.6 MB). Its shape is NOT the current
RemoteCatalogResponse (a models array): api.json is a provider-keyed object map
(provider id → models map keyed by model id).

Required, extending the existing 3-stage fallback exactly where it stands: the catalog
URL moves to the live JSON endpoint; fetchRemoteCatalog gains a typed guard BEFORE
parsing — a redirected final response or a non-JSON content-type produces a typed
DeckentError in the existing catalog-error family, never a raw SyntaxError, and the
warning-based fallback to cache then bundled stays as is; a shape adapter maps the
provider-keyed api.json payload into the existing internal model list contract, with
unknown entries keeping the existing skipped-model warning path and the catalog-empty
merge staying intact. Tests pin: redirect produces the typed error, HTML content-type
produces the typed error, a small inline provider-keyed fixture maps correctly (no
network), and the cache is never written on any failure path.

**Test:** `npx vitest run tests/core/model-catalog.test.ts`

**NO-GO:** network access in tests, cache written on any failure path, bundled fallback
removed or reordered, loadCatalog public signature changed, or a model-name literal
introduced outside fixtures.
