<!-- Bu dosya elle güncellenmiştir (2026-08-01); kalıcı çözüm AUTOGEN üretimidir — bkz. IDENTITY.md AUTOGEN blokları -->

# Environment Tools

Build: tsc
Test: npx vitest run
Lint: tsc --noEmit
Dev: tsc --watch
Coverage: npx vitest run --coverage
Dashboard: deckent web

## MCP Tools

Kaynak: `src/mcp/tools/index.ts` — `TOOL_CATALOG` (registrasyonla byte-for-byte hizalı olduğu
`tests/mcp/tools/index.test.ts` ile zorlanan tek kaynak). Tool adları dosya adlarıyla
birebir eşleşmez (ör. `catalog-parity.ts` üç tool register eder: `deckent_agent_manage`,
`deckent_skill_manage`, `deckent_memory_manage`; `autonomous-surface.ts` iki tool register eder:
`deckent_autonomous_backlog`, `deckent_autonomous_status`). Aşağıdaki liste `TOOL_CATALOG`
dizisinden birebir alınmıştır.

| MCP Name | Description |
|---|---|
| `deckent_init` | Initialize a Deckent project in the current directory |
| `deckent_set_directives` | Write or update DIRECTIVES.md with run goals and task definitions |
| `deckent_plan` | Plan the next run — creates task JSON files in .tasks/ |
| `deckent_start` | Start the run — spawns workers and begins execution |
| `deckent_status` | Get the current run dashboard: agents, progress, usage, alerts |
| `deckent_doctor` | Run system health checks — config, memory, locks, providers |
| `deckent_retro` | Read the latest run retrospective (RETRO.md) |
| `deckent_history` | Browse run history and outcomes across all past runs |
| `deckent_analyze_project` | Analyze project stack: language, framework, test runner, build tool |
| `deckent_sync` | Sync workspace files and agent/skill manifests to disk |
| `deckent_config` | Read, get, or set Deckent configuration values |
| `deckent_review` | Evaluate run results — returns GO / NO_GO / GO_WITH_TECH_DEBT |
| `deckent_run` | Run a single task directly without a full run |
| `deckent_kill` | Kill a running worker by task ID or kill all workers |
| `deckent_cleanup` | Archive task files and release locks after run completes |
| `deckent_help` | Get runtime capabilities, project state, and next-step recommendation |
| `deckent_agent_list` | List registered agents (built-in and project-specific) |
| `deckent_skill_list` | List registered skills with manifest and sandbox info |
| `deckent_checkpoint` | Approve or reject a checkpoint gate during run execution |
| `deckent_docs` | Run lifecycle document management (add/remove/list) |
| `deckent_explain` | Explain run history and results in natural language |
| `deckent_memory_query` | Search project memory across all sources (ADR, run, debt, pattern) |
| `deckent_watch` | Subscribe to the live run event stream via MCP logging notifications (backfill + push) |
| `deckent_nervous_subscribe` | Subscribe to Nervous System notifications |
| `deckent_nervous_accept` | Accept a pending nervous notification |
| `deckent_nervous_reject` | Reject a pending nervous notification |
| `deckent_nervous_status` | Show the Nervous System dashboard (pending, recent, config) |
| `deckent_nervous_config` | Read or set Nervous System authority mode and overrides |
| `deckent_feature_query` | Query the feature manifest by category (active/lightly_used/dormant/dead/all) |
| `deckent_truth` | Feature truth-chain report: code -> wired -> enabled -> proof per feature (born-640) |
| `deckent_audit` | Run the Brain Self-Audit Gate for a run (tsc, vitest, honesty checks) |
| `deckent_recover` | Recover a crashed or stuck run (clean orphan IPC dirs, stale locks, archive tasks) |
| `deckent_models` | Browse model catalog: list by provider, refresh from models.dev, look up tier |
| `deckent_autonomous` | Autonomous engine control surface (status/start/stop/backlog list-add-approve-reject, cron) |
| `deckent_process` | Process-mode execution surface (submit an ExecutionRequest → policy-gated auto-run or park; status/result by executionId) |
| `deckent_usage` | Show token/limit consumption from Claude Code transcripts (model table or run task breakdown + cache-gate) |
| `deckent_xverify` | Cross-verify a claim on a DIFFERENT provider; host returns typed verdict + ALLOW/NO-GO/HOLD disposition |
| `deckent_kpi` | Show the KPI scorecard for a run — returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics |
| `deckent_cost` | Show cost config: budget limits, per-model pricing (input/output per MTok), and today's spend from the resource log |
| `deckent_agent_manage` | Manage the agent pool: add/remove/promote agents (CLI parity) |
| `deckent_skill_manage` | Manage the skill pool: add/remove + marketplace list (CLI parity) |
| `deckent_memory_manage` | Manage project memory: insert/update entries + trigger decay (CLI parity; query via deckent_memory_query) |
| `deckent_autonomous_backlog` | List/add/remove autonomous-engine backlog entries |
| `deckent_autonomous_status` | Read-only autonomous-engine status snapshot |
| `deckent_nervous_edit` | Edit-and-accept a pending nervous suggestion (returns an exec-free plan) |
| `deckent_nervous_undo` | Plan an undo for the last accepted nervous suggestion (honest-unsupported when unavailable) |
| `deckent_autonomous_approve` | Approve an approval-required autonomous backlog entry |
| `deckent_autonomous_reject` | Reject an approval-required autonomous backlog entry |
| `deckent_execution_authority` | Inspect or reconcile namespace-local execution-authority mount metadata |

_Total: 49 MCP tools (sayım: `TOOL_CATALOG.length`, `src/mcp/tools/index.ts`; grep ile bağımsız
doğrulandı — `grep -rhoE "'deckent_[a-zA-Z_]*'" src/mcp/tools | sort -u | wc -l` → 49)._

**Key operational tools:** `deckent_audit`, `deckent_nervous_status`, `deckent_watch`,
`deckent_recover`, `deckent_status`, `deckent_memory_query`

## CLI Commands

Kaynak: `src/cli/index.ts` (register* import + çağrı sırası, 75 `register*` çağrısı) +
`node dist/cli/entry.js --help` çıktısıyla çapraz-doğrulandı (2026-08-01, dist güncel).
`src/cli/commands/*.ts` altındaki bazı dosyalar kullanıcı komutu DEĞİLDİR — iç modüldür ve
`index.ts`'te register edilmez (ör. `chat-render-region.ts`, `retro-parser.ts`,
`doctor-checks.ts`, `init-steps.ts` gibi `chat.ts`/`retro.ts`/`doctor.ts`/`init.ts` tarafından
import edilen yardımcı dosyalar) — bu listede yoklar. `config-nervous.ts` yeni bir top-level
komut eklemez; var olan `config` komutuna `config nervous` alt-komutunu iliştirir
(`registerConfigNervous` mevcut `config` komutunu `program.commands.find(...)` ile bulur).
`skill-marketplace.ts` de benzer şekilde `skill publish` alt-komutunu `skill`'e iliştirir.
`gateway.ts` ayrıca gizli (`hidden: true`) bir `gateway-runtime` komutu register eder — iç
kullanım içindir, kullanıcı yüzeyi değildir, bu listede yok.

| Command | Description |
|---|---|
| `init` | Initialize a new Deckent project |
| `start` | Start a new sprint (optionally with a one-line description for zero-config mode) |
| `plan` | Plan a sprint without executing it |
| `status` | Show the current run dashboard |
| `attach` | Attach to the tmux orchestra session |
| `spawn` | Manually spawn a worker for a task (BLOCKS until the worker exits on the docker backend; fire-and-forget on tmux/subprocess) |
| `kill` | Kill a running worker |
| `retro` | Show the latest sprint retrospective |
| `cleanup` | Clean up after a sprint |
| `doctor` | Check system dependencies and health |
| `config` | Show or modify project configuration (subcommand: `config nervous`) |
| `history` | Show run history |
| `plugin` | Manage plugins |
| `upgrade` | Self-update deckent |
| `onboard` | Run the onboarding wizard |
| `analyze` (alias `analyze-project`) | Analyze project stack, size, and recommended methodology |
| `archive-debt` | Report tech-debt status (DB-first; resolved debt is auto-managed in memory.db) |
| `dashboard` | Show terminal dashboard with auto-refresh (see also: deckent status --watch) |
| `serve` | Start HTTP API server with SSE support |
| `web` | Start web dashboard with API server (deprecated — use `deckent serve`) |
| `sync` | Sync adapter files and detect out-of-band changes since last sprint |
| `watch` | Follow a live worker (docker logs / tmux pane / subprocess log) with --follow <taskId>, or open the tmux dashboard split |
| `run` | Run a single one-shot task without a sprint cycle |
| `runs` | List run-flows (the multi-flow inbox) — plus per-run decide: --approve/--reject/--start |
| `process` | Process-mode execution surface — submit tasks/capabilities and poll their status (ADR-022 CLI/MCP parity) |
| `test` | Run a test sprint (no retro, no memory update, no decay) |
| `agent` | Manage agent pool |
| `skill` | Manage skill pool (subcommand: `skill publish` via skill-marketplace) |
| `review` | Review sprint tasks with evaluations |
| `finalize` | Finalize a sprint: update MEMORY.md, RETRO.md, IDENTITY.md, config, and run decay |
| `explain` | Explain what the last sprint did in human-friendly language |
| `set-directives` | Write sprint goals to DIRECTIVES.md (content, file, or stdin) |
| `connect` | Diagnose provider/MCP/IDE/shell connection status (read-only — no changes are made) |
| `plan-nl` | Turn a free-form goal into a DIRECTIVES.md scaffold (single-task template; preview by default) |
| `do` | Golden-flow: turn a goal into a sprint plan (dry-run preview by default; --run to actually start it) |
| `heartbeat` | Run proactive heartbeat tasks from .deckent/HEARTBEAT.md |
| `chat` | Start a conversational session with Deckent. Uses your installed AI CLI. |
| `checkpoint` | Manage human checkpoints — list, approve, or reject pending checkpoints |
| `docs` | Manage user-defined documents |
| `output` | Show captured output for a specific worker task |
| `task` | Inspect and reconcile immutable one-shot task settlement evidence |
| `cost` | User Safety Shield — cost management & estimation |
| `recall` | Search project memory — ADRs, sprint learnings, patterns, debt |
| `remember` | Store a note in project memory |
| `memory` | Memory V2 management |
| `trace` | Claude Code trace tooling for training corpora |
| `resume` | Resume a sprint from its latest checkpoint |
| `help-info` (alias `info`) | Show quick-reference help (localized) |
| `nervous` | Nervous System dashboard — monitor, accept, reject proactive suggestions |
| `mode` | Get/set deckent_style (run (sprint) \| task \| process) |
| `features` (alias `feature-query`) | List features from .deckent/settings/features-manifest.json by category |
| `truth` | Resolve the 4-level feature truth-chain (code → wired → enabled → proof) for manifest truth-blocks |
| `audit` | Run Brain Self-Audit Gate for a sprint, or query/export/retain audit log events (query \| compliance \| forward \| retention) |
| `audit-verify` | Verify the audit HMAC chain (I4 invariant — tamper-evident audit log) |
| `recover` | Recover a crashed or stuck sprint through the canonical recovery operation |
| `models` | Manage and browse the model catalog |
| `flow` | Manage scheduled flows (process mode) |
| `rbac` | Role-based access control — check permissions and list roles |
| `evolve` | Evolution analysis — cross-sprint trends and prompt suggestions |
| `autonomous` | Autonomous runtime — authority-bounded continuous loop |
| `autonomous-mission` | Manage autonomous v2 missions — list missions, goal missions |
| `bot` | Messaging-connector bot — listen/start/stop/status for inbound approve/reject |
| `gateway` | Project-scoped messaging gateway (G1) |
| `mcp` | Manage MCP servers (Claude-parity) |
| `resources` | Show live docker worker resource usage or analyze resource log |
| `usage` | Show token/limit consumption from Claude Code transcripts |
| `kpi` | Show the KPI scorecard for the current (or a specific) sprint |
| `image` | Worker Docker image management |
| `limits` | Check live subscription-window usage (session/week) and the configured start-gate thresholds |
| `openrouter-probe` | Live-probe OpenRouter free models via $DECK:OPENROUTER_API_KEY and refresh the local cache |
| `xverify` | Cross-verify a claim on a DIFFERENT provider; the host derives ALLOW/NO-GO/HOLD from typed evidence |
| `provider-authority` | Inspect and provision the host-scoped provider authority keyring (owner-gated) |
| `execution-authority` | Inspect and reconcile project execution authority bindings |
| `cu-status` | Show computer-use (TOOL-CU) status: flag state + per-capability availability |

_Total: 74 top-level user-facing CLI commands (75 `register*` calls in `src/cli/index.ts`
minus `registerConfigNervous`, which nests under the existing `config` command instead of
adding a new top-level one). Plus commander's built-in `help [command]`, not one of ours._
