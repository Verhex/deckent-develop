# DIRECTIVES — R0 Dogfood Bootstrap Recovery

## Goal

Resume the existing persistent Deckent goal without replacing or reducing it. Restore the current
`main` checkout to a compile-green, authority-consistent baseline through Deckent's own lifecycle,
then prove that canonical execution admission, transactional build preparation, strict
cross-provider XVerify and goal supervision are ready for the first provider-free C0/C1 promotion.

GPT-5.6 Sol is the supervising Brain. Deckent dogfooding is mandatory; manual intervention is
permitted only as a typed and recorded recovery seam, followed by immediate re-entry into dogfood.

## Owner Decisions — Binding

- Branch/worktree: `/home/alperen/deckent-dev`, `main` only. Do not create a worktree.
- Parallel worker hard ceiling: **6**. Lower concurrency is correct when dependencies, file
  collisions, provider capacity or finite budget prevent safe dispatch.
- Worker providers: Codex and Claude both participate. Use only exact registry API IDs.
- XVerify: verifier provider must differ from producer provider.
  - Codex/Sol output → Claude Fable 5 by default; Claude Opus 5 for selected deep review.
  - Claude output → tier-appropriate Codex Terra/Sol.
  - Missing fresh second-provider authority → typed `unavailable/HOLD`; never self-verify.
- Every provider dispatch requires exact model, auth/account, reachability, limit, finite budget
  and settlement authority. Start remains subject to the CLI admission/cost checkpoint and exact
  attempt receipt; this document does not fabricate a `G7` receipt.
- No task may mark a work item `DONE`; workers produce bounded evidence and a recommendation.

## Global Negative Space

- Do not kill or cleanup a live sprint. Never delete `.tasks/*` or `.brain/memory.db`.
- Do not run `npm run build`, `npm run build:all`, `/login`, publish, push, dependency install,
  destructive git, repository cleanup or bot restart inside the sprint.
- Do not modify `.deckent/config.json`, MASTER, generated projections, memory, AGENTS/CLAUDE,
  package wiring, native adapter files or any path not explicitly assigned below.
- Do not weaken execution admission, fencing, quarantine, evidence, fsync, path-binding,
  provider-separation, budget or settlement behavior to make a test pass.
- Do not use `spawnSync`; hermetic subprocess tests use bounded async spawn and tmpdir state.
- Do not run an unbounded full suite. Set `VITEST_MAX_FORKS=2`; use targeted/affected gates.
- Do not rewrite another task's file. Same-file tasks are dependency-serialized below.
- No silent fallback: uncertainty becomes typed `HOLD`, `unavailable`, `quarantined` or
  reconciliation-required state.

## Inherited Evidence — Do Not Re-run as a Task

The superseded D2 directive at SHA-256
`a69dc4fb7fb2460bb91fbeea38f0c4f358f8705f821bcdbd0e26c997a77928c5` recorded three
`exit 137` runs. Last measured peak was 0.20 GB/6 GB, turn 35/40, cache-read 131k/1.5M,
`OOMKilled=false`; the last observed broad command was `git log --oneline --all | grep ...`.
That task is not part of R0 and must not be dispatched again. Its current-truth documentation
result remains attributable on disk.

## Batch Acceptance

- 24 microtasks with an explicit dependency DAG; at most 6 workers in parallel.
- All mutation scopes are previously owner-approved paths. Read-only tasks must remain byte-clean.
- Root supervisor re-checks branch, target hashes, disk diff, task results, heartbeat, usage,
  Nervous notifications and settlement evidence independently of Brain verdict.
- R0 can recommend C0/C1 only when compile and targeted gates are green and every uncertainty has a
  typed owner. Native/live/cross-platform/scale proof remains separate; no premature promotion.

---

## Task 1: LOCK-PARSE — restore the canonical lock module parse boundary

- Provider: claude
- Model: claude-sonnet-5
- Effort: normal
- Files: src/core/file-lock.ts
- Scope: src/core/file-lock.ts
- Dependencies: none

### Description

Repair only the current TypeScript parse/incomplete-hunk defects in `file-lock.ts`. Preserve all
existing v3 state, migration, audit and projection work. Stop after the file parses and type errors
are enumerated; do not broaden behavior in this task.

**Proof:** target hash before/after, exact diff, TypeScript parser no longer reports TS1434/TS1011.
**Test:** `npx tsc --noEmit --pretty false`

## Task 2: LOCK-BIND — bind project root and lock-directory generation

- Provider: codex
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/file-lock.ts
- Scope: src/core/file-lock.ts
- Dependencies: Task 1

### Description

Complete the platform-adapter-backed root and `.locks` generation binding so a replaced parent
directory cannot bootstrap a second canonical lock domain. Linux/WSL must use stable verified
handles; unsupported native platforms fail honestly without pretending parity.

**Proof:** one project/task cannot obtain two live owners after parent-directory replacement.
**Test:** targeted cross-process lock tests prepared by Task 4.

## Task 3: LOCK-COMMIT — reconcile transaction completion and live handles

- Provider: claude
- Model: claude-sonnet-5
- Effort: high
- Files: src/core/file-lock.ts
- Scope: src/core/file-lock.ts
- Dependencies: Task 2

### Description

Complete post-commit reconciliation for acquire/renew/release/quarantine mutations. Heartbeat and
release paths must operate on the current verified handle and distinguish committed canonical state
from projection cleanup uncertainty.

**Proof:** terminal canonical commit is never converted into a retryable failure.
**Test:** targeted lock runtime and fence suites from Task 4.

## Task 4: LOCK-PROOF — cross-process lock and migration tests

- Provider: codex
- Model: gpt-5.6-terra
- Effort: high
- Files: tests/core/task-execution-fence.test.ts, tests/core/file-lock-runtime.test.ts
- Scope: tests/core/task-execution-fence.test.ts, tests/core/file-lock-runtime.test.ts
- Dependencies: Task 3

### Description

Add or repair hermetic cross-process tests for directory-generation replacement, chronology,
v2→v3 migration, post-commit ambiguity, stale-handle rejection and high-cardinality task lookup.

**Proof:** tests reproduce the pre-fix failure and pass only under one canonical owner.
**Test:** `npx vitest run tests/core/task-execution-fence.test.ts tests/core/file-lock-runtime.test.ts`

## Task 5: CLEAN-BIND — consume stable lock paths in clean maintenance

- Provider: claude
- Model: claude-sonnet-5
- Effort: high
- Files: scripts/clean.mjs
- Scope: scripts/clean.mjs
- Dependencies: Task 2

### Description

Wire clean authority preparation and projection operations to the verified stable root/lock binding.
Do not re-open canonical paths after validation and do not treat a changed path as the same domain.

**Proof:** clean cannot observe or mutate a replacement lock directory.
**Test:** Task 7 clean suites.

## Task 6: CLEAN-RECOVERY — terminal uncertainty and interrupted staging

- Provider: codex
- Model: gpt-5.6-sol
- Effort: high
- Files: scripts/clean.mjs
- Scope: scripts/clean.mjs
- Dependencies: Task 5

### Description

Complete interrupted staging recovery, durability preflight, quarantine attestation chronology,
terminal projection uncertainty and paginated/indexed maintenance behavior. A committed clean with
uncertain projection cleanup must not be reported as an ordinary success or retried destructively.

**Proof:** every crash boundary has one typed recover/reconcile outcome.
**Test:** Task 7 clean suites.

## Task 7: CLEAN-PROOF — clean recovery and scale tests

- Provider: claude
- Model: claude-sonnet-5
- Effort: high
- Files: tests/scripts/clean-active-execution-guard.test.ts, tests/scripts/dist-clean-guard.test.ts
- Scope: tests/scripts/clean-active-execution-guard.test.ts, tests/scripts/dist-clean-guard.test.ts
- Dependencies: Task 6

### Description

Cover parent replacement, crashed staging, fresh attestation, terminal uncertainty, pagination and
large active-lock populations with tmpdir-owned hermetic tests.

**Proof:** no live authority or unowned path is removed; pagination has deterministic boundaries.
**Test:** `npx vitest run tests/scripts/clean-active-execution-guard.test.ts tests/scripts/dist-clean-guard.test.ts`

## Task 8: LOCK-CLEAN-GATE — integrated authority verdict

- Provider: claude
- Model: claude-opus-5
- Effort: high
- Files: src/core/file-lock.ts, scripts/clean.mjs, tests/core/task-execution-fence.test.ts, tests/core/file-lock-runtime.test.ts, tests/scripts/clean-active-execution-guard.test.ts, tests/scripts/dist-clean-guard.test.ts
- Scope: src/core/file-lock.ts, scripts/clean.mjs, tests/core/task-execution-fence.test.ts, tests/core/file-lock-runtime.test.ts, tests/scripts/clean-active-execution-guard.test.ts, tests/scripts/dist-clean-guard.test.ts
- Dependencies: Task 4, Task 7

### Description

Read-only independent review of the combined lock/clean authority. Report P0/P1 findings and exact
evidence; do not edit files.

**Proof:** byte hashes remain unchanged during review; every claimed invariant maps to a test.
**Test:** rerun all four targeted suites with `VITEST_MAX_FORKS=2`.

## Task 9: ADMISSION-TYPE — compile admission against canonical lock

- Provider: codex
- Model: gpt-5.6-terra
- Effort: normal
- Files: src/core/task-execution-admission.ts
- Scope: src/core/task-execution-admission.ts
- Dependencies: Task 4

### Description

Reconcile admission types and lock outcomes with the stabilized lock API. Preserve request snapshot,
recovery intent, process-state and projection-cleanup distinctions.

**Proof:** no acquire outcome collapses `in-flight`/`quarantined` into retryable not-started state.
**Test:** TypeScript plus Task 10–12 admission suite.

## Task 10: ADMISSION-EVIDENCE — bounded durable recovery chain

- Provider: claude
- Model: claude-sonnet-5
- Effort: high
- Files: src/core/task-execution-admission.ts, tests/core/task-execution-admission.test.ts
- Scope: src/core/task-execution-admission.ts, tests/core/task-execution-admission.test.ts
- Dependencies: Task 9

### Description

Verify count/byte budgets across request, recovery-intent, prepared, dispatched and terminal
evidence. Reserve terminal failure capacity before process birth and require durable adoption
evidence with fresh verification.

**Proof:** no admitted dispatch can make terminal persistence structurally impossible.
**Test:** targeted evidence-budget and adoption cases.

## Task 11: ADMISSION-CRASH — real child-process replay proof

- Provider: codex
- Model: gpt-5.6-sol
- Effort: high
- Files: tests/core/task-execution-admission.test.ts
- Scope: tests/core/task-execution-admission.test.ts
- Dependencies: Task 10

### Description

Complete the bounded async child-process crash fixture after durable dispatch evidence and before
completion. A retry must observe one recoverable in-flight boundary and produce zero duplicate
process calls.

**Proof:** child exits at the injected checkpoint; durable locator survives process death.
**Test:** exact crash/replay test plus complete admission suite.

## Task 12: ADMISSION-HEARTBEAT — shared scheduler and scale proof

- Provider: claude
- Model: claude-sonnet-5
- Effort: high
- Files: src/core/task-execution-admission.ts, tests/core/task-execution-admission.test.ts
- Scope: src/core/task-execution-admission.ts, tests/core/task-execution-admission.test.ts
- Dependencies: Task 11

### Description

Prove one shared scheduler, bounded timer count, deterministic staggering, live-handle renewal,
`throw undefined` capture, teardown and task isolation at meaningful concurrency.

**Proof:** timer diagnostics return to zero and no admission renews another task.
**Test:** complete admission suite with high-cardinality case.

## Task 13: ADMISSION-AUDIT — independent final admission verdict

- Provider: claude
- Model: claude-opus-5
- Effort: high
- Files: src/core/task-execution-admission.ts, tests/core/task-execution-admission.test.ts
- Scope: src/core/task-execution-admission.ts, tests/core/task-execution-admission.test.ts
- Dependencies: Task 8, Task 12

### Description

Read-only final review for duplicate process birth, irrecoverable in-flight state, evidence
exhaustion, mutable request drift, unhandled thenables and million-scale timer behavior.

**Proof:** review hashes are recorded and no review mutation occurs.
**Test:** admission suite and relevant lock suites.

## Task 14: BUILD-BASELINE — revalidate the transactional build slice

- Provider: codex
- Model: gpt-5.6-terra
- Effort: normal
- Files: scripts/build.mjs, scripts/build-dashboard.mjs, scripts/copy-assets.mjs, tests/scripts/build-lifecycle.test.ts, tests/scripts/build-staging-tools.test.ts
- Scope: scripts/build.mjs, scripts/build-dashboard.mjs, scripts/copy-assets.mjs, tests/scripts/build-lifecycle.test.ts, tests/scripts/build-staging-tools.test.ts
- Dependencies: none

### Description

Run the existing build/copy/dashboard lifecycle tests without performing a real build. Attribute
any regression to current disk state before changing code.

**Proof:** exact script hashes and test counts; no `dist` mutation.
**Test:** targeted build lifecycle/staging suites and `node --check` for all three scripts.

## Task 15: BUILD-RECOVERY — close journal and durability residuals

- Provider: claude
- Model: claude-sonnet-5
- Effort: high
- Files: scripts/build.mjs, scripts/build-dashboard.mjs, scripts/copy-assets.mjs, tests/scripts/build-lifecycle.test.ts, tests/scripts/build-staging-tools.test.ts
- Scope: scripts/build.mjs, scripts/build-dashboard.mjs, scripts/copy-assets.mjs, tests/scripts/build-lifecycle.test.ts, tests/scripts/build-staging-tools.test.ts
- Dependencies: Task 14

### Description

Repair only demonstrated residuals in immutable snapshot, journal recovery, recursive fsync,
source/tool/output identity binding, dashboard core integrity and retention. Do not wire
`package.json` or perform directory publication.

**Proof:** every journal state has deterministic recovery and no live-output absent window is claimed.
**Test:** targeted build suites.

## Task 16: BUILD-PUBLISH-SCOPE — every-environment adapter contract

- Provider: codex
- Model: gpt-5.6-sol
- Effort: high
- Files: scripts/build.mjs, src/cli/worktree-binary-authority.ts
- Scope: scripts/build.mjs, src/cli/worktree-binary-authority.ts
- Dependencies: Task 15

### Description

Read-only design review. Produce the exact additional file/technology manifest needed for gap-free
Linux, macOS, Windows-native and WSL directory publication plus checkout-content build identity.
Do not create or edit the unapproved adapter/authority files.

**Proof:** report names platform semantics, packaging, rollback, crash matrix and tests.
**Test:** no file mutation; design is independently reviewable.

## Task 17: XVERIFY-SEPARATION — verify provider independence and exact identity

- Provider: claude
- Model: claude-opus-5
- Effort: high
- Files: src/core/cross-verify.ts, src/orchestra/cross-verify-runner.ts, src/orchestra/cross-verify-production-ingress-authority.ts, src/core/model-equivalence.ts, .deckent/config.json
- Scope: src/core/cross-verify.ts, src/orchestra/cross-verify-runner.ts, src/orchestra/cross-verify-production-ingress-authority.ts, src/core/model-equivalence.ts, .deckent/config.json
- Dependencies: none

### Description

Read-only audit that same-provider candidates are always excluded and local policy resolves
Codex/Sol→Claude/Fable 5, optional Opus 5 override, and Claude→Codex Terra/Sol without silent
fallback.

**Proof:** exact selection table and config/model registry evidence; all files byte-identical.
**Test:** targeted cross-verify selector/config tests only.

## Task 18: PROVIDER-CAPACITY — usage and admission readiness

- Provider: codex
- Model: gpt-5.6-terra
- Effort: normal
- Files: .deckent/config.json, .deckent/settings/resource-log.jsonl, .deckent/runtime/resource-log-dogfood.jsonl
- Scope: .deckent/config.json, .deckent/settings/resource-log.jsonl, .deckent/runtime/resource-log-dogfood.jsonl
- Dependencies: Task 17

### Description

Read-only assessment of current Codex/Claude availability, historical usage evidence, finite
budget capability and six-slot safe concurrency. Do not infer subscription quota remaining from
historical token totals.

**Proof:** distinguish observed usage, reachability, entitlement and unknown remaining quota.
**Test:** `deckent usage`, `deckent doctor --json`, model catalog inspection.

## Task 19: DOCTOR-DOCKER — diagnose the Docker false-negative

- Provider: claude
- Model: claude-sonnet-5
- Effort: normal
- Files: src/cli/commands/doctor.ts, src/cli/commands/doctor-checks.ts, tests/cli/commands/doctor.test.ts
- Scope: src/cli/commands/doctor.ts, src/cli/commands/doctor-checks.ts, tests/cli/commands/doctor.test.ts
- Dependencies: none

### Description

Read-only diagnosis of why `deckent doctor` reports Docker unavailable while direct client/server
version succeeds. Identify stale-binary, PATH, probe or classification cause and exact repair scope.

**Proof:** direct Docker evidence and doctor call-path evidence are separated.
**Test:** no mutation; provide one bounded reproducer.

## Task 20: GOAL-LIFECYCLE — diagnose blocked-resume truth

- Provider: codex
- Model: gpt-5.6-sol
- Effort: high
- Files: src/orchestra/autonomous/goal-planner.ts, src/orchestra/autonomous/goal-planner-types.ts, src/orchestra/autonomous/mission-store/goal-mission.ts, docs/MASTER-PLAN.md
- Scope: src/orchestra/autonomous/goal-planner.ts, src/orchestra/autonomous/goal-planner-types.ts, src/orchestra/autonomous/mission-store/goal-mission.ts, docs/MASTER-PLAN.md
- Dependencies: none

### Description

Read-only map of persistent goal status/resume semantics. Separate host session-goal API behavior
from Deckent Goal v2 behavior; do not mark the unfinished goal complete and do not create a reduced
replacement.

**Proof:** exact state-transition gap and proposed canonical owner are named.
**Test:** no mutation; current goal objective/status evidence retained.

## Task 21: MAIN-TRUTH — branch/worktree integration inventory

- Provider: claude
- Model: claude-sonnet-5
- Effort: normal
- Files: .git
- Scope: .git
- Dependencies: none

### Description

Read-only inventory of current main HEAD, dirty paths, already-merged worktree commits, unique
approval/release commits and stale prunable metadata. Do not merge, prune, commit or modify refs.

**Proof:** ancestry and dirty-overlap table with exact SHAs.
**Test:** `git branch -vv`, `git worktree list --porcelain`, bounded ancestry checks.

## Task 22: R0-COMBINED-GATE — targeted compiler and test composition

- Provider: codex
- Model: gpt-5.6-terra
- Effort: high
- Files: src/core/file-lock.ts, scripts/clean.mjs, src/core/task-execution-admission.ts, scripts/build.mjs, scripts/build-dashboard.mjs, scripts/copy-assets.mjs, tests/core/task-execution-fence.test.ts, tests/core/file-lock-runtime.test.ts, tests/core/task-execution-admission.test.ts, tests/scripts/clean-active-execution-guard.test.ts, tests/scripts/dist-clean-guard.test.ts, tests/scripts/build-lifecycle.test.ts, tests/scripts/build-staging-tools.test.ts
- Scope: src/core/file-lock.ts, scripts/clean.mjs, src/core/task-execution-admission.ts, scripts/build.mjs, scripts/build-dashboard.mjs, scripts/copy-assets.mjs, tests/core/task-execution-fence.test.ts, tests/core/file-lock-runtime.test.ts, tests/core/task-execution-admission.test.ts, tests/scripts/clean-active-execution-guard.test.ts, tests/scripts/dist-clean-guard.test.ts, tests/scripts/build-lifecycle.test.ts, tests/scripts/build-staging-tools.test.ts
- Dependencies: Task 8, Task 13, Task 16, Task 17, Task 19

### Description

Run the combined bounded compiler and targeted tests from a stable disk snapshot. Do not repair
inside this task; attribute every failure to an owning predecessor or new typed residual.

**Proof:** command, exit status, test count, hashes and failure ownership.
**Test:** TypeScript no-emit plus all R0 targeted suites with `VITEST_MAX_FORKS=2`.

## Task 23: R0-SETTLEMENT — evidence and retry-safety review

- Provider: claude
- Model: claude-opus-5
- Effort: high
- Files: .tasks, .brain/archive, .deckent/runtime
- Scope: .tasks, .brain/archive, .deckent/runtime
- Dependencies: Task 18, Task 20, Task 21, Task 22

### Description

Read-only review of R0 task results, attempts, usage, heartbeats, cross-verify evidence and terminal
settlement. Identify missing or ambiguous receipts; never synthesize evidence or delete artifacts.

**Proof:** every task has one terminal/reconciliation owner and duplicate attempts are explained.
**Test:** disk artifact inventory and Deckent status/history output.

## Task 24: R0-PROMOTION — independent final recommendation

- Provider: claude
- Model: claude-opus-5
- Effort: high
- Files: docs/MASTER-PLAN.md, DIRECTIVES.md
- Scope: docs/MASTER-PLAN.md, DIRECTIVES.md
- Dependencies: Task 16, Task 23

### Description

Read-only final assessment against the persistent goal and §11.1 execution addendum. Recommend
`GO`, `NO_GO` or `GO_WITH_TECH_DEBT` for the next provider-free C0/C1 slice, with exact residual
owners. Do not edit MASTER or DIRECTIVES.

**Proof:** recommendation cites compiler, tests, disk truth, usage, provider separation and settlement.
**Test:** files remain byte-identical; root supervisor independently re-verifies the recommendation.
