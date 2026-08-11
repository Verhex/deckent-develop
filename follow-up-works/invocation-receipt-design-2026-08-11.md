# Immutable InvocationReceipt — design and first slice map (2026-08-11)

**Work ID:** `INVOCATION-RECEIPT-001` (MASTER row 4070).
**Decision owner:** Alperen.
**Status:** proposal only. This document changes no production code, no schema, no config, no ADR and no MASTER row. Every claim in §2 carries a `path:line` anchor observed on 2026-08-11 in this working tree.
**Companion structure:** deliberately mirrors `follow-up-works/skill-catalog-authority-design-2026-08-11.md` and `follow-up-works/agent-catalog-authority-design-2026-08-11.md` (layer → evidence inventory → contract → slice map → owner decisions) so a single design dialect emerges rather than three.

## 0. Decision boundary

`HOLD` below means: no implementation may treat the item as settled until the owner records a decision. It is never a product verdict.

Four things this document is **not** allowed to do, and does not do:

1. **It does not introduce a second usage-evidence mechanism.** deckent already has four surfaces that observe usage (§2.3). The design below adds **references and digests**, never a second place where token counts are independently measured, summed, or priced. Any slice that would copy a count into a new store is out of scope by construction — see §5.1.
2. **It does not edit production.** Every observation below is a read.
3. **It does not decide retention, tenant fencing, or redaction.** Those are §7 owner decisions, and each blocks a specific slice named in §6.
4. **It does not claim the receipt does not exist.** It does exist. §2.1 proves it, and §1 restates row 4070's gap in the narrower, evidence-backed form.

## 1. Problem — one sentence

An immutable, hash-chained `InvocationReceipt` ledger already exists and is already the authority for *which identity was requested, resolved and called, under what authority, after which fallback* — but its V1 record carries **no usage and no settlement provenance**, and it is written only on a closed list of six purposes, so the question "*what did this exact provider call cost, and on whose authority was that cost accepted*" is still answered by joining four separate evidence surfaces that share no common key.

That is a narrower and harder claim than "there is no receipt". Row 4070's measurement ("usage evidence lives across the budget-observation chain, the provider-execution-observation store and per-provider usage streams without one immutable per-call receipt") is confirmed for the *usage* half and **superseded for the identity half**: the identity half already landed. The remaining work is to bind the usage half to the receipt that exists, not to build a receipt.

## 2. Evidence inventory — file-level anchors (2026-08-11)

### 2.1 The receipt already exists, and is already immutable + chained

| Property | Where it is defined today | Evidence |
|---|---|---|
| Receipt record | `InvocationReceipt` — `schemaVersion`, `invocationId`, `idempotencyKey`, `tenantId`, `projectId`, `runId`, `taskId`, `callId`, `role`, `purpose` | `src/core/invocation-receipt.ts:108-144` |
| Four-stage identity | `configured` / `requested` / `resolved` / `called`, each an `InvocationSelection` with `provider`, `model`, `source`, `reasonCode` | `src/core/invocation-receipt.ts:90-95`, `:119-122` |
| Authority | `backend.transport`, `backend.executionBackend`, `backend.endpointRefHash`, `auth.mode`, `auth.accountRefHash` (already hash-only, never an email or credential) | `src/core/invocation-receipt.ts:123-133` |
| Fallback | `fallbackChain: readonly InvocationFallbackTransition[]` — ordered `sequence`, from/to identity, `reasonCode`, `reachabilityRef`, `limitEvidenceRefs` | `src/core/invocation-receipt.ts:97-106`, `:134` |
| Lifecycle events | `dispatch_started` / `dispatch_rejected` / `transport_settled` / `consumer_settled` | `src/core/invocation-receipt.ts:146-194` |
| **Hash chain** | `StoredInvocationEvent` carries `payloadHash`, `previousHash`, `hash` | `src/core/invocation-receipt.ts:196-206` |
| Chain construction | event hash = `sha256(canonicalJson({ …, payloadHash, previousHash }))`, `previousHash = previous?.hash ?? null` | `src/core/invocation-receipt-store.ts:1443-1444`, `:1498-1506` |
| Chain verification on read | full re-walk; row is rejected when `row.prev_hash !== previousHash` or the recomputed hash differs | `src/core/invocation-receipt-store.ts:1724-1810` |
| **Storage immutability** | SQLite `BEFORE UPDATE` / `BEFORE DELETE` triggers `RAISE(ABORT, 'invocations are immutable')` on both tables | `src/core/invocation-receipt-store.ts:802-815` |
| Scope uniqueness | `UNIQUE (tenant_id, project_id, idempotency_key)` and `UNIQUE (tenant_id, project_id, invocation_id)` | `src/core/invocation-receipt-store.ts:766-767` |
| Event ordering | `UNIQUE (invocation_id, sequence)` + FK to the parent invocation in the same scope | `src/core/invocation-receipt-store.ts:782-784` |
| Atomic write + CAS | `writeAtomic` with `requireSynchronousPrecondition` and `requireTaskReceiptAbsence` evaluated inside one IMMEDIATE transaction | `src/core/invocation-receipt.ts:253-269`, `src/core/invocation-receipt-store.ts:974-1031` |
| Recovery | `scanOpenDispatches` / `reconcileOpenDispatch` for dispatch heads with no terminal event | `src/core/invocation-receipt.ts:316-323` |

**Conclusion for §2.1:** the immutability and chaining contract row 4070 asks to "define reusing the existing audit-chain patterns" is not a gap. It is the pattern. §4 therefore specifies *reuse*, not construction.

### 2.2 Who writes a receipt today — the writer set is purpose-scoped, not call-scoped

`InvocationPurpose` is a closed union of six values (`src/core/invocation-receipt.ts:6-12`). Every writer binds one of them:

| Purpose | Writer | Evidence |
|---|---|---|
| `worker-execution` | Task settlement authority (declare, settle, reject, legacy-attest) | `src/core/task-settlement-authority.ts:535`, `:553`, `:570`, `:682`, `:839`, `:879`, `:1054` |
| `worker-execution` | Provider execution ingress authority | `src/core/provider-execution-ingress-authority.ts:105` |
| `worker-execution` | Scheduler effects | `src/orchestra/scheduler-effects.ts:446`, `:476` |
| `worker-execution` | Task-mode runner | `src/orchestra/task-mode-runner.ts:249` |
| `worker-execution` | Mission worker invocation coordinator | `src/orchestra/autonomous/mission-store/mission-worker-invocation-coordinator.ts:339`, `:625` |
| `sprint-planning` | Planner | `src/orchestra/planner.ts:764`, `:805` |
| `audit-evaluation` | Cross-verify invocation authority / production ingress | `src/orchestra/cross-verify-invocation-authority.ts:246`, `src/orchestra/cross-verify-production-ingress-authority.ts:773`, `src/orchestra/cross-verify-invocation-coordinator.ts:717`, `src/orchestra/cross-verify-runner.ts:508` |
| `reachability-probe` | Provider evidence producer | `src/core/provider-evidence-producer.ts:823`, `:604` |
| `goal-authoring`, `goal-acceptance` | declared in the union; read side at `src/orchestra/autonomous/mission-store/mission-acceptance.ts:253` | `src/core/invocation-receipt.ts:8-9` |

**The gap this exposes:** the receipt is issued per *governed lifecycle event*, not per *provider call*. A provider call that is not one of those six purposes — an auxiliary/helper turn inside an already-receipted execution, a retry inside one dispatch, a tool-loop turn — is inside the receipt's `transport_settled` window but has **no receipt row of its own**. `src/core/cost-ledger.ts:13-16` records the operational consequence in its own header: *"off-task helper calls, e.g. Brain's haiku auxiliary turns that were previously off-ledger"*. Any claim that a V2 receipt covers "every provider call" must first settle what a *call* is — that is owner decision **D5** (§7).

### 2.3 The four usage-evidence surfaces, none of which is the receipt

None of the modules below imports `invocation-receipt.js`; none of the receipt writers in §2.2 writes a token count. The receipt shape at `src/core/invocation-receipt.ts:108-144` has no usage field of any kind.

**S1 — Runtime budget observation chain (per attempt, file-backed, digest-chained).**

| Fact | Evidence |
|---|---|
| Evidence record with `observationIndex`, `providerSequence`, `previousObservationDigest`, `observationDigest`, `appliedDelta`, `countersAfter` | `src/orchestra/runtime-budget-monitor.ts:82-105` |
| Written atomically, one file per observation, suffix `.budget-observation.json` | `src/orchestra/runtime-budget-monitor.ts:35`, `:417-419`, `:875-907` |
| Chain re-walked and digest-verified on read; a mismatch is a typed execution-authority error | `src/orchestra/runtime-budget-monitor.ts:455-506` |
| Identity keys: `projectId`, `taskId`, `attemptId`, `budgetFingerprint`, `backend` | `src/orchestra/runtime-budget-monitor.ts:83-88` |
| Upstream observation extraction + dedupe (`dedupeKey`, cumulative-vs-incremental, snapshot delta) | `src/core/live-execution-budget.ts:27-47`, `:201-211`, `:417-439` |

S1 is already a chained, digest-verified, immutable-by-construction usage journal. **It is the closest thing deckent has to a per-call usage receipt, and it is keyed by `attemptId`, not by `invocationId`.**

**S2 — Provider execution observation store (per execution window, content-addressed, unchained).**

| Fact | Evidence |
|---|---|
| Immutable start/end observation bound to `executionId`, `runId`, `taskId`, `attemptId`, `providerPrincipalDigest`, `fence` | `src/core/provider-execution-observation.ts:71-84` |
| Content-addressable `eventId = sha256(identity ‖ type ‖ sequence ‖ observedAt ‖ outcome)` — **content-addressed, not previous-hash-chained** | `src/core/provider-execution-observation.ts:87-103` |
| Pure reducer; every domain invalidity is a typed HOLD (`missing-fence`, `foreign-attempt`, `end-before-start`, `conflicting-replay`), never a throw | `src/core/provider-execution-observation.ts:130-141`, `:210-292` |
| Explicitly **not** settlement authority; a worker's own claim is untrusted input | `src/core/provider-execution-observation.ts:6-9` |
| Retention is caller-driven and unbounded until called | `src/core/provider-execution-observation.ts:337-353` |

S2 carries **no usage at all** — it answers *concurrency and interval*, not *cost*. It is listed here because row 4070 names it, and because it holds the only `providerPrincipalDigest` + `fence` binding in the set.

**S3 — Per-provider usage streams (per session, provider-native, best-effort).**

| Fact | Evidence |
|---|---|
| Reads the provider's native per-session store and sums every turn's `message.usage` into 4 token fields | `src/providers/session-usage-store.ts:102-145`, `:210-236` |
| **Claude only.** `codex` / `gemini` return `null` with a documented phase-2 seam | `src/providers/session-usage-store.ts:214-219` |
| Session correlation is *heuristic when `sessionId` is absent*: newest `*.jsonl` inside a spawn mtime window, else newest overall | `src/providers/session-usage-store.ts:154-192` |
| Orchestrator-side resolution order (native → CLI envelope → adapter → CLI log → estimate) | `src/orchestra/token-counter.ts:79`, `:132`, `:214`, `:249`, `:347-352` |
| Heuristic estimator of last resort — explicitly *not* a measurement | `src/orchestra/result-collector.ts:718`, `:831` |
| Provenance is already modelled: `source: 'session-store' \| 'envelope' \| 'estimate'` | `src/core/task-types.ts:742-750` |
| A second, adapter-side normalized usage type exists in parallel (`provider-adapter` vs `tokenizer-fallback`) | `src/core/token-usage.ts:19-24`, `:41`, `:118` |

**S4 — Aggregation and pricing (per lineage / per sprint).**

| Fact | Evidence |
|---|---|
| Billing authority belongs to the *logical root task*, not the mutable sprint array | `src/core/lineage-usage-authority.ts:1-4`, `:124` |
| Attempt-level aggregation into `AggregatedAttemptTokenUsage` / `LineageBilledUsd` | `src/core/lineage-usage-authority.ts:44-62` |
| Cost ledger prices per-model usage entries, including previously off-ledger helper turns | `src/core/cost-ledger.ts:11-16`, `:203` |
| Local-vs-provider variance alert exists precisely because capture is known-lossy (the recorded 59.9%-captured case) | `src/core/cost-ledger.ts:17-21`, `:233`, `:255` |

### 2.4 The join-key matrix — why these cannot be joined today

| Surface | Primary identity | Has `invocationId`? | Has usage? | Chained? |
|---|---|---|---|---|
| Receipt (`invocations` / `invocation_events`) | `tenantId` + `projectId` + `invocationId`, plus `runId`/`taskId`/`callId` | authority | **no** | previous-hash chain |
| S1 budget observations | `projectId` + `taskId` + `attemptId` + `budgetFingerprint` | **no** | yes (counters + applied delta) | previous-digest chain |
| S2 execution observations | `executionId` + `runId` + `taskId` + `attemptId` + `providerPrincipalDigest` + `fence` | **no** | no | content-addressed only |
| S3 session usage | provider session file (`sessionId`, else mtime window) | **no** | yes (4 token fields) | not chained |
| S4 lineage/cost | logical root task + attempt id | **no** | derived | not chained |

**`attemptId` is present in S1 and S2 and absent from the receipt; `invocationId` is present only in the receipt.** That single missing edge is the whole of row 4070's remaining work. Everything else is composition.

## 3. Receipt V2 — the schema delta

`INVOCATION_RECEIPT_SCHEMA_VERSION` is `1` (`src/core/invocation-receipt.ts:3`) and is a `typeof` literal on both the record and the ref (`:86`, `:109`), so a version bump is a typed, compiler-visible change — not a silent widening. V2 is **purely additive** and reference-only.

### 3.1 Correlation — bind the receipt to the surfaces that already exist

Added to `InvocationReceipt`, all optional-with-explicit-absence so V1 rows stay readable:

```
readonly correlation: {
  /** Binds the receipt to S1 and S2. Absent = HOLD, never "no attempt". */
  readonly attemptId: string | null;
  /** Binds the receipt to S2's execution window. */
  readonly executionId: string | null;
  /** S2's principal identity, already a digest at source. */
  readonly providerPrincipalDigest: string | null;
  /** S1's budget identity — the observation chain is keyed by it. */
  readonly budgetFingerprint: string | null;
}
```

Every field mirrors a value that already exists at the anchors in §2.3 (`src/orchestra/runtime-budget-monitor.ts:83-88`, `src/core/provider-execution-observation.ts:75-80`). Nothing is newly measured.

### 3.2 Usage provenance — a *pointer with a digest*, never a second count

Usage does **not** become a receipt field. It becomes a terminal event payload that names where the numbers live and pins what was read:

```
| {
    readonly eventId: string;
    readonly type: 'usage_attested';
    readonly occurredAt?: string;
    readonly payload: {
      /** Which surface produced the attested numbers. */
      readonly source: 'budget-observation-chain' | 'session-store' | 'envelope'
                     | 'provider-adapter' | 'tokenizer-fallback' | 'estimate';
      /** Honest quality of the attestation — reuses InvocationEvidenceState. */
      readonly state: InvocationEvidenceState;
      /** Opaque refs into S1/S3 — file path digest, sessionId digest, chain head. */
      readonly evidenceRefs: readonly string[];
      /** The S1 chain head digest at attestation time; pins the exact chain prefix. */
      readonly observationChainHeadDigest: string | null;
      /** Count of S1 observations covered — a coverage claim, not a token count. */
      readonly observationCount: number;
      readonly reasonCode: InvocationReasonCode;
    };
  }
```

`source` reuses the union already carried on `TokenUsage.source` (`src/core/task-types.ts:742-750`) and on `TokenUsageSource` (`src/core/token-usage.ts:24`). `state` reuses `InvocationEvidenceState` (`src/core/invocation-receipt.ts:13`), which already models `known | unknown | stale | unavailable` — so a codex/gemini call whose native store returns `null` (`src/providers/session-usage-store.ts:214-219`) attests `state: 'unavailable'` honestly rather than silently attesting an estimate as a measurement.

**Why no counts.** Copying `inputTokens`/`outputTokens` into the receipt would create the second usage-evidence mechanism this task forbids, and would immediately diverge from S1 whenever the budget monitor applies a delta the receipt writer did not see. A digest-pinned pointer is falsifiable: a reader recomputes S1's chain (`src/orchestra/runtime-budget-monitor.ts:455-506`), compares the head to `observationChainHeadDigest`, and either reproduces the number or reports a typed mismatch. That is strictly stronger than a copied integer.

### 3.3 Settlement provenance — reuse `consumer_settled`, add the authority ref

`consumer_settled` already carries `outcome`, `reasonCode`, `taskDisposition`, `evidenceRefs` (`src/core/invocation-receipt.ts:184-194`). V2 adds two optional payload fields on the same event rather than a new event type:

```
readonly settlementAuthorityRef?: string;   // which authority accepted (task-settlement / xverify / operator attestation)
readonly billingAuthority?: LineageBillingAuthority;  // src/core/lineage-usage-authority.ts:5-12
```

`LineageBillingAuthority` already enumerates `metered | subscription | local | free-tier | unknown | hybrid` (`src/core/lineage-usage-authority.ts:5-11`). Binding it at settlement makes "was this call metered" answerable from the receipt without re-deriving lineage.

### 3.4 What V2 deliberately does not add

- No cost/USD field. Pricing is S4's job (`src/core/cost-ledger.ts:203`) and is tariff-versioned; a price frozen into an immutable receipt would be wrong the moment a tariff is corrected. The receipt pins *usage evidence*, the ledger prices it.
- No raw account, endpoint, session path or prompt content. §2.1 shows the existing shape is already hash-only (`auth.accountRefHash`, `backend.endpointRefHash`); V2 holds that line — see decision **D3**.
- No mutable status column. Every state transition stays an appended event, because the tables physically reject `UPDATE` (`src/core/invocation-receipt-store.ts:810-815`).

## 4. Immutability and chaining contract

Reuse, not construction. The contract V2 inherits and must not weaken:

**C1 — Append-only at the storage layer.** `UPDATE` and `DELETE` abort at the SQLite trigger level on both `invocations` and `invocation_events` (`src/core/invocation-receipt-store.ts:802-815`). A V2 field is added to the JSON payload, never as a mutable column.

**C2 — Per-invocation hash chain.** `event.hash = sha256(canonicalJson({ …, payloadHash, previousHash }))` with `previousHash = previous?.hash ?? null` (`:1498-1506`). `usage_attested` takes its place in the same chain with no special casing.

**C3 — Verify on read, not on trust.** The reader re-walks the chain and rejects any row whose `prev_hash` or recomputed hash disagrees (`:1724-1810`). A V2 reader that resolves usage MUST verify both chains — the receipt's (C2) and S1's digest chain (`src/orchestra/runtime-budget-monitor.ts:455-506`) — and report a typed mismatch rather than returning a number from an unverified prefix.

**C4 — Scope is part of identity.** `(tenant_id, project_id, invocation_id)` and `(tenant_id, project_id, idempotency_key)` are both unique (`src/core/invocation-receipt-store.ts:766-767`), and the event FK is scope-qualified (`:783-784`). No V2 lookup may be keyed by `invocationId` alone — see decision **D2**.

**C5 — Atomicity across the precondition.** New usage attestation must go through `writeAtomic` so the precondition is evaluated inside the same IMMEDIATE transaction (`src/core/invocation-receipt.ts:253-269`), not through a read-then-append pair.

**C6 — Absence is typed, never inferred.** S2's reducer models this already: every invalidity is a typed HOLD, never a throw and never a silent skip (`src/core/provider-execution-observation.ts:130-141`). `usage_attested` inherits it via `state: 'unavailable'` rather than an absent event, so "no usage recorded" is distinguishable from "usage was never attested".

**C7 — Ordering is dense and gap-free per invocation.** `UNIQUE (invocation_id, sequence)` (`:782`). A usage attestation that arrives after `consumer_settled` is still appended in arrival order; the chain records *when it was learned*, and the receipt view derives *what is true* — it does not rewrite history.

## 5. Composition contract with S1 and S2

### 5.1 The non-duplication rule, stated so a reviewer can enforce it

> A slice violates this design if, after it lands, a token count exists in more than one durable store, or a second module independently sums or extracts provider usage.

Concretely: S1 remains the only per-attempt usage journal (`src/orchestra/runtime-budget-monitor.ts:875-907`); S3 remains the only native-store reader (`src/providers/session-usage-store.ts:210`); `resolveTokenUsage` remains the only resolution-order authority (`src/orchestra/token-counter.ts:347`); S4 remains the only pricer (`src/core/cost-ledger.ts:203`). The receipt gains a *reference*, and that is the entire delta.

### 5.2 Direction of the edge — receipt → surfaces, never the reverse

| Concern | Owner | Receipt's role |
|---|---|---|
| Which identity was called, under what authority | **Receipt** (`src/core/invocation-receipt.ts:119-133`) | authority |
| Fallback decisions | **Receipt** (`:97-106`) | authority |
| Live usage counters + budget decisions | **S1** (`src/orchestra/runtime-budget-monitor.ts:82-105`) | pins the chain head, copies nothing |
| Attained concurrency, execution intervals | **S2** (`src/core/provider-execution-observation.ts:303-329`) | correlates by `executionId`, copies nothing |
| Native per-session token counts | **S3** (`src/providers/session-usage-store.ts:210`) | names the source + provenance state |
| Lineage aggregation and pricing | **S4** (`src/core/lineage-usage-authority.ts:124`, `src/core/cost-ledger.ts:203`) | supplies `billingAuthority` at settlement |

**ADR-D-004 note.** S1 lives in `orchestra/` and the receipt in `core/`. C1 of ADR-D-004 forbids `core/ → orchestra/`. Therefore the receipt store must **never import `runtime-budget-monitor.ts`**. The chain-head digest is passed *inward* as a plain string by the orchestra-side writer; `core/` stores an opaque ref it cannot resolve on its own. Any slice that reaches from `core/` into `orchestra/` to fetch a chain head is a NO_GO against ADR-D-004 C1, not a design detail.

### 5.3 Reconciliation, not duplication

The receipt already has a reconciliation path for dispatch heads with no terminal event (`scanOpenDispatches` / `reconcileOpenDispatch`, `src/core/invocation-receipt.ts:316-323`). Usage reconciliation reuses the same shape: a receipt whose `usage_attested` is absent or `state: 'stale'` is a *candidate*, and reconciliation appends an attestation — it never edits one. S1's chain is the authority consulted during reconciliation; the receipt is the record that reconciliation happened.

## 6. Slice map — admission-sized packages

Each slice is one admission-sized task: one write scope, one verifiable gate, one dependency edge. Slices are ordered by dependency, and the two marked `BLOCKED` cannot be admitted before their §7 decision is recorded.

| # | Slice | Write scope | Gate (verifiable) | Depends on | State |
|---|---|---|---|---|---|
| **P0** | **Correlation fields (§3.1).** Add `correlation` to the receipt record; bump `INVOCATION_RECEIPT_SCHEMA_VERSION` to `2`; accept V1 rows on read. | `src/core/invocation-receipt.ts`, `src/core/invocation-receipt-store.ts` + tests | `tsc --noEmit` clean (the `typeof` literal at `:86`/`:109` makes every unmigrated writer a compile error — that is the point); a V1-row-read test proves backward compatibility | — | ready |
| **P1** | **Writer migration.** Populate `correlation` at every §2.2 writer that already holds an `attemptId`/`executionId`. | the §2.2 writer files + their tests | every writer compiles; no writer passes a literal `null` where the value is in scope | P0 | ready |
| **P2** | **`usage_attested` event (§3.2).** Add the event to the union, the store's semantic-hash path and the read-side chain verifier. | `src/core/invocation-receipt.ts`, `src/core/invocation-receipt-store.ts` + tests | chain verification test: an attestation appended after `consumer_settled` verifies; a tampered `observationChainHeadDigest` fails the re-walk | P0 | ready |
| **P3** | **Orchestra-side attester.** One caller reads S1's chain head (`readRuntimeBudgetObservations`) and appends `usage_attested` via `writeAtomic`. Import direction is orchestra → core only (§5.2). | one `src/orchestra/` module + tests | proof that no `core/` file imports `runtime-budget-monitor.js`; `state: 'unavailable'` asserted for a provider whose native store returns `null` | P1, P2 | ready |
| **P4** | **Settlement provenance (§3.3).** Add `settlementAuthorityRef` + `billingAuthority` to the `consumer_settled` payload. | `src/core/invocation-receipt.ts` + `src/core/task-settlement-authority.ts` + tests | settlement test asserts both fields on the terminal event | P0 | ready |
| **P5** | **Reconciliation for un-attested receipts (§5.3).** Extend the open-dispatch scan shape to un-attested usage. | `src/core/invocation-receipt-store.ts` + tests | a receipt with no `usage_attested` is returned as a candidate exactly once; reconciliation appends, never edits | P2, P3 | ready |
| **P6** | **Read surface.** Project `usage_attested` + `correlation` into `InvocationReceiptView`. | `src/core/invocation-receipt.ts` + tests | view exposes attested state without exposing an unverified count | P2 | ready |
| **P7** | **Retention / pruning.** Bounded retention for both the receipt tables and S1's per-observation files. | TBD by decision | — | **D1** | `BLOCKED` |
| **P8** | **Call-granularity closure.** Extend coverage from six purposes to the owner's definition of "every provider call" (§2.2). | TBD by decision | — | **D5** | `BLOCKED` |

**Sequencing note.** P0 is deliberately first and deliberately breaking: bumping the schema version literal turns every existing writer into a compile error, which converts "did we migrate every writer?" from a review question into a `tsc` result. Slicing P0 any smaller re-introduces the silent-drift class this design exists to close.

## 7. Owner decision points

Each decision names what is blocked, so none of them can be quietly assumed by an implementer.

**D1 — Retention. `HOLD`.** *Blocks P7.*
The receipt tables are append-only by trigger (`src/core/invocation-receipt-store.ts:802-815`) and have **no retention policy at all**; they grow without bound. S1 writes one file per observation (`src/orchestra/runtime-budget-monitor.ts:417-419`) with the same property. S2 is the only surface with an explicit, caller-driven prune (`src/core/provider-execution-observation.ts:337-353`), and it prunes nothing until called.
Owner must decide: (a) the retention horizon per surface; (b) whether pruning a receipt is even permissible given the triggers — deleting requires dropping the trigger, which is a governance event, not a maintenance script; (c) whether retention is per tenant or global. **Recommendation to the owner, not a decision:** treat receipt deletion as prohibited and expire only S1's file journal, keeping the receipt's digest pointer as a tombstone that honestly reports `state: 'stale'` once the chain it pins is gone.

**D2 — Tenant fencing. `HOLD`.** *Blocks nothing directly; constrains every slice.*
The receipt is already tenant-scoped in identity and uniqueness (`src/core/invocation-receipt-store.ts:766-767`, `:783-784`) and every scan takes an `InvocationScope` (`src/core/invocation-receipt.ts:216-251`). **S1 is not.** Its evidence carries `projectId` + `taskId` + `attemptId` and no `tenantId` (`src/orchestra/runtime-budget-monitor.ts:83-86`), and it is file-backed under a project root.
Owner must decide whether a cross-tenant reader may resolve a usage pointer at all, and whether S1 must gain a tenant binding before P3 lands. Until decided, P3 must refuse to resolve a pointer across a scope boundary rather than resolve it optimistically.

**D3 — Redaction. `HOLD`.** *Constrains P2/P3.*
The existing shape hashes everything sensitive at the boundary: `auth.accountRefHash` is documented as "never an email or credential" (`src/core/invocation-receipt.ts:129-133`), `endpointRefHash` is pre-hashed (`:126-127`), and the legacy attestation hashes both operator and statement (`:69-78`, applied at `src/core/task-settlement-authority.ts:1043-1047`).
S3's evidence, however, is a **filesystem path derived from the project cwd** (`src/providers/session-usage-store.ts:74-80`) and a session id. Owner must decide whether `evidenceRefs` may carry a path or session id in clear, or must carry only a digest — and, if digested, who holds the reverse map for an audit. A digest with no resolver is auditable only by whoever still has the file.

**D4 — Estimate admissibility. `HOLD`.** *Constrains P3.*
`resolveTokenUsage` falls back through envelope → adapter → CLI log → heuristic estimate (`src/orchestra/token-counter.ts:347`, `src/orchestra/result-collector.ts:718`), and `cost-ledger` already documents a case where only 59.9% of provider-reported cost was captured locally (`src/core/cost-ledger.ts:17-21`).
Owner must decide whether an immutable receipt may attest a `source: 'estimate'` at all. Two coherent positions: attest it with `state: 'unknown'` (auditable but weak), or refuse and attest `state: 'unavailable'` (honest but leaves receipts usage-less for codex/gemini until their native readers land at `src/providers/session-usage-store.ts:215-218`). This design does not choose.

**D5 — What counts as one "call". `HOLD`.** *Blocks P8.*
Row 4070 says "every provider call". §2.2 shows the receipt is issued per governed purpose. Owner must define whether a receipt is issued per dispatch (today's shape, plus auxiliary turns invisible), per provider request (one per HTTP/CLI turn, correct but high-cardinality), or per dispatch with an aggregated per-turn attestation (S1's `providerSequence` already numbers turns — `src/orchestra/runtime-budget-monitor.ts:90`). P0–P6 are correct under all three readings; P8 is not admissible until this is answered.

**D6 — Schema-version compatibility window. `HOLD`.** *Constrains P0.*
`INVOCATION_RECEIPT_SCHEMA_VERSION` is a `typeof` literal on both record and ref (`src/core/invocation-receipt.ts:3`, `:86`, `:109`), and the store validates it on read (`:1706`). Owner must decide whether V1 rows are readable indefinitely or migrated — noting that migration means writing, and writes to `invocations` abort at the trigger. The honest options are "read both versions forever" or "a governed table rebuild"; there is no in-place migration path.

## 8. What this design deliberately does not do

- It does not price anything. §3.4.
- It does not add a usage store, a usage table, or a second extractor. §5.1.
- It does not let `core/` reach into `orchestra/`. §5.2 — ADR-D-004 C1.
- It does not decide retention, fencing, redaction, estimate admissibility, call granularity, or the version window. §7.
- It does not touch S2's reducer. S2 carries no usage; it is correlated, not changed.
- It does not claim coverage of "every provider call" — §2.2 shows that claim is unavailable until **D5** is answered, and P8 is marked `BLOCKED` for exactly that reason.
