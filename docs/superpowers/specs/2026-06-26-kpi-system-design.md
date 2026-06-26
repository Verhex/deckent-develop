# Customizable KPI System — Design Spec

- **Date:** 2026-06-26
- **Status:** Design approved (Alperen) — ready for implementation planning
- **Author:** Brain (brainstorm session)
- **Dual-lens (Law #1):** deckent dogfood orchestration-quality **and** end-user product (solo → enterprise, millions of users/projects)
- **Guiding steer:** "kullandıkça + feedback'le gelişir" — the catalog and definitions evolve feedback-driven; the schema leaves growth paths open (threshold → SLO, manual → auto-suggested KPIs). Not a frozen, one-shot system.

## 1. Motivation

deckent emits rich raw signals (tokens, cost, sprint/task results, retries) but has **no semantic KPI layer**: no customizable metric definitions, no per-tenant rollups, no targets/thresholds/alerting, no historical trend store. This spec adds a first-class, customizable KPI system serving both audiences at once.

Reference example KPIs (user-provided), all directional:

| KPI | Target |
|---|:--:|
| Cost / Sprint | ↓ |
| Token / Completed Task | ↓ |
| Output / Accepted PR | ↓ |
| Cache Hit Rate | ↑ |
| Avg Tool Call | ↓ |
| Avg Retry | ↓ |
| Avg Worker Cycle | ↓ |
| Cost / Bug Fixed | ↓ |
| Cost / ADR | ↓ |
| Cost / KLoC | ↓ |

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| KPI definition model | **Formula DSL over a base-measure catalog** | Cube-style derived measures; code-free self-serve; scales solo→enterprise |
| Targets & alerting | **Direction + target + threshold + trend alert** (wired to nervous/notify) | Balanced for dogfood + product; grows to SLO later |
| Surfaces (v1 scope) | **All four:** CLI+retro, dashboard, API+MCP, Telegram | Full coverage requested |
| Multi-tenancy | **Full multi-tenant from v1** | Enterprise-grade, Law #2 (million-scale, multi-tenant from the start) |
| Compute/storage architecture | **C — Hybrid:** rollup backbone + live-tail for active sprint | Historical trend + fresh live value; single formula-evaluator (SSOT) avoids drift |

## 3. Grounding (external references)

- **Cube semantic layer** (`/cube-js/cube`): KPI = *derived measure* — `sql: "1.0 * {paying_count} / {count}", type: number, format: percent`. Performance via **pre-aggregations (rollups)**. Multi-tenancy via **security context** (`preAggregationsSchema: ({securityContext}) => pre_aggregations_${userId}`, `queryRewrite` for per-tenant filters). We adopt the *model*, not the runtime (deckent stays local-first, network-zero, SQLite-embedded).
- **OpenTelemetry metrics data model** (`/open-telemetry/opentelemetry-specification`): base measures are typed instruments — Counter (monotonic sum), UpDownCounter, Gauge, Histogram (count/sum/min/max/buckets) — each with name, kind, `unit`, `description`. deckent's `observability.ts:137 metric()` is the untyped precursor; we formalize it.

**Fusion:** OTel-typed base-measure catalog + Cube-style derived-KPI formulas + per-tenant rollups.

## 4. Architecture — 4 layers + tenant spine

```
COLLECTION   observability.ts → typed Measurement API (OTel kind+unit)
             emitters: sprint-controller, result-collector, worker,
             limit-ledger (cost/token) + NEW: tool_calls, pr/adr/bug linkage
             each measurement: {measure_id, value, kind, unit,
                                tenant_id, sprint_id, task_id, ts, tags}
   ▼
STORE+ROLLUP memory.db (SQLite, SSOT)
             kpi_measurements (raw) → kpi_rollups (per-tenant/period agg)
             rollup-engine: at sprint-finalize + periodic (incremental, idempotent)
   ▼
KPI ENGINE   measure-catalog (base) + kpi-definitions (derived)
             formula-evaluator (SSOT — feeds BOTH live and rollup paths)
             → value + direction(↑/↓) + target + threshold + status
             ├─ live path : active sprint, compute from raw
             └─ trend path: historical, read kpi_results snapshots
   ▼
SURFACES     CLI deckent kpi · retro · dashboard · /api/kpi · MCP · Telegram

TENANT SPINE tenant_id flows through every measurement, rollup row,
             query (auto-injected security-context filter), and definition scope.
```

**New modules (`src/core/kpi/`):** `measure-catalog.ts`, `kpi-definitions.ts`, `formula-evaluator.ts`, `kpi-store.ts`, `rollup-engine.ts`, `kpi-service.ts` (facade), `alerting.ts`.

**Wiring into existing code:** `observability.ts:137` (extend metric API), sprint-finalizer (rollup trigger, beside `sprint-metrics.ts:89 calculateMetrics`), `dashboard/analytics`, `api/server.ts`, `mcp/tools/`, `sprint-retro-writer.ts`, `connectors/` (Telegram).

**Design principle:** a single `formula-evaluator` feeds both live and rollup paths → eliminates hybrid drift (single SSOT).

## 5. Base-measure catalog (OTel-typed) + reality check

Base measure = typed instrument (counter/gauge/histogram + unit). The 10 example KPIs mapped to base measures and raw-data availability:

| KPI | Formula | Target | Raw data |
|---|---|:--:|---|
| Cost / Sprint | `cost_usd / sprint_count` | ↓ | ✅ limit-ledger + sprint-metrics |
| Token / Completed Task | `tokens_total / tasks_done` | ↓ | ✅ tokenUsage + eval |
| Cache Hit Rate | `cache_read / (cache_read + tokens_input)` | ↑ | ✅ limit-ledger |
| Avg Retry | `retries / tasks_total` | ↓ | ✅ feedbackLoop (task-types.ts:457) |
| Cost / KLoC | `cost_usd / (lines_added / 1000)` | ↓ | ✅ TaskResult.linesAdded |
| Avg Worker Cycle | `worker_cycles / tasks_total` | ↓ | ◑ aggregation of feedbackLoop attempts |
| Cost / ADR | `cost_usd / adr_created` | ↓ | ◑ derive from memory.db `type='adr'` + sprint |
| Cost / Bug Fixed | `cost_usd / bugs_fixed` | ↓ | ◑ ADR-053 TaskType=bug + DONE linkage |
| Avg Tool Call | `tool_calls / tasks_done` | ↓ | ❌ NEW: worker tool-call counter |
| Output / Accepted PR | `output_tokens / prs_accepted` | ↓ | ❌ NEW: git/PR linkage |

**8/10 available** (4 immediate, 4 light aggregation/derivation); **2 need new emitters** → scheduled to Phase 2.

**Aggregation semantics (kind → period agg):** counter→sum · gauge→last|avg (per-measure default) · histogram→count/sum/min/max/p95. KPI formulas operate on the period aggregates.

## 6. KPI definition schema (DSL) + 3-tier catalog

KPI = Cube-style derived measure, i18n-first title, sandboxed formula:

```jsonc
{
  "id": "cost_per_sprint",
  "title": { "en": "Cost / Sprint", "tr": "Sprint Başına Maliyet" },  // getMessage pattern
  "formula": "cost_usd / sprint_count",   // ONLY catalog measure-ids + arithmetic
  "unit": "USD",
  "format": "currency",                    // currency|percent|number|duration|ratio
  "direction": "down",                     // down = ↓ better ; up = ↑ better
  "target": 2.5,                           // optional target value
  "threshold": { "warn": 3.0, "critical": 3.5 },  // alert bands (cost-config sprint_max_usd=3.5 seed)
  "grain": "sprint",                       // sprint|day|task|tenant
  "tier": "universal",                     // universal|dogfood|custom
  "scope": "global",                       // global | <tenant_id>
  "enabled": true
}
```

**formula-evaluator (security-critical):** NO SQL/code — a tiny arithmetic DSL. Whitelist = catalog measure-ids + `+ - * /` + functions `ratio() rate() pct() avg() p95()`. Parse → AST → evaluate. Unknown symbol or side-effect → reject. Removes arbitrary-code risk in multi-tenant (sandboxed analog of Cube's `{a}/{b}`).

**3-tier catalog:**

| Tier | Audience | Examples |
|---|---|---|
| **universal** | every user (solo→enterprise) | cost/sprint, token/task, cache-hit, cost/KLoC, avg-retry, avg-tool-call |
| **dogfood** | deckent internal orchestration | no-go-rate, boundary-violations, agent-success-rate, self-healing-rate, ADR/sprint, fix-rotation, honesty-check pass% |
| **custom** | user-defined | `.deckent/config.json → kpi_definitions[]`, zod-validated, per-tenant scope |

**Config layering:** built-in catalog (code) → global (`~/.deckent`) → project (`.deckent/config.json`) → tenant (memory.db tenant-scoped). Reuse `deepMerge` + zod (`config.ts:286 NERVOUS_SYSTEM_SCHEMA` pattern).

## 7. Compute engine + store + rollup + live path

**SQLite schema (memory.db):**

```sql
kpi_measurements(                     -- raw event stream (append-only)
  id, tenant_id, measure_id, value REAL, kind, unit,
  sprint_id, task_id, ts, tags JSON )
  INDEX (tenant_id, measure_id, ts)

kpi_rollups(                          -- per-tenant/period aggregate (Cube pre-agg analog)
  tenant_id, measure_id, grain, period_key,
  agg_count, agg_sum, agg_min, agg_max, agg_last, updated_at )
  PK (tenant_id, measure_id, grain, period_key)

kpi_results(                          -- computed KPI snapshot (fast trend; idempotent upsert)
  tenant_id, kpi_id, grain, period_key,
  value, target, status, computed_at )
  PK (tenant_id, kpi_id, grain, period_key)
```

**rollup-engine:** triggered at sprint-finalize (RETRO phase, beside `calculateMetrics`) + daily periodic. Reads new `kpi_measurements` since a watermark → incremental fold into `kpi_rollups` (idempotent upsert) → formula-evaluator over rollup aggregates → `kpi_results`. Re-runnable.

**live path (`kpi-service.computeLive`):** for the active sprint, read not-yet-rolled-up raw measurements + rollup tail → **same formula-evaluator** → fresh value. Dashboard "current sprint" card uses live; trend uses `kpi_results`. Single evaluator = no drift.

## 8. Targets / thresholds / alerting

- **Status:** value vs threshold, **direction-aware** — for ↓ KPI `value > warn` is breach; for ↑ KPI `value < warn` is breach → `ok | warn | critical`.
- **Trend-vs-target:** slope over last N periods; regression detection (moving away from target).
- **Alerting (`alerting.ts`):** after rollup, breach/regression → new `kpi_threshold` detector in the **nervous** system (ADR-040 pattern) → **notify** backbone (Telegram/dashboard). **Non-blocking advisory** (deckent philosophy: warn/emit, never block). `cost-config.sprint_max_usd=3.5` seeds the cost/sprint threshold.
- **SLO growth path:** schema reserves `target` + (future) `budget` field → thresholds now, error-budget later.

## 9. Multi-tenancy (v1)

| Dimension | Design | Existing basis |
|---|---|---|
| Security-context | every query carries `KpiSecurityContext{tenant_id, role}`; store auto-injects `WHERE tenant_id=?` — leak-impossible (Cube `queryRewrite` analog) | memory-store.ts:685 `tenant_id=? OR IS NULL` |
| Rollup isolation | `tenant_id` in `kpi_rollups`/`kpi_results` PK; per-tenant fold | single-table+column (SQLite-friendly; lighter than Cube per-schema) |
| Definition scope | custom KPIs tenant-scoped; universal/dogfood `tenant_id IS NULL` (shared) | memory.db `tenant_id` |
| RBAC | `kpi:read / kpi:write / kpi:admin` → PERMISSION_MATRIX | core/rbac.ts + `/api/enterprise/*` |
| SLA | SLA = special KPI class (target + breach-duration tracking) → `/api/enterprise/sla` | enterprise-endpoint pattern |
| Billing | cost base-measure carries tenant_id → per-tenant cost rollup = billing basis → `/api/enterprise/billing` | limit-ledger + cost-calculator |
| Scale | rollup = per-tenant per-period row → O(periods) query at million-tenant, no scan | index (tenant_id, measure_id, period_key) |

## 10. Surfaces (i18n-first; all labels via getMessage en/tr; mechanism modules string-free)

| Surface | Design | Basis |
|---|---|---|
| CLI `deckent kpi` | value/target/status/trend-arrow list; `--tier --tenant --since/--until --json` | `mcp/tools/usage.ts` pattern |
| Retro | adds "KPI Scorecard" section (value, Δ-prev, status) | `sprint-retro-writer.ts` + `buildTokenUsageSection:40` |
| Dashboard | KPI card (value, sparkline trend, target line, status color) + trend page; lucide icons, **no emoji** | `dashboard/analytics` + AnalyticsPage |
| API | `/api/kpi/definitions`, `/api/kpi/values`, `/api/kpi/trend`, `/api/enterprise/{sla,billing}` — RBAC-gated | `api/server.ts` + enterprise-endpoint |
| MCP `deckent_kpi` | agent reads its own KPIs → self-optimization (nervous proposes config from KPI) | mcp tool pattern |
| Telegram | sprint-end KPI summary + threshold-breach advisory | notify/nervous-accept inline-button backbone |

## 11. Error handling (no silent debt)

- Formula error (unknown measure / **division-by-zero**, e.g. 0 completed tasks) → value `null`, status `n/a`, UI "—"; no crash; logged via `structuredLog`.
- Phase-2 measure not yet emitted → KPI `pending-instrumentation` (explicit, not an error).
- Rollup idempotent; watermark corruption → full-recompute fallback.
- Query without security-context → **fail-closed reject** (tenant leak impossible).
- Custom KPI def zod-invalid → reject with reason (no silent drop).

## 12. Testing (incl. proof-of-function, ADR-079)

- **Unit:** formula-evaluator (whitelist, sandbox-escape attempts, div-by-zero, operator precedence); rollup fold idempotency; **tenant-filter leak test** (tenant A query never returns tenant B rows).
- **Integration:** emit→store→rollup→KPI end-to-end; **live-vs-rollup parity** (same formula → same value).
- **Tier-1 smoke (real-binary):** `deckent kpi --json` returns real computed values; `/api/kpi/values` → 200 with real data (not mock); hermetic (tmpdir).

## 13. Rollout phases + feedback-driven evolution

- **Phase 1 (dogfood, available-data) — ✅ IMPLEMENTED (Sprint 330):**
  collection API (typed Measurement, derives 8 base measures from sprint/task data) +
  KpiStore (better-sqlite3: `kpi_measurements`, `kpi_rollups`, `kpi_results`, tenant-filtered) +
  rollup-engine (sprint-finalizer hook, incremental+idempotent) +
  sandboxed formula-evaluator (SSOT — whitelist DSL, div-by-zero→null, multi-tenant safe) +
  8/10 available KPIs (4 universal: cost/sprint, token/task, cache-hit, cost/KLoC;
  4 dogfood: avg-retry, no-go-rate, avg-worker-cycle, cost/ADR-proxy) +
  `deckent kpi` CLI (`--tier --tenant --since/--until --json`) +
  retro "KPI Scorecard" section (value, Δ-prev, status) +
  single-tenant baseline (tenant_id column present; multi-tenant RBAC deferred to Phase 3).
  *deckent dogfoods its own KPIs starting this sprint.*

- **Phase 2 (instrumentation) — 🔜 OPEN follow-up:**
  `tool_calls` counter emitter → Avg Tool Call KPI unlocked;
  PR/ADR/bug linkage emitters (`git` + memory.db type=adr + TaskType=bug DONE) → Output/Accepted PR + Cost/Bug Fixed unlocked;
  dashboard KPI card (value, sparkline, target line, status color) + trend page;
  `/api/kpi/definitions`, `/api/kpi/values`, `/api/kpi/trend` REST endpoints (RBAC-gated);
  `deckent_kpi` MCP tool (agent self-reads own KPIs → self-optimization);
  Telegram sprint-end KPI summary + threshold-breach advisory.

- **Phase 3 (enterprise) — 🔜 OPEN follow-up:**
  Full multi-tenant (security-context `KpiSecurityContext{tenant_id,role}`, RBAC `kpi:read/write/admin`,
  per-tenant rollup isolation, cross-tenant leak test at million-tenant scale);
  custom-KPI self-serve (config + dashboard editor, zod-validated, per-tenant scope);
  SLA as special KPI class (target + breach-duration tracking, `/api/enterprise/sla`);
  per-tenant cost rollup → billing basis (`/api/enterprise/billing`);
  SLO/error-budget (extend threshold to budget-burn; schema field already reserved).

- **Continuous:** retro's existing "config suggestions" mechanism **suggests KPIs** (chronically-breached target, signal-bearing new KPI) → user accept/reject (nervous pattern). This is the engine of "evolves with use + feedback."

## 14. Open questions / future

- **SLO / error-budget** (Phase 3+): extend threshold to budget-burn; schema field reserved.
- **Anomaly detection** (Phase 3+): baseline-deviation alerting beyond static thresholds.
- **KPI auto-suggestion** (continuous): self-learning proposes new KPIs from sprint history.
- **Per-measure aggregation override:** confirm whether gauge default should be `last` or `avg` per measure during implementation.

## 15. Existing-code anchors (for implementation planning)

- `src/core/observability.ts:137` — `metric()` to extend into typed Measurement API
- `src/core/cost-calculator.ts:271` — `estimateSprintCost`; `src/core/limit-ledger.ts` — `UsageRecord` (cost/token ground truth); `limit-ledger-report.ts` — `summarizeSprint`
- `src/core/task-types.ts:457` — `feedbackLoop` (retries/attempts); `:460` — `tokenUsage`
- `src/orchestra/sprint-metrics.ts:89` — `calculateMetrics`; `:40` — `buildTokenUsageSection`
- `src/core/config.ts:286` — `NERVOUS_SYSTEM_SCHEMA` (zod + 3-layer merge pattern)
- `src/core/memory-store.ts:685` — tenant filter (`tenant_id=? OR IS NULL`)
- `src/core/rbac.ts` — `PERMISSION_MATRIX`; `src/api/enterprise-endpoint.ts` — enterprise endpoints
- `src/dashboard/analytics/analytics-data.ts` — dashboard data layer; `src/orchestra/sprint-retro-writer.ts` — retro
- ADRs: **ADR-040** (nervous), **ADR-053** (TaskType taxonomy), **ADR-079** (proof-of-function DoD)
