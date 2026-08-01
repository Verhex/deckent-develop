# ADR-G-038: Goal-v2 Normalized Dependency Authority & Bounded Reconciliation

**Status:** accepted

**Sprint:** _To be backfilled_

**Class:** ADR-G · **Scope:** global+project · **Immutable:** yes · **Source:** user · **Enforcement-Level:** runtime

---

ADR-G-038 — Goal-v2 Normalized Dependency Authority & Bounded Reconciliation

Owner: Alperen. Approved: 2026-07-25. Status: accepted.

## Context
Goal-v2 dependency correctness existed for bounded graphs, but JSON arrays in work_items.depends_on remained the runtime graph authority. Six approval/due/claim seams executed json_each, and every reconciliation tick rebuilt complete pending mission graphs. That design preserved correctness at small scale but could not provide indexed reverse traversal, bounded per-tick work, durable cursor fairness or an explicit migration cutover.

## Decision
1. A mission has exactly one dependency authority. No mission_graph_authorities row means legacy JSON authority. migration-pending and quarantined are HOLD. active means work_item_dependencies is the sole runtime authority; JSON cannot authorize query, approval or claim.
2. New normalized missions require explicit composition authority and atomically write mission, items, admission fences, normalized edges, readiness projection and graph digest. Normalized mode remains default-off until a separately approved flip.
3. work_item_dependency_readiness and mission_dependency_reconcile_queue are durable scheduler projections, never final execution authority. Final claim rechecks exact normalized upstream statuses and the existing item revision, admission fence and engine lease in the same transaction.
4. Terminal upstream state enqueues an exact mission/upstream/revision/outcome job transactionally. Reconciliation is owner-bounded by total edges and per-job edges, cursor-resumable, restart-safe and fair across jobs. Descendant blocking uses item-status CAS and recursively queues exact downstream terminal evidence.
5. Migration is explicit per mission: prepare parses and validates legacy JSON with iterative Kahn validation, writes immutable evidence/edges/readiness and leaves migration-pending. Activation requires an owner decision bound to the exact graph digest and revalidates current source plus normalized digest. Invalid or drifted graphs quarantine or HOLD; no silent repair and no JSON rollback.
6. All six store seams consume the same per-mission predicate: approval candidates, invalid-approval parking, approval-request parking, due query, registry-fenced claim and compatibility claim. Compatibility claim remains test/migration-only after cutover.
7. SQLite WAL plus IMMEDIATE transaction, engine lease, fences and CAS is the single-host authority across Linux, WSL, macOS and Windows. A multi-host implementation requires a transactional graph-store adapter with server-side ordering/lease semantics; an unsupported adapter HOLDs.

## Rollout
Ship additive schema and provider-free tests/proofs first. Existing autonomous DB migration activation, live/paid canary, default flip, commit/push, publish and Desktop implementation require separate owner gates. Rollback disables normalized admission/dispatch and preserves graph history; it never reauthorizes stale JSON.

## Acceptance
No active normalized mission authorizes from JSON; atomic intake and replay conflict tests; corrupt migration quarantine; all six seams share authority; stale readiness cannot win final claim; bounded direct/transitive propagation survives restart; 1K/10K/100K deterministic graph proofs remain within configured work bounds; legacy behavior, targeted hermetic tests, lint, build:all and compiled provider-free proof pass before any live canary.
