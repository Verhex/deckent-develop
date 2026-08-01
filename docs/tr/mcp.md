# MCP reference

## Product-user perspektifi

### Catalog contract

`src/mcp/tools/index.ts`, canonical name/description/read-only catalog'dur. 49 entry içerir ve `registerTools` aynı 49 tool'u aynı sırada register eder. Count `TOOL_CATALOG.length` ile türetilir; tests catalog/registration alignment'ını enforce eder. [Kanıt: `src/mcp/tools/index.ts:55-68,124-176`; built registration introspection, catalog 49 = registered 49, 2026-08-01]

MCP server stdio transport kullanır. Tool'lar, schema bir `root` override sunmuyorsa server process'in project root'una göre çalışır. [Kanıt: `src/mcp/server.ts`; `src/mcp/tools/` altındaki tool registration'ları]

Aşağıdaki schema notation'da `*` required, `?` optional, `=value` Zod default demektir. `RO`/`RW`, catalog'daki `readOnly` flag'i aynen aktarır; bu annotation her action'ın side-effect-free olduğunun kanıtı değildir. Schema'lar built server'ın `registerTool` çağrısına gerçekten iletilen 49 Zod object'ten çıkarıldı ve source registration'larla karşılaştırıldı. [Kanıt: built fake-server registration introspection, 2026-08-01; `src/mcp/tools/index.ts:68-121`]

### 49 tool'un tamamı

| Tool | Mode | Input schema | Implemented behavior | En yakın CLI surface / parity |
|---|---|---|---|---|
| `deckent_init` | RW | `projectName?:string`, `mode?:performance\|balanced\|economic\|api\|max_plan\|max5x_plan\|pro_plan=performance`, `language?:en\|tr=en`, `force?:boolean=false`, `auto?:boolean=false`, `installMissing?:boolean=false` | Project file'larını ve optional provisioning'i initialize eder. `src/mcp/tools/init.ts:63` | `init`; yakın parity. |
| `deckent_set_directives` | RW | `content*:string` | Run goal/task definition'larını `DIRECTIVES.md` içine yazar. `src/mcp/tools/directives.ts:49` | `set-directives`; thin counterpart. |
| `deckent_plan` | RW | `dryRun?:boolean=true`, `mode?:ai\|structured\|auto`, `approve?:boolean=false`, `acknowledgeScopePaths?:boolean=false` | Plan üretir ve task state materialize edebilir. `src/mcp/tools/plan.ts:33` | `plan`; MCP default dry-run, CLI yalnız istenince dry-run. |
| `deckent_start` | RW | `autoApprove?:boolean=false`, `acknowledgeCost?:boolean=false`, `acknowledgeScopePaths?:boolean=false`, `acknowledgePromptGate?:boolean=false`, `dryRun?:boolean=false`, `force?:boolean=false`, `timeout?:number`, `sandbox?:boolean=false`, `flowId?:string`, `revision?:number`, `planDigest?:string` | Exact-flow identity input'ları dahil admitted run başlatır. `src/mcp/tools/start.ts:63` | `start`; surface yakın, schema'lar farklı. |
| `deckent_status` | RO | `json?:boolean=false`, `verbose?:boolean=false`, `outputMode?:explainatory\|standart\|verbose\|json` | Güncel dashboard/progress/usage/alert döndürür. `src/mcp/tools/status.ts:364` | `status`; ortak yazım hatalı public enum. |
| `deckent_doctor` | RO | `includeProfile?:boolean=false`, `profile?:boolean=false`, `providers?:boolean=false`, `json?:boolean=false` | Configuration, dependency, provider ve health check çalıştırır. `src/mcp/tools/doctor.ts:16` | `doctor`; yakın parity. |
| `deckent_retro` | RO | `sprintId?:string` | Son veya seçili retrospective'i okur. `src/mcp/tools/retro.ts:49` | `retro`; yakın parity. |
| `deckent_history` | RO | `last?:number=5`, `json?:boolean=false` | Eski run outcome'larını listeler. `src/mcp/tools/history.ts:30` | `history`; yakın parity. |
| `deckent_analyze_project` | RO | `{}` | Project language/framework/test/build stack algılar. `src/mcp/tools/analyze.ts:18` | `analyze` / `analyze-project`; alias parity. |
| `deckent_sync` | RW | `{}` | Workspace adapter ve manifest'leri sync eder. `src/mcp/tools/sync.ts:10` | `sync`; counterpart. |
| `deckent_config` | RW | `action*:read\|get\|set`, `key?:string`, `value?:unknown` | Effective config okur, key getirir veya value yazar. `src/mcp/tools/config.ts:12` | Bare `config`, `config get`, `config set`; CLI'da `config read` olmadığı için naming farklı. |
| `deckent_review` | RO | `auto?:boolean=false` | Run result'larını evaluate eder ve settlement verdict döndürür. `src/mcp/tools/review.ts:69` | `review`; yakın parity. |
| `deckent_run` | RW | `description*:string`, `model?:string`, `provider?:string`, `modelEffort?:string`, `scope?:string`, `timeoutMs?:number`, `keep?:boolean`, `autoApprove?:boolean=true` | Provider-resolved tek `ExecutionRequest` oluşturur, task state yazar ve worker spawn eder. `src/mcp/tools/run.ts:29-130` | `run`; MCP `autoApprove=true`, CLI default false. |
| `deckent_kill` | RW | `taskId?:string`, `all?:boolean=false`, `force?:boolean`, `userExplicit?:boolean` | Explicit-intent field'larıyla bir veya tüm worker'ları kill eder. `src/mcp/tools/kill.ts:78` | `kill`; yakın parity. |
| `deckent_cleanup` | RW | `decay?:boolean=false`, `dryRun?:boolean=false` | Task artifact'larını archive eder ve lock'ları bırakır. `src/mcp/tools/cleanup.ts:56` | `cleanup`; CLI exact `--sprint` içerir, MCP içermez. |
| `deckent_help` | RO | `{}` | Runtime capability, project state ve next-step recommendation döndürür. `src/mcp/tools/help.ts:171` | `help-info` / `info`; ilişkili fakat output aynı değil. |
| `deckent_agent_list` | RO | `{}` | Built-in ve project agent'larını listeler. `src/mcp/tools/agent-list.ts:70` | `agent list`; counterpart. |
| `deckent_skill_list` | RO | `{}` | Skill ve sandbox/manifest bilgisini listeler. `src/mcp/tools/skill-list.ts:56` | `skill list`; counterpart. |
| `deckent_checkpoint` | RW | `action*:list\|approve\|reject`, `sprintId?:string`, `phase?:string`, `root?:string` | Checkpoint gate'leri listeler veya karara bağlar. `src/mcp/tools/checkpoint.ts:79` | `checkpoint list\|approve\|reject`; compact action wrapper. |
| `deckent_docs` | RW | `action*:add\|remove\|list\|update\|run\|track-scan\|track-status`, `file?:string`, `autoSections?:string[]`, `protectedSections?:string[]`, `addAutoSections?:string[]`, `removeAutoSections?:string[]`, `addProtectedSections?:string[]`, `skills?:string[]`, `maxLines?:number`, `root?:string` | Managed-doc rule/run ve iki tracking view yönetir. `src/mcp/tools/docs.ts:13-44` | `docs …`; MCP, CLI `docs track sync` action'ını içermez. |
| `deckent_explain` | RO | `sprintId?:string`, `verbose?:boolean=false`, `json?:boolean=false` | Run history/result açıklar. `src/mcp/tools/explain.ts:48` | `explain`; yakın parity. |
| `deckent_memory_query` | RO | `query*:string`, `type?:string[]`, `status?:string[]`, `limit?:number=5`, `sprint_min?:number`, `mode?:and\|or=or`, `root?:string` | Memory entry'lerini filter'larla sorgular. `src/mcp/tools/memory-query.ts:11` | `recall`; MCP daha zengin structured filter sunar. |
| `deckent_watch` | RO | `sprintId?:string`, `channels?:(PHASE\|TASK_ASSIGN\|HEARTBEAT\|RESULT\|ALERT\|NOTIFY\|METRIC)[]`, `tail?:number=20` | MCP logging üzerinden live event backfill ve subscription sağlar. `src/mcp/tools/watch.ts:24` | `watch`; transport behavior farklı. |
| `deckent_nervous_subscribe` | RO | `sprintId?:string`, `root?:string` | Nervous notification'larına subscribe olur. `src/mcp/tools/nervous.ts:386` | Exact CLI subscription yok; `nervous` dashboard/action odaklı. |
| `deckent_nervous_accept` | RW | `id*:string`, `root?:string` | Pending suggestion kabul eder. `src/mcp/tools/nervous.ts:431` | `nervous accept`; counterpart. |
| `deckent_nervous_reject` | RW | `id*:string`, `reason?:string`, `root?:string` | Pending suggestion reject eder. `src/mcp/tools/nervous.ts:499` | `nervous reject`; counterpart. |
| `deckent_nervous_status` | RO | `root?:string` | Pending/recent/config dashboard data döndürür. `src/mcp/tools/nervous.ts:531` | Bare `nervous`; yakın parity. |
| `deckent_nervous_config` | RW | `action*:read\|set_preset\|set_override\|list_actions\|reset`, `preset?:strict\|balanced\|autopilot\|full-auto`, `overrides?:record`, `root?:string` | Nervous authority setting'lerini okur veya değiştirir. `src/mcp/tools/nervous.ts:585` | `config nervous …`; action name/shape farklı. |
| `deckent_feature_query` | RO | `category?:string`, `id?:string` | Manifest entry'lerini sorgular. `src/mcp/tools/feature-query.ts:44` | `features` alias `feature-query`; parity linter yanlış biçimde MCP-only sınıflandırır. |
| `deckent_truth` | RO | `check?:boolean` | Manifest truth block'larını code/wiring/enablement/proof üzerinden çözer. `src/mcp/tools/truth.ts:76` | `truth`; counterpart. |
| `deckent_audit` | RO | `sprintId?:string`, `action?:gate\|query\|compliance\|retention=gate`, `channel?:string`, `tenant?:string`, `limit?:number`, `keepDays?:number`, `keepCount?:number`, `apply?:boolean=false` | Gate, query, compliance report veya retention uygular. `retention + apply=true` event'leri kalıcı prune eder. `src/mcp/tools/audit.ts:27-114` | `audit`; CLI `forward` yok. Catalog RO annotation mutating gate/retention behavior ile çelişir. |
| `deckent_recover` | RW | `sprintId*:string`, `dryRun?:boolean=true`, `skipAudit?:boolean=false`, `approval?:object` | Canonical crash/stuck-run recovery planlar veya uygular. `src/mcp/tools/recover.ts:11` | `recover`; MCP default dry-run, CLI default farklı. |
| `deckent_models` | RO | `action*:list\|refresh\|tier`, `provider?:string`, `model?:string`, `offline?:boolean` | Catalog okur, cache/network data force-refresh eder veya model tier bulur. `src/mcp/tools/models.ts:21-79` | `models list\|refresh\|tier`; RO annotation refresh side effect içerir. |
| `deckent_autonomous` | RW | `action*:status\|start\|stop\|backlog_add\|backlog_list\|backlog_remove\|pending\|approve\|reject`, `root?:string`, `id?:string`, `title?:string`, `kind?:task\|sprint\|capability=task`, `description?:string=''`, `policy?:auto\|approval-required\|risk-tagged=auto`, `cron?:string`, `capability?:string`, `capabilityArgs?:string`, `connector?:string`, `triggerId?:string`, `reason?:string` | Combined autonomous control/backlog/decision surface. `src/mcp/tools/autonomous.ts:104` | `autonomous …`; CLI ayrıca `enable`, `plan`, `cleanup` içerir. |
| `deckent_process` | RW | `action*:submit\|status\|result`, `root?:string`, `description?:string`, `kind?:task\|sprint\|capability`, `capability?:string`, `capabilityArgs?:string`, `connector?:string`, `scopeDir?:string`, `provider?:string`, `model?:string`, `tenant?:string`, `actorId?:string`, `executionId?:string` | Policy-gated process work submit/poll/result işlemleri. `src/mcp/tools/process.ts:29` | `process submit\|status\|result`; intended counterpart. |
| `deckent_usage` | RO | `sprint?:string`, `since?:string`, `until?:string`, `lineage?:object` | Provider transcript usage ve run breakdown aggregate eder. `src/mcp/tools/usage.ts:169` | `usage`; structured input farklı. |
| `deckent_xverify` | RW | `claim*:string`, `author*:claude\|codex\|gemini\|ollama\|openrouter`, `verifier?:same-provider-enum`, `verifierModel?:string`, `diff?:boolean`, `files?:string`, `timeoutMs?:number` | Different-provider verification enforce eder ve host disposition döndürür. `src/mcp/tools/xverify.ts:34` | `xverify`; yakın parity. |
| `deckent_kpi` | RO | `sprint?:string`, `tenantId?:string`, `trend?:string`, `n?:number` | KPI scorecard/trend data döndürür. `src/mcp/tools/kpi.ts:109` | `kpi`; yakın parity. |
| `deckent_cost` | RO | `sprint?:string`, `tenantId?:string` | Budget, pricing ve observed spend döndürür. `src/mcp/tools/cost.ts:119` | `cost show`; CLI ayrıca pricing/budget mutate eder. |
| `deckent_agent_manage` | RW | `action*:add\|remove\|promote`, `id*:string`, `name?:string`, `description?:string`, `model?:string`, `triggers?:string[]`, `prompt?:string`, `root?:string` | Agent ekler/kaldırır/promote eder. `src/mcp/tools/catalog-parity.ts:48` | Partial `agent` parity; CLI on child command ve farklı verb'ler içerir. |
| `deckent_skill_manage` | RW | `action*:add\|remove\|marketplace-list`, `id?:string`, `name?:string`, `description?:string`, `category?:language\|framework\|tool\|domain\|workflow`, `triggers?:string[]`, `query?:string`, `limit?:number`, `root?:string` | Skill ekler/kaldırır veya marketplace match listeler. `src/mcp/tools/catalog-parity.ts:146` | Partial `skill` parity; CLI on child command içerir. |
| `deckent_memory_manage` | RW | `action*:insert\|update\|decay-trigger`, entry field'ları (`id`, `type`, `title`, `content`, `summary`, `tags`, `status`, `priority`, `sprint_id`, `sprint_num`, `lang`, `decay_exempt`, `metadata`), `changed_by?:string`, `current_sprint_num?:number`, `decay_after_sprints?:number`, `root?:string` | Memory insert/update eder veya decay tetikler. `src/mcp/tools/catalog-parity.ts:227` | Partial `remember`/`memory`; birebir CLI action set yok. |
| `deckent_autonomous_backlog` | RW | `action*:list\|add\|remove`, `root?:string`, `id?:string`, `title?:string`, `kind?:task\|sprint\|capability=task`, `description?:string=''`, `policy?:auto\|approval-required\|risk-tagged=auto`, `cron?:string` | Dedicated backlog list/add/remove sağlar. `src/mcp/tools/autonomous-surface.ts:63` | `autonomous backlog …`; counterpart, combined tool ile duplicate. |
| `deckent_autonomous_status` | RO | `root?:string` | Autonomous snapshot döndürür. `src/mcp/tools/autonomous-surface.ts:164` | `autonomous status`; counterpart, combined tool ile duplicate. |
| `deckent_nervous_edit` | RO | `id*:string`, `modifiedPayload*:record`, `root?:string` | Exec-free edit-and-accept plan üretir. `src/mcp/tools/nervous-edit.ts:183` | `nervous edit` action uygular; MCP bilerek yalnız planladığı için behavior parity değildir. |
| `deckent_nervous_undo` | RO | `id?:string`, `root?:string` | Undo plan veya honest unsupported result üretir. `src/mcp/tools/nervous-edit.ts:215` | `nervous undo` undo uygular/ister; MCP plan-only. |
| `deckent_autonomous_approve` | RW | `id?:string`, `triggerId?:string`, `reason?:string`, `root?:string` | Approval-required backlog/trigger entry approve eder. `src/mcp/tools/autonomous-approval.ts:56` | `autonomous approve`; combined tool'un dedicated duplicate'i. |
| `deckent_autonomous_reject` | RW | `id?:string`, `triggerId?:string`, `reason?:string`, `root?:string` | Approval-required backlog/trigger entry reject eder. `src/mcp/tools/autonomous-approval.ts:97` | `autonomous reject`; combined tool'un dedicated duplicate'i. |
| `deckent_execution_authority` | RW | `action?:mount-adopt=mount-adopt`, `apply?:boolean=false`, `operator?:string`, `justification?:string` | Execution identity değiştirmeden namespace-local mount adoption inceler veya uygular. `src/mcp/tools/execution-authority.ts:49` | `execution-authority mount-adopt`; compact counterpart. |

### Parity gate yorumu

`npm run lint:parity`, 75 CLI command registration ve 49 MCP tool taradı; committed baseline'daki 37 CLI-only ve bir MCP-only gap dışında **yeni** gap olmadığı için geçti. [Kanıt: gerçek command output, exit code 0, 2026-08-01; `scripts/cli-mcp-parity-baseline.json:3-44`]

Bu gate behavioral equivalence değil, baseline ratchet'tir. Scanner top-level `program.command(...)` registration'larını okur ve fuzzy prefix/name matching kullanır; Zod schema, default, implementation call, side effect, nested subcommand veya response karşılaştırmaz. [Kanıt: `scripts/lint-cli-mcp-parity.mjs:24-47,116-149,170-250`]

Baseline'daki tek MCP-only sonuç `deckent_feature_query`, CLI `features` command'ı `feature-query` alias'ını bildirdiği için scanner false positive'idir. Kabul edilmiş 37 CLI-only name ve yukarıdaki action/schema farkları gate green olsa da gerçek review işidir. [Kanıt: `scripts/cli-mcp-parity-baseline.json:3-44`; built Commander tree alias çıktısı, 2026-08-01]

### Managed reference freshness

Archived generated MCP reference 48 tool bildiriyor ve `deckent_execution_authority` içermiyor; güncel catalog/registration 49 tool içeriyor. Archived reference stale'dir. Reset generated içeriği immutable archive'a taşıdığı için live `docs/generated/` projection şu anda yoktur; elle değil pipeline ile geri üretilmelidir. [Kanıt: `docs/archive/docs-pre-reset-2026-08-03/reference/mcp-tools.md`; `src/mcp/tools/index.ts:68-125`; `npm run docs:ref:check` missing-reference çıktısı, 2026-08-01]

## Dogfood / repository gerçeği

| MCP property | Durum | Current evidence |
|---|---|---|
| Canonical catalog/registration | ✅ canlı | 49 catalog name ve 49 registered name exact eşleşir. |
| Tool schema/behavior documentation | ✅ source-verified | 49 tool'un tamamı registration ve implementation source'larından okundu. |
| CLI parity | ⚠️ kısmi | Ratchet 37 CLI-only ve bir stale MCP-only baseline row ile geçer; behavioral gap'ler sürer. |
| Safety annotation | ⚠️ kısmi | Audit ve model action'ları broad RO annotation'ın göstermediği side effect içerir. |
| Generated MCP reference | ⚠️ stale/missing | Archived output 48 der; live managed projection yoktur ve pipeline-owned'dır. |
| `connect --json` count | ⚠️ mismatch | Real output canonical 49 yerine 31 tool raporladı; MCP-18 olarak kaydedildi. |
