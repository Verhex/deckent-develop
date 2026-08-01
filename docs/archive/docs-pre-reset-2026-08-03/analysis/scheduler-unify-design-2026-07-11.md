# SCHEDULER-UNIFY Tasarımı — born-634/635: planDispatch reducer'ını canlı-driver yapma

> **Provenans:** gpt-5.6-sol × ultra-effort, manuel koşum (Alperen, 2026-07-11).
> Prompt = DIRECTIVES-411 Task 1 (SCHEDULER-UNIFY). Rapor verbatim korunmuştur; CC spot-check
> notları için `docs/analysis/sol-analysis-verification-2026-07-11.md` (varsa) ve MASTER-PLAN 634/635 satırına bakın.

## Özet

planDispatch mevcut haliyle doğrudan canlı driver yapılmamalıdır. Çıktısı yalnız toSpawn, toKill ve mode taşırken canlı yol collision edge, retry backoff,
blocked-event, checkpoint, metrics, persistence, provider/backend seçimi ve fix-task routing mirasını farklı yürütücülerde uygular; dosyanın kendisi de modeli
açıkça "pinned MODEL, NOT yet live DRIVER" diye tanımlar. (src/orchestra/result-collector.ts:292, src/orchestra/result-collector.ts:329, src/orchestra/sprint-spawner.ts:897, src/orchestra/sprint-spawner.ts:938)

Net karar: kademeli strangler + saf reducer + tek typed-effect executor + shadow differential journal. Event log ilk aşamada yürütme otoritesi değil, karar-karşılaştırma ve replay kanıt katmanı olmalıdır; mevcut event stream fail-soft yazar ve reconstructed state scheduler queue/assignment/effect durumunu
taşımaz. (src/core/event-stream.ts:300, src/core/event-stream.ts:422)

Migration öncesi iki semantik sabitlenmelidir:

- MRR scheduling bakımından terminal ve dependency-non-satisfying kalır; yalnız DONE dependency tatmin eder. (src/orchestra/scheduler-truth.ts:10, src/orchestra/scheduler-truth.ts:29, src/orchestra/scheduler-truth.ts:37)

- FIFO yalnız sıra/cadence seçer; explicit dependency edge'ini kapatamaz. Bugünkü legacy planner ve pipeline-off helper yolu dependency kontrolünü atlar.
  (src/orchestra/result-collector.ts:358, src/orchestra/sprint-spawner.ts:1163)

## Kanıt-tabanlı analiz

### Canlı yürütme haritası

```
runSprint
  → runSpawnPhase → spawnWorkers → taskQueue
  → waitForResults
      ├─ initial:
      │   dispatchTick → processQueue → maybeRespawn
      │   dispatchReadyTasks
      │   cascadeSkipDeadBlocked
      └─ watcher tick:
          collectResults
          drainNervousRespawns
          cost-gate açıksa:
            dispatchTick
            forceRescanIfIdle
            dispatchReadyTasks
          cascadeSkipDeadBlocked
```

İlk spawn runSpawnPhase içindeki spawnWorkers ile yapılır; closure'ların ilk-pass sırası ile watcher sırası ayrıca kurulmuştur. (src/orchestra/sprint-phases.ts:973, src/orchestra/sprint-controller.ts:1387, src/orchestra/result-collector.ts:1451, src/orchestra/result-collector.ts:1558)

### Altı closure'ın sorumluluk/tetik/yan-etki haritası

**dispatchTick**
- Tetik ve karar: İlk collection sonrası ve cost-gate açık watcher tick'inde processQueue, ardından maybeRespawn çağırır. (src/orchestra/result-collector.ts:1173, src/orchestra/result-collector.ts:1573)
- Yan etki / kritik ayrışma: Kendi kararı yoktur ve planDispatch çağırmaz; initial çağrı tick-armor kurulmadan gerçekleşir. (src/orchestra/result-collector.ts:1451, src/orchestra/result-collector.ts:1538)

**processQueue**
- Tetik ve karar: Her completed task için pickFromQueue ile en çok bir queue task seçer; explicit dependency kontrolü yoktur. (src/orchestra/result-collector.ts:1289, src/orchestra/sprint-spawner.ts:1211)
- Yan etki / kritik ayrışma: Completed worker'ı öldürür, sonra yerel spawnIfNotAssigned yoluna iner; helper task status'unu değiştirir fakat task JSON persistence yapmaz. (src/orchestra/result-collector.ts:1190, src/orchestra/result-collector.ts:1301)

**maybeRespawn**
- Tetik ve karar: Legacy FIFO, eksik config veya pipeline-off durumunda no-op; aksi halde graph-aware respawnEligibleTasks çalıştırır. (src/orchestra/result-collector.ts:1143, src/orchestra/sprint-spawner.ts:873)
- Yan etki / kritik ayrışma: DEPENDENCY_BLOCKED, provider/backend spawn, task persistence, wave metrics ve checkpoint üretir; ardından blocked-dedupe state temizlenir. (src/orchestra/sprint-spawner.ts:905, src/orchestra/sprint-spawner.ts:931, src/orchestra/sprint-spawner.ts:1090, src/orchestra/result-collector.ts:1158)

**forceRescanIfIdle**
- Tetik ve karar: Beş dakikalık spawn-idle eşiğinde free slot hesaplayıp selectEligibleForSpawn çağırır. (src/orchestra/result-collector.ts:1312, src/orchestra/result-collector.ts:1327)
- Yan etki / kritik ayrışma: Yerel spawn helper'ını ve force-rescan metriğini kullanır; eligibility retryAfter uygular fakat fix aggregation yapmaz. (src/orchestra/result-collector.ts:1340, src/orchestra/sprint-spawner.ts:1188)

**dispatchReadyTasks**
- Tetik ve karar: İlk pass ve açık-dispatch tick'inde dependency-bearing, PENDING, unassigned/uncollected task'ları aggregate-aware DONE setiyle seçer. (src/orchestra/result-collector.ts:482, src/orchestra/result-collector.ts:1353)
- Yan etki / kritik ayrışma: Pipeline flag kapalı olsa dahi dep-check yapar; kendisinden önce çalışan processQueue bunu yapmaz ve yine yerel spawn helper'ına iner. (src/orchestra/result-collector.ts:1299, src/orchestra/result-collector.ts:1366)

**cascadeSkipDeadBlocked**
- Tetik ve karar: İlk pass ve her watcher tick'inde, cost-gate dispatch'i durdursa bile çalışır; NO_GO/MRR dependency'li PENDING task'ları transitif skip eder. (src/orchestra/result-collector.ts:1383, src/orchestra/result-collector.ts:1587)
- Yan etki / kritik ayrışma: cascadeSkipped:true sentetik NO_GO yazar; disk write başarısız olsa bile in-memory result/collected/status ilerletilir. (src/orchestra/result-collector.ts:1411, src/orchestra/result-collector.ts:1433)

### planDispatch sözleşmesi

Girdi; sprint, dependency flag'i, maxWorkers, assigned/collected ID setleri, mutable remainingQueue ve legacy completion listesidir. Çıktı yalnız spawn/kill listeleri ile mode'dur. (src/orchestra/result-collector.ts:307, src/orchestra/result-collector.ts:329)

"Pure model" yorumu yanıltıcıdır: remainingQueue contract gereği mutate edilir; continuous yol splice, legacy yol shift yapar. Shadow-mode aynı queue nesnesini verirse gözlemlemek istediği legacy yürütmeyi değiştirir. (src/orchestra/result-collector.ts:336, src/orchestra/result-collector.ts:410, src/orchestra/result-collector.ts:450)

Continuous model slot sayar, scheduler-truth predicate'i ve bir-seviye fixForTaskId aggregation kullanır; önce queue, sonra tüm PENDING task'lardan slot doldurur. (src/orchestra/result-collector.ts:370, src/orchestra/result-collector.ts:383, src/orchestra/result-collector.ts:397)

Legacy model completion başına bir unassigned queue task seçer; dependency, collectedIds, slot ve retry kontrolü yoktur. (src/orchestra/result-collector.ts:358, src/orchestra/result-collector.ts:450)

### Örtüşme/boşluk matrisi

| Capability | planDispatch | Canlı yürütme | Karar |
|---|---|---|---|
| Continuous slot-fill | Queue + tüm PENDING scan var. (result-collector.ts:370) | Queue, graph-respawn, ready ve idle scan arasında bölünmüş. (result-collector.ts:1183, :1323) | Örtüşme yüksek; otorite parçalı. |
| Legacy FIFO | Completion başına spawn/kill projection var. (result-collector.ts:358) | processQueue aynı shape'i uygular. (result-collector.ts:1289) | En yakın parity; iki tarafta da dep-check deliği var. |
| MRR | Scheduler-truth predicate'i kullanılır. (result-collector.ts:390) | Respawn ve cascade canonical predicate'lere yakındır. (sprint-spawner.ts:884, result-collector.ts:1398) | Ana akış uyumlu; restore uyumsuz. |
| Fix aggregation | Bir-seviye original/fix aggregation var. (result-collector.ts:390) | Ready scan'de var, idle/respawn eligibility'de yok. (result-collector.ts:487, sprint-spawner.ts:1188) | Task kaderi trigger sırasına göre değişebilir. |
| Collision edges | Yok. (result-collector.ts:329) | Graph yoluna synthetic collision edge eklenir. (dependency-scheduler.ts:162) | Naif wire concurrent-write serialization'ını kaybettirir. |
| Retry backoff | Yok. (result-collector.ts:329) | retryAfter yalnız ayrı helper'da uygulanır. (sprint-spawner.ts:1199) | Reducer input'una nowMs ve deadline gerekir. |
| Cascade | Yok. (result-collector.ts:329) | Transitive synthetic NO_GO üretilir. (result-collector.ts:1383) | Typed CascadeSkip effect zorunlu. |
| Blocked reason/events | Çıktıda disposition/reason yok. (result-collector.ts:329) | DEPENDENCY_BLOCKED event'i vardır. (sprint-spawner.ts:905) | Decision contract genişlemeli. |
| Metrics/checkpoint | Yok. (result-collector.ts:329) | Respawn wave metric/event/checkpoint yazar. (sprint-spawner.ts:1090) | Planned/applied effects ayrılmalı. |
| Spawn parity | Executor belirtmez. (result-collector.ts:329) | Yerel helper ile heavyweight spawner farklıdır. (result-collector.ts:1190, sprint-spawner.ts:931) | Önce canonical executor şart. |
| Cost-stop | Input'ta yok. (result-collector.ts:307) | Main loop spawn yollarını durdurur, cascade'i sürdürür. (result-collector.ts:1567) | Trigger context explicit olmalı. |
| Restore/replay | Yok. (result-collector.ts:329) | Checkpoint ayrı lifecycle yoludur. (sprint-checkpoint.ts:596) | Restore aynı reducer'a girmeli. |

Altı closure birleşse bile ilk spawnWorkers seçimi ve postfix respawn ayrı truth olarak kalır; initial seçim pipeline-off'ta doğrudan sprint sırasını kullanır. (src/orchestra/sprint-spawner.ts:536, src/orchestra/sprint-phases.ts:2785)

### Checkpoint-restore MRR semantiği

Mevcut checkpoint:

- Yalnız DONE/NO_GO'yu completedTasks,
- yalnız PENDING'i pendingTasks,
- yalnız EXECUTING/CLAIMED'i activeWorkers yapar. (src/orchestra/sprint-checkpoint.ts:176, src/orchestra/sprint-checkpoint.ts:558)

Bu nedenle checkpoint anında zaten MRR olan task üç bucket'ın da dışındadır; restore yalnız bu üç kümenin union'ından task listesi oluşturur. (src/orchestra/sprint-checkpoint.ts:652)

Stale active worker disk evidence taşıyorsa restore onu MRR'a dönüştürür; ardından controller PLAN/SPAWN/EXECUTE'ı atlayıp EVALUATE'a sıçradığı için downstream cascade closure çalışmaz. (src/orchestra/sprint-checkpoint.ts:688, src/orchestra/sprint-controller.ts:1167)

Doğru sözleşme:

1. Checkpoint v2; schema version, tam task order/status map, remaining queue, active workers ve son applied decision sequence taşır.
2. Restore trigger.kind='restore' ile aynı reducer'a girer.
3. DONE satisfying; NO_GO/MRR terminal-non-satisfying kabul edilir.
4. NO_GO/MRR upstream'in PENDING descendant'ları transitif CascadeSkip alır.
5. Henüz terminal olmayan dependency Blocked, satisfying dependency SpawnTask disposition'ı alır.
6. Legacy decoder eksik task'ları yalnız aynı sprint'in persisted task kayıtlarından tamamlar.

Bu semantik born-610 kararının doğrudan uygulanmasıdır. (src/orchestra/scheduler-truth.ts:29, src/orchestra/scheduler-truth.ts:37)

### FIFO dependency deliğinin tasarımdaki yeri

dispatch_strategy = continuous | legacy-fifo yalnız ordering/cadence seçmelidir; dependency_policy = strict iki stratejide de değişmez olmalıdır. Bugünkü planLegacyFifo, pipeline-off selectEligibleForSpawn ve initial spawn dependency'leri bypass eder. (src/orchestra/result-collector.ts:358, src/orchestra/sprint-spawner.ts:1163, src/orchestra/sprint-spawner.ts:536)

FIFO head blocked ise destructive shift yapılmamalı; entry korunarak ilk eligible sonraki task seçilmelidir. Continuous queue yolu aynı index-scan ilkesini hâlihazırda uygular. (src/orchestra/result-collector.ts:397)

DECKENT_LEGACY_FIFO=1 yalnız "completion başına bir eligible FIFO task" davranışına dönmelidir; dependency safety için eski bypass kalıcı rollback seçeneği olmamalıdır.

### cascadeSkipped ve fix-task routing koruma garantisi

cascadeSkipped, never-dispatched scheduler skip'inin normal worker failure olmadığını ve fix/cross-fix üretmemesi gerektiğini type contract'ta açıkça belirtir. (src/core/task-types.ts:475)

İki ayrı kapı vardır:

- handleEvaluation cascade sonucu için -fix üretmez. (src/orchestra/debt-manager.ts:411)
- Cross-dependency yolu sonucu diskten tekrar okuyup -xfix üretmez. (src/orchestra/debt-manager.ts:540)

Bu nedenle reducer garantisi yalnız in-memory flag olamaz. CascadeSkipEffect; cascadeSkipped:true, failed dependency ID/status ve deterministic idempotency key taşımalı; executor sonucu atomic persist ettikten sonra task status/collected state'ini ilerletmelidir. Bugünkü writer disk hatasına rağmen memory state'i ilerlettiği için crash sınırında muafiyet kanıtı kaybolabilir. (src/orchestra/result-collector.ts:1433)

Fix-task routing mirası forceModel, provider, backend, modelEffort alanlarını kapsar; yalnız fix alanı undefined ise original'dan kopyalanır ve explicit override korunur. (src/orchestra/sprint-spawner.ts:1685, src/orchestra/sprint-spawner.ts:1718)

Miras initial spawn ve heavyweight respawn'da uygulanırken yerel spawnIfNotAssigned yolunda uygulanmaz. (src/orchestra/sprint-spawner.ts:609, src/orchestra/sprint-spawner.ts:952, src/orchestra/result-collector.ts:1190)

Tek executor mirası prompt, provider, backend ve effort resolution'dan önce uygulamalıdır. Original task bulunamazsa bugünkü fail-soft no-op yerine açık routing-lineage-missing / spawn-blocked disposition üretilmelidir. (src/orchestra/sprint-spawner.ts:1708, src/orchestra/sprint-spawner.ts:1723)

## Seçenekler (+ trade-off)

### 1. Büyük-bang reducer

Tek değişiklikte closure'lar kaldırılıp bütün karar ve effects planDispatch içine alınır.

- Artı: geçici dual-authority süresi kısadır.
- Eksi: mevcut contract collision, retry, cascade, events ve checkpoint'i temsil etmez; aynı anda iki spawn yürütücüsü de değişeceği için scheduler/routing/provider blast radius'ları birleşir. (src/orchestra/result-collector.ts:329, src/orchestra/sprint-spawner.ts:897, src/orchestra/sprint-spawner.ts:1090)
- Karar: NO_GO.

### 2. Kademeli strangler + shadow differential

Yeni reducer önce immutable snapshot üzerinde shadow çalışır; legacy closures execution authority kalır, normalized kararlar journal'da kıyaslanır.

- Artı: her dilimde davranış-parity ölçülür ve rollback switch'i korunur.
- Eksi: geçiş süresince iki karar temsili vardır; shadow'a queue clone verilmezse model canlı state'i mutasyona uğratır. (src/orchestra/result-collector.ts:336)
- Karar: önerilen ana yol.

### 3. Event-log + replay birincil scheduler

Bütün trigger'lar append-only event olur; reducer state'i replay ile kurar ve effects idempotency key'le uygulanır.

- Artı: crash recovery, forensic audit ve deterministic replay en güçlü seçenektir.
- Eksi: mevcut event stream fail-soft durability'ye ve eksik reconstructed state'e sahiptir; exactly-once execution authority olamaz. (src/core/event-stream.ts:300, src/core/event-stream.ts:422)
- Karar: ilk migration'da observation journal; primary event sourcing ayrı ADR.

### 4. Yalnız facade birleşimi

Closure'lar tek bir orchestration facade altında sırayla çağrılır.

- Artı: call-site azalır.
- Eksi: eligibility, restore, FIFO bypass ve iki executor değişmez; planDispatch yine canlı otorite olmaz. (src/orchestra/result-collector.ts:1173, src/orchestra/result-collector.ts:292)
- Karar: hedefi karşılamaz.

## Net Öneri

```
SchedulerTrigger + immutable SchedulerSnapshot
                    │
                    ▼
          reduceSchedulerTick()
                    │
                    ▼
SchedulerDecision {
  nextQueue,
  dispositions,
  orderedEffects
}
                    │
                    ▼
       SchedulerEffectExecutor
          ├─ spawn / kill
          ├─ cascade persist
          ├─ blocked events
          ├─ metrics
          ├─ checkpoint
          └─ planned/applied journal
```

SchedulerSnapshot; trigger kind/sequence, strategy, nowMs, cost-stop, slot budget, ordered queue, statuses, collected/assigned sets, effective dependency state, collision blockers ve retry deadlines taşımalıdır. Reducer disk, process.env veya Date.now() okumamalıdır; mevcut model mode'u env'den, helper retry zamanını içeriden çözer. (src/orchestra/result-collector.ts:350, src/orchestra/sprint-spawner.ts:1199)

SchedulerDecision en az SpawnTask, KillWorker, CascadeSkip, Blocked, ClearBlocked, EmitMetric, WriteCheckpoint effect'lerini taşımalıdır.

planDispatch migration sırasında yeni reducer'ın spawn/kill compatibility projection'ı olarak kalabilir; composition flip tamamlanınca testler doğrudan reducer contract'ına taşınmalıdır.

## Uygulama-planı (8 sprint)

| Sprint | Dosyalar ve teslim | Composition kanıtı | Geri dönüş |
|---|---|---|---|
| 1 — Semantics kernel | scheduler-truth.ts, yeni scheduler-state.ts, result-collector.ts, sprint-spawner.ts, yeni scheduler-effective-dependencies.test.ts; status predicate, fix aggregation ve effective dependency state teklenir. | DONE/NO_GO/MRR/fix kombinasyonları exhaustive tablo; selectEligibleForSpawn hardcoded DONE'dan kurtulur. (sprint-spawner.ts:1188) | Yalnız helper adapter geri alınır; execution order değişmemiştir. |
| 2 — Checkpoint v2 | sprint-checkpoint.ts, sprint-controller.ts, yeni checkpoint-mrr-restore.test.ts; full task-status/order/queue schema ve legacy decoder. | "Zaten MRR" restore'da kaybolmaz; stale active→MRR direct/transitive descendants cascade-skip olur, spawn sıfırdır. | v2 writer kapatılır, dual reader korunur. |
| 3 — Canonical spawn executor | sprint-spawner.ts, yeni scheduler-effects.ts, result-collector.ts, fix-model-preserve.test.ts, yeni scheduler-spawn-executor.test.ts. | Bütün trigger'larda prompt/provider/backend/effort ve fix inheritance eşit; task persistence ve spawn outcome pinli. | Closures eski local adapter'a döner; reducer hâlâ live değildir. |
| 4 — Full reducer, shadow-only | Yeni scheduler-reducer.ts, scheduler-driver.ts, scheduler-journal.ts; scheduler-shadow-equivalence.test.ts. | Aynı immutable snapshot için legacy/reducer task set, disposition, blocker, effect order ve nextQueue kıyası. | Shadow flag kapatılır; execution etkisi yoktur. |
| 5 — Continuous live switch | result-collector.ts, scheduler-driver.ts, scheduler-effects.ts, yeni scheduler-driver-composition.test.ts. | Initial ve watcher pass aynı injected driver'ı çağırır; queue/ready/idle/respawn effects tek executor'dan geçer. | scheduler_engine=legacy; eski closures tutulur. |
| 6 — Cascade ve restore live | scheduler-reducer.ts, scheduler-effects.ts, sprint-checkpoint.ts, debt-manager.ts, yeni scheduler-cascade-composition.test.ts. | Reducer→atomic disk result→evaluate zincirinde -fix ve -xfix oluşmaz; crash/replay duplicate skip üretmez. | Cascade/restore için ayrı legacy switch; checkpoint v2 korunur. |
| 7 — FIFO safety/config migration | scheduler-reducer.ts, config-types.ts, config.ts, processqueue-stall.test.ts, yeni scheduler-fifo-dependency-safety.test.ts. | Blocked head korunur; sonraki eligible task seçilir; MRR/NO_GO dependency spawn değil cascade üretir. | Engine legacy olabilir; dependency bypass geri açılmaz. |
| 8 — Default flip/retirement | result-collector.ts, sprint-spawner.ts, scheduler-driver.ts, yeni tests/governance/scheduler-single-driver.test.ts, ilgili ADR ve MASTER-PLAN.md. | Production'da tek driver, tek spawn executor ve eski direct closure çağrısı sıfır; gerçek dogfood shadow→live→default-live sırası. | Closure retirement öncesi runtime flag; retirement sonrası yalnız doğrulanmış release rollback'i. |

Composition gate; pure matrix, differential shadow, injected runtime-driver call order, effect failure injection, crash/replay idempotency, fix-routing parity, POSIX/Windows/WSL adapter testleri ve gerçek-binary dogfood içermelidir. Projenin user-surface değişikliklerinde gerçek binary kanıtı zorunludur. (AGENTS.md:51)

## Riskler

- Shadow reducer canlı queue'yu tüketebilir; immutable clone ve explicit nextQueue zorunludur. (src/orchestra/result-collector.ts:336)
- Canonical executor'dan önce live switch routing/persistence kaybı yaratır. (src/orchestra/result-collector.ts:1190, src/orchestra/sprint-spawner.ts:931)
- Collision edge snapshot'a taşınmazsa eşzamanlı write serialization kaybolur. (src/orchestra/dependency-scheduler.ts:162)
- Retry deadline reducer input'una taşınmazsa task erken spawn olur. (src/orchestra/sprint-spawner.ts:1199)
- MRR checkpoint'ten kaybolabilir veya downstream sessiz deferred kalabilir. (src/orchestra/sprint-checkpoint.ts:176, src/orchestra/sprint-controller.ts:1167)
- Cascade persist-before-commit yapılmazsa crash sonrası cross-fix muafiyet kanıtı kaybolur. (src/orchestra/result-collector.ts:1433)
- Initial spawn reducer'a alınmazsa "tek truth" iddiası eksik kalır. (src/orchestra/sprint-spawner.ts:536)
- Static ADR/DECKENT metni hâlâ MRR'yi satisfying olarak anlatırken source truth tersini söyler; migration sprintinde doküman/memory SSOT senkronlanmalıdır. (DECKENT.md:55, src/orchestra/scheduler-truth.ts:10)
