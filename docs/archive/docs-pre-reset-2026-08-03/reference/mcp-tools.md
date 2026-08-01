# MCP Tools Reference

> **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.

Deckent ships an MCP server that exposes orchestration to MCP-compatible IDEs (Claude Code, Cursor, etc.). The tools below are registered in `src/mcp/tools/*.ts` and surfaced via `deckent-mcp` stdio transport.

<!-- AUTOGEN:START id="mcp-tools" -->
> 48 tools registered. Generated from `src/mcp/tools/*.ts`.

| Tool | Title | Description |
|------|-------|-------------|
| `deckent_agent_list` | Agent List | List all registered agents in the Deckent project — both built-in and dynamically generated temp agents. |
| `deckent_agent_manage` | Agent Manage | Manage the agent pool: add a custom agent, remove one, or promote a temp agent |
| `deckent_analyze_project` | Analyze Project | Analyze the current project to detect: language (TypeScript/JavaScript/Python/Go/Rust/etc.), framework (React/Express/FastAPI/etc.), test framework (vitest/jest/pytest/etc.), build tool (tsc/webpack/vite/etc.), CI system (GitHub Actions/GitLab CI/etc.), project size (small/medium/large based on file count), and methodology recommendation. Returns config suggestions (e.g. recommended plan mode, worker count). Useful before init to pick the right configuration, or to verify stack detection. Does not modify any files. |
| `deckent_audit` | Sprint Audit | Sprint audit multitool, mirrors the |
| `deckent_autonomous` | Autonomous Engine | Control the deckent autonomous execution engine: query status, start/stop |
| `deckent_autonomous_approve` | Autonomous Approve | Approve a pending autonomous-engine trigger — a backlog entry parked by the |
| `deckent_autonomous_backlog` | Autonomous Backlog | Manage the autonomous engine backlog (.deckent/autonomous/backlog.json): list |
| `deckent_autonomous_reject` | Autonomous Reject | Reject a pending autonomous-engine trigger — a backlog entry parked by the |
| `deckent_autonomous_status` | Autonomous Status | Read-only autonomous engine status: backlog totals by status, stop-marker presence, |
| `deckent_checkpoint` | Checkpoint Management | List, approve, or reject human checkpoints in sprint lifecycle. Checkpoints pause sprint execution at configured phases (plan/evaluate/fix) until a human approves or rejects. Use action=list to see pending checkpoints, action=approve/reject with sprintId and phase to respond. |
| `deckent_cleanup` | Sprint Cleanup | Remove sprint artifacts and optionally trim memory budget. Deletes all task files (.json, .plan, .hb, .result, .paused, .log) from .tasks/ and all lock files from .locks/. With decay=true, also runs memory decay on .brain/ files if they exceed the line budget (trims MEMORY.md, RETRO.md, sprint logs). Use dryRun=true first to preview what would be deleted. Typically run after a sprint completes (deckent_review) or before starting a fresh sprint after kill. |
| `deckent_config` | Config Manager | Read, get, or set Deckent configuration values in .deckent/config.json. Three actions: |
| `deckent_cost` | Cost | Show the cost configuration: budget limits, per-model pricing (input/output per MTok), |
| `deckent_docs` | Managed Docs | Manage user-defined documents in sprint lifecycle. Actions: |
| `deckent_doctor` | Health Check | Run Deckent health checks and diagnose environment issues. Checks: Node.js version, git availability, tmux installation, Claude CLI auth, workspace directories (.deckent/, .brain/, .tasks/), brain memory budget, tech debt level, stale lock files. Returns a healthScore (0-100) and per-check pass/fail status with recommendations. Use when a sprint fails unexpectedly or before starting a new sprint. If issues found: fix them, then re-run doctor until healthScore reaches 100. |
| `deckent_explain` | Sprint Explanation | Explain what a sprint did in human-friendly language. Reads the sprint log from .brain/sprints/ and the retrospective from the Memory V2 DB to generate a summary including goal, task outcomes (completed/failed/tech debt), duration, and key learnings. Use after a sprint completes to get a quick overview. Supports specific sprint lookup, verbose mode for full details, and JSON output. |
| `deckent_feature_query` | Feature Query | Query the Deckent feature manifest — list features by category (active, lightly_used, dormant, dead, all) |
| `deckent_help` | Deckent Help | Get runtime capabilities, current project state, and a recommended next action. |
| `deckent_history` | Run History | Read archived run log files from .brain/sprints/. Returns the last N run markdown logs sorted by run ID, plus a trend analysis (improving/declining/stable) based on task completion rates across runs. Use to understand long-term project health, compare run performance, or review past decisions. Each run log contains task outcomes, model usage, and learning notes. |
| `deckent_init` | Initialize Deckent | Initialize a Deckent project in the current directory. Creates all required directories (.deckent/, .brain/, .tasks/, .locks/, .claude/rules/) and configuration files (config.json, DECKENT.md, DIRECTIVES.md, brain files). Safe to re-run — existing config fields are preserved via merge, and files are only written if missing. After init, run deckent_set_directives → deckent_plan → deckent_start. |
| `deckent_kill` | Kill Worker | Stop one or all running workers. Sets task status to PAUSED, removes heartbeat files, and releases any file locks owned by the task. Use when a worker is stuck (stale heartbeat), consuming too many resources, or needs to be restarted. After killing, run deckent_cleanup to remove task artifacts, then deckent_start to restart. CLI parity (ADR-022-V2 + Sprint 189 T-009): force + userExplicit are pass-through panic-guard bypass markers — even when both are set the bypass is only logged (audit-trail), kill itself still requires explicit user intent (feedback_sprint_kill_always_ask_user). |
| `deckent_kpi` | KPI Scorecard | Show the KPI scorecard for a sprint (default) or trend series for a single KPI. |
| `deckent_memory_manage` | Memory Manage | Manage project memory: insert a new entry, update fields on an existing entry, or |
| `deckent_memory_query` | Memory Query | Search project memory — ADRs, sprint learnings, patterns, technical debt. |
| `deckent_models` | Model Catalog | Browse and manage the Deckent model catalog. |
| `deckent_nervous_accept` | Nervous Accept | Accept a pending Nervous System notification/action. |
| `deckent_nervous_config` | Nervous Config | Read or modify Nervous System configuration: authority mode preset, action overrides, and list available actions. |
| `deckent_nervous_edit` | Nervous Edit | Build an accept-with-edited-payload PLAN for a pending Nervous System |
| `deckent_nervous_reject` | Nervous Reject | Reject a pending Nervous System notification/action. |
| `deckent_nervous_status` | Nervous Status | Show Nervous System dashboard: pending notifications, recent history, and current config. |
| `deckent_nervous_subscribe` | Nervous Subscribe | Subscribe to Nervous System notifications for the current sprint. |
| `deckent_nervous_undo` | Nervous Undo | Build an undo PLAN for the most recent reversible accepted Nervous |
| `deckent_plan` | Plan Sprint | Preview a sprint plan based on current DIRECTIVES.md. Reads DIRECTIVES.md, analyzes task blocks, and returns a proposed task list with model assignments, wave breakdown, and risk assessment — without executing anything. Use this to validate your directives before running deckent_start. Prerequisite: deckent_init + deckent_set_directives must have been run. |
| `deckent_process` | Process Mode | Process-mode execution surface (continuous request-handling for ERP / business |
| `deckent_recover` | Sprint Recovery | Recover from a crashed or stuck sprint. Runs audit, cleans orphan IPC directories (dead PIDs only), clears stale locks (>5min), and archives terminal task files. Active tasks are preserved. Use dryRun=true to preview before executing. DESTRUCTIVE: modifies .tasks/, .locks/, and .deckent/ directories. |
| `deckent_retro` | Sprint Retrospective | Read a sprint retrospective from the Memory V2 DB (.brain/memory.db |
| `deckent_review` | Sprint Review | Review sprint task results and make GO/NO_GO/GO_WITH_TECH_DEBT decisions. For each task returns: selfAssessment (worker\ |
| `deckent_run` | Run Task | Run a single one-off task outside of a full sprint. Creates a task JSON file and spawns a Claude worker immediately. Returns a jobId for tracking. Use when you need a quick isolated task without the full sprint lifecycle overhead (no PLAN/EVALUATE/RETRO phases). Use deckent_status to monitor the spawned worker. Example: fix a specific bug, write a single test file, update a doc. |
| `deckent_set_directives` | Set Directives | Write DIRECTIVES.md content. The brain engine parses |
| `deckent_skill_list` | Skill List | List all registered skills in the Deckent project. |
| `deckent_skill_manage` | Skill Manage | Manage the skill pool: add a custom skill, remove one, or list skills available in |
| `deckent_start` | Start Run | Start a full run in the background. Runs the complete lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP. Pre-spawn cost gate: if the estimated run cost exceeds cost_limits.sprint_max_usd (.deckent/cost-config.json), the tool returns COST_GATE_EXCEEDED — override with acknowledgeCost=true (or force=true to skip the gate entirely). Returns immediately with a jobId — the run continues asynchronously. Use deckent_status to monitor progress and deckent_review to evaluate results. Prerequisite: deckent_init + deckent_set_directives must have been run. |
| `deckent_status` | Run Status | Get the current run dashboard status. Returns: agents (active worker list with task assignments), progress (done/total counts + progress bar + ETA), alerts (stale workers, boundary violations, lock issues), job (background job state: RUNNING/COMPLETE/FAILED + sprintId + metrics), agentAssignments (which agent handles which tasks), skillAssignments (which skills are active). Call repeatedly to poll progress. No prerequisite — safe to call anytime. |
| `deckent_sync` | Sync Deckent | Sync AI adapter files (CLAUDE.md, AGENTS.md) to ensure they import DECKENT.md as the single source of truth. Additive only — prepends the @DECKENT.md reference if missing, never overwrites existing content. Use when CLAUDE.md or AGENTS.md loses its Deckent reference (e.g. after a manual edit or merge conflict). Requires DECKENT.md to exist (run deckent_init first). |
| `deckent_truth` | Feature Truth Chain | Resolve the 4-level feature truth-chain (code → wired → enabled → proof) for every truth-block |
| `deckent_usage` | Usage | Show token/limit consumption from Claude Code transcripts. |
| `deckent_watch` | Watch Sprint Events | Subscribe to live sprint event stream via MCP logging notifications. |
| `deckent_xverify` | Cross-verify (advisory) | Dispatch an adversarial verifier worker on a DIFFERENT provider to try to refute a claim |
<!-- AUTOGEN:END id="mcp-tools" -->
