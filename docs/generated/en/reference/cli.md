# CLI Reference

> **Auto-generated from the canonical CLI contract and the live Commander tree. Do not edit by hand.**
> Run `npm run docs:generate-cli` to regenerate this document.

This reference covers every public command path, option, positional argument, effect, default execution, authority, output mode, platform contract, and alias.

## Command index

| Command | Description | Effect | Default execution | Authority | Output |
|---|---|---|---|---|---|
| [`deckent init`](#deckent-init) | Initialize a new Deckent project | Local write | Apply | Operator | Text |
| [`deckent start`](#deckent-start) | Start a new sprint (optionally with a one-line description for zero-config mode) | Process control | Apply | Operator | Stream |
| [`deckent plan`](#deckent-plan) | Plan a sprint without executing it | Local write | Apply | Operator | Text |
| [`deckent status`](#deckent-status) | Show the current run dashboard | Read-only | Read | Open | Text and JSON |
| [`deckent inspect`](#deckent-inspect) | Inspect canonical runs or task detail | Read-only | Read | Open | Text and JSON |
| [`deckent attach`](#deckent-attach) | Attach to the tmux orchestra session | Process control | Apply | Operator | Text |
| [`deckent spawn`](#deckent-spawn) | Manually spawn a worker for a task (BLOCKS until the worker exits on the docker backend; fire-and-forget on tmux/subprocess) | Process control | Apply | Operator | Text |
| [`deckent kill`](#deckent-kill) | Kill a running worker | Destructive process control | Apply | Owner | Text |
| [`deckent retro`](#deckent-retro) | Show the latest sprint retrospective | Read-only | Read | Open | Text and JSON |
| [`deckent cleanup`](#deckent-cleanup) | Clean up after a sprint | Local write | Preview; explicit apply required | Operator | Text and JSON |
| [`deckent doctor`](#deckent-doctor) | Check system dependencies and health | Read by default; explicit options may mutate state | Read | Operator | Text and JSON |
| [`deckent config`](#deckent-config) | Show or modify project configuration | Local write | Apply | Operator | Text |
| [`deckent config set`](#deckent-config-set) | Set a configuration value | Local write | Apply | Operator | Text |
| [`deckent config get`](#deckent-config-get) | Get a configuration value by key (supports dot notation) | Read-only | Read | Open | Text |
| [`deckent config export`](#deckent-config-export) | Export config to stdout or a file | Read by default; explicit options may mutate state | Read | Operator | Text |
| [`deckent config import`](#deckent-config-import) | Import config from a JSON file | Local write | Apply | Operator | Text |
| [`deckent config list`](#deckent-config-list) | List all config parameters grouped by category | Read-only | Read | Open | Text |
| [`deckent config keys`](#deckent-config-keys) | List all config parameter keys | Read-only | Read | Open | Text |
| [`deckent config migrate`](#deckent-config-migrate) | Migrate config.json to the latest full format (adds missing fields with defaults) | Local write | Apply | Operator | Text |
| [`deckent config nervous`](#deckent-config-nervous) | Configure Nervous System authority mode and action overrides | Local write | Apply | Operator | Text |
| [`deckent config nervous set`](#deckent-config-nervous-set) | Set a nervous system configuration value | Local write | Apply | Operator | Text |
| [`deckent config nervous override`](#deckent-config-nervous-override) | Set a per-action policy override | Local write | Apply | Operator | Text |
| [`deckent config nervous list`](#deckent-config-nervous-list) | Show current authority matrix with all presets | Read-only | Read | Open | Text |
| [`deckent config nervous reset`](#deckent-config-nervous-reset) | Reset all action overrides to preset defaults | Destructive process control | Apply | Owner | Text |
| [`deckent history`](#deckent-history) | Show run history | Read-only | Read | Open | Text and JSON |
| [`deckent plugin`](#deckent-plugin) | Manage plugins | Command group (help only) | Read | Open | Text |
| [`deckent plugin install`](#deckent-plugin-install) | Install a plugin from npm, git URL, or local path | Local write | Apply | Operator | Text |
| [`deckent plugin remove`](#deckent-plugin-remove) | Remove an installed plugin | Destructive process control | Apply | Owner | Text |
| [`deckent plugin update`](#deckent-plugin-update) | Update a plugin (remove existing and re-install from source) | Local write | Apply | Operator | Text |
| [`deckent plugin list`](#deckent-plugin-list) | List installed plugins | Read-only | Read | Open | Text and JSON |
| [`deckent plugin info`](#deckent-plugin-info) | Show plugin info (accepts absolute or relative path) | Read-only | Read | Open | Text |
| [`deckent plugin test`](#deckent-plugin-test) | Test a plugin: validate manifest and entrypoint, run hooks if available | Local write | Apply | Operator | Text |
| [`deckent plugin create`](#deckent-plugin-create) | Create a new plugin scaffold | Local write | Apply | Operator | Text |
| [`deckent upgrade`](#deckent-upgrade) | Self-update deckent | Process control | Apply | Operator | Text |
| [`deckent onboard`](#deckent-onboard) | Run the onboarding wizard | Local write | Preview; explicit apply required | Operator | Text and JSON |
| [`deckent analyze`](#deckent-analyze) | Analyze project stack, size, and recommended methodology | Read by default; explicit options may mutate state | Read | Operator | Text and JSON |
| [`deckent archive-debt`](#deckent-archive-debt) | Report tech-debt status (DB-first; resolved debt is auto-managed in memory.db) | Read-only | Read | Open | Text |
| [`deckent archive`](#deckent-archive) | Inspect, reconcile, and verify canonical sprint evidence archives | Command group (help only) | Read | Open | Text |
| [`deckent archive inspect`](#deckent-archive-inspect) | Build a read-only inventory without changing archive state | Read-only | Read | Open | Text and JSON |
| [`deckent archive reconcile`](#deckent-archive-reconcile) | Reconcile scattered evidence into canonical sprint archives (dry-run by default) | Local write | Preview; explicit apply required | Operator | Text and JSON |
| [`deckent archive verify`](#deckent-archive-verify) | Verify manifest coverage and every archived artifact digest | Read-only | Read | Open | Text and JSON |
| [`deckent archive terminal-inspect`](#deckent-archive-terminal-inspect) | Inspect canonical hot/archive journal parity without changing state | Read-only | Read | Open | Text and JSON |
| [`deckent archive terminal-verify`](#deckent-archive-terminal-verify) | Verify terminal receipt, archive integrity, and Brain adoption without changing state | Read-only | Read | Open | Text and JSON |
| [`deckent archive terminal-repair`](#deckent-archive-terminal-repair) | Repair one proven strict-prefix terminal journal with receipt-bound authority | Local write | Apply | Operator | Text and JSON |
| [`deckent dashboard`](#deckent-dashboard) | Show terminal dashboard with auto-refresh (see also: deckent status --watch) | Read-only | Read | Open | Text and JSON |
| [`deckent serve`](#deckent-serve) | Start HTTP API server with SSE support | Process control | Apply | Operator | Text |
| [`deckent sync`](#deckent-sync) | Sync adapter files and detect out-of-band changes since last sprint | Local write | Apply | Operator | Text and JSON |
| [`deckent watch`](#deckent-watch) | Follow a live worker (docker logs / tmux pane / subprocess log) with --follow <taskId>, or open the tmux dashboard split | Read-only | Read | Open | Stream |
| [`deckent run`](#deckent-run) | Run a single one-shot task without a sprint cycle | Process control | Apply | Operator | Text |
| [`deckent run start`](#deckent-run-start) | Note: 'run start\|status\|retro\|history' are aliases for the top-level 'deckent start\|status\|retro\|history' commands — identical behavior, same handler. 'sprint' terminology is being renamed to 'run'. | Process control | Apply | Operator | Text |
| [`deckent run status`](#deckent-run-status) | Note: 'run start\|status\|retro\|history' are aliases for the top-level 'deckent start\|status\|retro\|history' commands — identical behavior, same handler. 'sprint' terminology is being renamed to 'run'. | Read-only | Read | Open | Text |
| [`deckent run retro`](#deckent-run-retro) | Note: 'run start\|status\|retro\|history' are aliases for the top-level 'deckent start\|status\|retro\|history' commands — identical behavior, same handler. 'sprint' terminology is being renamed to 'run'. | Read-only | Read | Open | Text |
| [`deckent run history`](#deckent-run-history) | Note: 'run start\|status\|retro\|history' are aliases for the top-level 'deckent start\|status\|retro\|history' commands — identical behavior, same handler. 'sprint' terminology is being renamed to 'run'. | Read-only | Read | Open | Text |
| [`deckent runs`](#deckent-runs) | List run-flows (the multi-flow inbox) — plus per-run decide: --approve/--reject/--retire/--start | Read by default; explicit options may mutate state | Read | Operator | Text |
| [`deckent process`](#deckent-process) | Process-mode execution surface — submit tasks/capabilities and poll their status | Command group (help only) | Read | Open | Text |
| [`deckent process submit`](#deckent-process-submit) | Submit an ExecutionRequest (policy-gated: read-only auto-runs, side-effecting parks for approval) | Process control | Apply | Operator | Text |
| [`deckent process status`](#deckent-process-status) | Poll the status of a prior submission by executionId | Read-only | Read | Open | Text |
| [`deckent process result`](#deckent-process-result) | Show the full result of a submission (status + lastResult) | Read-only | Read | Open | Text |
| [`deckent test`](#deckent-test) | Run a test sprint (no retro, no memory update, no decay) | Process control | Apply | Operator | Text |
| [`deckent agent`](#deckent-agent) | Manage agent pool | Command group (help only) | Read | Open | Text |
| [`deckent agent lint`](#deckent-agent-lint) | Lint the agent catalog: reachability, coverage gaps, capability overlaps (V3) | Read-only | Read | Open | Text and JSON |
| [`deckent agent list`](#deckent-agent-list) | List all agents in the pool | Read-only | Read | Open | Text and JSON |
| [`deckent agent create`](#deckent-agent-create) | Create a custom agent (use --prompt/--description for wizard-style setup) | Local write | Apply | Operator | Text |
| [`deckent agent stats`](#deckent-agent-stats) | Show sprint-by-sprint performance for an agent | Read-only | Read | Open | Text and JSON |
| [`deckent agent enable`](#deckent-agent-enable) | Enable an agent | Local write | Apply | Operator | Text |
| [`deckent agent disable`](#deckent-agent-disable) | Disable an agent | Local write | Apply | Operator | Text |
| [`deckent agent delete`](#deckent-agent-delete) | Delete an agent from the pool | Destructive process control | Apply | Owner | Text |
| [`deckent agent edit`](#deckent-agent-edit) | Edit an agent configuration | Local write | Apply | Operator | Text |
| [`deckent agent reclassify`](#deckent-agent-reclassify) | Reclassify a recorded task outcome (delta-applies agent/skill stats) | Local write | Apply | Operator | Text |
| [`deckent agent info`](#deckent-agent-info) | Show detailed agent information | Read-only | Read | Open | Text |
| [`deckent skill`](#deckent-skill) | Manage skill pool | Command group (help only) | Read | Open | Text |
| [`deckent skill list`](#deckent-skill-list) | List all skills | Read-only | Read | Open | Text and JSON |
| [`deckent skill create`](#deckent-skill-create) | Create a custom skill | Local write | Apply | Operator | Text |
| [`deckent skill install`](#deckent-skill-install) | Install a skill from local path or git URL (supports version pinning: url#tag) | Local write | Apply | Operator | Text |
| [`deckent skill update`](#deckent-skill-update) | Update an installed skill from its original source | Local write | Apply | Operator | Text |
| [`deckent skill enable`](#deckent-skill-enable) | Enable a skill | Local write | Apply | Operator | Text |
| [`deckent skill disable`](#deckent-skill-disable) | Disable a skill | Local write | Apply | Operator | Text |
| [`deckent skill delete`](#deckent-skill-delete) | Delete a skill | Destructive process control | Apply | Owner | Text |
| [`deckent skill info`](#deckent-skill-info) | Show skill details | Read-only | Read | Open | Text |
| [`deckent skill search`](#deckent-skill-search) | Search skills in the marketplace registry | Read-only | Read | Open | Text and JSON |
| [`deckent skill publish`](#deckent-skill-publish) | Validate, sign (Ed25519) and publish a skill to the marketplace | Local write | Apply | Operator | Text |
| [`deckent review`](#deckent-review) | Review sprint tasks with evaluations | Local write | Apply | Operator | Text and JSON |
| [`deckent finalize`](#deckent-finalize) | Finalize a sprint: update MEMORY.md, RETRO.md, IDENTITY.md, config, and run decay | Local write | Apply | Operator | Text |
| [`deckent explain`](#deckent-explain) | Explain what the last sprint did in human-friendly language | Read-only | Read | Open | Text and JSON |
| [`deckent set-directives`](#deckent-set-directives) | Write sprint goals to DIRECTIVES.md (content, file, or stdin) | Local write | Apply | Operator | Text |
| [`deckent connect`](#deckent-connect) | Diagnose provider/MCP/IDE/shell connection status (read-only — no changes are made) | Read-only | Read | Open | Text and JSON |
| [`deckent plan-nl`](#deckent-plan-nl) | Turn a free-form goal into a DIRECTIVES.md scaffold (single-task template; preview by default) | Read by default; explicit options may mutate state | Read | Operator | Text |
| [`deckent do`](#deckent-do) | Golden-flow: turn a goal into a sprint plan (dry-run preview by default; --run to actually start it) | Process control | Preview; explicit apply required | Operator | Text |
| [`deckent heartbeat`](#deckent-heartbeat) | Run proactive heartbeat tasks from .deckent/HEARTBEAT.md | Process control | Apply | Operator | Text |
| [`deckent chat`](#deckent-chat) | Start a conversational session with Deckent. Uses your installed AI CLI. | Process control | Apply | Operator | Text |
| [`deckent checkpoint`](#deckent-checkpoint) | Manage human checkpoints — list, approve, or reject pending checkpoints | Command group (help only) | Read | Open | Text |
| [`deckent checkpoint list`](#deckent-checkpoint-list) | List all checkpoints | Read-only | Read | Open | Text and JSON |
| [`deckent checkpoint approve`](#deckent-checkpoint-approve) | Approve a pending checkpoint | Local write | Apply | Operator | Text |
| [`deckent checkpoint reject`](#deckent-checkpoint-reject) | Reject a pending checkpoint | Local write | Apply | Operator | Text |
| [`deckent docs`](#deckent-docs) | Manage user-defined documents | Command group (help only) | Read | Open | Text |
| [`deckent docs add`](#deckent-docs-add) | Add a document to managed docs | Local write | Apply | Operator | Text |
| [`deckent docs remove`](#deckent-docs-remove) | Remove a document from managed docs | Destructive process control | Apply | Owner | Text |
| [`deckent docs list`](#deckent-docs-list) | List all managed documents | Read-only | Read | Open | Text |
| [`deckent docs update`](#deckent-docs-update) | Update rules for an existing managed doc | Local write | Apply | Operator | Text |
| [`deckent docs run`](#deckent-docs-run) | Run managed doc updates without a sprint | Local write | Apply | Operator | Text |
| [`deckent docs track`](#deckent-docs-track) | Track doc freshness (hash + DCR + stale) | Command group (help only) | Read | Open | Text |
| [`deckent docs track scan`](#deckent-docs-track-scan) | Hash + timestamp + rank all docs; write front-matter; sync memory.db | Local write | Apply | Operator | Text |
| [`deckent docs track status`](#deckent-docs-track-status) | Report tracked docs by rank + stale state | Read-only | Read | Open | Text and JSON |
| [`deckent docs track sync`](#deckent-docs-track-sync) | Update memory.db only (no front-matter writes) | Local write | Apply | Operator | Text |
| [`deckent output`](#deckent-output) | Show captured output for a specific worker task | Read-only | Read | Open | Text and JSON |
| [`deckent task`](#deckent-task) | Inspect and reconcile immutable one-shot task settlement evidence | Command group (help only) | Read | Open | Text |
| [`deckent task settle`](#deckent-task-settle) | Inspect a task settlement plan; apply only with explicit operator attestation | Local write | Preview; explicit apply required | Operator | Text and JSON |
| [`deckent cost`](#deckent-cost) | User Safety Shield — cost management & estimation | Command group (help only) | Read | Open | Text |
| [`deckent cost show`](#deckent-cost-show) | Display model pricing (read-only) | Read-only | Read | Open | Text |
| [`deckent cost update`](#deckent-cost-update) | Fetch latest pricing from LiteLLM + OpenRouter | Local write | Apply | Operator | Text |
| [`deckent cost budget`](#deckent-cost-budget) | View or set cost budgets | Read by default; explicit options may mutate state | Read | Operator | Text |
| [`deckent recall`](#deckent-recall) | Search project memory — ADRs, sprint learnings, patterns, debt | Read-only | Read | Open | Text and JSON |
| [`deckent remember`](#deckent-remember) | Store a note in project memory | Local write | Apply | Operator | Text |
| [`deckent memory`](#deckent-memory) | Memory V2 management | Command group (help only) | Read | Open | Text |
| [`deckent memory rebuild`](#deckent-memory-rebuild) | Rebuild memory.db from .brain/exports/*.md files | Local write | Apply | Operator | Text |
| [`deckent memory export`](#deckent-memory-export) | Export memory.db to .brain/exports/*.md | Local write | Apply | Operator | Text |
| [`deckent memory stats`](#deckent-memory-stats) | Show memory.db statistics | Read-only | Read | Open | Text |
| [`deckent memory backup`](#deckent-memory-backup) | Create a WAL-safe backup of memory.db | Local write | Apply | Operator | Text |
| [`deckent memory relations`](#deckent-memory-relations) | Manage memory relations | Command group (help only) | Read | Open | Text |
| [`deckent memory relations list`](#deckent-memory-relations-list) | List all relations in memory.db | Read-only | Read | Open | Text |
| [`deckent memory relations review`](#deckent-memory-relations-review) | Review pending relations from backfill preview | Local write | Apply | Operator | Text |
| [`deckent trace`](#deckent-trace) | Trace extraction, immutable migration, and governed training-corpus tooling | Command group (help only) | Read | Open | Text |
| [`deckent trace extract`](#deckent-trace-extract) | Extract aligned + general training examples from Claude Code session transcript(s) | Local write | Apply | Operator | Text |
| [`deckent trace migrate`](#deckent-trace-migrate) | Reconcile historical JSONL traces into a canonical immutable projection (dry-run by default) | Local write | Preview; explicit apply required | Operator | Text and JSON |
| [`deckent trace corpus`](#deckent-trace-corpus) | Build and audit manifest-authorized Deckent training corpora | Command group (help only) | Read | Open | Text |
| [`deckent trace corpus build`](#deckent-trace-corpus-build) | Build a fail-closed ShareGPT corpus from a verified migration | Local write | Apply | Operator | Text and JSON |
| [`deckent trace corpus lint`](#deckent-trace-corpus-lint) | Verify corpus schema, provenance, causality, secrets, duplicates, and manifest reconciliation | Read-only | Read | Open | Text and JSON |
| [`deckent resume`](#deckent-resume) | Resume a sprint from its latest checkpoint | Process control | Apply | Operator | Text |
| [`deckent nervous`](#deckent-nervous) | Nervous System dashboard — monitor, accept, reject proactive suggestions | Read-only | Read | Open | Text |
| [`deckent nervous enable`](#deckent-nervous-enable) | Enable the Nervous System (one command; default stays OFF, human-approval preserved) | Local write | Apply | Owner | Text |
| [`deckent nervous accept`](#deckent-nervous-accept) | Accept a pending nervous system suggestion | Local write | Apply | Owner | Text |
| [`deckent nervous reject`](#deckent-nervous-reject) | Reject a pending nervous system suggestion | Local write | Apply | Owner | Text |
| [`deckent nervous edit`](#deckent-nervous-edit) | Modify and accept a pending suggestion | Local write | Apply | Owner | Text |
| [`deckent nervous undo`](#deckent-nervous-undo) | Undo a recent reversible action | Local write | Apply | Owner | Text |
| [`deckent nervous history`](#deckent-nervous-history) | View nervous system action history | Read-only | Read | Owner | Text |
| [`deckent nervous recommendations`](#deckent-nervous-recommendations) | View the Brain inbox — nervous proposals awaiting disposition | Read by default; explicit options may mutate state | Read | Owner | Text |
| [`deckent nervous log`](#deckent-nervous-log) | View raw nervous system log | Read-only | Read | Open | Stream |
| [`deckent nervous accept-panic`](#deckent-nervous-accept-panic) | Approve a PanicGuard-blocked worker kill (writes IPC marker) | Local write | Apply | Owner | Text |
| [`deckent nervous baseline-refresh`](#deckent-nervous-baseline-refresh) | Refresh directives_protection baseline to current DIRECTIVES.md content | Local write | Apply | Owner | Text |
| [`deckent mode`](#deckent-mode) | Get/set deckent_style (run (sprint) \| task \| process) | Command group (help only) | Read | Open | Text |
| [`deckent mode show`](#deckent-mode-show) | Show current mode | Read-only | Read | Open | Text |
| [`deckent mode sprint`](#deckent-mode-sprint) | Switch to sprint mode | Local write | Apply | Operator | Text |
| [`deckent mode run`](#deckent-mode-run) | Switch to run mode (bridge alias — stores deckent_style: "sprint") | Local write | Apply | Operator | Text |
| [`deckent mode task`](#deckent-mode-task) | Switch to task mode | Local write | Apply | Operator | Text |
| [`deckent mode process`](#deckent-mode-process) | Switch to process mode (continuous request-handling — ERP / automation via MCP + REST) | Local write | Apply | Operator | Text |
| [`deckent mode auto`](#deckent-mode-auto) | Auto-detect mode from context | Local write | Apply | Operator | Text |
| [`deckent mode global`](#deckent-mode-global) | Set global default (sprint\|task\|process) | Local write | Apply | Operator | Text |
| [`deckent features`](#deckent-features) | List features from .deckent/settings/features-manifest.json by category | Read-only | Read | Open | Text and JSON |
| [`deckent truth`](#deckent-truth) | Resolve the 4-level feature truth-chain (code → wired → enabled → proof) for manifest truth-blocks | Read by default; explicit options may mutate state | Read | Operator | Text and JSON |
| [`deckent audit`](#deckent-audit) | Run Brain Self-Audit Gate for a sprint, or query/export/retain audit log events (query \| compliance \| forward \| retention) | Process control | Preview; explicit apply required | Operator | Text and JSON |
| [`deckent audit-verify`](#deckent-audit-verify) | Verify the audit log HMAC chain for tamper evidence | Read-only | Read | Open | Text and JSON |
| [`deckent recover`](#deckent-recover) | Recover a crashed or stuck sprint through the canonical recovery operation | Local write | Apply | Operator | Text and JSON |
| [`deckent models`](#deckent-models) | Manage and browse the model catalog | Command group (help only) | Read | Open | Text |
| [`deckent models list`](#deckent-models-list) | List available models from the catalog | Read-only | Read | Owner | Text |
| [`deckent models activate`](#deckent-models-activate) | Allow a detected model to enter the routing pool | Local write | Apply | Owner | Text |
| [`deckent models deactivate`](#deckent-models-deactivate) | Remove a model from the routing pool (detection still sees it) | Local write | Apply | Owner | Text |
| [`deckent models activation`](#deckent-models-activation) | Show recorded model activation decisions (unrecorded = active) | Read-only | Read | Open | Text |
| [`deckent models policy`](#deckent-models-policy) | Show or set a provider activation policy (implicit-active \| explicit-active) | Read by default; explicit options may mutate state | Read | Owner | Text |
| [`deckent models active-set`](#deckent-models-active-set) | Show the resolved owner active execution set + snapshot digest | Read-only | Read | Open | Text |
| [`deckent models refresh`](#deckent-models-refresh) | Force-refresh the model catalog (invalidates 24h cache) | Local write | Apply | Owner | Text |
| [`deckent models tier`](#deckent-models-tier) | Look up the tier of a specific model by ID or API ID | Local write | Apply | Owner | Text |
| [`deckent flow`](#deckent-flow) | Manage scheduled flows (process mode) | Command group (help only) | Read | Open | Text |
| [`deckent flow list`](#deckent-flow-list) | List all scheduled flows | Read-only | Read | Open | Text and JSON |
| [`deckent flow add`](#deckent-flow-add) | Add a new scheduled flow (cron: 5-field expression, e.g. "* * * * *") | Process control | Apply | Operator | Text |
| [`deckent flow run`](#deckent-flow-run) | Run the flow-runtime tick once (--once) or start the daemon | Process control | Apply | Operator | Text |
| [`deckent flow approve`](#deckent-flow-approve) | Approve a pending event-triggered flow dispatch so it can proceed | Process control | Apply | Operator | Text |
| [`deckent rbac`](#deckent-rbac) | Role-based access control — check permissions and list roles | Command group (help only) | Read | Open | Text |
| [`deckent rbac check`](#deckent-rbac-check) | Check whether a role has permission to perform an action | Read-only | Read | Owner | Text |
| [`deckent rbac roles`](#deckent-rbac-roles) | List all roles and their effective permissions | Read-only | Read | Open | Text |
| [`deckent rbac grant`](#deckent-rbac-grant) | Assign a role to a user | Local write | Apply | Owner | Text |
| [`deckent rbac revoke`](#deckent-rbac-revoke) | Remove the role assignment for a user | Destructive process control | Apply | Owner | Text |
| [`deckent evolve`](#deckent-evolve) | Evolution analysis — cross-sprint trends and prompt suggestions | Command group (help only) | Read | Open | Text |
| [`deckent evolve report`](#deckent-evolve-report) | Show cross-sprint agent/skill trend report | Read-only | Read | Open | Text and JSON |
| [`deckent autonomous`](#deckent-autonomous) | Autonomous runtime — authority-bounded continuous loop | Command group (help only) | Read | Open | Text |
| [`deckent autonomous enable`](#deckent-autonomous-enable) | Enable autonomous mode (one command instead of editing config; default stays OFF) | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous start`](#deckent-autonomous-start) | Start the autonomous loop (default-deny + human-approval gate) | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous plan`](#deckent-autonomous-plan) | Decompose a high-level goal into pending autonomous backlog items | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous status`](#deckent-autonomous-status) | Show autonomous runtime summary (pending + last audit events) | Read-only | Read | Owner | Text |
| [`deckent autonomous stop`](#deckent-autonomous-stop) | Signal the autonomous loop to stop cleanly | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous cleanup`](#deckent-autonomous-cleanup) | Sweep stray autonomous run-artifacts (task-run-*, _*.pid) from .tasks/ | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous pending`](#deckent-autonomous-pending) | List parked approvals awaiting human accept/reject | Read-only | Read | Open | Text |
| [`deckent autonomous approve`](#deckent-autonomous-approve) | Approve a parked trigger — resolves the running loop's gate | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous reject`](#deckent-autonomous-reject) | Reject a parked trigger — resolves the running loop's gate | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous backlog`](#deckent-autonomous-backlog) | Manage the autonomous backlog (add / list / remove entries) | Command group (help only) | Read | Open | Text |
| [`deckent autonomous backlog add`](#deckent-autonomous-backlog-add) | Add a new entry to the autonomous backlog | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous backlog list`](#deckent-autonomous-backlog-list) | List autonomous backlog entries | Read-only | Read | Owner | Text |
| [`deckent autonomous backlog remove`](#deckent-autonomous-backlog-remove) | Remove an entry from the autonomous backlog (positional id or --id) | Destructive process control | Apply | Owner | Text |
| [`deckent autonomous-mission`](#deckent-autonomous-mission) | Manage autonomous missions created from work lists or goals | Command group (help only) | Read | Open | Text |
| [`deckent autonomous-mission create-list`](#deckent-autonomous-mission-create-list) | Create an autonomous mission from one or more work items | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous-mission create-goal`](#deckent-autonomous-mission-create-goal) | Create an autonomous mission that runs until its goal is reached | Autonomous loop control | Apply | Owner | Text |
| [`deckent autonomous-mission list`](#deckent-autonomous-mission-list) | List all missions (summary table) | Read-only | Read | Owner | Text and JSON |
| [`deckent bot`](#deckent-bot) | Messaging-connector bot — listen/start/stop/status for inbound approve/reject | Command group (help only) | Read | Open | Text |
| [`deckent bot listen`](#deckent-bot-listen) | Listen for inbound approve/reject commands from messaging connectors | Process control | Apply | Owner | Text |
| [`deckent bot start`](#deckent-bot-start) | Run the bot listener as a background daemon | Process control | Apply | Owner | Text |
| [`deckent bot stop`](#deckent-bot-stop) | Stop the bot daemon | Process control | Apply | Owner | Text |
| [`deckent bot status`](#deckent-bot-status) | Show whether the bot daemon is running | Read-only | Read | Owner | Text |
| [`deckent gateway`](#deckent-gateway) | Manage project-scoped messaging gateway sessions and pairing | Command group (help only) | Read | Open | Text |
| [`deckent gateway listen`](#deckent-gateway-listen) | Run the gateway listener in the foreground (attaches every paired connector) | Process control | Apply | Owner | Text |
| [`deckent gateway start`](#deckent-gateway-start) | Start the gateway daemon in the background | Process control | Apply | Owner | Text |
| [`deckent gateway stop`](#deckent-gateway-stop) | Stop the running gateway daemon | Process control | Apply | Owner | Text |
| [`deckent gateway status`](#deckent-gateway-status) | Show whether the gateway daemon is running | Read-only | Read | Owner | Text |
| [`deckent gateway pair`](#deckent-gateway-pair) | Review and settle device pairing requests: list the codes waiting for an operator, then approve one onto a project or reject it. | Command group (help only) | Read | Open | Text |
| [`deckent gateway pair list`](#deckent-gateway-pair-list) | List pending pairing requests | Read-only | Read | Owner | Text |
| [`deckent gateway pair approve`](#deckent-gateway-pair-approve) | Approve a pairing request and bind it to a project | Process control | Apply | Owner | Text |
| [`deckent gateway pair reject`](#deckent-gateway-pair-reject) | Reject a pending pairing request | Process control | Apply | Owner | Text |
| [`deckent mcp`](#deckent-mcp) | Manage Model Context Protocol servers — an open standard, portable across every MCP-capable host | Command group (help only) | Read | Open | Text |
| [`deckent mcp add`](#deckent-mcp-add) | Add an MCP server (stdio or http) — writes to .mcp.json by scope | Local write | Apply | Operator | Text |
| [`deckent mcp list`](#deckent-mcp-list) | List registered MCP servers (merged: local > project > user) | Read-only | Read | Open | Text and JSON |
| [`deckent mcp remove`](#deckent-mcp-remove) | Remove an MCP server (searches all scopes if --scope omitted) | Destructive process control | Apply | Owner | Text |
| [`deckent mcp get`](#deckent-mcp-get) | Show details for an MCP server (from merged view) | Read-only | Read | Open | Text and JSON |
| [`deckent resources`](#deckent-resources) | Show live docker worker resource usage or analyze resource log | Read-only | Read | Open | Text and JSON |
| [`deckent usage`](#deckent-usage) | Show token/limit consumption from Claude Code transcripts | Read by default; explicit options may mutate state | Read | Operator | Text and JSON |
| [`deckent kpi`](#deckent-kpi) | Show the KPI scorecard for the current (or a specific) sprint | Read-only | Read | Open | Text and JSON |
| [`deckent image`](#deckent-image) | Worker Docker image management | Command group (help only) | Read | Open | Text |
| [`deckent image build`](#deckent-image-build) | Build the deckent-worker Docker image from the packaged Dockerfile.worker | Local write | Apply | Operator | Text |
| [`deckent limits`](#deckent-limits) | Check live subscription-window usage (session/week) and the configured start-gate thresholds | Read-only | Read | Open | Text and JSON |
| [`deckent openrouter-probe`](#deckent-openrouter-probe) | Live-probe OpenRouter free models via $DECK:OPENROUTER_API_KEY and refresh the local cache | Read-only | Read | Open | Text and JSON |
| [`deckent xverify`](#deckent-xverify) | Cross-verify a claim on a DIFFERENT provider; the host derives ALLOW/NO-GO/HOLD from typed evidence | Read-only | Read | Open | Text and JSON |
| [`deckent approvals`](#deckent-approvals) | Runtime-wide approval inbox — list pending requests and decide them over the live-authenticated local-terminal channel | Command group (help only) | Read | Open | Text |
| [`deckent approvals list`](#deckent-approvals-list) | List pending approval requests | Read-only | Read | Owner | Text |
| [`deckent approvals decide`](#deckent-approvals-decide) | Decide one pending approval request; requires an interactive TTY re-authentication | Local write | Apply | Owner | Text |
| [`deckent approvals rules`](#deckent-approvals-rules) | Persistent approval rules (approval-rules.json) — list, disable, enable, remove | Command group (help only) | Read | Open | Text |
| [`deckent approvals rules list`](#deckent-approvals-rules-list) | List rules with status | Read-only | Read | Owner | Text |
| [`deckent approvals rules apply`](#deckent-approvals-rules-apply) | Apply active rules to the current pending inbox (routine-tier automatable kinds only) | Local write | Apply | Owner | Text |
| [`deckent approvals rules disable`](#deckent-approvals-rules-disable) | Disable a rule (kept for audit; re-enable any time) | Local write | Apply | Owner | Text |
| [`deckent approvals rules enable`](#deckent-approvals-rules-enable) | Re-enable a disabled rule | Local write | Apply | Owner | Text |
| [`deckent approvals rules remove`](#deckent-approvals-rules-remove) | Remove a rule permanently | Destructive process control | Apply | Owner | Text |
| [`deckent confirmations`](#deckent-confirmations) | Custom-confirmation inbox — pending acceptance-matrix routes (llm/human/code adapters) | Command group (help only) | Read | Open | Text |
| [`deckent confirmations list`](#deckent-confirmations-list) | List pending confirmation requests | Read-only | Read | Owner | Text |
| [`deckent confirmations decide`](#deckent-confirmations-decide) | Decide one HUMAN-adapter confirmation (interactive terminal, single-shot) | Local write | Apply | Owner | Text |
| [`deckent confirmations run`](#deckent-confirmations-run) | Run pending LLM-adapter confirmations through cross-provider adjudication (xverify runtime) | Local write | Apply | Owner | Text |
| [`deckent provider-authority`](#deckent-provider-authority) | Inspect and provision the host-scoped provider authority keyring (owner-gated) | Command group (help only) | Read | Open | Text |
| [`deckent provider-authority keyring`](#deckent-provider-authority-keyring) | Provider authority keyring — status / init / rotate | Command group (help only) | Read | Open | Text |
| [`deckent provider-authority keyring status`](#deckent-provider-authority-keyring-status) | Show keyring location and revision state (never prints key material) | Read-only | Read | Owner | Text |
| [`deckent provider-authority keyring init`](#deckent-provider-authority-keyring-init) | Provision the keyring genesis revision (owner action; refuses if one exists) | Local write | Apply | Owner | Text |
| [`deckent provider-authority keyring rotate`](#deckent-provider-authority-keyring-rotate) | Rotate the active authority key (requires --expect-revision) | Local write | Apply | Owner | Text |
| [`deckent provider-authority limits`](#deckent-provider-authority-limits) | Provider-limit authority — author the `provider_limits` policy from live provider truth | Command group (help only) | Read | Open | Text |
| [`deckent provider-authority limits init`](#deckent-provider-authority-limits-init) | Derive and write the global `provider_limits` block for one exact provider scope (owner-confirmed) | Local write | Apply | Owner | Text |
| [`deckent provider-observations`](#deckent-provider-observations) | Inspect and migrate the durable provider-execution observation store: read its schema and counts, migrate it forward, adopt an external preimage, or reconcile recorded runs. | Command group (help only) | Read | Open | Text |
| [`deckent provider-observations inspect`](#deckent-provider-observations-inspect) | Read the observation store and report its schema version and record counts. Read-only: never migrates, adopts or writes. | Read-only | Read | Owner | Text and JSON |
| [`deckent provider-observations migrate`](#deckent-provider-observations-migrate) | Migrate the observation store to the current schema version. Plans and prints the migration by default; --apply performs it under an approval. | Local write | Preview; explicit apply required | Owner | Text and JSON |
| [`deckent provider-observations adopt`](#deckent-provider-observations-adopt) | Adopt an external observation preimage into the store as durable records. Plans by default; --apply performs the adoption. | Local write | Preview; explicit apply required | Owner | Text and JSON |
| [`deckent provider-observations adopt-runtime`](#deckent-provider-observations-adopt-runtime) | Adopt a runtime-produced observation preimage, keeping the runtime's own execution identity. Plans by default; --apply performs the adoption. | Local write | Preview; explicit apply required | Owner | Text and JSON |
| [`deckent provider-observations reconcile`](#deckent-provider-observations-reconcile) | Compare recorded observations against the runs they claim and report every mismatch. Plans by default; --apply writes the reconciliation. | Local write | Preview; explicit apply required | Owner | Text and JSON |
| [`deckent execution-authority`](#deckent-execution-authority) | Inspect and reconcile project execution authority bindings | Command group (help only) | Read | Open | Text |
| [`deckent execution-authority mount-adopt`](#deckent-execution-authority-mount-adopt) | Reconcile namespace-local Linux/WSL mount metadata without changing execution authority | Local write | Preview; explicit apply required | Owner | Text and JSON |
| [`deckent cu-status`](#deckent-cu-status) | Show computer-use configuration and availability for each capability | Read-only | Read | Open | Text and JSON |
| [`deckent local-llm`](#deckent-local-llm) | Manage the project-scoped local LLM runtime | Command group (help only) | Read | Open | Text |
| [`deckent local-llm start`](#deckent-local-llm-start) | Start the configured local LLM server | Process control | Apply | Operator | Text |
| [`deckent local-llm status`](#deckent-local-llm-status) | Inspect local LLM health and advertised models | Read-only | Read | Open | Text |
| [`deckent local-llm stop`](#deckent-local-llm-stop) | Stop the project-scoped local LLM server | Process control | Apply | Operator | Text |
| [`deckent help-info`](#deckent-help-info) | Show quick-reference help (localized) | Read-only | Read | Open | Text |

---

<a id="deckent-init"></a>
## `deckent init`

Initialize a new Deckent project

**Usage:** `deckent init`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--auto` | Auto-detect system, subscription, and project to generate recommendations |
| `--manual` | Skip auto-detection, use interactive prompts only |
| `--cursor` | Configure for Cursor IDE environment |
| `--claude-code` | Configure for Claude Code environment (default) |
| `--env <envs>` | Comma-separated environments to configure (codex,cursor,gemini,vscode,shell) |
| `--all-envs` | Configure ALL environment configs |
| `--upgrade` | Update existing files while preserving user customizations (merge strategy) |
| `--force` | Force overwrite of existing env files without warning |
| `--repair` | Show which init steps failed and how to fix them |
| `-y, --yes` | Use non-interactive defaults; never install missing prerequisites |
| `--install` | Explicitly install supported missing prerequisites without prompting |
| `--no-install` | Detect missing prerequisites but never install them |
| `--no-image` | Skip the opt-in worker Docker image build offer (no prompt) |

---

<a id="deckent-start"></a>
## `deckent start`

Start a new sprint (optionally with a one-line description for zero-config mode)

**Usage:** `deckent start [description]`

### Details

Plans new work or consumes an explicitly approved RunFlow, performs the configured admission checks, and dispatches workers through the selected backend. Dry-run plans without dispatch; hidden exact-start capabilities are coordinator-owned and are never entered by hand.

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Stream | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--auto-approve` | Auto-approve worker actions (--dangerously-skip-permissions) |
| `--sandbox-mode` | Run in sandbox mode (git stash + restore) |
| `--sandbox` | Use sandbox spawn backend (memory-cap + path-jail isolation, no Docker required) |
| `--dry-run` | Plan sprint without spawning workers |
| `--force` | Skip doctor pre-flight checks |
| `--force-scope` | Bypass the pre-spawn scope gate (allow write paths that do not exist / look like typos) |
| `--force-prompt-gate` | Bypass the plan-time prompt-gate BLOCK (persona-capability mismatch) |
| `--force-replan` | Consciously bypass the approved-flow guard: plan fresh even though an approved, not-yet-executed RunFlow snapshot exists |
| `--consume-approved <flowId>` | Consume a specific approved, not-yet-executed RunFlow snapshot through the canonical run-flow machinery (needed only when several approved flows exist) |
| `--watch` | Automatically open watch mode after sprint spawns workers |
| `--timeout <ms>` | Sprint timeout in milliseconds (default: 30 minutes) |
| `--force-directives` | Override existing DIRECTIVES.md in zero-config mode |
| `--flow-id <id>` | Consume an approved RunFlow snapshot instead of planning fresh — requires --revision, --plan-digest and config.terminal.run_flow_v2=true |
| `--revision <n>` | RunFlow proposal revision to CAS-verify against the approved snapshot (used with --flow-id) |
| `--plan-digest <digest>` | RunFlow planDigest to CAS-verify against the approved snapshot (used with --flow-id) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[description]` | One-line sprint description for zero-config mode; omit to plan from DIRECTIVES.md | No | No |

---

<a id="deckent-plan"></a>
## `deckent plan`

Plan a sprint without executing it

**Usage:** `deckent plan`

### Details

Builds the canonical task plan from the active directives. Dry-run prints without task-file writes; normal execution follows the command’s approval and exact-projection checks before persisting plan artifacts.

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--no-confirm` | Skip confirmation, auto-approve plan |
| `-y, --yes` | Non-interactive: auto-approve the plan (DRAFT → PENDING) without prompting |
| `--structured` | Force structured parsing (skip AI) |
| `--dry-run` | Show plan without writing task files to disk |
| `--interrogate` | Challenge directives with structural questions before planning |
| `--force-prompt-gate` | Bypass the plan-time prompt-gate BLOCK (persona-capability mismatch) |
| `--force-scope` | Acknowledge suspect scope paths for this exact plan |
| `--write-allowlist <paths...>` | Bind the exact plan to an existing-file closed write allowlist; repeat paths after the option |
| `--adopt-existing <sprintId>` | Explicitly reconcile an existing legacy Sprint projection into this exact plan |
| `--expected-plan-digest <sha256>` | Owner-observed V4 execution-plan digest required for adoption |
| `--expected-projection-digest <sha256>` | Owner-observed legacy task-projection digest required for adoption |
| `--expected-canonical-projection-digest <sha256>` | Owner-observed post-reconciliation task-projection digest required for adoption |
| `--adoption-actor <actorId>` | Stable owner/principal identity authorizing projection adoption |
| `--adoption-justification <text>` | Bound operator justification for the one-time projection adoption |

---

<a id="deckent-status"></a>
## `deckent status`

Show the current run dashboard

**Usage:** `deckent status`

### Details

Projects the current run lifecycle, logical task progress, worker evidence, and alerts. Text views are for operators; --json emits the machine-readable read model, while --watch and --follow keep the terminal attached.

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--watch` | Refresh the rendered status snapshot every two seconds until interrupted. |
| `-f, --follow` | Print the current snapshot, then stream newly appended run events. |
| `--json` | Emit the canonical status read model as JSON instead of a rendered dashboard. |
| `--raw` | Render the legacy raw dashboard projection for compatibility. |
| `--verbose` | Include detailed agent, skill, and assignment evidence. |
| `--no-color` | Disable ANSI color in rendered text output. |
| `--graph` | Render the active run dependency graph as Mermaid text. |
| `--mode <mode>` | Select a render identifier currently accepted by the handler: explainatory (explanatory view), standart (standard view), verbose, or json. |

---

<a id="deckent-inspect"></a>
## `deckent inspect`

Inspect canonical runs or task detail

**Usage:** `deckent inspect [taskId]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Output machine-readable JSON |
| `--follow` | Follow live inspector revisions |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[taskId]` | Task to inspect; omit to inspect the canonical run list | No | No |

---

<a id="deckent-attach"></a>
## `deckent attach`

Attach to the tmux orchestra session

**Usage:** `deckent attach`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--list` | List all tmux windows without attaching |

---

<a id="deckent-spawn"></a>
## `deckent spawn`

Manually spawn a worker for a task (BLOCKS until the worker exits on the docker backend; fire-and-forget on tmux/subprocess)

**Usage:** `deckent spawn <taskId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--force` | Force respawn even if task is DONE or NO_GO |
| `--auto-approve` | Enable auto-approve mode for the worker |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<taskId>` | Task the worker should be spawned for | Yes | No |

---

<a id="deckent-kill"></a>
## `deckent kill`

Kill a running worker

**Usage:** `deckent kill [taskId]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--all` | Kill all active workers |
| `--force` | Force kill (bypass panic guard) |
| `--user-explicit` | Explicit user confirmation for panic kill override |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[taskId]` | Worker task to terminate; omit together with --all to terminate every active worker | No | No |

---

<a id="deckent-retro"></a>
## `deckent retro`

Show the latest sprint retrospective

**Usage:** `deckent retro`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--raw` | Print the stored RETRO.md source instead of the rendered projection |
| `--compare` | Add a delta projection against the previous sprint entry |
| `--json` | Emit the read-model projection as JSON instead of a rendered table |
| `--perf` | Add the agent and skill performance projections |
| `--trend [n]` | Add a success-rate trend projection across the last N sprint entries (default: 5) |

---

<a id="deckent-cleanup"></a>
## `deckent cleanup`

Clean up after a sprint

**Usage:** `deckent cleanup`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--decay` | Force the configured memory and debt decay pass during cleanup; managed Brain projections may be rewritten. |
| `--dry-run` | Preview the task, lock, prompt, and session artifacts cleanup would remove; write nothing. |
| `--history` | Plan bounded runtime-history retention; the command remains a dry-run unless --apply is supplied. |
| `--apply` | Apply the runtime-history plan identified by --plan-digest. |
| `--plan-digest <digest>` | Exact digest of the runtime-history plan required by --apply; changed authority is rejected. |
| `--json` | Emit the path-free runtime-history plan or receipt as one JSON document. |
| `--sprint <id>` | Clean only artifacts owned by the exact sprint ID |

---

<a id="deckent-doctor"></a>
## `deckent doctor`

Check system dependencies and health

**Usage:** `deckent doctor`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--profile` | Show the detected host, runtime, and platform-adapter profile. |
| `--legacy` | Render the compatibility output format instead of the current diagnostic view. |
| `--json` | Emit doctor checks and evidence as one machine-readable JSON document. |
| `--pre-flight` | Run the stricter health gates used before worker dispatch and exit non-zero when dispatch must be held. |
| `--providers` | Show binary, version, reachability, and authentication evidence for provider adapters supported by doctor. |
| `--memory` | Show detected host RAM, its evidence source, and the resulting max_workers recommendation. |
| `--ram-experiment` | Evaluate the configured six-worker, 2 GiB-per-worker scenario against detected host RAM. |
| `--fix-image` | After interactive confirmation, rebuild the worker image when doctor finds it missing or stale. |
| `--fix` | Preview the closed whitelist of safe local repairs. It deletes no live data and performs no provider login; use --yes to apply. |
| `-y, --yes` | Apply the repairs listed by --fix; has no effect without --fix. |
| `--dry-run` | Force --fix to remain a no-write preview; wins when --yes is also supplied. |

---

<a id="deckent-config"></a>
## `deckent config`

Show or modify project configuration

**Usage:** `deckent config`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--raw` | Show raw project config without merging defaults |

---

<a id="deckent-config-set"></a>
## `deckent config set`

Set a configuration value

**Usage:** `deckent config set <key> <value>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<key>` | Configuration key (dot notation, e.g. terminal.run_flow_v2) | Yes | No |
| `<value>` | New value; JSON literals are parsed, anything else is stored as a string | Yes | No |

---

<a id="deckent-config-get"></a>
## `deckent config get`

Get a configuration value by key (supports dot notation)

**Usage:** `deckent config get <key>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<key>` | Configuration key (dot notation, e.g. terminal.run_flow_v2) | Yes | No |

---

<a id="deckent-config-export"></a>
## `deckent config export`

Export config to stdout or a file

**Usage:** `deckent config export [file]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[file]` | Destination file; omit to write the export to stdout | No | No |

---

<a id="deckent-config-import"></a>
## `deckent config import`

Import config from a JSON file

**Usage:** `deckent config import <file>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<file>` | JSON file to import the project configuration from | Yes | No |

---

<a id="deckent-config-list"></a>
## `deckent config list`

List all config parameters grouped by category

**Usage:** `deckent config list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-config-keys"></a>
## `deckent config keys`

List all config parameter keys

**Usage:** `deckent config keys`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-config-migrate"></a>
## `deckent config migrate`

Migrate config.json to the latest full format (adds missing fields with defaults)

**Usage:** `deckent config migrate`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--dry-run` | Show what would be changed without modifying files |

---

<a id="deckent-config-nervous"></a>
## `deckent config nervous`

Configure Nervous System authority mode and action overrides

**Usage:** `deckent config nervous`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-config-nervous-set"></a>
## `deckent config nervous set`

Set a nervous system configuration value

**Usage:** `deckent config nervous set <key> <value>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<key>` | Configuration key to set, for example mode. | Yes | No |
| `<value>` | Value to store under the given configuration key. | Yes | No |

---

<a id="deckent-config-nervous-override"></a>
## `deckent config nervous override`

Set a per-action policy override

**Usage:** `deckent config nervous override <actionId> <policy>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<actionId>` | Nervous action identifier whose policy override will be changed. | Yes | No |
| `<policy>` | Override policy to assign to the selected action. | Yes | No |

---

<a id="deckent-config-nervous-list"></a>
## `deckent config nervous list`

Show current authority matrix with all presets

**Usage:** `deckent config nervous list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-config-nervous-reset"></a>
## `deckent config nervous reset`

Reset all action overrides to preset defaults

**Usage:** `deckent config nervous reset`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-history"></a>
## `deckent history`

Show run history

**Usage:** `deckent history`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--agent <name>` | Restrict the projection to entries recorded for this agent |
| `--skill <name>` | Restrict the projection to entries recorded for this skill |
| `--json` | Emit the read-model projection as JSON instead of a rendered table |
| `--last <n>` | Show only last N runs |
| `--trend` | Show success rate/coverage trend analysis for last 5 runs |

---

<a id="deckent-plugin"></a>
## `deckent plugin`

Manage plugins

**Usage:** `deckent plugin`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-plugin-install"></a>
## `deckent plugin install`

Install a plugin from npm, git URL, or local path

**Usage:** `deckent plugin install <source>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--force` | Overwrite an existing plugin entry instead of failing |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<source>` | Install source: a local path or a remote plugin reference | Yes | No |

---

<a id="deckent-plugin-remove"></a>
## `deckent plugin remove`

Remove an installed plugin

**Usage:** `deckent plugin remove <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Plugin name exactly as the plugin entry records it | Yes | No |

---

<a id="deckent-plugin-update"></a>
## `deckent plugin update`

Update a plugin (remove existing and re-install from source)

**Usage:** `deckent plugin update <source>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<source>` | Install source: a local path or a remote plugin reference | Yes | No |

---

<a id="deckent-plugin-list"></a>
## `deckent plugin list`

List installed plugins

**Usage:** `deckent plugin list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the read-model projection as JSON instead of a rendered table |

---

<a id="deckent-plugin-info"></a>
## `deckent plugin info`

Show plugin info (accepts absolute or relative path)

**Usage:** `deckent plugin info <dir>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<dir>` | Plugin directory to inspect | Yes | No |

---

<a id="deckent-plugin-test"></a>
## `deckent plugin test`

Test a plugin: validate manifest and entrypoint, run hooks if available

**Usage:** `deckent plugin test <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Plugin name exactly as the plugin entry records it | Yes | No |

---

<a id="deckent-plugin-create"></a>
## `deckent plugin create`

Create a new plugin scaffold

**Usage:** `deckent plugin create <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Name for the new plugin entry | Yes | No |

---

<a id="deckent-upgrade"></a>
## `deckent upgrade`

Self-update deckent

**Usage:** `deckent upgrade`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--check` | Only check for updates, do not install |
| `--changelog` | Show changelog for the latest version and exit |
| `--canary` | Install from canary channel (pre-release) |
| `--beta` | Install from beta channel (pre-release) |
| `--rollback` | Roll back to the previous version |
| `--local <path>` | Install from a local .tgz file (beta development) |

---

<a id="deckent-onboard"></a>
## `deckent onboard`

Run the onboarding wizard

**Usage:** `deckent onboard`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--non-interactive` | Skip interactive prompts, use defaults |
| `--force` | Re-run onboarding even if already initialized |
| `--plan-only` | Print the onboarding plan without prompting (non-interactive, CI/test path) |
| `--json` | Output the --plan-only report as JSON |
| `--apply` | Apply the onboarding config plan: plan preview -> confirm -> write (project-scope) |
| `--dry-run` | Preview the onboarding apply without writing anything (implies --apply) |
| `-y, --yes` | Skip the apply confirmation prompt (implies --apply) |

---

<a id="deckent-analyze"></a>
## `deckent analyze`

Analyze project stack, size, and recommended methodology

**Usage:** `deckent analyze`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Operator | Text and JSON | `darwin`, `linux`, `win32` | `analyze-project` |

### Options

| Flags | Description |
|---|---|
| `--json` | Output raw JSON |
| `--bootstrap-vocabulary` | Derive and write the project routing-vocabulary layer (.deckent/routing/vocabulary.json) |

---

<a id="deckent-archive-debt"></a>
## `deckent archive-debt`

Report tech-debt status (DB-first; resolved debt is auto-managed in memory.db)

**Usage:** `deckent archive-debt`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--count` | Project only the open/resolved counts, not the individual entries |
| `--before <sprint>` | Also project resolved entries that originate before this sprint ID |

---

<a id="deckent-archive"></a>
## `deckent archive`

Inspect, reconcile, and verify canonical sprint evidence archives

**Usage:** `deckent archive`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-archive-inspect"></a>
## `deckent archive inspect`

Build a read-only inventory without changing archive state

**Usage:** `deckent archive inspect`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Select one sprint ID |
| `--all` | Select every discovered sprint |
| `--json` | Output stable JSON |

---

<a id="deckent-archive-reconcile"></a>
## `deckent archive reconcile`

Reconcile scattered evidence into canonical sprint archives (dry-run by default)

**Usage:** `deckent archive reconcile`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Select one sprint ID |
| `--all` | Select every discovered sprint |
| `--apply` | Apply the reconciliation plan |
| `--retire-legacy` | Retire verified legacy copies after canonical publication |
| `--json` | Output stable JSON |

---

<a id="deckent-archive-verify"></a>
## `deckent archive verify`

Verify manifest coverage and every archived artifact digest

**Usage:** `deckent archive verify`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Select one sprint ID |
| `--all` | Select every discovered sprint |
| `--json` | Output stable JSON |

---

<a id="deckent-archive-terminal-inspect"></a>
## `deckent archive terminal-inspect`

Inspect canonical hot/archive journal parity without changing state

**Usage:** `deckent archive terminal-inspect`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Select exactly one sprint ID |
| `--hot-journal <path>` | Use this exact hot journal path |
| `--json` | Output stable JSON |

---

<a id="deckent-archive-terminal-verify"></a>
## `deckent archive terminal-verify`

Verify terminal receipt, archive integrity, and Brain adoption without changing state

**Usage:** `deckent archive terminal-verify`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Select exactly one sprint ID |
| `--hot-journal <path>` | Use this exact hot journal path |
| `--json` | Output stable JSON |

---

<a id="deckent-archive-terminal-repair"></a>
## `deckent archive terminal-repair`

Repair one proven strict-prefix terminal journal with receipt-bound authority

**Usage:** `deckent archive terminal-repair`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Select exactly one sprint ID |
| `--hot-journal <path>` | Use this exact hot journal path |
| `--receipt <path>` | Use this exact terminal receipt identity |
| `--final-sequence <n>` | Require this final event sequence |
| `--final-digest <sha256>` | Require this final event SHA-256 |
| `--expected-archive-digest <sha256>` | Require this archived preimage SHA-256 |
| `--expected-hot-digest <sha256>` | Require this hot journal SHA-256 |
| `--reason <text>` | Record the operator repair reason |
| `--json` | Output stable JSON |

---

<a id="deckent-dashboard"></a>
## `deckent dashboard`

Show terminal dashboard with auto-refresh (see also: deckent status --watch)

**Usage:** `deckent dashboard`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--interval <ms>` | Refresh interval in milliseconds (used as fallback when fs.watch unavailable) |
| `--no-color` | Disable ANSI colors (also respects NO_COLOR env var) |
| `--json` | Output dashboard state as raw JSON and exit (shared format with deckent status --raw) |

---

<a id="deckent-serve"></a>
## `deckent serve`

Start HTTP API server with SSE support

**Usage:** `deckent serve`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--port <number>` | TCP port the dashboard server listens on. |
| `--dev` | Proxy asset requests to a running Vite dev server instead of serving the built bundle. |
| `--dev-port <number>` | Port the Vite dev server is expected on when --dev is used. |
| `--host <addr>` | Address the server binds to; the loopback default keeps it off the network. |
| `--no-terminal` | Serve the dashboard without the embedded web terminal. |

---

<a id="deckent-sync"></a>
## `deckent sync`

Sync adapter files and detect out-of-band changes since last sprint

**Usage:** `deckent sync`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--git-only` | Only detect git changes (skip adapter file sync) |
| `--adapters-only` | Only sync adapter files (skip git change detection) |
| `--dry-run` | Preview changes without writing anything |
| `--json` | Output result as JSON |

---

<a id="deckent-watch"></a>
## `deckent watch`

Follow a live worker (docker logs / tmux pane / subprocess log) with --follow <taskId>, or open the tmux dashboard split

**Usage:** `deckent watch`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Stream | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--follow <taskId>` | Follow a specific worker live — docker logs -f (docker backend), tmux pane, or subprocess log |

---

<a id="deckent-run"></a>
## `deckent run`

Run a single one-shot task without a sprint cycle

**Usage:** `deckent run <description>`

### Details

Runs one provider-backed task and waits for its recorded result; it does not execute the full sprint lifecycle. The reserved first words start, status, retro, and history select compatibility subcommands instead.

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--model <model>` | Model to use — an exact provider model ID (e.g. claude-sonnet-5, gpt-5.6-sol). Omit to use the configured default. Moving/legacy aliases (sonnet/opus/haiku/gpt-5/gpt-5.6) are rejected. |
| `--provider <name>` | Explicit provider ownership (claude\|codex\|gemini\|cursor\|ollama\|openrouter\|local-llm) — required to register an unseen versioned model ID; validated against the canonical registry. |
| `--model-effort <level>` | Native model reasoning-effort (claude: low\|medium\|high\|xhigh\|max, codex: minimal\|low\|medium\|high). Opt-in; unsupported or invalid levels are ignored |
| `--scope <dir>` | Worker scope directory (default: ./) |
| `--timeout <ms>` | Maximum wait time in milliseconds (default: 300000) |
| `--keep` | Keep task files after completion (skip cleanup) |
| `--auto-approve` | Pass auto-approve flag to the worker |
| `--verbose` | Stream worker log output to stdout in real-time |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<description>` | What the one-shot task should accomplish. The first word must not be start, status, retro or history — those are reserved sub-command names. | Yes | No |

---

<a id="deckent-run-start"></a>
## `deckent run start`

Note: 'run start|status|retro|history' are aliases for the top-level 'deckent start|status|retro|history' commands — identical behavior, same handler. 'sprint' terminology is being renamed to 'run'.

**Usage:** `deckent run start [args...]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[args...]` | Arguments forwarded verbatim to the top-level command this alias delegates to | No | Yes |

---

<a id="deckent-run-status"></a>
## `deckent run status`

Note: 'run start|status|retro|history' are aliases for the top-level 'deckent start|status|retro|history' commands — identical behavior, same handler. 'sprint' terminology is being renamed to 'run'.

**Usage:** `deckent run status [args...]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[args...]` | Arguments forwarded verbatim to the top-level command this alias delegates to | No | Yes |

---

<a id="deckent-run-retro"></a>
## `deckent run retro`

Note: 'run start|status|retro|history' are aliases for the top-level 'deckent start|status|retro|history' commands — identical behavior, same handler. 'sprint' terminology is being renamed to 'run'.

**Usage:** `deckent run retro [args...]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[args...]` | Arguments forwarded verbatim to the top-level command this alias delegates to | No | Yes |

---

<a id="deckent-run-history"></a>
## `deckent run history`

Note: 'run start|status|retro|history' are aliases for the top-level 'deckent start|status|retro|history' commands — identical behavior, same handler. 'sprint' terminology is being renamed to 'run'.

**Usage:** `deckent run history [args...]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[args...]` | Arguments forwarded verbatim to the top-level command this alias delegates to | No | Yes |

---

<a id="deckent-runs"></a>
## `deckent runs`

List run-flows (the multi-flow inbox) — plus per-run decide: --approve/--reject/--retire/--start

**Usage:** `deckent runs [n]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--limit <n>` | Show up to n inbox rows (default: the recent window; a flow-id prefix always resolves against every flow) |
| `--close-stale` | Classify stale runs (dead process / unverifiable record); dry-run unless --yes |
| `--retire-superseded` | Classify pending-approval runs a newer plan over the same source replaced; dry-run unless --yes |
| `--yes` | With --close-stale/--retire-superseded: durably write the closures |
| `--approve` | Approve run #n (SLOW AHEAD; add --start for FULL AHEAD) |
| `--reject` | Reject run #n (STOP) |
| `--retire` | Retire an unstarted approved run #n (CANCELLED) |
| `--reason <text>` | Reason recorded with --reject |
| `--start` | Start the approved run #n as a detached background run |
| `--diff` | Show run #n's real footprint as a unified diff |
| `--commit` | Review-then-commit run #n's changes (shows the proposal, prompts unless --yes) |
| `--message <text>` | With --commit: use this commit message instead of the suggested one |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[n]` | Run to target: the list number, or (for decide flags) a unique flowId prefix | No | No |

---

<a id="deckent-process"></a>
## `deckent process`

Process-mode execution surface — submit tasks/capabilities and poll their status

**Usage:** `deckent process`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-process-submit"></a>
## `deckent process submit`

Submit an ExecutionRequest (policy-gated: read-only auto-runs, side-effecting parks for approval)

**Usage:** `deckent process submit <description>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--kind <kind>` | Execution kind: task (default), sprint, capability |
| `--scope-dir <dir>` | Scope directory for a code task (drives risk classification) |
| `--provider <provider>` | Provider override |
| `--model <model>` | Model override |
| `--root <path>` | Project root override |
| `--lang <code>` | Language override (en\|tr) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<description>` | What the submitted execution should accomplish | Yes | No |

---

<a id="deckent-process-status"></a>
## `deckent process status`

Poll the status of a prior submission by executionId

**Usage:** `deckent process status <executionId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Project root override |
| `--lang <code>` | Language override (en\|tr) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<executionId>` | Execution id returned by `process submit` | Yes | No |

---

<a id="deckent-process-result"></a>
## `deckent process result`

Show the full result of a submission (status + lastResult)

**Usage:** `deckent process result <executionId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Project root override |
| `--lang <code>` | Language override (en\|tr) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<executionId>` | Execution id returned by `process submit` | Yes | No |

---

<a id="deckent-test"></a>
## `deckent test`

Run a test sprint (no retro, no memory update, no decay)

**Usage:** `deckent test`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--keep` | Skip cleanup — leave task files in place |
| `--timeout <ms>` | Maximum sprint duration in milliseconds |
| `--directives <file>` | Path to a custom directives file (overrides DIRECTIVES.md) |
| `--sandbox` | Stash working tree changes before running, restore after (git stash) |
| `--model <model>` | Force all tasks to use a specific model |
| `--reporter <format>` | Output format: default, junit, tap |
| `--min-coverage <percent>` | Fail if coverage falls below this percentage (0-100) |

---

<a id="deckent-agent"></a>
## `deckent agent`

Manage agent pool

**Usage:** `deckent agent`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-agent-lint"></a>
## `deckent agent lint`

Lint the agent catalog: reachability, coverage gaps, capability overlaps (V3)

**Usage:** `deckent agent lint`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the read-model projection as JSON instead of a rendered table |

---

<a id="deckent-agent-list"></a>
## `deckent agent list`

List all agents in the pool

**Usage:** `deckent agent list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the read-model projection as JSON instead of a rendered table |

---

<a id="deckent-agent-create"></a>
## `deckent agent create`

Create a custom agent (use --prompt/--description for wizard-style setup)

**Usage:** `deckent agent create <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--model <model>` | Canonical provider API model ID (defaults to the active config) |
| `--triggers <triggers...>` | Trigger keywords for task routing |
| `--prompt <text>` | Set the agent system prompt content directly (written to PROMPT.md) |
| `--description <desc>` | Set the agent description |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Name for the new agent entry | Yes | No |

---

<a id="deckent-agent-stats"></a>
## `deckent agent stats`

Show sprint-by-sprint performance for an agent

**Usage:** `deckent agent stats <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the read-model projection as JSON instead of a rendered table |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Agent name exactly as the agent entry records it | Yes | No |

---

<a id="deckent-agent-enable"></a>
## `deckent agent enable`

Enable an agent

**Usage:** `deckent agent enable <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Agent name exactly as the agent entry records it | Yes | No |

---

<a id="deckent-agent-disable"></a>
## `deckent agent disable`

Disable an agent

**Usage:** `deckent agent disable <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Agent name exactly as the agent entry records it | Yes | No |

---

<a id="deckent-agent-delete"></a>
## `deckent agent delete`

Delete an agent from the pool

**Usage:** `deckent agent delete <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--force` | Delete without the interactive confirmation prompt |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Agent name exactly as the agent entry records it | Yes | No |

---

<a id="deckent-agent-edit"></a>
## `deckent agent edit`

Edit an agent configuration

**Usage:** `deckent agent edit <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--model <model>` | Write a new model onto the agent entry |
| `--description <desc>` | Write a new description onto the agent entry |
| `--enable` | Mark the agent entry enabled |
| `--disable` | Mark the agent entry disabled |
| `--triggers <triggers...>` | Replace the trigger keywords on the agent entry |
| `--sync-prompt` | Re-read PROMPT.md and write it back onto the entry as systemPrompt |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Agent name exactly as the agent entry records it | Yes | No |

---

<a id="deckent-agent-reclassify"></a>
## `deckent agent reclassify`

Reclassify a recorded task outcome (delta-applies agent/skill stats)

**Usage:** `deckent agent reclassify`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Sprint ID whose stored task entry is being reclassified |
| `--task <id>` | Task ID within that sprint |
| `--decision <decision>` | Replacement evaluation: DONE \| GO_WITH_TECH_DEBT \| NO_GO |
| `--reason <text>` | Free-form justification recorded on the audit-trail entry |
| `--no-audit` | Do not write the audit-trail entry into the memory store |

---

<a id="deckent-agent-info"></a>
## `deckent agent info`

Show detailed agent information

**Usage:** `deckent agent info <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Agent name exactly as the agent entry records it | Yes | No |

---

<a id="deckent-skill"></a>
## `deckent skill`

Manage skill pool

**Usage:** `deckent skill`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-skill-list"></a>
## `deckent skill list`

List all skills

**Usage:** `deckent skill list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the read-model projection as JSON instead of a rendered table |
| `--category <cat>` | Restrict the projection to one category |

---

<a id="deckent-skill-create"></a>
## `deckent skill create`

Create a custom skill

**Usage:** `deckent skill create <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Name for the new skill entry | Yes | No |

---

<a id="deckent-skill-install"></a>
## `deckent skill install`

Install a skill from local path or git URL (supports version pinning: url#tag)

**Usage:** `deckent skill install <source>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--force` | Overwrite an existing entry instead of failing |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<source>` | Install source: a local path, or a marketplace/registry reference | Yes | No |

---

<a id="deckent-skill-update"></a>
## `deckent skill update`

Update an installed skill from its original source

**Usage:** `deckent skill update <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Skill name exactly as the skill entry records it | Yes | No |

---

<a id="deckent-skill-enable"></a>
## `deckent skill enable`

Enable a skill

**Usage:** `deckent skill enable <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Skill name exactly as the skill entry records it | Yes | No |

---

<a id="deckent-skill-disable"></a>
## `deckent skill disable`

Disable a skill

**Usage:** `deckent skill disable <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Skill name exactly as the skill entry records it | Yes | No |

---

<a id="deckent-skill-delete"></a>
## `deckent skill delete`

Delete a skill

**Usage:** `deckent skill delete <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Skill name exactly as the skill entry records it | Yes | No |

---

<a id="deckent-skill-info"></a>
## `deckent skill info`

Show skill details

**Usage:** `deckent skill info <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--stats` | Add the recorded usage statistics to the projection |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Skill name exactly as the skill entry records it | Yes | No |

---

<a id="deckent-skill-search"></a>
## `deckent skill search`

Search skills in the marketplace registry

**Usage:** `deckent skill search <query>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--category <cat>` | Restrict registry results to one category |
| `--json` | Emit the read-model projection as JSON instead of a rendered table |
| `--limit <n>` | Maximum registry results per page |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<query>` | Search query matched against published registry entries | Yes | No |

---

<a id="deckent-skill-publish"></a>
## `deckent skill publish`

Validate, sign (Ed25519) and publish a skill to the marketplace

**Usage:** `deckent skill publish <skillPath>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--dry-run` | Validate and sign locally without uploading to the registry |
| `--key-dir <dir>` | Keypair directory (default: ~/.deckent/keys) |
| `--no-sign` | Skip Ed25519 signing and upload to the registry unsigned |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<skillPath>` | Local path of the skill to sign and publish | Yes | No |

---

<a id="deckent-review"></a>
## `deckent review`

Review sprint tasks with evaluations

**Usage:** `deckent review`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--auto` | Auto-approve/reject based on task results |
| `--json` | Output review state as JSON |
| `--approve-all` | Approve all pending tasks |
| `--reject-all` | Reject all pending tasks |

---

<a id="deckent-finalize"></a>
## `deckent finalize`

Finalize a sprint: update MEMORY.md, RETRO.md, IDENTITY.md, config, and run decay

**Usage:** `deckent finalize`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Specific sprint ID to finalize (e.g. sprint-063); defaults to task auto-detection |
| `--skip-decay` | Skip the memory/debt decay phase |
| `--skip-hooks` | Skip plugin afterSprint hooks |
| `--force` | Finalize even if tasks are in progress or the sprint is already finalized |

---

<a id="deckent-explain"></a>
## `deckent explain`

Explain what the last sprint did in human-friendly language

**Usage:** `deckent explain`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Project a single stored sprint entry by its sprint ID |
| `--task <taskId>` | Project the stored routing-decision log for one task ID |
| `--json` | Emit the read-model projection as JSON instead of a rendered table |
| `--verbose` | Project every stored learning and the full task detail (default caps learnings at 3) |

---

<a id="deckent-set-directives"></a>
## `deckent set-directives`

Write sprint goals to DIRECTIVES.md (content, file, or stdin)

**Usage:** `deckent set-directives`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--content <string>` | Directive content to write directly |
| `--file <path>` | Read content from a file |

---

<a id="deckent-connect"></a>
## `deckent connect`

Diagnose provider/MCP/IDE/shell connection status (read-only — no changes are made)

**Usage:** `deckent connect`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--provider <name>` | Scope the report to a single provider (claude\|codex\|gemini) |
| `--json` | Output the report as JSON |

---

<a id="deckent-plan-nl"></a>
## `deckent plan-nl`

Turn a free-form goal into a DIRECTIVES.md scaffold (single-task template; preview by default)

**Usage:** `deckent plan-nl <goal>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--write` | Write the scaffold to DIRECTIVES.md (any existing file is backed up first) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<goal>` | Free-form description of what the sprint should accomplish | Yes | No |

---

<a id="deckent-do"></a>
## `deckent do`

Golden-flow: turn a goal into a sprint plan (dry-run preview by default; --run to actually start it)

**Usage:** `deckent do <goal>`

### Details

Turns one goal into the governed golden-flow preview. The default is no-write preview; --run admits execution, and explicit confirmation or --yes controls the transition.

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Preview; explicit apply required | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--run` | Approve and start the sprint for real (default is a dry-run preview only) |
| `--yes` | Non-interactive approval when RunFlow (terminal.run_flow_v2) is enabled — required together with --run to actually start; otherwise an honest reject (no interactive prompt) |
| `--force-scope` | Bypass the pre-spawn scope gate (front-door mirror AND the detached child) — same consent as `deckent start --force-scope` |
| `--write-allowlist <paths...>` | Bind the exact plan to an existing-file closed write allowlist; repeat paths after the option |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<goal>` | The outcome the sprint should achieve, in one sentence | Yes | No |

---

<a id="deckent-heartbeat"></a>
## `deckent heartbeat`

Run proactive heartbeat tasks from .deckent/HEARTBEAT.md

**Usage:** `deckent heartbeat`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--daemon` | Run in daemon mode (keeps running in foreground) |
| `--interval <minutes>` | Heartbeat interval in minutes (default: 30) |
| `--stop` | Stop a running heartbeat daemon |

---

<a id="deckent-chat"></a>
## `deckent chat`

Start a conversational session with Deckent. Uses your installed AI CLI.

**Usage:** `deckent chat`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--tool <name>` | Host AI CLI to launch for this session (claude \| codex \| gemini). |
| `--local` | Route the session to a locally hosted model instead of a remote provider. Not yet available — the command reports it and exits non-zero. |
| `--check-mcp` | Verify the Deckent MCP server is attached before starting, and refuse to launch when it is not. |
| `--resume <sessionId>` | Resume the given session id, printing its recent turns before the session attaches. |
| `--resume-limit <n>` | How many prior turns --resume prints before attaching (default: 10). |
| `--native` | Run the built-in tool-use loop in this process instead of spawning a host AI CLI. |
| `--once` | Send a single turn and exit instead of holding an interactive session. |
| `--message <text>` | Message text for single-turn mode; supplying it implies --native --once. |

---

<a id="deckent-checkpoint"></a>
## `deckent checkpoint`

Manage human checkpoints — list, approve, or reject pending checkpoints

**Usage:** `deckent checkpoint`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-checkpoint-list"></a>
## `deckent checkpoint list`

List all checkpoints

**Usage:** `deckent checkpoint list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--pending` | Show only pending checkpoints |
| `--json` | Output as JSON |
| `--lang <code>` | Language override (en\|tr) |

---

<a id="deckent-checkpoint-approve"></a>
## `deckent checkpoint approve`

Approve a pending checkpoint

**Usage:** `deckent checkpoint approve <sprintId> <phase>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Language override (en\|tr) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<sprintId>` | Sprint the checkpoint belongs to | Yes | No |
| `<phase>` | Sprint phase the checkpoint was raised in | Yes | No |

---

<a id="deckent-checkpoint-reject"></a>
## `deckent checkpoint reject`

Reject a pending checkpoint

**Usage:** `deckent checkpoint reject <sprintId> <phase>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Language override (en\|tr) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<sprintId>` | Sprint the checkpoint belongs to | Yes | No |
| `<phase>` | Sprint phase the checkpoint was raised in | Yes | No |

---

<a id="deckent-docs"></a>
## `deckent docs`

Manage user-defined documents

**Usage:** `deckent docs`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-docs-add"></a>
## `deckent docs add`

Add a document to managed docs

**Usage:** `deckent docs add <path>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--auto <sections>` | Comma-separated section headings the doc runner may rewrite |
| `--protect <sections>` | Comma-separated section headings the doc runner must never touch |
| `--skills <skills>` | Comma-separated skill IDs attached to the doc entry |
| `--max-lines <n>` | Line cap for auto-updated sections |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<path>` | Path of the document to track as a doc entry | Yes | No |

---

<a id="deckent-docs-remove"></a>
## `deckent docs remove`

Remove a document from managed docs

**Usage:** `deckent docs remove <pathOrId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<pathOrId>` | Tracked document path, or the doc entry ID | Yes | No |

---

<a id="deckent-docs-list"></a>
## `deckent docs list`

List all managed documents

**Usage:** `deckent docs list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-docs-update"></a>
## `deckent docs update`

Update rules for an existing managed doc

**Usage:** `deckent docs update <pathOrId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--add-auto <sections>` | Add auto-update sections to the entry (comma-separated) |
| `--add-protect <sections>` | Add protected sections to the entry (comma-separated) |
| `--remove-auto <sections>` | Remove auto-update sections from the entry (comma-separated) |
| `--max-lines <n>` | Replace the line cap for auto-updated sections |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<pathOrId>` | Tracked document path, or the doc entry ID | Yes | No |

---

<a id="deckent-docs-run"></a>
## `deckent docs run`

Run managed doc updates without a sprint

**Usage:** `deckent docs run`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--no-cache` | Clear the doc cache before the run |

---

<a id="deckent-docs-track"></a>
## `deckent docs track`

Track doc freshness (hash + DCR + stale)

**Usage:** `deckent docs track`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-docs-track-scan"></a>
## `deckent docs track scan`

Hash + timestamp + rank all docs; write front-matter; sync memory.db

**Usage:** `deckent docs track scan`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--no-write` | Record scan results in the store only; leave document front-matter untouched |
| `--prune` | Delete doc entries whose document no longer exists |
| `--check` | After the scan, exit non-zero if any CRITICAL_STALE doc entry remains (CI gate) |
| `--max-rank <n>` | With --check, gate only on entries whose doc_rank is at most n |

---

<a id="deckent-docs-track-status"></a>
## `deckent docs track status`

Report tracked docs by rank + stale state

**Usage:** `deckent docs track status`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--stale` | Restrict the projection to DRIFT, STALE and CRITICAL_STALE entries |
| `--rank <n>` | Restrict the projection to entries whose doc_rank is at most n |
| `--json` | Emit the read-model projection as JSON instead of a rendered table |

---

<a id="deckent-docs-track-sync"></a>
## `deckent docs track sync`

Update memory.db only (no front-matter writes)

**Usage:** `deckent docs track sync`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-output"></a>
## `deckent output`

Show captured output for a specific worker task

**Usage:** `deckent output <taskId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--tail <n>` | Show the last N lines of the persisted worker output (default: 50) |
| `--follow` | Re-read the persisted output file every 2 seconds (polling, not a live process attach) |
| `--sprint-id <sprintId>` | Sprint to read the persisted evidence from (defaults to the current sprint) |
| `--json` | Output raw JSON |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<taskId>` | Worker task whose persisted output evidence should be read | Yes | No |

---

<a id="deckent-task"></a>
## `deckent task`

Inspect and reconcile immutable one-shot task settlement evidence

**Usage:** `deckent task`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-task-settle"></a>
## `deckent task settle`

Inspect a task settlement plan; apply only with explicit operator attestation

**Usage:** `deckent task settle <taskId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--apply` | Apply an evidence-eligible reconciliation (default: dry-run) |
| `--attestation-reason <text>` | Operator-authored reason for the reconciliation (required with --apply) |
| `--operator <id>` | Stable operator identifier; only its hash-bound opaque reference is persisted (required with --apply) |
| `--reason-code <code>` | Typed pre-dispatch reason for a declared eventless receipt (no_provider\|budget_capability_unsupported\|provider_authority_rejected\|execution_admission_rejected\|command_build_failed\|fallback_unreachable\|fallback_limit_hold\|fallback_exhausted) |
| `--json` | Emit the stable machine-readable settlement DTO |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<taskId>` | One-shot task whose settlement evidence should be inspected | Yes | No |

---

<a id="deckent-cost"></a>
## `deckent cost`

User Safety Shield — cost management & estimation

**Usage:** `deckent cost`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-cost-show"></a>
## `deckent cost show`

Display model pricing (read-only)

**Usage:** `deckent cost show`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--provider <name>` | Restrict the pricing projection to one provider (anthropic, openai, google) |
| `--model <id>` | Project the detail view for a single model ID |

---

<a id="deckent-cost-update"></a>
## `deckent cost update`

Fetch latest pricing from LiteLLM + OpenRouter

**Usage:** `deckent cost update`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--provider <name>` | Refresh stored pricing for this provider only |
| `--dry-run` | Project the pricing delta without writing it back |
| `--skip-validation` | Skip the OpenRouter delta cross-check before writing |

---

<a id="deckent-cost-budget"></a>
## `deckent cost budget`

View or set cost budgets

**Usage:** `deckent cost budget`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--set <usd>` | Write the per-sprint maximum budget, in USD |
| `--daily <usd>` | Write the daily maximum budget, in USD |
| `--monthly <usd>` | Write the monthly maximum budget, in USD |

---

<a id="deckent-recall"></a>
## `deckent recall`

Search project memory — ADRs, sprint learnings, patterns, debt

**Usage:** `deckent recall <query>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `-t, --type <types>` | Restrict to these entry types, comma-separated: adr, memory, sprint, debt, pattern |
| `-n, --limit <n>` | Maximum number of matched entries in the projection |
| `--sprint-min <n>` | Drop entries recorded before this sprint number |
| `-m, --mode <mode>` | Full-text token join: or (default, broader) \| and (every token must match) |
| `--json` | Emit the read-model projection as JSON instead of a rendered table |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<query>` | Full-text query matched against stored memory entries (title, summary, content) | Yes | No |

---

<a id="deckent-remember"></a>
## `deckent remember`

Store a note in project memory

**Usage:** `deckent remember <note>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `-t, --type <type>` | Entry type recorded on the new row (default: memory) |
| `--tags <tags>` | Comma-separated tags indexed with the entry |
| `--title <title>` | Entry title (default: the first 60 characters of the note) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<note>` | Note body stored as the entry content | Yes | No |

---

<a id="deckent-memory"></a>
## `deckent memory`

Memory V2 management

**Usage:** `deckent memory`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-memory-rebuild"></a>
## `deckent memory rebuild`

Rebuild memory.db from .brain/exports/*.md files

**Usage:** `deckent memory rebuild`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-memory-export"></a>
## `deckent memory export`

Export memory.db to .brain/exports/*.md

**Usage:** `deckent memory export`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-memory-stats"></a>
## `deckent memory stats`

Show memory.db statistics

**Usage:** `deckent memory stats`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-memory-backup"></a>
## `deckent memory backup`

Create a WAL-safe backup of memory.db

**Usage:** `deckent memory backup`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--output <path>` | Write the SQLite backup to this path instead of the generated project-local path. |
| `--checkpoint` | Print WAL checkpoint evidence before backup; the consistency checkpoint runs even when this flag is omitted. |

---

<a id="deckent-memory-relations"></a>
## `deckent memory relations`

Manage memory relations

**Usage:** `deckent memory relations`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-memory-relations-list"></a>
## `deckent memory relations list`

List all relations in memory.db

**Usage:** `deckent memory relations list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-memory-relations-review"></a>
## `deckent memory relations review`

Review pending relations from backfill preview

**Usage:** `deckent memory relations review`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-trace"></a>
## `deckent trace`

Trace extraction, immutable migration, and governed training-corpus tooling

**Usage:** `deckent trace`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-trace-extract"></a>
## `deckent trace extract`

Extract aligned + general training examples from Claude Code session transcript(s)

**Usage:** `deckent trace extract <input>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--out <dir>` | Output directory for aligned.jsonl/general.jsonl |
| `--system <text>` | System prompt to prepend to each example (default: deckent's agentic system prompt) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<input>` | Path to a transcript JSONL file, or a directory containing multiple transcripts | Yes | No |

---

<a id="deckent-trace-migrate"></a>
## `deckent trace migrate`

Reconcile historical JSONL traces into a canonical immutable projection (dry-run by default)

**Usage:** `deckent trace migrate <inputs...>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--out <dir>` | New no-clobber migration output directory |
| `--apply` | Publish the reconciled projection; omission remains side-effect-free |
| `--allow-training` | Explicitly admit structurally valid records for training |
| `--weight <number>` | Positive training weight (requires --allow-training; default 1) |
| `--require-consent` | Require observed per-record consent authority for train-ready disposition |
| `--require-lineage` | Require observed run or sprint lineage for train-ready disposition |
| `--exclude` | Policy-exclude every record while retaining the immutable projection |
| `--policy-version <id>` | Explicit policy authority version |
| `--contract-version <id>` | Explicit migration contract version |
| `--json` | Emit stable machine-readable JSON |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<inputs...>` | One or more project-relative trace files or directories | Yes | Yes |

---

<a id="deckent-trace-corpus"></a>
## `deckent trace corpus`

Build and audit manifest-authorized Deckent training corpora

**Usage:** `deckent trace corpus`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-trace-corpus-build"></a>
## `deckent trace corpus build`

Build a fail-closed ShareGPT corpus from a verified migration

**Usage:** `deckent trace corpus build <migration>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--out <file>` | New no-clobber corpus output file |
| `--json` | Emit stable machine-readable JSON |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<migration>` | Project-relative canonical migration directory | Yes | No |

---

<a id="deckent-trace-corpus-lint"></a>
## `deckent trace corpus lint`

Verify corpus schema, provenance, causality, secrets, duplicates, and manifest reconciliation

**Usage:** `deckent trace corpus lint <corpus>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--manifest <file>` | Pipeline manifest path (default: <corpus>.manifest.json) |
| `--json` | Emit stable machine-readable JSON |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<corpus>` | Project-relative ShareGPT corpus JSONL file | Yes | No |

---

<a id="deckent-resume"></a>
## `deckent resume`

Resume a sprint from its latest checkpoint

**Usage:** `deckent resume <sprintId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--auto-approve` | Auto-approve all worker actions (skip permission prompts) |
| `--dry-run` | Show what would be resumed without actually running |
| `--force-scope` | Preserve explicit approval for intentional new write paths while resuming |
| `--root <path>` | Project root directory (defaults to cwd) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<sprintId>` | Sprint to resume, in the form sprint-<number> | Yes | No |

---

<a id="deckent-nervous"></a>
## `deckent nervous`

Nervous System dashboard — monitor, accept, reject proactive suggestions

**Usage:** `deckent nervous`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-nervous-enable"></a>
## `deckent nervous enable`

Enable the Nervous System (one command; default stays OFF, human-approval preserved)

**Usage:** `deckent nervous enable`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--mode <preset>` | Authority preset to enable: strict, balanced, autopilot, or full-auto. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-nervous-accept"></a>
## `deckent nervous accept`

Accept a pending nervous system suggestion

**Usage:** `deckent nervous accept <id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<id>` | Nervous action or recommendation identifier targeted by this decision. | Yes | No |

---

<a id="deckent-nervous-reject"></a>
## `deckent nervous reject`

Reject a pending nervous system suggestion

**Usage:** `deckent nervous reject <id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--reason <text>` | Free-text justification stored verbatim with the recorded decision. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<id>` | Nervous action or recommendation identifier targeted by this decision. | Yes | No |

---

<a id="deckent-nervous-edit"></a>
## `deckent nervous edit`

Modify and accept a pending suggestion

**Usage:** `deckent nervous edit <id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<id>` | Nervous action or recommendation identifier targeted by this decision. | Yes | No |

---

<a id="deckent-nervous-undo"></a>
## `deckent nervous undo`

Undo a recent reversible action

**Usage:** `deckent nervous undo <action-id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<action-id>` | Previously recorded Nervous action identifier to undo. | Yes | No |

---

<a id="deckent-nervous-history"></a>
## `deckent nervous history`

View nervous system action history

**Usage:** `deckent nervous history`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--limit <n>` | Maximum number of records to print, newest first. |
| `--since <duration>` | Only show records newer than this duration, for example 1d, 2h or 30m. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-nervous-recommendations"></a>
## `deckent nervous recommendations`

View the Brain inbox — nervous proposals awaiting disposition

**Usage:** `deckent nervous recommendations`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Owner | Text | `darwin`, `linux`, `win32` | `recs` |

### Options

| Flags | Description |
|---|---|
| `--all` | Include dismissed recommendations; by default only open ones are shown. |
| `--limit <n>` | Maximum number of records to print, newest first. |
| `--dismiss <id>` | Dismiss the open recommendation with this id, or a unique id prefix. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-nervous-log"></a>
## `deckent nervous log`

View raw nervous system log

**Usage:** `deckent nervous log`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Stream | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--follow` | Keep the process attached and print new entries as they are appended. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-nervous-accept-panic"></a>
## `deckent nervous accept-panic`

Approve a PanicGuard-blocked worker kill (writes IPC marker)

**Usage:** `deckent nervous accept-panic <task-id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--reason <text>` | Free-text justification stored verbatim with the recorded panic approval. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<task-id>` | Task identifier whose panic action is being accepted. | Yes | No |

---

<a id="deckent-nervous-baseline-refresh"></a>
## `deckent nervous baseline-refresh`

Refresh directives_protection baseline to current DIRECTIVES.md content

**Usage:** `deckent nervous baseline-refresh`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-mode"></a>
## `deckent mode`

Get/set deckent_style (run (sprint) | task | process)

**Usage:** `deckent mode`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-mode-show"></a>
## `deckent mode show`

Show current mode

**Usage:** `deckent mode show`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-mode-sprint"></a>
## `deckent mode sprint`

Switch to sprint mode

**Usage:** `deckent mode sprint`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-mode-run"></a>
## `deckent mode run`

Switch to run mode (bridge alias — stores deckent_style: "sprint")

**Usage:** `deckent mode run`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-mode-task"></a>
## `deckent mode task`

Switch to task mode

**Usage:** `deckent mode task`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-mode-process"></a>
## `deckent mode process`

Switch to process mode (continuous request-handling — ERP / automation via MCP + REST)

**Usage:** `deckent mode process`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-mode-auto"></a>
## `deckent mode auto`

Auto-detect mode from context

**Usage:** `deckent mode auto`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-mode-global"></a>
## `deckent mode global`

Set global default (sprint|task|process)

**Usage:** `deckent mode global <style>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<style>` | Global execution style to persist: sprint, task, or process. | Yes | No |

---

<a id="deckent-features"></a>
## `deckent features`

List features from .deckent/settings/features-manifest.json by category

**Usage:** `deckent features`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | `feature-query` |

### Options

| Flags | Description |
|---|---|
| `-c, --category <category>` | Filter the projection by category: active, lightly_used, dormant, dead, all |
| `--json` | Emit the read-model projection as JSON instead of a rendered table |
| `--id <featureId>` | Project the detail view for a single feature ID |

---

<a id="deckent-truth"></a>
## `deckent truth`

Resolve the 4-level feature truth-chain (code → wired → enabled → proof) for manifest truth-blocks

**Usage:** `deckent truth`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the raw truth projection as JSON |
| `--check` | Ratchet: compare current half-wire candidates against the pinned baseline (exit 1 = new candidate, exit 2 = no baseline) |
| `--write` | With --check: rewrite the pinned baseline to the current candidate set (mutation) |

---

<a id="deckent-audit"></a>
## `deckent audit`

Run Brain Self-Audit Gate for a sprint, or query/export/retain audit log events (query | compliance | forward | retention)

**Usage:** `deckent audit [sprint-id]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Preview; explicit apply required | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the raw projection as JSON and print nothing else |
| `--sprint <id>` | Sprint ID used by the query, compliance, forward and retention subcommands |
| `--tenant <id>` | query path: keep only audit events recorded for this tenant ID |
| `--action <channel>` | query path: keep only audit events recorded for this action/channel |
| `--since <timestamp>` | query path: keep only audit events at or after this ISO 8601 timestamp |
| `--role <role>` | query path: caller role enforced by RBAC — admin \| operator \| viewer |
| `--out <path>` | forward path: output file (default: .deckent/siem-export.jsonl) |
| `--url <url>` | forward path: POST audit records to an HTTP(S) SIEM endpoint (takes precedence over --syslog and --out) |
| `--syslog <host[:port]>` | forward path: send audit records to an RFC 5424 syslog collector (takes precedence over --out) |
| `--syslog-protocol <protocol>` | forward path: syslog wire protocol — udp \| tcp |
| `--keep-days <n>` | retention path: prune audit events older than n days |
| `--keep-count <n>` | retention path: archive audit events beyond the most recent n |
| `--apply` | retention path: apply the plan — without it the run stays a dry-run |
| `--lang <code>` | Language override for this invocation: en \| tr |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[sprint-id]` | Sprint ID to audit; omit it and use a subcommand for the query/compliance paths | No | No |

---

<a id="deckent-audit-verify"></a>
## `deckent audit-verify`

Verify the audit log HMAC chain for tamper evidence

**Usage:** `deckent audit-verify`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the raw projection as JSON and print nothing else |

---

<a id="deckent-recover"></a>
## `deckent recover`

Recover a crashed or stuck sprint through the canonical recovery operation

**Usage:** `deckent recover <sprint-id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--dry-run` | Preview recovery without making changes |
| `--force` | Skip interactive confirmation |
| `--skip-audit` | Skip the audit gate |
| `--restore-tasks` | Restore task files from the pre-archive snapshot instead of recovering forward |
| `--resume` | Resume a canonically PAUSED/ORPHANED run through its durable checkpoint |
| `--auto-approve` | Forward auto-approval to the resumed worker run |
| `--force-scope` | Preserve explicit approval for intentional new write paths while resuming |
| `--json` | Output the stable recovery result as JSON |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<sprint-id>` | Sprint to recover | Yes | No |

---

<a id="deckent-models"></a>
## `deckent models`

Manage and browse the model catalog

**Usage:** `deckent models`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-models-list"></a>
## `deckent models list`

List available models from the catalog

**Usage:** `deckent models list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--provider <name>` | Restrict the catalog projection to one provider (claude, codex, gemini, ollama, cursor) |
| `--offline` | Read the cached or bundled catalog only; never reach the network |

---

<a id="deckent-models-activate"></a>
## `deckent models activate`

Allow a detected model to enter the routing pool

**Usage:** `deckent models activate <model>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--provider <name>` | Provider that serves this model |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<model>` | Model ID exactly as the catalog entry records it | Yes | No |

---

<a id="deckent-models-deactivate"></a>
## `deckent models deactivate`

Remove a model from the routing pool (detection still sees it)

**Usage:** `deckent models deactivate <model>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--provider <name>` | Provider that serves this model |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<model>` | Model ID exactly as the catalog entry records it | Yes | No |

---

<a id="deckent-models-activation"></a>
## `deckent models activation`

Show recorded model activation decisions (unrecorded = active)

**Usage:** `deckent models activation`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-models-policy"></a>
## `deckent models policy`

Show or set a provider activation policy (implicit-active | explicit-active)

**Usage:** `deckent models policy [provider] [mode]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[provider]` | Provider whose activation policy is read or written; omit to project every provider | No | No |
| `[mode]` | Policy mode to write: implicit-active \| explicit-active; omit to read the current mode | No | No |

---

<a id="deckent-models-active-set"></a>
## `deckent models active-set`

Show the resolved owner active execution set + snapshot digest

**Usage:** `deckent models active-set`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-models-refresh"></a>
## `deckent models refresh`

Force-refresh the model catalog (invalidates 24h cache)

**Usage:** `deckent models refresh`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-models-tier"></a>
## `deckent models tier`

Look up the tier of a specific model by ID or API ID

**Usage:** `deckent models tier <model>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--offline` | Read the cached or bundled catalog only; never reach the network |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<model>` | Model ID exactly as the catalog entry records it | Yes | No |

---

<a id="deckent-flow"></a>
## `deckent flow`

Manage scheduled flows (process mode)

**Usage:** `deckent flow`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-flow-list"></a>
## `deckent flow list`

List all scheduled flows

**Usage:** `deckent flow list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--tenant <id>` | Restrict the listing to entries owned by this tenant identifier. |
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |

---

<a id="deckent-flow-add"></a>
## `deckent flow add`

Add a new scheduled flow (cron: 5-field expression, e.g. "* * * * *")

**Usage:** `deckent flow add <cron> <action>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--tenant <id>` | Tenant identifier the scheduled flow is created under. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<cron>` | Cron expression that determines when the scheduled flow runs. | Yes | No |
| `<action>` | Action specification the scheduler executes when the cron expression matches. | Yes | No |

---

<a id="deckent-flow-run"></a>
## `deckent flow run`

Run the flow-runtime tick once (--once) or start the daemon

**Usage:** `deckent flow run`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--once` | Run a single scheduler tick and exit instead of staying resident. |
| `--tenant <id>` | Restrict the listing to entries owned by this tenant identifier. |

---

<a id="deckent-flow-approve"></a>
## `deckent flow approve`

Approve a pending event-triggered flow dispatch so it can proceed

**Usage:** `deckent flow approve <id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<id>` | Scheduled-flow identifier to approve. | Yes | No |

---

<a id="deckent-rbac"></a>
## `deckent rbac`

Role-based access control — check permissions and list roles

**Usage:** `deckent rbac`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-rbac-check"></a>
## `deckent rbac check`

Check whether a role has permission to perform an action

**Usage:** `deckent rbac check <role> <action>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--tenant <id>` | Tenant identifier the role check is evaluated against. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<role>` | RBAC role name used by the check or assignment. | Yes | No |
| `<action>` | Protected action whose permission is checked. | Yes | No |

---

<a id="deckent-rbac-roles"></a>
## `deckent rbac roles`

List all roles and their effective permissions

**Usage:** `deckent rbac roles`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-rbac-grant"></a>
## `deckent rbac grant`

Assign a role to a user

**Usage:** `deckent rbac grant <user> <role>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<user>` | User identifier whose role assignment is changed. | Yes | No |
| `<role>` | RBAC role name used by the check or assignment. | Yes | No |

---

<a id="deckent-rbac-revoke"></a>
## `deckent rbac revoke`

Remove the role assignment for a user

**Usage:** `deckent rbac revoke <user>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<user>` | User identifier whose role assignment is changed. | Yes | No |

---

<a id="deckent-evolve"></a>
## `deckent evolve`

Evolution analysis — cross-sprint trends and prompt suggestions

**Usage:** `deckent evolve`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-evolve-report"></a>
## `deckent evolve report`

Show cross-sprint agent/skill trend report

**Usage:** `deckent evolve report`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `-n, --sprints <n>` | How many of the most recent sprints the report analyzes. |
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |

---

<a id="deckent-autonomous"></a>
## `deckent autonomous`

Autonomous runtime — authority-bounded continuous loop

**Usage:** `deckent autonomous`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-autonomous-enable"></a>
## `deckent autonomous enable`

Enable autonomous mode (one command instead of editing config; default stays OFF)

**Usage:** `deckent autonomous enable`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-autonomous-start"></a>
## `deckent autonomous start`

Start the autonomous loop (default-deny + human-approval gate)

**Usage:** `deckent autonomous start`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--interval-ms <ms>` | Milliseconds the loop sleeps between idle ticks. |
| `--max-iterations <n>` | Stop the loop after this many cycles; omit to run until the operator aborts it. |
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-autonomous-plan"></a>
## `deckent autonomous plan`

Decompose a high-level goal into pending autonomous backlog items

**Usage:** `deckent autonomous plan <goal>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--from <ref>` | Artifact reference (file or file#section) whose open checklist items seed the plan. |
| `--policy <policy>` | Policy applied to every generated item: auto, approval-required, or risk-tagged. |
| `--max-items <n>` | Upper bound on how many items the plan may contain. |
| `--model <model>` | Model to use — an exact provider model ID (e.g. claude-sonnet-5, gpt-5.6-sol). Omit to use the configured default. Moving/legacy aliases (sonnet/opus/haiku/gpt-5/gpt-5.6) are rejected. |
| `--provider <name>` | Explicit provider ownership (claude\|codex\|gemini\|cursor\|ollama\|openrouter\|local-llm) — required to register an unseen versioned model ID; validated against the canonical registry. |
| `--dry-run` | Generate the plan and print it without writing it to the backlog. |
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<goal>` | Goal text the autonomous planner should turn into a governed plan. | Yes | No |

---

<a id="deckent-autonomous-status"></a>
## `deckent autonomous status`

Show autonomous runtime summary (pending + last audit events)

**Usage:** `deckent autonomous status`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-autonomous-stop"></a>
## `deckent autonomous stop`

Signal the autonomous loop to stop cleanly

**Usage:** `deckent autonomous stop`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-autonomous-cleanup"></a>
## `deckent autonomous cleanup`

Sweep stray autonomous run-artifacts (task-run-*, _*.pid) from .tasks/

**Usage:** `deckent autonomous cleanup`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-autonomous-pending"></a>
## `deckent autonomous pending`

List parked approvals awaiting human accept/reject

**Usage:** `deckent autonomous pending`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-autonomous-approve"></a>
## `deckent autonomous approve`

Approve a parked trigger — resolves the running loop's gate

**Usage:** `deckent autonomous approve <triggerId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--reason <text>` | Free-text justification stored verbatim with the recorded trigger decision. |
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<triggerId>` | Pending autonomous trigger identifier to approve or reject. | Yes | No |

---

<a id="deckent-autonomous-reject"></a>
## `deckent autonomous reject`

Reject a parked trigger — resolves the running loop's gate

**Usage:** `deckent autonomous reject <triggerId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--reason <text>` | Free-text justification stored verbatim with the recorded trigger decision. |
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<triggerId>` | Pending autonomous trigger identifier to approve or reject. | Yes | No |

---

<a id="deckent-autonomous-backlog"></a>
## `deckent autonomous backlog`

Manage the autonomous backlog (add / list / remove entries)

**Usage:** `deckent autonomous backlog`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-autonomous-backlog-add"></a>
## `deckent autonomous backlog add`

Add a new entry to the autonomous backlog

**Usage:** `deckent autonomous backlog add`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--id <id>` | Identifier for the backlog entry; must be unique within the backlog. |
| `--title <title>` | Human-readable title shown wherever the entry is listed. |
| `--kind <kind>` | Entry kind: task, sprint, or capability. |
| `--description <text>` | Task description, or a reference to the directives that define the work. |
| `--policy <policy>` | Policy for this backlog entry: auto, approval-required, or risk-tagged. |
| `--cron <expr>` | Five-field cron expression that makes the entry recur; omit for a one-off entry. |
| `--capability <verb>` | Dotted capability verb to invoke (kind=capability only), for example fs.read. |
| `--args <json>` | JSON object of handler arguments (kind=capability only). |
| `--connector <id>` | Preferred backend or connector for the capability (kind=capability only). |
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-autonomous-backlog-list"></a>
## `deckent autonomous backlog list`

List autonomous backlog entries

**Usage:** `deckent autonomous backlog list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-autonomous-backlog-remove"></a>
## `deckent autonomous backlog remove`

Remove an entry from the autonomous backlog (positional id or --id)

**Usage:** `deckent autonomous backlog remove [id]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--id <id>` | Backlog entry id to remove; an alternative to passing the id positionally. |
| `--root <path>` | Resolve project state under this directory instead of the detected project root. |
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `[id]` | Backlog item identifier to remove; --id may supply it instead. | No | No |

---

<a id="deckent-autonomous-mission"></a>
## `deckent autonomous-mission`

Manage autonomous missions created from work lists or goals

**Usage:** `deckent autonomous-mission`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-autonomous-mission-create-list"></a>
## `deckent autonomous-mission create-list`

Create an autonomous mission from one or more work items

**Usage:** `deckent autonomous-mission create-list <title>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--item <kind:spec>` | Work item to add, as kind or kind:json-spec. Repeat the flag once per item. |
| `--items-file <path>` | JSON file holding the array of mission items to create the list from. |
| `--id <id>` | Mission identifier; one is generated when the flag is omitted. |
| `--tenant <tenant>` | Record the entry under this tenant identifier instead of the default tenant. |
| `--deliver-to <channel>` | Channel the settled-mission notification is delivered to. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<title>` | Human-readable title of the mission list to create. | Yes | No |

---

<a id="deckent-autonomous-mission-create-goal"></a>
## `deckent autonomous-mission create-goal`

Create an autonomous mission that runs until its goal is reached

**Usage:** `deckent autonomous-mission create-goal <goal>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Autonomous loop control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--accept <criteria>` | Acceptance criteria the mission is settled against. |
| `--title <title>` | Mission title; defaults to the goal text when omitted. |
| `--id <id>` | Mission identifier; one is generated when the flag is omitted. |
| `--tenant <tenant>` | Record the entry under this tenant identifier instead of the default tenant. |
| `--deliver-to <channel>` | Channel the settled-mission notification is delivered to. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<goal>` | Goal statement the mission planner should decompose. | Yes | No |

---

<a id="deckent-autonomous-mission-list"></a>
## `deckent autonomous-mission list`

List all missions (summary table)

**Usage:** `deckent autonomous-mission list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |
| `--tenant <tenant>` | Restrict the listing to entries owned by this tenant identifier. |

---

<a id="deckent-bot"></a>
## `deckent bot`

Messaging-connector bot — listen/start/stop/status for inbound approve/reject

**Usage:** `deckent bot`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-bot-listen"></a>
## `deckent bot listen`

Listen for inbound approve/reject commands from messaging connectors

**Usage:** `deckent bot listen`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Project root override |
| `--lang <code>` | Language override (en\|tr) |

---

<a id="deckent-bot-start"></a>
## `deckent bot start`

Run the bot listener as a background daemon

**Usage:** `deckent bot start`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Project root override |
| `--lang <code>` | Language override (en\|tr) |

---

<a id="deckent-bot-stop"></a>
## `deckent bot stop`

Stop the bot daemon

**Usage:** `deckent bot stop`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Project root override |
| `--lang <code>` | Language override (en\|tr) |

---

<a id="deckent-bot-status"></a>
## `deckent bot status`

Show whether the bot daemon is running

**Usage:** `deckent bot status`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--root <path>` | Project root override |
| `--lang <code>` | Language override (en\|tr) |

---

<a id="deckent-gateway"></a>
## `deckent gateway`

Manage project-scoped messaging gateway sessions and pairing

**Usage:** `deckent gateway`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-gateway-listen"></a>
## `deckent gateway listen`

Run the gateway listener in the foreground (attaches every paired connector)

**Usage:** `deckent gateway listen`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-gateway-start"></a>
## `deckent gateway start`

Start the gateway daemon in the background

**Usage:** `deckent gateway start`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-gateway-stop"></a>
## `deckent gateway stop`

Stop the running gateway daemon

**Usage:** `deckent gateway stop`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-gateway-status"></a>
## `deckent gateway status`

Show whether the gateway daemon is running

**Usage:** `deckent gateway status`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-gateway-pair"></a>
## `deckent gateway pair`

Review and settle device pairing requests: list the codes waiting for an operator, then approve one onto a project or reject it.

**Usage:** `deckent gateway pair`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-gateway-pair-list"></a>
## `deckent gateway pair list`

List pending pairing requests

**Usage:** `deckent gateway pair list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

---

<a id="deckent-gateway-pair-approve"></a>
## `deckent gateway pair approve`

Approve a pairing request and bind it to a project

**Usage:** `deckent gateway pair approve <code> <project>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<code>` | One-time pairing code identifying the pending device request. | Yes | No |
| `<project>` | Project identifier the approved device is paired with. | Yes | No |

---

<a id="deckent-gateway-pair-reject"></a>
## `deckent gateway pair reject`

Reject a pending pairing request

**Usage:** `deckent gateway pair reject <code>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--lang <code>` | Render this command's output in the given language (en\|tr) instead of the project language. |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<code>` | One-time pairing code identifying the pending device request. | Yes | No |

---

<a id="deckent-mcp"></a>
## `deckent mcp`

Manage Model Context Protocol servers — an open standard, portable across every MCP-capable host

**Usage:** `deckent mcp`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-mcp-add"></a>
## `deckent mcp add`

Add an MCP server (stdio or http) — writes to .mcp.json by scope

**Usage:** `deckent mcp add <name> <cmdOrUrl> [args...]`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--scope <scope>` | Config scope written to: project \| user \| local |
| `--transport <transport>` | Transport: stdio \| http (auto-detected when omitted) |
| `--header <kv...>` | HTTP header as key=value; repeat for several headers |
| `--env <kv...>` | stdio environment variable as key=value; repeat for several variables |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Server name, unique within the selected scope | Yes | No |
| `<cmdOrUrl>` | Launch command for a stdio server, or the endpoint URL for an http server | Yes | No |
| `[args...]` | Extra arguments passed to a stdio server launch command | No | Yes |

---

<a id="deckent-mcp-list"></a>
## `deckent mcp list`

List registered MCP servers (merged: local > project > user)

**Usage:** `deckent mcp list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the read-model projection as JSON instead of a rendered table |

---

<a id="deckent-mcp-remove"></a>
## `deckent mcp remove`

Remove an MCP server (searches all scopes if --scope omitted)

**Usage:** `deckent mcp remove <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--scope <scope>` | Restrict removal to one scope: project \| user \| local (default: search all) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Server name, unique within the selected scope | Yes | No |

---

<a id="deckent-mcp-get"></a>
## `deckent mcp get`

Show details for an MCP server (from merged view)

**Usage:** `deckent mcp get <name>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the read-model projection as JSON instead of a rendered table |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<name>` | Server name, unique within the selected scope | Yes | No |

---

<a id="deckent-resources"></a>
## `deckent resources`

Show live docker worker resource usage or analyze resource log

**Usage:** `deckent resources`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--log [path]` | Summarize the resource log; pass a path to read a log other than the configured one. |
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |

---

<a id="deckent-usage"></a>
## `deckent usage`

Show token/limit consumption from Claude Code transcripts

**Usage:** `deckent usage`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read by default; explicit options may mutate state | Read | Operator | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <N>` | Show per-task breakdown for run N |
| `--since <ISO>` | Set the usage window start (ISO date) |
| `--until <ISO>` | Set the usage window end (ISO date) |
| `--json` | Output stable JSON |
| `--lineage` | Show archived lineage-aware usage authority |
| `--baseline-sprint <id>` | Select the baseline sprint archive |
| `--candidate-sprint <id>` | Select the candidate sprint archive |
| `--apply` | Publish a digest-bound canary receipt (default: dry-run) |
| `--decision-digest <sha256>` | Require this dry-run decision digest when applying |
| `--environment <id>` | Use this receipt environment scope |
| `--tenant <id>` | Use this receipt tenant scope |

---

<a id="deckent-kpi"></a>
## `deckent kpi`

Show the KPI scorecard for the current (or a specific) sprint

**Usage:** `deckent kpi`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--sprint <id>` | Sprint ID to score (defaults to the current sprint entry) |
| `--trend <kpiId>` | Project the trend series for a single KPI ID |
| `-n, --n <count>` | Number of sprint entries included in the trend projection (default: 10) |
| `--json` | Emit the raw projection as JSON and print nothing else |

---

<a id="deckent-image"></a>
## `deckent image`

Worker Docker image management

**Usage:** `deckent image`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-image-build"></a>
## `deckent image build`

Build the deckent-worker Docker image from the packaged Dockerfile.worker

**Usage:** `deckent image build`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--tag <tag>` | Docker image tag to build (default: deckent-worker:latest) |
| `--dry-run` | Print the resolved Dockerfile path + build plan without building (no docker spawn) |
| `--with-codex` | Install Codex CLI (INSTALL_CODEX=true build-arg) |
| `--with-gemini` | Install Gemini CLI (INSTALL_GEMINI=true build-arg) |
| `--with-ollama` | Install Ollama CLI (INSTALL_OLLAMA=true build-arg) |
| `--with-cursor` | Install Cursor CLI (INSTALL_CURSOR=true build-arg) |
| `--image <tag>` | Deprecated alias for --tag |
| `--lang <code>` | Language override (en\|tr) |

---

<a id="deckent-limits"></a>
## `deckent limits`

Check live subscription-window usage (session/week) and the configured start-gate thresholds

**Usage:** `deckent limits`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |

---

<a id="deckent-openrouter-probe"></a>
## `deckent openrouter-probe`

Live-probe OpenRouter free models via $DECK:OPENROUTER_API_KEY and refresh the local cache

**Usage:** `deckent openrouter-probe`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |

---

<a id="deckent-xverify"></a>
## `deckent xverify`

Cross-verify a claim on a DIFFERENT provider; the host derives ALLOW/NO-GO/HOLD from typed evidence

**Usage:** `deckent xverify <claim>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--author <provider>` | Provider that authored the claimed work (claude\|codex\|gemini\|cursor\|ollama\|openrouter\|local-llm) — the verifier must differ. Required. |
| `--author-model <apiId>` | Model id that authored the claimed work (canonical provider API id, e.g. claude-opus-5) — the verifier must run at an equal or higher capability tier. Omitted: the resolved default is used and recorded as low-confidence. |
| `--verifier <provider>` | Explicit verifier provider (optional; must differ from --author; default: cross_verify.verifier_priority) |
| `--verifier-model <id>` | Explicit verifier model id (canonical provider API id, e.g. gpt-5.6-sol) — bypasses tier-equivalence resolution, never the author tier floor |
| `--diff` | Attach `git diff HEAD` as evidence context for the verifier |
| `--files <csv>` | Comma-separated list of files the claim says were changed — when --diff is also passed, scopes the attached diff to exactly these paths |
| `--target <specs>` | Comma-separated bounded targets `path:START-END` (1-based inclusive line range) or `path:symbolName` — extracts an exact excerpt so a large file never needs manual prompt surgery |
| `--timeout <ms>` | Verifier timeout in milliseconds (default: 300000) |
| `--json` | Machine-readable JSON output (for the MCP twin / session-to-session use) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<claim>` | Claim or result statement the independent provider should verify. | Yes | No |

---

<a id="deckent-approvals"></a>
## `deckent approvals`

Runtime-wide approval inbox — list pending requests and decide them over the live-authenticated local-terminal channel

**Usage:** `deckent approvals`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-approvals-list"></a>
## `deckent approvals list`

List pending approval requests

**Usage:** `deckent approvals list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-approvals-decide"></a>
## `deckent approvals decide`

Decide one pending approval request; requires an interactive TTY re-authentication

**Usage:** `deckent approvals decide <requestId>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--allow` | Approve the request |
| `--deny` | Deny the request |
| `--reason <text>` | Optional decision reason recorded with the outcome |
| `--always` | after deciding, promote this decision into a persistent routine-tier rule (approval-rules.json) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<requestId>` | Pending approval request identifier to decide. | Yes | No |

---

<a id="deckent-approvals-rules"></a>
## `deckent approvals rules`

Persistent approval rules (approval-rules.json) — list, disable, enable, remove

**Usage:** `deckent approvals rules`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-approvals-rules-list"></a>
## `deckent approvals rules list`

List rules with status

**Usage:** `deckent approvals rules list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-approvals-rules-apply"></a>
## `deckent approvals rules apply`

Apply active rules to the current pending inbox (routine-tier automatable kinds only)

**Usage:** `deckent approvals rules apply`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-approvals-rules-disable"></a>
## `deckent approvals rules disable`

Disable a rule (kept for audit; re-enable any time)

**Usage:** `deckent approvals rules disable <id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<id>` | Approval-rule identifier to enable, disable, or remove. | Yes | No |

---

<a id="deckent-approvals-rules-enable"></a>
## `deckent approvals rules enable`

Re-enable a disabled rule

**Usage:** `deckent approvals rules enable <id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<id>` | Approval-rule identifier to enable, disable, or remove. | Yes | No |

---

<a id="deckent-approvals-rules-remove"></a>
## `deckent approvals rules remove`

Remove a rule permanently

**Usage:** `deckent approvals rules remove <id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Destructive process control | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<id>` | Approval-rule identifier to enable, disable, or remove. | Yes | No |

---

<a id="deckent-confirmations"></a>
## `deckent confirmations`

Custom-confirmation inbox — pending acceptance-matrix routes (llm/human/code adapters)

**Usage:** `deckent confirmations`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-confirmations-list"></a>
## `deckent confirmations list`

List pending confirmation requests

**Usage:** `deckent confirmations list`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-confirmations-decide"></a>
## `deckent confirmations decide`

Decide one HUMAN-adapter confirmation (interactive terminal, single-shot)

**Usage:** `deckent confirmations decide <id>`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--confirm` | record a CONFIRMED verdict |
| `--reject` | record a FAILED verdict |
| `--reason <text>` | why (recorded verbatim on the settlement) |

### Arguments

| Argument | Description | Required | Variadic |
|---|---|---|---|
| `<id>` | Pending confirmation identifier; decisions are routed to the authenticated approval surface. | Yes | No |

---

<a id="deckent-confirmations-run"></a>
## `deckent confirmations run`

Run pending LLM-adapter confirmations through cross-provider adjudication (xverify runtime)

**Usage:** `deckent confirmations run`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--id <id>` | run a single pending llm confirmation |
| `--author <provider>` | author provider when the request carries none |
| `--timeout <ms>` | verifier timeout in milliseconds |

---

<a id="deckent-provider-authority"></a>
## `deckent provider-authority`

Inspect and provision the host-scoped provider authority keyring (owner-gated)

**Usage:** `deckent provider-authority`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-provider-authority-keyring"></a>
## `deckent provider-authority keyring`

Provider authority keyring — status / init / rotate

**Usage:** `deckent provider-authority keyring`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-provider-authority-keyring-status"></a>
## `deckent provider-authority keyring status`

Show keyring location and revision state (never prints key material)

**Usage:** `deckent provider-authority keyring status`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-provider-authority-keyring-init"></a>
## `deckent provider-authority keyring init`

Provision the keyring genesis revision (owner action; refuses if one exists)

**Usage:** `deckent provider-authority keyring init`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-provider-authority-keyring-rotate"></a>
## `deckent provider-authority keyring rotate`

Rotate the active authority key (requires --expect-revision)

**Usage:** `deckent provider-authority keyring rotate`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--expect-revision <hash>` | Revision hash the rotation must apply to (from `status`) — prevents clobbering a concurrent update |

---

<a id="deckent-provider-authority-limits"></a>
## `deckent provider-authority limits`

Provider-limit authority — author the `provider_limits` policy from live provider truth

**Usage:** `deckent provider-authority limits`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-provider-authority-limits-init"></a>
## `deckent provider-authority limits init`

Derive and write the global `provider_limits` block for one exact provider scope (owner-confirmed)

**Usage:** `deckent provider-authority limits init`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Apply | Owner | Text | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--provider <id>` | Canonical provider id the policy is authored for |
| `--model <apiId>` | Exact model api id the live limit source is asked about |
| `--auth-mode <mode>` | Exact auth mode: subscription \| api \| hybrid \| local |
| `--transport <transport>` | Exact transport: cli \| api \| http \| local-runtime |
| `--execution-backend <backend>` | Exact execution backend: host-subprocess \| docker \| tmux \| api \| in-process |
| `--execution-profile-ref <ref>` | Adapter-owned execution profile reference the account authority is scoped to |
| `--endpoint-ref-hash <hash>` | Optional opaque SHA-256 endpoint reference (never a URL) |
| `--tenant <id>` | Tenant id the policy is authored for (solo hosts use `local`) |
| `--warn-at-ratio <ratio>` | Consumption ratio (0..1) at which a run is warned |
| `--block-at-ratio <ratio>` | Consumption ratio (0..1) at which a run is blocked (must be >= warn) |
| `--ratio-enforcement <mode>` | Ratio gate mode: enforce (default) or observe_only; absolute floors and unknown evidence still fail closed |

---

<a id="deckent-provider-observations"></a>
## `deckent provider-observations`

Inspect and migrate the durable provider-execution observation store: read its schema and counts, migrate it forward, adopt an external preimage, or reconcile recorded runs.

**Usage:** `deckent provider-observations`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-provider-observations-inspect"></a>
## `deckent provider-observations inspect`

Read the observation store and report its schema version and record counts. Read-only: never migrates, adopts or writes.

**Usage:** `deckent provider-observations inspect`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Owner | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--database <path>` | Path to the observation database to operate on instead of the project default. |
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |

---

<a id="deckent-provider-observations-migrate"></a>
## `deckent provider-observations migrate`

Migrate the observation store to the current schema version. Plans and prints the migration by default; --apply performs it under an approval.

**Usage:** `deckent provider-observations migrate`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Owner | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--database <path>` | Path to the observation database to operate on instead of the project default. |
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |
| `--apply` | Perform the planned operation and write its result. Without this flag the command only plans and prints; nothing durable changes. |
| `--plan-digest <digest>` | Digest of the plan this run must match. The operation is refused when the store has changed since that plan was produced. |
| `--approval-id <id>` | Identifier of the approval that authorizes the write. Required when --apply needs an approval that is not already held. |

---

<a id="deckent-provider-observations-adopt"></a>
## `deckent provider-observations adopt`

Adopt an external observation preimage into the store as durable records. Plans by default; --apply performs the adoption.

**Usage:** `deckent provider-observations adopt`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Owner | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--database <path>` | Path to the observation database to operate on instead of the project default. |
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |
| `--preimage <path>` | Path to the observation preimage file to adopt. Read as evidence; the file itself is never modified. |
| `--apply` | Perform the planned operation and write its result. Without this flag the command only plans and prints; nothing durable changes. |
| `--plan-digest <digest>` | Digest of the plan this run must match. The operation is refused when the store has changed since that plan was produced. |

---

<a id="deckent-provider-observations-adopt-runtime"></a>
## `deckent provider-observations adopt-runtime`

Adopt a runtime-produced observation preimage, keeping the runtime's own execution identity. Plans by default; --apply performs the adoption.

**Usage:** `deckent provider-observations adopt-runtime`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Owner | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--database <path>` | Path to the observation database to operate on instead of the project default. |
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |
| `--preimage <path>` | Path to the observation preimage file to adopt. Read as evidence; the file itself is never modified. |
| `--apply` | Perform the planned operation and write its result. Without this flag the command only plans and prints; nothing durable changes. |
| `--plan-digest <digest>` | Digest of the plan this run must match. The operation is refused when the store has changed since that plan was produced. |

---

<a id="deckent-provider-observations-reconcile"></a>
## `deckent provider-observations reconcile`

Compare recorded observations against the runs they claim and report every mismatch. Plans by default; --apply writes the reconciliation.

**Usage:** `deckent provider-observations reconcile`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Owner | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--database <path>` | Path to the observation database to operate on instead of the project default. |
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |
| `--run-id <id>` | Restrict reconciliation to this run identifier. Repeat the flag to reconcile several runs in one pass. |
| `--apply` | Perform the planned operation and write its result. Without this flag the command only plans and prints; nothing durable changes. |
| `--plan-digest <digest>` | Digest of the plan this run must match. The operation is refused when the store has changed since that plan was produced. |
| `--approval-id <id>` | Identifier of the approval that authorizes the write. Required when --apply needs an approval that is not already held. |

---

<a id="deckent-execution-authority"></a>
## `deckent execution-authority`

Inspect and reconcile project execution authority bindings

**Usage:** `deckent execution-authority`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-execution-authority-mount-adopt"></a>
## `deckent execution-authority mount-adopt`

Reconcile namespace-local Linux/WSL mount metadata without changing execution authority

**Usage:** `deckent execution-authority mount-adopt`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Local write | Preview; explicit apply required | Owner | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--apply` | Apply eligible observational metadata reconciliation (default: dry-run) |
| `--operator <id>` | Stable operator identifier; only its SHA-256 digest is persisted |
| `--justification <text>` | Operator-authored reconciliation justification; only its SHA-256 digest is persisted |
| `--json` | Emit the stable machine-readable adoption DTO |

---

<a id="deckent-cu-status"></a>
## `deckent cu-status`

Show computer-use configuration and availability for each capability

**Usage:** `deckent cu-status`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text and JSON | `darwin`, `linux`, `win32` | None |

### Options

| Flags | Description |
|---|---|
| `--json` | Emit the result as one machine-readable JSON document instead of formatted text. |

---

<a id="deckent-local-llm"></a>
## `deckent local-llm`

Manage the project-scoped local LLM runtime

**Usage:** `deckent local-llm`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Command group (help only) | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-local-llm-start"></a>
## `deckent local-llm start`

Start the configured local LLM server

**Usage:** `deckent local-llm start`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-local-llm-status"></a>
## `deckent local-llm status`

Inspect local LLM health and advertised models

**Usage:** `deckent local-llm status`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-local-llm-stop"></a>
## `deckent local-llm stop`

Stop the project-scoped local LLM server

**Usage:** `deckent local-llm stop`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Process control | Apply | Operator | Text | `darwin`, `linux`, `win32` | None |

---

<a id="deckent-help-info"></a>
## `deckent help-info`

Show quick-reference help (localized)

**Usage:** `deckent help-info`

### Execution contract

| Effect | Default execution | Authority | Output | Platforms | Aliases |
|---|---|---|---|---|---|
| Read-only | Read | Open | Text | `darwin`, `linux`, `win32` | `info` |

### Options

| Flags | Description |
|---|---|
| `--lang <lang>` | Language override for the quick reference: en \| tr |
