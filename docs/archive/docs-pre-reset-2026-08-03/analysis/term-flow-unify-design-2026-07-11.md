# TERM-FLOW-UNIFY Tasarımı — born-643: golden-flow vs fiili-native-tool-akışı birleşimi

> **Provenans:** gpt-5.6-sol × ultra-effort, manuel koşum (Alperen, 2026-07-11).
> Prompt = DIRECTIVES-411 Task 2 (TERM-FLOW-UNIFY). Rapor verbatim korunmuştur.
> Bu rapor MASTER-PLAN 511 (TERM-DEV-LOOP) + 541 (643) kararlarının doğrudan girdisidir.

## Özet

A akışı tamamen orphan değildir; runGoldenFlow için doğrulanan production invocation deckent do içindedir, fakat REPL'e bağlı değildir. (src/cli/commands/do.ts:170, src/cli/commands/do.ts:187)

B akışı gerçek default front-door'dur: native-agent default-on'dur, full CLI tool catalog modele advertise edilir ve modelin tool çağrıları AgentSession permission gate üzerinden gerçek CLI bridge'e ulaşır. (src/cli/repl/run.tsx:633, src/cli/repl/native-tool-registry.ts:488, src/agent/loop.ts:177)

Ancak B bugün host-owned bir flow değildir: tool sırasını model belirler; actual plan görülmeden generic tool approval verilir; plan ile start aynı immutable snapshot'a bağlı değildir; completion idle REPL'i uyandırmaz. (src/cli/repl/native-agent-bridge.ts:324, src/cli/commands/plan.ts:256, src/orchestra/sprint-controller.ts:1176, src/cli/repl/app.tsx:1096)

Net karar: B conversational front-door + typed RunProposal + host-owned durable RunFlowCoordinator + A'dan stage/cancel organ nakli.

## Kanıt-tabanlı analiz

### A akışı: golden-flow + deckent do

```
deckent do "<goal>" [--run]
  → buildPlanNlIntent
  → runGoldenFlow
  → buildPlanPreview(buildDirectives)
  → stdout preview
  → promptConfirm
  → DIRECTIVES geçici swap
  → node entry.js start, stdio:inherit
  → child close
  → exit-code evaluation
  → DIRECTIVES restore
```

buildPlanNlIntent gerçek NL decomposition değildir; tek task ve TODO files/scope/criteria üretir. (src/cli/commands/plan-nl.ts:38, src/cli/commands/plan-nl.ts:48)

Golden-flow intent→plan→approve→start→evaluate sırasını sabitler ve reject/abort durumunda start/evaluate'ı çağırmaz. (src/orchestra/golden-flow.ts:153, src/orchestra/golden-flow.ts:176, src/orchestra/golden-flow.ts:191)

Plan-preview actual Brain planı değildir; DirectiveBuildIntent üzerinden üretilmiş markdown ve task alanlarıdır. Gerçek start daha sonra fresh runPlanPhase çalıştırır. (src/orchestra/golden-flow.ts:99, src/orchestra/sprint-controller.ts:1176, src/orchestra/sprint-phases.ts:860)

Onaylanan markdown child boyunca DIRECTIVES.md üzerine swap edilir ve sonunda eski içerik koşulsuz restore edilir; CAS/revision kontrolü yoktur. (src/cli/commands/do.ts:96, src/cli/commands/do.ts:155)

Start synchronous stdio:'inherit' çalışır ve child kapanıncaya kadar bekler; evaluate yalnız exit code'a bakar. (src/cli/commands/do.ts:119, src/cli/commands/do.ts:163)

### B akışı: native-agent + CLI bridge

```
bare deckent / Ink REPL
  → user NL
  → AgentSession + tool schemas
  → model: deckent_set_directives
  → generic permission
  → CLI set-directives --content
  → model: deckent_plan
  → generic permission
  → CLI plan
  → model: deckent_start
  → always-confirm
  → detached CLI start
  → status/footer
  → jobs/*.json watcher
  → ChatTurnQueue
  → post-turn bg row
```

System prompt proje DECKENT.md bilgisini yükler; bu dosya set-directives→plan→start→status sırasını anlatır. Bu bir model yönlendirmesidir, host state-machine enforcement değildir. (src/agent/identity.ts:47, DECKENT.md:72, src/agent/loop.ts:177)

Native registry deckent_set_directives, deckent_plan, deckent_start ve deckent_status tool'larını gerçekten advertise eder; start/run always-confirm, set/plan confirm-tier'dır. (src/cli/repl/cli-bridge-tool-specs.ts:37, src/cli/repl/cli-bridge-tool-specs.ts:88, src/cli/repl/cli-bridge-tool-specs.ts:128, src/cli/repl/tool-permissions.ts:28)

deckent_set_directives, LLM string'ini set-directives --content olarak yazar; directives-builder canonical validation'ı bu yolda kullanılmaz. (src/cli/commands/chat-tool-bridge.ts:245, src/cli/commands/set-directives.ts:44, src/orchestra/directives-builder.ts:112)

deckent_plan bridge'i yalnız ['plan'] çalıştırır. Child stdin'i ignore iken CLI actual planı ürettikten sonra kendi promptConfirm('Approve this plan?') çağrısını yapar; bu inner prompt'un canlı sonucu source okumayla doğrulanamadı. (src/cli/commands/chat-tool-bridge.ts:61, src/cli/commands/chat-tool-bridge.ts:129, src/cli/commands/plan.ts:256)

Outer permission gerçek plan üretilmeden önce yalnız tool adı/resource üzerinden verilir; structured plan-preview card yoktur. (src/agent/loop.ts:189, src/agent/loop.ts:201, src/cli/commands/plan.ts:190)

deckent_start detached process group ve log fd ile hemen pid/logPath döndürür. (src/cli/commands/chat-tool-bridge.ts:254, src/cli/helpers/detached-start.ts:95)

Plan ve start snapshot-bound değildir: plan ayrı child'da planlar; detached start fresh lifecycle'da yeniden runPlanPhase çağırır. (src/cli/commands/start.ts:540, src/orchestra/sprint-controller.ts:1176, src/orchestra/sprint-phases.ts:875)

Completion watcher jobs/*.json terminal transitions'ı fs.watch + always-on poll ile izler, fakat rich evaluation verisini yalnız count/error özetine indirger. (src/cli/repl/run-completion-watch.ts:117, src/cli/repl/run-completion-watch.ts:190, src/orchestra/sprint-finalizer.ts:1690)

App bg queue'yu yalnız user turn sonunda drain eder; idle completion callback'inin input loop'u uyandırdığı doğrulanamadı. (src/cli/repl/app.tsx:1021, src/cli/repl/app.tsx:1064, src/cli/repl/app.tsx:1096)

Native engine'in model-side background continuation seam'i vardır, fakat production createNativeEngine çağrısı bgQueue/bgTurnsEnabled geçmez; bugün doğrulanan çıktı UI role:'bg' satırıdır. (src/cli/repl/native-agent-bridge.ts:367, src/cli/repl/run.tsx:718, src/cli/repl/app.tsx:859)

start.ts pre-finalizer error'unda yalnız error/exitCode yazar; FAILED job record burada üretilmez. Bu hata sınıfının completion watcher'a yeni-turn olarak ulaştığı doğrulanamadı. (src/cli/commands/start.ts:589, src/orchestra/sprint-finalizer.ts:1661)

checkActionAllowed için production action-gate caller doğrulanamadı; native flow generic AgentSession permission engine'ine dayanır. (src/cli/repl/term-mode.ts:123, src/cli/repl/native-agent-bridge.ts:332)

### Uçtan-uca karşılaştırma

| Halka | A | B |
|---|---|---|
| NL | Tek-task TODO scaffold. (plan-nl.ts:38) | Gerçek LLM tool-use. (agent/loop.ts:177) |
| DIRECTIVES | Builder validation kullanır. (golden-flow.ts:106) | Raw model string'i doğrudan yazar. (set-directives.ts:68) |
| Preview | Typed, fakat Brain planı değil. (golden-flow.ts:53) | Actual Brain planı text olarak oluşur; card yok. (plan.ts:180) |
| Approval | Preview sonrasında explicit. (do.ts:150) | Preview öncesi generic tool permission + doğrulanamamış inner prompt. (agent/loop.ts:201, plan.ts:261) |
| Preview→execution | DIRECTIVES markdown swap ile sabitlenir; actual routing plan yeniden üretilir. (do.ts:155, sprint-controller.ts:1176) | Plan/start ayrı process ve fresh PLAN; digest yok. (start.ts:544) |
| Run | Synchronous. (do.ts:120) | Detached. (detached-start.ts:95) |
| Monitoring | Production event/footer sink doğrulanamadı. (do.ts:164) | Status tool + flag-gated footer. (cli-bridge-tool-specs.ts:39, app.tsx:1011) |
| Result turn | Child-close/exit code. (do.ts:163) | Job watcher/count row; idle wake eksik. (run-completion-watch.ts:190, app.tsx:1096) |

### DESK-2 blueprint tutarlılığı

Blueprint Console'u text-delta, tool-card, transcript-içi approval-card ve usage footer'dan oluşan typed block dizisi olarak tanımlar; native AgentEvent vocabulary bu ayrım için A'nın CLI wrapper'ından daha uygun temeldir. (.analysis/desk2-blueprint-2026-07-10.md:13, src/agent/events.ts:1)

Blueprint Desktop'ı üçüncü karar yüzeyi, dashboard'u yalnız izleme yüzeyi yapar; plan/start approval'ı Ink-local generic confirm'de bırakılamaz, ApprovalBroker üzerinden terminal/Desktop/API'ye açılmalıdır. (.analysis/desk2-blueprint-2026-07-10.md:6, src/core/approval-broker.ts:7)

Blueprint GAP-1/GAP-2/GAP-11 typed chat stream, approval-decision wire ve capability approval bridge ister; yeni flow bunları terminal-only mekanizma yerine daemon application-service/event contract'ı olarak sağlamalıdır. (.analysis/desk2-blueprint-2026-07-10.md:17)

Blueprint code-dışı ERP/messaging/web işlerini aynı Run yüzeyinde ister; DirectiveBuildIntent code-repo files/scope eksenine bağlıyken canonical work model domain/capability/correlation alanlarını taşır. (.analysis/desk2-blueprint-2026-07-10.md:35, src/orchestra/directives-builder.ts:24, src/core/work-model.ts:127)

Sonuç: RunProposal domain-general work model üzerinde kurulmalı; DIRECTIVES yalnız code-repo adapter'ı olmalıdır.

## Seçenekler (+ trade-off)

### 1. B resmileşir, individual tool sırası korunur

Host mevcut set/plan/start çağrılarına validation, plan card ve richer completion ekler.

- 511 ölçütü: Bir gerçek işte kullanıcı CLI yazmadan sağlanabilir; fakat model doğru tool sırasını seçmezse contract-level garanti yoktur. (src/agent/loop.ts:177)
- Artı: en az migration.
- Eksi: ordering, idempotency ve preview→execution binding individual tool'lara dağılır; fresh replan sürer. (src/orchestra/sprint-controller.ts:1176)
- Karar: yeterli değil.

### 2. A doğrudan REPL'e bağlanır

REPL her execution-intent NL mesajını golden-flow üzerinden yürütür.

- 511 ölçütü: Gerçek deriveIntent, detached start ve result-turn seam'leri tamamlanırsa sağlanır.
- Artı: strict stage order hazırdır. (src/orchestra/golden-flow.ts:153)
- Eksi: sohbet ile execution intent ayrımını input katmanına taşır ve AgentSession yanında ikinci execution engine yaratır; placeholder/sync/exit-code organlarının tamamı değiştirilmelidir. (src/cli/commands/plan-nl.ts:38, src/cli/commands/do.ts:120)
- Karar: önerilmez.

### 3. Hibrit: B front-door + host-owned RunProposal

Model conversation/discovery yapar; work başlatmak için yalnız typed proposal üretir. Bundan sonraki actual plan→digest→approval→exact snapshot→detached run→completion sırası coordinator'a aittir.

- 511 ölçütü: Deterministik olarak sağlanır; kullanıcı yalnız NL mesajı yazar, CLI komutu yazmaz.
- Artı: native UX ve golden-flow stage invariants korunur.
- Eksi: yeni typed contract, durable store ve surface adapters gerekir.
- Karar: önerilen seçenek.

### 4. Tam event-sourced workflow service

Flow append-only event log ve replayable reducer olarak daemon katmanına taşınır.

- 511 ölçütü: Tek NL→proposal ile sağlanır; REPL restart sonrasında da akış devam eder.
- Artı: Desktop, gateway, multi-project ve enterprise audit için en sağlam temel.
- Eksi: schema versioning, sequence, compaction, replay gap ve backpressure disiplini gerekir; mevcut Approval event stream bu gereksinimin küçük ölçekli örneğidir. (src/core/approval-eventstream.ts:16)
- Karar: hibrit coordinator'ın persistence standardı olarak kullanılmalı.

## Net Öneri

```
User NL
  → AgentSession
  → typed RunProposal
  → RunFlowCoordinator
  → actual PlanPreview + planDigest
  → ApprovalBroker(flowId, revision, digest)
  → ApprovedPlanSnapshot
  → detached RunHandle(flowId, jobId, logRef)
  → correlated live events
  → Completion | Failure
  → idle ise hemen, active-turn ise turn-sonunda yeni-turn
```

Önerilen state seti:

```
COLLECTING
→ PROPOSAL_READY
→ PREVIEWING
→ AWAITING_APPROVAL
→ APPROVED
→ STARTING
→ DETACHED_RUNNING
→ COMPLETED | FAILED | CANCELLED | BLOCKED
```

Plan approval; proposal revision, actual task snapshot, policy/gate/cost sonucu ve planDigest üzerine verilmelidir. Start digest'i CAS ile doğrulamalı ve fresh runPlanPhase yerine approved snapshot'ı tüketmelidir.

TERM-MODE gerçek gate olmalıdır: proposal/preview Oku, snapshot commit Değiştir, start Çalıştır; Ask mode preview gösterebilir fakat commit/start yapamaz. Risk ladder bunu zaten temsil eder. (src/cli/repl/term-mode.ts:24, src/cli/repl/term-mode.ts:123)

### Ölecek / compatibility-only parçalar

| Parça | Karar |
|---|---|
| buildPlanNlIntent | Runtime canonical kaynağı olarak ölür; plan-nl compatibility preview adapter'ı olabilir. (plan-nl.ts:38) |
| defaultSpawnStart | Synchronous stdio:inherit yolu ölür. (do.ts:119) |
| swapDirectives/restoreDirectives | Global file swap ölür; revisioned snapshot gelir. (do.ts:96) |
| Exit-code-only evaluate | Rich finalizer result'ıyla değiştirilir. (do.ts:163, sprint-finalizer.ts:1690) |
| Model-owned raw set→plan→start | Expert low-level escape hatch kalır; canonical NL akışı olmaz. (agent/loop.ts:177) |
| Native flow'daki self-spawn deckent plan | Standalone CLI'da kalır; canonical native-flow'dan çıkar. (chat-tool-bridge.ts:129) |

### Organ nakli olacak parçalar

| Organ | Yeni rol |
|---|---|
| Golden-flow stage/cancel | RunFlowReducer transition invariants. (golden-flow.ts:153) |
| directives-builder | code-repo proposal adapter'ı. (directives-builder.ts:53) |
| Native AgentSession/registry | Conversation, clarification ve typed proposal front-door'u. (native-agent-bridge.ts:268) |
| Approval/Agent events | Terminal/Desktop/API typed cards. (agent/events.ts:1) |
| Detached spawn | Platform adapter arkasında kalır; pid yerine durable job correlation eklenir. (detached-start.ts:87) |
| Completion watch | Correlated run-event subscriber'a dönüşür; fs.watch+poll dayanıklılığı korunur. (run-completion-watch.ts:190) |
| ChatTurnQueue | Active-turn buffer + idle event pump. (chat-turn-queue.ts:51) |

## Uygulama-planı (7 sprint)

| Sprint | Dosyalar ve teslim | Geri dönüş |
|---|---|---|
| 1 — Contract/reducer | Yeni run-flow-contract.ts, run-flow-reducer.ts, run-flow-reducer.test.ts; flowId, tenant/project/actor/origin, revision, proposal, preview, approved snapshot, handle ve versioned event. | terminal.run_flow_v2=false; production caller yok. |
| 2 — Shared actual preview | Yeni run-proposal-compiler.ts, plan-preview-service.ts, approved-plan-snapshot.ts; directives-builder.ts, mcp/tools/plan.ts, commands/plan.ts. | CLI/MCP adapters eski implementation'a döner; start henüz bağlı değildir. |
| 3 — Native proposal/card/approval | Yeni run-flow-controller.ts, plan-preview-card.tsx; native-tool-registry.ts, native-agent-bridge.ts, app.tsx, run.tsx, term-mode.ts. | V2 flag kapatılır, individual tools çalışır. |
| 4 — Exact-snapshot start | Yeni run-job-service.ts, run-flow-store.ts; mcp/tools/start.ts, commands/start.ts, sprint-controller.ts, detached-start.ts. | Snapshot-start flag kapatılır; legacy fresh-plan path korunur. |
| 5 — Correlated result turn | run-completion-watch.ts, chat-turn-queue.ts, native-agent-bridge.ts, app.tsx, run.tsx, run-state-feed.ts, sprint-finalizer.ts. | Yeni consumer kapatılır, eski count watcher sürer. |
| 6 — Canonical cutover/511 dogfood | soul.default.md, DECKENT.md, cli-bridge-tool-specs.ts, do.ts, plan-nl.ts, cli/index.ts, yeni term-flow-real-binary.test.ts. | Bir release window run_flow_v2=false; do compatibility adapter kalır. |
| 7 — DESK-2 consumer | Yeni api/run-flow-routes.ts, api/run-flow-event-stream.ts; api/server.ts, Desktop Console consumer ve API tests. | Desktop adapter kapatılır; terminal flow service etkilenmez. |

Composition pin; tek NL→typed proposal→builder validation→actual preview→digest-bound approval→exact snapshot→tek detached job→live state→rich result→idle new-turn zincirini aynı fixture'da kanıtlamalıdır. Final gate gerçek built binary ile bir gerçek born'u, kullanıcı CLI komutu elle yazmadan tamamlamalıdır; bu MASTER-PLAN 511 kabul ölçütüdür. (docs/MASTER-PLAN.md:45)

## Riskler

- Duplicate model/tool/approval event double-start üretebilir; flowId + planDigest atomic idempotency olmadan cutover yapılmamalıdır. (src/cli/helpers/detached-start.ts:95)
- Current A file-swap, current B fresh-replan nedeniyle preview/execution TOCTOU taşır. (src/cli/commands/do.ts:96, src/orchestra/sprint-controller.ts:1176)
- Plan approval, cost/scope override ve runtime worker approval aynı generic kartta birleşmemelidir; stable purpose, flow/digest ve gate detail gerekir. (src/core/approval-contract.ts:60)
- Raw DIRECTIVES expert tool canonical flow'a geri sızarsa parser-fragility geri gelir. (src/cli/commands/set-directives.ts:68, src/orchestra/directives-builder.ts:112)
- Detached spawn cevabı yalnız child'ın doğduğunu gösterir; PLAN/SPAWN'a ulaştığını göstermez. (src/cli/helpers/detached-start.ts:107)
- Watcher bütün project jobs'larını görür ve detached handle sprint/flow correlation taşımaz; multi-session/multi-tenant yanlış eşleşme mümkündür. (src/cli/repl/run-completion-watch.ts:190, src/cli/helpers/detached-start.ts:61)
- Idle wake çözülmeden 511 canlı turu "run bitti, terminal sustu" sonucunu verebilir. (src/cli/repl/app.tsx:1096)
- Desktop'a terminal-specific orchestration kopyalamak blueprint'in shared decision-surface hedefini bozar. (.analysis/desk2-blueprint-2026-07-10.md:13)
