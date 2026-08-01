# Fable audit `105ebc67..5e26a5a7` — current-state reconciliation

**Date:** 2026-07-25
**Current source anchor:** `ff33181b5b1e415aa4cff1106f4edd48c0a14f05`
plus the attributed dirty worktree on `goal/m1-graceful-budget-landing`
**Method:** current production call graph, current MASTER evidence and a
provider-free 9-file/112-test focused matrix
**Evidence rule:** historical live evidence keeps its original tier; this report
does not upgrade a test, catalog entry, login state or past receipt into current
provider/model reachability.

## Executive disposition

The Fable audit was directionally correct and exposed real authority gaps. It is
no longer an accurate present-tense issue list. Subsequent work closed the raw
Docker-result bypass, canonical model migration, Goal-v2 approval/engine fencing,
xverify verdict fabrication, inspection/debt classification and the Ollama plus
Gemini child-secret leaks.

The remaining risk is concentrated in two dependency clusters:

1. **Cross-surface execution recovery leadership** — Docker has exact-attempt
   adoption/containment primitives and sprint boot wiring, but one-shot,
   process and other roots have no single fenced leader. This is MASTER row 623
   and the separately owner-gated M4-094 ADR-G-037 amendment.
2. **Common provider authority adoption** — the D1/D3/D4 runtime is real and is
   consumed by Goal-v2 and unattended process HOLD paths, but ordinary
   CLI/MCP/sprint/API Brain, Worker and Auditor dispatches do not all consume
   one exact candidate + route-lock + reservation + InvocationReceipt chain.
   This remains rows 595/597/607/616/617; it is not a new duplicate work item.

The system is materially safer than the audited commit range, but the
non-Desktop program is not live-proven complete.

## Critical findings

| Finding | Current verdict | Current evidence | Exact residual / dependency home |
|---|---|---|---|
| K1 — host crash leaves an orphan Docker attempt; redispatch may destroy or duplicate work | **PARTIAL · owner-gated design** | Exact task/attempt labels, first-writer settlement, foreign-attempt refusal and `DockerSpawnBackend.reconcilePendingAttempts()` exist. Sprint boot invokes reconciliation. | Cross-surface leadership exists only for sprint. M4-094 proposes attempt-scoped fenced leadership + backend-survival containment + one process service. No per-surface lock/reconciler should be added before approval. Row 623. |
| K2 — v1 autonomous/process trust raw `.result` instead of host settlement | **CLOSED on current Docker consumers** | v1 autonomous dispatcher and process runtime thread returned `settlementRef`; sprint live/resume/evaluate/retro use canonical task-result authority. Contradictory raw DONE cannot override pending/NO_GO host truth. | Legacy non-Docker paths retain raw-result compatibility because no Docker settlement exists. That is not a Docker authority bypass. Rows 604/606 and M4-093 evidence. |

## A — Provider and routing authority

| Historical finding | Current verdict | Notes |
|---|---|---|
| Sprint router silently falls back to registry-order provider | **CLOSED** | Owner-authored configured order is the fallback authority; exhausted chains fail loud and provenance is durable. |
| Auth verification exists only in Docker | **PARTIAL** | Claude non-Docker auth loss is fail-closed; Codex canonical local login probe is wired. Gemini API-key/session presence is normalized, but exact-model provider reachability remains absent. |
| Ollama child inherits every provider secret | **CLOSED** | Row 622: canonical/config-driven scrub, compiled provider-free proof. |
| Gemini child inherits every provider secret | **CLOSED in M4-095** | Row 624: config-aware scrub set, only owned `GEMINI_API_KEY`, OAuth/session keyless, compiled provider-free proof. |
| Codex/Gemini live auth/reachability absent | **PARTIAL** | Local auth truth exists; auth is not exact-model reachability. Concrete current Codex/Gemini model ALLOW producers/canaries remain absent. Row 595. |

## B — Model identity migration

**Current verdict: CLOSED for normal authored production identities.**

- Canonical API IDs are preserved through registry/config/directive/task/route
  boundaries.
- Authored `gpt-5`, `sonnet`, `opus` and `haiku` aliases fail loud; legacy
  vocabulary remains only in explicit migration/historical data boundaries.
- Unknown cloud models do not become zero-cost Ollama entries.
- Docker binary selection cannot silently substitute Claude for an unknown,
  Ollama or OpenRouter identity.

This is identity/catalog proof, not live reachability. Rows 608 and 620 retain
that distinction.

## C — Budget architecture and second authorities

| Finding | Current verdict | Notes |
|---|---|---|
| Execution-admission store has no consumer | **PARTIAL; historical zero-consumer claim closed** | A process-scoped provider authority service exists; Goal-v2 and unattended process paths consume it and HOLD honestly. CLI run/start/do/task-mode, sprint/autonomous-v1, MCP run/start and API start/RunFlow are not all adopted. Rows 616/617. |
| Worker-writable Task JSON can alter execution budget | **OPEN, folded into common admission** | Normal Docker landing compares Task identity/budget/policy to host spawn options. However `resolveTaskExecutionBudget()` still falls back to `.tasks/task-<id>.json` for direct spawn/recovery, and same-budget exhaustion blocking is fingerprint-based. A changed Task budget can therefore remain a second authority outside a host admission envelope. Row 597; do not create a duplicate row. |
| Brain role is unmetered | **PARTIAL** | Goal-v2 Brain/Auditor guard and xverify Auditor budget exist. Ordinary AI sprint planner has a receipt but no universal Brain landing-budget/provider-reservation admission before every call. Rows 597/607. |
| `reroute-or-hold` is config-only | **PARTIAL** | Strict xverify consumes the measured-backend decision. Universal Worker/Brain/Auditor reroute under one admitted candidate chain is still absent. |
| `executionCostClass` has multiple literal authorities | **CLOSED** | Current callers use `resolveProviderExecutionCostClass` with adapter declaration; the audited `provider==='ollama' ? local : remote` literals are gone. |
| Fresh install remote work HOLDs | **EXPECTED fail-closed, UX still partial** | No numeric/provider authority is invented. Public HOLD explanation/setup flow is not fully live-proven, but silent remote dispatch is not the remedy. |

## D — Settlement and crash edges

**Current verdict: PARTIAL.**

- Host settlement, closure, budget usage and containment are first-writer
  authorities.
- Exit-evidence loss now attempts containment and preserves locks/claims when it
  cannot prove closure.
- Settlement/budget persist failures no longer mint success; the Docker backend
  leaves the exact attempt registered for recovery.
- Those failures are still mainly `debugLog`-visible, and only sprint owns boot
  reconciliation. A paid completed attempt can therefore remain operationally
  stuck until a qualified recovery leader adopts it.

The remaining problem is recovery leadership/visibility, not raw-result
authority. It belongs to row 623/M4-094.

## E — Goal-v2

| Historical finding | Current verdict | Notes |
|---|---|---|
| Null provider authority causes unexplained HOLD | **PARTIAL** | Goal-v2 now consumes the process-scoped runtime and durable upstream reason codes. Without authoritative sources it still HOLDs, correctly. |
| Approval coordinator is never composed | **CLOSED** | `MissionApprovalCoordinator` is constructed at the CLI composition root and injected into scheduler/engine. M4-061 also separates mission approval from attended execution approval. |
| Two engines can race | **CLOSED for single-host process concurrency** | Durable engine lease, renewal, epoch/fence and stale-claim invalidation exist. Distributed/multi-host authority remains outside the current proof. |
| Unsupported kinds/triggers silently run | **CLOSED as fail-loud/parked** | Unsupported kinds fail before claim. Recurring/reactive definitions require occurrence authority and are parked rather than silently treated as one-off. A fully live recurring/reactive product runner is still not claimed. |
| Goal worker receipt recovery absent | **CLOSED for Goal-v2 worker** | Open dispatch scan/reconcile is composed under the current engine lease. It is not generic planner/xverify/ordinary-worker recovery. |

Goal-v2 remains `🟡` because authoritative provider/account/window producers and
current exact-model ALLOW evidence are missing, not because its scheduler still
silently ignores policy/dependencies/approval.

## F — InvocationReceipt

**Current verdict: PARTIAL.**

- Durable hash-chain/FSM, replay block, configured/requested/resolved/called
  identity and fallback evidence contracts exist.
- Production producers now include AI planning, strict xverify and Goal-v2
  worker coordination; the historical “two producers only” count is stale.
- Receipt replay/receipt failure in AI planning fails loud; it no longer becomes
  a silent structured fallback.
- Open-dispatch scan/reconciliation has one production consumer: Goal-v2 worker
  recovery. A planner/ordinary worker/xverify coordinator crash can still leave
  `dispatch_started` without a generic qualified recovery leader.

Generic receipt recovery is coupled to M4-094 execution leadership and must not
be implemented as an isolated receipt-finalizer that guesses backend outcome.

## G — Prompt and inspection

| Finding | Current verdict | Notes |
|---|---|---|
| Debt-injection directory fallback becomes inspection-only and never writes | **CLOSED** | Debt injection preserves explicit writable intent; targeted regression is green. |
| Two inspection classifiers disagree | **CLOSED for current compiler path** | Current prompt compiler uses one sanitized authority and fail-closed read-only classification. |
| xverify can recover echoed template verdict as success | **CLOSED** | Final-line terminal parser and criteria-only finite protocol reject wrapper/template fabrication. |
| Exact read authority is only prompt/tool advisory | **OPEN residual** | Read lists and Docker Write/Edit grants are narrowed, but Bash/tool-level exact path confinement is not a complete mechanical sandbox. Row 611 already tracks it. |

## H — Governance and evidence portability

**Current verdict: PARTIAL, improved.**

- ADR-G-037 now records execution landing/continuation/metering authority.
- Provider authority D1/D3/D4 and attended approval decisions have explicit
  decision packets and MASTER dependency homes.
- Current changes update MASTER with delivery/evidence tiers instead of claiming
  test success as live provider success.
- Much live proof still lives in ignored `.tasks` and `.analysis/xverify`
  artefacts. Fresh-clone reproducibility/evidence packaging remains incomplete.
  Repository cleanup and deletion remain owner-controlled and are not performed
  by this slice.

## Token and cache economics

The audit's cost conclusion remains valid:

- Sprint-455's 5M cache-read ceiling would have stopped the 29.6M replay around
  call 32, avoiding roughly 82.4% of later cache reads. It cannot recover tokens
  already spent on a failed worker.
- Graceful landing now has reserve allocation, repeated-read evidence,
  checkpoint-stop and bounded continuation. Live canaries proved containment and
  prevention of a second under-reserved call; they did not prove a successful
  graceful deliverable.
- Inspection prompts and finite verifier profiles materially reduce cache load,
  but a provider call is still costly; tests/build are regression signals, not a
  substitute for bounded live task success.
- Immutable observation deltas replaced the historical full
  `seenDedupeKeys` rewrite path; the old O(n²) persistence statement is stale.

## Dependency-ordered remaining work

1. **Owner decision:** approve or reject M4-094 A–D exactly as written in
   `cross-surface-execution-recovery-leadership-decision-2026-07-25.md`.
2. **Already owner-approved D1/D3/D4 adoption:** extend the one provider
   authority runtime to one bounded surface pair at a time, beginning with
   CLI run + MCP run parity, then task-mode/sprint, then API/RunFlow. Every
   unsupported source must HOLD before provider/bootstrap/task mutation.
3. **Budget authority closure:** remove worker-writable Task JSON as an
   independent direct-spawn/recovery budget authority; require an immutable
   host admission reference or an explicit legacy HOLD/migration.
4. **Role parity:** ordinary Brain, Worker and Auditor calls each declare,
   dispatch and terminally settle one canonical receipt under the admitted
   candidate/reservation.
5. **Provider sources and live proof:** concrete Codex/Gemini/OpenRouter
   account/limit/reachability and non-host termination adapters; then one
   separately approved paid canary. Catalog/login/key presence never suffices.
6. **Evidence portability and release readiness:** after code/authority
   closure, package bounded reproducible proofs. Commit/push, default flips,
   publish/tag and repository cleanup stay separately gated.

## Verification performed in this reconciliation

```text
9 test files passed
112 tests passed
provider/network/Docker calls: 0
```

The matrix covered InvocationReceipt store/planner, provider runtime,
termination ledger, runtime budget monitor, debt injection, Goal-v2 approval,
engine wiring and provider runtime bootstrap.

The latest recorded terminal full-suite evidence remains M2-018. This report
does not claim a new whole-suite run after M4-095.
