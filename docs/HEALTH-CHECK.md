# Deckent Health Check — Post-Sprint 18

*Last audit: 2026-03-18 (Sprint 18 complete)*
*Next audit: Sprint 19 completion*

---

## Blueprint Compliance (24 Sections)

### Section 1: Core Principles (7)

| Principle | Status | Evidence |
|-----------|--------|----------|
| Native-first (CLI+MCP) | WORKING | 26 CLI commands, 10 MCP tools, npm installable |
| Self-evolving | PARTIAL | MEMORY.md exists, decay works, but learning loop is manual — Brain doesn't auto-improve from retro |
| Observable | WORKING | .dashboard, deckent status/watch, web dashboard, AgentDetail |
| Usage-aware | WORKING | checkUsage() parses `claude -p /usage`, adjustSprintSize reduces workers. Safe defaults on fail |
| Plan-compatible | PARTIAL | 4 modes defined (max/max5x/pro/api) but only max_plan tested in production |
| Zero-friction | WORKING | MCP auto-registration, natural language → DIRECTIVES → sprint |
| Open source | WORKING | MIT LICENSE file present |

### Section 3: CLI Commands (26)

| Status | Count | Commands |
|--------|-------|----------|
| WORKING | 22 | init, start, plan, status, doctor, retro, history, config, attach, spawn, kill, cleanup, sync, watch, analyze, archive-debt, dashboard, serve, web, mcp, config set, start --watch |
| STUB | 4 | usage (placeholder), plugin install/list (not implemented), upgrade (placeholder), onboard (placeholder) |

### Section 5: Agent System

| Component | Status | Detail |
|-----------|--------|--------|
| Brain planSprint | WORKING | Creates task JSONs, structured+AI mode, inferModelFromDirective |
| Brain runSprint | WORKING | 8-phase lifecycle, completed end-to-end in Sprint 18 (260s, 8 workers) |
| Auditor scanLoop | WORKING (with bugs) | Heartbeat timestamp comparison faulty — false positive stale alerts |
| Worker spawn | WORKING | tmux new-window + send-keys + pipe-pane log capture |
| Worker .result | WORKING | 8 workers wrote .result files successfully in Sprint 18 |
| End-to-end chain | WORKING (limited) | Sprint 18: 8/10 tasks completed. Planner limits tasks to max_workers count |

### Section 6: Memory 3-Tier

| Tier | Status | Detail |
|------|--------|--------|
| Tier 1: MEMORY.md | WORKING | Sprint 1-5, 15-18 learnings. Gap: 6-14 missing |
| Tier 2: sprints/*.md | WORKING | sprint-007 to 018 exist |
| Tier 3: archive/ | WORKING | 6 archived sprints (001-006). Decay runs in Phase 7 |

### Section 7: Sprint Lifecycle (8 phases)

| Phase | Code | Tested | Run in Prod |
|-------|------|--------|-------------|
| PLAN | WORKING | Yes | Yes (Sprint 18 — created 8 task JSONs) |
| SPAWN | WORKING | Yes | Yes (Sprint 18 — 8 tmux windows) |
| EXECUTE | WORKING | Yes | Yes (Sprint 18 — 8 parallel workers) |
| EVALUATE | WORKING | Yes | Yes (Sprint 18 — 3 DONE, 5 TECH_DEBT) |
| FIX | WORKING | Yes | Never triggered (no NO_GO in prod) |
| RETRO | WORKING | Yes | Yes (Sprint 18 — RETRO.md, sprint-018.md) |
| DECAY | WORKING | Yes | Yes (Sprint 18) |
| CLEANUP | WORKING | Yes | Yes (Sprint 18 — all .tasks/ files removed) |

Last real runSprint execution: **Sprint 18** (2026-03-18). Sprint 11-17 were manual.

### Section 8: GO/NO-GO Protocol — WORKING

### Section 9: Usage-Aware Planning — WORKING

### Section 10: tmux Management — WORKING

### Section 11: Plugin System — STUB
- plugin.ts is placeholder, prints "not yet implemented"

### Section 13: Multi-plan — PARTIAL
- 4 modes defined, only max_plan tested

### Section 14: i18n — STUB
- en.json + tr.json exist with 6 message templates each
- ZERO runtime usage

### Section 16: Self-Test 3 Layer — PARTIAL

### Section 21: MCP — WORKING
- 10 tools, 5 resources, background job pattern

### Section 22: User Flows — PARTIAL
- No end-to-end flow tests

### Section 23: Roadmap — Phase 1 MET
- 1027 tests > 987 target
- 97.5% coverage > 97% target
- MCP stable, HTTP API, Web Dashboard, AI planning

---

## Current Metrics

| Metric | Value | Source |
|--------|-------|--------|
| Tests | 1027 | `npx vitest run` |
| Coverage | 97.5% | `npx vitest run --coverage` |
| CLI commands | 26 | src/cli/commands/ |
| MCP tools | 10 | src/mcp/tools/ |
| MCP resources | 5 | src/mcp/resources/ |
| HTTP endpoints | 16 | src/api/server.ts |
| Sprints | 18 | .brain/sprints/ |
| .brain/ budget | ~180 / 300 lines | countBrainLines() |

---

## Orchestration Status (Sprint 18 Findings)

| Component | Status | Detail |
|-----------|--------|--------|
| runSprint e2e | WORKING | Full lifecycle completed in 260s |
| Parallel workers | WORKING | 8 sonnet workers ran simultaneously |
| Task queue | BROKEN | Planner creates max_workers tasks, not all tasks |
| Heartbeat timestamps | BROKEN | Wrong timezone — auditor false positives |
| Dashboard progress | DELAYED | Done counter only updates at EVALUATE phase |
| Alert dedup | MISSING | Same alert repeated every scan cycle |
| Doc task evaluation | MISCONFIGURED | Coverage check penalizes doc-only tasks |
| DEBT.md table test | BROKEN | Pre-existing: empty table fails debt-002 test |

### Recommended Fixes for Sprint 19

1. **P0** — Planner: separate task count from worker parallelism limit
2. **P1** — Worker heartbeat: fix timestamp to use correct UTC time
3. **P1** — Auditor: update dashboard done counter when .result files appear
4. **P2** — Auditor: deduplicate alerts by source+message
5. **P2** — Brain: skip coverage check for doc-only tasks
6. **P3** — Test: handle empty DEBT.md table in debt-002 test

---

## Known Stubs / Limitations

| Item | Status | Priority |
|------|--------|----------|
| Plugin system | Stub (not implemented) | LOW |
| i18n runtime | Stub (zero usage) | LOW |
| Usage command | Placeholder | LOW |
| Upgrade command | Placeholder | LOW |
| Onboard command | Placeholder | LOW |
| Multi-plan testing | Only max_plan tested | MEDIUM |
| Task queue (>8 tasks) | Broken — needs fix | HIGH |
| Self-evolving loop | Manual, not automatic | MEDIUM |

---

## Stale State (Post-Cleanup)

| Item | Status |
|------|--------|
| .tasks/ | CLEAN (Sprint 18 cleanup ran successfully) |
| .dashboard | FRESH (Sprint 018 COMPLETE) |
| last_sprint_id | sprint-018 (correct) |
| RETRO.md | Sprint 18 retro written |
| sprint-018.md | Created with metrics |
| .deckent/jobs/ | sprint-1773832953987.json (COMPLETE) |

---

*Updated every sprint. Next audit: Sprint 19.*
