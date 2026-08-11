# DIRECTIVES — Sprint-B8: six approved slices across both providers

## Goal

Six MASTER-PLAN rows advance: the dist-clean call in test runs (60), write-scope
backend parity (4061), plugin security config authority (7034), the security ADR
crosswalk (4191), crash forensics authority's first slice (121), and the script
lifecycle registry rerouted from the capacity-failed wave (270). Every slice is
scope-disjoint; none touches provider auth or runs build tooling. Analysis artifacts
belong under follow-up-works/ — docs/ is product documentation only.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test passing
  today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass; report the
  conflict in result notes instead.
- Read the existing mechanism before designing; every code task EXTENDS something
  present. A second parallel mechanism is a NO-GO.
- Fail closed on ambiguity; nothing may make a destructive action easier to trigger.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.
- Enforcement-class changes (task 3) ship flag-gated with today's default behaviour
  unchanged; blind default-on is a NO-GO.

---

## Task 1: Find and close the fail-loud root cause of the dist-clean call in test runs (row 60)

- Files: tests/scripts/forbid-clean-in-tests.test.ts
- Scope: tests/scripts/forbid-clean-in-tests.test.ts, tests/scripts/, scripts/
- Model: claude-opus-5
- Dependencies: none

Measured (row 60): a test run once invoked the dist clean and destroyed the built
binary mid-run; the clean authority has since been massively hardened (physical-root
binding, symlink rejection, execution-authority admission), but the row's remaining
acceptance is open — a caller trace, a deterministic reproduction and a FORBID-CLEAN
guard proving no test path can reach the clean anymore.

Required: root-cause first — trace every path by which test code could historically
reach the clean (direct import of scripts/clean.mjs, npm script invocation from a
spawned process, build invocation from a test) and record the caller inventory in the
result notes. The existing hermeticity machinery already refuses destructive clean
under test (the E_HERMETIC_DIST_CLEAN refusal); this slice pins the CONTRACT: a
hermetic test proves the refusal fires for every discovered caller class (import-time,
spawn-time with vitest env, spawn-time with hermeticity env) and that a plain
non-test invocation still works. No production edits expected; if a genuinely
reachable unguarded path is discovered, that is a typed finding for the result notes
plus a minimal guard at its root.

**Test:** `npx vitest run tests/scripts/forbid-clean-in-tests.test.ts`

**NO-GO:** invoking the real destructive clean against the repository, weakening the
existing hermeticity refusal, or a guard that also blocks legitimate operator cleans.

---

## Task 2: Worker write-target derivation comes from one authority in every backend (row 4061)

- Files: src/orchestra/sprint-spawner.ts, src/orchestra/spawn-backend-docker.ts, tests/orchestra/write-scope-backend-parity.test.ts
- Scope: src/orchestra/sprint-spawner.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/, tests/orchestra/write-scope-backend-parity.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 4061, code-line verified on 2026-08-11): spawn-backend-docker.ts around
line 3627 derives write targets as `inspectionOnly ? [] : directories` while
sprint-spawner.ts around line 515 derives `['.tasks/', ...task.scope.directories]` —
two backends, two divergent derivations of the same authority; an inspection-only task
gets different write scopes depending on the backend that runs it.

Required: one canonical write-target deriver consumed by BOTH call sites (and any
other declared backend found during root-cause), with the directories-into-write-scope
decision made in exactly one typed place; an inspection-only task derives the same
empty write scope in every backend; a parity regression test drives both derivations
against the same fixture task and asserts byte-equal targets, including the
inspection-only case. Behaviour for currently-running normal tasks stays identical —
state the chosen canonical semantics and why in the result notes.

**Test:** `npx vitest run tests/orchestra/write-scope-backend-parity.test.ts`

**NO-GO:** widening any backend's write scope as a side effect, a second deriver
surviving anywhere, or changing inspection-only semantics beyond unification.

---

## Task 3: Plugin security enforcement gains its typed config authority (row 7034)

- Files: src/core/config-types.ts, src/core/plugin-hooks.ts, tests/core/plugin-security-config-authority.test.ts
- Scope: src/core/config-types.ts, src/core/plugin-hooks.ts, tests/core/plugin-security-config-authority.test.ts
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 7034, 2026-08-11 re-verification): the 7031 wiring landed
(sprint-controller passes real security config) but the enablement authority is
untyped — plugin-hooks.ts around line 167 reads `plugins.security_enforcement`
through an untyped cast, and the code's own comment says the typed key does not exist
yet in config-types.

Required: `plugins.security_enforcement` becomes a typed config key in config-types.ts
(following the existing enforce-flag family pattern, default preserving today's
advisory behaviour byte-identically); the untyped cast in plugin-hooks.ts retires in
favour of the typed read; in enforce mode an unsigned or out-of-scope hook blocks the
load with the typed PluginSecurityError (never advisory-log-and-continue), and
advisory mode stays exactly today's behaviour; negative tests prove both modes
separately. The default FLIP remains an owner decision outside this slice.

**Test:** `npx vitest run tests/core/plugin-security-config-authority.test.ts`

**NO-GO:** changing the default, a second config-read path, or weakening any of the
four pipeline steps.

---

## Task 4: The security ADR crosswalk with typed conflict routes (row 4191)

- Files: follow-up-works/sec-adr-crosswalk-2026-08-11.md
- Scope: follow-up-works/sec-adr-crosswalk-2026-08-11.md, follow-up-works/
- Model: gpt-5.6-terra
- Dependencies: none

Measured (row 4191): nine approved security designs need a governing-ADR crosswalk,
and four direct-field conflicts need owner-decision routing — the row itself DECIDES
NOTHING; it produces the evidence-backed proposal. The conflict pairs are typed in the
row: the Immutable-yes pair needing SUCCESSOR ADRs (ADR-G-021 self-modifying vs the A6
D11 retirement proposal; ADR-G-029 embedded-terminal vs A7, conflicting only on the
delivered-guard claim) and the Immutable-no pair where AMENDMENT suffices (ADR-G-037
execution-budget vs A2; ADR-G-039 key-custody vs A3).

Required: a single document (the file named in Files — NEW, under follow-up-works
because it is owner-decision material, not product documentation) that lists, for each
of the nine designs, its governing ADRs with the ADR ids resolved from the live memory
export; and for each of the four conflicts: the exact conflicting claims quoted, the
typed route (SUCCESSOR for Immutable-yes, AMENDMENT for Immutable-no), and an
evidence-backed recommendation for the owner. Immutable-yes ADRs are never edited
in-place and this document proposes only.

**Test:** the document exists at the exact path covering all nine designs and all four
conflicts; `node scripts/lint-links.mjs` stays green.

**NO-GO:** editing any ADR, deciding a conflict instead of proposing, or placing the
artifact under docs/.

---

## Task 5: Crash artifacts gain schema, provenance and collision-free naming (row 121 first slice)

- Files: src/cli/helpers/error-handler.ts, tests/cli/crash-artifact-schema.test.ts
- Scope: src/cli/helpers/error-handler.ts, src/cli/helpers/, tests/cli/crash-artifact-schema.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 121, 2026-08-10 disk/code RCA, owner-approved): the crash writer
(formatFatalAndExit in the error-handler family) writes timestamp-only filenames that
can overwrite within the same millisecond, carries no command/version/process/project
provenance, and has no versioned schema — the six existing ignored logs cannot even
prove which ingress produced them. Retention/reader/support-bundle are LATER slices;
this slice is the artifact itself.

Required: crash artifacts gain a versioned schema (schemaVersion, timestamp, pid,
command argv sanitized through the existing redaction surface, deckent version,
project-root digest — never raw secrets or raw account identity), collision-free
atomic naming (timestamp plus pid plus a random suffix, temp-then-rename), and
least-privilege file mode. The writer stays crash-safe: any failure inside artifact
writing must never mask the original fatal. Existing crash logs are NOT migrated or
deleted (typed prune receipt territory per the row). Hermetic tests pin schema shape,
collision-freedom under same-millisecond writes, redaction, and the never-mask
property.

**Test:** `npx vitest run tests/cli/crash-artifact-schema.test.ts`

**NO-GO:** deleting or rewriting existing crash logs, persisting unredacted argv or
secrets, or an artifact writer that can throw over the original fatal.

---

## Task 6: Script lifecycle and proof-harness registry (row 270, rerouted)

- Files: scripts/script-registry.json, scripts/lint-script-registry.mjs, tests/scripts/script-registry.test.ts
- Scope: scripts/script-registry.json, scripts/lint-script-registry.mjs, tests/scripts/script-registry.test.ts, scripts/
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 270, from the 2026-07-21 scripts analysis; rerouted after gpt-5.6-terra
was at provider capacity for every 516 attempt): the scripts/ directory holds dozens
of .mjs tools with no lifecycle registry — nothing states which are CI gates, which
are recurring proof harnesses, which are one-shot admin migrations, and which are
retired; consumers discover them by grep.

Required: a tracked registry (the JSON named in Files — NEW) classifying EVERY
scripts/*.mjs file into the row's classes — gate, recurring-proof, admin-migration,
one-shot, retired — with owner, input, output and expiry fields per entry, derived by
READING each script's header and package.json wiring (not guessed); a fail-closed lint
(the .mjs named in Files — NEW) verifying the registry covers exactly the real
directory contents and validates the class enum and required fields; and a test that
runs the lint against the real repo plus fixture violations. Do NOT add the lint to
any npm chain in this slice — wiring it into lint:gates is a follow-up owner decision
recorded in the result notes.

**Test:** `npx vitest run tests/scripts/script-registry.test.ts`

**NO-GO:** guessing classifications without reading the script, editing any existing
script, or wiring the new lint into CI chains inside this slice.
