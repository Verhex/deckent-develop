# T-152-012: Nervous System 11 Detector Canlılık Audit

**Sprint:** sprint-152 (Post-Migration Comprehensive System Audit)
**Mode:** READ-ONLY audit — no code changes
**Date:** 2026-04-24
**Auditor:** docker-152-012 (doc-writer + system-architect + code-reviewer)

## Özet

`src/nervous/detector-registry.ts` **11 detector** (`IDetector` uygulayan sınıf) kodlanmıştır. Ancak runtime gerçekliği beklenenden zayıftır:

- ✅ **Kod seviyesi (implementation):** 11 detector dosyası mevcut, tümü TypeScript'e compile olur (`tsc --noEmit` 0 err).
- ⚠️ **Schema seviyesi (config-types.ts):** `NervousSystemConfig.detectors` **yalnızca 10 key** tanımlar ve bu 10 key'in 5'i **koddaki implementation ile eşleşmiyor** (5 "reserve_for: sprint-148" entry'si ORPHAN config, karşılık gelen kod yok).
- ⚠️ **Config seviyesi (`.deckent/config.json`):** Aynı 5 active + 5 reserve şeması kullanılmış — **6 yeni detector (task_mode_idle, build_failure_recurrence, token_spike, agent_routing_anomaly, scope_collision_rate, notification_delivery_health) config.json'da tanımsız**, dolayısıyla registry conditional `if (config.X?.enabled)` tümünde `false` döner → disabled.
- ❌ **Runtime seviyesi (observer.ts wire):** `NervousObserver` sınıfı sadece JSDoc'ta (sprint-controller.ts:164) + test dosyalarında referanslanır. Production kodunda **hiçbir yerde `new NervousObserver(...)`** çağrısı yok → `DetectorRegistry` asla instantiate edilmiyor, `runAll()` asla çalışmıyor.
- ❌ **Event log seviyesi:** Son 5 sprint event log'unda (sprint-148 → sprint-152) hiçbir detector kaynaklı kanal yok. `.deckent/nervous-history.jsonl` ve `.deckent/nervous-pending.json` dosyaları **fiziksel olarak mevcut değil**.
- ⚠️ **DECKENT→USER:NOTIFY wire (H6) çalışıyor ama detector'lardan değil:** `src/core/notify.ts` → `eventBus.emit(... channel:'DECKENT→USER:NOTIFY')` yalnızca `sprint-controller.ts:397` gibi sprint-lifecycle noktalarından tetikleniyor. Detector outputs bu kanala akmıyor çünkü detector'lar yüklenmiyor.

**Kısa gerçek:** T-151-015 "6→11 detector" DONE kabul edildi ama sadece **sınıf yazıldı**; registry genişletildi; config şeması + config.json + observer wire güncellenmedi. Production runtime'da aktif detector sayısı **0**'dır. Bu Sprint 151'in DONE rapor ile sistem durumu arasındaki en büyük **honest assessment** açıklarından biridir.

---

## 11 Detector × Canlılık Durumu

| # | Detector Class | detectorId | Kod | Schema (config-types) | config.json | Registry conditional | Live trigger (son 5 sprint) | Durum |
|---|----------------|------------|-----|----------------------|-------------|---------------------|----------------------------|-------|
| 1 | `StaleWorkerDetector` | `stale-worker` | ✅ 61 LoC | ✅ `stale_worker` | ✅ `enabled:true, threshold_ms:180000` | ✅ aktif olurdu | ❌ 0 kanıt | **DEAD — observer wire yok** |
| 2 | `ScopeCollisionMonitor` | `scope-collision` | ✅ 196 LoC | ✅ `scope_collision` | ✅ `enabled:true` | ✅ aktif olurdu | ❌ 0 kanıt (AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED başka yol) | **DEAD — observer wire yok** |
| 3 | `DebtTrendAnalyzer` | `debt-trend` | ✅ 117 LoC | ✅ `debt_trend` | ✅ `enabled:true, threshold_rate:0.15` | ✅ aktif olurdu | ❌ 0 kanıt | **DEAD — observer wire yok** |
| 4 | `AgentRoutingHealth` | `agent-routing` | ✅ 138 LoC | ✅ `agent_routing` | ✅ `enabled:true, anomaly_threshold:0.40` | ✅ aktif olurdu | ❌ 0 kanıt | **DEAD — observer wire yok** |
| 5 | `DirectivesMidSprintProtection` | `directives-protection` | ✅ 91 LoC | ✅ `directives_protection` | ✅ `enabled:true, auto_restore:true` | ✅ aktif olurdu | ❌ 0 kanıt (Sprint 145/146 phase guard başka yol) | **DEAD — observer wire yok** |
| 6 | `TaskModeIdleDetector` | `task-mode-idle` | ✅ 72 LoC (Sprint 149 T-4) | ❌ **schema'da yok** | ❌ **config'de yok** | ❌ `config.task_mode_idle?.enabled` her zaman false | ❌ 0 kanıt | **ORPHAN KOD — schema+config eksik** |
| 7 | `BuildFailureRecurrenceDetector` | `build-failure-recurrence` | ✅ 192 LoC (Sprint 151 T-015) | ❌ **schema'da yok** | ❌ **config'de yok** | ❌ her zaman false | ❌ 0 kanıt | **ORPHAN KOD — schema+config eksik** |
| 8 | `TokenSpikeDetector` | `token-spike` | ✅ 139 LoC (Sprint 151 T-015) | ❌ **schema'da yok** | ❌ **config'de yok** | ❌ her zaman false | ❌ 0 kanıt | **ORPHAN KOD — schema+config eksik** |
| 9 | `AgentRoutingAnomalyDetector` | `agent-routing-anomaly` | ✅ 113 LoC (Sprint 151 T-015) | ❌ **schema'da yok** | ❌ **config'de yok** | ❌ her zaman false | ❌ 0 kanıt | **ORPHAN KOD — schema+config eksik** |
| 10 | `ScopeCollisionRateDetector` | `scope-collision-rate` | ✅ 100 LoC (Sprint 151 T-015) | ❌ **schema'da yok** | ❌ **config'de yok** | ❌ her zaman false | ❌ 0 kanıt | **ORPHAN KOD — schema+config eksik** |
| 11 | `NotificationDeliveryHealthDetector` | `notification-delivery-health` | ✅ 123 LoC (Sprint 151 T-015) | ❌ **schema'da yok** | ❌ **config'de yok** | ❌ her zaman false | ❌ 0 kanıt | **ORPHAN KOD — schema+config eksik** |

**Toplam LoC:** 1342 (detector sınıfları) + 191 (registry) + 247 (observer) + 157 (dispatcher) + diğerleri = **3405 LoC nervous kod**, bunun tamamı production runtime'da **dormant**.

---

## 5 "Reserve_for: sprint-148" Orphan Config Entry

`.deckent/config.json` satır 162-181 ve `src/core/config.ts:621-625`:

| Config key | Sprint 148 teorisi | Reality 2026-04-24 |
|------------|---------------------|--------------------|
| `dead_event_stream` | "Event stream ölüyse alert" | Hiçbir TS/JS file'da karşılık yok. **Ghost config.** |
| `cost_threshold` | "Maliyet eşiği aşıldı alert" | Yine hiçbir sınıf yok. En yakını `TokenSpikeDetector` ama config key farklı. **Ghost config.** |
| `prompt_quality` | "Prompt kalitesi düşüyor alert" | Hiç implement edilmemiş. **Ghost config.** |
| `worker_output_variance` | "Worker çıktısı variance yüksek" | Hiç implement edilmemiş. **Ghost config.** |
| `self_modifying_warner` | "Self-modifying task detector" | `src/core/self-modifying-detector.ts` (Sprint 139 ADR-039) var AMA registry'ye bağlı değil + config key farklı. **Ghost config + mevcut alternatif kod başka dosyada.** |

**Schema drift root cause:** Sprint 147 planında bu 5 "ileride eklenecek" detector için placeholder yazıldı. Sprint 148 aynı isimleri kullanmadı (testing-expert agent-routing-anomaly reform yaptı). Sprint 149 `task_mode_idle` ve Sprint 151 T-015 5 yeni detector **farklı isimlerle** eklendi. Schema + config.json placeholder'ları hiç temizlenmedi → 5 zombie config entry.

---

## Observer Wire Forensic

```
grep -rn "new NervousObserver\|observer\.start()" /workspace/src
→ Sadece src/nervous/observer.ts (kendi JSDoc'u)
```

Sprint controller (`src/orchestra/sprint-controller.ts:164`) **yalnızca JSDoc comment**:
```
/**
 * Emit a sprint lifecycle event via the EventBus.
 * Always fires regardless of nervous system config — subscribers are optional.
 * NervousObserver listens for these as 'sprint-lifecycle' source events.  ← COMMENT ONLY
 */
```

**Test-only references:**
- `tests/core/nervous-enabled-integration.test.ts:44` — `new NervousObserver(projectRoot)` test
- `tests/nervous/observer.test.ts:91` — `new NervousObserver('/test/project', 50)` test
- `tests/nervous/runtime-scope.test.ts:98-100` — scope guard test

Testler sınıfın instantiable olduğunu doğruluyor ama **hiçbir production call-site yok**.

**Sprint 148 DIRECTIVES (archive):** T-148-007 "Brain boot sırasında nervous observer başlar" planlandı ancak kod olarak **hiç wire edilmedi**. Bu Sprint 148'in kaçırılmış implementation task'larından biridir. Retro'da kapanmamış.

---

## DECKENT→USER:NOTIFY (H6) Çalışıyor Ama Detector'dan Değil

| Kaynak | NOTIFY emit eder mi | Gerçek kullanım |
|--------|--------------------|-----------------|
| `src/core/notify.ts` | ✅ `eventBus.emit('deckent-event', {channel:'DECKENT→USER:NOTIFY'})` | Sprint-started, task-done, sprint-finalized için sprint-controller tarafından çağrılır |
| `src/orchestra/sprint-controller.ts:397` | ✅ `void notify('sprint-started', ...)` | Sprint kick-off H6 evidence |
| `src/orchestra/task-mode-runner.ts:95` | ✅ `eventBus.emit(...)` | Task mode completion |
| **Detector'lar** | ❌ Hiçbiri `eventBus` emit etmiyor | **Detector sonuçları notify() aracılığıyla NOTIFY kanalına akmıyor çünkü detector'lar çalışmıyor** |

**H6 canlı mı?** Evet — sprint-lifecycle event'leri için. Ancak "nervous bridge broken" alert pattern'i (T-151-015 kategorize ettiği) **hiç test edilmemiş**.

### Subscribe Analizi
`eventBus.subscribe(...)` aramasında **tek subscriber**:
- `src/mcp/tools/watch.ts:96` — MCP `watch` tool bir client subscribe ettiğinde events stream'i dinler (on-demand, reactive)

**Yani NOTIFY kanal'ına yazıyoruz ama production'da default olarak hiçbir dinleyici yok.** MCP watch tool çağrılmadıkça event'ler "boşa emit" oluyor. Bu Sprint 151 T-151-009 DECKENT→USER:NOTIFY E2E test'in neden "22 E2E" ile smoke edildiğini açıklıyor — testler subscriber'ı mock ediyor.

---

## Son 5 Sprint Event Log Kanıtı

```
for sprint in 148 149 150 151 152; do
  grep -oE '"channel":"[^"]+"' /workspace/.deckent/sprint-${sprint}-events.jsonl | sort -u
done
```

**Tüm 5 sprint'te tek biçim:**
- `AUDITOR→BRAIN:GATE_COMPUTED`
- `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN`
- `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED`
- `BRAIN→*:METRIC_EMITTED`
- `BRAIN→*:SPRINT_PHASE_CHANGE`
- `BRAIN→WORKER:TASK_ASSIGN`
- `WORKER→BRAIN:HEARTBEAT`

**Hiçbir sprint'te:**
- `DECKENT→USER:NOTIFY` yok (log'da persistent değil — sadece in-process emit)
- `NERVOUS:*` kanalı yok
- Detector ID'si geçen event yok

**Not:** `SCOPE_COLLISION_DETECTED` event'i `detectScopeCollisions()` (file-lock.ts, Sprint 138 T-004) plan-time fonksiyonundan geliyor, `ScopeCollisionMonitor` nervous detector'dan **değil**.

### Metric Events (sprint-151-metrics.jsonl)
`hb.stale`, `collision.detected`, `honesty.check`, `result.collected` gibi metrikler var. Bunlar `StaleWorkerDetector` veya `ScopeCollisionMonitor` çıktısı **değil** — auditor + brain iç mantığından geliyor (stale HB → auditor.ts, collision → detectScopeCollisions plan-time).

---

## Dosya Sistemi Kanıtı

```
ls /workspace/.deckent/nervous-history.jsonl 2>&1
→ No such file or directory

ls /workspace/.deckent/nervous-pending.json 2>&1
→ No such file or directory
```

CLI `deckent nervous history` ve `deckent nervous` subcommand'ları var (`src/cli/commands/nervous.ts`) ama hiç veri üretilmedi çünkü:
1. DetectorRegistry hiç runAll çalıştırmadı
2. NervousDispatcher hiç dispatch çağrılmadı (brain boot'ta init edilmiyor)
3. History file hiç write edilmedi

---

## Test Coverage

| Detector | Test dosyası | Test var mı |
|----------|-------------|-------------|
| stale-worker | `stale-worker.test.ts` + `stale-worker-live.test.ts` | ✅ |
| scope-collision | `scope-collision.test.ts` + `scope-collision-live.test.ts` | ✅ |
| debt-trend | `debt-trend.test.ts` + `debt-trend-live.test.ts` | ✅ |
| agent-routing | `agent-routing.test.ts` + `agent-routing-positive.test.ts` | ✅ |
| directives-protection | `directives-protection.test.ts` + `directives-protection-stress.test.ts` | ✅ |
| task-mode-idle | `task-mode-idle.test.ts` | ✅ |
| build-failure-recurrence | `build-failure-recurrence.test.ts` | ✅ |
| token-spike | `token-spike.test.ts` | ✅ |
| agent-routing-anomaly | `agent-routing-anomaly.test.ts` | ✅ |
| scope-collision-rate | `scope-collision-rate.test.ts` | ✅ |
| notification-delivery-health | `notification-delivery-health.test.ts` | ✅ |

Test tarafında 11/11 dosya mevcut. Sprint 151 T-151-015 "15 test (5×3)" çıktısı doğru. Ancak tüm testler **unit seviyesi**; production wire mevcut olmadığı için E2E "detector live fires → notify emit → adapter receives" zinciri hiç test edilmedi.

`tests/core/nervous-enabled-integration.test.ts` "Brain boot integration" test'i var ama **sadece constructor instantiable olduğunu** teyit ediyor (`new NervousObserver(projectRoot)`), asıl brain boot akışının observer'ı çağırdığını doğrulamıyor.

---

## Bulgular

- [FAIL-WIRE] **Sprint 148 T-148-007 kaçırılmış implementation**: `NervousObserver` hiçbir production path'te instantiate edilmiyor. `src/orchestra/sprint-controller.ts:164` yalnızca JSDoc. Kanıt: `grep -rln "new NervousObserver" src/` → yalnız `src/nervous/observer.ts` (kendi JSDoc).
- [DRIFT-SCHEMA] **config-types.ts eksik 6 detector key**: `NervousSystemConfig.detectors` satır 391-402 sadece 10 key (5 active + 5 reserve) tanımlar. Kodun gerçekten eklediği 6 yeni detector (task_mode_idle + 5×T-151-015) schema'da yok. TypeScript compile ediyor çünkü `DetectorRegistry.config` parametresi `DetectorConfig` (ayrı bir interface) bekliyor — kendi `readonly task_mode_idle?`, `readonly build_failure_recurrence?` vs. tanımlı.
- [DRIFT-CONFIG] **config.json eksik 6 detector entry**: satır 136-181 sadece 5 active + 5 reserve. 6 yeni detector için hiç `enabled:true` ekilmemiş. `src/core/config.ts:615-626` default'u da aynı. Sonuç: registry 11 conditional check yapıyor ama 6'sı daima false, 5'i aktif olurdu ama observer yüklemediği için o da ölü.
- [ORPHAN-CONFIG] **5 "reserve_for: sprint-148" zombi entry**: `dead_event_stream`, `cost_threshold`, `prompt_quality`, `worker_output_variance`, `self_modifying_warner` — bu 5 detector sınıfı hiç yazılmadı. İsim ve işlev Sprint 151 T-015'te değiştirildi (örn. `cost_threshold` → `token-spike`) ama eski placeholder'lar silinmedi.
- [MISSING] **`.deckent/nervous-history.jsonl` + `nervous-pending.json` fiziksel olarak yok**: CLI `deckent nervous history` ve `deckent nervous accept <id>` komutları var ama veri üretmediği için boş.
- [MISSING] **Production event log'unda `DECKENT→USER:NOTIFY` persistent kayıt yok**: Tüm sprint-15X-events.jsonl dosyaları yalnızca auditor/brain/worker kanallarını içeriyor. NOTIFY kanalı sadece in-process `eventBus.emit` — eventlerin sprint log'una yazılması gerekirse event-stream.ts `writeEvent()` wire edilmeli.
- [PASS-PARTIAL] **Detector implementation kalitesi iyi**: 11/11 detector `IDetector` interface'ini uygular, tümünün test dosyası var, `tsc --noEmit` 0 err. Sprint 151 T-151-015 DONE değerlendirmesi yazılım açısından doğru.
- [REGRESSION] **Sprint 151 "10 nervous detector aktif" iddiası asılsız**: DIRECTIVES-sprint-151 Exit Gate #10 "5 → 10 nervous detector aktif" hedefi retro'da DONE işaretlenmiş ama **aktif** kelimesi yerine **implement edilmiş** demek doğru olurdu. Gate hâlâ wire-level FAIL.
- [DRIFT-DOC] **IDENTITY.md "Nervous System 11 detector" iddiası yanıltıcı**: DECKENT.md + IDENTITY.md henüz 11 detector'ı "active" gösterecek şekilde güncellenmemiş ama Sprint 151 retro öyle sunuyor. Runtime'da 0 active.

---

## Sprint 153+ İçin Aksiyon Listesi

- **[P0]** **Observer wire task**: `src/orchestra/sprint-controller.ts` içinde `startSprint()` veya `bootBrain()` fonksiyonuna şu wire ekle:
  ```ts
  if (config.nervous_system?.enabled && !isWorkerProcess()) {
    const observer = new NervousObserver(projectRoot, config.scan_interval * 1000, config.nervous_system.detectors);
    observer.start();
    // wire detector results → dispatcher → notify()
  }
  ```
  Sprint 148 T-148-007 constraint'i (ana Brain PID, worker'da yasak) `assertBrainScope('NervousObserver')` ile zaten enforce ediliyor. Tahmini effort: normal (1-2 saat + 5 e2e test).

- **[P0]** **Schema drift fix**: `src/core/config-types.ts` `NervousSystemConfig.detectors` interface'ini güncelle:
  - 6 yeni key ekle (`task_mode_idle`, `build_failure_recurrence`, `token_spike`, `agent_routing_anomaly`, `scope_collision_rate`, `notification_delivery_health`)
  - 5 orphan key'i sil (`dead_event_stream`, `cost_threshold`, `prompt_quality`, `worker_output_variance`, `self_modifying_warner`)
  - `src/core/config.ts:615-626` default'u aynı şekilde güncelle, yeni detector'lar `enabled: true` default
  - `.deckent/config.json` migration (loadConfig içinde otomatik migrate)
  - Tahmini effort: low (30 dk).

- **[P0]** **DetectorRegistry ↔ NervousDispatcher ↔ notify() zinciri**: DetectorRegistry.runAll() sonucu → NervousDispatcher.dispatch() → notify() DECKENT→USER:NOTIFY kanalına emit. Sprint 151 T-151-009 E2E test mock'tan gerçek wire'a çevrilsin (22 E2E harness'ı reuse et). Tahmini effort: normal.

- **[P1]** **Event persistence**: `notify.ts:eventBus.emit(...)` çağrısı sonrası `writeEvent(projectRoot, sprintId, 'brain', 'user', 'DECKENT→USER:NOTIFY', payload)` ile sprint-NNN-events.jsonl'e de yaz. Böylece audit trail + retro analiz için persistent kanıt. Tahmini effort: low.

- **[P1]** **`self_modifying_warner` detector kurtarma**: `src/core/self-modifying-detector.ts` (Sprint 139 ADR-039) zaten tam implementasyon. Registry'ye `SelfModifyingWarnerDetector` sarmalayıcı ekle ve config key'ini yeniden ayağa kaldır (şimdi ghost entry). Tahmini effort: low.

- **[P1]** **`deckent nervous status` CLI komutu**: Şu an nervous CLI'da "status" subcommand yok (sadece default dashboard var). DIRECTIVES-sprint-151 `deckent nervous status` → 10 detector listelesin demişti ama never impl. Eklemeli: aktif detector listesi, son 10 event özet, dispatch başarı oranı. Tahmini effort: normal.

- **[P2]** **Nervous bridge broken alert self-test**: `NotificationDeliveryHealthDetector` "her adapter.send() fail → nervous bridge broken" pattern'ini gerçekten test edecek E2E. Mock dispatcher fail inject → detector trigger → CLI'da "bridge broken" warning emitted. Tahmini effort: normal.

- **[P2]** **Retro transparency fix**: Sprint 151 RETRO T-151-015 iddiaları "active" yerine "implemented, not yet wired" olarak güncellensin. Sprint 152 retro'sunda "honest self-assessment" pattern'ini canlandırıp yeniden yayınla.

- **[P2]** **ADR-041 ağırlık güncellemesi**: Nervous system'in production'da inert olduğu bir gerçek olarak ADR-040 "Nervous System Architecture — Proactive Meta-Orchestrator" Sprint 153+ için "runtime wire P0" notu eklensin.

---

## Kanıt Ekleri

### 1. Registry detector count (source: `src/nervous/detector-registry.ts`)
```
grep -c "this.active.push" /workspace/src/nervous/detector-registry.ts
→ 11
```

### 2. Detector ID enumeration
```
grep -rn "detectorId\s*=\s*['\"]" /workspace/src/nervous/detectors/*.ts | wc -l
→ 11
```

### 3. Config.json detector keys (counted from .deckent/config.json lines 136-181)
```
5 active: stale_worker, scope_collision, debt_trend, agent_routing, directives_protection
5 reserved: dead_event_stream, cost_threshold, prompt_quality, worker_output_variance, self_modifying_warner
TOPLAM: 10 key (6 yeni detector key'i EKSİK)
```

### 4. config-types.ts schema keys (lines 391-402)
```
stale_worker, scope_collision, debt_trend, agent_routing, directives_protection,
dead_event_stream, cost_threshold, prompt_quality, worker_output_variance, self_modifying_warner
TOPLAM: 10 key (registry'deki 11'le uyuşmuyor)
```

### 5. NervousObserver production instantiation
```
grep -rln "new NervousObserver" /workspace/src
→ /workspace/src/nervous/observer.ts (yalnız kendi JSDoc'u)
```
Hiçbir CLI, orchestra, agents, api, mcp, providers modülü NervousObserver import etmiyor.

### 6. Nervous history file state
```
ls /workspace/.deckent/nervous-history.jsonl /workspace/.deckent/nervous-pending.json
→ No such file or directory (her ikisi de)
```

### 7. Son 5 sprint event kanal envanteri
```
Son 5 sprint (148-152) tüm event log'larında yalnız 7 unique kanal:
  AUDITOR→BRAIN:GATE_COMPUTED
  AUDITOR→BRAIN:LOAD_REPORT_WRITTEN
  AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED (detector'dan değil, plan-time)
  BRAIN→*:METRIC_EMITTED
  BRAIN→*:SPRINT_PHASE_CHANGE
  BRAIN→WORKER:TASK_ASSIGN
  WORKER→BRAIN:HEARTBEAT

NERVOUS:* veya DECKENT→USER:NOTIFY kanalı yok.
```

### 8. Sprint 151 T-151-015 result
`.brain/archive/sprint-151-tasks/task-151-015.result`:
```json
{
  "filesChanged": ["src/nervous/detectors/build-failure-recurrence.ts", ..., "src/nervous/detector-registry.ts"],
  "linesAdded": 820,
  "selfAssessment": "DONE",
  "notes": "5 yeni nervous system detector oluşturuldu (6→11 toplam)"
}
```
Not: `filesChanged` listesinde `src/core/config-types.ts` **yok** — schema güncellenmemiş. `.deckent/config.json` **yok** — config güncellenmemiş. `src/nervous/observer.ts` **yok** — wire yapılmamış. Honest self-assessment açığı.

### 9. Sprint 151 Exit Gate #10 status (DIRECTIVES-sprint-151 line 540)
```
10. **10 nervous detector aktif** (5 → 10)
```
Retro'da bu gate DONE işaretli. Gerçekte: 11 implementasyon yazıldı, 0 aktif.

### 10. LoC breakdown
```
3405 LoC toplam nervous kod
  247  observer.ts
  191  detector-registry.ts
  157  proposer.ts
   55  runtime-scope-check.ts
 1342  11 detector dosyası
  ...  dispatcher/executor/history/authority/action-registry/decision-engine
```
Tamamı production runtime'da dormant.

---

## Kod Yazma Yasağı Uyumu

- ✅ `src/` altında hiçbir dosya değiştirilmedi
- ✅ Yazılan tek dosya: `docs/audits/sprint-152/T-152-012-nervous-11-detectors.md`
- ✅ Heartbeat dosyası `docker-152-012` worker ID ile güncellendi
- ✅ Plan dosyası (`.tasks/task-152-012.plan`) yazıldı
- ✅ Scope ihlali yok (`git diff --stat src/` = 0)
