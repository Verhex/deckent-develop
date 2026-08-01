# CLI reference

## Product-user perspective

### Verified surface

The built Commander tree contains 75 registered top-level commands: 74 are visible and `gateway-runtime` is hidden. Recursing through the tree yields 211 visible command paths plus that hidden internal path. [Evidence: command importing `buildProgram()` from `dist/cli/index.js` and recursively inspecting `Command.commands`, 2026-08-01; registration order `src/cli/index.ts:99-225`]

`node dist/cli/entry.js --help` and `--help` for every one of the 211 visible paths were executed against the real binary: 212 invocations, 212 exit-code-zero results. Help verification proves registration, parsing, usage, options, and help rendering; it does not prove every state-changing action. This rewrite was prohibited from writing outside `docs/`, so run/sprint/autonomous, config mutation, cleanup, kill, provisioning, and other mutating actions were not executed. [Evidence: recursive binary-help audit output, 2026-08-01; user boundary]

The inspected binary reports Deckent `1.0.0-beta.1` on Node `v24.15.0`. [Evidence: `node dist/cli/entry.js --version-json`, 2026-08-01]

### Invocation

Use the installed binary as `deckent …`, or the repository build as `node dist/cli/entry.js …`. Append `--help` at any level to obtain the exact arguments and options for that build. [Evidence: root and recursive binary help outputs, 2026-08-01; `package.json` field `bin`]

### Top-level commands without child commands

| Command | Actual registered purpose |
|---|---|
| `init` | Initialize a Deckent project. |
| `start` | Start a run/sprint; accepts zero-config description input. |
| `plan` | Plan without executing. |
| `status` | Show the current run dashboard. |
| `attach` | Attach to the tmux orchestra session. |
| `spawn` | Manually spawn a task worker; Docker blocks until exit, tmux/subprocess does not. |
| `kill` | Kill a running worker. |
| `retro` | Show the latest retrospective. |
| `cleanup` | Clean sprint artifacts. |
| `doctor` | Check dependencies and health. |
| `history` | Show run history. |
| `upgrade` | Self-update Deckent. |
| `onboard` | Run onboarding. |
| `analyze` (`analyze-project`) | Analyze stack, size, and methodology. |
| `archive-debt` | Report DB-first technical-debt status. |
| `dashboard` | Open the auto-refreshing terminal dashboard. |
| `serve` | Start the HTTP API server with SSE. |
| `web` | Deprecated web/API launcher; help directs users to `serve`. |
| `sync` | Sync adapter files and detect out-of-band changes. |
| `watch` | Follow a worker or open the tmux dashboard split. |
| `run <description>` | Run one one-shot task; also owns alias children described below. |
| `runs` | List RunFlows and approve, reject, or start a selected flow. |
| `test` | Run a test sprint without retro, memory update, or decay. |
| `review` | Review task evaluations. |
| `finalize` | Update managed sprint knowledge/config projections and run decay. |
| `explain` | Render the last sprint in human-oriented language. |
| `set-directives` | Write goals to `DIRECTIVES.md` from content, file, or stdin. |
| `connect` | Read-only provider/MCP/IDE/shell diagnostics. |
| `plan-nl` | Preview a single-task `DIRECTIVES.md` scaffold from free-form intent. |
| `do` | Preview the golden flow by default; `--run` starts it. |
| `heartbeat` | Run tasks from `.deckent/HEARTBEAT.md`. |
| `chat` | Start a conversational session through an installed AI CLI. |
| `output` | Show captured output for one worker task. |
| `recall` | Query project memory. |
| `remember` | Store a note in project memory. |
| `resume` | Resume from the latest checkpoint. |
| `features` (`feature-query`) | Query the feature manifest by category. |
| `truth` | Resolve code → wired → enabled → proof truth-chain. |
| `audit` | Gate or query/export/forward/retain audit events. |
| `audit-verify` | Verify the audit HMAC chain. |
| `recover` | Execute canonical recovery for a crashed or stuck sprint. |
| `resources` | Show live Docker worker resources or analyze a resource log. |
| `usage` | Show token/limit consumption from provider transcripts. |
| `kpi` | Show the run/sprint KPI scorecard. |
| `limits` | Check subscription-window usage and start-gate thresholds. |
| `openrouter-probe` | Live-probe OpenRouter free models and refresh cache. |
| `xverify` | Cross-verify a claim on a different provider; host adjudicates typed evidence. |
| `cu-status` | Show computer-use flag and per-capability availability. |
| `help-info` (`info`) | Show localized quick-reference help. |

[Evidence for every row: descriptions read from the built `buildProgram()` tree and the corresponding real binary `--help`, all exit code 0, 2026-08-01]

### Command groups and every child path

| Parent | Child paths | Behavior boundary |
|---|---|---|
| `config` | `set`, `get`, `export`, `import`, `list`, `keys`, `migrate`; `nervous`, `nervous set`, `nervous override`, `nervous list`, `nervous reset` | Read/write project configuration, migrate it, and manage Nervous authority policy. Bare `config` reads effective config; there is no CLI `config read`. |
| `plugin` | `install`, `remove`, `update`, `list`, `info`, `test`, `create` | Install, inspect, validate, update, remove, or scaffold plugins. |
| `run` | `start`, `status`, `retro`, `history` | Bridge aliases to the identically named top-level lifecycle commands; the parent itself remains one-shot execution with required `<description>`. |
| `process` | `submit`, `status`, `result` | Submit an `ExecutionRequest`, poll it, and retrieve its result. |
| `agent` | `lint`, `list`, `create`, `stats`, `enable`, `disable`, `delete`, `edit`, `reclassify`, `info` | Manage and inspect the agent pool and outcome classifications. |
| `skill` | `list`, `create`, `install`, `update`, `enable`, `disable`, `delete`, `info`, `search`, `publish` | Manage local/installed skills and marketplace validation/publication. |
| `checkpoint` | `list`, `approve`, `reject` | Inspect and decide human checkpoints. |
| `docs` | `add`, `remove`, `list`, `update`, `run`; `track`, `track scan`, `track status`, `track sync` | Manage managed-doc rules and freshness tracking. |
| `task` | `settle` | Inspect immutable one-shot settlement and apply only with explicit attestation. |
| `cost` | `show`, `update`, `budget` | Read pricing, fetch current pricing, and manage budget limits. |
| `memory` | `rebuild`, `export`, `stats`, `backup`; `relations`, `relations list`, `relations review` | Maintain the DB-first memory store, projections, backup, and relation review. |
| `trace` | `extract` | Extract aligned/general training examples from Claude Code transcripts. |
| `nervous` | `enable`, `accept`, `reject`, `edit`, `undo`, `history`, `recommendations` (`recs`), `log`, `accept-panic`, `baseline-refresh` | Inspect or govern proactive recommendations and reversible actions. |
| `mode` | `show`, `sprint`, `run`, `task`, `process`, `auto`, `global` | Read or set `deckent_style`; `run` currently persists `sprint`. |
| `models` | `list`, `refresh`, `tier` | Browse, refresh, and classify registry models. |
| `flow` | `list`, `add`, `run`, `approve` | Manage scheduled process-mode flows and pending dispatch approval. |
| `rbac` | `check`, `roles`, `grant`, `revoke` | Inspect permissions and mutate user-role assignments. |
| `evolve` | `report` | Show cross-sprint agent/skill trends and prompt suggestions. |
| `autonomous` | `enable`, `start`, `plan`, `status`, `stop`, `cleanup`, `pending`, `approve`, `reject`; `backlog`, `backlog add`, `backlog list`, `backlog remove` | Govern the continuous loop, parked approvals, and backlog. |
| `autonomous-mission` | `create-list`, `create-goal`, `list` | Create or list durable v2 missions. |
| `bot` | `listen`, `start`, `stop`, `status` | Operate the messaging approval bot. |
| `gateway` | `listen`, `start`, `stop`, `status`; `pair`, `pair list`, `pair approve`, `pair reject` | Operate the project gateway and pairing decisions. Several child commands currently render no description. |
| `mcp` | `add`, `list`, `remove`, `get` | Manage external MCP server registrations and scope precedence. |
| `image` | `build` | Build the packaged worker Docker image. |
| `provider-authority` | `keyring`, `keyring status`, `keyring init`, `keyring rotate` | Inspect, initialize, or rotate host authority keys without printing key material. |
| `execution-authority` | `mount-adopt` | Inspect or reconcile namespace-local Linux/WSL mount metadata. |

[Evidence for every path: built `buildProgram()` recursive inventory and actual binary `--help` for all visible paths, 2026-08-01; source registrations `src/cli/index.ts:99-225`]

The hidden `gateway-runtime` command is an internal per-project child spawned by the supervisor and is not a user command. [Evidence: built Commander tree; `src/cli/commands/gateway.ts:161`]

### Commands requiring explicit care

| Surface | Why it is consequential |
|---|---|
| `start`, `run`, `do --run`, `spawn`, `test`, `resume`, `recover` | Start, resume, or alter execution and may create runtime/task state. |
| `kill`, `cleanup`, `autonomous stop`, `autonomous cleanup` | Terminate workers or remove runtime artifacts; owner approval and exact scope are required by repository policy. |
| `config set\|import\|migrate`, `mode …`, `nervous enable`, `autonomous enable` | Persist policy/configuration changes. |
| `agent …`, `skill …`, `plugin …`, `rbac grant\|revoke`, `mcp add\|remove` | Mutate registries, packages, identities, or external-server configuration. |
| `memory rebuild\|export\|backup`, `remember`, `docs …`, `finalize`, `set-directives` | Write project knowledge, generated projections, or directives. |
| `models refresh`, `cost update`, `openrouter-probe`, `upgrade`, `image build` | Perform network, cache, installation, or image side effects. |
| `provider-authority keyring init\|rotate`, `execution-authority mount-adopt` | Change authority material or authority-adjacent metadata and require explicit operator intent. |

[Evidence: corresponding built command descriptions and help; operation rules `AGENTS.md:69-108`; command implementations under `src/cli/commands/`]

### Known CLI truth gaps

- Root help mixes English and Turkish descriptions (`status`, `history`, `recover`) and many descriptions/options are hard-coded instead of passing through `getMessage`. [Evidence: actual root help, 2026-08-01; `src/cli/index.ts:102-109`; `src/cli/commands/status.ts:1028-1039`; `src/cli/commands/history.ts:222-232`; `src/cli/commands/recover.ts:170-183`; i18n contract `AGENTS.md:42-48`]
- The public status output-mode enum exposes misspellings `explainatory` and `standart`. [Evidence: actual `deckent status --help`; `src/cli/commands/status.ts:1039`]
- `run` is simultaneously a required-description one-shot parent and a namespace for lifecycle aliases, producing awkward usage such as `deckent run [options] [command] <description>`. [Evidence: actual `deckent run --help`; `src/cli/commands/run.ts:455-476,920-939`]
- Public help still uses both `run` and `sprint`; `mode run` stores `sprint`. [Evidence: actual root and `mode --help`; `src/cli/commands/mode.ts`]
- `web` remains visible while explicitly deprecated. [Evidence: actual root help; `src/cli/index.ts:145-148`]

These and the action-level CLI↔MCP gaps are classified in `docs/analysis/CODE-DOC-DIFF-2026-08.md`.

## Dogfood / repository reality

| CLI property | State | Current evidence |
|---|---|---|
| Registration/help surface | ✅ live | Root plus 211 visible paths all rendered real binary help with exit 0. |
| Read-only operational probes | ✅ live | Version, doctor, status, config, feature/truth, history/retro/review and service-status paths were executed where safe. |
| State-changing behavior proof | ⚠️ HOLD | This audit was forbidden from running sprint/run/autonomous actions; help does not certify mutation completion (OQ-20). |
| i18n | ⚠️ partial | Mixed-language and hard-coded Commander metadata remain confirmed. |
| Run/Sprint vocabulary | ⚠️ partial | Parent/child collision and compatibility naming remain OQ-14. |
| CLI↔MCP semantic parity | ⚠️ partial | Ratchet passes but action/schema/default differences remain. [Evidence: `docs/analysis/CODE-DOC-DIFF-2026-08.md`] |
