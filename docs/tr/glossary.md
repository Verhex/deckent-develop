# Glossary

## Product-user perspektifi

Bu glossary Deckent term'lerini current code ve repository contract'larına göre tanımlar. Birbirinden farklı concept'leri bilinçli olarak ayırır; örneğin `Task`, `Attempt` değildir; dashboard state authority değildir; provider product identity değildir. [Kanıt: `.deckent/workspace/IDENTITY.md:3-18`; `src/core/task-result-schema.ts:238-291`]

| Term | Current tanım | Kanıt |
|---|---|---|
| ADR | DB-first memory'de ADR entry olarak saklanan Architecture Decision Record; Markdown decisions output generated'dır. | `src/core/memory-types.ts:110-155`; `src/core/memory-export.ts:478-506` |
| Admission | Exact invocation veya run'ın ilerlemesine izin veren policy/capability/authority decision. | `src/core/execution-admission.ts`; `src/core/provider-execution-ingress-authority.ts` |
| Agent | Task'ın gerektirdiği output kind için seçilen persona; provider/model'den orthogonal'dır. | `src/core/agent-pool.ts:200-240`; `src/core/agent-role-contract.ts:6-31` |
| Approval | Requester, scope, risk, tenant, expiry ve evidence üzerinde typed decision; generic yes/no prompt değildir. | `src/core/approval-contract.ts`; `src/core/approval-policy.ts:22-126` |
| Attempt | Identity, provider/model/backend, timing, disposition ve receipt taşıyan tek exact WorkItem execution'ı. | `src/core/invocation-receipt.ts:3-148`; `src/core/task-result-schema.ts:238-259` |
| Auditor | Source implementation authority almadan observe, verify, gate ve audit finding emit eden orchestration role. | `src/orchestra/authority-enforcer.ts:174-213`; `src/monitor/auditor.ts` |
| Autonomous | Autonomous command namespace'in expose ettiği authority-bounded continuous goal loop. | `src/cli/commands/autonomous.ts:1713`; `src/orchestra/autonomous-runtime.ts` |
| Backend | Host subprocess, Docker, tmux, API veya in-process gibi invocation execution mechanism. | `src/core/invocation-receipt.ts:21-29`; `src/orchestra/spawn-backend.ts` |
| Brain | Planning, assignment, evaluation coordination, lifecycle ve managed learning sahibi orchestration role; source-code worker değildir. | `src/orchestra/authority-enforcer.ts:127-171`; `src/orchestra/brain.ts` |
| Capability | Filesystem, database, ERP, network, approval veya MCP access gibi typed non-code operation. | `src/core/work-model.ts`; `src/core/capability-broker.ts:1-50` |
| Checkpoint | Interrupted work preview/resume için kullanılan durable lifecycle snapshot. | `src/orchestra/sprint-checkpoint.ts`; `src/cli/commands/checkpoint.ts`; `src/cli/commands/resume.ts` |
| Claim fence | Stale/duplicate worker'ın başka attempt'ın work'ünü settle etmesini önleyen attempt/ownership evidence. | `src/orchestra/autonomous/mission-store/mission-types.ts:260-280`; `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:2364-2650`; `src/core/task-settlement-authority.ts` |
| CLI parity | CLI command path ve MCP tool arasındaki ölçülen ilişki; benzer addan varsayılmaz. | `scripts/lint-cli-mcp-parity.mjs`; `docs/tr/mcp.md` |
| COMPLETE | Yalnız outcome-shaping gate ve receipt authority settle olduktan sonra publish edilmesi gereken terminal sprint/run status. | `src/core/sprint-types.ts:22-31`; `src/orchestra/sprint-controller.ts:2900-2938` |
| Config layer | Effective config input'larından biri: built-in default, global user config veya project config; merge/validation runtime view üretir. | `src/core/config.ts`; `docs/tr/configuration.md` |
| Connector | Telegram, Discord, WhatsApp veya gateway gibi messaging/integration adapter; ayrı orchestration authority değildir. | `.deckent/workspace/IDENTITY.md:8`; `src/connectors/` |
| Context | Execution'a visible data. Otomatik olarak write, approval, tenant veya provider authority vermez. | `src/core/work-model.ts`; `src/core/approval-contract.ts` |
| Cross-verify / XVerify | Live authority evidence'dan resolved, producer'dan farklı fresh provider ile verification. | `AGENTS.md:66-80`; `src/core/cross-verify-execution-contract.ts` |
| Dashboard | Read/observability projection; execution engine veya state authority değildir. | `.deckent/workspace/IDENTITY.md:8-9`; `src/dashboard/` |
| DECAY | Retrospective work sonrasında memory ve retention limit uygulayan lifecycle phase/policy. | `src/orchestra/sprint-phases.ts:3949-4168` |
| DIRECTIVES.md | Higher-priority authority sonrasında active-run structured execution contract. | `AGENTS.md:112-128`; `src/orchestra/task-builder.ts:1353` |
| Disk evidence | Worker claim kontrolü için host-computed, write-scope-limited tracked/untracked change. | `src/orchestra/disk-verify.ts:135-207` |
| Do / task mode | Full manual sprint workflow gerektirmeden bounded work kurabilen direct user task surface. | `src/cli/commands/do.ts`; `src/orchestra/task-mode-runner.ts` |
| Dogfood | Deckent'i Deckent'in Goal/Mission/Flow/Run/Autonomous/Do surface'leriyle implement etme; manual work typed recovery seam ile sınırlıdır. | `AGENTS.md:75-79` |
| Effective config | Layered config ve resolved policy/provider fact sonrasında validate edilmiş runtime result; tek config file'dan daha authoritative'dir. | `src/core/config.ts:1829-2230`; `docs/tr/reference/configuration-schema.md` |
| Evidence reference | Proof'u authority olarak reinterpret etmeden ona işaret eden durable identifier. | `src/core/invocation-receipt.ts`; `src/core/task-settlement-authority.ts` |
| FIX | Eligible NO_GO work için repair phase/attempt path. | `src/orchestra/sprint-controller.ts:2665-2859` |
| Flow | Proposal/preview/approval'dan run start ve terminal state'e governed progression. | `src/core/run-flow-contract.ts:23-121,313-380` |
| GO / NO_GO | Criteria'nın accepted/rejected olduğunu belirten evaluation verdict; tek başına process exit ile aynı değildir. | `src/core/task-types.ts`; `src/orchestra/result-evaluator.ts` |
| Goal | Deckent execution-authority chain'deki top-level desired outcome. | `.deckent/workspace/IDENTITY.md:7`; `src/orchestra/autonomous/mission-store/goal-mission.ts` |
| Heartbeat | Worker/run ownership'a bağlı, stale/orphan state için observed liveness signal. | `src/core/worker-heartbeat-authority.ts`; `src/monitor/auditor.ts` |
| HOLD | Authority, evidence, compatibility veya required decision bulunmadığı için typed stop; silent fallback değildir. | `AGENTS.md:89-99,124-128`; `docs/analysis/OPEN-QUESTIONS-2026-08.md` |
| Immutable Law | Üç constitutional constraint'ten biri: DUAL LENS + SCALE, EVERY ENVIRONMENT, NEVER MVP. | `AGENTS.md:12-38` |
| Invocation receipt | Kimin/neyin çağrıldığını, nasıl resolved olduğunu ve attempt'ın nasıl bittiğini gösteren versioned proof. | `src/core/invocation-receipt.ts:3-148` |
| Learning loop | Deckent product moat olarak tanımlanan outcome→evidence→routing→promotion→training-trace feedback. | `.deckent/workspace/IDENTITY.md:17` |
| MCP resource | MCP server'ın register ettiği read-oriented URI projection; şu anda sekiz tanedir. | `.deckent/workspace/IDENTITY.md:25-29`; `src/mcp/resources/index.ts` |
| MCP tool | Input schema, handler, annotation ve intended CLI relation taşıyan typed MCP action registration; canonical sayı 49'dur. | `src/mcp/tools/index.ts:54-177`; `docs/tr/mcp.md` |
| Memory V2 | `.brain/memory.db`, FTS/query, taxonomy, history ve generated export ile DB-first knowledge subsystem. | `src/core/memory-store.ts`; `src/core/memory-query.ts`; `src/core/memory-export.ts` |
| Mission | Identity chain'de Goal ile Flow arasındaki governed decomposition/context. | `.deckent/workspace/IDENTITY.md:7`; `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts` |
| Mode | Named configuration preset. Output style ve model effort'tan ayrıdır. | `src/core/config.ts:1613-1784`; `src/cli/commands/mode.ts` |
| Model | Config, registry, capability, reachability ve authority evidence üzerinden resolved provider-served reasoning/execution model. | `.deckent/workspace/IDENTITY.md:10`; `src/core/model-registry.ts` |
| Model effort | Task workload estimate'den ayrı kaydedilen provider/model reasoning-effort setting. | `src/core/task-result-schema.ts:238-259`; `src/core/config.ts` |
| Nervous | Proactive observer/detector/decision/proposal layer; action policy ve authority constrained kalır. | `src/nervous/`; `src/core/nervous-types.ts` |
| Operation | Authority chain'in en alt unit'i. Routing `OperationType` da vardır; canonical normalized Operation olup olmadığı OQ-05'tir. | `.deckent/workspace/IDENTITY.md:7`; `src/core/routing-types.ts:47-67`; OQ-05 |
| Outcome | Evaluation, history, learning, routing ve promotion'da kullanılan settled result; yalnız stdout değildir. | `.deckent/workspace/IDENTITY.md:17`; `src/core/task-result-schema.ts` |
| Precedence | System/owner'dan law, run rule, role procedure ve generated evidence'a uzanan ordered conflict rule. | `AGENTS.md:124-128` |
| Provider | Runtime adapter/backend; hiçbir provider Deckent product identity değildir. | `.deckent/workspace/IDENTITY.md:3,10`; `src/providers/` |
| Provider authority | Bir provider/model/account'ın role/purpose için policy ve budget altında çağrılabileceğine dair live evidence. | `src/core/provider-authority-composition.ts`; `src/core/provider-execution-ingress-authority.ts` |
| Receipt | Durable settlement/evidence record genel adı; invocation ve terminal receipt farklı scope taşır. | `src/core/invocation-receipt.ts`; `src/core/sprint-terminal-publication.ts` |
| REPL | Interactive terminal conversation/tool surface; stale help description'a rağmen local mode artık implemented'dır. | `src/cli/commands/chat.ts:277-471`; `docs/analysis/CODE-DOC-DIFF-2026-08.md` |
| RETRO | Execution sonrası outcome, metric, learning ve debt için lifecycle/read surface. | `src/orchestra/sprint-finalizer.ts`; `src/cli/commands/retro.ts` |
| Route | Policy ve evidence ile constrained provider/model/agent/skill/backend selection. | `src/core/routing/route-task-v3.ts`; `src/orchestra/routing-plan-adapter.ts`; `src/orchestra/task-router.ts` |
| Run | Governed execution instance; current code sprint terminology ve RunFlow state machine'i de korur. | `.deckent/workspace/IDENTITY.md:7`; `src/core/run-flow-contract.ts`; OQ-14 |
| Scope | Declared read/write authority ile containment/collision constraint; context visibility write permission değildir. | `src/core/task-types.ts`; `src/core/scope-gate.ts`; `src/core/tool-scope-gate.ts` |
| Settlement | Claim/evidence/gate'ten authoritative task veya run outcome'a transition. | `src/core/task-settlement-authority.ts`; `src/orchestra/sprint-finalizer.ts` |
| Skill | Agent persona ve provider'dan independently selected reusable instruction/capability package. | `src/core/skill-pool.ts`; `docs/tr/reference/skills.md` |
| Sprint | Run surface'in bazı kısımlarını taşıyan current eight-phase orchestration implementation ve compatibility vocabulary. | `src/core/sprint-types.ts`; `src/orchestra/sprint-controller.ts` |
| SSOT | Single source of truth. Burada `docs/MASTER-PLAN.md` work tracking SSOT; `.brain/memory.db` product memory/ADR authority'dir. | `AGENTS.md:112-114`; owner Tur-2 contract |
| Status projection | Runtime state'ten derived read model; canonical run/receipt authority'yi sessizce override etmemelidir. | `src/core/run-status-authority.ts`; `src/core/run-status-read-model.ts` |
| Task | Dependency, scope, criteria, routing metadata ve status taşıyan current sprint-engine unit. | `src/core/task-types.ts` |
| TaskDNA | Intent, domain, operation ve complexity signal'larının derived routing description'ı. | `src/core/routing-types.ts:58-126`; `src/core/routing/route-task-v3.ts` |
| Terminal | Web dashboard projection'dan farklı, primary tool-driven management/use surface. | `.deckent/workspace/IDENTITY.md:8-16`; `src/cli/commands/chat.ts`; `src/api/terminal/session-manager.ts` |
| Tenant | `.deckent/tenants/<tenantId>` altında rooted, validated isolation identity ve async context. | `src/core/tenant-context.ts:5-55,57-94` |
| Tier | Routing input'u provider-neutral capability/cost class; exact model selection config/registry-resolved kalır. | `src/core/routing-types.ts`; `AGENTS.md:109-111` |
| Training trace | Closed learning loop için execution'dan extracted durable evidence; production wiring named direction item'dır. | `.deckent/workspace/IDENTITY.md:17,30`; `src/orchestra/sprint-phases.ts:2536-2566`; `src/training/pipeline.ts` |
| Trinity | Tek kernel, policy, evidence ve learning system paylaşan Assistant · Worker · Platform. | `.deckent/workspace/IDENTITY.md:5` |
| WorkItem | Run altında ve Attempt üstünde normalized unit; current sprint consumer'larında adoption eksiktir. | `.deckent/workspace/IDENTITY.md:7`; `src/core/work-model.ts:1-12`; OQ-06 |
| Worker | Scope, claim, provider ve evidence contract altında exact assigned work yapan execution role. | `src/agents/worker.ts`; `src/orchestra/authority-enforcer.ts:215-247` |
| Worker pool | Effective admitted worker set; capacity config, DAG, collision, host/tenant policy ve provider capacity'den gelir. | `AGENTS.md:80-88`; `src/core/agent-pool.ts` |

## Dogfood / repository gerçeği

Pre-reset glossary current authority değil topic baseline olarak kullanıldı. Artık desteklenmeyen fixed heartbeat duration, single runtime dependency, tüm task file'ların automatic cleanup'ı, fixed ADR total, provider-specific identity ve settled CLEANUP/COMPLETE adı gibi claim'ler kopyalanmadı. [Kanıt: archived `glossary.md` ve `reference/glossary.md`; yukarıda cited current source'lar; OQ-04]

Durum: ✅ current term'ler source-backed; ⚠️ `Operation`, normalized `WorkItem` adoption, Run/Sprint naming ve phase-eight naming invented definition yerine explicit HOLD reference taşır.
