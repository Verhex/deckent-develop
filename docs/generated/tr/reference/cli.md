# CLI Komut Dizini

> **Otomatik üretilir** — AUTOGEN bloğunu elle düzenlemeyin. Yeniden üretmek için `npm run docs:ref` çalıştırın.
> **Kaynaktan ayrıştırılır** — `src/cli/commands/*.ts` içindeki `.command(...)` kayıtlarından çıkarılır.

> Komut adları ve bayraklar tanımlayıcıdır; çevrilmez.

<!-- AUTOGEN:START id="cli-tr" -->
> 170 commands. Generated from `src/cli/commands/*.ts`.

| Command | Description |
|---------|-------------|
| `deckent accept <id>` | Accept a pending nervous system suggestion |
| `deckent accept-panic <task-id>` | Approve a PanicGuard-blocked worker kill (writes IPC marker) |
| `deckent activate <model>` | Allow a detected model to enter the routing pool |
| `deckent activation` | Show recorded model activation decisions (unrecorded = active) |
| `deckent active-set` | Show the resolved owner active execution set + snapshot digest |
| `deckent add` | Add a new entry to the autonomous backlog |
| `deckent add <cron> <action>` | Add a new scheduled flow (cron: 5-field expression, e.g. "* * * * * |
| `deckent add <name> <cmdOrUrl> [args...]` | Add an MCP server (stdio or http) — writes to .mcp.json by scope |
| `deckent add <path>` | Add a document to managed docs |
| `deckent agent` | Manage agent pool |
| `deckent analyze` | Analyze project stack, size, and recommended methodology |
| `deckent approve <id>` | Approve a pending event-triggered flow dispatch so it can proceed |
| `deckent approve <sprintId> <phase>` | Approve a pending checkpoint |
| `deckent approve <triggerId>` | Approve a parked trigger — resolves the running loop\'s gate |
| `deckent archive-debt` | Report tech-debt status (DB-first; resolved debt is auto-managed in memory.db) |
| `deckent attach` | Attach to the tmux orchestra session |
| `deckent audit [sprint-id]` | Run Brain Self-Audit Gate for a sprint, or query/export/retain audit log events (query \| compliance \| forward \| retention) |
| `deckent audit-verify` | Verify the audit HMAC chain (I4 invariant — tamper-evident audit log) |
| `deckent autonomous` | Autonomous runtime — authority-bounded continuous loop |
| `deckent autonomous-mission` | Manage autonomous v2 missions — list missions, goal missions |
| `deckent backlog` | Manage the autonomous backlog (add / list / remove entries) |
| `deckent baseline-refresh` | Refresh directives_protection baseline to current DIRECTIVES.md content |
| `deckent budget` | View or set cost budgets |
| `deckent build` | Build the deckent-worker Docker image from the packaged Dockerfile.worker |
| `deckent chat` | Start a conversational session with Deckent. Uses your installed AI CLI. |
| `deckent check <role> <action>` | Check whether a role has permission to perform an action |
| `deckent checkpoint` | Manage human checkpoints — list, approve, or reject pending checkpoints |
| `deckent cleanup` | Sweep stray autonomous run-artifacts (task-run-*, _*.pid) from .tasks/ |
| `deckent cleanup` | Clean up after a sprint |
| `deckent config` | Show or modify project configuration |
| `deckent connect` | Diagnose provider/MCP/IDE/shell connection status (read-only — no changes are made) |
| `deckent cost` | User Safety Shield — cost management & estimation |
| `deckent create <name>` | Create a new plugin scaffold |
| `deckent create <name>` | Create a custom skill |
| `deckent create-goal <goal>` | Create a Type-2 goal mission (runs until the goal is reached) |
| `deckent create-list <title>` | Create a Type-1 list mission from N work-items |
| `deckent cu-status` | Show computer-use (TOOL-CU) status: flag state + per-capability availability |
| `deckent dashboard` | Show terminal dashboard with auto-refresh (see also: deckent status --watch) |
| `deckent deactivate <model>` | Remove a model from the routing pool (detection still sees it) |
| `deckent delete <name>` | Delete an agent from the pool |
| `deckent delete <name>` | Delete a skill |
| `deckent disable <name>` | Disable an agent |
| `deckent disable <name>` | Disable a skill |
| `deckent do <goal>` | Golden-flow: turn a goal into a sprint plan (dry-run preview by default; --run to actually start it) |
| `deckent docs` | Manage user-defined documents |
| `deckent doctor` | Check system dependencies and health |
| `deckent edit <id>` | Modify and accept a pending suggestion |
| `deckent edit <name>` | Edit an agent configuration |
| `deckent enable` | Enable autonomous mode (one command instead of editing config; default stays OFF) |
| `deckent enable` | Enable the Nervous System (one command; default stays OFF, human-approval preserved) |
| `deckent enable <name>` | Enable an agent |
| `deckent enable <name>` | Enable a skill |
| `deckent evolve` | Evolution analysis — cross-sprint trends and prompt suggestions |
| `deckent explain` | Explain what the last sprint did in human-friendly language |
| `deckent export` | Export memory.db to .brain/exports/*.md |
| `deckent export [file]` | Export config to stdout or a file |
| `deckent features` | List features from .deckent/settings/features-manifest.json by category |
| `deckent flow` | Manage scheduled flows (process mode) |
| `deckent get <key>` | Get a configuration value by key (supports dot notation) |
| `deckent get <name>` | Show details for an MCP server (from merged view) |
| `deckent grant <user> <role>` | Assign a role to a user |
| `deckent heartbeat` | Run proactive heartbeat tasks from .deckent/HEARTBEAT.md |
| `deckent help-info` | Show quick-reference help (localized) |
| `deckent history` | View nervous system action history |
| `deckent image` | Worker Docker image management |
| `deckent import <file>` | Import config from a JSON file |
| `deckent info <dir>` | Show plugin info (accepts absolute or relative path) |
| `deckent info <name>` | Show detailed agent information |
| `deckent info <name>` | Show skill details |
| `deckent init` | Initialize a new Deckent project |
| `deckent install <source>` | Install a plugin from npm, git URL, or local path |
| `deckent install <source>` | Install a skill from local path or git URL (supports version pinning: url#tag) |
| `deckent keys` | List all config parameter keys |
| `deckent kill [taskId]` | Kill a running worker |
| `deckent kpi` | Show the KPI scorecard for the current (or a specific) sprint |
| `deckent limits` | Check live subscription-window usage (session/week) and the configured start-gate thresholds |
| `deckent lint` | Lint the agent catalog: reachability, coverage gaps, capability overlaps (V3) |
| `deckent list` | List all agents in the pool |
| `deckent list` | List all missions (summary table) |
| `deckent list` | List autonomous backlog entries |
| `deckent list` | List all checkpoints |
| `deckent list` | Show current authority matrix with all presets |
| `deckent list` | List all config parameters grouped by category |
| `deckent list` | List all managed documents |
| `deckent list` | List all scheduled flows |
| `deckent list` | List registered MCP servers (merged: local > project > user) |
| `deckent list` | List all relations in memory.db |
| `deckent list` | List available models from the catalog |
| `deckent list` | List installed plugins |
| `deckent list` | List all skills |
| `deckent log` | View raw nervous system log |
| `deckent mcp` | Manage MCP servers (Claude-parity) |
| `deckent memory` | Memory V2 management |
| `deckent migrate` | Migrate config.json to the latest full format (adds missing fields with defaults) |
| `deckent models` | Manage and browse the model catalog |
| `deckent nervous` | Configure Nervous System authority mode and action overrides', ) .option('--lang &lt;code&gt;', 'Language override (en\|tr) |
| `deckent nervous` | Nervous System dashboard — monitor, accept, reject proactive suggestions |
| `deckent onboard` | Run the onboarding wizard |
| `deckent openrouter-probe` | Live-probe OpenRouter free models via $DECK:OPENROUTER_API_KEY and refresh the local cache |
| `deckent output <taskId>` | Show captured output for a specific worker task |
| `deckent override <actionId> <policy>` | Set a per-action policy override |
| `deckent pending` | List parked approvals awaiting human accept/reject |
| `deckent plan` | Plan a sprint without executing it |
| `deckent plan <goal>` | Decompose a high-level goal into a lightweight autonomous backlog (Phase 1) |
| `deckent plan-nl` | Turn a free-form goal into a DIRECTIVES.md scaffold (single-task template; preview by default) |
| `deckent plugin` | Manage plugins |
| `deckent policy [provider] [mode]` | Show or set a provider activation policy (implicit-active \| explicit-active) |
| `deckent process` | Process-mode execution surface — submit tasks/capabilities and poll their status (ADR-022 CLI/MCP parity) |
| `deckent publish <skillPath>` | Validate, sign (Ed25519) and publish a skill to the marketplace |
| `deckent rbac` | Role-based access control — check permissions and list roles |
| `deckent rebuild` | Rebuild memory.db from .brain/exports/*.md files |
| `deckent recall <query>` | Search project memory — ADRs, sprint learnings, patterns, debt |
| `deckent reclassify` | Reclassify a recorded task outcome (delta-applies agent/skill stats) |
| `deckent recommendations` | View the Brain inbox — nervous proposals awaiting disposition (ADR-037) |
| `deckent refresh` | Force-refresh the model catalog (invalidates 24h cache) |
| `deckent reject <id>` | Reject a pending nervous system suggestion |
| `deckent reject <sprintId> <phase>` | Reject a pending checkpoint |
| `deckent reject <triggerId>` | Reject a parked trigger — resolves the running loop\'s gate |
| `deckent relations` | Manage memory relations |
| `deckent remember <note>` | Store a note in project memory |
| `deckent remove [id]` | Remove an entry from the autonomous backlog (positional id or --id) |
| `deckent remove <name>` | Remove an MCP server (searches all scopes if --scope omitted) |
| `deckent remove <name>` | Remove an installed plugin |
| `deckent remove <pathOrId>` | Remove a document from managed docs |
| `deckent report` | Show cross-sprint agent/skill trend report |
| `deckent reset` | Reset all action overrides to preset defaults |
| `deckent resources` | Show live docker worker resource usage or analyze resource log |
| `deckent result <executionId>` | Show the full result of a submission (status + lastResult) |
| `deckent resume <sprintId>` | Resume a sprint from its latest checkpoint |
| `deckent retro` | Show the latest sprint retrospective |
| `deckent review` | Review pending relations from backfill preview |
| `deckent review` | Review sprint tasks with evaluations |
| `deckent revoke <user>` | Remove the role assignment for a user |
| `deckent roles` | List all roles and their effective permissions |
| `deckent run` | Run managed doc updates without a sprint |
| `deckent run` | Run the flow-runtime tick once (--once) or start the daemon |
| `deckent runs` | List run-flows (the multi-flow inbox) — plus per-run decide: --approve/--reject/--retire/--start |
| `deckent scan` | Hash + timestamp + rank all docs; write front-matter; sync memory.db |
| `deckent search <query>` | Search skills in the marketplace registry |
| `deckent serve` | Start HTTP API server with SSE support |
| `deckent set` | Set a nervous system configuration value |
| `deckent set <key> <value>` | Set a configuration value |
| `deckent set-directives` | Write sprint goals to DIRECTIVES.md (content, file, or stdin) |
| `deckent show` | Display model pricing (read-only) |
| `deckent skill` | Manage skill pool |
| `deckent start` | Start the autonomous loop (default-deny + human-approval gate) |
| `deckent start [description]` | Start a new sprint (optionally with a one-line description for zero-config mode) |
| `deckent stats` | Show memory.db statistics |
| `deckent stats <name>` | Show sprint-by-sprint performance for an agent |
| `deckent status` | Show autonomous runtime summary (pending + last audit events) |
| `deckent status` | Report tracked docs by rank + stale state |
| `deckent status <executionId>` | Poll the status of a prior submission by executionId |
| `deckent stop` | Signal the autonomous loop to stop cleanly |
| `deckent submit <description>` | Submit an ExecutionRequest (policy-gated: read-only auto-runs, side-effecting parks for approval) |
| `deckent sync` | Update memory.db only (no front-matter writes) |
| `deckent sync` | Sync adapter files and detect out-of-band changes since last sprint |
| `deckent test` | Run a test sprint (no retro, no memory update, no decay) |
| `deckent test <name>` | Test a plugin: validate manifest and entrypoint, run hooks if available |
| `deckent tier <model>` | Look up the tier of a specific model by ID or API ID |
| `deckent track` | Track doc freshness (hash + DCR + stale) |
| `deckent truth` | Resolve the 4-level feature truth-chain (code → wired → enabled → proof) for manifest truth-blocks |
| `deckent undo <action-id>` | Undo a recent reversible action |
| `deckent update` | Fetch latest pricing from LiteLLM + OpenRouter |
| `deckent update <name>` | Update an installed skill from its original source |
| `deckent update <pathOrId>` | Update rules for an existing managed doc |
| `deckent update <source>` | Update a plugin (remove existing and re-install from source) |
| `deckent upgrade` | Self-update deckent |
| `deckent usage` | Show token/limit consumption from Claude Code transcripts |
| `deckent watch` | Follow a live worker (docker logs / tmux pane / subprocess log) with --follow &lt;taskId&gt;, or open the tmux dashboard split |
| `deckent web` | Start web dashboard with API server (deprecated — use `deckent serve |
<!-- AUTOGEN:END id="cli-tr" -->
