# Deckent Health Check — Post-Sprint 30

*Last audit: 2026-03-21 (Sprint 30 complete)*
*Next audit: Sprint 31 completion*

---

## Blueprint Compliance (24 Sections)

### Section 1: Core Principles (7)

| Principle | Status | Evidence |
|-----------|--------|----------|
| Native-first (CLI+MCP) | WORKING | 28 CLI commands, 10 MCP tools (enriched), npm installable |
| Self-evolving | PARTIAL | MEMORY.md exists, decay works, but learning loop is manual — Brain doesn't auto-improve from retro |
| Observable | WORKING | .dashboard, deckent status/watch, web dashboard, AgentDetail |
| Usage-aware | WORKING | checkUsage() parses `claude -p /usage`, adjustSprintSize reduces workers. resolveTaskModel() uses usage pressure |
| Plan-compatible | WORKING | 4 modes defined (max/max5x/pro/api), auto-setup recommends mode based on subscription+system profile |
| Zero-friction | WORKING | MCP auto-registration, natural language → DIRECTIVES → sprint, auto-setup wizard |
| Open source | WORKING | MIT LICENSE file present |

### Section 3: CLI Commands (28)

| Status | Count | Commands |
|--------|-------|----------|
| WORKING | 27 | init, start, plan, status, doctor, retro, history, config, attach, spawn, kill, cleanup, sync, watch, analyze, archive-debt, dashboard, serve, web, mcp, config set, start --watch, test, run, usage, onboard, upgrade |
| STUB | 1 | plugin install (not implemented) |

### Section 5: Agent System

| Component | Status | Detail |
|-----------|--------|--------|
| Brain planSprint | WORKING | AI + structured + auto mode, post-validation fallback (Sprint 23 fix) |
| Brain runSprint | WORKING | 8-phase lifecycle, 12/12 tasks in Sprint 23 (321s, 8+4 queue) |
| Auditor scanLoop | WORKING | Heartbeat check fixed (Sprint 19), alert dedup working |
| Worker spawn | WORKING | SpawnBackendFactory — tmux (default) or subprocess backend. Config: spawn_backend: "subprocess" |
| Worker .result | WORKING | 12 workers wrote .result files in Sprint 23 |
| Task queue | WORKING | First validated in Sprint 23: 8 worker + 4 queued, wave mechanism |
| End-to-end chain | WORKING | Sprint 23: 12/12 tasks completed, 0 NO-GO, 321s |

### Section 6: Memory 3-Tier

| Tier | Status | Detail |
|------|--------|--------|
| Tier 1: MEMORY.md | WORKING | Sprint 1-5, 15-22 learnings. Decay retains resolved entries for 3 sprints |
| Tier 2: sprints/*.md | WORKING | sprint-022.md, sprint-023.md exist |
| Tier 3: archive/ | WORKING | 6 archived sprints (001-006). Decay runs in Phase 7 |

### Section 7: Sprint Lifecycle (8 phases)

| Phase | Code | Tested | Run in Prod |
|-------|------|--------|-------------|
| PLAN | WORKING | Yes | Yes (Sprint 23 — 12 task JSONs, fallback mode) |
| SPAWN | WORKING | Yes | Yes (Sprint 23 — 8 tmux windows + 4 queue) |
| EXECUTE | WORKING | Yes | Yes (Sprint 23 — 12 parallel workers in waves) |
| EVALUATE | WORKING | Yes | Yes (Sprint 23 — 8 DONE, 4 TECH_DEBT) |
| FIX | WORKING | Yes | Never triggered (no NO_GO in prod) |
| RETRO | WORKING | Yes | Yes (Sprint 23 — RETRO.md, sprint-023.md) |
| DECAY | WORKING | Yes | Yes (Sprint 22 fix — DEBT-002 preserved) |
| CLEANUP | WORKING | Yes | Yes (Sprint 23 — all .tasks/ files removed) |

Last real runSprint execution: **Sprint 23** (2026-03-18). Sprints 18-23 all ran real orchestration.

### Section 8: GO/NO-GO Protocol — WORKING

### Section 9: Usage-Aware Planning — WORKING

### Section 10: tmux Management — WORKING

### Section 11: Plugin System — STUB
- plugin.ts is placeholder, prints "not yet implemented"

### Section 13: Multi-plan — WORKING
- 4 modes defined, auto-setup wizard recommends based on subscription
- resolveTaskModel() applies plan-aware model selection

### Section 14: i18n — PARTIAL
- en.json + tr.json exist with 6 message templates each
- CLI hints system (hints.ts, messages.ts) uses tr/en localization
- MCP enrichment uses tr/en localization

### Section 16: Self-Test 3 Layer — PARTIAL

### Section 21: MCP — WORKING
- 10 tools (all enriched with _enriched meta), 5 resources, background job pattern

### Section 22: User Flows — PARTIAL
- No end-to-end flow tests

### Section 23: Roadmap — Phase 1 MET
- 3609 tests > 987 target
- 97.5% coverage > 97% target
- MCP stable, HTTP API, Web Dashboard, AI planning, task queue validated

---

## Current Metrics

| Metric | Value | Source |
|--------|-------|--------|
| Tests | 4100+ | `npx vitest run` |
| Test files | 214 | `npx vitest run` |
| Coverage | 97.5% | `npx vitest run --coverage` |
| CLI commands | 28 | src/cli/commands/ |
| MCP tools | 10 (enriched) | src/mcp/tools/ |
| MCP resources | 5 | src/mcp/resources/ |
| HTTP endpoints | 16 | src/api/server.ts |
| Sprints | 30 | .brain/sprints/ |
| .brain/ budget | ~180 / 300 lines | countBrainLines() |

---

## Orchestration Status (Sprint 23 — All Issues Resolved)

| Component | Status | Detail |
|-----------|--------|--------|
| runSprint e2e | WORKING | Full lifecycle completed in 321s (Sprint 23) |
| Parallel workers | WORKING | 8 workers ran simultaneously, 4 queued |
| Task queue | WORKING | 12 tasks planned, 8 worker + 4 queue waves (Sprint 23) |
| Heartbeat timestamps | WORKING | Fixed in Sprint 19, validated in Sprint 20 |
| Dashboard progress | WORKING | Fixed in Sprint 19, validated in Sprint 20 |
| Alert dedup | WORKING | Fixed in Sprint 19, validated in Sprint 20 |
| Doc task evaluation | WORKING | isDocTask() skips coverage check (Sprint 19) |
| DEBT.md decay | WORKING | shouldRemoveResolvedDebt() retains for 3 sprints (Sprint 22) |
| AI planner fallback | WORKING | Post-validation: AI<directives → structured fallback (Sprint 23) |
| MCP enrichment | WORKING | 10/10 tools enriched with summary+hints+timestamp |
| Auto setup | WORKING | generateSetupRecommendation() — subscription+system+project |
| CLI hints | WORKING | getContextualHints() — phase-based suggestions (tr/en) |
| Doctor --profile | WORKING | System profile display (CPU, RAM, workers, subscription) |

---

## Known Stubs / Limitations

| Item | Status | Priority |
|------|--------|----------|
| Plugin system | Stub (not implemented) | LOW |
| i18n runtime | Partial (CLI hints + MCP enrichment only) | LOW |
| Usage command | WORKING | -- |
| Upgrade command | WORKING | -- |
| Onboard command | WORKING | -- |
| Self-evolving loop | Manual, not automatic | MEDIUM |

---

## Stale State (Post-Cleanup)

| Item | Status |
|------|--------|
| .tasks/ | CLEAN (Sprint 23 cleanup ran successfully) |
| .dashboard | FRESH (Sprint 023 COMPLETE, total=12, done=12) |
| last_sprint_id | sprint-023 (correct) |
| RETRO.md | Sprint 23 retro written |
| sprint-023.md | Created with metrics (12 tasks, 321s) |
| DEBT-002 | PRESERVED (resolved, retained by decay fix) |

---

### Sprint 27 Features (Technical Gap Closure)

| Feature | Status | Detail |
|---------|--------|--------|
| Provider Abstraction | WORKING | ProviderAdapter interface + ProviderRegistry + ClaudeAdapter |
| SpawnBackend Abstraction | WORKING | TmuxBackend + SubprocessBackend + SpawnBackendFactory, config-driven |
| Subprocess Backend | VERIFIED | Sprint 30: tmux-free sprint completed successfully, 4 workers via child_process |
| Usage Tracking | WORKING | UsageTracker class, sprint-based JSON storage, model breakdown |
| Coverage Validation | WORKING | parseCoverageFromVitest, validateCoverage, doc-task skip |
| Rollback Mechanism | WORKING | createSafetyPoint, rollback, getRollbackPolicy, DEBT.md recording |
| Worker IPC | WORKING | WorkerChannel + ChannelRegistry, HEARTBEAT/PAUSE/RESUME/KILL messages |
| Zero-Config Mode | WORKING | Single-line start: `deckent start "Add login page"` |
| Sandbox Mode | PARTIAL | SandboxSpawnBackend exists, --sandbox-mode flag, needs Docker integration |
| Global Config | WORKING | ~/.deckent/config.json, ensureGlobalDir, merge with project config |
| Credentials Management | WORKING | ~/.deckent/credentials/, file permissions 0600, storeCredential/getCredential |

---

### Sprint 28 Features (npm Publish Prep)

| Feature | Status | Detail |
|---------|--------|--------|
| Error Registry | WORKING | DeckentError + ErrorRegistry, 10 error codes, i18n support |
| Error Handler | WORKING | Centralized CLI error handling, colored output, suggestions |
| TUI Wizard | WORKING | WizardStep interface, select/input/confirm, non-interactive mode |
| Onboard Wizard | WORKING | Interactive setup: Claude detection, system profile, config |
| Upgrade Command | WORKING | npm view version check, --check flag, npm install -g |
| Telemetry | WORKING | Opt-in TelemetryCollector, PII sanitization, default disabled |
| Publish Pipeline | WORKING | prepublish, build-verify, pack-test, publish scripts |
| .npmignore | WORKING | Excludes sensitive files from npm package |
| Enhanced --version | WORKING | System info + --version-json flag |
| Doctor UX | IMPROVED | Platform-specific install suggestions, [PASS]/[FAIL]/[WARN] colors |

---

### Sprint 29 Features (Agent Pool Core)

| Feature | Status | Detail |
|---------|--------|--------|
| Agent Type System | WORKING | AgentDefinition, AgentPool, AgentSelectionResult types |
| Agent Pool Manager | WORKING | Load from .deckent/agents/, validate, stats tracking |
| Agent Selector | WORKING | Keyword+scope scoring, threshold >= 3, tie-break by successRate |
| Built-in Agents | WORKING | 8 agents: security-auditor, test-writer, doc-writer, code-reviewer, refactorer, bug-fixer, api-builder, performance-analyzer |
| Shared Context | WORKING | Inter-agent communication via atomic JSON file |
| Multi-Agent Pipeline | WORKING | Sequential agent execution with abort-on-failure |
| Agent CLI | WORKING | deckent agent list/create/enable/disable |
| Brain Integration | WORKING | planSprint auto-selects agent, injects PROMPT.md |
| Dashboard Visibility | WORKING | Agent column in worker status (cyan/dim) |

---

### Sprint 30 Features (Skill System)

| Feature | Status | Detail |
|---------|--------|--------|
| Skill Type System | WORKING | SkillDefinition, ProjectStack, SkillCategory types |
| Skill Pool Manager | WORKING | Load from .deckent/skills/, validate, stats |
| Stack Detector | WORKING | Auto-detect TS/React/Python/Rust/Go/Docker, cached |
| Skill Selector | WORKING | Multi-factor scoring, max 3 skills, composition check |
| Skill Registry | WORKING | Local index, search, popular ranking |
| Built-in Skills | WORKING | 10 skills with SKILL.md prompts |
| Skill CLI | WORKING | deckent skill list/create/install |
| Brain Skill Integration | WORKING | planSprint async, stack detect + skill select |
| Prompt Injection | WORKING | SKILL.md in worker prompt (1500/skill, 4000 total) |
| Skill Config | WORKING | enabled, maxPerTask, autoDetectStack, preferredSkills |

---

### Sprint 31 Features (Brain Decision Engine)

| Feature | Status | Detail |
|---------|--------|--------|
| Decision Engine | WORKING | 6-step pipeline, DecisionOrchestrator |
| Task Analyzer | WORKING | Type inference, complexity scoring |
| Decision Logging | WORKING | Persist to .tasks/decisions/, replay support |
| Learning Loop | WORKING | Record/query/score agent+skill+model combinations |
| Learning Decay | WORKING | Prune old data, compact to summary |
| Parallel Pipeline | WORKING | Topological sort into execution waves |
| Shared Memory | WORKING | Inter-worker key-value with TTL |
| Conflict Resolver | WORKING | Detect overlaps, 3 resolution strategies |
| Handoff Protocol | WORKING | Artifact handoffs between tasks |
| Adaptive Agent | WORKING | Prompt analysis, A/B test, versioning, rollback |
| Brain Context | WORKING | Stack/agent/skill/history enrichment |

---

*Updated every sprint. Next audit: Sprint 32.*
