# MCP/CLI Parity Audit Report — Sprint 138

**Date:** 2026-04-14  
**Auditor:** doc-writer (Task 138-010)  
**ADR Reference:** ADR-022 (CLI/MCP Feature Parity)  
**Sprint:** 138 — Architectural Pivot

---

## Executive Summary

ADR-022 (Sprint 085) defines 19 MCP tools = 19 CLI commands as the parity baseline. This audit identifies the current state after Sprint 138, where two new CLI commands were added (`resume` from Task 138-009, `job-runner` utility). Three sprint gaps remain open as Sprint 139 debt candidates.

| Category | Count |
|----------|-------|
| Parity-compliant (CLI + MCP both present) | 21 |
| CLI-only (intentional per ADR-022) | 12 |
| CLI-only (NEW — unintentional gap / Sprint 139 debt candidates) | 3 |
| MCP-only utility (no CLI equivalent needed) | 0 |

---

## Section 1: Parity-Compliant Pairs (21)

These commands have both CLI and MCP counterparts sharing the same core logic:

| CLI Command | MCP Tool | Core Function |
|-------------|----------|---------------|
| `deckent init` | `deckent_init` | `initProject()` |
| `deckent set-directives` | `deckent_set_directives` | `setDirectives()` |
| `deckent plan` | `deckent_plan` | `planSprint()` |
| `deckent start` | `deckent_start` | `runSprint()` |
| `deckent status` | `deckent_status` | `getSprintStatus()` |
| `deckent doctor` | `deckent_doctor` | `runDoctor()` |
| `deckent retro` | `deckent_retro` | `readRetro()` |
| `deckent history` | `deckent_history` | `getHistory()` |
| `deckent analyze` | `deckent_analyze_project` | `analyzeProject()` |
| `deckent sync` | `deckent_sync` | `syncConfig()` |
| `deckent config` | `deckent_config` | `readConfig()` / `setConfig()` |
| `deckent review` | `deckent_review` | `reviewSprint()` |
| `deckent run` | `deckent_run` | `runTask()` |
| `deckent kill` | `deckent_kill` | `killWorkers()` |
| `deckent cleanup` | `deckent_cleanup` | `cleanupSprint()` |
| `deckent help` | `deckent_help` | `getHelp()` |
| `deckent agent list` | `deckent_agent_list` | `listAgents()` |
| `deckent skill list` | `deckent_skill_list` | `listSkills()` |
| `deckent checkpoint` | `deckent_checkpoint` | `approveCheckpoint()` |
| `deckent docs` | `deckent_docs` | `manageDocs()` |
| `deckent explain` | `deckent_explain` | `explainSprint()` |

> **Status:** Full parity confirmed for all 21 pairs. Count increased from ADR-022 baseline of 19 due to `checkpoint` and `docs` commands added in Sprints 133–131.

---

## Section 2: Intentional CLI-Only Commands (12)

Per ADR-022, the following commands are intentionally CLI-only. They involve infrastructure, UI, or setup operations that are inappropriate for MCP contexts:

| CLI Command | Reason (per ADR-022) | Category |
|-------------|---------------------|----------|
| `deckent attach` | tmux session management — terminal-only | Infrastructure |
| `deckent spawn` | Worker subprocess spawning — terminal-only | Infrastructure |
| `deckent watch` | Live file watcher — terminal streaming | Infrastructure |
| `deckent dashboard` | Vite/React UI server launch | Server/UI |
| `deckent web` | Dashboard browser open | Server/UI |
| `deckent serve` | HTTP API server start | Server/UI |
| `deckent upgrade` | npm package upgrade wizard | Setup |
| `deckent onboard` | Interactive onboarding wizard | Setup |
| `deckent plugin install` | Plugin filesystem management | Plugin |
| `deckent plugin list` | Plugin listing | Plugin |
| `deckent plugin create` | Plugin scaffolding | Plugin |
| `deckent quick-start` | Zero-config mode helper (utilities only — no register call) | Helper |

> **Note:** `quick-start.ts` exports utilities (`buildZeroConfigDirectives`, `cleanupTempDirectives`) used by `start.ts`. It does not register a standalone command via `registerXxx(program)`. It is a module-level helper, not a user-facing command.

---

## Section 3: Unintentional Gaps — Sprint 139 Debt Candidates (3)

These CLI commands were added **after** Sprint 085 (the ADR-022 v2 update) and have no MCP equivalents. They are not in the intentional-CLI-only list, meaning they represent parity debt.

### Gap 1: `deckent resume` — **HIGH Priority**

| Field | Detail |
|-------|--------|
| CLI File | `src/cli/commands/resume.ts` |
| MCP Tool | **Missing** |
| Added | Sprint 138 (Task 138-009) |
| Description | Resume a sprint from a saved checkpoint |
| Priority | HIGH — long-running sprint foundation; MCP users cannot resume interrupted sprints |
| Proposed MCP Tool | `deckent_resume` |
| Suggested Parameters | `sprintId: string, dryRun?: boolean, root?: string` |

**Impact:** MCP users (Claude Code, VS Code, JetBrains) cannot resume interrupted long-running sprints. With Sprint 140 (50-task) and Sprint 145 (100-task) milestones approaching, this gap will become critical.

### Gap 2: `deckent finalize` — **NORMAL Priority**

| Field | Detail |
|-------|--------|
| CLI File | `src/cli/commands/finalize.ts` |
| MCP Tool | **Missing** |
| Added | Sprint 076+ (extracted from brain retro phase) |
| Description | Manually trigger sprint finalization (MEMORY.md, RETRO.md, decay) |
| Priority | NORMAL — `deckent_start` handles finalization automatically; CLI exposes it for manual recovery |
| Proposed MCP Tool | `deckent_finalize` |
| Suggested Parameters | `sprintId?: string, skipDecay?: boolean, skipHooks?: boolean, force?: boolean, root?: string` |

**Impact:** When sprint auto-finalization fails (e.g., Layer 4 wire bug tracked in Task 138-006), MCP users have no recovery path. They must use CLI or wait for brain re-run.

### Gap 3: `deckent test` — **NORMAL Priority**

| Field | Detail |
|-------|--------|
| CLI File | `src/cli/commands/test-run.ts` (registers as `deckent test`) |
| MCP Tool | **Missing** |
| Added | Sprint 090+ |
| Description | Run a test sprint with no retro/memory update; supports `--sandbox`, `--reporter`, `--min-coverage` |
| Priority | NORMAL — primarily a CI/developer workflow; MCP agents rarely need isolated test sprints |
| Proposed MCP Tool | `deckent_test` |
| Suggested Parameters | `keep?: boolean, directives?: string, sandbox?: boolean, model?: string, reporter?: string, minCoverage?: number, root?: string` |

**Impact:** CI pipelines using MCP cannot run test sprints without triggering full retro + memory updates. `reporter: junit/tap` output is especially useful for CI integration.

---

## Section 4: Other CLI Commands Without MCP Equivalents (Intentional)

### `deckent archive-debt` — Intentional CLI-Only

| Field | Detail |
|-------|--------|
| CLI File | `src/cli/commands/archive-debt.ts` |
| Rationale | DEBT.md management is a maintenance operation best done interactively. `deckent_cleanup` handles automatic archiving during sprint end. |
| Recommendation | Keep CLI-only. Document in ADR-022 as intentional exclusion. |

### `deckent heartbeat` — Intentional CLI-Only

| Field | Detail |
|-------|--------|
| CLI File | `src/cli/commands/heartbeat.ts` |
| Rationale | Heartbeat daemon requires persistent process lifecycle (`--daemon` flag, PID management). MCP tools are stateless per-call; daemon management is terminal-only. |
| Recommendation | Keep CLI-only. |

### `deckent skill search` / `deckent skill publish` — Future MCP Candidates

| Field | Detail |
|-------|--------|
| CLI File | `src/cli/commands/skill-marketplace.ts` |
| Rationale | Marketplace features are currently in alpha. `deckent_skill_list` covers the local skill listing use case. |
| Recommendation | Add `deckent_marketplace_search` and `deckent_marketplace_publish` tools in Sprint 142+ when marketplace stabilizes. |

---

## Section 5: MCP Utility Module (No CLI Equivalent Needed)

### `src/mcp/tools/job-runner.ts`

This file is a **shared utility module**, not a tool registration. It exports:
- `writeJobState()` / `readJobState()` — job state persistence
- `buildTaskSummaries()` — task result aggregation
- `readLatestJobState()` — latest job lookup

These are consumed by `deckent_start` (and related MCP tools) to track async sprint execution state. No CLI equivalent is needed because the CLI handles job state differently (in-process, blocking execution). This is correct architecture.

---

## Section 6: ADR-022 Compliance Score

| Metric | Value |
|--------|-------|
| Parity-compliant pairs | 21/21 (100% of declared pairs) |
| Intentional CLI-only | 12 (documented) |
| Unintentional gaps | 3 (undocumented) |
| Overall ADR-022 compliance | **Partial** — baseline pairs OK, 3 new additions undocumented |

---

## Section 7: Sprint 139 Debt Recommendations

### Priority Order

1. **`deckent_resume`** (HIGH) — Long-running sprint resume for MCP users; becomes critical with Sprint 140+ milestone
2. **`deckent_finalize`** (NORMAL) — Manual recovery path for MCP users when auto-finalization fails
3. **`deckent_test`** (NORMAL) — CI pipeline test sprint support via MCP

### ADR-022 Amendment Needed

ADR-022 should be updated to:
1. Add `deckent resume` to the CLI-only list (temporarily, until MCP tool added) or list it as Sprint 139 debt
2. Add `deckent finalize` and `deckent test` as intentional/deferred items
3. Add `deckent archive-debt`, `deckent heartbeat` to the intentional CLI-only list with rationale

### Estimated Effort

| Gap | Effort | Notes |
|-----|--------|-------|
| `deckent_resume` | low | Core logic in `sprint-checkpoint.ts`; thin wrapper |
| `deckent_finalize` | low | Core logic in `finalizeSprint()`; thin wrapper |
| `deckent_test` | normal | `--sandbox` git stash may need special handling in MCP context |

---

## Appendix: Complete CLI Command Inventory (36 commands)

| Command File | Register Function | MCP Status |
|-------------|-------------------|------------|
| `init.ts` | `registerInit` | `deckent_init` ✅ |
| `set-directives.ts` | `registerSetDirectives` | `deckent_set_directives` ✅ |
| `plan.ts` | `registerPlan` | `deckent_plan` ✅ |
| `start.ts` | `registerStart` | `deckent_start` ✅ |
| `status.ts` | `registerStatus` | `deckent_status` ✅ |
| `doctor.ts` | `registerDoctor` | `deckent_doctor` ✅ |
| `retro.ts` | `registerRetro` | `deckent_retro` ✅ |
| `history.ts` | `registerHistory` | `deckent_history` ✅ |
| `analyze.ts` | `registerAnalyze` | `deckent_analyze_project` ✅ |
| `sync.ts` | `registerSync` | `deckent_sync` ✅ |
| `config.ts` | `registerConfig` | `deckent_config` ✅ |
| `review.ts` | `registerReview` | `deckent_review` ✅ |
| `run.ts` | `registerRun` | `deckent_run` ✅ |
| `kill.ts` | `registerKill` | `deckent_kill` ✅ |
| `cleanup.ts` | `registerCleanup` | `deckent_cleanup` ✅ |
| `agent.ts` | `registerAgent` | `deckent_agent_list` ✅ |
| `skill.ts` | `registerSkill` | `deckent_skill_list` ✅ |
| `checkpoint.ts` | `registerCheckpoint` | `deckent_checkpoint` ✅ |
| `docs.ts` | `registerDocs` | `deckent_docs` ✅ |
| `explain.ts` | `registerExplain` | `deckent_explain` ✅ |
| `resume.ts` | `registerResume` | **Missing** ⚠️ (Sprint 138 new) |
| `finalize.ts` | `registerFinalize` | **Missing** ⚠️ |
| `test-run.ts` | `registerTestRun` | **Missing** ⚠️ |
| `archive-debt.ts` | `registerArchiveDebt` | Intentional CLI-only 🔒 |
| `heartbeat.ts` | `registerHeartbeat` | Intentional CLI-only 🔒 |
| `attach.ts` | `registerAttach` | Intentional CLI-only 🔒 |
| `spawn.ts` | `registerSpawn` | Intentional CLI-only 🔒 |
| `watch.ts` | `registerWatch` | Intentional CLI-only 🔒 |
| `dashboard.ts` | `registerDashboard` | Intentional CLI-only 🔒 |
| `web.ts` | `registerWeb` | Intentional CLI-only 🔒 |
| `serve.ts` | `registerServe` | Intentional CLI-only 🔒 |
| `upgrade.ts` | `registerUpgrade` | Intentional CLI-only 🔒 |
| `onboard.ts` | `registerOnboard` | Intentional CLI-only 🔒 |
| `plugin.ts` | `registerPlugin` | Intentional CLI-only 🔒 |
| `skill-marketplace.ts` | `registerSkillMarketplace` | Future candidate 📋 |
| `quick-start.ts` | _(utility module, no register)_ | N/A |

> **Legend:** ✅ = Parity compliant | ⚠️ = Unintentional gap | 🔒 = Intentional CLI-only | 📋 = Future candidate

---

*Report generated by doc-writer agent — Task 138-010*
