# DIRECTIVES — Sprint-B14: authority-authoring + catalog S5 + persona detection, 12-task Kahn wave

## Goal

Twelve tasks advance across five dependency chains and four parallel independents,
re-authored after the sol (gpt-5.6-sol, xhigh) adversarial cross-review refuted the
first draft UNSOUND — every under-scoped write list widened to the verified call
sites, both phantom artifacts (the skill snapshot, the GWTD-defect premise) replaced
with code truth. Result-notes-first binds this wave: exactly ONE standalone document
(Task 12, the ADR-G-019 amendment draft) with its delete trigger in its header.

Chains: 1→2 (authoring feeds doctor, shared message authority) · 3→4 (aggregate
lands, then canary wiring on the same workflow) · 5→6 (integrity verdict feeds the
shared prompt-resolution boundary) · 5→9 (agent projection consumes the same
resolver surface) · 7→8 (the snapshot artifact is CREATED, then gated).
Independents: doc-task verification isolation (10) · FIX-admission truth pin (11) ·
ADR-G-019 amendment draft (12) · with 1 and 7 sharing the message authority — the
planner's collision edges serialize them.

Workers may READ any path named in their Scope, including src/ directories listed
purely for context; reading beyond Scope is not required by any task here.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host
admission.

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
  async spawn only (ADR-D-002). No live provider calls from any task.
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr).
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.
- Findings default to result notes; only Task 12 produces a standalone document.

---

## Task 1: Provider-limits authoring flow — derive the policy from live provider truth

- Files: src/cli/commands/provider-authority.ts, src/core/provider-limit-authoring.ts, src/core/provider-evidence-producer.ts, src/core/provider-authority-composition.ts, src/core/config.ts, src/cli/helpers/messages.ts, tests/core/provider-limit-authoring.test.ts
- Scope: src/cli/commands/provider-authority.ts, src/cli/commands/, src/core/provider-limit-authoring.ts, src/core/, src/cli/helpers/, tests/core/provider-limit-authoring.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3322 + live remedy attempt + sol cross-review): the xverify composition
holds with a typed authority-unavailable because no owner-authored `provider_limits`
block exists in the global config layer; hand-authoring is impossible — the selector
demands real account/quota hashes. Sol code-truth: current account identity resolves
PRIVATELY inside the provider evidence producer; sound reuse requires exporting from
that path or the authority composition module; global persistence lives in the core
config module's write path; user-facing confirmation strings need the message
authority — all four now in write authority.

Required: root-cause read of the composition path first. Then the smallest sound
authoring surface: a `provider-authority limits init` sub-flow that reuses the SAME
identity resolution the composition reads (export the existing private helper — no
second derivation), derives selector hashes with the consuming resolver's own code,
writes a validator-green `provider_limits` block to the global config layer behind an
owner-confirmation prompt (i18n en+tr via getMessage), and refuses typed when live
identity is unresolvable. Hermetic tests pin: validator-green output, refusal on
unresolvable identity, hash equality with the consumer's derivation.

**Test:** `npx vitest run tests/core/provider-limit-authoring.test.ts`

**NO-GO:** a second hash derivation, fabricated selector values, writing without
confirmation, or touching provider credentials.

## Task 2: Doctor provider-limit-authority coverage — the misdirection ends

- Files: src/cli/commands/doctor-checks.ts, src/cli/commands/doctor.ts, src/cli/helpers/messages.ts, tests/cli/doctor-provider-authority.test.ts
- Scope: src/cli/commands/doctor-checks.ts, src/cli/commands/doctor.ts, src/cli/commands/, src/cli/helpers/, src/core/, tests/cli/doctor-provider-authority.test.ts
- Model: claude-sonnet-5
- Dependencies: Task 1

Measured (row 3322 + sol cross-review): doctor suggested `keyring init` while the
composition held on a different missing artifact; sol code-truth — the production
authority injection lives in the doctor command module (not only doctor-checks) and
new remedy keys need the message authority; both now in write authority.

Required: doctor reports the provider-limit-authority envelope as a first-class check
distinguishing absent / authored-empty / present by reading the SAME composition
surface the xverify path reads (no parallel probe); remedy text names the Task 1
authoring flow via getMessage (en+tr). The keyring check stays but may no longer
claim to fix the limit-authority hold. Hermetic tests pin the three states and the
remedy key.

**Test:** `npx vitest run tests/cli/doctor-provider-authority.test.ts`

**NO-GO:** a doctor probe reading different state than the composition, or a remedy
string outside the message authority.

## Task 3: CI D5 — the aggregate required-check lands

- Files: .github/workflows/ci.yml, tests/scripts/ci-aggregate-gate.test.ts
- Scope: .github/workflows/ci.yml, .github/workflows/, tests/scripts/ci-aggregate-gate.test.ts, tests/scripts/
- Model: claude-opus-5
- Dependencies: none

Measured (required-checks design, owner decision 2026-08-11 "E now + D5 B14"): the
2026-08-11 incident class — PR #120 merged with red shards because only Type Check
and the three Validator legs are ruleset-required; the design's recommended shape is
D5, one aggregate job that fans in every shard result with a minimum-count
assertion, so the ruleset needs exactly ONE new required context and never breaks on
matrix changes.

Required: a new `Shards Green` aggregate job in the CI workflow: `needs` every test
shard, runs on pull_request (not merge_group — row 535's exclusion is preserved),
fails if any needed job failed or was cancelled, and asserts a minimum needed-job
count so a silently-dropped shard cannot pass the gate; jobs that legitimately skip
(merge_group guards) are counted from their event context, not hardcoded. The
Docs+Scripts shard joins the aggregate ONLY through its current continue-on-error
state (Task 4 decides its hard status). A hermetic test parses the workflow and pins:
the aggregate exists, needs-list covers every `Tests —` job, and the minimum count
matches the live job inventory. Result notes list the exact owner-manual ruleset
change (add one context), unexecuted.

**Test:** `npx vitest run tests/scripts/ci-aggregate-gate.test.ts`

**NO-GO:** editing the ruleset, changing what any shard runs, or an aggregate that
passes when a needed job is missing.

---

## Task 4: Docs+Scripts canary wiring — measure, then decide continue-on-error

- Files: .github/workflows/ci.yml, tests/github/ci-workflow.test.ts, tests/scripts/docs-scripts-canary.test.ts
- Scope: .github/workflows/ci.yml, .github/workflows/, vitest.config.ts, tests/github/, tests/scripts/docs-scripts-canary.test.ts, tests/scripts/
- Model: claude-sonnet-5
- Dependencies: Task 3

Measured (flake RCA + sol cross-review): the serialization canary exists in vitest
config but no CI step exercises it; sol code-truth — the real workflow-hygiene
authority whose pins must change is the github workflow test suite, now in write
authority.

Required: the Docs+Scripts job runs the canary env on its existing step (serial, dot
reporter); no bounded retry (the RCA rejected it). continue-on-error stays UNTIL the
RCA's acceptance series is met — result notes state how many green runs and where the
evidence is read. The existing workflow test suite gains the pin that the canary env
is present so it cannot silently drop.

**Test:** `npx vitest run tests/scripts/docs-scripts-canary.test.ts`

**NO-GO:** removing continue-on-error in this slice, adding a retry, or changing
which tests the shard runs.

## Task 5: Persona D-G(a) — machine-detectable broken persona in the catalog

- Files: src/core/agent-pool.ts, src/core/agent-types.ts, src/core/config-types.ts, src/core/config.ts, tests/core/persona-integrity-detection.test.ts
- Scope: src/core/agent-pool.ts, src/core/agent-types.ts, src/core/config-types.ts, src/core/config.ts, src/core/, tests/core/persona-integrity-detection.test.ts
- Model: claude-opus-5
- Dependencies: Task 1

Measured (owner D-G(a) + sol cross-review): the catalog classifies prompt-degraded
records but no typed integrity verdict exists; sol code-truth — a genuinely
config-resolved floor needs the typed config surface (config-types + config default
resolution), now in write authority; the manifest-declared digest field needs schema
treatment in agent-types.

Required: extend the resolver's prompt resolution with a typed persona-integrity
verdict: intact / empty / undersized (config-resolved floor with typed default, no
literal) / digest-mismatch (against a manifest-declared digest when present — schema
field added additive-warning per the D2 contract) / unreadable. Verdict is data —
no routing change in this slice (Task 6 consumes). Existing suites stay green
unmodified. Tests pin every class including no-declared-digest (no fabricated
mismatch).

**Test:** `npx vitest run tests/core/persona-integrity-detection.test.ts tests/core/agent-prompt-resolution.test.ts`

**NO-GO:** modifying existing suites, a hardcoded floor, or any routing/spawn
behaviour change.

## Task 6: Persona D-F(a) — the shared prompt-resolution boundary refuses broken personas

- Files: src/orchestra/result-collector.ts, src/orchestra/sprint-spawner.ts, tests/orchestra/persona-spawn-gate.test.ts
- Scope: src/orchestra/result-collector.ts, src/orchestra/sprint-spawner.ts, src/orchestra/, src/core/, tests/orchestra/persona-spawn-gate.test.ts
- Model: claude-opus-5
- Dependencies: Task 5

Measured (owner D-F(a) + sol cross-review): the plan's single-file version could not
enforce the boundary — sol code-truth: the COMMON agent-prompt resolver in the
result-collector module collapses resolution to a bare string and five other spawn
ingresses (run, spawn, mcp run, task-mode-runner, scheduler-effects) all funnel
through it. Enforcing at that shared choke point covers every ingress with one
change — the same single-choke-point pattern the 522-011 skill switch proved.

Required: the shared resolver carries Task 5's integrity verdict instead of
discarding it; at the sprint-spawner admission point AND through the shared
resolver's return contract, a non-intact persona produces a typed refusal consistent
with the established honest-NO-GO artifact — never a silent personaless spawn.
Owner D-D degrade (absent system-channel) stays untouched — it is not a broken
persona. Config-resolved enforcement mode, advisory default, warn-only emit — no
default flip. Tests pin: broken+enforce → typed refusal; broken+advisory → spawn
with warning; intact → byte-identical.

**Test:** `npx vitest run tests/orchestra/persona-spawn-gate.test.ts`

**NO-GO:** flipping the enforcement default, blocking D-D degrade, a refusal without
the honest artifact, or a second resolution path beside the shared choke point.

## Task 7: Skill catalog S5 — the canonical snapshot artifact + CLI/MCP migration

- Files: src/core/skill-pool.ts, src/cli/commands/skill.ts, src/mcp/tools/skill-list.ts, src/cli/helpers/messages.ts, tests/cli/skill-surface-readmodel.test.ts
- Scope: src/core/skill-pool.ts, src/core/, src/cli/commands/skill.ts, src/cli/commands/, src/mcp/tools/skill-list.ts, src/mcp/tools/, src/cli/helpers/, tests/cli/skill-surface-readmodel.test.ts
- Model: claude-opus-5
- Dependencies: Task 2

Measured (design S5 + sol cross-review): the design's `snapshot()` DOES NOT EXIST —
the real catalog API is `resolveSkillCatalog()` and `listEffective()` on the skill
pool (sol-verified); CLI and MCP scan independently. The snapshot artifact must be
CREATED here, not assumed.

Required: first the core artifact — a canonical `snapshot()` on the skill pool
built over `resolveSkillCatalog()`: ordered entries + a stable content digest
(reusing the pool's existing per-entry digest primitive, no second hash mechanism).
Then migrate CLI `skill` and MCP `skill_list` onto it: identical counts/ids across
CLI, MCP and snapshot on one tree; disposition/validity/profileState visible in both
payloads; new user-facing labels via getMessage. Hermetic tmpdir fixtures.

**Test:** `npx vitest run tests/cli/skill-surface-readmodel.test.ts`

**NO-GO:** a raw scan surviving on the migrated surfaces, a second digest mechanism,
or payload/snapshot disagreement.

## Task 8: Skill catalog S8 — the determinism gate over the real snapshot

- Files: scripts/lint-skill-catalog-determinism.mjs, scripts/script-registry.json, tests/scripts/skill-catalog-determinism.test.ts
- Scope: scripts/lint-skill-catalog-determinism.mjs, scripts/script-registry.json, scripts/, src/core/, tests/scripts/skill-catalog-determinism.test.ts
- Model: claude-sonnet-5
- Dependencies: Task 7

Measured (design S8 + sol cross-review): the gate consumes Task 7's snapshot digest —
which exists only after Task 7 (the chain is now real); the script registry is
exhaustively enforced by its governance test, so the registry file is in write
authority (sol-caught omission).

Required: a lint script (NEW, registered in the script registry IN THIS TASK) that
computes Task 7's catalog snapshot digest of the real tree twice — catalog-only and
with machine-local sidecar state — failing typed on undeclared divergence, honoring
the grandfathered-drift baseline's canonical-side disposition (a disposition, not a
bare allowlist). Not wired into lint:gates — that wiring is a named follow-up owner
decision in result notes. Hermetic tmpdir fixtures: in-sync pass, undeclared-drift
fail, declared-drift pass.

**Test:** `npx vitest run tests/scripts/skill-catalog-determinism.test.ts`

**NO-GO:** wiring into CI gates here, a second digest mechanism, a bare allowlist,
or writing real catalog state.

## Task 9: Agent catalog S5 — ONE shared projection for CLI, MCP and API

- Files: src/core/agent-pool.ts, src/cli/commands/agent.ts, src/mcp/tools/agent-list.ts, src/api/server.ts, tests/api/agent-surface-readmodel.test.ts
- Scope: src/core/agent-pool.ts, src/core/, src/cli/commands/agent.ts, src/cli/commands/, src/mcp/tools/agent-list.ts, src/mcp/tools/, src/api/server.ts, src/api/, tests/api/agent-surface-readmodel.test.ts
- Model: claude-opus-5
- Dependencies: Task 5

Measured (sol cross-review, superseding both earlier drafts): no shared agent
projection exists — CLI and MCP each BUILD their own payload over the resolver
(duplicate builders, sol-cited), and the API's inline `/api/agents` handler is a
third independent shape; the dashboard does NOT consume `/api/agents` (its worker
grid reads status data), so the transitive claim was false. Depends on Task 5
because both mutate the resolver surface (sol-caught missing edge).

Required: ONE canonical projection helper on the agent pool (the same
single-choke-point pattern as skill S5): ordered entries with enabled/routability/
validity/provenance and the invalid-manifest records. CLI, MCP and the API handler
all consume it — the duplicate builders are deleted, payload compatibility for
existing consumers preserved field-for-field. Identical counts/ids across all three
surfaces and the projection on one tree. Result notes record the dashboard truth
(no `/api/agents` consumer) instead of claiming transitivity. Touches `src/api/` —
the result carries the declared real-binary smoke line.

**Test:** `npx vitest run tests/api/agent-surface-readmodel.test.ts`

**NO-GO:** any surface keeping its own builder, breaking an existing payload field,
or payload/projection disagreement.

## Task 10: Doc-task verification isolation — fix it at the rendering layer

- Files: src/orchestra/prompt-god-template.ts, src/orchestra/rubric-registry.ts, src/orchestra/task-builder.ts, tests/orchestra/doc-task-verification-scope.test.ts
- Scope: src/orchestra/prompt-god-template.ts, src/orchestra/rubric-registry.ts, src/orchestra/task-builder.ts, src/orchestra/, tests/orchestra/doc-task-verification-scope.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (sprint-522 live evidence + sol cross-review): a doc-only worker ran
repo-wide tsc and raced parallel workers' in-flight state; sol code-truth — the
verification guidance is RENDERED in the prompt template module (not task-builder),
and doc/code classification already exists in the rubric registry; all three layers
now in write authority.

Required: root-cause note first (where the guidance text originates). Then: reuse
the rubric registry's existing doc/code classification — a task classified
documentation-class gets verification guidance naming ONLY its task-declared checks
(document existence, link lint, declared test command), never repo-wide tsc/vitest;
source-writing tasks keep today's guidance byte-identical. NOTE: this changes the
worker-prompt contract for future waves — result notes must flag it for the wave
admission checklist. Hermetic test pins both prompt classes.

**Test:** `npx vitest run tests/orchestra/doc-task-verification-scope.test.ts`

**NO-GO:** changing guidance for source-writing tasks, a second classification
mechanism beside the rubric registry's, or removing a task-declared check.

## Task 11: FIX-admission truth pin — Brain downgrade is the authority, and it stays that way

- Files: tests/orchestra/gwtd-fix-trigger.test.ts
- Scope: tests/orchestra/gwtd-fix-trigger.test.ts, tests/orchestra/, src/orchestra/, .brain/archive/, .deckent/runtime/evaluations/
- Model: claude-opus-5
- Dependencies: none

Measured (CORRECTED premise — sol cross-review + disk verification): sprint-522's
002 lineage did NOT settle Brain-GWTD: the worker claimed GO_WITH_TECH_DEBT but the
Brain rubric scored correctness 20 against threshold 60 and settled NO_GO (the
evaluation artifact proves it) — so the FIX spawns were CORRECT authority behaviour,
not a defect. The debt manager creates debt for Brain-GWTD and FIX for Brain-NO_GO.
What is missing is a REGRESSION PIN of that contract.

Required: a hermetic test pinning the FIX-admission contract from the real modules:
a lineage whose BRAIN evaluation settles GO_WITH_TECH_DEBT enters the debt path and
never the FIX spawn set; a lineage whose Brain evaluation settles NO_GO enters FIX;
a worker self-claim alone moves neither. Result notes record the corrected 522-002
chronology (worker-GWTD → Brain-NO_GO → three FIX attempts, all evaluated) with the
artifact paths as evidence, retiring the earlier mischaracterization.

**Test:** `npx vitest run tests/orchestra/gwtd-fix-trigger.test.ts`

**NO-GO:** changing FIX admission behaviour, or a pin that trusts worker
self-assessment as the settling verdict.

## Task 12: ADR-G-019 successor-procedure amendment draft (row 4212)

- Files: follow-up-works/adr-g019-procedure-amendment-2026-08-12.md
- Scope: follow-up-works/adr-g019-procedure-amendment-2026-08-12.md, follow-up-works/, .brain/exports/
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 4212, C1/C4 matrices): ADR-G-019 never uses the word "successor" — the
route for an Immutable:yes ADR is forced by elimination but unwritten; and the owner
recorded 2026-08-11 that the class declaration (immutable=yes) governs over a
per-ADR header. Delete trigger (this document's header must carry it): consumed when
the owner approves the amendment text into the ADR store, then deleted.

Required: the amendment draft, quoting current ADR-G-019 normative text verbatim
from the exported decisions projection and proposing the exact new procedure
sections: who may draft an ADR-G successor (owner-only vs owner-delegated), what
evidence closes the equivalence proof, predecessor archive semantics (the MADR-v3
Supersedes field), the class-immutability rule as decided, and the amendment path
for Immutable:no ADR-G entries (the C4 landing dependency). Proposes only — the ADR
store is untouched; the draft ends with the owner decision checklist.

**Test:** the document exists at the exact path with every section and the delete
trigger in its header; `node scripts/lint-links.mjs` stays green.

**NO-GO:** writing to the ADR store or memory db, paraphrasing instead of quoting
G-019, or omitting the delete trigger.
