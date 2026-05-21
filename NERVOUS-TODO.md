# Deckent Nervous System — Tam Kapsamlı Durum Analizi

**Tarih:** 2026-05-20
**Tipi:** Read-only audit raporu (kod değişikliği YOK)
**Kapsam:** Mimari, runtime wiring, test, doc, ADR uyumu

---

## Context

Kullanıcı sordu: "Deckent içinde nervous system nedir, ne işe yarar, nerede kullanılıyor, aktif mi atıl mı, doğru mu?". Bu rapor 3 paralel Explore agent (yapı / runtime / doc-test) bulgularını konsolide eder. **Hiçbir kod düzenlemesi yapılmaz** — sadece analiz.

---

## TL;DR — Tek Paragraf Hüküm

Nervous System = Deckent'in **proaktif meta-orkestratörü**, ADR-040 ile tanımlanan event-driven anomali tespit + karar + bildirim + uygulama pipeline'ı. Mimari **tam, sofistike ve test edilmiş** (~7K LoC core + 32 test dosyası + 3,600+ test satırı). **Runtime durumu yarı-bağlı:** üretim tarafı (`sprint-controller` event emit) wire'lı, tüketim tarafı (`NervousObserver` subscribe + `.start()`) **hiçbir caller tarafından instantiate edilmemiş**. Config default'u `enabled: false` (ADR-040 "opt-in start" tasarım kararı), ama Sprint 148'de planlanan aktivasyon **5 sprint geciktirildi, hâlâ yapılmadı**. MCP/CLI/Dashboard arayüzleri **stub-grade** (config R/W + history reading var, canlı pipeline'a bağlı değil). **Net etiket: BUILT BUT UNPLUGGED — Half-Wired Dormant.**

---

## 1. Nervous System Nedir? (Kavram)

Sprint runtime'ında anomali → karar → bildirim → eylem zincirini **insan müdahalesi olmadan veya kontrollü onayla** yöneten 6-adım pipeline:

```
Observer (4 source)
  ↓ ObserverEvent
DetectorRegistry.runAll() [12 detector parallel]
  ↓ DetectorResult[]
DecisionEngine.decide() [Authority Matrix lookup]
  ↓ DecisionOutput[]
Proposer.propose() [throttle + severity filter]
  ↓ NervousNotification | null
NervousDispatcher.dispatch() [MCP|CLI|file channels]
  ↓ DispatchResult
Executor.handle() [autonomous / suggest-timeout / approve]
  ↓ ExecutionRecord
NervousHistory.append() [JSONL audit + undo]
```

**Loop tetikleyici:** `cron tick` (15s default) **veya** filesystem change. Sprint lifecycle event'leri (SPAWN/EXECUTE/FINALIZE phase change) observer'a gelmesi GEREKİR ama gelmiyor (aşağıda detay).

**Tasarım amacı (ADR-040):** Sprint 145-146 retrolarındaki "reactive bug-finding" sorununa karşı — Brain/Auditor pipeline'ı bug'lar cascade olmadan önce **proaktif** tespit etmeli.

---

## 2. Mimari Envanteri (Built — Tam)

### 2.1 Core Modüller (`src/nervous/`)

| Modül | LoC | Rol |
|-------|-----|-----|
| `observer.ts` | 247 | 4-kaynak unified event pipeline (event-bus, filesystem, cron, sprint-lifecycle) |
| `detector-registry.ts` | 202 | 12 detector init + paralel orkestrasyonu |
| `dispatcher.ts` | 344 | 3-channel routing (MCP/CLI/file) + cross-channel dedup |
| `decision-engine.ts` | 116 | DetectorResult + Authority Matrix → policy resolution |
| `executor.ts` | 299 | 3-mod handler (autonomous / suggest-timeout / approve) + pendingApprovals Map |
| `proposer.ts` | 157 | Notification builder, throttle (5min groupKey), severity filter |
| `authority-matrix.ts` | 184 | 4 preset matrix + 5 safety-floor locked action |
| `history.ts` | 142 | JSONL audit trail, append-only, undo via compensation, retention prune |
| `action-registry.ts` | 328 | 30 action katalog (low/med/high/safety-floor) |
| `runtime-scope-check.ts` | 55 | Brain-scope enforcement (ADR-037 RBAC bağı) |

**Toplam core:** ~2,074 LoC. **Detector kodu:** ~1,502 LoC. **Genel:** ~7K LoC nervous-spesifik.

### 2.2 12 Detector Kataloğu

| Detector | Tetikleyici | Risk | Suggested Action | Config Default |
|----------|-------------|------|------------------|----------------|
| **stale-worker** | Heartbeat 3min+ stale | medium | WORKER_RESPAWN | enabled=true |
| **scope-collision** | Task scope overlap detect | high | SCOPE_ISOLATION_ENFORCE | enabled=true |
| **debt-trend** | Technical debt rate anomaly | medium | DEBT_REVIEW_TRIGGER | enabled=true |
| **agent-routing** | Agent latency anomaly | medium | AGENT_REBALANCE | enabled=true |
| **directives-protection** | Mid-sprint DIRECTIVES.md değişimi | critical | DIRECTIVE_ROLLBACK_SUGGEST | enabled=true |
| **task-mode-idle** | Task/sprint idle > threshold | warning | TASK_RESUME_SUGGEST | enabled=false |
| **build-failure-recurrence** | Build fail 3+ in 24h | high | BUILD_PAUSE_SUGGEST | enabled=false |
| **token-spike** | LLM cost spike (5min rolling) | high | TOKEN_RATE_LIMIT | enabled=false |
| **agent-routing-anomaly** | Agent error rate anomaly | critical | AGENT_CIRCUIT_BREAK | enabled=false |
| **scope-collision-rate** | Collision frequency trend | medium | SCOPE_AUDIT_TRIGGER | enabled=false |
| **notification-delivery-health** | MCP/CLI push fail rate | warning | DELIVERY_HEALTH_REPORT | enabled=false |
| **dead-event-stream** | Sprint events 10min+ silence + active worker | critical | DEAD_EVENT_CLEANUP | enabled=false (Sprint 165 `reserve_for` clear edildi ama flag false kaldı) |

### 2.3 Authority Matrix — 4 Preset

| Mode | low | medium | high |
|------|-----|--------|------|
| **strict** | suggest-30m | approve | approve |
| **balanced** *(default)* | autonomous | suggest-30m | approve |
| **autopilot** | autonomous | autonomous | suggest-5m |
| **full-auto** | autonomous | autonomous | autonomous |

**Safety floor (5 locked action, full-auto bile bypass edemez):** `KILL_LIVE_SPRINT`, `MANUAL_FILE_DELETE`, `COST_OVER_THRESHOLD`, `DESTRUCTIVE_GIT`, `ADR_DEPRECATE_ACCEPTED`.

### 2.4 Action Registry — 30 Eylem

- **🟢 Low Risk (8):** DEAD_EVENT_STREAM_CLEANUP, ORPHAN_TASK_ARCHIVE, LOG_ROTATION, CACHE_INVALIDATE, STALE_LOCK_RELEASE, IPC_DIR_CLEANUP, DEBT_TRENDING_REPORT, METRIC_EMIT
- **🟡 Medium Risk (11):** WORKER_RESPAWN, SCOPE_ISOLATION_ENFORCE, DEBT_REVIEW_TRIGGER, AGENT_REBALANCE, TASK_RESUME_SUGGEST, DIRECTIVE_ROLLBACK_SUGGEST, …
- **🔴 High Risk (6):** BUILD_PAUSE_SUGGEST, TOKEN_RATE_LIMIT, AGENT_CIRCUIT_BREAK, SCOPE_AUDIT_TRIGGER, …
- **🔒 Safety Floor (5):** yukarıdaki liste

---

## 3. Runtime Wiring — Yarı-Bağlı Detay

Bu **kritik kısım**. Agent 2 ve Agent 3 yüzeyde çelişiyor; gerçek durum şu:

### 3.1 Üretim Tarafı (Producer) — ✅ Wired

`src/orchestra/sprint-controller.ts:86` ve sprint-lifecycle.ts içinden EventBus'a şu event'ler **gerçekten emit ediliyor**:
- `SPRINT_STARTED`
- `SPRINT_PHASE_CHANGE`
- `SPRINT_COMPLETED`
- (Worker lifecycle hook'ları)

Yani **Brain runtime'ı nervous için gereken event'leri üretiyor**. Bu Agent 3'ün "hook wired" dediği şey.

### 3.2 Tüketim Tarafı (Consumer) — ❌ Not Wired

| Wire Noktası | Durum | Kanıt |
|--------------|-------|-------|
| `new NervousObserver()` instantiation | **HİÇBİR YERDE YOK** | `grep "new NervousObserver"` → sadece doc örnekleri / test dosyaları |
| `observer.start()` çağrısı | **YOK** | sprint-controller / sprint-phases / sprint-lifecycle / brain'de yok |
| `observer.subscribeEventBus()` | **YOK** | tanımlı (`observer.ts:173`) ama hiç çağrılmamış |
| Phase-based activation (örn. SPAWN'da başlat) | **YOK** | "if config.nervous.enabled then observer.start()" pattern hiçbir runner'da yok |
| DetectorRegistry constructor invocation | **YOK** | detectorConfig injection point yok |
| Active sprint sırasında detector tick | **HİÇBİR ZAMAN OLMAZ** | observer asla yaşamadığı için |

**Sonuç:** Event bus boş alıcılı bir hoparlöre konuşuyor — event'ler emit ediliyor ama hiçbir dinleyici subscribe etmiyor.

### 3.3 MCP/CLI/API/Dashboard Exposure

| Arayüz | Durum | Notu |
|--------|-------|------|
| MCP: `deckent_nervous_subscribe` (`mcp/tools/nervous.ts:54`) | **Stub** | In-memory subscriber Map (process-scoped); canlı event stream'e bağlı değil |
| MCP: `deckent_nervous_accept/reject` (`:84,135`) | **Stub** | ID validation + history lookup; executor wiring yok |
| MCP: `deckent_nervous_status` (`:179`) | **Yarı-Live** | History + config okur; canlı detector state yok (çünkü detector yaşamıyor) |
| MCP: `deckent_nervous_config` (`:233`) | **✅ LIVE** | Config preset/override R/W çalışıyor (config dosyasına yazıyor) |
| HTTP API `/api/nervous/*` | **YOK** | Endpoint bulunmadı |
| CLI `deckent nervous` | **Yarı-Live** | History dosyasından okur (geçmiş yok ki — pipeline koşmadığı için boş) |
| Dashboard `NervousPage.tsx` | **YOK** | Sayfa mevcut değil; `ChatPage`'de `source="nervous"` referansı boşa düşüyor |

### 3.4 Config Exposure — Tam Şema, Default Off

- **Config key:** `nervous_system` (`src/core/config.ts:638`)
- **Default state:** `enabled: false` (`:639`)
- **Şema:** 11+ field — detector enabled flags, throttleWindowMs, severityMin, authority mode, action overrides, safety floor
- **Aktif okuyucu:** `loadNervousConfig()` sadece `mcp/tools/nervous.ts:16`'da, runtime activation check'i kimse yapmıyor

**Sonuç:** `enabled: false` blokajı **anlamsız** — observer instantiate edilmediği için flag fark etmiyor.

### 3.5 Atılkanıtları

| Kanıt | Konum | Yorum |
|-------|-------|-------|
| İlk commit | `772bba33` (Sprint 147, 2026-04-20) | Core architecture inşa edildi |
| Detector genişleme | `d0f3bff0` (Sprint 151) | 5 → 11 detector (+6 yeni) |
| Bug W (dead_event_stream) | `563f666a` (Sprint 165 T4) | Detector kodu temizlendi, `reserve_for` clear edildi, **config flag hâlâ false** |
| Son nervous commit | `563f666a` (2026-05-04, ~16 gün önce) | Wiring işine dönülmedi |
| `reserve_for: 'sprint-148'` pattern | `config.ts:667-671` | Planned-but-postponed kanıtı |
| TODO/FIXME yorumları | `observer.ts` içinde **YOK** | Kod temiz, ancak activation scaffolding'i yok |

---

## 4. ADR-040 Vaadi vs Teslimat

**ADR-040:** Nervous System Architecture — Proactive Meta-Orchestrator (Sprint 147, accepted)

| Vaat | Durum | Not |
|------|-------|-----|
| 5 MVP detector | ✅ Aşıldı (12 teslim) | StaleWorker / ScopeCollision / DebtTrend / AgentRouting / DirectivesProtection + 7 ek |
| Observer 4-kaynak | ✅ Teslim | event-bus, FS, cron, sprint-lifecycle |
| Action registry | ✅ Aşıldı | 30 action, 4 risk kategorisi |
| Authority matrix 4 preset | ✅ Teslim | strict / balanced / autopilot / full-auto |
| Safety floor 5 action | ✅ Teslim | KILL_LIVE_SPRINT vb. |
| History JSONL + undo | ✅ Teslim | Compensation pattern |
| MCP integration | ⚠️ Stub seviyesi | 5 tool kayıtlı ama 4'ü stub |
| **enabled=false start (opt-in)** | ✅ Tasarım gereği | ADR-040 Consequences'da yazıyor |
| **Sprint 148 activation** | ❌ Yapılmadı | 28+ sprint geçti |
| **Sprint 149 documentation sprint** | ❌ Kısmi | User guide hâlâ yok |
| FS watcher CPU ≤%1 baseline | ❓ Ölçülemedi | Pipeline koşmadığı için telemetri yok |

**Promised vs Delivered Gap:** Vaadin **statik (kod) kısmı %120 teslim** (MVP'yi aştı). Vaadin **dinamik (runtime) kısmı %0 teslim**.

---

## 5. Test ve Doküman Durumu

### 5.1 Test Coverage

| Katman | Test Dosya | Test Satır | Kapsam |
|--------|-----------|-----------|--------|
| Core modüller | 11 | ~317 | action-registry, authority-matrix, decision-engine, dispatcher, executor, history, observer, proposer, runtime-scope, dead-event-stream, stale-md-detector |
| Detector'lar | 20 | ~1100+ | 10 detector × 1-3 dosya |
| Integration | 5 | ~1399 | observer→detector, detector→decision, dispatcher E2E, proposer→executor, Sprint-146 regression |
| Cross-layer | 13 | ~800 | MCP tools E2E, CLI commands, config schema, sprint-controller hook, memory integration, i18n parity |
| **Toplam** | **32** | **~3,600+** | Tam pipeline + detector variants + regression |

**Durum:** `.skip` / `.only` yok, TODO yok, hepsi PASS.
**Garip nokta:** Pipeline runtime'da koşmazken testler tüm akışı kapsıyor — yani testler **gerçekten test ediyor** ama prod'da **kullanılmıyor**. Bu çok yaygın bir "shelf-ware" pattern'i.

### 5.2 Doküman Durumu

| Doc | Durum |
|-----|-------|
| ADR-040 (primary) | ✅ Tam, 137 satır, Consequences dahil |
| `docs/reference/cli.md`, `config.md`, `mcp-tools.md` | ⚠️ Kısmi bahis |
| `docs/guide/nervous-system.md` veya `nervous-overview.md` | ❌ YOK |
| `docs/reference/api-surface.md` | ✅ 11-field nervous config schema dokümante |
| README | ✅ Core feature olarak listelenmiş |
| DECKENT.md | ✅ 3 bahis, MCP tools dahil |
| Cross-ADR ref'ler | ✅ ADR-060 (Self-Awareness), ADR-047 (Manual Dispatch) bahsediyor |

**Eksik:** Kullanıcı odaklı "Nervous System'i nasıl açarım, hangi detector ne yapar, authority mode'ları nasıl seçerim" rehberi. Sprint 149 doc sprint hedefliydi, yapılmadı.

### 5.3 Sprint Memory Trace

- **Sprint 147:** ADR-040 yazıldı + 22 task ile core inşa edildi
- **Sprint 148:** Activation planlandı, **yapılmadı**
- **Sprint 151:** Detector genişleme (5→11)
- **Sprint 156:** ADR-060 self-awareness propagation nervous'a ref verdi
- **Sprint 165 (Bug W, T4):** dead_event_stream detector kodu temizlendi (`reserve_for: 'sprint-148'` clear), ama config flag false kaldı — yarım aktivasyon
- **Sprint 167:** Read-only audit (T3) nervous system'i "ADR-compliant" işaretledi (statik uyum, runtime değil)
- **Sprint 172:** Sprint-controller EventBus hook'unun mevcut olduğu doğrulandı; nervous'un opt-in olduğu reconfirm edildi
- **Memory note:** `deckent-dev` self-modifying sprintlerini ADR-047 (Manuel Subagent Dispatch) ile yönetiyor, autonomous nervous execution kullanmıyor

---

## 6. Critical Files & Line References (Kanıt Haritası)

Bir sonraki konuşmada hızlı navigasyon için:

| Konu | Dosya | Satır |
|------|-------|-------|
| NervousObserver class | `src/nervous/observer.ts` | 77 |
| subscribeEventBus (asla çağrılmıyor) | `src/nervous/observer.ts` | 173 |
| DetectorRegistry constructor | `src/nervous/detector-registry.ts` | 99-202 |
| DecisionEngine.decide | `src/nervous/decision-engine.ts` | 19-79 |
| Authority Matrix preset'leri | `src/nervous/authority-matrix.ts` | — |
| 30-action registry | `src/nervous/action-registry.ts` | 21-328 |
| 3-channel dispatch | `src/nervous/dispatcher.ts` | 61-150+ |
| Executor pendingApprovals | `src/nervous/executor.ts` | 44-150+ |
| History JSONL append-only | `src/nervous/history.ts` | 20-142 |
| Runtime scope check (RBAC) | `src/nervous/runtime-scope-check.ts` | 16-55 |
| Type definitions | `src/core/nervous-types.ts` | 1-150+ |
| Config default | `src/core/config.ts` | 638-674 |
| Sprint event emit (üretim tarafı) | `src/orchestra/sprint-controller.ts` | 86-87 |
| MCP tool stub'ları | `src/mcp/tools/nervous.ts` | 54, 84, 135, 179, 233 |
| ADR-040 belgesi | `docs/adr/040-nervous-system-architecture.md` | full file |

---

## 7. Doğru Mu? — Tasarım Kalitesi Hükmü

Kod yüksek kalitede:
- ✅ **Separation of concerns:** Observer/Detector/Decision/Proposer/Dispatcher/Executor/History net bölünmüş
- ✅ **Event-driven:** Tight coupling yok, her modül kendi sorumluluğunda
- ✅ **Throttle + dedup + circuit-breaker pattern'leri:** Production-grade
- ✅ **Authority Matrix:** Hassas eylemler için 4-seviye approval, safety floor
- ✅ **Append-only history + undo:** Audit + compensation pattern
- ✅ **RBAC entegrasyonu:** ADR-037 ile uyumlu (`runtime-scope-check`)
- ✅ **Test coverage:** Tam pipeline kapsanmış

Tasarım sorunu **yok**. Tek sorun: **bağlanmamış**.

---

## 8. Net Sonuç — Aktif mi Atıl mı?

**Kesin etiket: DORMANT — Half-Wired Built-Not-Plugged**

- Statik (kod + test + ADR + schema): **%100+ teslim**
- Dinamik (instantiation + canlı pipeline): **%0**
- Yarım-bağlı tek nokta: sprint-controller event emit ediyor (üretim) ama observer dinlemiyor (tüketim)
- Config flag `enabled: false` default ama bu **bloker değil** — observer instantiate edilmediği için flag etkisiz
- ADR-040 "enabled=false start" diyor ama Sprint 148 aktivasyonu yapılmadı; 28+ sprint geçti

**Kullanıcının düzeyinde gözlem:** `deckent_nervous_*` MCP tool'larını çağırırsan **stub yanıt** alırsın (config R/W çalışır, ama "subscribe" bir şey döndürmez çünkü hiç event akışı yok; "status" history dosyasından okur ki o da boştur).

**Repo dışına çıkmamış paralel durum:** Deckent şu an `ADR-047` (Manuel Subagent Dispatch) ile orkestre oluyor — yani nervous'un yerini Brain'in manuel karar verme döngüsü dolduruyor. Bu **tasarım gereği değil**, aktivasyonun ertelenmesinin sonucu.

---

## 9. Verification — Bulguları Nasıl Doğrularsın

Bu raporu kendi başına doğrulamak istersen:

```bash
# 1. Observer instantiation kontrolü (sıfır beklenir)
grep -rn "new NervousObserver" src/ --include="*.ts" | grep -v "test\|spec"

# 2. observer.start() çağrısı (sıfır beklenir)
grep -rn "observer\.start\|NervousObserver().*start" src/ --include="*.ts"

# 3. subscribeEventBus çağrısı (sıfır beklenir)
grep -rn "subscribeEventBus" src/ --include="*.ts" | grep -v "observer.ts\|test"

# 4. Test pass durumu (32 dosya yeşil beklenir)
npx vitest run tests/nervous

# 5. Config flag durumu
node -e "console.log(JSON.stringify(require('./dist/core/config.js').DEFAULT_CONFIG.nervous_system, null, 2))"

# 6. ADR-040 başlığı ve durumu
grep -A 5 "^# ADR-040" docs/adr/040-*.md

# 7. memory.db'de nervous entry'leri
sqlite3 .brain/memory.db "SELECT id, title, status FROM entries WHERE title LIKE '%Nervous%' OR id='adr-040'"

# 8. MCP nervous tool'larının stub durumu
grep -A 3 "deckent_nervous_subscribe\|deckent_nervous_status" src/mcp/tools/nervous.ts | head -30
```

Beklenen sonuç: 1-3 sıfır match (observer hiçbir yerde wire'lı değil), 4 yeşil (testler PASS), 5 `enabled: false`, 6 "accepted", 7 ADR-040 satırı çıkar, 8 stub-grade implementasyon görürsün.

---

## 10. Bu Analiz Ne Söylüyor (Yorumsuz Özet)

Nervous System Deckent'in **en sofistike ama en az kullanılan** alt sisteminden biri. Kod kalitesi yüksek, mimari production-grade, test'ler tam, ADR uyumu sağlam. **Tek eksik tek satır:** runtime'da bir yerde `new NervousObserver(...)` + `.start()` çağrısı + Brain config gate. Bu satır eklenmediği için 7K LoC + 3,600 test satırı **uyuyor**.

Sub-system'in mevcudiyeti Deckent'in vizyonunda mantıklı yer kaplıyor (proaktif meta-orkestrator → multi-persona Agentic OS için critical altyapı). Aktive edilmeden hangi detector'un gerçek dünyada doğru/yanlış pozitif yapacağı **bilinmiyor** — bu en büyük bilinmezlik.

Kullanıcı kararı: aktive et / olduğu gibi bırak / kaldır — bu raporun kapsamı dışında. Sadece **mevcut durum** sunuldu.

---

## 11. Aktivasyon Kontrollü Planı (Sadece Dokümantasyon, Kod Değişikliği YOK)

> **Önemli:** Bu bölüm, "atıl nervous'u aktive etmek için **somut olarak nereye ne eklenir**" sorusunun cevabıdır. Burada hiçbir kod yazılmaz — sadece "şu dosyaya şu satır, şu config gate, şu test" detayı dokümante edilir. Uygulama kararı kullanıcıya aittir.

### 11.1 Tek Satır İddiası — Doğrulama

`src/nervous/observer.ts:105-112` zaten **idempotent `start()` metoduna sahip** ve `subscribeEventBus()`, `startFilesystemWatchers()`, `startCronTick()` çağrıyor. `detector-registry.ts:99-170` constructor config-driven detector instantiate ediyor. **Yani altyapı tam — eksik olan: bir caller'ın `new NervousObserver(...)` + `.start()` yapması.**

Spesifik kanıtlar:
- `observer.ts:91-93` — `detectorConfig !== undefined ise` DetectorRegistry instantiate ediliyor; geçmezsen `null` kalır ve detector pipeline çalışmaz
- `observer.ts:152` — `if (this.detectorRegistry === null) return;` → detectorConfig'siz observer sadece raw event emit eder
- `mcp/tools/nervous.ts:111` — kod içinde **explicit TODO yorumu**: "In a full implementation, Executor.resolveApproval would be called. For now, we record the intent and verify the ID format."
- `config.ts:638-674` schema'da **DetectorConfig interface ile inconsistency** var: Sprint 151'de eklenen 6 detector (task_mode_idle, build_failure_recurrence, token_spike, agent_routing_anomaly, scope_collision_rate, notification_delivery_health) config default schema'da yok — sadece DetectorRegistry constructor'ında. Aktivasyon öncesi schema senkronizasyonu gerek.

### 11.2 Aktivasyon Yolu — Minimum İnvazif 6 Adım

Aşağıdaki sıralama Brain-only RBAC'ı (ADR-037) ihlal etmez, opt-in by config kalır, default-off semantiği bozmaz.

#### Step A: Nervous Bootstrap Modülü Yarat
**Yeni dosya:** `src/nervous/bootstrap.ts` (~80 LoC tahmini)
**Amaç:** Sprint controller'a temiz API — config'ten observer/dispatcher/executor zincirini kuran fabrika.

Export şu fonksiyonu:
```
export function createNervousSystemIfEnabled(
  config: DeckentConfig,
  projectRoot: string,
  sprintStateProvider: SprintStateProvider,
): { observer: NervousObserver, dispose: () => void } | null
```

İçinde:
- `if (!config.nervous_system?.enabled) return null;` (default off respect)
- Observer + DecisionEngine + Proposer + Dispatcher + Executor + History instantiate
- Observer'ın `'detection'` event'ini DecisionEngine→Proposer→Dispatcher→Executor pipeline'ına wire et
- `dispose()` — tüm cleanup'lar (observer.stop, executor pending timers clear)

**Neden yeni dosya?** Sprint controller'a tek import + tek çağrı eklenir. ADR-008 (Brain Merkezi Import) ile uyumlu.

#### Step B: SprintStateProvider Implementasyonu
**Mevcut dosya:** `src/orchestra/sprint-state-tracker.ts` (Sprint 161+ phase observability)
**Ekleme:** Şu fonksiyonu export et:
```
export function getSprintStateSnapshot(): SprintStateSnapshot
```
İçinde aktif sprint'in `sprintId`, `currentPhase`, `activeWorkers`, `totalTasks`, `completedTasks` döndür.

**Neden burası?** Sprint state tracker zaten Sprint 161-163'te observability için yazıldı — observer'ın ihtiyacı bu.

#### Step C: Action Handler Implementasyonu
**Yeni dosya:** `src/nervous/action-handlers.ts` (~150 LoC tahmini)
**Amaç:** Executor.handle callback'i — her action ID için gerçek operasyon.

İçinde her action için handler:
- WORKER_RESPAWN → spawn-backend respawn
- ORPHAN_TASK_ARCHIVE → archive-orphans helper
- STALE_LOCK_RELEASE → file-lock release
- DEAD_EVENT_STREAM_CLEANUP → event-bus prune
- vb.

**Aşamalı yaklaşım:** İlk turda sadece 5 MVP detector'un suggested action'ları için handler yaz (8 action). Diğer 22 action stub kalsın, `{ outcome: 'unimplemented' }` döndürsün.

#### Step D: Sprint Controller Wire
**Mevcut dosya:** `src/orchestra/sprint-controller.ts`
**Ekleme noktası:** `runSprint()` veya `runSprintLifecycle()` fonksiyonunun başında — sprint başlangıç anı (yaklaşık SPAWN phase öncesi)

```
const nervous = createNervousSystemIfEnabled(config, projectRoot, getSprintStateSnapshot);
try {
  // ... mevcut sprint logic ...
} finally {
  nervous?.dispose();
}
```

**Neden buraya?** Sprint scope'unda yaşar, sprint biterken otomatik temizlenir. Hard wire değil — `if (!enabled)` early return ile null kalır.

#### Step E: MCP Tool Stub'larını Executor'a Bağla
**Mevcut dosya:** `src/mcp/tools/nervous.ts`
**Değişiklik:** 
- `accept` / `reject` handler'larında: Eğer nervous system o anda aktif sprint'te koşuyorsa, `Executor.resolveApproval(id, 'accept'|'reject')` çağır
- Aktif değilse mevcut "stub history-only" davranışı korunsun (backward compat)

**Çıkmaz nokta:** MCP tool process scope nervous executor instance'a nasıl erişir? Üç seçenek:
1. Global singleton (anti-pattern ama hızlı)
2. IPC üzerinden (`.deckent/nervous-ipc/*.json` queue, dispatcher orada da yazıyor zaten)
3. HTTP API endpoint (`/api/nervous/resolve` — sunucu çalışıyorsa)

**Önerilen:** Seçenek 2 (IPC queue) — process boundary'i temiz, mevcut dispatcher file channel ile uyumlu, ek altyapı yok.

#### Step F: Config Schema Senkronizasyonu
**Mevcut dosya:** `src/core/config.ts:638-674` + `src/core/types.ts` (config types)
**Değişiklik:**
- 6 eksik detector'u (task_mode_idle, build_failure_recurrence, token_spike, agent_routing_anomaly, scope_collision_rate, notification_delivery_health) default schema'ya ekle, hepsi `enabled: false`
- `dead_event_stream` `reserve_for` field'ını temizle (Sprint 165'te zaten clear'lanmış kanıt vardı)
- ZodSchema validation güncellemesi (config parsing)

**Risk:** Config migration — mevcut `.deckent/config.json` dosyaları eski schema'da olabilir. Backward-compat: eksik key'ler default'tan fold edilir (zaten `loadConfig` deep merge yapıyor — kırılma yok).

### 11.3 Aşamalı Aktivasyon Stratejisi (Smoke → Pilot → GA)

#### Faz 1: Smoke Aktivasyonu (1 Sprint)
- Yalnızca **3 düşük-risk detector** enabled: `stale-worker`, `dead-event-stream`, `directives-protection`
- Authority mode: `strict` (her şey approval gerektirir, autonomous yok)
- Severity threshold: `critical+` (info/warning emit edilmez)
- Hedef: Pipeline'ın production'da koşmasını gör, false-positive rate ölç
- Doğrulama: `.deckent/nervous-history.jsonl` boş değil + observer.start() log'u var

#### Faz 2: Pilot (3-5 Sprint)
- 5 MVP detector enabled (config schema default'taki gibi)
- Authority mode: `balanced` (low autonomous, med suggest-30m, high approve)
- 8 low-risk action için real handler (Step C'deki 8'lik liste)
- Diğer action'lar hâlâ stub
- Hedef: Detector precision/recall manuel ölçüm; gerçek anomalileri yakalıyor mu?

#### Faz 3: GA (10+ Sprint)
- 12 detector tamamı opt-in (kullanıcı `config.nervous_system.detectors.*.enabled` ile seçer)
- 30 action tamamı için handler
- `autopilot` ve `full-auto` mode'ları kullanılabilir (safety floor aynı)
- Dashboard NervousPage.tsx eklenir (opsiyonel, ayrı sprint)
- User guide `docs/guide/nervous-system.md` yazılır (Sprint 149'da vaad edilmişti)

### 11.4 Sprint Mapping Önerisi

Bu plan **Embedded Web Terminal sub-project #2 (self-security)** ile **doğal olarak çakışıyor** — DIRECTIVES.md'de #2 scope: "prompt/komut guard, audit timeline UI; ek planner state-hygiene defekti". Nervous'un `directives-protection` + `self-modifying-warner` + audit pipeline'ı bu hedef ile birebir aynı amaca hizmet ediyor.

**Önerilen sequencing:**
- **Sprint 176:** Step A + B + Step C'nin ilk 4 action handler'ı + Step F (config sync) + Faz 1 smoke
- **Sprint 177-178:** Step D wire + Step E IPC channel + Faz 2 pilot
- **Sprint 179:** Doc sprint (Sprint 149'un eski borcu) — user guide + ADR-040 update (status: accepted → realized)
- **Sprint 180+:** Faz 3 GA + dashboard sayfası

### 11.5 Test Stratejisi — Mevcut 32 Test Dosyasını Canlandır

Şu an `tests/nervous/*` PASS ama prod'da koşmuyor. Aktivasyon sonrası:
- **Unit testler:** Aynı kalır, mock observer ile koşar (zaten öyle)
- **Integration test EKLEME:** `tests/nervous/integration-runtime.test.ts` — gerçek `createNervousSystemIfEnabled()` çağrısı + fake sprint state + en az 1 detector trigger + dispatcher 'file' channel yazıyor mu doğrula
- **E2E test:** `tests/e2e/nervous-pipeline.test.ts` (mevcut) — şu an mock, gerçek sprint controller içinde wire'lı çağrı varsa update
- **Smoke (manuel):** `deckent start --debug-nervous` veya benzeri flag — Faz 1 sırasında ENV'ye `DECKENT_NERVOUS_DEBUG=1` setlenir, breadcrumb stdout'a düşer

### 11.6 Risk Analizi & Rollback

| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| FS watcher CPU >%1 (ADR-040 vaadi) | Düşük | Düşük | Faz 1'de telemetri ölç; eşik aşılırsa cronIntervalMs 15s → 60s |
| Detector false positive cascade | Orta | Orta | `strict` mode (Faz 1) + severity_min `critical+` filtreler |
| Autonomous action yanlış execute | Düşük (Faz 1'de imkansız — strict) | Yüksek | Safety floor 5 action her durumda approve; Faz 2'ye geçişte risk-tier hold |
| Sprint runtime regression | Düşük | Yüksek | `if (!enabled) return null` early gate — atıl durumda davranış aynen kalır |
| Test suite bozulması | Çok düşük | Düşük | Mevcut 32 test mock-based, runtime wire eklemesi onları etkilemez |
| Worker mode'da yanlış instantiate | İmkânsız | — | `observer.ts:90` `assertBrainScope()` zaten throw eder |

**Rollback:** `.deckent/config.json` → `"nervous_system": { "enabled": false }` setle veya komple key'i sil. Anında devre dışı. **Code rollback gerekmiyor** — gate config-based.

### 11.7 Aktivasyon Sonrası Doğrulama Komutları

Aktivasyondan sonra çalıştığını anlamak için:

```bash
# 1. Observer instantiated mı?
grep -rn "new NervousObserver" src/ --include="*.ts" | grep -v test
# (önceki 0 idi, şimdi en az 1 olmalı — bootstrap.ts veya sprint-controller'da)

# 2. Canlı sprint'te observer start log'u
deckent start --debug-nervous 2>&1 | grep -i "nervous\|observer"

# 3. History dosyası oluştu mu?
ls -la .deckent/nervous-history.jsonl
# (önceden yoktu veya boştu, şimdi event'ler dökülmeli)

# 4. MCP status check
deckent_nervous_status
# (totalRecords > 0, subscribers > 0 beklenir)

# 5. Detector aktif sayısı
deckent_nervous_status | jq '.recent | length'
# (Faz 1'de en az 1, Faz 2'de 3-5 beklenir)

# 6. Throttle çalışıyor mu (aynı event 2 kez emit edildi mi tek notification mı?)
wc -l .deckent/nervous-history.jsonl
# (sprint başına 5-50 satır beklenir, 1000+ ise throttle bozuk)
```

### 11.8 Doc/ADR Update'leri

Aktivasyonla birlikte güncellenmesi gereken belgeler:

| Belge | Güncelleme |
|-------|-----------|
| `docs/adr/040-nervous-system-architecture.md` | Sprint 148 vaadi `realized in Sprint 176` notu; "enabled=false start" tasarım gerekçesi korunur |
| `docs/guide/nervous-system.md` (YENİ) | User guide — Sprint 149 eski borcu |
| `docs/reference/cli.md` | `deckent nervous` komut bölümü canlı durumla güncelle |
| `docs/reference/config.md` | nervous_system schema (12 detector + 30 action listesi) |
| `DECKENT.md` | Nervous mention "proactive meta-orchestrator (ADR-040, runtime-active Sprint 176+)" |
| `memory.db` | ADR-040 entry status alanı update (eğer status field varsa) |

### 11.9 Bu Planın Kapsamı Dışında

Aşağıdaki konular bu planda **kasıtlı olarak yok**:
- Dashboard `NervousPage.tsx` UI — ayrı sprint, post-aktivasyon
- Voice notification (TTS) — ADR-040 vaadi değildi
- Auto-fetch loop (OpenHuman pattern) — daily-assistant persona feature, ayrı roadmap
- TokenJuice / compression middleware — ayrı sprint
- Multi-tenant nervous (her tenant'ın kendi observer'ı) — sub-project #3 enterprise iş

### 11.10 Kararsızlık Noktaları (Kullanıcı'ya Sorular)

Aktivasyona başlanırsa şunlar netleşmeli:

1. **IPC channel MCP→Executor için kabul edilir mi?** Yoksa global singleton tercihi mi?
2. **Faz 1 smoke beta lansman öncesi mi sonrası mı?** Şu an Sprint 175 just delivered + 1 Haziran beta yakın. Nervous Faz 1'i lansman öncesinde sıkıştırmak riskli olabilir; Sprint 176 (post-beta) doğal duruyor.
3. **Mevcut nervous testlerin tümünü canlı pipeline'la koşturmak ister misin** yoksa Faz 1'de sadece smoke yeterli mi?
4. **`deckent_style: 'task'` (Task Mode) ile entegrasyon**: Task Mode aktive olduğunda nervous detector'ları farklı davranmalı mı (örn. task-mode-idle daha agresif)?

Bunlar uygulama-zamanı kararlar — şimdi cevap vermek zorunda değilsin.
