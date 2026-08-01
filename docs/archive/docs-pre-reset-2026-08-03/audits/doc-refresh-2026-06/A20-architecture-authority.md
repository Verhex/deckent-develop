---
doc_rank: 2
last_updated: 2026-06-28
status: reviewed
sprint: sprint-345
task: 345-020
---

# A20 — Architecture Authority & Stray ADRs Audit

**Audit scope:** `docs/architecture/agent-skill-architecture.md`,
`docs/architecture/agents.md`, `docs/architecture/authority-matrix.md`,
`docs/architecture/adr/010-single-runtime-dependency.md`,
`docs/architecture/adr/adr-090-ink-repl.md`

**Evidence method:** Direct source-code cross-reference against `src/nervous/authority-matrix.ts`,
`src/agents/worker.ts`, `src/core/agent-pool.ts`, `src/core/agent-selector.ts`,
`src/core/routing-engine.ts`, `src/core/routing-types.ts`,
`src/orchestra/promotion-pipeline.ts`, `src/orchestra/conflict-resolver.ts`,
`src/orchestra/task-builder.ts`, `.deckent/agents/`

**Verdict summary:** Two docs are accurate; `authority-matrix.md` has two actionable errors
and one role omission; both stray ADR files are misplaced — one is a clean duplicate, the
other is a mislabeled unique document.

---

## 1. `authority-matrix.md`

### 1a. SAFETY_FLOOR (§2)

> **Verdict: ACCURATE (minor line-number offset)**

The doc claims SAFETY_FLOOR is defined at `src/nervous/authority-matrix.ts:24-30` with 5
actions. Actual source:

```typescript
// src/nervous/authority-matrix.ts:25-31
export const SAFETY_FLOOR: ReadonlyArray<SafetyFloorAction> = Object.freeze([
  'KILL_LIVE_SPRINT',
  'MANUAL_FILE_DELETE',
  'COST_OVER_THRESHOLD',
  'DESTRUCTIVE_GIT',
  'ADR_DEPRECATE_ACCEPTED',
] as const);
```

All 5 actions match exactly. Line range is 25-31 (doc says 24-30) — 1-line offset, harmless.

### 1b. `ENFORCE_RBAC_CONFIG_KEY` (§2 Advisory Default note)

> **Verdict: MINOR LINE NUMBER DRIFT**

Doc says `:196`. Actual source: `export const ENFORCE_RBAC_CONFIG_KEY = 'enforce_rbac' as const;`
is at **line 197**. The constant name and value are correct.

### 1c. `ROLE_CAPABILITY_MAP` naming error (§6 Worker Role Taxonomy)

> **Verdict: NAMING ERROR — ACTION REQUIRED**

The doc says the role → capability map is `ROLE_CAPABILITY_MAP` at
`src/nervous/authority-matrix.ts:210-221`. The actual constant exported by the source is
**`WORKER_ROLE_CAPABILITY_MAP`** at line 213:

```typescript
// src/nervous/authority-matrix.ts:213
export const WORKER_ROLE_CAPABILITY_MAP: Readonly<Record<WorkerRole, ReadonlySet<Capability>>> = ...
```

Any code that imports `ROLE_CAPABILITY_MAP` by name will fail at runtime. The doc must be
corrected to `WORKER_ROLE_CAPABILITY_MAP`.

### 1d. Missing `operator` role in taxonomy table (§6)

> **Verdict: OMISSION ERROR — ACTION REQUIRED**

The §6 Worker Role Taxonomy table lists three roles:

| Role | Capabilities | Typical Use |
|---|---|---|
| `admin` | All capabilities | CI/CD, privileged ops |
| `engineer` | All except `erp-write`, `tenant-scope` | Standard dev |
| `viewer` | `fs-read`, `db-query`, `erp-read` only | Read-only |

The actual `WorkerRole` type in source defines **four roles**:
`'admin' | 'engineer' | 'operator' | 'viewer'`

The `operator` role is absent from the doc table. Its actual capability set is:
`fs-read, fs-write, network, db-query, erp-read, shell, mcp-tool` (7 capabilities — excludes
`db-write`, `erp-write`, `approval`, `provider-pin`, `gpu`, `tenant-scope`).

The doc comment at `:210-227` correctly describes the engineer and viewer caps but never
mentions `operator` at all. This is a complete omission that would confuse any developer
assigning roles.

### 1e. `isWithinScope` and `checkWorkerAuthority` in `worker.ts`

> **Verdict: ACCURATE**

- `isWithinScope(filePath, scope, projectRoot?)` at `src/agents/worker.ts:521` — symlink-aware
  via `realpathSync`, pure boolean, does not throw or block. Confirmed.
- `checkWorkerAuthority(...)` at `src/agents/worker.ts:566` — delegates to `checkAuthority`
  from `authority-enforcer.ts`, warns on violation, emits `AUTHORITY_VIOLATION` event, and
  `return true` in soft mode (hard-block only when `opts.enforceRbac === true`). Confirmed.
- Soft mode returns `true` even on violation (V1.0 design). Confirmed.

### 1f. ENT-1 authority check function signature (§6)

> **Verdict: ACCURATE**

`checkWorkerAuthority(request, matrix, opts)` in `src/nervous/authority-matrix.ts:316`:
- Returns `{ allowed: boolean, level: 'permit' | 'warn' | 'deny', ... }`. Confirmed.
- Missing/unknown actor role → allow-all permissive default. Confirmed (line 323-334).

### 1g. Scenario D — `detectScopeCollisions`

> **Verdict: ACCURATE**

`detectScopeCollisions()` at `src/orchestra/conflict-resolver.ts:173` — confirmed.
Invoked from `sprint-spawner.ts`. Plan-time collision detection works as described.

### 1h. Sprint evolution history table (§12)

> **Verdict: MINOR STALENESS**

The table says "current sprint: 286" in the note. Actual current sprint is `sprint-345`.
The table is historical and the note clarifies it, so this is low-priority. No correction
strictly needed, but the header note can be refreshed on next major revision.

### 1i. Link validity

All links in `authority-matrix.md` verified:

| Link | Target | Status |
|---|---|---|
| `../adr/037-brain-auditor-worker-authority-matrix-rbac-protocol-v1-0.md` | `docs/adr/037-…` | ✅ exists |
| `../adr/README.md` | `docs/adr/README.md` | ✅ exists |
| `sprint-lifecycle.md` | `docs/architecture/sprint-lifecycle.md` | ✅ exists |
| `architecture.md` | `docs/architecture/architecture.md` | ✅ exists |
| ADR-035, ADR-034, ADR-036, ADR-008 (via README) | `docs/adr/` | ✅ all exist |

---

## 2. `agent-skill-architecture.md`

### 2a. Built-in agent count and list

> **Verdict: ACCURATE**

Doc claims 15 built-in agents. Actual `.deckent/agents/` contains exactly 15 built-in agent
directories (plus `archive/` and 2 temp agents: `temp-react-specialist`,
`temp-react-ts-specialist`). All 15 agent names in the doc table match the on-disk directories.

### 2b. `AgentPoolManager` constants

> **Verdict: ACCURATE**

- `DEFAULT_MAX_TEMP_AGENTS = 50` at `src/core/agent-pool.ts:124`. Confirmed.
- `DEFAULT_MAX_AGENT_AGE = 5` at `src/core/agent-pool.ts:127`. Confirmed.
- `createDefaultStats()` imported from `agent-types.ts`. Confirmed.

### 2c. Skill budget constants

> **Verdict: ACCURATE**

`SKILL_BUDGET_BY_SIZE`, `SKILL_TOKEN_BUDGET_BY_EFFORT`, `DEFAULT_TOKEN_BUDGET_PER_SKILL`,
`DEFAULT_TOKEN_BUDGET_TOTAL` are all in `src/core/routing-types.ts:213–231`. Confirmed.
`LEARNING_BONUS_CAP` is in `src/core/routing-types.ts:211`. Confirmed.

### 2d. Promotion & Demotion criteria

> **Verdict: ACCURATE**

`src/orchestra/promotion-pipeline.ts:60-61`:

```typescript
const DEFAULT_PROMOTION: PromotionCriteria = { minTasks: 8, minSuccessRate: 0.85, minSprints: 3 };
const DEFAULT_DEMOTION: DemotionCriteria = { maxFailRate: 0.50, minTasks: 5, unusedSprints: 5 };
```

Exact match with the doc table.

### 2e. `AGENT_FALLBACK_CHAIN`

> **Verdict: ACCURATE**

`src/core/routing-engine.ts:48` — `AGENT_FALLBACK_CHAIN: Record<IntentType, string[]>`.
Examples from doc: `bugfix → [bug-fixer, refactorer]`, `documentation → [doc-writer]`,
`security → [security-auditor]`, `architecture → [architecture-planner, architect]`,
`unknown → [architect]`. All confirmed in source.

### 2f. `buildWorkerPrompt` in `task-builder.ts`

> **Verdict: ACCURATE**

`buildWorkerPrompt()` at `src/orchestra/task-builder.ts:1280`. Confirmed.

### 2g. Link validity

| Link | Status |
|---|---|
| `architecture.md` | ✅ exists |
| `agents.md` | ✅ exists |
| `../reference/agents.md` | ✅ exists at `docs/reference/agents.md` |
| `authority-matrix.md` | ✅ exists |

---

## 3. `agents.md`

### 3a. Agent count and list

> **Verdict: ACCURATE**

15 built-in agents table matches `.deckent/agents/` exactly. Confirmed.

### 3b. `src/core/agent-selector.ts` — `selectAgent()` and `SCORE_THRESHOLD`

> **Verdict: ACCURATE**

`SCORE_THRESHOLD = 3` at `src/core/agent-selector.ts:12`. Confirmed.
`selectAgent()` is the v1 keyword-based selector, still present alongside the v2 activation
engine (as documented). The v2 note correctly points to `agent-skill-architecture.md §3`.

### 3c. Link validity

| Link | Status |
|---|---|
| `../reference/agents.md` | ✅ exists |
| `agent-skill-architecture.md` | ✅ exists |

---

## 4. Stray Files — `docs/architecture/adr/`

The canonical ADR location is `docs/adr/` (established by ADR-036 governance). Two files
exist at `docs/architecture/adr/` and are out of place.

### 4a. `docs/architecture/adr/010-single-runtime-dependency.md`

> **Verdict: DUPLICATE — recommend redirect, then remove**

This file contains the complete text of ADR-010 including both Amendment 1 (Sprint 172)
and Amendment 2 (Sprint 281). The canonical copy lives at:

```
docs/adr/010-tek-runtime-dependency-commander-js.md
```

Content comparison: the stray file and the canonical file cover identical ADR-010 content.
The stray copy predates or duplicates the canonical and is not the SSOT.

**Recommendation:**
1. Add a redirect notice at the top of `docs/architecture/adr/010-single-runtime-dependency.md`
   pointing to the canonical `docs/adr/010-tek-runtime-dependency-commander-js.md`.
2. In the next doc-hygiene sprint, delete the stray file entirely (it carries zero unique
   content). Do NOT move — the canonical is already in the right place.
3. Do not merge — no unique content to preserve.

### 4b. `docs/architecture/adr/adr-090-ink-repl.md`

> **Verdict: MISLABELED UNIQUE DOCUMENT — recommend rename + relocate**

This file is titled **"ADR-090 (Ink): Ink ^7 + React ^19 as Runtime Dependencies for
Native REPL"**. However, the canonical ADR-090 at `docs/adr/090-doc-tracking.md` is
**"Documentation Tracking & Staleness"** — a completely different topic.

The stray file is NOT a duplicate. Its content covers:
- Design rationale for `ink ^7` + `react ^19` as runtime dependencies
- `createStreamSegmenter` / `fenceGuard` integration contract
- `createConfirmQueue` FIFO queue contract
- Consequences (footprint, TTY requirement, React version pin)

This content supplements ADR-081 (Native Agentic REPL) and ADR-083 (REPL UX), not ADR-090.
The ADR-090 label in the filename is incorrect and creates a conflict with the canonical
ADR-090 assignment.

**Recommendation:**
1. Rename the file from `adr-090-ink-repl.md` to something like `ink-repl-dependency-rationale.md`
   to remove the false ADR-090 label.
2. Move it out of `docs/architecture/adr/` (an ADR namespace it does not belong to) into
   `docs/architecture/` or `docs/reference/` as a design-rationale companion to ADR-081/083.
3. Alternatively, merge the integration contracts (stream-segmenter, confirm-queue) directly
   into the canonical ADR-081/083 files and drop this stray entirely.
4. Do NOT add a `docs/adr/` entry with the ADR-090 label — that slot is taken.

---

## 5. Action Items

| Priority | File | Item |
|---|---|---|
| HIGH | `authority-matrix.md §6` | Fix `ROLE_CAPABILITY_MAP` → `WORKER_ROLE_CAPABILITY_MAP` |
| HIGH | `authority-matrix.md §6` | Add missing `operator` role row to taxonomy table |
| MEDIUM | `docs/architecture/adr/010-single-runtime-dependency.md` | Add redirect notice; schedule deletion |
| MEDIUM | `docs/architecture/adr/adr-090-ink-repl.md` | Rename (drop ADR-090 label); relocate to `docs/architecture/` |
| LOW | `authority-matrix.md §2` | Fix line numbers: `:196` → `:197`, `:24-30` → `:25-31` |
| LOW | `authority-matrix.md §12` | Update sprint note from 286 → 345 |

---

## 6. Coverage Note

This audit did NOT edit or move any source file or doc. All findings are read-only observations
with recommendations for follow-up. The stray ADR files are flagged only — not moved or deleted
per task constraint.
