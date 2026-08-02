# MCP reference

## Product-user perspective

### Catalog contract

`src/mcp/tools/index.ts` is the canonical name/description/read-only catalog. It contains 49 entries and `registerTools` registers the same 49 in the same order. The count is derived as `TOOL_CATALOG.length`; tests enforce catalog/registration alignment. [Evidence: `src/mcp/tools/index.ts:55-68,124-176`; built registration introspection, catalog 49 = registered 49, 2026-08-01]

The MCP server uses stdio transport. Tools execute relative to the server process's project root unless a schema exposes a `root` override. [Evidence: `src/mcp/server.ts`; individual tool registrations under `src/mcp/tools/`]

Schema notation below: `*` means required, `?` means optional, and `=value` records a Zod default. `RO`/`RW` reproduces the catalog's `readOnly` flag; it is an annotation, not proof that every action is side-effect-free. Schemas were extracted from the 49 Zod objects actually passed to the built server's `registerTool`, then checked against source registrations. [Evidence: built fake-server registration introspection, 2026-08-01; `src/mcp/tools/index.ts:68-121`]

### All 49 tools

| Tool | Mode | Input schema | Implemented behavior | Closest CLI surface / parity |
|---|---|---|---|---|
| `deckent_init` | RW | `projectName?:string`, `mode?:performance\|balanced\|economic\|api\|max_plan\|max5x_plan\|pro_plan=performance`, `language?:en\|tr=en`, `force?:boolean=false`, `auto?:boolean=false`, `installMissing?:boolean=false` | Initializes project files and optional provisioning. `src/mcp/tools/init.ts:63` | `init`; near parity. |
| `deckent_set_directives` | RW | `content*:string` | Writes run goals/task definitions to `DIRECTIVES.md`. `src/mcp/tools/directives.ts:49` | `set-directives`; thin counterpart. |
| `deckent_plan` | RW | `dryRun?:boolean=true`, `mode?:ai\|structured\|auto`, `approve?:boolean=false`, `acknowledgeScopePaths?:boolean=false` | Plans and can materialize task state. `src/mcp/tools/plan.ts:33` | `plan`; MCP defaults to dry-run, CLI only dry-runs when asked. |
| `deckent_start` | RW | `autoApprove?:boolean=false`, `acknowledgeCost?:boolean=false`, `acknowledgeScopePaths?:boolean=false`, `acknowledgePromptGate?:boolean=false`, `dryRun?:boolean=false`, `force?:boolean=false`, `timeout?:number`, `sandbox?:boolean=false`, `flowId?:string`, `revision?:number`, `planDigest?:string` | Starts an admitted run, including exact-flow identity inputs. `src/mcp/tools/start.ts:63` | `start`; close surface, schemas differ. |
| `deckent_status` | RO | `json?:boolean=false`, `verbose?:boolean=false`, `outputMode?:explainatory\|standart\|verbose\|json` | Returns current dashboard/progress/usage/alerts. `src/mcp/tools/status.ts:364` | `status`; shared misspelled public enum. |
| `deckent_doctor` | RO | `includeProfile?:boolean=false`, `profile?:boolean=false`, `providers?:boolean=false`, `json?:boolean=false` | Runs configuration, dependency, provider, and health checks. `src/mcp/tools/doctor.ts:16` | `doctor`; near parity. |
| `deckent_retro` | RO | `sprintId?:string` | Reads latest or selected retrospective. `src/mcp/tools/retro.ts:49` | `retro`; near parity. |
| `deckent_history` | RO | `last?:number=5`, `json?:boolean=false` | Lists prior run outcomes. `src/mcp/tools/history.ts:30` | `history`; near parity. |
| `deckent_analyze_project` | RO | `{}` | Detects project language/framework/test/build stack. `src/mcp/tools/analyze.ts:18` | `analyze` / `analyze-project`; alias parity. |
| `deckent_sync` | RW | `{}` | Syncs workspace adapters and manifests. `src/mcp/tools/sync.ts:10` | `sync`; counterpart. |
| `deckent_config` | RW | `action*:read\|get\|set`, `key?:string`, `value?:unknown` | Reads effective config, gets a key, or sets a value. `src/mcp/tools/config.ts:12` | Bare `config`, `config get`, `config set`; naming differs because CLI has no `config read`. |
| `deckent_review` | RO | `auto?:boolean=false` | Evaluates run results and returns settlement verdicts. `src/mcp/tools/review.ts:69` | `review`; near parity. |
| `deckent_run` | RW | `description*:string`, `model?:string`, `provider?:string`, `modelEffort?:string`, `scope?:string`, `timeoutMs?:number`, `keep?:boolean`, `autoApprove?:boolean=true` | Builds one provider-resolved `ExecutionRequest`, writes task state, and spawns one worker. `src/mcp/tools/run.ts:29-130` | `run`; MCP `autoApprove=true`, CLI default false. |
| `deckent_kill` | RW | `taskId?:string`, `all?:boolean=false`, `force?:boolean`, `userExplicit?:boolean` | Kills one or all workers with explicit-intent fields. `src/mcp/tools/kill.ts:78` | `kill`; near parity. |
| `deckent_cleanup` | RW | `decay?:boolean=false`, `dryRun?:boolean=false` | Archives task artifacts and releases locks. `src/mcp/tools/cleanup.ts:56` | `cleanup`; CLI has exact `--sprint`, MCP does not. |
| `deckent_help` | RO | `{}` | Returns runtime capabilities, project state, and next-step recommendation. `src/mcp/tools/help.ts:171` | `help-info` / `info`; related, not identical output. |
| `deckent_agent_list` | RO | `{}` | Lists built-in and project agents. `src/mcp/tools/agent-list.ts:70` | `agent list`; counterpart. |
| `deckent_skill_list` | RO | `{}` | Lists skills and sandbox/manifest information. `src/mcp/tools/skill-list.ts:56` | `skill list`; counterpart. |
| `deckent_checkpoint` | RW | `action*:list\|approve\|reject`, `sprintId?:string`, `phase?:string`, `root?:string` | Lists or decides checkpoint gates. `src/mcp/tools/checkpoint.ts:79` | `checkpoint list\|approve\|reject`; compact action wrapper. |
| `deckent_docs` | RW | `action*:add\|remove\|list\|update\|run\|track-scan\|track-status`, `file?:string`, `autoSections?:string[]`, `protectedSections?:string[]`, `addAutoSections?:string[]`, `removeAutoSections?:string[]`, `addProtectedSections?:string[]`, `skills?:string[]`, `maxLines?:number`, `root?:string` | Manages managed-doc rules/runs and two tracking views. `src/mcp/tools/docs.ts:13-44` | `docs …`; MCP omits CLI `docs track sync`. |
| `deckent_explain` | RO | `sprintId?:string`, `verbose?:boolean=false`, `json?:boolean=false` | Explains run history/result. `src/mcp/tools/explain.ts:48` | `explain`; near parity. |
| `deckent_memory_query` | RO | `query*:string`, `type?:string[]`, `status?:string[]`, `limit?:number=5`, `sprint_min?:number`, `mode?:and\|or=or`, `root?:string` | Queries memory entries with filters. `src/mcp/tools/memory-query.ts:11` | `recall`; MCP exposes richer structured filters. |
| `deckent_watch` | RO | `sprintId?:string`, `channels?:(PHASE\|TASK_ASSIGN\|HEARTBEAT\|RESULT\|ALERT\|NOTIFY\|METRIC)[]`, `tail?:number=20` | Backfills and subscribes to live events through MCP logging. `src/mcp/tools/watch.ts:24` | `watch`; transport behavior differs. |
| `deckent_nervous_subscribe` | RO | `sprintId?:string`, `root?:string` | Subscribes to Nervous notifications. `src/mcp/tools/nervous.ts:386` | No exact CLI subscription; `nervous` is dashboard/action oriented. |
| `deckent_nervous_accept` | RW | `id*:string`, `root?:string` | Accepts one pending suggestion. `src/mcp/tools/nervous.ts:431` | `nervous accept`; counterpart. |
| `deckent_nervous_reject` | RW | `id*:string`, `reason?:string`, `root?:string` | Rejects one pending suggestion. `src/mcp/tools/nervous.ts:499` | `nervous reject`; counterpart. |
| `deckent_nervous_status` | RO | `root?:string` | Returns pending/recent/config dashboard data. `src/mcp/tools/nervous.ts:531` | Bare `nervous`; near parity. |
| `deckent_nervous_config` | RW | `action*:read\|set_preset\|set_override\|list_actions\|reset`, `preset?:strict\|balanced\|autopilot\|full-auto`, `overrides?:record` , `root?:string` | Reads or mutates Nervous authority settings. `src/mcp/tools/nervous.ts:585` | `config nervous …`; action names/shape differ. |
| `deckent_feature_query` | RO | `category?:string`, `id?:string` | Queries manifest entries. `src/mcp/tools/feature-query.ts:44` | `features` alias `feature-query`; parity linter currently misclassifies it as MCP-only. |
| `deckent_truth` | RO | `check?:boolean` | Resolves manifest truth blocks through code/wiring/enablement/proof. `src/mcp/tools/truth.ts:76` | `truth`; counterpart. |
| `deckent_audit` | RO | `sprintId?:string`, `action?:gate\|query\|compliance\|retention=gate`, `channel?:string`, `tenant?:string`, `limit?:number`, `keepDays?:number`, `keepCount?:number`, `apply?:boolean=false` | Gates, queries, reports compliance, or applies retention. `retention + apply=true` permanently prunes events. `src/mcp/tools/audit.ts:27-114` | `audit`; omits CLI `forward`. Catalog RO annotation contradicts mutating gate/retention behavior. |
| `deckent_recover` | RW | `sprintId*:string`, `dryRun?:boolean=true`, `skipAudit?:boolean=false`, `approval?:object` | Plans or applies canonical crash/stuck-run recovery. `src/mcp/tools/recover.ts:11` | `recover`; MCP default is dry-run, CLI default differs. |
| `deckent_models` | RO | `action*:list\|refresh\|tier`, `provider?:string`, `model?:string`, `offline?:boolean` | Reads catalog, force-refreshes cache/network data, or finds model tier. `src/mcp/tools/models.ts:21-79` | `models list\|refresh\|tier`; RO annotation includes refresh side effects. |
| `deckent_autonomous` | RW | `action*:status\|start\|stop\|backlog_add\|backlog_list\|backlog_remove\|pending\|approve\|reject`, `root?:string`, `id?:string`, `title?:string`, `kind?:task\|sprint\|capability=task`, `description?:string=''`, `policy?:auto\|approval-required\|risk-tagged=auto`, `cron?:string`, `capability?:string`, `capabilityArgs?:string`, `connector?:string`, `triggerId?:string`, `reason?:string` | Combined autonomous control/backlog/decision surface. `src/mcp/tools/autonomous.ts:104` | `autonomous …`; CLI additionally has `enable`, `plan`, and `cleanup`. |
| `deckent_process` | RW | `action*:submit\|status\|result`, `root?:string`, `description?:string`, `kind?:task\|sprint\|capability`, `capability?:string`, `capabilityArgs?:string`, `connector?:string`, `scopeDir?:string`, `provider?:string`, `model?:string`, `tenant?:string`, `actorId?:string`, `executionId?:string` | Submits/polls/results policy-gated process work. `src/mcp/tools/process.ts:29` | `process submit\|status\|result`; intended counterpart. |
| `deckent_usage` | RO | `sprint?:string`, `since?:string`, `until?:string`, `lineage?:object` | Aggregates provider transcript usage and run breakdown. `src/mcp/tools/usage.ts:169` | `usage`; structured input differs. |
| `deckent_xverify` | RW | `claim*:string`, `author*:claude\|codex\|gemini\|ollama\|openrouter`, `verifier?:same-provider-enum`, `verifierModel?:string`, `diff?:boolean`, `files?:string`, `timeoutMs?:number` | Enforces different-provider verification and returns host disposition. `src/mcp/tools/xverify.ts:34` | `xverify`; near parity. |
| `deckent_kpi` | RO | `sprint?:string`, `tenantId?:string`, `trend?:string`, `n?:number` | Returns KPI scorecard/trend data. `src/mcp/tools/kpi.ts:109` | `kpi`; near parity. |
| `deckent_cost` | RO | `sprint?:string`, `tenantId?:string` | Returns budgets, prices, and observed spend. `src/mcp/tools/cost.ts:119` | `cost show`; CLI also mutates pricing/budgets. |
| `deckent_agent_manage` | RW | `action*:add\|remove\|promote`, `id*:string`, `name?:string`, `description?:string`, `model?:string`, `triggers?:string[]`, `prompt?:string`, `root?:string` | Adds/removes/promotes agents. `src/mcp/tools/catalog-parity.ts:48` | Partial `agent` parity; CLI has ten child commands and different verbs. |
| `deckent_skill_manage` | RW | `action*:add\|remove\|marketplace-list`, `id?:string`, `name?:string`, `description?:string`, `category?:language\|framework\|tool\|domain\|workflow`, `triggers?:string[]`, `query?:string`, `limit?:number`, `root?:string` | Adds/removes skills or lists marketplace matches. `src/mcp/tools/catalog-parity.ts:146` | Partial `skill` parity; CLI has ten child commands. |
| `deckent_memory_manage` | RW | `action*:insert\|update\|decay-trigger`, entry fields (`id`, `type`, `title`, `content`, `summary`, `tags`, `status`, `priority`, `sprint_id`, `sprint_num`, `lang`, `decay_exempt`, `metadata`), `changed_by?:string`, `current_sprint_num?:number`, `decay_after_sprints?:number`, `root?:string` | Inserts/updates memory or triggers decay. `src/mcp/tools/catalog-parity.ts:227` | Partial `remember`/`memory`; no one-to-one CLI action set. |
| `deckent_autonomous_backlog` | RW | `action*:list\|add\|remove`, `root?:string`, `id?:string`, `title?:string`, `kind?:task\|sprint\|capability=task`, `description?:string=''`, `policy?:auto\|approval-required\|risk-tagged=auto`, `cron?:string` | Dedicated backlog list/add/remove. `src/mcp/tools/autonomous-surface.ts:63` | `autonomous backlog …`; counterpart, duplicated by combined tool. |
| `deckent_autonomous_status` | RO | `root?:string` | Returns autonomous snapshot. `src/mcp/tools/autonomous-surface.ts:164` | `autonomous status`; counterpart, duplicated by combined tool. |
| `deckent_nervous_edit` | RO | `id*:string`, `modifiedPayload*:record`, `root?:string` | Produces an exec-free edit-and-accept plan. `src/mcp/tools/nervous-edit.ts:183` | `nervous edit` applies action; MCP intentionally only plans, so behavior is not parity. |
| `deckent_nervous_undo` | RO | `id?:string`, `root?:string` | Produces an undo plan or honest unsupported result. `src/mcp/tools/nervous-edit.ts:215` | `nervous undo` applies/requests undo; MCP is plan-only. |
| `deckent_autonomous_approve` | RW | `id?:string`, `triggerId?:string`, `reason?:string`, `root?:string` | Approves an approval-required backlog/trigger entry. `src/mcp/tools/autonomous-approval.ts:56` | `autonomous approve`; dedicated duplicate of combined tool. |
| `deckent_autonomous_reject` | RW | `id?:string`, `triggerId?:string`, `reason?:string`, `root?:string` | Rejects an approval-required backlog/trigger entry. `src/mcp/tools/autonomous-approval.ts:97` | `autonomous reject`; dedicated duplicate of combined tool. |
| `deckent_execution_authority` | RW | `action?:mount-adopt=mount-adopt`, `apply?:boolean=false`, `operator?:string`, `justification?:string` | Inspects or applies namespace-local mount adoption without changing execution identity. `src/mcp/tools/execution-authority.ts:49` | `execution-authority mount-adopt`; compact counterpart. |

### Parity gate interpretation

`npm run lint:parity` scanned 75 CLI command registrations and 49 MCP tools, then passed because no **new** gaps appeared beyond a committed baseline of 37 CLI-only names and one MCP-only name. [Evidence: actual command output, exit code 0, 2026-08-01; `scripts/cli-mcp-parity-baseline.json:3-44`]

That gate is a baseline ratchet, not behavioral equivalence. Its scanner reads top-level `program.command(...)` registrations and uses fuzzy prefix/name matching; it does not compare Zod schemas, defaults, implementation calls, side effects, nested subcommands, or responses. [Evidence: `scripts/lint-cli-mcp-parity.mjs:24-47,116-149,170-250`]

The baseline's sole MCP-only result, `deckent_feature_query`, is a scanner false positive because CLI `features` declares alias `feature-query`. The accepted 37 CLI-only names and the action/schema differences above remain real review work even while the gate is green. [Evidence: `scripts/cli-mcp-parity-baseline.json:3-44`; built Commander tree alias output, 2026-08-01]

### Managed reference freshness

The archived generated MCP reference reported 48 tools and did not contain `deckent_execution_authority`; it remains stale provenance. The current catalog and registration contain 49, and the owner restored the pipeline-owned `docs/reference/mcp-tools.md`; `docs:ref:check` is now 5/5 in sync. The live projection must continue to be regenerated by its pipeline, not hand-written. [Evidence: `docs/archive/docs-pre-reset-2026-08-03/reference/mcp-tools.md`; `src/mcp/tools/index.ts:68-125`; owner-verified pipeline run, 2026-08-02]

## Dogfood / repository reality

| MCP property | State | Current evidence |
|---|---|---|
| Canonical catalog/registration | ✅ live | 49 catalog names and 49 registered names match exactly. |
| Tool schema/behavior documentation | ✅ source-verified | All 49 tools were read from registration and implementation sources. |
| CLI parity | ⚠️ partial | Ratchet passes with 37 CLI-only and one stale MCP-only baseline row; behavioral gaps remain. |
| Safety annotations | ⚠️ partial | Audit and model actions contain side effects not represented by their broad RO annotations. |
| Generated MCP reference | ✅ current projection / ⚠️ stale archive | Archived output says 48; live pipeline-owned output says 49 and is 5/5 in sync. |
| `connect --json` count | ⚠️ mismatch | Real output reported 31 tools, not the canonical 49; recorded as MCP-18. |
