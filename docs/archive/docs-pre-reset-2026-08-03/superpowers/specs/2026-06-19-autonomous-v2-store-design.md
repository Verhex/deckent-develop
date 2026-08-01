# Autonomous v2 — Durable Mission Store + View Contract (Design Spec)

- **Date:** 2026-06-19
- **Status:** approved (brainstorm → spec)
- **Owner:** Alperen
- **Scope:** This spec designs the **persistence/store foundation** of autonomous v2 — the `MissionStore` (durable state), the **Mission/WorkItem model** (with UI-render metadata), and the **`MissionView` contract** (the canonical feedback/deliver surface all clients consume). The mission **scheduler/runtime**, Type-1/Type-2 execution semantics, provider-agnostic execution, and the actual dashboard/desktop/mobile **views** are **separate subsequent sub-projects** that build on this foundation.
- **Cross-ref:** memory `project_autonomous_engine_direction`, `project_autonomous_first_dogfood_grand_vision`, `project_community_pro_split_strategy` (MOD-SPLIT); ADR-040 (Nervous), ADR-068/069/071 (enterprise/autonomous), ADR-088 (Memory V2 DB-First — the SQLite-WAL precedent).

## Problem (verified)

The autonomous engine's state lives in a single JSON file, `.deckent/autonomous/backlog.json`. Every status change rewrites the **entire** file: `backlog.ts` `updateStatus` / `applyRecurringReenqueue` call `atomicWriteFileSync(path, JSON.stringify(bl, null, 2))` (full serialize + full rewrite, O(N) per write). This is structurally inadequate for autonomous v2:

- **Concurrency:** concurrent writers (parallel work items, concurrent missions) race on the whole-file write; there is no row-level claim — the dispatch-claim (`status='running'`) happens *inside* the async execute job, so two concurrent dispatchers can claim the same pending item (double-dispatch). This is the root cause of the engine being forced serial (`pool_size:1`, the pool unwired — AUT-7 incomplete).
- **Scale / query:** no indexed queries; "due items for tenant X" is a full-file scan + filter.
- **Durability:** atomic-file-rename is crash-safe per write but offers no transactions across multi-step state changes.
- **Multi-tenant / enterprise:** a flat JSON file has no tenant isolation, no pluggable backend.

## Vision this foundation must serve

- **Type-1 (ListMission):** "here are 20 items — plan and finish them." The engine decomposes/runs each as task or sprint as appropriate, to completion.
- **Type-2 (GoalMission):** "work until you complete X." The engine plans/finds/runs/checks whatever is needed, then **delivers the result to the user or an authorized party**.
- **Concurrent:** Type-1 and Type-2 missions run **simultaneously**, isolated from each other.
- **Native / provider-agnostic:** works regardless of the host AI tool it is installed into.
- **Solo → enterprise:** the same engine scales from a single-developer machine to a multi-tenant enterprise deployment.
- **Visual consistency:** user-facing feedback renders the *right* visual per kind (a sprint shows as a sprint, a workflow as a workflow, …) — identically across dashboard, and future desktop/mobile apps.

## Decision

A **pluggable `MissionStore` interface** with a **hybrid default implementation**:

- **Durable state → SQLite (WAL)** in a dedicated `.deckent/autonomous/autonomous.db` (isolated from `memory.db`, mirroring the `doc_tracking` separate-connection pattern). `better-sqlite3` (^12.10.0) is **already a direct dependency** — no new runtime dep (ADR-010 satisfied), and `memory.db` + `doc_tracking` already prove the SQLite-WAL pattern in this codebase.
- **Hot-path ephemeral events → `events.jsonl`** (append-only): high-frequency tick/heartbeat/progress/log events that would thrash SQLite; **reset on mission completion** (the "cleaned-as-it-runs / reset-when-done" structure).
- **Enterprise → swap the impl** (Postgres/Redis) behind the same `MissionStore` interface — code unchanged (MOD-SPLIT alignment).

**Why not pure SQLite (B):** every high-frequency hot-path event would hit synchronous SQLite — the jsonl offloads that. **Why not pure jsonl (C):** weak query/durability/concurrency, not enterprise-grade. The hybrid behind an interface gives perf (SQLite-fast updates + jsonl-fast appends), durability (WAL + crash-safe), row-level concurrency (atomic claim), and solo→enterprise (pluggable) in one design.

**Performance note (addressing the memory.db concern):** `better-sqlite3` is **synchronous + C-fast** — a single-row indexed `UPDATE`/`SELECT` is faster than a JSON full-file rewrite, and WAL gives concurrent readers + a durable single writer. The only "slowness" risk is unindexed/large scans, avoided here by small indexed mission/work-item rows and by routing all high-frequency events to the jsonl hot-path. The engine's hot path is **worker execution**, not store I/O.

## Architecture

```
┌ MissionStore ┐   ┌ MissionEngine ┐   ┌ MissionView (contract) ┐
│ persistence  │   │ scheduler/run │   │ typed projection +      │
│ SQLite(WAL)  │ ← │ (Type1/Type2) │ → │ event-stream + API      │
│  | PG | Redis│   │ atomic-claim  │   │                         │
└──────────────┘   └───────────────┘   └────────────┬────────────┘
       │ events.jsonl (hot-path, reset-on-complete)  │
                                          ┌──────────┼───────────┐
                                      dashboard   desktop      mobile
                                       (all consume the SAME MissionView contract)
```

The engine and all clients touch state **only** through the `MissionStore` interface and the `MissionView` contract — never `backlog.json` directly. Each boundary is an interface, so community/enterprise = impl swap, and desktop/mobile reuse `MissionView` without re-implementing engine/store.

This spec delivers three modules: **`mission-store`** (persistence), the **`MissionStore`/`MissionView` interfaces**, and the SQLite+jsonl default impl. The scheduler/runtime is a consumer designed in a later spec.

## Mission + WorkItem model

A **Mission** is a unit of requested work; a **WorkItem** is one executable step belonging to a mission. Both carry `render_as` view-metadata so any client renders the correct visual.

| Mission `kind` | meaning | `render_as` | client visual |
|---|---|---|---|
| `list` | Type-1: a finite list of items to finish | `checklist` | N-item progress |
| `goal` | Type-2: pursue a goal until done, then deliver | `goal` | goal-progress + acceptance |

| WorkItem `kind` | `render_as` | client visual |
|---|---|---|
| `task` | `task` | single-task card |
| `sprint` | `sprint` | existing sprint-lifecycle view (phases/workers) |
| `process` | `workflow` | DAG/step-flow view (F3-008 composer) |
| `capability` | `action` | connector-action view |

Both carry structured `progress` (`{done, total, phase?, step?}`) so all clients render consistent progress. Concurrent Type-1 + Type-2 = two distinct missions, each owning its work-items, scheduled in parallel, isolated.

## Schema (`autonomous.db`, SQLite WAL)

```sql
CREATE TABLE IF NOT EXISTS missions (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,                 -- 'list' | 'goal'
  status      TEXT NOT NULL,                 -- pending|active|completed|failed|cancelled
  tenant      TEXT NOT NULL DEFAULT 'local',
  title       TEXT NOT NULL,
  spec        TEXT,                          -- JSON: { goal?, acceptance?, listRef?, ... }
  created_by  TEXT,
  deliver_to  TEXT,                          -- result delivery target (user / authority)
  render_as   TEXT NOT NULL,                 -- 'checklist' | 'goal'
  progress    TEXT,                          -- JSON: { done, total, phase? }
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  completed_at TEXT,
  last_result TEXT                           -- JSON: { ok, reason, ... }
);

CREATE TABLE IF NOT EXISTS work_items (
  id          TEXT PRIMARY KEY,
  mission_id  TEXT NOT NULL REFERENCES missions(id),
  kind        TEXT NOT NULL,                 -- task|sprint|capability|process
  status      TEXT NOT NULL,                 -- pending|running|done|failed|parked
  spec        TEXT,                          -- JSON (description/directivesRef/capabilityTarget/...)
  policy      TEXT NOT NULL DEFAULT 'auto',  -- auto|approval-required|risk-tagged
  render_as   TEXT NOT NULL,                 -- task|sprint|workflow|action
  progress    TEXT,                          -- JSON
  depends_on  TEXT,                          -- JSON string[] (intra-mission ordering)
  trigger     TEXT,                          -- JSON: one-off | {recurring:cron} | {reactive}
  claimed_at  TEXT,
  claimed_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  last_result TEXT
);

CREATE INDEX IF NOT EXISTS idx_wi_mission_status ON work_items(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_wi_status        ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_m_status_tenant  ON missions(status, tenant);
```

Hot-path events live in **per-mission** files `.deckent/autonomous/events/<missionId>.jsonl`: append-only lines `{ts, workItemId?, type, data}`. Read the tail for live UI; **reset = `unlink` the mission's file** on completion (no rewrite → no full-file-rewrite bottleneck). Never the source of truth — purely ephemeral hot-path; loss-tolerant by design.

## `MissionStore` interface

```ts
interface MissionStore {
  // lifecycle
  migrate(): void;                                   // idempotent schema (CREATE IF NOT EXISTS)
  recover(): void;                                   // crash: running → pending (orphaned claims)

  // missions
  createMission(m: NewMission): Mission;
  getMission(id: string): Mission | null;
  listMissions(f?: { status?: MissionStatus[]; tenant?: string }): Mission[];
  updateMissionStatus(id: string, status: MissionStatus, result?: ResultLike): void;
  setMissionProgress(id: string, progress: Progress): void;

  // work items
  enqueueItem(item: NewWorkItem): WorkItem;          // dedupe by id
  queryDue(opts?: { tenant?: string; limit?: number }): WorkItem[];  // pending, dependency-satisfied
  claimItem(id: string, by: string): boolean;        // ATOMIC; true iff this caller won the claim
  updateItemStatus(id: string, status: ItemStatus, result?: ResultLike): void;
  listItems(missionId: string): WorkItem[];

  // hot-path ephemeral events
  appendEvent(missionId: string, ev: MissionEvent): void;
  readEvents(missionId: string, since?: number): MissionEvent[];
  resetEvents(missionId: string): void;              // on mission completion
}
```

**Atomic claim (the concurrency keystone):**
```sql
UPDATE work_items SET status='running', claimed_at=?, claimed_by=?, updated_at=?
WHERE id=? AND status='pending';
```
`claimItem` returns `db.prepare(...).run(...).changes === 1`. Exactly one concurrent caller wins; the rest get `false`. **This makes concurrent dispatch race-free at the store layer** — the scheduler can claim up to `pool_size` items in parallel with no double-dispatch, so AUT-7's hard part (a cycle-contract refactor) dissolves: the engine submits *claimed* work to a bounded pool.

## `MissionView` (feedback / deliver contract)

```ts
interface MissionViewProvider {
  projectMission(id: string): MissionView | null;    // typed projection clients render
  subscribe(f?: ViewFilter): AsyncIterable<MissionViewEvent>;  // live state stream (SSE/IPC)
}
// MissionView = { mission, items, progress, render_as, lastResult, deliverTo }
```

`MissionView` is the single canonical surface for user-facing feedback and result delivery. The dashboard consumes it today (mapping `render_as` → the existing sprint view / a workflow view / a task card / a goal-progress view); desktop and mobile apps consume the **same** contract later — visual consistency by construction. "Deliver result to user/authority" flows through `MissionView` (terminal state + `deliver_to`).

## Migration from `backlog.json`

One-time, on first v2 start: if `autonomous.db` has no missions and `backlog.json` exists, parse its entries and insert them as work-items under a default `legacy` mission (preserving id/kind/status/spec/policy/trigger). Thereafter `autonomous.db` is authoritative; `backlog.json` may be regenerated as a **read-only export** (the `memory.db ↔ .md` export pattern) for inspection/compat — never re-read as source of truth. Reversible: the export stays human-readable.

**Backward-compat for the 213 existing autonomous tests:** introduce a thin `backlog.ts`-compatible shim that maps the old `loadBacklog/updateStatus/queryDue` calls onto a `MissionStore` (default mission), OR migrate call-sites incrementally. The shim keeps the old API green while consumers move to `MissionStore`.

## Concurrency + durability

- **WAL mode** (`pragma journal_mode = WAL`) — concurrent readers + one durable writer; crash-safe.
- **Transactions** for multi-row state changes (e.g., enqueue a mission's items).
- **Atomic claim** (above) for race-free concurrent dispatch.
- **`recover()`** at startup resets orphaned `running` items (crash interrupted) back to `pending` (replacing today's `recoverBacklog`).
- `events.jsonl` writes are append-only (fast, no contention with SQLite); loss-tolerant by design (ephemeral).

## Modularity (solo → enterprise, dashboard → desktop/mobile)

- `MissionStore` is an **interface**; the SQLite+jsonl impl is the embedded/solo default; an enterprise impl (Postgres/Redis) swaps in behind it (config-selected). Community/enterprise = impl swap, same codebase (MOD-SPLIT).
- `MissionView` is the **client-facing contract**; dashboard/desktop/mobile are interchangeable consumers. No client re-implements engine/store.
- RBAC/tenant (ENT-1/2) thread through `tenant` on missions/items + the store filter — enterprise isolation rides the same schema.

## Testing (hermetic — tmpdir SQLite, no real state)

- **MissionStore CRUD** — create/get/list/update for missions + items, in a tmpdir `autonomous.db`.
- **Atomic claim concurrency** — fire N concurrent `claimItem(sameId)`; assert **exactly one** returns `true`, the rest `false`, and the row ends `running` (the race-free proof).
- **queryDue** — returns pending, dependency-satisfied items; respects tenant + limit.
- **recover** — seed `running` rows → `recover()` resets them to `pending`.
- **MissionView projection** — a mission + items → correct `MissionView` shape + `render_as` mapping.
- **events.jsonl** — append/read tail/reset-on-complete.
- **Migration** — a `backlog.json` fixture → `autonomous.db` import → entries present as a `legacy` mission's items.
- `tsc --noEmit` clean; existing autonomous suite (213) stays green via the compat shim.

## Out of scope (subsequent sub-projects, building on this foundation)

- **Mission scheduler/runtime** — concurrent Type-1/Type-2 mission execution loop on top of `MissionStore` (the bounded-pool dispatch with atomic-claim; subsumes AUT-7).
- **Type-2 goal semantics** — "work until done" goal-pursuit + acceptance/Brain-eval of "complete" + deliver-to-authority flow.
- **Provider-agnostic execution** — native across host AI tools.
- **Dashboard sprint/workflow/goal/checklist views + desktop/mobile apps** — clients of `MissionView`.
- **Enterprise store impls** (Postgres/Redis) behind `MissionStore`.

Each of these gets its own spec → plan → implementation cycle.
