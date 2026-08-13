# DIRECTIVES — Sprint-XV1: Fable→Sol xverify closure — the §12.2 Plan-v3 execution wave

## Goal

Close the single committed outcome: a Fable-produced claim genuinely, independently
verified by gpt-5.6-sol through the production chain. Authority: transition brief
§12.2 `[PLAN-V3:FABLE-SOL-XVERIFY]` (branch agent/closure-os-plan-v3, HEAD
acb082b38, brief sha256 ea07a8c7…). This wave supersedes Sprint-B15 DIRECTIVES
entirely. Two mandatory parts close together: (1) gpt-5.6-sol → premium_plus in
the canonical registry with pricing alignment and a non-vacuous invariant, and
(2) the codex reachability evidence chain wired end-to-end — approval-gated,
budget-projected, freshness-safe, canonical-Docker-transported — so the
production candidate gate stops emitting xverify_candidate_evidence_unavailable.
Owner decisions bound into this wave: K5 done (branch+commit exist; public push
awaits separate owner approval), K6 local-terminal live-auth adapter behind the
existing LiveApprovalAuthenticator boundary, K7 owner-authored probe ceilings
live in the execution_budget purpose profile (config, never code literals), no
separate ProbeApprovalAuthority, no repo-wide ExecutionBudget migration (typed
ReachabilityProbeBudget projection instead), singleflight identity =
scopeDigest + freshnessEpoch, docker probe inherits the exact provider
dispatch's effective network behaviour. Balanced-mode config is out of this wave
(MODEL-ACTIVATION-001 disposition).

Dependency chains: 1→{4,5,6}→7→8→9 (contract freeze → seam trio → docker probe
adapter → pre-compose wiring → progression+remedies) and 2→3 (tier flip →
machine-manifest expectation updates, parallel to the main chain). The terminal
proof (T5) is a HOST phase after settlement, never a worker task.

Provider, model, effort and effective concurrency are resolved from effective
config, registry, role policy, auth/reachability evidence, usage/limit authority
and host admission. No task pins a model or provider here.

Workers may READ any path named in their Scope, including src/ directories
listed purely for context; reading beyond Scope is not required by any task.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test
  passing today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass;
  report the conflict in result notes instead.
- Read the existing mechanism before designing; every code task EXTENDS
  something present. A second parallel mechanism (second approval protocol,
  second budget authority, second model-info source) is a NO-GO.
- Fail closed on ambiguity; nothing may make a destructive action easier to
  trigger. Missing authority is a typed resumable HOLD, never a fabricated ref.
- Single-writer: no file appears in two tasks that can run concurrently; where
  two tasks touch the same file (xverify command) they are dependency-ordered.
  If the machine scan in Task 3 matches a file owned by Tasks 1 or 4–9, report
  it in result notes for the owning task; do not edit it.
- Workers must not run `npm run build`, full `npm test`, provider login/auth
  mutation, sprint lifecycle commands, git commit, npm publish, or cleanup.
  Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent`
  writes, async spawn only (ADR-D-002), no real docker daemon. No live provider
  calls from any task — the ONE exception is the declared HOST terminal-proof
  phase below, which the HOST runs post-settlement, not a worker.
- New user-facing text goes through the i18n message authority (`getMessage`,
  en+tr). Mechanism modules stay string-free; labels are injected by callers.
- Zero hardcode (ADR-G-036): no model name, no tier literal on a routing code
  path, no probe-ceiling number in src/**. Owner K7 values live only in the
  owner-authored execution_budget config profile; tests use tmpdir fixture
  configs.
- Result-notes-first: findings go to `.result` notes; no standalone documents.

## HOST phases (declared, not worker tasks)

- After Task 3 settles: HOST runs the broad model/routing/provider/xverify
  regression gate (the machine-generated impacted manifest is ground truth; the
  scoped suites of Tasks 2/3 are necessary but not sufficient).
- T5 terminal proof, only after this sprint reaches terminal settlement and
  only with no active sprint: owner-coordinated config enablement (approval
  authority + local-terminal channel; execution_budget reachability-probe
  purpose profile with owner K7 values: 32768 input / 512 output / 33280 total
  tokens / 60s timeout; metered-API usd ceiling 0.20 only if billing context is
  metered) → `npm run build` → real-binary Fable→Sol xverify with explicit
  `--author-model claude-fable-5` → provider dispatch + terminal verdict +
  invocation/usage + settlement receipt chain reported losslessly. A typed HOLD
  is honest but is NOT closure: the outer package stays OPEN with the exact
  missing authority named.

---

## Task 1: Probe contract freeze — typed provider-evidence-probe contracts

- Effort: normal
- Files: src/core/provider-evidence-probe-contract.ts, tests/core/provider-evidence-probe-contract.test.ts
- Scope: src/core/provider-evidence-probe-contract.ts, src/core/, tests/core/provider-evidence-probe-contract.test.ts
- Dependencies: none

### Description

Measured: the four §12.2 contract clauses (approval subject, budget projection,
freshness identity, transport seam) have no compilable home; Tasks 4–8 would
otherwise each invent local shapes.

Required: one new contract module freezing the typed surface, implementation-free
(types, branded ids, discriminators, total type guards; zero IO, zero behaviour):
(a) `ReachabilityProbeBudget` — a billing-mode discriminated PROJECTION derived
from the canonical `ExecutionBudget` (import its type from work-model; do NOT
migrate or redeclare it): the subscription/free/local arm carries token ceilings
(input/output/total) plus a timeout and has NO usd field at the type level; the
metered-api arm additionally requires an owner-authored usd ceiling.
(b) `ProbeInvocationIdentity` — `{ scopeDigest, freshnessEpoch }` with epoch
semantics documented: deterministic per evidence-supersession boundary, never
random per contender.
(c) `ProviderEvidenceProbeSubject` — the typed operation-subject payload for the
`provider-evidence-probe` approval subject kind (tenant, project, provider,
model, backend scope, executionProfileRef, budget projection, TTL window).
(d) `BoundedReachabilityProbeTransport` — the provider-neutral seam interface:
scalar bounded request in (provider, model, executionProfileRef, prompt bytes,
timeout/output ceilings), frozen provider-native observation union out; the
observation can never assert reachable/liveProven — promotion belongs to
canonical core.

**Kanit:** `npx tsc --noEmit` clean; grep shows no ExecutionBudget redeclaration

**Test:** hermetic guard/discriminator tests — exhaustive arm coverage, negative
guards (usd on the subscription arm rejected at guard level), frozen-union
exhaustiveness; no IO.

**NO-GO:** any runtime IO or provider call; a second ExecutionBudget declaration
or repo-wide migration; a usd field reachable in the subscription arm; a
transport shape exposing raw argv, image names, mounts, or env.

---

## Task 2: Tier flip — sol premium_plus + explicit preferreds + pricing + invariant

- Effort: normal
- Files: src/core/model-registry.ts, src/core/model-registry-types.ts, src/core/pricing-data-baseline.json, .deckent/cost-config.json, tests/core/model-registry-pricing-invariant.test.ts
- Scope: src/core/, .deckent/cost-config.json, tests/core/model-registry-pricing-invariant.test.ts
- Dependencies: none

### Description

Measured: gpt-5.6-sol is registered tier premium with preferredForTier
(model-registry.ts:358-372); gpt-5.5 (:250) has no preferred flag; the pricing
baseline rows for the gpt-5.6 alias and gpt-5.6-sol carry deckent_tier premium;
the production candidate gate held with
`xverify_verifier_tier_below_author: gpt-5.6-sol(premium) < claude-fable-5(premium_plus)`.

Required: gpt-5.6-sol tier → premium_plus with explicit preferredForTier for
codex premium_plus; gpt-5.5 gains explicit preferredForTier for codex premium;
the sole-preference invariant (exactly one preferred per provider+tier) holds;
the pricing rows for BOTH the gpt-5.6 alias and gpt-5.6-sol align deckent_tier
to premium_plus, and the project cost-config row aligns identically; the
model-registry-types tier documentation stays truthful. Add NOTHING to
CONFIG_MIGRATION_TIER_OVERRIDES. New invariant test: every registry model with a
pricing row agrees on tier between registry, pricing baseline and cost-config;
the test asserts a minimum matched-row count so it can never go vacuous-green,
and fails if either side flips alone.

**Kanit:** `grep -n "premium_plus" src/core/model-registry.ts src/core/pricing-data-baseline.json` → sol + alias rows aligned

**Test:** `npx vitest run tests/core/model-registry-pricing-invariant.test.ts` —
invariant + sole-preference + getByProviderAndTier codex/premium resolves
gpt-5.5 and codex/premium_plus resolves gpt-5.6-sol.

**NO-GO:** a sol entry in CONFIG_MIGRATION_TIER_OVERRIDES; a second model-info
source; touching existing test files (Task 3 owns them); weakening the
sole-preference invariant; any model-name literal added to a routing code path.

---

## Task 3: Machine-generated impacted manifest + tier expectation updates

- Effort: high
- Files: tests/core/model-identity.test.ts, tests/core/gpt55-catalog.test.ts, tests/core/model-registry.test.ts, tests/core/model-equivalence.test.ts, tests/core/role-invocation-resolver.test.ts, tests/core/provider-fallback.test.ts, tests/core/host-role-invocation-admission-runtime.test.ts, tests/core/provider-limit-admission.test.ts, tests/cli/xverify-tier-floor.test.ts, tests/cli/xverify-authority-unlock.test.ts, tests/providers/codex.test.ts, tests/providers/codex-integration.test.ts, tests/orchestra/codex-spawn-readiness.test.ts, tests/orchestra/model-selector-provider.test.ts, tests/orchestra/as2-p3-failover.test.ts, tests/orchestra/planner.test.ts, tests/orchestra/run-proposal-planner.test.ts, tests/orchestra/cross-verify-config-verifier-model.test.ts, tests/orchestra/cross-verify-wire.test.ts, tests/orchestra/sprint-estimator.test.ts, tests/e2e/provider-smoke.test.ts, tests/orchestra/autonomous/mission-store/mission-worker-invocation-coordinator.test.ts
- Scope: tests/
- Dependencies: Task 2

### Description

Measured: at least 20 test files assert gpt-5.6-sol's tier, the codex premium
slot, or tier-ordering behaviour that the Task 2 flip changes (known anchors:
the gpt55-catalog alias row including its pricing-alias assertion, the
cross-verify-wire verifierModel pin, the sprint-estimator tier-order constant,
fixture+assertion pairs in provider-limit-admission and
mission-worker-invocation-coordinator). Per §12.2 clause 5 the impact-file
count is NOT fixed in text — the machine-generated manifest is ground truth.

Required: first machine-generate the impacted manifest (repo-wide scan of
tests/** for gpt-5.6-sol, the codex premium/premium_plus slot, tier-order and
preferred-slot expectations); record the full manifest with per-file match
reasons in result notes. Then update every impacted expectation to the new tier
truth: sol premium_plus, the codex premium slot resolves to gpt-5.5, downward
equivalence and tier-floor semantics follow. Fixture files may be updated where
they encode the old tier. If the scan matches a file owned by another task in
this wave, report it in result notes instead of editing it.

**Kanit:** result notes carry the complete manifest; `git diff --stat` touches only tests/

**Test:** scoped vitest run of every updated file, all green.

**NO-GO:** deleting or hollowing an assertion to force green; editing src/**;
editing another task's owned files; leaving a scanned match silently unhandled.

---

## Task 4: Approval operation-subject + local-terminal live-auth adapter

- Effort: high
- Files: src/core/approval-decision-ingress.ts, src/core/attended-execution-approval.ts, src/core/approval-terminal-authenticator.ts, src/core/approval-authority-runtime.ts, tests/core/approval-probe-subject.test.ts, tests/core/approval-terminal-authenticator.test.ts
- Scope: src/core/, tests/core/
- Dependencies: Task 1

### Description

Measured: the only production live re-auth adapter is OIDC
(OidcLiveApprovalAuthenticator, approval-oidc-authenticator.ts:158, wired at
approval-authority-runtime.ts:171); LiveApprovalAuthenticator is the boundary
interface (approval-decision-ingress.ts); claim exists only in
AttendedExecutionApprovalAuthority welded to run/task/attempt/proposal
expected-dispatch bindings (attended-execution-approval.ts:606-766) — a probe
request is structurally unclaimable today; terminal REPL decisions carry no
authorization envelope and fail validate; decisions without a MAC-bound
ApprovalDecisionAuthorization are DECISION_UNTRUSTED (:653-659).

Required: extend the EXISTING approval authority with typed operation-subject
support and register `provider-evidence-probe` (the Task 1 subject payload) as
a narrow subject kind — the existing request → decision → verify/claim chain
gains a subject-bound claim path reusing the same single-use file-CAS latch
pattern and host-global claim store; NO separate ProbeApprovalAuthority, NO
second decision/claim protocol. Implement the local-terminal live re-auth
adapter as a new LiveApprovalAuthenticator implementation behind the same
boundary — the OIDC adapter stays unchanged; the boundary stays
connector-bindable (design for it, do not implement connector auth). A decision
minted through the local-terminal adapter carries a real authorization envelope
(authenticatedAt/authExpiresAt) and passes the existing validate; a decision
without live re-auth still fails closed exactly as today. The claim adapter
derives the producer approval evidence: evidenceRef `approval:<requestId>`,
grantedAt = decidedAt, expiresAt = min(requestExpiry, authExpiresAt).

**Kanit:** `grep -n "provider-evidence-probe" src/core/approval-decision-ingress.ts src/core/attended-execution-approval.ts` → subject kind present at both chain ends

**Test:** hermetic (tmpdir stores): full request→decision→verify/claim
progression for the probe subject; re-auth expiry → claim refused; decision
without authorization → DECISION_UNTRUSTED unchanged; double-claim → single-use
latch refuses; OIDC path regression untouched.

**NO-GO:** a new parallel approval authority or protocol; CLI invocation counted
as approval (self-approval); a force/bypass flag; weakening the
missing-authorization/DECISION_UNTRUSTED fail-closed behaviour; an incompatible
change to the approval broker's cross-process store format.

---

## Task 5: ReachabilityProbeBudget projection + execution_budget purpose profile

- Effort: high
- Files: src/core/execution-budget-policy.ts, src/core/execution-budget-derivation.ts, src/core/execution-admission.ts, src/core/provider-truth.ts, tests/core/reachability-probe-budget.test.ts
- Scope: src/core/, tests/core/
- Dependencies: Task 1

### Description

Measured: the evidence producer demands a positive budget including usd while
execution-admission forbids maxUsd on an allow decision (:260-265) — a live
contradiction; the canonical ExecutionBudget persisted contract must NOT be
migrated (owner decision); the execution_budget owner-authored config authority
already exists (config execution_budget block; execution-budget-policy.ts).

Required: implement the derivation producing the Task 1 ReachabilityProbeBudget
projection from canonical ExecutionBudget + resolved billing context + a new
`reachability-probe` purpose profile resolved from the SAME owner-authored
execution_budget authority (no second budget authority, no hardcoded ceilings —
values come from config; tests use tmpdir fixture configs). Subscription/free/
local billing: token+timeout ceilings only, usd typed-absent — no usd authority
is minted. Metered API billing: the owner-authored usd ceiling is additionally
required; absent → typed unavailable/HOLD, never derived from maxTokens and
never invented. Reconcile the admission contradiction with typed rules so a
probe budget admission cannot simultaneously require and forbid usd; the
positive-budget validation in provider-truth becomes projection-aware. The
producer file itself belongs to Task 6; expose the projection/validation so
Task 6 consumes it.

**Kanit:** `grep -n "reachability-probe" src/core/execution-budget-policy.ts` → purpose profile resolved from config, no numeric ceiling literal beside it in src/

**Test:** hermetic: all three billing arms; absent profile → typed unavailable;
the subscription arm can never emit usd; the metered arm without an owner usd →
typed HOLD; admission accepts the projection without the old contradiction.

**NO-GO:** a discriminated-union migration of the persisted ExecutionBudget;
probe-ceiling numbers in src/**; a second budget authority; silently defaulting
usd; weakening existing admission fail-closed rules.

---

## Task 6: Producer freshness epoch + durable singleflight + typed cooldown

- Effort: high
- Files: src/core/provider-evidence-producer.ts, src/core/invocation-receipt.ts, tests/core/provider-evidence-producer-freshness.test.ts
- Scope: src/core/, tests/core/
- Dependencies: Task 1

### Description

Measured: invocationId hashes tenant+project+idempotencyKey
(provider-evidence-producer.ts:806-812) with attempt hardcoded to 1; a
stable-forever key hits the UNIQUE(tenant,project,idempotency_key) constraint →
IDEMPOTENCY_CONFLICT (provider-truth-store.ts:592-594) and collides receipt
eventIds; getLatestReachability orders by completed_at DESC, inserted_seq DESC
and ignores idempotency_key (:640-668) — varying keys never break latest-scope
lookup; the receipt ledger declaration is first-writer-wins.

Required: (a) freshness gate — before any probe, re-read exact-scope latest
evidence; known-and-reachable fresh evidence is reused and no probe runs.
(b) On stale/absent, mint the SHARED ProbeInvocationIdentity
(scopeDigest + freshnessEpoch): the epoch derives deterministically from the
superseded evidence boundary (prior row expiry/sequence), NEVER randomly per
contender — the same epoch for all same-scope contenders. The epoch enters the
invocationId, the receipt eventIds and the reachability idempotency key, so
each epoch inserts cleanly and immutably; no existing receipt or truth row is
ever rewritten. (c) Same-epoch concurrent processes collide on the receipt
declaration; the first writer probes, followers bounded-wait and re-read
exact-scope evidence instead of surfacing a replay error. (d) Negative evidence
holds a TTL/cooldown: no new epoch until expiry — the attempt returns a typed
cooldown result carrying the evidence ref; after expiry a new immutable epoch
opens. (e) Bounded retry/backoff with typed deferral evidence; no unbounded
wait loops.

**Kanit:** `grep -n "freshnessEpoch" src/core/provider-evidence-producer.ts` → identity minted once per scope+epoch; no random entropy in the identity

**Test:** hermetic (tmpdir SQLite): fresh-evidence short-circuit; two same-epoch
contenders → exactly one probe, the follower reuses the winner's row; cooldown
blocks a premature epoch and types the refusal; epoch rollover inserts without
IDEMPOTENCY_CONFLICT; deterministic epoch derivation (same inputs → same
identity).

**NO-GO:** stable-forever digest keys; per-contender random attemptRevision;
rewriting or deleting existing truth/receipt rows; surfacing replay-blocked to
the operator on a follower path; busy-wait without bound.

---

## Task 7: Canonical DockerSpawnBackend bounded probe adapter

- Effort: high
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/spawn-backend-docker-probe.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/spawn-backend-docker-probe.test.ts
- Dependencies: Task 4, Task 5, Task 6

### Description

Measured: inspectExactCrossVerifyRuntime (spawn-backend-docker.ts:4295-4402) is
the narrow-public-method precedent — scalars in, frozen union out, digest-pinned
imageId + runtimeFingerprint + executionProfileRef; the raw bounded runner
(:3980) is unfit for a provider probe (stdin ignored, no credentials, no HOME,
15s/64KiB, no containment); the canonical credential chain is
prepareProviderAuthBroker → buildProviderAuthIsolation (codex auth.json broker
copy into a tmpfs HOME, CODEX_HOME never set in-container); the offline
identity inspect uses network-none isolation (:4339-4353) which must NOT leak
into a provider probe; typed docker-unavailable classifiers E085/E086/E087
exist (:2641-2702).

Required: implement the Task 1 BoundedReachabilityProbeTransport as ONE narrow
public method on DockerSpawnBackend, provider-neutral (driven by the canonical
provider command spec; works for any provider with a command spec + credential
contract): digest-pinned image identity + runtimeFingerprint +
executionProfileRef from the existing inspect authority; credential mount/env
scrub via the canonical auth broker builders; the prompt fed per the provider
spec (stdin/file) from bounded prompt bytes; timeout/output ceilings taken from
the ReachabilityProbeBudget projection (no literal bounds in code); network
behaviour INHERITED from the exact provider dispatch's effective backend
behaviour — the identity inspect's network-none is not carried over and no
blanket unrestricted constant is invented; termination/containment builders
reused. Output is the sanitized frozen observation union only — no argv, image
string, mount path, env, prompt or raw output leakage. Docker daemon dead or
absent → typed backend-unreachable via the existing classifiers; unsupported
platform/backend → honest typed unsupported. The four-platform adapter matrix
(macOS/Linux/Windows-native/WSL) is defined in the design and covered
hermetically with an injected runner — no real docker in tests.

**Kanit:** probe-path diff shows no new network-none flag and no new unrestricted network constant

**Test:** hermetic injected-runner: success observation; daemon-dead →
backend-unreachable; timeout/output-ceiling enforcement; credential-absent →
typed unavailable (not unreachable); platform matrix; leak assertions (no
argv/env/prompt in the observation).

**NO-GO:** any raw docker-run/argv path a caller can shape; carrying
network-none isolation to the provider probe; inventing a network-policy
constant; literal timeout/size bounds; real docker or network in tests; a
second transport seam outside the backend.

---

## Task 8: Pre-compose evidence preparation + codex docker source + registry wiring

- Effort: high
- Files: src/orchestra/cross-verify-evidence-preparation.ts, src/cli/commands/xverify.ts, src/providers/codex-provider-evidence-sources.ts, src/providers/provider-authority-runtime-bootstrap.ts, tests/cli/xverify-evidence-preparation.test.ts, tests/providers/codex-provider-evidence-sources.test.ts
- Scope: src/orchestra/, src/cli/, src/providers/, src/core/, tests/cli/xverify-evidence-preparation.test.ts, tests/providers/codex-provider-evidence-sources.test.ts
- Dependencies: Task 7

### Description

Measured: ProviderEvidenceProducer.refresh() has ZERO production callers — the
root cause; the truth/limit stores stay empty and the composition holds at
xverify_candidate_evidence_unavailable
(host-role-invocation-admission-runtime.ts:233-241). compose() reads only
existing immutable authority
(cross-verify-production-ingress-authority.ts:536-540) — the probe must run
BEFORE compose, at the xverify pre-compose seam (xverify.ts:556-557). The codex
docker reachability slot is a shared always-unsupported stub instance
registered for both backends (codex-provider-evidence-sources.ts:643-665,
:685-707).

Required: (a) a new pre-compose preparation orchestrator
(cross-verify-evidence-preparation.ts): resolve the exact candidate scope
(docker executionProfileRef/fingerprint via the Task 7 identity), run the
Task 6 freshness gate, drive the Task 4 approval subject
request→decision→claim, derive the Task 5 budget projection, and invoke
ProviderEvidenceProducer.refresh() with the Task 7 transport; every missing
authority (approval undecided, budget profile absent, backend unreachable) is a
typed resumable HOLD naming the exact authority — no fabricated refs, no
fallback. (b) Split the shared codex stub: the docker slot gets a real
CodexDockerReachabilityEvidenceSource consuming the Task 7 transport via
injection; the host-subprocess slot keeps the honest typed-unsupported stub;
the source emits provider-native observations only — reachable/liveProven
promotion stays in canonical core. (c) The bootstrap registers the new source
beside the existing codex set. (d) The xverify command calls preparation before
compose; compose semantics untouched (helper lift only if unavoidable). The
same-provider prohibition stays intact end-to-end.

**Kanit:** grep shows a production caller chain from the xverify CLI entrypoint into refresh()

**Test:** hermetic composition progression: stores absent → preparation
(injected transport, fixture approval/budget) → refresh writes rows → the
candidate gate passes beyond candidate_evidence_unavailable to the NEXT gate;
each missing-authority arm → its exact typed HOLD; docker-slot source
observation → core promotion on succeeded+identity match; the host-subprocess
slot still honestly unsupported.

**NO-GO:** probing inside compose(); same-provider fallback; fabricated
approval/budget/evidence refs; network or real docker in tests; weakening the
candidate-eligibility predicate; a mock-only wire with no production entrypoint
chain.

---

## Task 9: Composition progression matrix + replay/expiry/concurrency + en/tr remedies

- Effort: normal
- Files: src/cli/helpers/messages.ts, src/cli/commands/xverify.ts, tests/cli/xverify-remedies.test.ts, tests/orchestra/cross-verify-progression.test.ts
- Scope: src/cli/, tests/cli/xverify-remedies.test.ts, tests/orchestra/cross-verify-progression.test.ts
- Dependencies: Task 8

### Description

Measured: xverify holds render raw reason codes without operator remedy text;
the approval/preparation surfaces added in Tasks 4/8 introduce new user-visible
states with no i18n keys yet.

Required: (a) an end-to-end hermetic progression matrix over the full
preparation+composition chain: absent stores / unsupported backend / fresh
evidence reuse / stale evidence to new epoch / negative-cooldown refusal /
expiry rollover / two concurrent contenders (singleflight) /
approval-undecided HOLD / budget-absent HOLD — each asserting the exact typed
state transition, not the mere absence of a throw. (b) The operator remedy
surface: every typed HOLD reason on the xverify path renders a getMessage
remedy naming the exact missing authority and the unblocking action, en+tr
both; approval-flow user-visible strings from the Task 4 surfaces get their
keys here; mechanism modules stay string-free.

**Kanit:** en and tr key counts for the new remedy keys are equal (paired)

**Test:** `npx vitest run tests/cli/xverify-remedies.test.ts tests/orchestra/cross-verify-progression.test.ts` — matrix complete, en/tr parity asserted.

**NO-GO:** hardcoded user-facing strings; en without tr; vacuous progression
assertions; presenting a HOLD remedy as success; editing files owned by Task 8
beyond the remedy-render seam in the xverify command.
