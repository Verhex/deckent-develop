# Goal-v2 normalized DAG and bounded reconciliation — owner decision packet

**Date:** 2026-07-25
**Altitude:** design / new Goal-v2 MissionStore ADR proposal
**Scope:** non-Desktop Goal-v2 dependency persistence, eligibility,
propagation and migration
**Source:** MASTER-PLAN 600/627 and M4-108 disk audit

## Current truth

Goal-v2 already enforces dependency correctness for bounded graphs:

- complete mission admission validates canonical IDs, mission locality,
  duplicates, self/missing dependencies and cycles before an atomic write;
- `queryDue()` and both atomic claim paths refuse an item unless every
  mission-local upstream item is `done`;
- approval candidates and approval parking use the same semantic prerequisite;
- failed, blocked, denied and expired upstream states propagate to direct and
  transitive pending descendants;
- the scheduler reconciles before claim and once more after approval decisions;
- M4-107 proves signed deny propagation and restart stability without changing
  production semantics.

The scale residual is real:

1. edges are JSON arrays in `work_items.depends_on`, not indexed rows;
2. six production eligibility/claim/approval predicates execute
   `json_each(depends_on)`;
3. every reconciliation tick enumerates every mission with a pending item,
   loads every item in each mission, rebuilds the graph and checks cycles;
4. failure propagation repeatedly scans the pending set until no new node is
   found;
5. `rowToItem()` and three intake paths independently serialize or parse the
   JSON edge list.

On this host, a provider-free rebuilt-dist diagnostic used reverse-ordered
chains, which exercise the iterative propagation's unfavorable ordering:

| Nodes | One root-failure reconciliation |
|---:|---:|
| 500 | 14.92 ms |
| 1,000 | 42.57 ms |
| 2,000 | 109.96 ms |

A running root with the remaining chain pending caused twenty no-change
reconciliations to consume 51.15 ms at 1,000 nodes, 79.81 ms at 2,000 and
195.48 ms at 5,000. These are local diagnostics, not product SLO claims. They
prove repeated whole-graph work, not a universal latency number.

## Negative space

- No JSON/normalized dual runtime authority.
- No authorization from a readiness cache or queue without an indexed
  normalized-edge recheck in the final atomic claim.
- No full-graph scan on every scheduler tick.
- No recursive JavaScript DFS as the large-graph admission algorithm.
- No mission-wide mutex that serializes independent ready work.
- No silent repair of corrupt, cross-mission, duplicate, missing or cyclic
  legacy edges.
- No destructive rollback to stale JSON after normalized writes begin.
- No claim that local SQLite provides distributed multi-host consistency.
- No new ADR, migration, default flip, provider call, paid canary, commit,
  push or publish without the corresponding owner gate.

## Recommended decisions

### A — One normalized dependency authority

Approve an additive normalized schema:

```sql
CREATE UNIQUE INDEX uq_work_items_mission_id_id
  ON work_items(mission_id, id);

CREATE TABLE mission_graph_authorities (
  mission_id TEXT PRIMARY KEY REFERENCES missions(id),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  authority_state TEXT NOT NULL
    CHECK(authority_state IN ('migration-pending','active','quarantined')),
  graph_revision INTEGER NOT NULL CHECK(graph_revision >= 1),
  graph_digest TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('new-v1','legacy-json-v1')),
  activated_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE work_item_dependencies (
  mission_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  dependency_item_id TEXT NOT NULL,
  admitted_revision INTEGER NOT NULL CHECK(admitted_revision >= 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY(mission_id, work_item_id, dependency_item_id),
  CHECK(work_item_id <> dependency_item_id),
  FOREIGN KEY(mission_id, work_item_id)
    REFERENCES work_items(mission_id, id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id, dependency_item_id)
    REFERENCES work_items(mission_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_wid_upstreams
  ON work_item_dependencies(mission_id, work_item_id, dependency_item_id);
CREATE INDEX idx_wid_dependants
  ON work_item_dependencies(mission_id, dependency_item_id, work_item_id);
```

For an `active` mission, `work_item_dependencies` is the only runtime graph
authority. `depends_on` may remain temporarily as immutable migration evidence,
but no query, claim, approval or `WorkItem` projection may consume it.

New mission/batch intake writes items, normalized edges, graph authority and
existing admission fences in one `IMMEDIATE` transaction. Edge sets are
immutable after item admission. Adding a new batch may add new items and their
outgoing edges; it may not alter an existing item's prerequisites.

The canonical sorted edge set participates in the existing work-item
definition digest. Final claim verifies the exact item's normalized edge-set
digest, admission fence and upstream statuses in the same transaction.

### B — Bounded incremental projection, authoritative final claim

Approve two durable derived surfaces:

1. `work_item_dependency_readiness`: per-item remaining/failed counts plus the
   exact graph/item revision from which they were derived;
2. `mission_dependency_reconcile_queue`: cursor-based jobs keyed by exact
   upstream item revision and outcome.

They are scheduler projections, not execution authority.

When an upstream item reaches `done`, `failed` or `blocked`, its status write
and one exact reconciliation job are committed atomically. A scheduler tick
processes an owner-configurable maximum number of indexed dependant edges. A
high-fanout job retains its last processed dependant key and resumes next tick.
Blocking a child enqueues that child's propagation job in the same
transaction. Unique `(mission, upstream, upstream_revision, outcome)` identity
and item-status CAS make replay idempotent.

The ready projection lets `queryDue(limit)` avoid scanning every pending item.
It may delay work if stale, but may never authorize it. Every approval park and
atomic claim performs the indexed normalized-edge `NOT EXISTS` check. A stale
false-positive projection therefore yields no claim and is durably queued for
repair; it cannot dispatch provider work.

Failure visibility is immediate even before the display projection catches up:
an item with any normalized upstream in `failed/blocked` is ineligible at the
final gate. Mission settlement waits until the bounded propagation queue for
that mission is drained, so it cannot report success while descendants remain
unreconciled.

### C — Atomic migration, activation and rollback

Approve this per-mission migration:

1. create additive tables and indexes; do not change runtime reads;
2. parse the legacy JSON exactly once under `IMMEDIATE`;
3. validate JSON shape, canonical IDs, duplicates, self edges, mission
   locality, missing edges and the complete graph with iterative Kahn
   topological validation;
4. insert normalized edges and readiness projections;
5. compare canonical graph and per-item definition digests with the persisted
   mission/items/admission fences;
6. write immutable migration evidence and atomically activate the mission;
7. only after activation may runtime consumers read normalized edges.

Any malformed, ambiguous or mismatched mission becomes `quarantined` with
typed evidence. It is neither auto-repaired nor dispatched. Pre-fence
non-terminal legacy work retains its existing HOLD behavior.

Shadow comparison is observation-only: before activation it may compare JSON
and normalized results, but neither side authorizes a provider call. There is
never a state where one surface claims from JSON and another claims from the
normalized table.

Rollback disables new Goal-v2 admission/dispatch and returns HOLD while
preserving normalized edges, migration evidence, queues and receipts. It never
re-enables stale JSON as execution authority and never deletes graph history.

### D — Contract, environment matrix and rollout

Approve one store-level dependency API consumed by all six current seams:

- approval candidate query;
- invalid-approval parking;
- approval-request parking;
- due-item query;
- registry-fenced claim;
- compatibility claim.

The compatibility claim remains test/migration-only after cutover; production
Goal-v2 requires the normal admission fence.

Cross-environment contract:

| Environment | Authority |
|---|---|
| Solo/local Linux, WSL, macOS, Windows | SQLite WAL + `IMMEDIATE`, with the existing single-engine lease |
| Multi-process same host | same DB, lease/fence/CAS; no process-local graph cache as authority |
| Multi-host enterprise | transactional graph-store adapter with server-side ordering/lease semantics |
| Unsupported storage adapter | Goal-v2 admission and unattended dispatch HOLD |

Rollout order:

1. schema, migration validator and invariant tests;
2. normalized write path and observation-only parity;
3. owner-reviewed activation gate;
4. migrate all six consumers together in one coherent cutover;
5. bounded readiness/failure queue and restart tests;
6. 1K/10K/100K deterministic graph tests with bounded-work assertions, not
   wall-clock-only assertions;
7. compiled provider-free restart/replay proof;
8. finite Fable verifier against written criteria;
9. separately approved real Goal-v2 canary;
10. separately approved default flip.

## Required post-approval acceptance criteria

1. No production `json_each(depends_on)` or JSON dependency authorization
   remains for an active mission.
2. All intake paths atomically persist one canonical edge set and reject
   changed replay.
3. Missing, foreign, duplicate, self and cyclic graphs leave no partial
   mission/item/edge state.
4. Query, approval and both claim paths consume the same normalized authority.
5. Final claim cannot be won with a stale readiness projection, graph digest,
   item revision, admission fence or engine lease.
6. Direct/transitive failure and approval deny propagate with bounded work,
   durable cursor and restart-stable reasons.
7. Independent ready items remain concurrent; one large mission cannot
   monopolize the scheduler's reconciliation budget.
8. Migration is idempotent, corrupt legacy graphs quarantine, and rollback
   never reauthorizes JSON.
9. No full-mission scan occurs in a no-change scheduler tick.
10. 1K/10K/100K graph proofs assert rows/edges processed per tick are at or
    below configured bounds.
11. Linux/WSL/macOS/Windows single-host behavior and the multi-host adapter
    refusal contract are tested.
12. Targeted hermetic tests, lint, `build:all`, compiled provider-free
    migration/restart proof and one finite Fable verdict pass before any live
    canary request.

## Rejected alternatives

### Keep JSON and add an expression index

SQLite cannot provide the required bidirectional mission-local edge authority,
foreign keys and dependant lookup from an opaque JSON array. It also leaves
runtime correctness tied to JSON parsing at every seam.

### Normalize but dual-read indefinitely

This makes delivery path-dependent and recreates the project's recurring
second-authority defect.

### Readiness counters as the final authority

Counters are useful scheduling projections, but drift could otherwise produce
unsafe dispatch. The exact normalized edge/status predicate remains the final
claim gate.

### Recursive CTE for the entire graph every tick

It moves the full scan into SQL without bounding work or giving fair progress
across missions.

### One transaction that expands an unlimited fanout

It is logically correct but violates bounded latency and tenant fairness.
Cursor-based edge chunks preserve correctness and scale.

## Exact owner response

Implementation authority can be granted with:

> Approve A, B, C and D for M4-108. This authorizes the new Goal-v2 normalized
> dependency authority ADR and provider-free implementation/proofs. Existing
> autonomous DB migration activation, live/paid canary, default flip,
> commit/push, publish and Desktop implementation remain separately gated.

Until that approval, MASTER-PLAN row 600 remains partial and no MissionStore
schema or runtime dependency authority changes.
