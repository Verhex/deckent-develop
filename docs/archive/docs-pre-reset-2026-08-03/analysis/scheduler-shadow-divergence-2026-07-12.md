# SCHED5ON — Shadow-Journal Divergence Analizi (sprint-415..423, 9-sprint tam-tarama)

> **Görev:** 424-002 (SALT-ANALİZ, kod-yok). Kanıt-kaynağı: `.deckent/runtime/scheduler-shadow/sprint-4{15..23}.jsonl`
> (9 dosya, salt-oku). Çapraz-doğrulama için sprint-415'in gerçek event-log'u, task-JSON'ları ve
> evaluation kayıtları okundu (yalnız okuma — hiçbir kaynak dosya değiştirilmedi). Tasarım referansı:
> `docs/analysis/scheduler-unify-design-2026-07-11.md` (SCHEDULER-UNIFY, born-634/635).
> Divergence taksonomisi kaynağı (salt-oku doğrulama): `src/orchestra/scheduler-journal.ts`,
> `src/orchestra/scheduler-driver.ts` (yalnız okundu — kod değiştirilmedi).

## Özet

9 sprint'lik shadow-differential journal'da (sprint-415 → sprint-423) **2671 tick** tarandı.
Bulunan divergence sayısı: **1** — `sprint-415 seq=144`, `kind=spawn-only-in-reducer`,
`taskId=415-002`. Diğer 8 sprint'te (416–423, toplam 2473 tick) sıfır divergence var.

Ancak ham "0 divergence" sayısı yanıltıcıdır ve tek başına GO gerekçesi olamaz: 8 sprint'in
27 task'ının **hiçbirinde explicit `dependencies` yoktu** (bkz. §2, §4.2) — yani bu sprint'lerde
reducer/legacy karşılaştırması test edilecek gerçek bir "mid-sprint dependency-driven spawn"
kararıyla hiç karşılaşmadı; ikisi de "spawn edilecek bir şey yok" konusunda hemfikirdi çünkü
spawn edilecek gerçek bir olay yoktu. Reducer'ın **tek** gerçek egzersizi sprint-415 seq=144'tür
(415-002, 415-001'e bağımlı tek task). O tek vakada da, iki karar-motorunun ("legacy" journal-alanı
ve gerçek prod event-log'u) aslında **aynı gerçek-dünya anında aynı kararı verdiği** doğrulandı
(§4.1) — journal'daki "divergence" kaydı, gerçek bir legacy-vs-reducer karar-çatışması değil,
shadow-instrümantasyonun before/after okuma penceresinin async spawn-mutasyonunu kaçırmasından
kaynaklanan bir **gözlem-penceresi artefaktı**dır.

Ayrıca `mode` alanı 2671 tick'in tamamında `"continuous"`tur — `legacy-fifo` stratejisi bu
datasette **hiç egzersiz edilmemiştir** (0/2671). `cascadeSkippedTaskIds` da hem legacy hem
reducer tarafında 2671 tick boyunca hep boştur — cascade-skip yolu da **hiç egzersiz edilmemiştir**.

**Sonuç:** slice-5 (Continuous live switch) için **KOŞULLU GO** — gerekçe ve koşullar §5'te.

## 1. 9-Sprint Tam-Tarama Tablosu

| Sprint | Tick | initial/watcher | Task sayısı | Dep'li task | mode gözlenen | legacy spawn (toplam) | reducer spawn (toplam) | cascade-skip (legacy/reducer) | divergence |
|---|---|---|---|---|---|---|---|---|---|
| 415 | 198 | 1/197 | 3 | 1 (415-002→415-001) | continuous | 0 | 1 | 0/0 | **1** (spawn-only-in-reducer, seq=144) |
| 416 | 435 | 2/433 | 6 | 0 | continuous | 0 | 0 | 0/0 | 0 |
| 417 | 343 | 1/342 | 3 | 0 | continuous | 0 | 0 | 0/0 | 0 |
| 418 | 302 | 1/301 | 3 | 0 | continuous | 0 | 0 | 0/0 | 0 |
| 419 | 237 | 1/236 | 3 | 0 | continuous | 0 | 0 | 0/0 | 0 |
| 420 | 426 | 2/424 | 3 | 0 | continuous | 0 | 0 | 0/0 | 0 |
| 421 | 270 | 1/269 | 2 | 0 | continuous | 0 | 0 | 0/0 | 0 |
| 422 | 184 | 1/183 | 2 | 0 | continuous | 0 | 0 | 0/0 | 0 |
| 423 | 276 | 1/275 | 3 | 0 | continuous | 0 | 0 | 0/0 | 0 |
| **Toplam** | **2671** | 11/2660 | 28 | **1** | yalnız continuous | **0** | **1** | 0/0 | **1** |

Kaynak: her satır `node` ile ilgili `.jsonl` dosyasının tam-parse'ından (`JSON.parse` her satır,
`divergence.length>0` filtresi) ve `.deckent/runtime/jobs/sprint-{N}.json` (`metrics.totalTasks`) +
`.brain/archive/sprints/sprint-{N}-tasks/*.json` (`dependencies` alanı) taramasından üretildi.
Ham tick/initial-watcher/mode/spawn-toplamları ve dependency-sayıları bu komutların doğrudan
çıktısıdır — spekülasyon içermez.

**Kritik gözlem:** `legacy spawn (toplam)` sütunu **9 sprint'in 9'unda da** ya 0 ya da (415'te)
0'dır — yani journal'ın `legacyDecision.spawnedTaskIds` before/after-diff mekanizması, bu
datasette **hiçbir zaman** bir "gerçek mid-sprint spawn" yakalamamıştır (415-002 dahil — bkz §4.1,
bu vaka legacy tarafında da kaçırılmıştır, ki tam da divergence'ın sebebi budur). `reducer spawn
(toplam)` sütunu da yalnız sprint-415'te 1'dir. Bu, 8/9 sprintte (416–423) reducer/legacy
karşılaştırmasının **hiç bir gerçek karar anını test etmediği** anlamına gelir — sıfır-divergence,
"parity kanıtlanmış" değil, "test edilecek olay hiç oluşmamış" demektir.

## 2. Örnek Kayıtlar (verbatim-JSON)

### 2.1 Tek divergence — sprint-415, tick 143→144→145 bağlamı

`.deckent/runtime/scheduler-shadow/sprint-415.jsonl` satır 143–145 (verbatim):

```json
{"seq":143,"trigger":"watcher","ts":"2026-07-11T22:05:47.437Z","legacyDecision":{"mode":"continuous","spawnedTaskIds":[],"cascadeSkippedTaskIds":[]},"reducerDecision":{"mode":"continuous","spawnedTaskIds":[],"cascadeSkippedTaskIds":[],"blockedTaskIds":["415-002"]},"divergence":[]}
{"seq":144,"trigger":"watcher","ts":"2026-07-11T22:06:04.435Z","legacyDecision":{"mode":"continuous","spawnedTaskIds":[],"cascadeSkippedTaskIds":[]},"reducerDecision":{"mode":"continuous","spawnedTaskIds":["415-002"],"cascadeSkippedTaskIds":[],"blockedTaskIds":[]},"divergence":[{"kind":"spawn-only-in-reducer","taskId":"415-002"}]}
{"seq":145,"trigger":"watcher","ts":"2026-07-11T22:06:09.446Z","legacyDecision":{"mode":"continuous","spawnedTaskIds":[],"cascadeSkippedTaskIds":[]},"reducerDecision":{"mode":"continuous","spawnedTaskIds":[],"cascadeSkippedTaskIds":[],"blockedTaskIds":[]},"divergence":[]}
```

Tick 1 (`sprint-415.jsonl:1`, ts=21:54:47.946Z) itibarıyla `reducerDecision.blockedTaskIds`
zaten `["415-002"]`dir ve bu, seq=1'den seq=143'e kadar **143 ardışık tick** boyunca değişmeden
kalır (`grep -c` ile doğrulandı) — seq=144'te aniden kalkar ve aynı anda spawn kararı verilir.

### 2.2 Gerçek prod event-log'u (sprint-415) — çapraz-doğrulama kanıtı

`.deckent/recently-works/sprint-415-events.jsonl` (verbatim, ilgili 3 satır):

```json
{"timestamp":"2026-07-11T21:54:47.945Z","sequence":8,"protocol_version":"1.0","source":"brain","target":"worker","channel":"BRAIN→WORKER:DEPENDENCY_BLOCKED","payload":{"taskId":"415-002","unresolvedDeps":["415-001"],"reason":"dependencies not yet DONE"}}
{"timestamp":"2026-07-11T22:06:00.667Z","sequence":11,"protocol_version":"1.0","source":"brain","target":"worker","channel":"BRAIN→WORKER:TIMEOUT_ASSIGN","payload":{"taskId":"415-002","timeoutSeconds":86100, ...}}
{"timestamp":"2026-07-11T22:06:04.434Z","sequence":12,"protocol_version":"1.0","source":"brain","target":"*","channel":"BRAIN→*:METRIC_EMITTED","payload":{"name":"wave.respawn","value":1,"durationMs":3769,"spawnedTaskIds":["415-002"],"totalDone":1,"totalPending":0}}
```

`sprint-415-events.jsonl:8` — gerçek prod da 415-002'yi 21:54:47.945Z'de (journal seq=1, ts
21:54:47.946Z ile 1ms fark) `415-001` bağımlılığı yüzünden bloke ediyor: journal'ın seq=1'deki
`blockedTaskIds:["415-002"]` kararıyla tam örtüşür.

`sprint-415-events.jsonl:12` — gerçek prod, `wave.respawn` metriğini **ts=22:06:04.434Z**'de,
`spawnedTaskIds:["415-002"]`, `totalDone:1` ile yayınlıyor. Bu, journal seq=144'ün ts'i olan
**22:06:04.435Z** ile **1ms** farkla aynı anı işaret eder — yani gerçek prod da o tick'te
415-002'yi spawn etmeye karar vermiştir; reducer'la **aynı sonuca** varmıştır.

### 2.3 415-002 task-dosyası ve evaluation kaydı (dependency-zinciri doğrulaması)

`.brain/archive/sprints/sprint-415-tasks/task-415-002.json:30-32`: `"dependencies": ["415-001"]`.

`.deckent/runtime/evaluations/sprint-415/415-001-attempt-1.json`: `"timestamp":
"2026-07-11T22:10:28.921Z", "decision":"DONE"` — yani 415-001'in **formal Brain-evaluation**
DONE damgası, gerçek respawn-wave'inden (22:06:04.434Z) **4 dakika 24 saniye SONRA** düşer.
Buna rağmen `wave.respawn` metriği 22:06:04.434Z'de zaten `totalDone:1` görüyor ve 415-002'yi
spawn ediyor — yani gerçek canlı `respawnEligibleTasks` yolu, 415-001'in "collected/MRR" sinyalini
(worker sonucu toplanmış), henüz Brain'in formal DONE-evaluation'ı diskte yazılmadan önce,
dependency-satisfying kabul ediyor. Bu ayrıntı §4.1'de sınıflandırmayı etkilemez (asıl mesele
before/after okuma penceresi) ama tasarım-doc'un "yalnız DONE dependency tatmin eder"
(`scheduler-unify-design-2026-07-11.md:18`) invaryantının canlı sistemde şu an **collected/MRR
sinyaliyle** tetiklendiğini gösteren bağımsız bir kanıttır — SCHED5 dışı, ayrı bir docImpact
notu olarak §6'da işaretlendi.

## 3. Divergence Taksonomisi (kaynak-doğrulama)

`src/orchestra/scheduler-journal.ts:39-46` (salt-okundu) 4 `kind` tanımlar:
`spawn-only-in-legacy`, `spawn-only-in-reducer`, `cascade-skip-only-in-legacy`,
`cascade-skip-only-in-reducer`. Görev-promptundaki örnek isimler ("cascade-farkı",
"queue-farkı") bu 4 kind'ın hiçbirinde birebir karşılık bulmuyor — gerçek taksonomi yalnız bu
4 `kind`'dır; rapor bu gerçek taksonomiye göre sınıflandırır.

`src/orchestra/scheduler-driver.ts:190-246` (salt-okundu) `legacyDecision`'ın nasıl üretildiğini
netleştiriyor: `legacyDecision` bir "planDispatch simülasyonu" DEĞİL — `snapshot.assignedTaskIds`
(tick öncesi) ile `observed.assignedTaskIdsAfter` (tick sonrası, **gerçek canlı sistemden okunan**)
arasındaki `diffSpawned` farkıdır (`scheduler-driver.ts:138-142,199`). Yani `legacyDecision` =
gerçek prodüksiyonun o tick'te GERÇEKTEN yaptığı şey; `reducerDecision` = aynı tick-öncesi
immutable snapshot'a `reduceSchedulerTick()` (yeni pure reducer) uygulanınca çıkan **hipotetik**
karar (`scheduler-driver.ts:197,206-209`). Bu, §4.1'deki sınıflandırmanın temelidir.

## 4. Sınıflandırma

### 4.1 sprint-415 seq=144 — spawn-only-in-reducer / 415-002 (DOĞRULANDI)

**Sınıf: Gözlem-penceresi artefaktı (YENİ sınıf — tasarım-doc'un mevcut expected-divergence
listesinde yok) — BEKLENMEDİK-GÖRÜNÜR ama İNCELEMEDE REDUCER-HATASI DEĞİL.**

Kanıt zinciri:
1. `sprint-415.jsonl:144` — reducer 415-002'yi spawn kararı veriyor, legacy(journal-alanı) boş.
2. `sprint-415-events.jsonl:12` — gerçek prod'un `wave.respawn` metriği **aynı gerçek-dünya
   anında** (22:06:04.434Z vs journal'ın 22:06:04.435Z, 1ms fark) 415-002'yi fiilen spawn ediyor.
3. `sprint-415.jsonl:145` (bir sonraki tick, 22:06:09.446Z) — hem legacy hem reducer
   `spawnedTaskIds:[]` gösteriyor (415-002 zaten "assigned" olduğu için ikisi de "yeni spawn yok"
   diyor) — bu, 415-002'nin gerçek `assignedTaskIds` mutasyonunun tick=144'ün "after" okumasıyla
   tick=145'in "before" okuması arasında bir yerde gerçekleştiğini doğrular.

Yorum: `finalizeShadowSchedulerTick` (`scheduler-driver.ts:190-246`), `observed.assignedTaskIdsAfter`'ı
canlı tick'in senkron kısmı bittiğinde okuyor; ama gerçek `respawnEligibleTasks` yolunda
`wave.respawn` metriği (karar-anını işaretler) ile `assignedTaskIds.add(taskId)` mutasyonu
(muhtemelen spawn-effect'in awaited kısmından sonra) arasında bir async boşluk var. Bu boşlukta
"after" okuması araya girerse, gerçekte aynı tick'te olan bir spawn, journal'da "legacy'de yok"
gibi görünür — **legacy'nin kararı yanlış değil, ölçüm penceresi geç**. Reducer, immutable
snapshot üzerinde saf-fonksiyon olarak çalıştığı için bu race'e maruz kalmaz ve "doğru" cevabı
(gerçek prod'un birazdan yapacağı şeyi) hemen verir.

Bu, tasarım-doc'un adlandırdığı sınıflardan hiçbirine (FIFO-dep-deliği, collision-edge kaybı,
retry-backoff eksikliği, cascade-authority farkı, checkpoint/restore MRR semantiği) birebir
uymuyor — çünkü bunların hepsi **karar-mantığı** farkları, bu ise **ölçüm/instrümantasyon**
farkı. Design-doc'un "Event log ilk aşamada yürütme otoritesi değil, karar-karşılaştırma ve
replay kanıt katmanı olmalıdır" ilkesiyle (`scheduler-unify-design-2026-07-11.md:13`) tutarlı:
journal'ın kendisi hiçbir zaman canlı yürütmeyi etkilemedi (fail-soft, gözlem-only), yalnız
kendi karşılaştırma hassasiyeti bu tek vakada yetersiz kaldı.

**Verdict: reducer-hatası DEĞİL. Reducer, gerçek prod'un o tick'te verdiği kararla örtüşüyor.**
Ayrıntılı reproduce-fixture tarifi §5.2'de.

### 4.2 Kapsam-boşlukları (divergence DEĞİL, ama GO/NO-GO'yu doğrudan etkiler)

Aşağıdakiler "sınıfsız divergence" değildir (hiçbiri journal'da divergence olarak kaydedilmedi) —
ama datasetin GO kararı için ne kadar temsili olduğunu doğrudan sınırlar, bu yüzden burada
ayrıca sınıflandırılıyor:

- **legacy-fifo modu: 0/2671 tick.** Tasarım-doc'un en somut "expected-divergence" adayı olan
  FIFO-dep-deliği (`scheduler-unify-design-2026-07-11.md:125-131`: "Bugünkü legacy planner ve
  pipeline-off helper yolu dependency kontrolünü atlar") yalnız `dispatch_strategy=legacy-fifo`
  altında tetiklenir. Bu 9 sprint'in tamamı `continuous` modda çalıştı — FIFO yolunun kendisi
  **hiç egzersiz edilmedi**. Bu sınıf için ne "beklenen" ne "beklenmedik" bir örnek var —
  veri yok.
- **cascade-skip yolu: 0/2671 tick** (hem legacy hem reducer). `CascadeSkip` effect'i ve
  `cascadeSkipDeadBlocked` closure'ı (`scheduler-unify-design-2026-07-11.md:69-71,133-142`)
  bu datasette hiç tetiklenmedi — NO_GO/MRR-bağımlı transitive skip senaryosu test edilmedi.
- **Dependency-driven mid-sprint spawn: 1/28 task, 1/2671 tick.** 8 sprint'in 27 task'ının
  hiçbirinde explicit `dependencies` yoktu (§1, §2.3 metodolojisiyle taranan
  `.brain/archive/sprints/sprint-{416..423}-tasks/*.json`). Reducer'ın "gerçek bir dependency
  kararı verme" fırsatı toplamda **bir kez** oldu.

## 5. GO/NO-GO Önerisi — slice-5 (Continuous live switch)

### 5.1 Karar: KOŞULLU GO

Gerekçe:
- Datasette bulunan **tek** divergence (§4.1), incelemede reducer-hatası değil, shadow
  instrümantasyonunun ölçüm-penceresi artefaktı çıktı; reducer'ın kararı gerçek prod'un o
  anda verdiği kararla (1ms farkla) örtüşüyor. Bu, reducer'ın continuous-mode dependency-satisfying
  mantığının en azından bu tek vakada canlı sistemle **davranışsal olarak uyumlu** olduğunu
  gösteriyor — dolayısıyla NO_GO gerektiren bir "reducer bug" kanıtı yok.
  Design-plan'ın Sprint-5 kapsamı (`scheduler-unify-design-2026-07-11.md:223`: "Initial ve
  watcher pass aynı injected driver'ı çağırır") bu bulguyla çelişmiyor.
- Ancak §4.2'deki kapsam-boşlukları nedeniyle "9 sprint temiz geçti" ifadesi TEK BAŞINA yeterli
  GO-kanıtı değildir — asıl mesele "hiç test edilmemiş yol" (legacy-fifo, cascade-skip) ve
  "yalnızca 1 kez test edilmiş yol" (dependency-driven spawn) olmasıdır. Bu yüzden koşulsuz
  GO değil, **koşullu** GO öneriliyor.

**Koşullar (Sprint-5 live-switch'ten ÖNCE veya Sprint-8 default-flip'ten önce kapatılmalı):**

1. **Ölçüm-penceresi düzeltmesi (önerilen: Sprint-5 kapsamına eklensin).**
   `finalizeShadowSchedulerTick`'in `observed.assignedTaskIdsAfter` okumasını, o tick'in tüm
   spawn-effect promise'leri (varsa) settle olduktan sonra yapacak şekilde sıkılaştır — böylece
   §4.1'deki gibi bir async-mutasyon-gecikmesi bir daha "sahte divergence" üretmesin. Bu,
   Sprint-5/8'in "composition gate" gereksinimiyle (`scheduler-unify-design-2026-07-11.md:228`)
   uyumlu bir gözlemlenebilirlik iyileştirmesidir.
2. **legacy-fifo kapsam-genişletmesi (Sprint-5 veya Sprint-7'den önce zorunlu).**
   En az 1 shadow-sprint, `DECKENT_LEGACY_FIFO=1` (veya karşılığı `dispatch_strategy=legacy-fifo`)
   ile ve en az 2 explicit-dependency'li task içeren bir DIRECTIVES ile koşulmalı — FIFO-dep-deliği
   sınıfı şu an sıfır ampirik kanıtla "kapandı" varsayılamaz.
3. **cascade-skip kapsam-genişletmesi.** En az 1 shadow-sprint, kasıtlı bir NO_GO/MRR upstream
   task içeren bir DIRECTIVES ile koşulmalı, transitive cascade-skip'in legacy/reducer arasında
   gerçekten örtüştüğü gözlemlenmeli.
4. **Dependency-driven spawn örnek-sayısını artır.** n=1'den en az n=5-10'a çıkar (birden çok
   dependency-zincirli DIRECTIVES ile) — Sprint-5 live-switch sonrası bile, default-flip
   (Sprint-8) öncesi bu sayının büyütülmesi composition-gate'in bir parçası olmalı.
5. **§2.3'teki DONE-vs-collected/MRR gözlemi** (415-001'in formal DONE damgası spawn-wave'inden
   4dk24sn sonra düşmesi) ayrı bir docImpact olarak Brain'e iletilmeli (bkz §6) — bu SCHED5ON'un
   NO_GO/GO kapsamı dışında ama SCHEDULER-UNIFY'ın "yalnız DONE dependency tatmin eder"
   invaryantı (`scheduler-unify-design-2026-07-11.md:18`) için doğrudan ilgilidir.

### 5.2 Reproduce-fixture tarifi (§4.1'deki tek anomali için)

Amaç: gözlem-penceresi artefaktını izole bir testte yeniden üretmek (kod-yazımı bu görevin
kapsamı dışında — burada yalnız fixture-TARİFİ veriliyor, SCHED5-follow-up task'ına devredilir).

- **Kurulum:** 2 task'lı bir sprint; task-B, task-A'ya `dependencies:["A"]` ile bağımlı.
  task-A'nın worker'ı, watcher-tick penceresi içinde (poll-interval'in ortasında) sonucunu
  yazacak şekilde zamanlanır (küçük bir `setTimeout` ile worker-sonucu enjekte edilebilir, ya da
  gerçek worker'ın normal bitiş süresi poll-interval'a denk gelecek şekilde ayarlanır).
- **Enstrümantasyon noktası:** `captureShadowSchedulerSnapshot` çağrısı ile `finalizeShadowSchedulerTick`
  çağrısı arasına, gerçek `respawnEligibleTasks`'ın (ya da eşdeğerinin) `assignedTaskIds` mutasyonunu
  **kasıtlı olarak** metric-emit'ten sonraya erteleyen bir yapay `await` / mikro-gecikme eklenir
  (örn. `Promise.resolve().then(...)` zinciri) — böylece gerçek prod-race'i deterministik biçimde
  tetiklenir.
- **Beklenen (düzeltme ÖNCESİ):** journal'da `spawn-only-in-reducer` kaydı; aynı tick'in gerçek
  event-log'unda (varsa) B'nin spawn edildiğine dair bir metrik/event bulunur — §4.1'deki gibi.
- **Beklenen (düzeltme SONRASI, §5.1 madde-1 uygulanınca):** `observed.assignedTaskIdsAfter`
  okuması spawn-effect'in tam settle'ını bekler; journal'da divergence oluşmaz, `legacyDecision.
  spawnedTaskIds` de `["B"]` içerir.
- **Assertion:** `legacyDecision.spawnedTaskIds` ile aynı tick'in gerçek event-log'undaki
  spawn-event'lerinin taskId-kümesi, düzeltme sonrası **her zaman** eşleşmeli (mevcut testte
  eşleşmiyordu, 1 tick gecikmeyle "kayboluyordu").

## 6. docImpact Notları (bu görevin write-scope'u dışında, Brain'e devredilecek)

- `docs/analysis/scheduler-unify-design-2026-07-11.md` §"FIFO dependency deliğinin tasarımdaki
  yeri" ve §"Riskler" bölümlerine, bu raporun §4.1 bulgusu ("gözlem-penceresi artefaktı" — yeni
  bir expected-divergence sınıfı) ve §2.3 bulgusu (canlı `respawnEligibleTasks`'ın collected/MRR
  sinyalini DONE-evaluation'dan önce dependency-satisfying kabul etmesi) eklenmeli. Bu rapor bu
  dosyayı DEĞİŞTİRMEDİ (write-scope dışı) — yalnız bu not bırakılıyor.
- `.brain/memory.db` / ADR seviyesinde: SCHED5 composition-gate'e §5.1 madde 1-4'teki 4 koşulun
  eklenip eklenmeyeceği Brain'in kararına bırakılıyor.

## 7. Metodoloji / Kanıt-disiplini notu

Tüm sayısal iddialar (`toplam tick`, `divergence sayısı`, `mode dağılımı`, `spawn toplamları`,
`dependency'li task sayısı`) `node -e` ile ilgili `.jsonl`/`.json` dosyalarının **tam** (satır
atlamasız) `JSON.parse` taramasından üretildi — örnekleme veya regex-sayım kullanılmadı. Her
tablo hücresi ve her metin-iddiası, bu raporda ilgili yerde dosya-adı + satır/seq referansıyla
belirtildi. Kod dosyası okundu (`scheduler-journal.ts`, `scheduler-driver.ts`) ama
**değiştirilmedi** — `git diff --stat` bu göreve ait tek değişikliğin bu markdown dosyası
olduğunu göstermelidir.
