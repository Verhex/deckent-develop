# DIRECTIVES — Sprint-B10: eight-task factory wave with a declared dependency

## Goal

Eight MASTER-PLAN rows advance in one factory wave across four production lines:
credential exposure taxonomy (2030) feeding the runtime credential lifecycle (4131);
the born-ledger intake contract (3169) and post-settlement binary staging (3275); ADR
sync parity (160) and the canonical memory contract (190); npm channel preparation
(8091) and the capability wiring residual (4040). Task 2 declares a dependency on
task 1; all other tasks are scope-disjoint and run in parallel. Analysis artifacts
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
  sprint lifecycle commands, git commit, npm publish, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: Runtime-visible credential exposure taxonomy (row 2030)

- Files: follow-up-works/credential-exposure-taxonomy-2026-08-11.md
- Scope: follow-up-works/credential-exposure-taxonomy-2026-08-11.md, follow-up-works/
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 2030): the current Docker Codex auth copy is not zero-exposure, and no
honest classification exists for how each provider credential is visible at runtime.

Required: a single taxonomy document (the file named in Files — NEW) classifying every
provider credential path the code ACTUALLY uses (read the spawn backends, the
credential stores, the provider adapters) into the row's classes — host-only, env,
tmpfs-copy, persistent-copy, enterprise custody — with file-level evidence per
classification, the exposure window and revocation story for each, and the honest
current verdict for the Docker Codex auth copy. Owner decision points for every
tightening step. Proposes only; no production or config edits.

**Test:** the document exists at the exact path with every credential path classified;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** production or config edits, a classification without file-level evidence,
or claiming zero-exposure anywhere the code shows a copy.

---

## Task 2: Runtime credential lifecycle service contract (row 4131 first slice)

- Files: follow-up-works/runtime-credential-lifecycle-design-2026-08-11.md
- Scope: follow-up-works/runtime-credential-lifecycle-design-2026-08-11.md, follow-up-works/
- Model: claude-opus-5
- Dependencies: taxonomy

Measured (row 4131): API/terminal tokens and serve daemon descriptors are created,
published, rotated and retired by scattered call sites today — dead PIDs, port reuse,
restarts, concurrent daemons and partial writes each have ad-hoc handling.

Required: a design document (the file named in Files — NEW) that inventories every
current credential/descriptor call site (api-token, terminal-token, serve-daemon
descriptors, bot pid publication) with file-level evidence; consumes task 1's taxonomy
classes for custody labeling (read its artifact from follow-up-works when it exists —
the declared dependency guarantees ordering); and specifies the single lifecycle
service the row demands — creation→publication→rotation→revocation→shutdown/crash
retirement, atomic and least-privilege, bound to project+tenant+principal+generation+
endpoint+expiry — sliced into admission-sized implementation packages with per-slice
proof obligations and explicit owner decision points. Proposes only.

**Test:** the document exists at the exact path with every section above;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** production or config edits, a lifecycle that loses the crash-retirement
case, or custody labels that contradict task 1's taxonomy.

---

## Task 3: Born-ledger intake template and checker (row 3169)

- Files: follow-up-works/born-intake-template.md, scripts/check-born-intake.mjs, tests/scripts/born-intake-checker.test.ts
- Scope: follow-up-works/born-intake-template.md, scripts/check-born-intake.mjs, tests/scripts/born-intake-checker.test.ts, scripts/
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 3169, owner-mandated): every emergent dogfood defect must land as an
immutable RECOVERY-BORN-* row BEFORE its fix — this campaign opened six such rows by
hand, each hand-formatted against the row's requirements (trigger, affected surfaces,
exact evidence, priority, dependencies, acceptance, negative scope).

Required: a canonical intake template (the .md named in Files — NEW, under
follow-up-works as working material) capturing the row's mandatory fields; a checker
script (the .mjs named in Files — NEW) that validates a drafted born entry text
against the template's mandatory fields and reports typed gaps — consumed manually
before a born row is inserted, NOT wired into any lint chain (that wiring is an owner
decision for the result notes); and a test driving the checker against a valid
fixture, each single-field-missing fixture, and one of the six real born rows from
the ledger as a golden case (read-only). The ledger itself is untouched.

**Test:** `npx vitest run tests/scripts/born-intake-checker.test.ts`

**NO-GO:** editing docs/MASTER-PLAN.md, wiring the checker into CI, or a template
that drops any of the row's mandatory fields.

---

## Task 4: Source verification and built-binary proof become separate planner stages (row 3275)

- Files: src/orchestra/planner.ts, tests/orchestra/post-settlement-binary-staging.test.ts
- Scope: src/orchestra/planner.ts, src/orchestra/task-builder.ts, src/orchestra/, tests/orchestra/post-settlement-binary-staging.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3275, sprint-487): task 006 and its FIX failed against an impossible
dependency — the plan demanded a built-CLI proof while the sprint itself forbids
building during execution, so every retry burned against stale dist by construction.

Required: root-cause first — find where a plan can express a proof obligation that
requires the built binary, and record in the result notes how sprint-487's plan
produced the impossible case. Then: the planner represents source verification and
post-settlement build/binary proof as SEPARATE authority stages — a task whose proof
needs the built binary carries a typed post-settlement proof obligation instead of an
in-sprint criterion, and plan-time validation rejects an in-sprint built-binary
demand with a typed finding. No change to what sprints may build (nothing). Hermetic
test pins: an in-sprint binary demand is rejected typed, a post-settlement obligation
round-trips into the plan artifacts, and today's normal tasks plan byte-identically.

**Test:** `npx vitest run tests/orchestra/post-settlement-binary-staging.test.ts`

**NO-GO:** allowing builds during sprints, silently dropping binary-proof demands, or
changing normal task planning output.

---

## Task 5: Accepted-ADR DB↔filesystem parity gate (row 160)

- Files: scripts/lint-adr-sync.mjs, tests/scripts/adr-sync-parity.test.ts
- Scope: scripts/lint-adr-sync.mjs, tests/scripts/adr-sync-parity.test.ts, scripts/
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 160, 2026-08-10 RCA): the accepted-ADR projection can go stale against
the DB — ADR-G-025's exported text still claims four redaction classes are missing
while src/core/redact-sensitive.ts covers all four today. The DB is the SSOT; the
exports are guarded projections.

Required: a parity lint (the .mjs named in Files — NEW) that reads the accepted ADRs
from the live memory.db (read-only, through the compiled store the way existing
scripts do) and the exported decisions projection, and fails closed on missing,
divergent or stale entries by content digest; a test driving it against tmpdir
fixtures (in-sync passes, each divergence class fails typed) plus a read-only smoke
against the real repo state recorded in the result notes. Do NOT edit the ADR content
itself — the ADR-G-025 staleness is DB-side owner material; report its current
DB-vs-code truth in the result notes for the owner's store-API correction. Not wired
into CI chains in this slice.

**Test:** `npx vitest run tests/scripts/adr-sync-parity.test.ts`

**NO-GO:** writing to memory.db, editing exports by hand, or wiring into CI here.

---

## Task 6: Canonical memory authority contract (row 190 first slice)

- Files: follow-up-works/memory-authority-contract-2026-08-11.md
- Scope: follow-up-works/memory-authority-contract-2026-08-11.md, follow-up-works/
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 190): the repo-local core memory is canonical and provider HOME
surfaces are projections (the Stop-hook sync overwrote a projection edit live this
campaign — the exact hazard the row exists for); a prior design exists at
docs/superpowers/specs/2026-07-30-provider-agnostic-memory-projection-design.md and
the analysis at docs/alperen-analysis/2026-07-30-memory-projection-rev3-yuzey-analizi.md.

Required: a contract document (the file named in Files — NEW) that reconciles the
prior design with today's code truth (read the sync script and both prior docs):
the revision/hash conflict journal, the no-silent-delete guarantee, and
Claude/Codex/Gemini projection parity — stating for each: what exists, what the
design demanded, the gap, and admission-sized implementation slices with proof
obligations and owner decision points. Proposes only.

**Test:** the document exists at the exact path with every section above;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** editing the sync script or any memory file, or contradicting the
repo-local-canonical rule.

---

## Task 7: npm channel preparation under owner-manual publish (row 8091)

- Files: tests/release/npm-pack-whitelist.test.ts
- Scope: tests/release/npm-pack-whitelist.test.ts, tests/release/
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 8091): the deckent name returned registry 404 on 2026-07-31 —
unregistered and squatting-exposed; publish is ALWAYS owner-manual. The row's
preparable half is the tarball whitelist proof: dist, bin, README and LICENSE only.

Required: a hermetic test (the file named in Files — NEW) that derives the would-be
tarball contents WITHOUT publishing and without network — using npm pack --dry-run
--json against the real manifest in a read-only fashion (a local child process of npm
pack is acceptable as it performs no network I/O; if the runner's hermeticity policy
refuses even that, derive from the package.json files field plus npmignore semantics
in-process and record which path was taken) — and asserts the whitelist: dist, bin,
README variants and LICENSE only, no .deckent, no .brain, no tests, no docs beyond
the whitelisted files, no source maps of private material. The result notes list the
exact owner-run publish commands for the reservation and beta dist-tag, unexecuted.

**Test:** `npx vitest run tests/release/npm-pack-whitelist.test.ts`

**NO-GO:** running npm publish or any registry-mutating command, network access, or
editing the package manifest.

---

## Task 8: Capability broker authority-resolution wiring residual (row 4040)

- Files: src/core/capability-runtime.ts, tests/core/capability-authority-resolution.test.ts
- Scope: src/core/capability-runtime.ts, src/core/, tests/core/capability-authority-resolution.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 4040, DESIGN+G1 already receipted on 2026-08-08/09): the capability
broker is wired for dispatch but the row's own settlement notes the authority-
resolution residual — principal, tenant, operation, resource and environment do not
yet resolve into one scoped capability decision on the enforcement path.

Required: root-cause first — read the capability runtime and the receipted design
notes, and record in the result notes exactly which resolution inputs reach the
broker today and which are absent. Then the smallest sound wiring that makes the
broker resolve the design's five inputs into one scoped decision on the existing
enforcement path, advisory-preserving where the design marks enforcement owner-gated
(no default flips). Regression test pins: a fully-resolved request produces the
scoped decision, a missing input fails closed typed, and the advisory path's observable
behaviour stays byte-identical.

**Test:** `npx vitest run tests/core/capability-authority-resolution.test.ts`

**NO-GO:** flipping any enforcement default, a second resolution path, or capability
decisions from partial inputs.
