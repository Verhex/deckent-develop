# nervous/ Audit — Sprint 171 Task 171-008

> **Audit kapsamı:** `src/nervous/**` (observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, runtime-scope-check, history, action-registry, detectors/) — toplam 22 dosya, 3.576 LoC.
>
> **Audit tipi:** salt-okur, char-level. Hiçbir kaynak/test/config dosyası değiştirilmedi. ADR-040 (Nervous System Architecture — Proactive Meta-Orchestrator) ile gerçek kod davranışı karşılaştırıldı; observer → executor zincirinin runtime'da fiilen kurulu olup olmadığı, ADR-037 RBAC enforcement'ın gerçekliği, 12 detector'ın çağrılma yolu ve history persistence doğruluğu denetlendi.

---

## 1. Bulgular (Findings)

### B1 — Observer → Executor zinciri runtime'da kurulmuyor (DEAD PIPELINE)

`src/nervous/observer.ts:77` (`NervousObserver`), `src/nervous/dispatcher.ts:61` (`NervousDispatcher`), `src/nervous/executor.ts:44` (`Executor`), `src/nervous/decision-engine.ts:19` (`DecisionEngine`), `src/nervous/proposer.ts:49` (`Proposer`) ve `src/nervous/detector-registry.ts:99` (`DetectorRegistry`) sınıflarının `new ...` ile somut örnek alındığı tek yer `tests/` ağacıdır. Üretim kod tabanı (`src/`) bu sınıfları hiçbir yerde başlatmaz. Yani ADR-040'ın iddia ettiği "Proactive Meta-Orchestrator" runtime'da AYAĞA KALKMAYAN bir mimaridir — sadece spec ile testlerin konuştuğu, prod kullanıcıya hiçbir şey yapmayan ölü bir döngüdür.

`src/orchestra/sprint-controller.ts:163-183` içindeki `emitSprintEvent()` her faz geçişinde `eventBus.emit('deckent-event', …)` çağırıyor, ancak `NervousObserver.subscribeEventBus()` çağrılmadığı için bu event'ler kimse tarafından dinlenmiyor. `sprint-controller.ts:168` yorumda "NervousObserver listens for these as 'sprint-lifecycle' source events" yazıyor; gerçekte hiçbir Observer dinlemiyor. Zincir kopuk, halka bile yok.

### B2 — MCP `deckent_nervous_accept` yarım implementasyon (NOT WIRED TO EXECUTOR)

`src/mcp/tools/nervous.ts:111-118` içindeki yorum birebir şöyle: *"In a full implementation, Executor.resolveApproval would be called. For now, we record the intent and verify the ID format."* MCP tool kullanıcının notification kabul etmesini sözde işliyor, ancak Executor'a hiçbir bağlantı yok — UUID regex kontrolü yapıp `accepted: true` JSON dönüyor. Aynı yarım iş `deckent_nervous_reject` (`src/mcp/tools/nervous.ts:135-177`) için de geçerli. Kullanıcı approve etse bile arka planda hiçbir eylem yürütülmez (zaten yürütecek Executor da hiçbir yerde yaratılmıyor — bkz. B1). Bu, kullanıcıya verilen sessiz bir yalan anlamına gelir.

### B3 — Detector'lar Action Registry'de var olmayan ID'ler öneriyor (SILENT DROP)

5 detector, `src/nervous/action-registry.ts` içindeki `ACTION_REGISTRY` listesinde TANIMSIZ action ID'leri öneriyor:

| Detector | Önerdiği ID | Registry'de var mı? |
|---|---|---|
| `src/nervous/detectors/dead-event-stream.ts:79` | `INVESTIGATE_STALL` | HAYIR |
| `src/nervous/detectors/dead-event-stream.ts:91` | `FORCE_EVALUATE` | HAYIR |
| `src/nervous/detectors/dead-event-stream.ts:97` | `KILL_WORKERS` | HAYIR (sadece `KILL_LIVE_SPRINT` var) |
| `src/nervous/detectors/build-failure-recurrence.ts:92` | `BUILD_FAILURE_INVESTIGATE` | HAYIR |
| `src/nervous/detectors/notification-delivery-health.ts:105` | `NOTIFICATION_BRIDGE_REPAIR` | HAYIR |

`src/nervous/decision-engine.ts:44-47` bilinmeyen ID'leri sessizce `continue` ile geçiyor: *"Unknown action — skip silently (detector might reference future actions)"*. Sonuç: bu beş detector'ın yarattığı `DetectorResult.suggestedActions` hiçbir zaman `NotificationAction`'a dönüşmüyor, hiçbir zaman kullanıcıya gösterilmiyor, hiçbir zaman audit log'a yazılmıyor. Hatta bazıları kritik (dead-event-stream `critical` severity ile üretir — yine de sessizce yutulur). Bu, "silent drop" kategorisinde, üretim hatasıdır.

### B4 — `DebtTrendAnalyzer` her detection'da yeni `MemoryStore` açıyor (CONNECTION LEAK / RACE)

`src/nervous/detectors/debt-trend.ts:38` her `detect()` çağrısında `new MemoryStore(dbPath)` ile yeni bir SQLite handle açıyor. `MemoryStore` instance'ı close edilmiyor (constructor sonrasında `.close()` çağrısı yok); `DetectorRegistry.runAll` her event için (cron her 15 sn, ayrıca her sprint-lifecycle event) yeniden çalışacağından canlı sprint boyunca onlarca handle açılır. better-sqlite3 senkron bir kütüphane — handle leak finalize fazına kadar bellekte kalır, ayrıca DB busy hatalarına yol açabilir. ADR-040 "proactive meta-orchestrator" idi ama bunun DB yaşam döngüsü hijyeni eksik.

### B5 — `DebtTrendAnalyzer.sprint_num` field varsayımı schema ile uyumsuz olabilir

`src/nervous/detectors/debt-trend.ts:45` `m.sprint_num >= minSprintNum` kullanıyor. Memory V2 schema'sında (`src/core/memory-types.ts`) `MemoryEntryV2` arayüzünde `sprint_num` alanı varsa hesaplama doğru, yoksa bu kayıt yanlış filtrelenir. Schema değişirse (örn. `sprint_num` `sprint_id`'den parse edilen geçici alan), detection sessizce başarısız olur. Ayrıca metadata.totalTasks ve metadata.debtCount alanlarının varlığına bel bağlanıyor (`debt-trend.ts:56-58`); bu alanlar memory entry'lerine yazıldı diye doğrulanan kanıt bu auditte bulunmadı — büyük olasılıkla soft-dead detector.

### B6 — `Executor` yetim sınıf (NEVER INSTANTIATED, NEVER WIRED)

`src/nervous/executor.ts:44` Executor sınıfı `handle()`, `resolveApproval()`, `shutdown()` metodları tanımlıyor; `pendingTimers` ve `pendingApprovals` Map'leri taşıyor. Ancak `src/` içinde hiçbir yer `new Executor(...)` çağrısı yapmıyor (yalnızca testler). Dolayısıyla `pendingApprovals` Map'ine yazan kimse yok, `resolveApproval` çağıracak entry point yok, `shutdown` ne zaman çağrılacağı tanımlı değil. Bu, B1'in alt-bulgusu — Executor `ActionHandler` arayüzü bekliyor ama dispatcher'dan Executor'a `ActionHandler` enjekte eden başlatma kodu yok.

### B7 — `authority-matrix.ts` ve `action-registry.ts` aynı isimde fonksiyon export ediyor (NAME COLLISION)

`src/nervous/authority-matrix.ts:182` `export function isSafetyFloorAction(actionId: string)` tanımlıyor; `src/nervous/action-registry.ts:326` da `export function isSafetyFloorAction(id: string)` tanımlıyor. İki ayrı modülde aynı isimde, neredeyse aynı işi yapan fonksiyon. Tüketici kod (`src/cli/commands/config-nervous.ts:15`) `action-registry` versiyonunu import ediyor; `authority-matrix` versiyonu ölü export. `authority-matrix.isSafetyFloorAction` `SAFETY_FLOOR` array'ini, `action-registry.isSafetyFloorAction` `SAFETY_FLOOR_IDS` Set'ini tarıyor — kapsamları farklı. Bir gün biri yanlış import edilirse semantik kayma olur.

### B8 — Ölü export'lar (DEAD EXPORTS)

`src/` ağacında dışarıdan kullanılmayan export'lar:

- `src/nervous/action-registry.ts:316` `getAction(id)` — `src/` içinde sıfır kullanıcı (testlerde var).
- `src/nervous/action-registry.ts:320` `getActionsByCategory(category)` — sıfır kullanıcı (test yok).
- `src/nervous/authority-matrix.ts:175` `getMatrixByMode(mode)` — sıfır kullanıcı (test yok).
- `src/nervous/decision-engine.ts:93` `isInQuietHours(...)` — `src/` içinde sıfır, sadece `tests/nervous/decision-engine.test.ts:12`.

Bu export'lar API yüzeyini kabartıyor, henüz tüketicisi olmayan iskelet kod.

### B9 — `DetectorRegistry` runAll içinde async kullanım yarı-pişmiş

`src/nervous/detector-registry.ts:177-191` `runAll` `Promise<DetectorResult[]>` dönüyor ama içinde `await detector.detect(...)` yok — `IDetector.detect` (line 86) zaten senkron tanımlı (`DetectorResult | null` döner, Promise değil). Sonuç: `runAll` aslında senkron iş yapıp Promise'a sarıyor. Bu çelişkili API — eğer ileride bazı detector'lar async (örn. memory store başlangıçta), arayüz buna izin vermiyor; eğer hepsi sync, runAll'un `async` olmasına gerek yok. Imza yarı-pişmiş.

### B10 — `Observer.emitObserve` `detectorRegistry.runAll` callback'i yutuyor

`src/nervous/observer.ts:162-168` runAll Promise'ını fire-and-forget yapıyor, hatasını yalnızca `console.error` ile yutuyor. Yutulan hatanın kullanıcı/audit kanalına gitmediği için detector çökmesi sessiz: bir detector throw ederse (registry içindeki try/catch yine yutuyor — line 185-188), Observer'a ulaşmıyor. Üst üste binmiş üç katmanlı silent swallow.

### B11 — `runtime-scope-check.ts` ESM içinde `require` kullanıyor (PROD RISK)

`src/nervous/runtime-scope-check.ts:42` `require('../orchestra/event-bus.js')` çağrısı var. ADR-001 + ADR-002 ESM + Node16 module resolution kullanır; `require` ESM ortamında çalışmaz (TypeScript `@typescript-eslint/no-require-imports` lint'i sustur eden satır içi yorum var). Yorum diyor ki: *"Synchronous import attempt via require-like pattern won't work in ESM."* — Yani yazar farkında ama yine de bırakmış. Bu çağrı her zaman `try/catch` içinde patlayacak (ESM'de `require` yok), kontrol akışı `process.stderr.write` fallback'ine düşecek. Ya satırı silmek ya da `await import(...)` ile async hale getirmek gerekir; aksi halde "event-bus üzerinden olay yayımlama" yolu fiilen yok.

### B12 — Dispatcher'ın `severity → eventName` eşleştirmesi tehlikeli yan etki yapar

`src/nervous/dispatcher.ts:315-324` `mapSeverityToEventName` kritik/emergency + action varsa `human-checkpoint-required` event'ini, warning'i `task-no-go` event'ini, info'yu `task-done` event'ini global NotifyDispatcher'a fırlatıyor. Bu eşleştirme NervousNotification semantiğini zorlama bir biçimde yeniden etiketliyor (örneğin "scope-collision warning" → `task-no-go` event) ve `notify(...)` çağrısı `sprintId ?? 'unknown'` ile (`dispatcher.ts:336`) global notification dispatcher'a gidiyor. Bu, kullanıcıya yanlış bağlamlı bildirim gönderme riski oluşturur — sprint ile alakası olmayan bir cron event'i "task-done" gibi görünür. `mapSeverityToEventName` semantik kararını detector'ın metadata.type'ı yerine sadece severity'ye dayandırarak bilgi kaybetiyor.

### B13 — Action Registry "30 eylem" iddia ediyor, fiilen 30 değil mi doğrula

`src/nervous/action-registry.ts:3` yorum diyor: *"30 eylem, 4 kategori (low/medium/high/safety-floor)"*. Görünür sayım: 8 low + 11 medium + 6 high + 5 safety-floor = 30. Kategorize sayım doğru. Ancak bu sayı sabit kod yorumu olarak yazılmış — `ACTION_REGISTRY.length` ile programatik karşılaştırılmıyor (test var mı bilinmiyor). DECKENT.md/CLAUDE.md kullanıcı dökümanlarına "30 action" yansımış mı, başka bir audit (Task 171-016 ADR-040 compliance) için sinyal — burada doğruluğu sayıca tespit edildi.

### B14 — `directives-protection.ts` filesystem watch payload alanına bağımlı (FRAGILE TRIGGER)

`src/nervous/detectors/directives-protection.ts:43` `ctx.event.payload.path?.toString().endsWith('DIRECTIVES.md')` ile path kontrolü. `Observer.startFilesystemWatchers` (observer.ts:200-204) `path: ${target}/${filename ?? ''}` üretiyor — filename null gelirse `'/'` sonlanır, DIRECTIVES.md test başarısız. Ayrıca recursive watch (`recursive: true`) tüm `.deckent/` alt değişikliklerini de tetikler, her tick'te tüm 12 detector çalıştırılır → CPU spike riski (Observer ölçek riski). Stale_heartbeat'in Sprint sürekli pattern olarak tekrar etmesi (memory'de "Active pattern: stale_heartbeat ×3") bu mimari yan etkilerle ilişkili olabilir.

### B15 — `NervousHistory.indexToMemory` opsiyonel ama caller yok

`src/nervous/history.ts:122-141` `indexToMemory(record, store)` ExecutionRecord'u Memory V2'ye yazıyor. Ancak `src/` içinde `indexToMemory` çağrısı sıfır. JSONL ve DB arasında auto-sync yok; history.append() çağrıldıktan sonra DB indeksleme manuel. Sonuç: `nervous-action` tipli memory entry'leri pratikte hiç oluşmaz, `deckent recall` ile nervous geçmişi sorgulanamaz. ADR-040 + Memory V2 entegrasyonu eksik.

### B16 — `NervousObserver.stop` bind edilmemiş listener kaldırmaya çalışıyor

`src/nervous/observer.ts:122` `eventBus.off('event', this.onEventBusEvent)` çağrısı, listener `subscribeEventBus`'ta line 174'te `eventBus.on('event', this.onEventBusEvent)` ile eklenmiş. `onEventBusEvent` `readonly` arrow function olduğu için bind sorunu yok (line 181). Doğru çalışıyor görünüyor ama EventBus 'event' kanal adı `sprint-controller.ts:175`'te `eventBus.emit('deckent-event', …)` ile yayılıyor — kanal adları uyumsuz! Observer "event" kanalını dinlerken sprint-controller "deckent-event" kanalına yayın yapıyor. Bu, B1 ile birleşince ikinci bir kopuk halka demek (Observer somut yaratılsa bile sprint-controller event'lerini almaz).

### B17 — Observer cron tick `unref()` çağrısı dashboard'da görünmez worker yaratıyor olabilir

`src/nervous/observer.ts:225-227` `cronTimer.unref()` ile timer process'i ayakta tutmuyor. Doğru karar (Brain process'i Observer yüzünden takılmasın). Ama bu, "Brain çalıştığında Observer'ı kim ayakta tutuyor?" sorusunu açıyor — yine B1 ile aynı kök: yaratılmadığı için ayakta da değil.

### B18 — `Proposer.passesSeverityFilter` `config` cast'i tip-güvensiz

`src/nervous/proposer.ts:131-135` `(this.config as unknown as Record<string, unknown>).severityMin as Severity | undefined` cast'i `NervousSystemConfig` arayüzünde `severityMin` tanımlı OLMASA bile çalışıyor. Yani `severityMin` ad değişikliği veya yazım hatası fark edilmeden geçer. Bu, tip-güvenlik kaçağı (Sprint 171 Task 171-019 type-safety audit'in ana hedef pattern'i).

### B19 — `Proposer.recentGroups` Map limitsiz büyüyor (MEMORY LEAK RISK)

`src/nervous/proposer.ts:50` `recentGroups` Map'i throttle anahtarlarını sınırsız depoluyor. `clearThrottleState()` (line 118) var ama kimse çağırmıyor (`src/` içinde tek caller yok — yalnızca test). Uzun süre çalışan Brain process'te recentGroups şişebilir. ADR-040 long-running'i hedeflediği için bu önemli.

### B20 — `Executor.handleAction` `default:` dalı `throw` ile çıkıyor → policy çökmesi domino

`src/nervous/executor.ts:132-134` bilinmeyen policy değeri için `throw new Error('Unknown policy: ...')`. Executor.handle() (`executor.ts:62-69`) for-of içinde `await this.handleAction(...)` çağırıyor; throw `handle` Promise'ını reject eder, sonraki action'lar işlenmeden iptal olur. Tek bir bozuk action tüm bildirimi düşürür. Daha doğrusu: bilinmeyen policy → ExecutionRecord `outcome: 'failure'` üret, history'ye düş, sonraki action'a geç.

### B21 — `Executor.handleSuggestTimeout` aynı notification.id ile race condition

`src/nervous/executor.ts:198-202` `pendingTimers.set(notification.id, timer)` ve line 201 `pendingApprovals.set(notification.id, …)`. Eğer aynı `notification.id` ile iki kez handle çağrılırsa (örn. retry path), eski timer + approval rezolvasyonu sessizce overwrite olur, eski Promise asla resolve olmaz → goroutine leak. Notification ID'leri randomUUID ile üretildiğinden teorik olarak unique, ama defensive guard yok.

### B22 — `History.prune` zaman damgası parse hatasını yutuyor

`src/nervous/history.ts:97` `new Date(r.executedAt).getTime() >= cutoff`. Bozuk timestamp'li bir kayıt için `getTime()` NaN döner; `NaN >= cutoff` her zaman false → kayıt retain edilmez (silinir). Audit trail'in bozuk bir satır yüzünden kaybolması (append-only iddia ediliyor ama prune toplu yazıyor: line 102). Bozuk timestamp tespit edilmeli, ayrı bir bucket'a alınmalı.

### B23 — `runAll` performansı: synchronous detect zinciri 15s cron için bile pahalı

`src/nervous/detector-registry.ts:178-189` 12 detector senkron `detect()` çağrılarını sıralı koşturuyor. Her detector için `.tasks/*.json|*.result` disk okuma var (`agent-routing.ts`, `agent-routing-anomaly.ts`, `build-failure-recurrence.ts`, `scope-collision.ts`, `token-spike.ts`). 100+ task'lı bir sprintte cron tick başına 5+ detector × tüm task dosyaları → her 15 sn devasa I/O. Cache yok. Sprint 138 P0-2 boundary scan benzer pattern'de optimize edildi, burada o öğreneni yok.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| B1 | Observer→Executor zinciri runtime'da yok | **CRITICAL** | ADR-040'ın temel iddiası ("Proactive Meta-Orchestrator") fiilen yok; tüm nervous mimari ölü kod. OSS GA blocker — kullanıcıya "bizde proaktif yapay zeka var" gibi pazarlanmaması gerekir. |
| B2 | MCP nervous_accept/reject yarım | **CRITICAL** | Kullanıcı approve etse bile bir şey olmuyor. Yorumla itiraf edilmiş, üretim yalanı. OSS açılırsa kullanıcılar buna güvenirler. |
| B3 | Detector'lar registry'de yok action ID öneriyor | **HIGH** | 5 detector'ın çıkardığı kritik öneriler (dead-event-stream → "kill workers") sessizce yutuluyor. B1 nedeniyle pratik etkisi şu an sıfır, ama mimari "kalkar kalkmaz" maskelenmiş bug. |
| B4 | DebtTrendAnalyzer MemoryStore handle leak | **HIGH** | Brain long-running. Her cron tick yeni handle. SQLite "database is locked" hatası canlı sprint sırasında patlayabilir. |
| B11 | runtime-scope-check ESM'de require kullanıyor | **HIGH** | ESM ortamında require throw eder; emitViolationEvent her zaman fallback'e düşer. Halen `assertBrainScope` çalışıyor (throw kısmı sağlam) ama event yayını ölü kod. |
| B12 | severity→eventName tehlikeli yan etki | **HIGH** | "scope-collision warning" → `task-no-go` event olarak küresel notification kanalına çıkıyor. Bilgi kaybı + yanlış bağlam. |
| B5 | DebtTrendAnalyzer sprint_num/metadata varsayımı | **MEDIUM** | Memory V2 schema değişirse soft-dead. Test gerekli. |
| B6 | Executor yetim sınıf | **MEDIUM** | B1'in sonucu; kod kalitesi/gereksiz LoC. 299 LoC ölü. |
| B7 | isSafetyFloorAction çift export | **MEDIUM** | Adı çakışma, kapsamı farklı. Yanlış import semantik kayma yaratır. |
| B9 | runAll yarı-pişmiş async imzası | **MEDIUM** | API sözleşme tutarsızlığı; ileride async detector eklemek isteyen geliştirici tuzağa düşer. |
| B14 | directives-protection fragile trigger + CPU | **MEDIUM** | Stale heartbeat pattern'inin Sprint 169-171 boyunca tekrarlaması bu mimari yan etkilere işaret edebilir. |
| B15 | indexToMemory caller yok | **MEDIUM** | DB-first iddiası eksik; nervous history pratikte aramaya kapalı. |
| B16 | EventBus kanal adı uyumsuzluğu (event vs deckent-event) | **MEDIUM** | B1 düzeltilirse ikinci kör nokta açığa çıkar. |
| B19 | Proposer.recentGroups limitsiz Map | **MEDIUM** | Long-running brain'de bellek sızıntısı. |
| B20 | Executor handleAction throw → domino | **MEDIUM** | Tek bozuk action tüm notification'ı düşürür. |
| B21 | Executor pendingTimers race | **MEDIUM** | Defensive guard yokluğu. |
| B22 | History.prune NaN timestamp silimi | **MEDIUM** | Append-only iddiası ile çelişen veri kaybı. |
| B23 | runAll cron başına ağır I/O | **MEDIUM** | 100+ task'lı sprintte performans çöker. |
| B8 | Ölü export'lar | **LOW** | API yüzeyi şişkinliği; semantik problem değil. |
| B10 | emitObserve hata yutma | **LOW** | Audit görünürlük eksikliği. |
| B13 | "30 action" yorum-sabit | **LOW** | Drift olursa fark edilmez; programatik test yok. |
| B17 | unref() doğru karar ama Observer yaratan yok | **LOW** | B1'in alt notu, bağımsız aksiyon gerekmez. |
| B18 | Proposer severityMin cast tipsiz | **LOW** | tip-safety audit (Task 171-019) genel kapsamına gider. |

> **CRITICAL eşik:** B1 ve B2, deckent'in OSS GA'sından önce kapatılması gereken kullanıcı-yanıltıcı durumlar.

---

## 3. Kanıt (Evidence)

### B1 — Runtime instantiation grep

```bash
$ grep -rn "new NervousObserver\|new NervousDispatcher\|new Executor\|new DecisionEngine\|new Proposer\|new DetectorRegistry" src/ tests/ --include="*.ts"
# Sonuç (src/ ağacında): yalnızca yorumlar + observer.ts:92'de DetectorRegistry'nin Observer içinde yaratımı.
# Tüm `new NervousObserver`, `new NervousDispatcher`, `new Executor`, `new DecisionEngine`, `new Proposer` çağrıları tests/nervous/ altında.
```

`src/nervous/observer.ts:58` JSDoc'taki örnek `new NervousObserver('/path/to/project')` üretim kodunda KARŞILIK BULMAYAN bir bekleyen API'dır.

`src/orchestra/sprint-controller.ts:167-168`:

```ts
 * Always fires regardless of nervous system config — subscribers are optional.
 * NervousObserver listens for these as 'sprint-lifecycle' source events.
```

— Subscriber yok.

### B2 — MCP yarım accept

`src/mcp/tools/nervous.ts:106-118`:

```ts
const root = process.cwd();
const history = new NervousHistory(root);
const all = await history.readAll();
const exists = all.some(r => r.notificationId === id);

// In a full implementation, Executor.resolveApproval would be called.
// For now, we record the intent and verify the ID format.
if (!id.match(/^[a-f0-9-]{36}$/) && !id.startsWith('ns-')) {
  return { ... };
}
```

— Yorumla itiraf edilen "future work". `accepted: true` döndürürken Executor.resolveApproval ÇAĞRILMIYOR.

### B3 — Action ID drift grep

```bash
$ grep -hn "id: '" src/nervous/detectors/*.ts | grep -E "id: '[A-Z_]+"
105:          id: 'NOTIFICATION_BRIDGE_REPAIR',
79:          id: 'INVESTIGATE_STALL',
91:          id: 'FORCE_EVALUATE',
92:        id: 'BUILD_FAILURE_INVESTIGATE',
97:          id: 'KILL_WORKERS',
# (diğerleri registry'de var)

$ grep -hn "^    id: '" src/nervous/action-registry.ts
# 30 ID listesi — NOTIFICATION_BRIDGE_REPAIR, INVESTIGATE_STALL, FORCE_EVALUATE, BUILD_FAILURE_INVESTIGATE, KILL_WORKERS YOK.
```

`src/nervous/decision-engine.ts:44-47`:

```ts
const action = ACTION_BY_ID.get(suggested.id);
if (!action) {
  // Unknown action — skip silently (detector might reference future actions)
  continue;
}
```

— Silent drop confirmed.

### B4 — DebtTrendAnalyzer handle leak

`src/nervous/detectors/debt-trend.ts:37-39`:

```ts
const dbPath = `${ctx.projectRoot}/.brain/memory.db`;
const store = new MemoryStore(dbPath);
const allMemories = store.getByType('memory');
// store.close() ÇAĞRILMIYOR — return path'lerde de yok.
```

Her detect() çağrısında yeni handle. `detector-registry.ts:177-191` runAll her event için bu detector'ı çağırır → cron 15 sn × sprint süresi × handle = leak.

### B11 — ESM'de require

`src/nervous/runtime-scope-check.ts:41-49`:

```ts
try {
  // Synchronous import attempt via require-like pattern won't work in ESM.
  // Use a try/catch around the event-bus module — if already loaded, it's cached.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { eventBus } = require('../orchestra/event-bus.js') as { eventBus: { emit: (event: string, data: unknown) => void } };
  eventBus.emit('deckent-event', { ... });
} catch {
  process.stderr.write(`...`);
}
```

— ADR-001 + ADR-002 ESM tsconfig (`"module": "Node16"`). `require` yok; her zaman catch fallback'e düşer.

### B12 — Dispatcher yan etki

`src/nervous/dispatcher.ts:315-340`:

```ts
function mapSeverityToEventName(severity, hasActions): NotificationEventName {
  if (severity === 'critical' || severity === 'emergency') {
    return hasActions ? 'human-checkpoint-required' : 'task-no-go';
  }
  if (severity === 'warning') return 'task-no-go';
  return 'task-done';
}

function bridgeToUserNotify(notification): void {
  const eventName = mapSeverityToEventName(notification.severity, hasActions);
  void notify(eventName, notification.sprintId ?? 'unknown', ...);
}
```

— "scope-collision warning" detector çıktısı global `task-no-go` event'ine dönüşüp `sprintId: 'unknown'` ile global dispatcher'a gider; kullanıcıya yanlış bağlamlı bildirim çıkar.

### B7 — Çift `isSafetyFloorAction`

```bash
$ grep -rn "^export function isSafetyFloorAction" src/nervous/
src/nervous/authority-matrix.ts:182:export function isSafetyFloorAction(actionId: string): boolean {
src/nervous/action-registry.ts:326:export function isSafetyFloorAction(id: string): boolean {
```

Tek tüketici (`src/cli/commands/config-nervous.ts:15`) action-registry versiyonunu çekiyor.

### B16 — EventBus kanal uyumsuzluğu

`src/nervous/observer.ts:174`: `eventBus.on('event', this.onEventBusEvent);` ('event' kanalını dinliyor)
`src/orchestra/sprint-controller.ts:175`: `eventBus.emit('deckent-event', { type, ... });` ('deckent-event' kanalına yayıyor)
`src/nervous/runtime-scope-check.ts:43`: `eventBus.emit('deckent-event', { type: 'NERVOUS_SCOPE_VIOLATION', ... });` ('deckent-event' kanalı)

Observer 'event' kanalı dinliyor, herkes 'deckent-event' yayıyor — Observer yaratılsa bile sprint event'leri ona ulaşmaz.

### B15 — indexToMemory ölü

```bash
$ grep -rn "indexToMemory" src/ --include="*.ts"
src/nervous/history.ts:122:  indexToMemory(record: ExecutionRecord, store: MemoryStore): void {
# Hiçbir caller yok.
```

### B19 — Proposer.recentGroups limitsiz

`src/nervous/proposer.ts:50`: `private readonly recentGroups: Map<string, number> = new Map();`
Sadece set + get; pürüz/expire pruning yok.
`clearThrottleState()` (line 118) src/ içinde çağrılmıyor.

### B22 — prune NaN

`src/nervous/history.ts:96-101`:

```ts
const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
const retained = all.filter(r => new Date(r.executedAt).getTime() >= cutoff);
const prunedCount = all.length - retained.length;
```

— `new Date('bozuk').getTime()` NaN; `NaN >= cutoff` false → kayıt prune edilir.

---

## 4. Öneriler (Recommendations)

### CRITICAL (Sprint 172 OSS GA öncesi kapatılmalı)

1. **B1 — Pipeline'ı kur veya kaldır.** İki seçenek:
   - **(a) KUR**: `sprint-controller.ts` Brain başlangıcında `NervousObserver`, `DecisionEngine`, `Proposer`, `NervousDispatcher`, `NervousHistory`, `Executor` instantiate eden bir `initNervousSystem(config, projectRoot)` fonksiyonu (örn. `src/nervous/bootstrap.ts`); `observer.on('detection', …)` → `decisionEngine.decide` → `proposer.propose` → `dispatcher.dispatch` zincirini bir handler'da bağla; sprint-controller event'lerini doğru kanaldan (B16 fix: 'event' veya 'deckent-event' tek isim) yayınla. Spin-up nervous_system.enabled config flag'ine bağlı. Executor için `ActionHandler` factory'sini eylem-bazlı dispatch eden bir registry ile yaz (örn. ORPHAN_TASK_ARCHIVE handler `.tasks/` → `.deckent/archive/...`).
   - **(b) KALDIR**: 3.576 LoC + 22 dosya + 12 detector + 30 action registry tamamen sil. `tests/nervous/` dahil. CLI'dan `deckent nervous` ve MCP'den `deckent_nervous_*` tool'larını kaldır. DECKENT.md/IDENTITY.md'deki ADR-040 referansını "Nervous System (Sprint 147-151 design only — not implemented)" notuyla işaretle veya ADR-040 status'unu `deprecated` yap.
   - **Öneri:** Eğer Sprint 172 OSS GA tarihi sıkışıksa **(b) KALDIR** önerilir (yarım iddia/oversold pazarlama riskini ortadan kaldırır). Ek geliştirme süresi varsa **(a) KUR** + per-detector test + E2E observation drill.

2. **B2 — MCP accept/reject Executor'a bağla veya tool'u kaldır.** Eğer pipeline KUR yolu seçilirse: `deckent_nervous_accept` Executor.resolveApproval'ı çağırmalı, sonuç olarak ExecutionRecord history'ye düşmeli. Eğer KALDIR yolu seçilirse: `deckent_nervous_*` 5 tool'u kaldır.

### HIGH (Sprint 172-173 bekleyebilir, ama mimari borç)

3. **B3 — Action Registry'i detector ID'leri ile senkronla.** Şu 5 yeni action ekle (KUR yolu seçilirse): `INVESTIGATE_STALL` (high risk, reversible: false), `FORCE_EVALUATE` (medium, reversible: false), `KILL_WORKERS` (high, reversible: false, safety-floor + KILL_LIVE_SPRINT'e bağlı), `BUILD_FAILURE_INVESTIGATE` (medium, reversible: true), `NOTIFICATION_BRIDGE_REPAIR` (medium, reversible: false). Programatik test: `tests/nervous/action-id-consistency.test.ts` — her detector'ın `.suggestedActions.id`'sinin `ACTION_BY_ID` Map'inde olduğunu doğrulasın.

4. **B4 — DebtTrendAnalyzer MemoryStore singleton.** Constructor'da `private store: MemoryStore` enjekte et; her detect() yeni handle açmasın. DetectorRegistry MemoryStore'u sprint başında bir kez yaratıp tüm DB-bağımlı detector'lara enjekte etsin. Aynı pattern `agent-routing.ts`, `build-failure-recurrence.ts` gibi disk-okur detector'ları için cache + invalidation.

5. **B11 — runtime-scope-check `require`'u temizle.** İki seçenek: (i) `emitViolationEvent` fonksiyonunu sil — fallback `process.stderr.write` zaten yeterli; (ii) eventBus'u en üstte `import` et (cyclic değilse) ya da `async function emitViolationEvent` ile dinamik `await import(...)` kullan (ama assertBrainScope sync olmalı — bu yüzden (i) önerilir).

6. **B12 — severity→event mapping'i daha bilgi-koruyan yap.** `mapSeverityToEventName` yerine `mapDetectorToEventName(detectorId, severity, hasActions)` — örn. `directives-protection` → `human-checkpoint-required`, `dead-event-stream` → custom `nervous-stall`, vb. `notify(...)` çağrısına `notification.id` ile birlikte `metadata` da geçilmeli. `sprintId ?? 'unknown'` yerine `??` öncesinde nervous-history'den ilgili sprint'i çek.

### MEDIUM

7. **B5 — debt-trend metadata kontratını test et.** `tests/nervous/detectors/debt-trend-schema.test.ts` — gerçek `MemoryEntryV2` `sprint_num` alanının var olduğunu, metadata'nın `totalTasks`/`debtCount` taşıdığını doğrulasın. Yoksa: sprint-reporter'da bu alanların yazıldığından emin ol (orchestra audit Task 171-001/002).

8. **B6 — Executor.ts yetimini kaldır (KALDIR yolu) veya bootstrap'a ekle (KUR yolu).**

9. **B7 — `authority-matrix.isSafetyFloorAction`'u sil veya re-export et.** Tek versiyon kalsın (`action-registry`'deki) — DRY/single source.

10. **B9 — runAll imzasını netleştir.** Tüm detector'ları sync tut + `runAll` sync döndür ya da `IDetector.detect`'i `async DetectorResult | null` yap. Yarı-pişmiş kalmasın.

11. **B14 — directives-protection trigger pattern guard.** `event.payload.filename === 'DIRECTIVES.md'` ile path-suffix check yerine filename eşitliği kullan; recursive watch'ı `.deckent/` için kapat ya da `path.basename` ile filtre uygula.

12. **B15 — indexToMemory'i append'e bağla.** `NervousHistory.append`'i `indexToMemory`'i de çağıracak şekilde refactor; MemoryStore enjeksiyonu ile.

13. **B16 — EventBus kanal adı tek standartta.** Tüm yayıncılar `eventBus.emit('deckent-event', ...)`, tüm dinleyiciler `eventBus.on('deckent-event', ...)`. Constants olarak `EVENT_BUS_CHANNEL = 'deckent-event'` tek sabit.

14. **B19 — Proposer.recentGroups LRU veya TTL.** Map yerine LRU cache (max 1000 entry) veya periodic prune (throttleWindow + buffer).

15. **B20 — Executor.handleAction `default`'i throw değil failure record.** Bilinmeyen policy → ExecutionRecord `outcome: 'failure'`, error: `Unknown policy: ${policy}`, sonraki action'a devam.

16. **B21 — Executor pendingTimers duplicate guard.** `if (pendingTimers.has(notification.id)) { existing.resolve('rejected'); }` veya throw + log.

17. **B22 — History.prune NaN handling.** Bozuk timestamp'li kayıtlar `retained`'a alınsın (kaybetme), ayrı bir log mesajıyla işaretlensin.

18. **B23 — runAll I/O cache.** `.tasks/` snapshot bir cron'da bir okunsun, tüm detector'lar bu snapshot üzerinden çalışsın. Veya detector'ları paralel/Promise.all ile koştur.

### LOW

19. **B8 — Ölü export'ları sil.** `getAction`, `getActionsByCategory`, `getMatrixByMode`, `isInQuietHours` (test'te kullanılıyor olsa bile production code-path yoksa) `@deprecated`'le işaretle veya internal scope'a indir.

20. **B10 — Observer detector hata yutma'ya görünürlük ekle.** `console.error` yerine event-bus üzerinden `NERVOUS_DETECTOR_FAILURE` event emit et + nervous-history'ye yaz.

21. **B13 — "30 action" sayısı programatik test.** `tests/nervous/action-registry.test.ts` içinde `expect(ACTION_REGISTRY.length).toBe(30)` ve `expect(getActionsByCategory('safety-floor').length).toBe(5)`.

22. **B17 — `unref()` Brain'in lifecycle'ı kurulduktan sonra mantıklı.** Bağımsız aksiyon gerekmez (B1 çözülürse otomatik).

23. **B18 — Proposer config tip-safety.** `NervousSystemConfig` arayüzüne `severityMin?: Severity` ekle (varsa); cast'i kaldır.

### Eksik prosedürler (Operasyonel)

- **OSS sürümünde ADR-040 status'u:** `proposed`'dan `accepted`'a geçti (CLAUDE.md/summary.md listelemesi `accepted` gösteriyor) ama gerçek implementasyon eksik. Status mismatch → ADR governance ihlali. Sprint 171 Task 171-016 (ADR Compliance) ve Task 171-024 (docs-tree) ile birlikte ele alınmalı.
- **Test kapsamı:** `tests/nervous/` mevcut ama "kuru" — yani entegrasyon (Observer → Dispatcher → Executor → History → MemoryStore tam zincir) E2E testi YOK. KUR yolu seçilirse en az 1 E2E test (örn. `tests/e2e/nervous-cycle.test.ts`) yazılmalı.
- **Konfigürasyon dokümantasyonu:** `.deckent/config.json` `nervous_system` bölümünün şeması (`mode`, `enabled`, `detectors`, `quietHours`, `severityMin`, `throttleWindowMs`, `action_overrides`, `notifications.channels`) açık dokümante edilmemiş. Sprint 171 Task 171-024 docs-tree audit'ine eklenmesi gerekiyor.

---

## 5. Kapsam Haritası (Files Covered)

| Dosya | LoC | Okundu | Not |
|---|---|---|---|
| `src/nervous/observer.ts` | 247 | EVET | NervousObserver — runtime'da yaratılmıyor (B1). emitObserve detection event yutuyor (B10). EventBus kanalı 'event' (B16). |
| `src/nervous/detector-registry.ts` | 202 | EVET | 12 detector config-driven. runAll yarı-pişmiş async (B9). Hata yutma var (line 185-188). |
| `src/nervous/decision-engine.ts` | 116 | EVET | Bilinmeyen action silent skip (B3). isInQuietHours dead export src/ açısından (B8). |
| `src/nervous/proposer.ts` | 157 | EVET | recentGroups limitsiz (B19). severityMin cast tipsiz (B18). |
| `src/nervous/dispatcher.ts` | 344 | EVET | NervousObserver gibi yaratılmıyor (B1). severity→eventName yan etkili (B12). |
| `src/nervous/executor.ts` | 299 | EVET | Yetim sınıf, src'de yaratılmıyor (B1, B6). default throw domino (B20). race risk (B21). |
| `src/nervous/authority-matrix.ts` | 184 | EVET | Çift isSafetyFloorAction (B7). getMatrixByMode dead (B8). Safety floor mantığı doğru. |
| `src/nervous/runtime-scope-check.ts` | 55 | EVET | ESM'de require (B11). assertBrainScope ana yolu sağlam. |
| `src/nervous/history.ts` | 142 | EVET | JSONL append-only doğru. indexToMemory caller yok (B15). prune NaN handling eksik (B22). |
| `src/nervous/action-registry.ts` | 328 | EVET | 30 action (8 low + 11 medium + 6 high + 5 safety-floor) — sayı doğru (B13). getAction, getActionsByCategory dead src açısından (B8). |
| `src/nervous/detectors/agent-routing.ts` | 138 | EVET | Sprint 146 corrupt agent dersi kodlanmış. Doğru çalışma şeklinde. |
| `src/nervous/detectors/agent-routing-anomaly.ts` | 113 | EVET | ADR-041 enforcement detection. `tests/` dışı runtime'da çalışmıyor (B1). |
| `src/nervous/detectors/build-failure-recurrence.ts` | 192 | EVET | `BUILD_FAILURE_INVESTIGATE` registry'de yok (B3). Sprint log regex parse'ı kırılgan. |
| `src/nervous/detectors/dead-event-stream.ts` | 160 | EVET | 3 action ID yok (B3). Sprint 165 Bug W ile aktif edildi — ama aktivasyon zinciri yok (B1). |
| `src/nervous/detectors/debt-trend.ts` | 117 | EVET | MemoryStore handle leak (B4). sprint_num field varsayımı (B5). |
| `src/nervous/detectors/directives-protection.ts` | 91 | EVET | Sprint 145 08:14 dersi kodlanmış. Trigger fragility (B14). emergency severity doğru. |
| `src/nervous/detectors/notification-delivery-health.ts` | 123 | EVET | `NOTIFICATION_BRIDGE_REPAIR` registry'de yok (B3). |
| `src/nervous/detectors/scope-collision.ts` | 196 | EVET | PLAN+EXECUTE phase guard doğru. Disk I/O her tick (B23). |
| `src/nervous/detectors/scope-collision-rate.ts` | 100 | EVET | Doğru ID (`SCOPE_COLLISION_REORDER`). Event payload bağımlı. |
| `src/nervous/detectors/stale-worker.ts` | 61 | EVET | Doğru ID (`WORKER_RESPAWN`). Detection mantığı temiz. |
| `src/nervous/detectors/task-mode-idle.ts` | 72 | EVET | Task mode özelinde aktif. Doğru ID (`METRIC_EMIT`). |
| `src/nervous/detectors/token-spike.ts` | 139 | EVET | Doğru ID (`COST_OVER_THRESHOLD` — safety-floor). Cost tahmin tablosu sabit (drift riski). |
| **TOPLAM** | **3.576** | **22/22** | Tüm dosyalar char-level denetlendi; ek olarak `src/core/nervous-types.ts` (sözleşme tipi) + `src/mcp/tools/nervous.ts` (B2 için) + `src/cli/commands/config-nervous.ts` (tüketici) + `src/orchestra/sprint-controller.ts` (event yayını) referans-okuma yapıldı. |

---

> **Sonuç (Audit yazarın yorumu):** nervous/ modülü 3.576 LoC'lik bir mimari iskelet; tasarım belgesi (Sprint 147 design spec) zarif ve katmanları temiz, ancak Sprint 147-151 boyunca runtime entegrasyonu (bootstrap + handler wire) bitirilmemiş. Şu anki haliyle ADR-040 'accepted' status ile gerçek davranışın arasında ciddi bir delta var. OSS GA öncesi Alperen'in iki yoldan birini seçmesi gerekir: (a) **KUR** — Sprint 172/173 boyunca bootstrap + action handler + E2E test + ADR drift'lerin (B3, B11, B12, B16) düzeltilmesi; veya (b) **KALDIR** — tüm nervous/ paketini sil, ADR-040'ı deprecated/superseded yap. Yarı yolda bırakıp "Proactive Meta-Orchestrator" olarak pazarlanması en kötü senaryo. Bu audit raporu bulguları sırasıyla **B1+B2 CRITICAL → 4 HIGH → 13 MEDIUM → 5 LOW** ile dökümante etti; Sprint 172 backlog girişi olarak hazır.
