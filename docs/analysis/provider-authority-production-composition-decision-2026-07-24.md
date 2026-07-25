# Provider authority production composition — decision packet

**Date:** 2026-07-24
**Altitude:** design
**Scope:** non-Desktop control plane; Brain, Worker, Auditor; CLI, MCP, API,
process and autonomous composition roots
**Governing owner decision:** `user-1784778390241 — Provider Authority Key
Custody, Rotation & Composition` (accepted, 2026-07-23)

## Outcome

The integrity, receipt, provider-truth, provider-limit, source-selection and
role-admission components are code-present. They are not a production authority:
the source bundle and composition root have no production inbound edge, the
production Goal-v2 path constructs null authorities, provider-limit policy has no
production resolver, and no production termination-evidence verifier settles
provider reservations.

The existing owner decision already settles key custody: host-global, versioned,
open-only at runtime, no implicit provisioning, exact key IDs, explicit migration
and fail-closed HOLD. A new custody ADR is not required. Two narrower decisions
remain owner-gated:

1. the authoritative scope and precedence of provider-limit policy; and
2. the cross-backend termination evidence accepted when unused provider capacity
   is released.

Until these are decided and wired, remote unattended dispatch must remain HOLD.
This does not require every attended task to be unusable: the already-approved M1
contract permits an explicit owner-approved, visible-risk, hard-only attended
path, but that path must record provider limits as advisory/unknown rather than
manufacturing `known/ALLOW`.

## Negative space

- No key creation, rotation, import, migration or custody mutation.
- No default policy flip and no numerical provider-limit defaults.
- No production inference/reachability call and no Fable/Sol/OpenRouter
  reachability claim. One finite Fable design verifier is allowed and remains
  advisory.
- No projection of host Claude evidence onto Docker, tmux, API or hybrid scopes.
- No treatment of `/usage`, catalog presence, key presence or login state as
  exact-model reachability.
- No reuse of task execution ceilings as provider account quota truth.
- No Desktop implementation, publish, tag, migration, commit or push.

A concrete violation would be to wire the Claude host source bundle to autonomous
startup, interpret its displayed percentages as authoritative capacity, and let a
Docker worker run under that host evidence.

## Current ground truth

| Layer | Current truth | Evidence status |
|---|---|---|
| Key custody | `ProviderAuthorityKeyring` supports immutable revision chains, active + retired keys, domain-separated signing and account pseudonymization. `composeProviderAuthority` only opens an existing host-global keyring. | code-present; production provisioning and a ready composition not live-proven |
| Project identity | `InvocationReceiptStore` binds the canonical real project root to one durable `projectId`; composition rejects a mismatched ledger. | code-present; SQLite behavior previously compiled-proven, not a provider ALLOW proof |
| Source selection | `ProviderEvidenceSourceRegistry` resolves exactly by provider + auth mode + transport + execution backend, independent of registration/catalog order. | code-present; production zero-inbound |
| Claude account | Host `claude auth status --json` producer accepts only first-party `claude.ai` auth with a provider organization subject; raw subject is host-memory-only. | code-present; current local auth is ready, but production composition remains unwired |
| Claude reachability | Bounded host-subprocess source requires exact called provider/model from provider-native JSONL and rejects requested-model echo. | code-present; no current exact-model probe was run in this slice |
| Claude limits | `/usage` percentages are projected with an advisory source. Reset display text is hashed and not upgraded to a known reset instant. | current compiled CLI displayed 2% session, 43% weekly, 78% Fable; advisory only |
| Limit ledger | Global account/tenant-scoped snapshots and reservation lifecycle are HMAC protected and fail closed on unknown/stale/unavailable evidence. | code-present; no production policy or termination verifier |
| Task execution budget | `execution_budget.roles.<brain|worker|auditor>` limits per-call resource use and unmetered backend routing. | config-wired for task ceilings; it is not provider account quota policy |
| Role admission | `HostRoleInvocationAdmissionRuntime` and Mission Worker coordinator require exact route, reservation, receipt, fence and settlement evidence. | code-present; production Goal-v2 constructs both with `null` |
| Production graph | Claude source bundle and provider composition root have no production inbound import. | current static graph and orphan ratchet prove unwired state |

## Brain / Worker / Auditor parity audit

The common `resolveRoleInvocation` contract is pure and explicitly states that
consumer wiring is a separate follow-up. A role name appearing in that contract
does not prove that the role's production call passed through it.

| Role/path | Execution budget | Provider admission and fallback | InvocationReceipt | Terminal authority | Current verdict |
|---|---|---|---|---|---|
| Brain — AI sprint planner | The planner subprocess has timeout handling, but no `resolveExecutionBudgetPolicy(... role: 'brain')` or measured landing budget before dispatch. | Provider selection occurs before `beginPlannerReceipt`; `PlannerReceiptContext.resolution` is optional. Without an admitted resolution the receipt records router facts and `unknown` reachability/limits. | `beginPlannerReceipt` is wired and prevents duplicate dispatch for this planner call. | Planner transport and consumer events settle the receipt, but they do not settle a provider-limit reservation because no host role admission occurred. | Receipt-wired only; unified budget/admission/fallback is incomplete. |
| Worker — sprint/task/MCP one-shot | `applyWorkerExecutionBudgetPolicy`, runtime monitor, landing reserve, bounded continuation and Docker settlement are wired on the reviewed paths. | Sprint routing now uses configured provider order, but it is not the evidence-backed `HostRoleInvocationAdmissionRuntime`; task execution can therefore have routing provenance without authoritative reachability/limit admission. | The normal sprint/task/MCP Docker paths carry `TaskResultSettlementRef`, not a canonical worker `InvocationReceiptRef`. The Mission Worker coordinator can bind both, but production Goal-v2 constructs it with `null`. | Host `TaskResultSettlement` is strong for Docker task outcome/usage. D3 is still required before that evidence can release a cross-backend provider reservation. | Execution-budget and Docker-settlement wired; provider authority and common receipt incomplete. |
| Auditor — xverify verifier | `runCrossVerify` resolves `execution_budget.roles.auditor`, enforces landing-turn reserve and requires/reroutes to measured Docker for host-CLI providers. | Verifier provider/model selection is performed by the cross-verify decision/model resolver. It does not call the common evidence-backed role admission runtime, and no admitted fallback chain is bound. | No verifier `InvocationReceipt` is declared. The execution produces task settlement and xverify advisory evidence only. | Docker settlement protects the verifier task, but there is no provider reservation to settle and no D3 cross-backend termination record. | Budget-wired for xverify only; common admission/receipt/fallback incomplete. |
| Goal-v2 worker | The mission coordinator contract can carry execution budget and host authority. | `HostRoleInvocationAdmissionRuntime` and `MissionWorkerInvocationCoordinator` support evidence-backed admission, claims and recovery. | Coordinator can declare and recover worker receipts. | Coordinator can join reservation/receipt/settlement evidence. | Production composition passes `null` to both constructors, so every authority-required call honestly HOLDs. |

### Consequence

No Brain/Worker/Auditor row is end-to-end `wired + enabled + live-proven`.
M1's unified-role requirement therefore remains open even though individual
worker budget and Docker settlement slices are live-proven. The smallest safe
integration order is:

1. owner decides D1 provider-limit policy scope/precedence;
2. compose the host-global authority once and inject it into Brain, Worker and
   Auditor roots without changing their role-specific execution ceilings;
3. declare one canonical InvocationReceipt before every provider dispatch and
   bind configured/requested/resolved/called identity plus fallback reason;
4. owner decides D3, then adapters join terminal execution evidence to the exact
   provider reservation before unused capacity can be released;
5. prove each role independently, then prove a mixed-role fallback chain. A
   worker-only canary cannot establish Brain/Auditor parity.

## Why the two budget policies must stay separate

`execution_budget` answers: “How much may this Brain/Worker/Auditor call consume?”
It is scoped by role and task kind and may be narrowed by the request.

Provider-limit policy answers: “May this tenant/account/quota window accept a new
reservation now?” It is scoped by provider account, auth mode, transport/backend,
endpoint and quota bucket; it also depends on provider reset windows and already
reserved capacity.

Mapping one directly onto the other would create two errors:

1. a small task budget could incorrectly imply that a nearly exhausted provider
   account is safe; and
2. a healthy provider account could incorrectly widen an owner’s per-task ceiling.

Both gates are required. Neither is authority for the other.

## Owner decisions

### D1 — Provider-limit policy authority

**Recommendation:** add one canonical `provider_limits` policy namespace whose
effective resolver carries policy value, source scope, immutable `policyRef` and
provenance. Solo mode reads a user-global account policy. Enterprise mode reads a
verified tenant policy. A project may only tighten thresholds/floors; it may not
loosen a global or tenant rule.

The current generic config loader is pure last-wins and has no invariant lock.
Therefore production provider admission must not consume a raw merged object as
owner authority. The bounded implementation must either:

- introduce a monotonic provider-policy resolver that compares every lower scope
  with its parent and rejects widening; or
- remain HOLD until the broader config-lock work is complete.

No numeric default is proposed. Missing policy remains
`policy_authority_unavailable`.

**Rejected:** derive provider policy from `execution_budget`. This conflates call
cost ceilings with account/window capacity and can authorize work against an
exhausted subscription.

**Owner choice required:** approve the separate `provider_limits` namespace and
global/tenant authority with project-tighten-only precedence.

### D2 — Attended versus unattended admission

**Recommendation:** preserve two explicit paths:

- **Unattended remote:** requires authoritative fresh provider limits, exact-model
  reachability, account identity, measured backend, task execution budget,
  approval policy and receipt/reservation authority.
- **Attended hard-only:** requires an exact owner approval for one call, known
  reachability, measured hard ceiling and visible risk. Advisory/unknown provider
  limits stay visibly advisory/unknown in the receipt. No fallback candidate may
  inherit the exception without its own approval and budget.

This implements the approved M1 rule without converting unknown evidence to
known. Subscription providers that do not expose an authoritative quota/reserve
contract remain useful for attended work but cannot silently power autonomy.

### D3 — Termination evidence authority

**Recommendation:** create one host-global, cross-backend
`ExecutionTerminationLedger`, not a Docker-only boolean adapter. Every record must
bind:

- tenant/project/run/task/call/attempt;
- invocation receipt and provider reservation;
- raw fence-token hash;
- backend/runtime identity;
- terminal outcome and containment proof;
- immutable evidence digest and authority revision.

For Docker, the adapter may consume the existing external
`TaskResultSettlement` closure or LANDED retirement only after verifying exact
project/task/attempt identity, container disposition, settlement digest and fence
binding. A container name, exit code or `docker stop` success alone is not enough.

For host-subprocess, tmux and in-process backends, release is allowed only after
their platform adapter writes equivalent durable process-death/cancellation
evidence. Until such an adapter exists, those backends may settle actual
provider-reported usage as `consumed`; they may not release a reservation from
memory-only process state.

**Rejected:** treat the current `DockerBudgetTerminationEvidence` object as the
universal verifier. It is not a durable cross-backend reference and does not bind
the provider reservation or InvocationReceipt.

**Owner choice required:** approve this cross-backend ledger boundary versus a
Docker-first release authority. The cross-backend option is recommended because
the product’s first provider source is host-subprocess and the constitution
forbids environment-specific authority.

### D4 — Production composition locus

**Recommendation:** one host `ProviderAuthorityRuntimeService` per
tenant/project/process:

1. open `InvocationReceiptStore` and take its canonical `projectId`;
2. resolve verified tenant identity (`local` only in solo mode);
3. resolve platform-global paths;
4. open, never provision, the provider authority keyring;
5. open Truth and Limit stores;
6. inject the policy resolver and termination ledger verifier;
7. install an immutable exact-scope source registry;
8. expose one evidence producer and one role-admission runtime;
9. close stores once at process shutdown.

CLI, MCP, API, process, Goal-v2, Brain, Worker and Auditor receive this service;
they do not construct per-surface authorities. Unsupported source scopes return a
typed HOLD before provider work. Fallback is evaluated only inside the canonical
role resolver, and every candidate gets its own account/reachability/limit
evidence and reservation.

### D5 — Initial source rollout

The existing Claude bundle is valid only for:

`claude / subscription / cli / host-subprocess`

It must not be registered for Docker, tmux, API or hybrid. Its `/usage` source is
advisory, so the bundle can improve diagnostics and attended decisions but cannot
produce unattended ALLOW.

Subsequent sources are separate exact registrations:

- Claude API: provider-supported account/key identity plus HTTP usage/rate-limit
  evidence, if authoritative.
- OpenRouter: `provider=openrouter`, `transport=http`,
  `executionBackend=in-process`; never “cloud” and never subprocess.
- Codex and Gemini subscription: only after provider-native stable identity and
  exact called-model telemetry exist.
- Ollama: local endpoint/runtime identity, `accountRefHash=null`; no remote
  account fiction.

Unknown providers or near-match scopes remain HOLD. Registry order is never
fallback order.

### D6 — Keyring provisioning

The accepted owner decision requires explicit provisioning. Production startup
must continue to call `open`, never `create`.

**Recommendation:** later add a separate owner/admin command with preview,
confirmation, host-global target display, permissions check, first-writer-wins
publication and audit receipt. It must refuse project-local paths. Native Windows
remains HOLD until a verified DACL adapter exists; WSL is a Linux authority and
must not project trust onto native Windows.

No provisioning command or key mutation belongs in the production-wiring slice.

### D7 — Brain memory and SSOT

The accepted decision is discoverable when queried by exact title, but broad
provider-authority recall returned no result earlier in this work. After D1/D3
owner decisions, their exact terms should be inserted into the DB-first ADR/memory
SSOT and exported. MASTER-PLAN records delivery and evidence tiers; it must not
become a second architectural authority.

## Dependency-ordered implementation slices

1. **Policy resolver contract and config provenance** — owner-approved D1,
   fail-loud widening detection, no numerical defaults.
2. **Cross-backend termination ledger** — owner-approved D3, Docker settlement
   bridge plus explicit unsupported adapters.
3. **Runtime service composition** — no provider call; compiled HOLD matrix for
   missing tenant/key/policy/source/termination/receipt.
4. **Role/surface adoption** — Brain, Worker and Auditor, then CLI/MCP/API/process
   and Goal-v2, all consuming the same service.
5. **Attended hard-only branch** — exact owner approval and visible advisory-limit
   provenance; no unattended exception.
6. **Provider source rollout** — one exact scope at a time.
7. **Bounded live canaries** — only after the earlier slices are compiled and
   their HOLD behavior is proven.

No slice may claim a provider is ready merely because the composition object was
constructed.

## Exact implementation and migration map

This map is descriptive until D1 and D3 are owner-approved. It narrows the
implementation boundary; it does not authorize it.

### D1 implementation boundary

The existing `ProviderLimitPolicy` value has four safety-relevant fields:
`policyRef`, `warnAtRatio`, `blockAtRatio`, and `minimumRemaining`. The generic
`loadConfig`/`mergeConfigs` path cannot be its authority: ADR-G-001 documents
that it is pure last-wins today and that CONFIG-LOCK is still roadmap.

The approved implementation therefore needs a dedicated resolver that receives
authored layers separately and emits both the effective policy and provenance:

| Field | Project layer may do | Widening that must fail loudly |
|---|---|---|
| `warnAtRatio` | lower or inherit | increase |
| `blockAtRatio` | lower or inherit | increase |
| `minimumRemaining[unit]` | increase, add a positive floor, or inherit | decrease/remove a parent floor |
| `policyRef` | cannot author the effective ref | replace or omit parent provenance |

The effective `policyRef` must be a canonical digest of schema version, exact
tenant/provider/auth/quota selector, every source scope, and the normalized
effective values. A raw user string is not sufficient provenance.

Implementation ownership:

- `provider-limit-policy.ts` owns parsing, canonicalization, monotonic comparison
  and resolution. It has no provider or store side effects.
- `config-types.ts` and validation may expose the authored
  `provider_limits` namespace, but `ResolvedConfig.provider_limits` must remain
  authored input, not an already-trusted policy.
- solo mode resolves user-global policy plus optional project tightening;
  enterprise mode resolves verified tenant policy plus optional project
  tightening. A project cannot substitute for a missing parent authority.
- environment overrides are not added for this namespace; an untracked process
  environment must not silently widen account quota policy.
- `composeProviderAuthority` receives the resolved authority object, not a
  closure over last-wins config.

No numerical default is introduced. Missing global/tenant policy remains
`policy_authority_unavailable`. A migration validates and reports authored
config but does not invent values or rewrite the provider-limit SQLite ledger.
Rollback removes the new consumer/wiring while preserving the additive authored
config and host ledger for a later compatible binary.

### D3 pre-dispatch binding requirement

`TaskResultSettlementRefV1` currently binds Docker, project, task and attempt.
It does **not** bind a provider reservation, InvocationReceipt or fence token.
Consequently a post-exit `settled.json` + `closure.json` pair alone cannot prove
that unused capacity for a particular provider call may be released.

The cross-backend ledger must establish this binding before provider dispatch:

```text
tenant/project/run/task/call
  + InvocationReceiptRef
  + ProviderLimitReservationRef
  + execution attempt/backend/runtime
  + fenceTokenHash
  + authority revision
        ↓ immutable pre-dispatch binding
backend terminal evidence
        ↓ exact adapter verification
consumed | released (exactly once)
```

The binding record is host-global and never worker-mounted. Terminal records
append to the same attempt chain and reference the binding digest. A terminal
record cannot change provider/model/account/quota/fence identity.

Adapter behavior:

| Backend | Release evidence | Behavior before adapter exists |
|---|---|---|
| Docker | exact settlement + closure/LANDED retirement, container disposition, result/retirement digest, and matching pre-dispatch binding | HOLD release; settle provider-reported actual usage as consumed when available |
| host subprocess | durable PID/process-generation authority plus exit/cancel evidence and matching binding | no memory-only release |
| tmux | durable pane/session generation plus verified process death and matching binding | no pane-name-only release |
| in-process HTTP/API | exact request/response/cancel lifecycle receipt plus matching binding | no promise-resolution-only release |
| unsupported platform | none | typed unsupported HOLD, never synthetic success |

Linux, WSL, macOS and native Windows use platform adapters under one ledger
contract. WSL remains a Linux authority and cannot attest native-Windows process
death. Native Windows stays explicit unsupported HOLD until its process and
storage ACL adapters satisfy the same contract.

The provider-limit store's current `terminationEvidenceVerifier` becomes a thin
reader of this ledger. It must reject:

- a record created after the release event;
- mismatched receipt/reservation/attempt/fence/backend/runtime;
- missing or retired authority revision;
- terminal evidence whose digest no longer verifies;
- a second terminal outcome for the same binding.

### Production adoption matrix

| Consumer | Current state | First authorized change after D1/D3 |
|---|---|---|
| Goal-v2 Brain author | `HostRoleInvocationAdmissionRuntime(null)` | inject the process-scoped runtime service |
| Goal-v2 Worker | `MissionWorkerInvocationCoordinator(null)` | inject the same service and pre-dispatch binding |
| Goal-v2 Auditor accepter | shares the null role runtime | resolve its own role candidate through the same authority |
| CLI/MCP/API/process | no production `composeProviderAuthority` inbound edge | receive one lifecycle-owned service; no surface-local construction |
| Claude source registry | code-present, production zero-inbound | register only exact host-subprocess subscription scope |
| other providers/backends | no authoritative source registration | typed HOLD until an exact source+adapter is independently proven |

### Acceptance and rollback sequence

1. Compile a disposable-process HOLD matrix for missing parent policy,
   widening project policy, missing termination adapter, missing source, missing
   keyring and mismatched receipt ledger. Provider calls must be zero.
2. Persist and reopen pre-dispatch binding and terminal records; prove duplicate,
   crash/restart and cross-project/cross-tenant rejection in a real SQLite file.
3. Enable the service in one disposable compiled CLI process and prove lifecycle
   open/close without a provider call.
4. Adopt one surface/role at a time while every non-adopted surface remains
   explicitly HOLD; do not retain a parallel fallback authority.
5. Only with separate owner approval run one attended hard-only provider call.
   Require exact receipt, reservation, called model, budget, terminal ledger and
   settlement convergence.
6. Unattended ALLOW remains unavailable until an authoritative fresh provider
   quota source exists. Advisory Claude usage can never satisfy this step.

Rollback is wiring-level and fail-closed: disable the runtime consumer, leave
append-only ledgers intact, and return typed HOLD. It never rewrites or deletes
authority history and never falls back to raw merged config or memory-only
termination state.

## Live-proof acceptance matrix

| Stage | Required evidence | Tests alone sufficient? |
|---|---|---|
| Code-present | exact source hashes, import graph, contract review | no |
| Wired | production inbound graph from every intended composition root; no null/parallel authority | no |
| Enabled | compiled binary config and process lifecycle demonstrate the intended service is selected | no |
| Fail-closed | disposable global/project scopes produce exact typed HOLDs with zero provider calls and durable evidence refs | no |
| Attended live | owner-approved single-call canary; exact called model/provider/backend/account scope, limit state, budget, receipt and settlement all converge | no |
| Unattended live | authoritative fresh provider quota source, reservation/settlement, crash/restart, fallback and duplicate-dispatch proof | no |
| Multi-role | Brain → Worker → Auditor all use the same authority and each has an immutable receipt | no |
| Cross-platform | Linux, WSL, macOS and native Windows adapters either pass the same contract or return explicit unsupported HOLD | no |

The first provider call is forbidden until stages 1–4 above are complete. A
single finite Fable-5 terminal verifier may then adjudicate only the written
acceptance criteria. It cannot replace the compiled/runtime/ledger canary and
cannot verify its own verdict.

## Current live observations

At 2026-07-24T15:27:47+03:00:

- Claude CLI auth: logged in, `claude.ai`, first-party, Max subscription. The
  organization subject was hashed for evidence; raw identity is not recorded
  here.
- Codex CLI: logged in through ChatGPT.
- Compiled `deckent limits --json`: session 2%, weekly 43%, Fable 78%, verdict
  `warn`, gate disabled.
- These observations do not prove exact-model reachability or authoritative
  remaining capacity. No production reachability or execution request was made.
  After the packet was complete, one bounded `claude-fable-5` design-verifier
  request ran under the finite cross-verify contract; it is not provider
  readiness evidence.

## Recommended owner response

Approve:

1. D1 separate global/tenant `provider_limits` authority with
   project-tighten-only precedence; and
2. D3 cross-backend `ExecutionTerminationLedger`.

With those decisions, the next bounded coherent change can implement policy and
termination contracts before production composition wiring. If either decision
is deferred, production remote unattended admission should remain HOLD while
explicit attended hard-only execution remains the controlled product path.
