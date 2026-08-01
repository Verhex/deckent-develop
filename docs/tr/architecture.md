# Architecture

## Product-user perspektifi

### Authority chain

Deckent product authority aşağıdaki sıradadır. Üst seviye object'ler işin **neden** var olduğunu, alt seviyeler ise **nasıl yürüdüğünün** yeniden üretilebilir ve auditable olmasını açıklar. [Kanıt: `.deckent/workspace/IDENTITY.md:7`; `docs/MASTER-PLAN.md:25-31`]

| Seviye | Contract | Güncel code evidence |
|---|---|---|
| Goal | İstenen outcome ve acceptance boundary. | Durable mission `kind: 'goal'` taşıyabilir; goal planning autonomous mission modules içindedir. `src/orchestra/autonomous/mission-store/mission-types.ts:12-19,76-88` |
| Mission | Outcome, ownership, progress ve terminal result için durable container. | `Mission` ve `NewMission`. `src/orchestra/autonomous/mission-store/mission-types.ts:76-88` |
| Flow | Digest'e bağlı, revisioned proposal/approval/start state machine. | `RunFlowState`, `RunProposal`, `PlanPreview` ve `ApprovedPlanSnapshot`. `src/core/run-flow-contract.ts:37-69,73-149` |
| Run | Bir planın admitted lifecycle execution'ı. | Yerleşik runtime object hâlâ `Sprint` adını taşır; status, phase, tasks, workers, timestamps ve proof içerir. `src/core/sprint-types.ts:62-90` |
| WorkItem | Kind, policy, dependencies, claim ve result taşıyan durable schedulable unit. | `WorkItem` ve `NewWorkItem`. `src/orchestra/autonomous/mission-store/mission-types.ts:89-104` |
| Attempt | Bir WorkItem veya logical task için tek exact claim/execution denemesi. | Mission claim `attemptId` ve fence identity taşır; task lineage repair attempt'leri katlar. `src/orchestra/autonomous/mission-store/mission-types.ts:134-147`; `src/core/task-lineage.ts:218-254` |
| Operation | Bir Attempt altındaki en düşük auditable provider/tool/side-effect unit. | Kaynakta birden çok operation biçimli contract vardır; tek canonical execution-operation authority type yoktur. Bu durum tahminle doldurulmamış, `HOLD` olarak kaydedilmiştir. `src/core/routing-types.ts`; `src/core/invocation-receipt.ts`; `docs/analysis/OPEN-QUESTIONS-2026-08.md` |

Yukarıdaki zincir target semantic model'dir. Güncel implementation name ve ownership boundary'leri parçalıdır; adapter'lar eksik identity halkalarını uydurmamalıdır. [Kanıt: `src/core/work-model.ts:1-12`; `src/core/sprint-types.ts:62-90`; `src/orchestra/autonomous/mission-store/mission-types.ts:76-147`]

### Sekiz-phase lifecycle

Controller'ın executable path'i şöyledir:

`PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`

| Phase | Responsibility | Kaynak |
|---|---|---|
| PLAN | Plan'ı materialize ve gate eder; istenirse exact plan authority kurar. | `src/orchestra/sprint-controller.ts:1889-2131` |
| SPAWN | Route'ları admit eder ve eligible worker'ları başlatır. | `src/orchestra/sprint-controller.ts:2132-2202` |
| EXECUTE | Worker execution ve result evidence toplar. | `src/orchestra/sprint-controller.ts:2203-2488`; `src/orchestra/result-collector.ts` |
| EVALUATE | Result'ları Brain/evidence contract'larıyla değerlendirir. | `src/orchestra/sprint-controller.ts:2489-2666` |
| FIX | Failed work için bounded repair attempt üretir ve yürütür. | `src/orchestra/sprint-controller.ts:2667-2861`; `src/core/task-lineage.ts:218-330` |
| RETRO | Retrospective ve settlement evidence üretir. | `src/orchestra/sprint-controller.ts:2862-2911`; `src/orchestra/sprint-phases.ts:3949-4155` |
| DECAY | Terminalization path içinde memory/debt decay uygular. | `src/orchestra/sprint-phases.ts:3949-4169` |
| CLEANUP | Runtime artifact'ları yalnız published terminal receipt sonrasında temizler. | `src/orchestra/sprint-controller.ts:2912-2934`; `src/orchestra/sprint-phases.ts:4170-4207` |

`SprintPhase`; `DIRECTIVE`, `TRANSITION` ve terminal `COMPLETE` değerlerini de içerir, fakat `CLEANUP` member içermez. Ayrıca `runSprint` doc comment'i sekizinci phase olarak `COMPLETE` der ve cleanup'ı ayrı gösterirken executable path cleanup'ı Phase 8 diye adlandırıp çalıştırır. Bu nedenle doküman executed controller path'i izler ve naming contradiction'ı çözüm için kaydeder. [Kanıt: `src/core/sprint-types.ts:9-20`; `src/orchestra/sprint-controller.ts:1594-1596,2912-2934`; `src/orchestra/sprint-phases.ts:4170-4207`]

### Source map

Bu harita eski dokümandan değil, güncel `src/` tree'den türetilmiştir. [Kanıt: command `find src -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort`, 2026-08-01]

| Directory | Responsibility ve load-bearing evidence |
|---|---|
| `agent/` | Native/host agent loop ve tool-use policy. `src/agent/loop.ts`, `src/agent/tools/registry.ts`, `src/agent/permission-policy.ts` |
| `agents/` | Worker execution, scope enforcement, heartbeat, logs ve agent evolution. `src/agents/worker.ts`, `src/agents/permission-guard.ts`, `src/agents/worker-lifecycle.ts` |
| `api/` | HTTP API, routes, SSE, middleware ve rate limiting. `src/api/server.ts`, `src/api/run-flow-routes.ts`, `src/api/middleware/token.ts` |
| `cli/` | Commander entry point, commands, output, i18n helpers ve interactive surface'ler. `src/cli/index.ts`, `src/cli/entry.ts`, `src/cli/helpers/messages.ts` |
| `connectors/` | Messaging adapter'ları, identity ve project-scoped gateway/session integration. `src/connectors/connector-bootstrap.ts`, `src/connectors/gateway/`, `src/connectors/identity/` |
| `core/` | Shared contract ve service'ler: config, work types, registry, routing, memory, approvals, receipts ve durable store'lar. `src/core/config.ts`, `src/core/work-model.ts`, `src/core/model-registry.ts`, `src/core/memory-store.ts` |
| `dashboard/` | React/Vite observability projection. `src/dashboard/src/` |
| `desktop/` | Native Desktop host ve runtime authority üzerindeki adapter'lar. `src/desktop/` |
| `extensions/` | Editor integration'ları; güncel olarak VS Code içerir. `src/extensions/vscode/` |
| `mcp/` | MCP stdio server, 49 tool registration ve resources. `src/mcp/server.ts`, `src/mcp/tools/index.ts`, `src/mcp/resources/` |
| `mcp-client/` | Client-side MCP transport/integration. `src/mcp-client/` |
| `monitor/` | Auditor scan'leri, sprint-state tracking ve dashboard projection management. `src/monitor/auditor.ts`, `src/monitor/sprint-state.ts` |
| `nervous/` | Proactive detection, recommendation ve governed action proposal. `src/nervous/bootstrap.ts`, `src/nervous/detector-registry.ts`, `src/nervous/detectors/` |
| `orchestra/` | Planning, lifecycle control, routing, evaluation, repair, retrospective ve autonomous mission execution. `src/orchestra/sprint-controller.ts`, `src/orchestra/planner.ts`, `src/orchestra/result-evaluator.ts` |
| `providers/` | Provider-neutral runtime contract'ları ve provider adapter'ları. `src/providers/provider.ts`, `src/providers/claude.ts`, `src/providers/codex.ts`, `src/providers/gemini.ts` |
| `sdk/` | Programmatic SDK surface. `src/sdk/` |
| `training/` | Training-trace capture ve projection. `src/training/` |

`src/index.ts`, package-level export surface'tir. [Kanıt: `src/index.ts`]

### Cross-cutting authority kuralları

- Surface'ler adapter'dır; behavior'ı yeniden yazmak yerine shared application-service behavior üzerinde birleşmelidir. [Kanıt: `.deckent/workspace/IDENTITY.md:8`; archived ADR authority `docs/archive/docs-pre-reset-2026-08-03/adr/adr-g-011-surface-parity-thin-wrapper.md`]
- Config, provider/model/worker admission'dan önce resolve edilir. [Kanıt: `.deckent/workspace/IDENTITY.md:10`; `src/core/config.ts:1864-2021`]
- Durable state; memory, mission, identity, invocation receipt, provider observation ve run-flow store'ları arasında responsibility'ye göre ayrılır. [Kanıt: gerçek read-only `PRAGMA table_info` inventory, 2026-08-01; `docs/tr/db.md`]
- Dashboard state bir projection'dır; execution authority olamaz. [Kanıt: `.deckent/workspace/IDENTITY.md:9`]

## Dogfood / repository gerçeği

| Architecture boundary | Durum | Current constraint |
|---|---|---|
| Source ownership map | ✅ canlı | Current top-level source directory ve load-bearing module'ler diskten inventory edildi. |
| Sprint lifecycle implementation | ✅ canlı | Controller PLAN'dan terminal cleanup/publication'a wiring yapar. |
| Phase vocabulary | ⚠️ HOLD | Enum ile executed/comment vocabulary çelişir (OQ-04). |
| Goal→Operation normalization | ⚠️ kısmi | Mission, RunFlow, Sprint/Task ve receipt contract'ları vardır fakat tek canonical graph tam adopt edilmemiştir (OQ-05/OQ-06). |
| Surface thin wrapper'ları | ⚠️ kısmi | CLI/MCP behavioral gap'leri fark raporunda doğrulanmıştır. [Kanıt: `docs/analysis/CODE-DOC-DIFF-2026-08.md`] |
| Dashboard authority | ✅ bounded | Identity onu açıkça observability projection ile sınırlar. |
