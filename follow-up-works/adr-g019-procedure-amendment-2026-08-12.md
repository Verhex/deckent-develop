# ADR-G-019 Successor Procedure — Proposed Amendment

**Status:** proposal only — not accepted, not authoritative, and not an ADR-store mutation  
**Date:** 2026-08-12  
**Target:** ADR-G-019, `Decision (Today)`  
**Source evidence:** `.brain/exports/decisions.md`, ADR-G-019 projection  
**Delete trigger:** Delete this follow-up document when the owner approves the amendment text into the ADR store. Until that event, retain it as an unresolved proposal; approval of this file alone does not satisfy the trigger.

## Purpose and boundary

ADR-G-019 defines ADR-G as immutable, but it does not state how a defective or obsolete ADR-G is replaced. This draft proposes the missing successor procedure. It does not change ADR-G-019, any ADR record, or `.brain/memory.db`.

The proposed procedure separates three acts:

- drafting a candidate successor;
- proving that the candidate preserves every applicable constitutional guarantee; and
- owner acceptance into the ADR store, which alone changes governance state.

## Current ADR-G-019 normative text — verbatim

The following quotations are copied verbatim from the ADR-G-019 section of `.brain/exports/decisions.md`. They are the current normative basis for this proposal.

### Class metadata

> **Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=MADR-v3 + `lint:adr` validator (status/required-sections/dup-id; NOT yet class-metadata hard-validate) + DB-first taxonomy columns (write-only — read-path mapping pending) + prompt-injection via legacy-id `adr-selector` (structural/advisory) → tomorrow=ADR-G enforcement-engine (immutable runtime-validation via ADR-G-020 + its flag-gated vein, old ADR-094) + ADR-VALIDATOR-HARDEN + TAXONOMY-READPATH + ADR-SELECTOR-MIGRATE

### ADR-G class declaration

>     deckent's core function laws (worker/brain/auditor/nervous + every subsystem):
>     runtime behavior, orchestration, security/RBAC, evaluation integrity, memory,
>     isolation, capability, approval, proof-of-function. LLMs CANNOT violate.
>     immutable=yes · source=publisher (main repo only) · scope=global+project ·
>     ships in BOTH global install AND every project install · applies to
>     dogfood AND user (solo → largest enterprise, million-scale).

### Precedence and tightening

> On conflict, **ADR-G wins** (the user cannot violate deckent's core law). The user layer (UG/UP) overrides dev conventions (D) for the user's own environment. A user **may tighten** their own layer (add stricter UG/UP rules) but **may never loosen** an ADR-G. ADR-D governs only the deckent-development environment and never overrides a runtime law a user relies on.

### Archive semantics

> IDs are **class-internal sequential**: `ADR-G-001..NNN`, `ADR-D-001..NNN`. The U classes start empty and are created at runtime (`ADR-UG-001..`, `ADR-UP-001..` per user/project). The old flat `ADR-NNN` → new mapping is preserved in `.analysis/adr-review-crosswalk.md` (and, post-migration, in the DB `metadata.legacy_id`). Deprecated ADRs are **archived** (no active number; historical record kept), not renumbered. Intentional gaps (a number absorbed into another ADR) are documented, not back-filled.

### Authoring standard

> Every ADR — **especially ADR-G** — documents **both today and tomorrow, transparently**:
>
> ```
> Context  →  Decision (Today: current-state)  →  Intent/Roadmap (Tomorrow: target-intent + why)  →  Consequences
> ```

### Store synchronization

> ADRs live **DB-first** in `memory.db` (SSOT); `docs/adr/*.md` + `.brain/exports/decisions.md` are generated views.

> Editing an ADR means updating **both** the `.md` and the DB so doc == DB (ADR-G-035 sync invariant).

### Publisher authority

> The publisher alone feeds ADR-G (immutable). Contributors propose ADR-D under approval. Users author UG/UP via natural-language/chat/desktop (no hand-editing required).

## Proposed exact amendment text

The owner is asked to approve, reject, or edit the following text for insertion after ADR-G-019 `Decision (Today)` section 6, before `Intent / Roadmap (Tomorrow)`.

### 7. ADR-G Successor Procedure

#### 7.1 Draft authority and acceptance authority

The owner MAY draft an ADR-G successor directly or MAY explicitly delegate preparation of a bounded successor draft. Delegation authorizes proposal work only: it MUST identify the predecessor and the delegated scope, and it MUST NOT authorize acceptance, mutation of the ADR store, weakening of ADR-G, or a claim that the successor is active. Contributors and agents MAY surface evidence or request a successor, but they have no implicit authority to create governance state.

Only the owner MAY accept an ADR-G successor. Acceptance MUST be an explicit decision on the exact successor text and its evidence package. Review, drafting, a green validator, or publication of a generated projection is not acceptance.

#### 7.2 Equivalence-or-strengthening proof

Before acceptance, the successor MUST carry a clause-level equivalence matrix that maps every normative obligation, prohibition, scope, audience, authority boundary, lifecycle rule, enforcement commitment, and declared roadmap dependency in the predecessor to exactly one disposition in the successor:

1. **preserved** — the successor states an operationally equivalent obligation;
2. **strengthened** — the successor narrows discretion or raises protection without reducing any beneficiary's guarantee;
3. **relocated** — the successor cites the accepted ADR-G destination that now carries the same or stronger obligation; or
4. **inapplicable with evidence** — the underlying capability or threat no longer exists, demonstrated by repository and runtime evidence, with no remaining consumer relying on the obligation.

No clause may be marked omitted, deferred, assumed, or implicitly covered. The proof closes only when all matrix rows have one of the four dispositions; every cited destination is accepted and active; required type/lint/test enforcement and production wiring evidence are green; migration and rollback evidence cover global and project installs across supported platform adapters; generated projections match the DB-first ADR store; and independent review reports no unresolved weakening, ambiguity, scope loss, or enforcement regression. Any unresolved row is a typed HOLD and blocks acceptance.

The successor MAY change mechanism, terminology, decomposition, or ADR boundaries. It MUST preserve or strengthen the predecessor's observable constitutional guarantees for deckent and for every affected end-user audience, from solo use through multi-tenant enterprise scale.

#### 7.3 Acceptance and predecessor archive semantics

On owner acceptance, the successor receives its own class-internal ADR-G id and its MADR-v3 header MUST set `Supersedes: ADR-G-NNN`, naming each direct predecessor. The predecessor is then archived as historical evidence: it remains addressable by its original id, is marked superseded by the successor, is excluded from the active constraint set, and is never deleted, renumbered, reused, or silently rewritten to resemble the successor.

The transition MUST be atomic at the governance layer: there is no state in which both conflicting decisions are active and no state in which neither decision protects the governed surface. Crosswalks, DB records, generated projections, recall/injection consumers, and enforcement references MUST resolve the active successor while retaining the predecessor's historical chain.

If a successor absorbs only part of a predecessor, the predecessor MUST NOT be archived until every remaining normative clause is mapped to an accepted active ADR-G destination. The new ADR's `Supersedes` field records full replacement; partial movement is recorded as `Absorbs`/cross-reference metadata until equivalence closure permits full supersession.

#### 7.4 Class immutability governs entry metadata

ADR-G's class declaration `immutable=yes` governs every ADR-G entry. A per-entry `Immutable:no` header cannot loosen, override, or create an exception to the class rule. Such a header is contradictory metadata to be repaired; it is not amendment authority. Until repaired, the entry remains immutable by class and all actors MUST use this successor procedure for normative change.

Non-normative corrections that provably do not alter meaning—such as a broken link, transcription error, or generated-view synchronization repair—MAY use the store's controlled correction path under owner approval and audit evidence. If reasonable reviewers could disagree about semantic effect, the change is normative and MUST use a successor.

#### 7.5 Path for ADR-G entries carrying `Immutable:no`

For every ADR-G entry whose header carries `Immutable:no`, the landing change MUST first classify the proposed edit:

1. If the edit is non-normative under section 7.4, the owner MAY approve a controlled correction that also normalizes the header to the class value `Immutable:yes`; the audit record preserves the before/after text and reason.
2. If the edit changes a decision, obligation, prohibition, scope, audience, authority, lifecycle, enforcement, or roadmap commitment, in-place amendment is forbidden. The owner MUST approve a new ADR-G successor through sections 7.1–7.3, and the predecessor is archived through the MADR-v3 `Supersedes` chain.
3. If classification or equivalence is disputed, the entry remains active and unchanged and the proposed landing is HOLD until the owner resolves the dispute. `Immutable:no` MUST NOT be used as the tie-breaker.

This path is the landing dependency for normalizing legacy or contradictory ADR-G metadata: no task may infer mutability from the per-entry flag, and no metadata cleanup may conceal a normative amendment.

## Why this procedure closes the measured gap

- It names both possible drafters and chooses owner-delegated drafting with bounded authority, while reserving acceptance to the owner.
- It turns “equivalent successor” into a finite clause-level evidence test rather than an assertion.
- It uses MADR-v3 `Supersedes` for full replacement and keeps the predecessor as immutable historical evidence.
- It codifies the 2026-08-11 owner decision that ADR-G class immutability governs over a contradictory per-entry header.
- It gives `Immutable:no` ADR-G entries a deterministic correction-or-successor path and makes uncertainty fail closed as HOLD.

## Owner decision checklist

The owner should record one explicit choice for every item before this proposal is inserted into the ADR store:

- [ ] **Draft authority:** Approve owner-delegated bounded drafting, or require owner-only drafting.
- [ ] **Acceptance authority:** Confirm that only the owner may accept the exact ADR-G successor text and evidence package.
- [ ] **Equivalence closure:** Approve the four allowed matrix dispositions and the rule that every predecessor clause must close.
- [ ] **Evidence threshold:** Approve the required enforcement, production-wiring, platform, projection-sync, migration/rollback, and independent-review evidence.
- [ ] **Archive semantics:** Approve new class-internal id + `Supersedes: <predecessor>` + retained, inactive, non-renumbered predecessor history.
- [ ] **Partial replacement:** Approve `Absorbs`/cross-reference treatment until every predecessor clause has an accepted destination.
- [ ] **Class rule:** Confirm that ADR-G `immutable=yes` governs over every per-entry header, including `Immutable:no`.
- [ ] **Non-normative correction:** Approve the narrow controlled-correction exception and its semantic-disagreement → successor rule.
- [ ] **`Immutable:no` landing path:** Approve correction + normalization for non-normative edits and mandatory successor for normative edits.
- [ ] **Uncertainty behavior:** Approve typed HOLD whenever classification or equivalence remains disputed.
- [ ] **Placement:** Approve insertion as ADR-G-019 `Decision (Today)` sections 7.1–7.5.
- [ ] **Disposition:** Approve exact text, approve with listed edits, reject, or defer with a named missing evidence item.

