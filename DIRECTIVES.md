# DIRECTIVES — Sprint-B7: four slices on the fully-repaired build

## Goal

Four MASTER-PLAN rows advance: the bot-stop HOLD exemption debt (3320 residue,
rescheduled after the aborted 513 wave never spawned it), the evidence-honest
force-finalize contract (3162), the lifecycle phase vocabulary (3305), and the script
lifecycle registry (270). Every slice is scope-disjoint; none touches provider auth or
runs build tooling. Analysis artifacts, if any task produces one, belong under
follow-up-works/ — docs/ is product documentation only.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test passing
  today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass; report the
  conflict in result notes instead.
- Read the existing mechanism before designing; every task EXTENDS something present.
  A second parallel mechanism is a NO-GO in all four.
- Fail closed on ambiguity; nothing may make a destructive action easier to trigger.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: The `.deck` Docker-context exclusion gains its hermetic proof (row 100)

- Files: tests/security/docker-context-deck.test.ts
- Scope: tests/security/docker-context-deck.test.ts, tests/security/
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 100): the `.deck` and `.deck.*` exclusions landed in the tracked
.dockerignore as the owner-side mechanical half (receipt
GR-2026-08-10-DECK-DOCKERIGNORE-01) after the sprint-507 worker was blocked by the
render-scope defect — that defect is fixed (row 3312 DONE), but the row's remaining
acceptance is unproven: a build-context negative test. The root Dockerfile uses a
generic COPY of the tree, so the ignore file is the only thing standing between the
per-project secret family and the image layers.

Required: a hermetic test (the file named in Files — NEW) that proves the exclusion
WITHOUT any Docker daemon: parse the REAL repository .dockerignore with the documented
dockerignore matching semantics (last-match-wins, dir vs file patterns) and assert that
`.deck`, `.deck.*` sibling names, and the `.tasks`/`.deckent`/`.brain` state
directories are excluded from the build context, while files the Dockerfile genuinely
needs (package manifests, src, dist inputs it copies) are NOT excluded. The matcher
helper lives inside the test file — no production code. If the assertion sweep finds a
path the Dockerfile needs but the ignore file blocks, that is a typed finding for the
result notes, not a silent ignore-file edit.

**Test:** `npx vitest run tests/security/docker-context-deck.test.ts`

**NO-GO:** invoking a Docker daemon, editing .dockerignore or any Dockerfile, or a
matcher that diverges from documented dockerignore semantics.

---

## Task 2: Force-finalize is an evidence-honest, tested contract (row 3162)

- Files: src/cli/commands/finalize.ts, tests/cli/force-finalize-contract.test.ts
- Scope: src/cli/commands/finalize.ts, src/orchestra/sprint-finalizer.ts, tests/cli/force-finalize-contract.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3162, exercised live twice today): `deckent finalize --sprint <id>
--force` closed the stuck sprint-513 as ABORTED with the truthful summary "4 of 6
complete, 2 unresolved — no unresolved lineage promoted to COMPLETE", and the
force-abort path wrote its SPRINT-LOG section. The behaviour exists; the CONTRACT does
not: no test pins that force-finalize never promotes unresolved work, that it works
when the task projection is missing or partial (the row's core case), or what its
terminal state and receipts must look like.

Required: root-cause first — read the force path in the finalize command and the
finalizer and inventory in the result notes what force-finalize does today for: all
results present, some results missing, task projection entirely absent, and an
already-finalized sprint. Then pin the contract with hermetic tests: unresolved
lineages settle as ABORTED/unresolved and are NEVER promoted, a lost-projection sprint
still reaches a truthful terminal state from whatever evidence exists (results,
evaluations, receipts), the operation is idempotent, and the SPRINT-LOG section is
written exactly once. Fix any gap the inventory reveals at its root — but behaviour
that is already honest stays byte-identical.

**Test:** `npx vitest run tests/cli/force-finalize-contract.test.ts`

**NO-GO:** promoting unresolved work under any input, force-finalize acquiring
destructive deletion powers, or a contract test that mocks away the evidence reads it
claims to prove.

---

## Task 3: One canonical lifecycle phase vocabulary (row 3305)

- Files: src/core/types.ts, src/orchestra/sprint-controller.ts, tests/orchestra/lifecycle-vocabulary.test.ts
- Scope: src/core/types.ts, src/orchestra/sprint-controller.ts, src/orchestra/, tests/orchestra/lifecycle-vocabulary.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 3305, CODE-DOC-DIFF ARCH-01): the executable controller genuinely runs a
CLEANUP stage after RETRO/DECAY, but the SprintPhase enum has no CLEANUP member and the
emitted transition records DECAY→COMPLETE — the enum, the emitted events, the host
guide documentation and the terminal projection each tell a different phase story.

Required: one phase vocabulary — the SprintPhase enum, the transitions the controller
emits, and the read-model/terminal projection all carry the same phase set, closing
the CLEANUP contradiction in whichever direction the CODE truth supports (read the
controller first and state the direction in the result notes: either CLEANUP becomes a
real enum member with a real emitted transition, or the post-terminal cleanup is
explicitly documented as a non-phase maintenance step and nothing pretends otherwise).
Every consumer of the phase set found in src/orchestra is updated to the single
vocabulary; a test pins enum ↔ emitted-transition parity so the drift cannot silently
return. Documentation strings updated through the existing i18n/doc surfaces only
where they contradict the chosen truth.

**Test:** `npx vitest run tests/orchestra/lifecycle-vocabulary.test.ts`

**NO-GO:** changing actual lifecycle BEHAVIOUR (order or side effects of stages),
leaving any emitted transition outside the enum vocabulary, or a doc-only fix that
leaves the enum contradiction alive.

---

## Task 4: Script lifecycle and proof-harness registry (row 270)

- Files: scripts/script-registry.json, scripts/lint-script-registry.mjs, tests/scripts/script-registry.test.ts
- Scope: scripts/script-registry.json, scripts/lint-script-registry.mjs, tests/scripts/script-registry.test.ts, scripts/
- Model: gpt-5.6-terra
- Dependencies: none

Measured (row 270, from the 2026-07-21 scripts analysis): the scripts/ directory holds
dozens of .mjs tools with no lifecycle registry — nothing states which are CI gates,
which are recurring proof harnesses, which are one-shot admin migrations, and which
are retired; consumers discover them by grep.

Required: a tracked registry (the JSON named in Files — NEW) classifying EVERY
scripts/*.mjs file into the row's classes — gate, recurring-proof, admin-migration,
one-shot, retired — with owner, input, output and expiry fields per entry, derived by
READING each script's header and package.json wiring (not guessed); a fail-closed lint
(the .mjs named in Files — NEW) that verifies the registry covers exactly the real
directory contents (a new script without a registry entry fails, a registry entry
without a file fails) and validates the class enum and required fields; and a test
that runs the lint against the real repo plus fixture violations. Do NOT add the lint
to any npm chain in this slice — wiring it into lint:gates is a follow-up owner
decision recorded in the result notes.

**Test:** `npx vitest run tests/scripts/script-registry.test.ts`

**NO-GO:** guessing classifications without reading the script, editing any existing
script, or wiring the new lint into CI chains inside this slice.
