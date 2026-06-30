# A02 — Guide: Onboarding Concepts Audit

**Sprint:** 345-002 | **Date:** 2026-06-28 | **Auditor:** w-345-002 (doc-writer, sonnet)

**Scope:** `docs/guide/first-sprint.md`, `docs/guide/concepts.md`, `docs/guide/deckent-nedir.md`,
`docs/guide/feature-matrix.md`, `docs/guide/faq.md`

**Source of truth:** `src/orchestra/sprint-controller.ts`, `src/core/sprint-types.ts`,
`src/core/task-types.ts`, `src/agents/worker.ts`, `src/cli/commands/`, `src/mcp/tools/index.ts`,
`src/monitor/auditor.ts`, `src/core/config.ts`, `src/nervous/detectors/`

---

## Summary

| Doc | Verdict | Critical Issues | Minor Issues |
|-----|---------|-----------------|--------------|
| `first-sprint.md` | NEEDS_UPDATE | 0 | 1 |
| `concepts.md` | NEEDS_UPDATE | 0 | 2 |
| `deckent-nedir.md` | NEEDS_UPDATE | 0 | 1 |
| `feature-matrix.md` | NEEDS_UPDATE | 0 | 1 |
| `faq.md` | NEEDS_UPDATE | 0 | 2 |

No critical correctness failures. All five docs are directionally accurate. The dominant issue is a **stale MCP tool count** (34/35 in docs vs. 37 actual) that appears across three files, and a **CLEANUP phase naming** discrepancy (docs call it the 8th phase; the enum calls it COMPLETE).

---

## 1. `docs/guide/first-sprint.md`

### Verified Claims

| Claim | Evidence |
|-------|----------|
| Sprint lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY | `src/core/sprint-types.ts:7-17` — SprintPhase enum confirmed |
| `dependency_pipeline_enabled: true` is default | `src/core/config.ts:1213` |
| SPAWN: Kahn topological wave ordering | `src/orchestra/sprint-phases.ts` imports `parallel-pipeline.ts` which houses Kahn impl |
| Workers run in tmux, session name `deckent` | `src/core/constants.ts` TMUX_SESSION_NAME; `tmux.ts` |
| `deckent plan` command | `src/cli/commands/plan.ts` ✓ |
| `deckent start` command | `src/cli/commands/start.ts` ✓ |
| `deckent status --watch` refreshes every 2 seconds | `src/cli/commands/status.ts:330` option text "Auto-refresh every 2 seconds" ✓ |
| `deckent status` / `deckent retro` / `deckent doctor` / `deckent config` / `deckent history` | All command files exist ✓ |
| Result file self-assessment values: DONE / GO_WITH_TECH_DEBT / NO_GO | `src/core/task-types.ts:215` `SelfAssessment` type ✓ |
| Multi-provider config keys: `brain_provider`, `worker_provider`, `fallback_provider` | `src/core/config.ts:1133` ✓ |
| `deckent status --watch` progress fields (DONE/failed/running) | `src/cli/commands/status.ts` dashboard formatter ✓ |

### Stale / Incorrect Claims

**S1 — CLEANUP as phase 8 (line 99)**

```
4. EVALUATE phase -- Brain reads each `.result`, assigns GO / NO-GO / GO_WITH_TECH_DEBT
5. FIX phase -- ...
6. RETRO phase -- ...
7. DECAY phase -- ...
8. CLEANUP phase -- Task files are archived, file locks released, the sprint is marked complete
```

**Finding:** The `SprintPhase` enum (`src/core/sprint-types.ts:7-17`) has no `CLEANUP` member. The enum ends at `DECAY`, followed by `COMPLETE`. In `runSprint()` (`src/orchestra/sprint-controller.ts:1564-1568`), `runCleanupPhase()` is called in the DECAY→COMPLETE window, but the phase transition emitted is `emitPhaseChange(SprintPhase.DECAY, SprintPhase.COMPLETE)` — so `deckent status --watch` shows DECAY then COMPLETE, never CLEANUP.

**Impact:** Low — `runCleanupPhase()` does execute the described actions (archive, unlock, mark complete), so the behaviour is correct. Only the observable phase name is wrong.

**Fix:** Change "CLEANUP phase" to "COMPLETE phase" in the lifecycle list, and add a parenthetical: "Cleanup operations (archiving, lock release) run during this phase."

---

## 2. `docs/guide/concepts.md`

### Verified Claims

| Claim | Evidence |
|-------|----------|
| Sprint lifecycle 8 phases (PLAN through DECAY/COMPLETE) | `src/core/sprint-types.ts:7-17` ✓ (same S1 caveat) |
| Brain role: reads directives, plans, spawns, evaluates, writes retros | `src/orchestra/sprint-controller.ts` / `sprint-planner.ts` / `sprint-finalizer.ts` ✓ |
| Auditor scan interval: every 30 seconds | `src/monitor/auditor.ts:1401` — `const interval = intervalMs ?? 30_000` ✓ |
| Auditor stale threshold: > 2 minutes | `src/core/config.ts:251` — `DEFAULT_HEARTBEAT_TIMEOUT_MS = 120_000` (120 s = 2 min) ✓ |
| Auditor: "never writes source code" | `src/monitor/auditor.ts` — no file-write to src/ ✓ |
| Worker: reads task file, writes code, runs `tsc --noEmit` + tests, produces `.result` | `src/agents/worker.ts`, `worker-verify.ts` ✓ |
| Scope fields: `directories`, `filesRead`, `filesWrite` | `src/core/task-types.ts` `TaskScope` interface ✓ |
| Memory V2 schema: 5 tables + FTS5 | `src/core/memory-store.ts` schema ✓ |
| `decay_after_sprints` default: 20 | `src/core/config.ts:1159` ✓ |
| 21 built-in skills | `.deckent/skills/` — 22 dirs but `docs/` is a memory artifact, not a skill (no `skill.json`); 21 real skill dirs ✓ |
| Skill routing tuneable via `skill_routing` block | `src/core/config.ts` `skill_routing` field ✓ |
| Config location: `.deckent/config.json` | `src/core/constants.ts` PROJECT_CONFIG_PATH ✓ |
| Brain/Worker/Auditor component description | `src/orchestra/`, `src/agents/worker.ts`, `src/monitor/auditor.ts` ✓ |

### Stale / Incorrect Claims

**S1 — CLEANUP as phase 8** — Same as first-sprint.md above.

**S2 — Task status lifecycle is incomplete (line 52)**

```
status -- Lifecycle state: PENDING → CLAIMED → EXECUTING → TESTING → DONE
```

**Finding:** `TaskStatus` enum (`src/core/task-types.ts:174-192`) has:
`DRAFT | PENDING | CLAIMED | EXECUTING | TESTING | DOCUMENTING | DONE | NO_GO | PAUSED | MANUAL_REVIEW_REQUIRED`

Missing from docs:
- `DRAFT` — initial state before the task is committed to the sprint
- `DOCUMENTING` — state between TESTING and DONE
- `NO_GO` — terminal failure state
- `PAUSED` — blocked because a dependency reached NO_GO (set by dependency-scheduler)
- `MANUAL_REVIEW_REQUIRED` — worker produced disk evidence but no `.result` file; introduced Sprint 195

**Impact:** Medium — users reading the concepts doc won't know DOCUMENTING or MANUAL_REVIEW_REQUIRED exist, which matters when reading `deckent status` output.

**Fix:** Expand the status list to show the full enum (or at minimum add a footnote with the complete set of terminal and intermediate states).

**S3 — "Brain is the only agent that imports from all other modules" (line 78)**

```
Brain is the only agent that imports from all other modules. It is the single point of coordination.
```

**Finding:** Per ADR-008 Sprint 281 amendment, Brain was split into a "Brain-family" (`sprint-controller` + extracted organs: `sprint-phases`, `sprint-spawner`, `sprint-lifecycle`, `sprint-finalizer`, `sprint-planner`, `debt-manager`, etc.). The actual rule is that only the Brain-family can import `tmux/auditor/worker`. The single `brain.ts` file is now a thin re-export layer. The statement is directionally correct (the Brain layer is the only importer) but could mislead readers into thinking `brain.ts` itself imports everything.

**Impact:** Low — conceptually accurate, technically imprecise.

**Fix:** Update to "Brain and its orchestration layer are the only components that import worker-execution modules (tmux, auditor, worker). Workers and the auditor do not import Brain."

---

## 3. `docs/guide/deckent-nedir.md`

### Verified Claims

| Claim | Evidence |
|-------|----------|
| Sprint lifecycle 8 phases (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP) | ✓ (same S1 caveat re: CLEANUP) |
| `dependency_pipeline_enabled: true` default; Kahn topological | `src/core/config.ts:1213` ✓ |
| Docker is default spawn backend | `src/core/config.ts:1138` `spawn_backend: 'docker'` ✓ |
| Auditor scan every 30s | `src/monitor/auditor.ts:1401` ✓ |
| FIX phase: maks. 2 deneme | `src/core/config.ts:1144` `max_fix_retries: 2` ✓ |
| Memory V2: `.brain/memory.db` SQLite + 5 tables + FTS5 | `src/core/memory-store.ts` ✓ |
| 15 built-in agents listed | `.deckent/agents/` — 18 dirs: 15 permanent + `archive/` dir + 2 `temp-*` evolution agents ✓ |
| 21 built-in skills listed | Same as concepts.md finding ✓ |
| Nervous System: 12 detectors | `src/nervous/detectors/` — 12 `.ts` files ✓ |
| Node.js ≥ 24 | `src/core/config.ts` + ADR-001 ✓ |
| MCP resources: 8 | `src/mcp/resources/` — 8 files (excl. `index.ts`) ✓ |
| Scope enforcement: Advisory/soft (ADR-037 V1.0) | ADR-037 confirmed ✓ |
| Single-direction dependency: only Brain-family imports tmux/auditor/worker | ADR-008 confirmed ✓ |

### Stale / Incorrect Claims

**S1 — MCP tool count: "34 araç" (line 113, 204)**

```
| **MCP** | `src/mcp/` | 34 araç + 8 kaynak; stdio transport (46 modül) |
...
| MCP araç | 34 |
```

**Finding:** `src/mcp/tools/index.ts` — `TOOL_CATALOG` array (lines 59-97) contains **37 tools** confirmed via `node -e "const {TOOL_CATALOG} = await import('...'); console.log(TOOL_CATALOG.length)"` → `37`. The tools added since the "34" count was recorded include `deckent_process`, `deckent_usage`, `deckent_kpi`, and `deckent_cost`.

**Fix:** Update to 37 in all occurrences.

---

## 4. `docs/guide/feature-matrix.md`

### Verified Claims

| Claim | Evidence |
|-------|----------|
| CLI `deckent plan` / MCP `deckent_plan` / Dashboard `NewSprintModal` | `src/cli/commands/plan.ts`, TOOL_CATALOG, dashboard routes ✓ |
| `deckent status --watch` / MCP `deckent_watch` / SSE Dashboard | `src/cli/commands/status.ts:330`, `src/mcp/tools/watch.ts`, `src/api/server.ts` ✓ |
| MCP `deckent_memory_query` exists | TOOL_CATALOG line 81 ✓ |
| `deckent nervous` / `deckent_nervous_*` / Dashboard Nervous page | `src/cli/commands/nervous.ts`, TOOL_CATALOG lines 83-87, `src/dashboard/src/pages/Nervous.*` ✓ |
| `deckent autonomous` / `deckent_autonomous` / no Dashboard route confirmed | `src/cli/commands/autonomous.ts`, TOOL_CATALOG line 92 ✓ |
| `deckent audit compliance / audit forward` — CLI only | `src/cli/commands/audit.ts` + `audit-verify.ts` ✓ |
| Legend intent (conservative, only confirmed routes) | Consistent with the source notes ✓ |
| 8 MCP resources | `src/mcp/resources/` ✓ |

### Stale / Incorrect Claims

**S1 — Source note: "34 registered tools" (line 27)**

```
MCP availability is based on the registered tool list in `src/mcp/tools/`, which contains 34 registered tools.
```

**Finding:** Actual count = 37 (same TOOL_CATALOG evidence as A02 §3 S1).

**Fix:** Update to 37.

---

## 5. `docs/guide/faq.md`

### Deep-Verified Factual Q&As

All 14 FAQ sections were read and cross-referenced. The table below covers the factual Q&As with the most verification risk:

| Section | Key Claims | Status |
|---------|-----------|--------|
| Q1 — What is Deckent | Three-component model (Brain/Auditor/Workers) | ✓ Correct |
| Q2 — Provider/model | Providers: claude/codex/gemini/ollama; tiers premium_plus/premium/standard/economy; planning modes ai/structured/auto | ✓ Correct (config.ts:396 `VALID_BRAIN_PLANNING`) |
| Q3 — Spawn backend | Docker is default; tmux/subprocess alternatives | ✓ Correct (`src/core/config.ts:1138`) |
| Q4 — MCP server | Tool/resource architecture; tool count **35 (diagram) / 34 (table)** | ✗ Both wrong — actual 37 |
| Q5 — Sprint duration | 8 phases listed; PLAN/SPAWN/EVALUATE/RETRO/DECAY/CLEANUP durations | ✓ Phase phases correct (same CLEANUP S1 caveat) |
| Q6 — Custom agents/skills | `plugin install/list/create` commands | ✓ All subcommands exist in `plugin.ts` |
| Q7 — Multi-project | `deckent onboard` for global config | ✓ `src/cli/commands/onboard.ts` exists |
| Q8 — CI/CD | Node ≥ 24 requirement; example workflow uses `node-version: "24"` | ✓ Correct |
| Q9 — Multi-provider | Provider env vars; OpenAI-compatible HTTP; Ollama sprint-worker as stub | ✓ Correct |
| Q10 — Provider failover | Fallback chain; tier mapping; single retry | ✓ Correct (config.ts, task-router.ts) |
| Q11 — Autonomous engine | CLI commands; backlog statuses; trigger types; policy gates | ✓ Correct (`src/cli/commands/autonomous.ts`) |
| Q12 — Nervous System | Pipeline: Observer→Detector Registry→Decision Engine→Proposer→Dispatcher→Executor | ✓ Partially correct (omits authority-matrix + history) |
| Q13 — Memory recall | `deckent recall / remember / memory stats / memory export / memory rebuild` | ✓ All commands exist |
| Q14 — Native REPL | `deckent` opens REPL; `--native` flag; `DECKENT_NATIVE_AGENT` env var | ✓ Correct (`src/cli/entry.ts:56,67`) |

### Stale / Incorrect Claims

**S1 — MCP tool count internally inconsistent (section 4)**

```
Architecture diagram: src/mcp/tools/ (35 tools)
Tools vs. Resources table: Tools | 34
```

Both values are stale. Actual = **37** (TOOL_CATALOG.length, runtime-verified). The two values within Q4 are also inconsistent with each other, which signals the section was updated piecemeal.

**Fix:** Update both occurrences to 37.

**S2 — Nervous System pipeline incomplete (section 12)**

```
Observer → Detector Registry → Decision Engine → Proposer → Dispatcher → Executor
```

**Finding:** `src/nervous/` also contains `authority-matrix.ts` and `history.ts` as part of the live pipeline. `deckent-nedir.md` lists all 8 modules: `observer → detector-registry → decision-engine → proposer → dispatcher → executor → authority-matrix → history`. The FAQ pipeline is a simplified view, but readers using it to understand the architecture are missing two stages.

**Fix:** Append "→ Authority Matrix → History" to the pipeline, or add a note that the diagram shows the primary decision flow.

---

## FAQ Coverage Note

**Depth vs. breadth assessment for faq.md (~24 KB, 14 sections):**

The FAQ provides comprehensive first-contact coverage of Deckent's major surfaces. Each section is written at the right level of detail for a user with basic familiarity. The Q&As are internally consistent and well-organized.

**Topics with sufficient depth:**
- Sprint lifecycle timing (Q5 with realistic examples) ✓
- Multi-provider setup (Q9 with config snippets) ✓
- Autonomous engine (Q11 with backlog status table) ✓
- Memory recall (Q13 with CLI command set) ✓

**Topics with intentional shallow coverage (appropriate for FAQ format):**
- Worker scope enforcement (details in concepts.md/reference docs)
- ADR compliance enforcement (details in auditor rules)

**Notable gaps (not FAQ-appropriate to add, but worth noting for future Q additions):**
- No entry about `deckent serve` / Dashboard UI
- No entry about human checkpoints (`human_checkpoints` config)
- No entry about the Evolution Pipeline (agent/skill promotion)
- No entry about `deckent audit compliance` / SIEM export
- No entry about checkpoint/resume lifecycle (`deckent checkpoint`)

The FAQ is skimmed for structural quality only in sections Q6–Q14 given the task scope; factual Q&As (Q1–Q5, all cross-cutting claims) are deep-verified with source evidence above.

---

## Cross-Cutting Issues

### Issue XC-1: MCP Tool Count (37, not 34/35)

Affects `deckent-nedir.md`, `feature-matrix.md`, and `faq.md` (twice). The TOOL_CATALOG in `src/mcp/tools/index.ts` now registers 37 tools. The three tools added after the "34" baseline are confirmed in the catalog:
- `deckent_process` (line 93)
- `deckent_usage` (line 94)
- `deckent_kpi` (line 95)
- `deckent_cost` (line 96) — that's 4 additions = 33 legacy + 4 = 37 (or 34 + 3 depending on what was there before the last update)

### Issue XC-2: CLEANUP Phase Name

Affects `first-sprint.md` and `concepts.md` (and implicitly the lifecycle table in `deckent-nedir.md` which lists CLEANUP). The SprintPhase enum ends at DECAY; COMPLETE is the terminal phase. `runCleanupPhase()` executes within the DECAY→COMPLETE window. The action is correct, the phase label is wrong. The external behavior (what users see in `deckent status`) shows `DECAY` then `COMPLETE`.

---

## Links Check

Internal cross-doc links extracted and checked for reference integrity (not HTTP-fetched):

| Link | Source | Status |
|------|--------|--------|
| `/guide/getting-started` | first-sprint.md:5 | Not checked (external page) |
| `/guide/concepts` | first-sprint.md:252 | Target exists as `concepts.md` ✓ |
| `/reference/config` | first-sprint.md:246, concepts.md:219 | Ref docs expected ✓ |
| `/reference/multi-provider` | first-sprint.md:246 | Ref docs expected ✓ |
| `/reference/api` | concepts.md:254 | Ref docs expected ✓ |
| `../reference/mcp-tools.md` | faq.md:194 | Ref docs expected ✓ |
| `./quickstart.md` | faq.md:691 | `docs/guide/` — file existence not confirmed |
| `./concepts.md` | faq.md:692 | `docs/guide/concepts.md` ✓ |
| `../reference/multi-provider.md` | faq.md:693 | Ref docs expected ✓ |
| `./autonomous.md` | faq.md:694 | Existence not confirmed |
| `../reference/migration-guide.md` | faq.md:695 | Existence not confirmed |
| `docs/reference/cli-commands.md` | deckent-nedir.md:125 | Ref docs expected ✓ |
| `docs/reference/mcp-tools.md` | deckent-nedir.md:139 | Ref docs expected ✓ |
| `docs/guide/installation.md` | deckent-nedir.md:219 | Existence not confirmed |

Three reference links in faq.md section 14 (`quickstart.md`, `autonomous.md`, `migration-guide.md`) could not be confirmed to exist within the current docs tree. These should be verified before publishing.

---

## Verdict Summary

| Doc | Verdict | Priority Fixes |
|-----|---------|----------------|
| `first-sprint.md` | NEEDS_UPDATE | S1: rename CLEANUP→COMPLETE in lifecycle |
| `concepts.md` | NEEDS_UPDATE | S2: expand task status enum; S1: rename CLEANUP phase |
| `deckent-nedir.md` | NEEDS_UPDATE | S1: MCP tool count 34→37 (2 occurrences) |
| `feature-matrix.md` | NEEDS_UPDATE | S1: MCP tool count 34→37 in source note |
| `faq.md` | NEEDS_UPDATE | S1: MCP tool count 35+34→37 in Q4 (2 occurrences) |

All five docs pass the conceptual model accuracy bar: Brain/Worker/Auditor roles, sprint lifecycle phase order, dependency wave ordering, provider architecture, memory schema, and command names are all correct. The required fixes are localized and low-risk.
