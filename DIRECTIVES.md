# DIRECTIVES — Sprint-B15: the xverify unlock chain + the three born closures, 13-task wave

## Goal

Thirteen tasks across four dependency chains and five parallel independents,
re-authored after the sol adversarial round refuted two premises (the resume-
baseline theory and the envelope-stamp claim) and named thirteen scope gaps —
every write list below carries the sol-verified call sites. Result-notes-first:
ZERO standalone documents.

Chains: 1→2→3 (codex evidence sources → authoring wire → unlock proof, with the
bootstrap file writable inside the chain) · 4→3 (the unlock proof consumes the
final tier-floor semantics) · 4→5 (shared cross-verify authority file) · 6→9
(limit-death typing feeds the fix-budget pin) · 6→7 (shared spawn-backend file).
Independents: KN3 parser fix (8) · init-rot mock repair (10) · determinism
sidecar distinction (11) · persona declared-digest (12) · runs-inbox hygiene (13).

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
  async spawn only (ADR-D-002). No live provider calls from any task — the ONE
  exception is Task 3's declared real-binary smoke, which the HOST runs post-settlement,
  not the worker.
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr).
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: Codex evidence-source registrations + bootstrap consumption

- Files: src/providers/codex-provider-evidence-sources.ts, src/providers/provider-authority-runtime-bootstrap.ts, tests/providers/codex-provider-evidence-sources.test.ts
- Scope: src/providers/codex-provider-evidence-sources.ts, src/providers/provider-authority-runtime-bootstrap.ts, src/providers/, src/core/, tests/providers/codex-provider-evidence-sources.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured: the runtime bootstrap registers ONLY claude evidence sources
(provider-authority-runtime-bootstrap imports the claude registrations at its
head — sol-verified line 7); the authoring flow holds for codex with the typed
source-unavailable refusal (measured live 2026-08-12).

Required: the codex mirror of the claude registrations module — the FULL source
set the claude module registers (account identity AND the limit-window evidence
source, mirroring claude-subscription-limit-evidence — sol round-2: auth state
alone leaves the chain holding on limit_windows_unavailable), from the codex
CLI's durable on-disk auth/usage state, read-only, no network, typed
unavailable per-source on absent/corrupt state — AND the bootstrap consuming
it beside the claude set (its file is in write authority per
sol's under-scoping finding). Hermetic tests: fixture auth-state present →
stable hashes; absent/corrupt → typed unavailable; bootstrap registers both
provider sets.

**Test:** `npx vitest run tests/providers/codex-provider-evidence-sources.test.ts`

**NO-GO:** network calls, credential mutation, fabricated identity values, or a
registration contract diverging from the bootstrap's existing one.

## Task 2: Authoring flow sourceResolver — the bootstrap exposes, the CLI consumes

- Files: src/cli/commands/provider-authority.ts, src/providers/provider-authority-runtime-bootstrap.ts, tests/cli/provider-limits-authoring-wire.test.ts
- Scope: src/cli/commands/provider-authority.ts, src/cli/commands/, src/providers/provider-authority-runtime-bootstrap.ts, src/providers/, src/core/, tests/cli/provider-limits-authoring-wire.test.ts
- Model: claude-opus-5
- Dependencies: Task 1

Measured (sol code-truth): production registers the provider-authority command
with NO injected resolver while runLimitsInit refuses when deps.sourceResolver is
absent — and the bootstrap exposes no resolver, so the first draft was
impossible inside its own write authority. The bootstrap file is now writable.

Required: the bootstrap EXPOSES a resolver view over its registered sources (one
registry — the same registrations object it already builds, no parallel list);
the CLI's limits-init resolves its sourceResolver from that exposure when no
injection is supplied. The injectable seam stays for tests; the typed hold text
stays byte-identical when no source resolves. Hermetic tests: fixture bootstrap
source → flow reaches the proposal stage; none → unchanged hold.

**Test:** `npx vitest run tests/cli/provider-limits-authoring-wire.test.ts tests/core/provider-limit-authoring.test.ts`

**NO-GO:** a second resolver registry, changing the hold message, or authoring
without the owner-confirmation prompt.

## Task 3: The live unlock proof — authored policy, first healthy xverify

- Files: tests/cli/xverify-authority-unlock.test.ts
- Scope: tests/cli/xverify-authority-unlock.test.ts, tests/cli/, src/cli/commands/, src/core/, src/orchestra/, src/providers/
- Model: claude-sonnet-5
- Dependencies: Task 2, Task 4

Measured: every manual xverify since 2026-08-11 returned the authority-unavailable
hold; this proof consumes the FINAL semantics — the Task 2 wiring AND the Task 4
tier floor (sol's missing 4→3 edge, now declared).

Required: a hermetic test driving the FULL composition against a tmpdir global
config carrying a validator-green authored policy (built through the Task 2 flow
with a fixture source) pinning: verifier scope resolves (no authority-unavailable),
tier-equivalence still selects the configured verifier model under the Task 4
floor, an absent policy still holds typed, and a below-floor verifier request
refuses typed. Result notes DECLARE the host-run real-binary smoke: live
`provider-authority limits init` then one live `deckent xverify` whose outcome
must not be `unavailable` — host-run post-settlement, never worker-run.

**Test:** `npx vitest run tests/cli/xverify-authority-unlock.test.ts`

**NO-GO:** live provider calls from the worker, weakening any fail-closed hold,
or a fixture bypassing the validator.

## Task 4: XVerify tier floor — an authoritative author-model input, enforced in the resolver

- Files: src/cli/commands/xverify.ts, src/orchestra/cross-verify-runner.ts, src/cli/helpers/messages.ts, tests/cli/xverify-tier-floor.test.ts
- Scope: src/cli/commands/xverify.ts, src/cli/commands/, src/orchestra/cross-verify-runner.ts, src/orchestra/, src/cli/helpers/, src/core/, tests/cli/xverify-tier-floor.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (owner rule 2026-08-12 + sol code-truth): verification must run on a
tier equal-or-above the author's, and nothing enforces it. CORRECTED premises
per sol: the xv claim envelope's author-model stamp is INTENTIONAL (verifier
selection excludes task.provider — it must not change), the verifier task
already stamps its resolved identity correctly, and tier resolution lives in
cross-verify-runner (not only the ingress authority). The REAL gap: the CLI
accepts only `--author` (provider) and substitutes resolveDefaultModel for the
author model, so the floor has no authoritative author-model input.

Required: the CLI gains `--author-model <apiId>` (registry-validated; when
omitted, the resolved default is used AND recorded as low-confidence in the
receipt); the tier floor lives in cross-verify-runner's verifier resolution:
tiers come from the model registry (zero hardcode), a requested or resolved
verifier tier below the author model's tier refuses typed
(`xverify_verifier_tier_below_author`) and `--verifier-model` cannot bypass it;
refusal/option strings via getMessage (en+tr). The claim envelope is UNTOUCHED.
Hermetic tests: below-tier explicit request refuses; equal/above passes;
same-provider prohibition unchanged; author-model flag validated against the
registry.

**Test:** `npx vitest run tests/cli/xverify-tier-floor.test.ts`

**NO-GO:** a tier table outside the model registry, touching the claim
envelope's author stamp, or weakening the same-provider prohibition.

## Task 5: Born 3323 — producer fencing compares the pre-enrichment core

- Files: src/orchestra/cross-verify-production-ingress-authority.ts, tests/orchestra/xverify-producer-fencing.test.ts
- Scope: src/orchestra/cross-verify-production-ingress-authority.ts, src/orchestra/, src/core/, .brain/archive/, tests/orchestra/xverify-producer-fencing.test.ts
- Model: claude-opus-5
- Dependencies: Task 4

Measured (born 3323; sol-verified): the fencing byte-compares the CLOSED
settlement's raw result against the evaluate-phase's post-settlement-ENRICHED
copy — the enrichment classes are real (attribution fields, distMutated
advisory, token backfill, all written in spawn-backend-docker's monitor path) —
structural inequality, zero healthy in-sprint verifies across three sprints.
The three archived result pairs are readable in scope (.brain/archive/).

Required: root-cause note listing the EXACT diverging fields from the archived
pairs. Then: both sides canonicalize through a typed enrichment allowlist —
enrichment-class fields excluded, every other field byte-compared, an UNKNOWN
extra field still mismatches (fail-closed against tampering). Hermetic tests:
raw-vs-enriched real archived shape passes; tampered core field holds; unknown
field holds.

**Test:** `npx vitest run tests/orchestra/xverify-producer-fencing.test.ts`

**NO-GO:** dropping the byte-comparison, an allowlist carrying any
worker-authorable field, or weakening the same-provider prohibition.

## Task 6: Born 3324 — provider-limit death is its own typed class, lineage-visible

- Files: src/orchestra/spawn-backend-docker.ts, src/core/task-types.ts, src/core/task-result-schema.ts, src/orchestra/result-evaluator.ts, src/orchestra/fix-failure-classification.ts, tests/orchestra/attribution-limit-death.test.ts
- Scope: src/orchestra/spawn-backend-docker.ts, src/orchestra/, src/core/task-types.ts, src/core/task-result-schema.ts, src/core/, tests/orchestra/attribution-limit-death.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (born 3324 + sol code-truth): a provider-limit-killed zero-write worker
settles as ATTRIBUTION_DIFF_UNMEASURABLE; the reasonCode is an unrestricted
string in the task types AND every attribution HOLD is downgraded in
result-evaluator with lineage routing interpreted in fix-failure-classification
— so the classification must travel through all four layers, not only the
spawn backend (sol's under-scoping finding, now in write authority).

Required: the typed `PROVIDER_LIMIT_DEATH_ZERO_WRITE` class minted where the
reconcile observes limit-death evidence with zero writes; the reasonCode
narrows to a typed union in task-types/schema (unknown strings still parse as
legacy — additive); result-evaluator routes the new class as a clean-restart
lineage signal instead of the attribution-hold downgrade;
fix-failure-classification names it so the FIX worker is born knowing the death
class. A genuinely unmeasurable diff keeps today's hold; a MEASURED zero-write
with live provider stays the honest no-work NO_GO. Hermetic tests pin all three
classes through evaluator routing.

**Test:** `npx vitest run tests/orchestra/attribution-limit-death.test.ts`

**NO-GO:** weakening the honest-gate, promoting any unmeasured claim, or a
classification read from worker-authored fields.

## Task 7: The 523-001-fix unmeasurable-diff RCA — evidence over theory

- Files: tests/orchestra/attribution-unmeasurable-rca.test.ts
- Scope: tests/orchestra/attribution-unmeasurable-rca.test.ts, tests/orchestra/, src/orchestra/, src/core/, src/cli/commands/, .brain/archive/
- Model: claude-opus-5
- Dependencies: Task 6

Measured (sol REFUTATION of the first draft): the resume-baseline theory is
wrong — the archived result and landing proposal carry the SAME attempt id
(319be0ff…), and an old-baseline bind would have emitted
ATTRIBUTION_AUTHORITY_MISMATCH, not ATTRIBUTION_DIFF_UNMEASURABLE. The true
mechanism of "real work on disk, filesChanged:[] claim" is UNKNOWN — this task
finds it instead of guessing.

Required: read-only RCA against the archived 523 artifacts and the reconcile
code path: reproduce the DIFF_UNMEASURABLE branch conditions in a hermetic
fixture (which input state makes the diff unmeasurable while scoped files
changed on disk), record the exact predicate with file-and-line evidence in
result notes, and pin the found mechanism in a regression test. If the RCA
lands on a fixable defect, the fix is a NAMED follow-up admission — this slice
changes no production behaviour.

**Test:** `npx vitest run tests/orchestra/attribution-unmeasurable-rca.test.ts`

**NO-GO:** changing production behaviour, or an RCA that stops without
reproducing the branch in a fixture.

## Task 8: KN3 projection-parity guard — landing-proposal artifacts are not task ids

- Files: src/orchestra/sprint-spawner.ts, tests/orchestra/projection-parity-artifacts.test.ts
- Scope: src/orchestra/sprint-spawner.ts, src/orchestra/, src/core/, tests/orchestra/projection-parity-artifacts.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (sprint-523 live resume): the parity guard refused resume with "on disk
but NOT in this plan: [523-001.landing-proposal, …]" — its file classifier
derives phantom task ids from `task-<id>.landing-proposal.json` artifacts of
ALREADY-SETTLED tasks; the operator remedy (re-plan) does not fit a paused-resume
and the artifacts had to be hand-archived to proceed.

Required: root-cause the id-derivation in the guard (the diverged-projection
error path in the spawner) and classify task-artifact suffixes through the
EXISTING task-artifact-classifier authority (sprint-512's archive-authority
module — no second suffix list). Settled-task artifacts (landing-proposal,
partial-result, scope-baseline and classifier-known siblings) are never plan
members; a genuinely unknown task JSON still refuses. Hermetic tests: resume
fixture with settled-task landing-proposals passes parity; an actually-foreign
task file still refuses typed.

**Test:** `npx vitest run tests/orchestra/projection-parity-artifacts.test.ts`

**NO-GO:** a suffix list parallel to the artifact classifier, or weakening the
genuine-divergence refusal.

---

## Task 9: Fix-budget contract pin — admitted rounds are the documented truth

- Files: tests/orchestra/fix-budget-counting.test.ts
- Scope: tests/orchestra/fix-budget-counting.test.ts, tests/orchestra/, src/orchestra/, src/core/task-lineage.ts, src/core/, .brain/archive/
- Model: claude-opus-5
- Dependencies: Task 6

Measured (sol code-truth, correcting the first draft): the phase marks every
selected FIX id attempted BEFORE spawnWorkers and its own comment defines the
budget as "admitted FIX rounds" — the observed one-real-run exhaustion is the
DOCUMENTED contract (deferred admissions consume slots), not a counting bug;
depth selection lives in task-lineage (now in read scope).

Required: pin the ACTUAL contract in a hermetic test: an admitted-but-deferred
fix consumes a slot, depth selection follows task-lineage's rule, and the pause
fires when admitted rounds exhaust config. Result notes state plainly that the
owner's %-based recollection does not match any config surface and record
whether admitted-vs-executed counting deserves an owner decision row — with the
Task 6 limit-death class noted as the input that would make executed-only
counting safe. No production change.

**Test:** `npx vitest run tests/orchestra/fix-budget-counting.test.ts`

**NO-GO:** changing budget behaviour, or a pin that contradicts the in-code
documented contract without flagging it as an owner decision.

## Task 10: Init-rot — the closed fs mocks meet initializeWorkspaceArtifacts

- Files: tests/cli/commands.test.ts, tests/mcp/tools.test.ts, tests/mcp/branch-coverage.test.ts, tests/mcp/tools-enrichment.test.ts
- Scope: tests/cli/commands.test.ts, tests/cli/, tests/mcp/, src/cli/commands/, src/mcp/tools/, src/orchestra/
- Model: claude-sonnet-5
- Dependencies: none

Measured (sol root cause — commit 83a1eebd2): initializeWorkspaceArtifacts
(wired through init-steps and mcp/tools/init) calls `realpathSync.native` and
`lstatSync`; the failing suites' closed node:fs mock factories omit BOTH
exports, so init dies early and the suites fail on missing output — the exact
closed-factory rot class this campaign fixed for config mocks.

Required: the four test files' fs mock factories gain the missing exports with
behaviour consistent with each suite's existing mock style (realpathSync.native
echoing its input path, lstatSync consistent with the suite's statSync); every
listed suite returns green; NO production edit unless the RCA disproves the
mock theory — in which case the conflict goes to result notes with the smallest
production fix named, not silently applied.

**Test:** `npx vitest run tests/cli/commands.test.ts tests/mcp/tools.test.ts tests/mcp/branch-coverage.test.ts tests/mcp/tools-enrichment.test.ts`

**NO-GO:** weakening/deleting assertions, or editing production init paths on
the mock theory without disproof.

## Task 11: Determinism gate S8 residual — sidecar state genuinely differenced

- Files: src/core/skill-pool.ts, scripts/lint-skill-catalog-determinism.mjs, tests/scripts/skill-catalog-determinism.test.ts
- Scope: src/core/skill-pool.ts, src/core/, scripts/lint-skill-catalog-determinism.mjs, scripts/, tests/scripts/skill-catalog-determinism.test.ts, tests/cli/skill-surface-readmodel.test.ts, tests/cli/
- Model: claude-sonnet-5
- Dependencies: none

Measured (sol round-1 on sprint-523): the gate's two passes call the same
snapshot on the same inputs — a nondeterminism probe, not the catalog-vs-sidecar
difference §S8 demands; the current snapshot digest omits stats entirely.

Required: `snapshotSkillCatalog` gains a typed option excluding machine-local
sidecar/stats overlays (the pool already tracks statsSource per entry — the
option suppresses the sidecar layer, no second resolver) and the with-sidecar
digest incorporates the sidecar-affected fields it currently omits; the gate's
pass 1 runs catalog-only, pass 2 full-state; baseline disposition contract
unchanged; default snapshot behaviour for existing consumers unchanged (their
regression suite is in scope to prove it). Tests: a sidecar overlay changing an
entry yields stable catalog-only digest, differing full digest, declared
disposition passes.

**Test:** `npx vitest run tests/scripts/skill-catalog-determinism.test.ts tests/cli/skill-surface-readmodel.test.ts`

**NO-GO:** a second resolver, changing default snapshot output for existing
consumers, or a bare allowlist.

## Task 12: Persona declared-digest — schema field, resolver carry, production reach

- Files: src/core/agent-types.ts, src/core/agent-pool.ts, src/orchestra/result-collector.ts, tests/core/persona-integrity-detection.test.ts
- Scope: src/core/agent-types.ts, src/core/agent-pool.ts, src/core/, src/orchestra/result-collector.ts, src/orchestra/, tests/core/persona-integrity-detection.test.ts, tests/core/agent-catalog-schema.test.ts, tests/core/agent-pool.test.ts, tests/core/
- Model: claude-sonnet-5
- Dependencies: none

Measured (sol round-1 gap + code-truth corrections): the classifier supports
digest-mismatch but no manifest field declares a digest AND the production
call site (the integrity gate in result-collector) never passes digests, so the
class is unreachable; agent-pool has NO existing sha256 primitive (crypto
import is randomUUID only) — the digest primitive must be introduced, once.

Required: additive `promptSha256` manifest field in the additive-warning set
(agent-types); prompt resolution computes the actual digest with ONE new
createHash-based helper in agent-pool and carries declared+actual to consumers;
the result-collector gate passes both to the classifier so the verdict class is
production-reachable; absence never fabricates. Existing manifests load
unchanged; the existing agent-pool suite stays green UNMODIFIED (it is in scope for proof,
not for editing). Tests extend the integrity suite with declared-digest
fixtures on real tmpdir manifests.

**Test:** `npx vitest run tests/core/persona-integrity-detection.test.ts tests/core/agent-catalog-schema.test.ts tests/core/agent-pool.test.ts`

**NO-GO:** a required (non-additive) field, modifying the existing agent-pool suite, or
more than one digest helper.

## Task 13: Runs-inbox hygiene — typed supersession through the flow authority

- Files: src/cli/commands/runs.ts, src/core/run-flow-contract.ts, src/core/run-flow-store.ts, src/orchestra/run-flow-reducer.ts, src/orchestra/run-flow-coordinator.ts, src/cli/helpers/messages.ts, tests/cli/runs-inbox-hygiene.test.ts
- Scope: src/cli/commands/runs.ts, src/cli/commands/, src/core/run-flow-contract.ts, src/core/run-flow-store.ts, src/core/, src/orchestra/run-flow-reducer.ts, src/orchestra/run-flow-coordinator.ts, src/orchestra/, src/cli/helpers/, tests/cli/runs-inbox-hygiene.test.ts
- Model: claude-opus-5
- Dependencies: Task 4

Measured (2026-08-12 + sol code-truth): 7+ stale "onay bekliyor" duplicates of
superseded plan attempts pollute the inbox; the CLI is NOT the state authority
(runs delegates to orchestra services) and the durable contract only knows
cancelReason rejected|aborted with the reducer discarding reason detail — an
honest typed supersession needs contract+reducer authority (sol's wrong-layer
finding, now in write authority).

Required: the flow contract gains the additive `superseded` cancel reason with
a `supersededBy` flow reference the reducer PERSISTS; the run-flow COORDINATOR computes the superseded set using the digest the flow
record ALREADY persists (its plan/directives digest — no new digest authority):
a pending-approval flow whose persisted digest source matches a newer pending
flow is superseded, newest survives, started/terminal untouched; the CLI's
`runs --retire-superseded` consumes the service with dry-run default and `--yes`
apply, strings via getMessage (en+tr). Hermetic tests: fixture inbox retires
exactly the superseded set with persisted supersededBy; newest survives;
started flows untouched; legacy records still parse.

**Test:** `npx vitest run tests/cli/runs-inbox-hygiene.test.ts`

**NO-GO:** retiring a started/terminal flow, auto-applying without --yes,
deleting flow records, or a CLI-side state mutation bypassing the reducer.

