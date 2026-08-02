# Lifecycle internals

## Product-user perspektifi

Deckent bir intent'i iki ilişkili model üzerinden controlled execution'a dönüştürür. Product model `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`; sprint engine ise work planlama, dispatch, evaluation, repair ve settlement için bugünkü repository implementation'ıdır. Normalized work model mevcuttur fakat kendi header'ı consumer adoption'ın tamamlanmadığını açıkça söyler; bu nedenle bu doküman her sprint object'in şimdiden native `Run`/`WorkItem` projection'ı olduğunu iddia etmez. [Kanıt: `.deckent/workspace/IDENTITY.md:7`; `src/core/work-model.ts:1-12,140-186`; OQ-06]

### Execution öncesi

1. `plan`, `DIRECTIVES.md` veya explicit prompt okur, task'ları kurar, prompt/scope gate uygular ve `--dry-run` ile durabilir. [Kanıt: `src/cli/commands/plan.ts:121-205,253-254,367-461`]
2. `start`, config ve provider authority çözer, approved plan'ı adopt eder, doctor/scope/prompt gate'leri kontrol eder ve sprint controller'a delege eder. [Kanıt: `src/cli/commands/start.ts:246-403,518-778`]
3. Exact-plan run; preplanned sprint, materialization hook ve execution-admission hook gerektirir; partial exact-plan wiring reddedilir. [Kanıt: `src/orchestra/sprint-controller.ts:1594-1621`]

`deckent plan --help` ve `deckent start --help` built binary'de başarıyla çalıştırıldı. Bu documentation görevi sprint/run/autonomous command'larını açıkça yasakladığı için execution başlatılmadı. [Kanıt: recursive real-binary help audit, 2026-08-01; OQ-20]

### Archived lifecycle plan'larının yeniden doğrulanması

Archived `superpowers/` altındaki 38 sprint/recovery plan ve design spec, current operating authority değil dated implementation provenance'dır. MCP'den sprint başlatma, instruction text içinde provider seçimi, tmux-first execution veya manual workflow step varsayımları repository contract tarafından supersede edilmiştir: lifecycle execution CLI-led'dir; provider/backend/concurrency effective-config kararıdır; completion settlement ve disk evidence gerektirir. Bu nedenle aşağıdaki target lifecycle source-derived'dür ve current code, vocabulary veya certification eksik kaldığı yerde `⚠️ kısmi`dır; archived plan'ın “done” marker'ı live wiring kanıtı değildir. [Kanıt: read-only archive filename inventory, 2026-08-02; `AGENTS.md:42-69`; `src/cli/commands/start.ts:246-403,518-778`; `src/orchestra/sprint-controller.ts:1594-2951`]

### Sekiz implementation phase

| Phase | Product anlamı | Current implementation boundary |
|---|---|---|
| PLAN | Directive veya description'ı bounded task'lara dönüştürür. | Plan creation, prompt gate, scope gate, baseline capture, routing. [Kanıt: `src/orchestra/sprint-controller.ts:1889-2115`] |
| SPAWN | Resolved provider/backend authority altında attempt'ları admit eder ve worker'ları başlatır. | Initial worker spawning ve active execution transition. [Kanıt: `src/orchestra/sprint-controller.ts:2115-2205`; `src/orchestra/sprint-phases.ts:1164-1248`] |
| EXECUTE | Worker'ları gözler, result artifact toplar, capacity refill eder ve timeout'ları işler. | Controller result collection'a delege eder ve exact attempt state izler. [Kanıt: `src/orchestra/sprint-controller.ts:1057-1378,2203-2486`] |
| EVALUATE | Work'ü criteria/evidence ile karşılaştırır; GO/NO_GO üretir. | Evaluation idempotency-guarded'dır ve task state yazar. [Kanıt: `src/orchestra/sprint-phases.ts:1248-1728`] |
| FIX | Failed claim'i completion saymadan eligible repair attempt üretir. | FIX `SprintPhase.FIX` set eder, repair route eder ve incomplete authority'de pause olabilir. [Kanıt: `src/orchestra/sprint-controller.ts:2665-2859`; `src/orchestra/sprint-phases.ts:2723-3140`] |
| RETRO | Outcome ve durable learning'i aggregate eder. | `finalizeSprint` metrics, events, retrospective data ve managed projection üretir. [Kanıt: `src/orchestra/sprint-finalizer.ts:2185-2355`] |
| DECAY | Retention ve memory-budget policy uygular. | Standalone decay function mevcuttur ve finalization'ın da parçasıdır. [Kanıt: `src/orchestra/sprint-phases.ts:3949-4168`] |
| CLEANUP | Owned runtime artifact'ları yalnız terminal receipt publication sonrasında kaldırır veya retain eder. | `runCleanupPhase`, published terminal receipt sonrasında koşar; final COMPLETE öncesi publication claim edilir. [Kanıt: `src/orchestra/sprint-controller.ts:2900-2940`; `src/orchestra/sprint-phases.ts:4170-4207`] |

Public enum `CLEANUP` içermez; `DIRECTIVE`, `TRANSITION` ve `COMPLETE` içerir. Source comment'leri phase eight'i hem CLEANUP hem COMPLETE ile biten lifecycle olarak anlatır. Naming authority çözülmemiştir ve OQ-04'te izlenir. [Kanıt: `src/core/sprint-types.ts:9-20`; `src/orchestra/sprint-controller.ts:1594-1596,2912-2934`]

### Attempt, dependency ve capacity

Task ile attempt aynı şey değildir. Invocation receipt; role, purpose, selected/called provider ve model, transport/backend, attempt identity, timing, evidence state, disposition ve reason code taşır. [Kanıt: `src/core/invocation-receipt.ts:3-148`]

Dependency'ler scheduling'i kısıtlar. Dependency scheduler ve scheduler driver runnable work'ü hesaplar; scope-collision ve system-capacity policy safe parallelism'i sınırlar; configured concurrency admission'ın yalnız bir input'udur. [Kanıt: `src/orchestra/dependency-scheduler.ts`; `src/orchestra/scheduler-driver.ts`; `src/orchestra/scope-collision.ts`; `src/core/system-capacity.ts`]

`continuous_workers` default config'de enabled'dır fakat PAZARTESI continuous slot refill'i kapanmamış stabilization item olarak kaydeder. Configured capability ile certified end-to-end behavior'ı ayrı gerçekler olarak okuyun. [Kanıt: `src/core/config.ts:1640-1660`; `PAZARTESI.md:39-45`]

### Observation surface'leri

Active run gözlemi için `status`, `watch`, `tasks`; persisted outcome için `history`, `review`, `retro` kullanılır. `checkpoint`, `resume`, `recover`, `finalize` ve `cleanup` lifecycle state değiştirebilir; passive viewer değildir. [Kanıt: `src/cli/index.ts:119-175`; adı geçen tüm path'ler için real binary help, 2026-08-01]

## Dogfood / repository gerçeği

| Alan | Durum | Repository gerçeği |
|---|---|---|
| Controller ve phase module'leri | ✅ canlı | Production entry point'ler controller ve phase implementation'larını çağırır. [Kanıt: `src/cli/commands/start.ts:518-778`; `src/orchestra/sprint-controller.ts:1598-2951`] |
| Exact-plan admission | ✅ canlı | Eksik veya mismatched exact-plan hook'ları execution öncesi typed Brain error üretir. [Kanıt: `src/orchestra/sprint-controller.ts:1604-1621`] |
| Canonical phase vocabulary | ⚠️ kısmi | Enum ve source comment'leri çelişir; OQ-04 `HOLD` kalır. |
| Normalized Goal→Operation adoption | ⚠️ kısmi | Type'lar vardır fakat module consumer migration'ın eksik olduğunu söyler; OQ-05/OQ-06 `HOLD` kalır. |
| Continuous refill | ⚠️ kısmi | Config ve code surface vardır; live audit end-to-end davranışı kapanmamış sayar. [Kanıt: `PAZARTESI.md:39-45`] |
| Autonomous certification | ⚠️ kısmi | Kabul edilen audit 0/31 intervention-free end-to-end success ve tamamlanmamış yedi adımlı certification ladder kaydeder. [Kanıt: `PAZARTESI.md:36-58`] |

Operational acceptance, “process zero exit etti”den güçlüdür: terminal status, per-task result, gate, summary, receipt ve disk evidence birbiriyle uyuşmalıdır. [Kanıt: `AGENTS.md:42-55`; `PAZARTESI.md:54-60`]
