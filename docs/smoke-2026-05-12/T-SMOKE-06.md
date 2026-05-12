# Nervous System Detector'ları

> Sprint Smoke 2026-05-12 — T-SMOKE-06
> Konu: Deckent Nervous System'in proaktif detector mimarisi ve 11 detector kataloğu.

---

## Genel Bakış

Deckent Nervous System (ADR-040), sprint döngüsü boyunca proaktif bir meta-orchestrator olarak çalışır. Brain'in reaktif değerlendirmesinin ötesine geçerek heartbeat kopukluğundan token maliyet spikelara kadar geniş bir yelpazeyi gerçek zamanlı izler. Mimari üç temel bileşenden oluşur: **NervousObserver**, **DetectorRegistry** ve **NervousDispatcher**.

---

## Mimari

### NervousObserver

`src/nervous/observer.ts` — 4 farklı event kaynağını tek bir `observe` event akışına birleştirir:

| Kaynak | Açıklama |
|--------|----------|
| `event-bus` | Sprint 145 EventBus üzerinden gelen `DeckentEvent`'ler |
| `filesystem` | `.tasks/`, `.brain/`, `DIRECTIVES.md`, `.deckent/` dizinlerini `fs.watch` ile izler |
| `cron` | Yapılandırılabilir periyodik tick (varsayılan: 15 saniye) |
| `sprint-lifecycle` | `SPRINT_PHASE_CHANGE`, `SPRINT_STARTED`, `SPRINT_COMPLETED` event'leri |

Observer bir event aldığında `DetectorRegistry.runAll(ctx)` çağırır. Her detector bağımsız çalışır; birinin başarısız olması diğerlerini etkilemez.

### DetectorRegistry

`src/nervous/detector-registry.ts` — 11 aktif detector'ı yönetir. Config'e göre hangi detector'ların etkin olduğunu belirler. `runAll()` metodunda tüm detector'lar sırayla çalıştırılır, exception'lar catch edilerek loglanır.

### NervousDispatcher

`src/nervous/dispatcher.ts` — DetectorResult'larını uygun kanallara iletir:

- **file**: Her zaman aktif — `.deckent/nervous-log.jsonl` audit logu
- **mcp**: `DECKENT_MCP_ACTIVE=1` env var varsa
- **cli**: `stdout.isTTY` ve MCP aktif değilse
- **broadcast**: `critical`/`emergency` severity → tüm aktif kanallara

Cross-channel dedup ile aynı notification ID'si yalnızca bir kez iletilir. MCP başarısız olursa CLI fallback devreye girer.

---

## Detector Kataloğu (11 Detector)

### 1. `stale-worker` — Stale Heartbeat Tespiti

**Amacı:** Worker'ların heartbeat dosyalarını izler; uzun süre güncelleme yapılmayan worker'ları tespit eder.

**Tetikleyici:** Cron tick veya filesystem event'i (IDLE ve CLEANUP fazları hariç).

**Aksiyon:** `WORKER_RESPAWN` — eşiği aşan her worker için yeniden spawn önerisi (severity: `warning`, risk: `medium`).

**Eşik:** Varsayılan 3 dakika (`threshold_ms` ile yapılandırılabilir).

---

### 2. `scope-collision` — Scope Çakışma Monitörü

**Amacı:** Birden fazla task'ın aynı dosyayı `filesWrite` kapsamına aldığı durumları tespit eder. Sprint 138 T-004'te implemente edilen `detectScopeCollisions()` fonksiyonunun proaktif versiyonudur.

**Tetikleyici:** Cron tick veya filesystem event'i — yalnızca PLAN ve EXECUTE fazlarında aktif.

**Aksiyon:** `SCOPE_COLLISION_REORDER` — çakışan task'ların yeniden sıralanması önerisi (severity: `warning`).

---

### 3. `debt-trend` — Teknik Borç Trendi Analizi

**Amacı:** Son N sprint'in ortalama debt rate'ini hesaplar; eğer trend belirli bir eşiği aşarsa uyarı üretir.

**Tetikleyici:** `SPRINT_RETRO_COMPLETE` event'i — Memory V2 MemoryStore üzerinden son sprint learning'leri okunur.

**Aksiyon:** `DEBT_REPRIORITIZE` — bir sonraki sprint için debt öncelik artırımı önerisi (severity: `warning`).

**Eşik:** Varsayılan %15 ortalama debt rate, 3 sprint penceresi.

---

### 4. `agent-routing` — Agent Routing Sağlığı

**Amacı:** İki tür routing sorununu tespit eder: (1) geçersiz format agent ID'leri (Sprint 146'da `string;` corruption), (2) tek bir agent'a aşırı yoğunlaşma.

**Tetikleyici:** `SPRINT_PHASE_CHANGE` newPhase=`EVALUATE`.

**Aksiyon:** `AGENT_PERFORMANCE_FLAG` (corrupt ID) veya `SKILL_ROUTING_ADJUST` (anomaly). Corrupt agent varsa `critical`, yalnızca anomaly varsa `warning`.

**Eşik:** %40+ yoğunlaşma anomaly sayılır.

---

### 5. `directives-protection` — DIRECTIVES.md Bütünlük Koruması

**Amacı:** Sprint 145'te yaşanan canlı olaydan (EXECUTE fazında DIRECTIVES.md'nin 463-byte template'e dönüşmesi) ders çıkarılarak geliştirildi. Dosya silme ve template geri dönüşünü tespit eder.

**Tetikleyici:** `DIRECTIVES.md`'yi hedef alan filesystem event'i — yalnızca EXECUTE ve FIX fazlarında aktif.

**Aksiyon:** `DIRECTIVES_WRITE` — görev JSON dosyalarından acil restore önerisi (severity: `emergency`, risk: `high`).

---

### 6. `task-mode-idle` — Task Mode Boşta Tespit

**Amacı:** Kullanıcı task modunda 5 dakikadan uzun süre işlem yapmadığında hatırlatma önerisi üretir.

**Tetikleyici:** Cron event'i — yalnızca `deckentStyle: 'task'` konfigürasyonunda aktif; sprint modunda tamamen devre dışı.

**Aksiyon:** `METRIC_EMIT` — check-in hatırlatması (severity: `info`, risk: `low`).

---

### 7. `build-failure-recurrence` — Süregelen Build Başarısızlığı

**Amacı:** Aynı dosyaların art arda N sprint boyunca build fail etmesini izler.

**Tetikleyici:** `SPRINT_PHASE_CHANGE` newPhase=`RETRO` — tüm `.result` dosyaları mevcut olduğunda.

**Aksiyon:** `BUILD_FAILURE_INVESTIGATE` — tekrar eden her dosya için araştırma önerisi (severity: `warning`).

**Eşik:** Varsayılan 3 ardışık sprint.

---

### 8. `token-spike` — Sprint Maliyet Spike Tespiti

**Amacı:** Sprint 140'ta yaşanan $42 maliyetli olaydan ilham alarak geliştirildi. Sprint'in tahmini USD maliyetini hesaplar ve eşiği aşarsa uyarır.

**Tetikleyici:** `SPRINT_PHASE_CHANGE` newPhase=`RETRO` — `.result` dosyalarındaki `tokenUsage` alanları toplanır.

**Aksiyon:** `COST_OVER_THRESHOLD` — eşiği 2x aşarsa `critical`, aksi takdirde `warning`.

**Eşik:** Varsayılan $50 (yapılandırılabilir). Model bazlı token birim fiyatları: opus $15/$75, sonnet $3/$15, haiku $0.25/$1.25 per 1M token.

---

### 9. `agent-routing-anomaly` — ADR-041 Anomaly Enforcer

**Amacı:** `agent-routing` detector'ından farklı olarak daha yüksek eşik (%80) ile PLAN fazında erken tespit sağlar ve ADR-041 (Agent Taxonomy) ihlalini açıkça bildirir.

**Tetikleyici:** `SPRINT_PHASE_CHANGE` newPhase=`SPAWN` veya `EVALUATE`.

**Aksiyon:** `SKILL_ROUTING_ADJUST` — ADR-041 ihlali bildirimi (severity: `warning`, risk: `high`).

**Eşik:** %80+ yoğunlaşma, minimum 5 task.

---

### 10. `scope-collision-rate` — Sprint Başına Çakışma Oranı

**Amacı:** Sprint boyunca biriken scope collision sayısının eşiği aşması durumunda planner refactor önerisi üretir.

**Tetikleyici:** `SCOPE_COLLISION` event'leri (gerçek zamanlı) veya `SPRINT_PHASE_CHANGE` newPhase=`EVALUATE`.

**Aksiyon:** `SCOPE_COLLISION_REORDER` — eşiği 2x aşarsa `critical`, aksi takdirde `warning`.

**Eşik:** Varsayılan 10 collision/sprint.

---

### 11. `notification-delivery-health` — Nervous Bridge Sağlığı

**Amacı:** Dispatcher'ın bildirim iletme başarısızlık oranını izler; eşik aşıldığında "nervous bridge broken" uyarısı üretir.

**Tetikleyici:** Cron event'i (periyodik kontrol) veya `NOTIFICATION_DELIVERY` event'i.

**Aksiyon:** `NOTIFICATION_BRIDGE_REPAIR` — başarısızlık %80+ ise `critical`, aksi takdirde `warning`.

**Eşik:** %50 başarısızlık oranı, minimum 3 gönderim örneği.

---

## Özet Tablosu

| Detector | Tetikleyici | Severity | Aksiyon ID |
|----------|-------------|----------|------------|
| `stale-worker` | cron / filesystem | warning | WORKER_RESPAWN |
| `scope-collision` | cron / filesystem | warning | SCOPE_COLLISION_REORDER |
| `debt-trend` | SPRINT_RETRO_COMPLETE | warning | DEBT_REPRIORITIZE |
| `agent-routing` | EVALUATE phase | warning / critical | AGENT_PERFORMANCE_FLAG / SKILL_ROUTING_ADJUST |
| `directives-protection` | filesystem (DIRECTIVES.md) | emergency | DIRECTIVES_WRITE |
| `task-mode-idle` | cron (task mode) | info | METRIC_EMIT |
| `build-failure-recurrence` | RETRO phase | warning | BUILD_FAILURE_INVESTIGATE |
| `token-spike` | RETRO phase | warning / critical | COST_OVER_THRESHOLD |
| `agent-routing-anomaly` | SPAWN / EVALUATE | warning | SKILL_ROUTING_ADJUST |
| `scope-collision-rate` | SCOPE_COLLISION / EVALUATE | warning / critical | SCOPE_COLLISION_REORDER |
| `notification-delivery-health` | cron / NOTIFICATION_DELIVERY | warning / critical | NOTIFICATION_BRIDGE_REPAIR |

---

## Kaynak Dosyalar

- `src/nervous/observer.ts` — NervousObserver (Sprint 147 Task 4)
- `src/nervous/detector-registry.ts` — DetectorRegistry (Sprint 148 Task 8 + Sprint 151 Task 15)
- `src/nervous/dispatcher.ts` — NervousDispatcher (Sprint 147 Task 18)
- `src/nervous/detectors/*.ts` — Her detector için ayrı dosya
