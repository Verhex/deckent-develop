# Resource Arbiter Spec — Ürün & User/Enterprise Perspektifi Denetimi

**Denetçi:** architecture-planner (Worker 281-003, sonnet)
**Kapsam:** `docs/superpowers/specs/2026-06-11-resource-arbiter-design.md`
**Tarih:** 2026-06-11
**Perspektif:** Solo kullanıcı + Enterprise/ERP — ürün gözüyle, dogfood değil.

---

## 1. Metodoloji

Spec + aşağıdaki kaynak kodlar okundu; tüm iddialar `file:line` ile teyit veya çürütüldü:
- `src/core/notification-dispatcher.ts` — PROGRESS/notify yüzeyleri
- `src/core/notify.ts` — `notifyProgress`, 3-surface wire
- `src/core/event-stream.ts:610` — `emitProgress` Sprint-280-001
- `src/core/host-detector.ts` — `detectHostMemory`, `suggestMaxWorkers`
- `src/orchestra/spawn-coordinator.ts:70` — `tierBasedMaxWorkers`
- `docs/adr/067-process-mode-tenancy.md` — tenant threading durumu
- `docs/adr/068-enterprise-foundation.md` — F4 enterprise durumu
- `docs/adr/071-autonomous-enterprise.md` — F3-009 otonom motor
- `docs/MASTER-PLAN.md` §4 — F3/F4 durumu, AS-6 motor

---

## 2. Solo Kullanıcı Perspektifi

### [P2] capacity:auto formülü — 8/16 GB makinede ne üretir?

Spec §5.3: `heavy-test = max(1, min(3, floor(totalGB/16), floor(cores/4)))`.

Hesaplama:

| RAM | Çekirdek | `floor(RAM/16)` | `floor(cores/4)` | `min(3,...)` | `max(1,...)` = kapasite |
|-----|----------|-----------------|-----------------|-------------|------------------------|
| 8 GB | 4 | 0 | 1 | 0 | **1** |
| 8 GB | 8 | 0 | 2 | 0 | **1** |
| 16 GB | 4 | 1 | 1 | 1 | **1** |
| 16 GB | 8 | 1 | 2 | 1 | **1** |
| 32 GB | 8 | 2 | 2 | 2 | **2** |
| 32 GB | 16 | 2 | 4 | 2 | **2** |

**Teyit güçlü yönü:** `floor(totalGB/16)` terimi 8 ve 16 GB'ta 0 verir; `max(1, 0)` = 1 garantili. 8-16 GB solo makine her zaman `capacity=1` alır → serialleştirme garantili. Mantıklı, güvenli default.

**[P2] Uyarı:** Mevcut `host-detector.ts:96` (`floor(totalGB/2) - 1`) ve `spawn-coordinator.ts:70` (`tierBasedMaxWorkers`) formülleri spec ile **tutarsız**. Bunlar `max_workers` içindir, `capacity:auto` için değil — aynı dosyadan türetildiğinde tutarsızlık riski. Spec'in formülü ayrı bir `computeAutoCapacity()` fonksiyonu olarak `host-detector.ts`'e eklenmelidir, mevcut `suggestMaxWorkers` kalıbından türetilmeden. `native-build` için `floor(cores/4)` terimi de eklenmeli ama spec'te sadece `heavy-test` örneği var; `native-build`'in ayrı formülü belirsiz.

### [P1] Sürpriz-bekleme UX'i — "Neden yavaş?" sorusunun cevaplanabilirliği

Spec §5.6: shim `WAITING_LEASE:<classId>:pos=<n>` yazar → `emitProgress` (Sprint 280-001) + `notify('progress')` (Sprint 280-002) → "tty + MCP + file 3-surface".

**Kod teyidi:**
- `emitProgress` (`event-stream.ts:610`) — var ve doğru; event-stream'e yazar.
- `notifyProgress` (`notify.ts:98`) → `notify('progress', ...)` → `NotifyDispatcher` → TTY + MCP + file adapters — var.
- `NotificationEventName` içinde `'progress'` (`notification-dispatcher.ts:18`) — var.

**[P1] Kritik boşluk: shim → PROGRESS köprüsü spec'te belirsiz.**
Shim bir **bash script**'tir (`src/orchestra/lease-shim.ts` tarafından üretilir). Bash script'ten `emitProgress` veya `notifyProgress` çağrılamaz — bunlar Node.js modülleri. Shim yalnızca `.tasks/task-XXX.hb` dosyasına yazabilir. Spec §5.5, "Timeout-watchdog hb'deki taze `WAITING_LEASE` işareti varsa deadline'ı uzatır" diyor ama kim bu hb'yi okuyup `emitProgress`'i çağırıyor? **Bu köprü spec'te yazılmamış.** Olası çözümler: (a) Auditor scan döngüsü `WAITING_LEASE` hb'yi okuyup event'i emit eder, ya da (b) result-collector polling yolu. Hangisi olduğu tanımlanmamış → implementasyonda köprü eksik kalabilir, kullanıcı hiçbir şey görmez.

**REPL'de görünürlük:** Spec §3: "REPL agentic + autonomous capability wire V2". REPL kullanıcısı sprint dışı tek-agent kullanımında arbiter yüklü değil. REPL'in kendi progress görünürlüğü yok — "neden yavaş?" sorusu REPL'de **cevapsız kalır**.

**[P2] `deckent lease ls` henüz mevcut değil.** `resource-arbiter.ts` implement edilmedi — bu spec bir tasarım belgesidir. Kullanıcı bugün `deckent lease ls` komutu çalıştıramaz. "Operatör görünürlüğü" V1 kapsamında ilan edilmiş ama implementasyona bağlı.

**Güçlü yön:** Spec'in `WAITING_LEASE` hb sentinel + timeout-dondurma tasarımı doğrudur — kullanıcının sürpriz NO_GO almasını önler. Konsept sağlam.

---

## 3. Enterprise / ERP Perspektifi

### [P1] `erp.material.<lot>` — Kim acquire eder?

Spec §8: "Autonomous capability-dispatch V2'de acquire çağırır."

**[P1] V1'de ERP lease kimin acquire ettiği tanımlanmamış.** Mevcut otonom motor (`AS-6`, `F3-009`) üretimde çalışıyor (MASTER-PLAN §4, commit `5191b8a6`) ama arbiter ile henüz wire'lanmıyor. ERP lot kilidini:
- Worker mı alacak (worker tool-loop içinde)? → worker'ın arbiter API'sini çağırması şimdi hib tanımlanmamış.
- Autonomous capability-dispatch mı alacak? → V2'ye ertelenmiş.
- İnsan onayı mı? → "izin-önce-eylem" sloganıyla çelişir.

Bu, V1 enterprise kullanımını pratikte boş bırakır. Spec "ürün genellemesi" olarak ERP'yi sunarken asıl mekanizma V2'dedir.

### [P2] TTL modeli ve iş-süreci ölçeği

Spec §5.3: `db-migration: ttlSeconds: 900` (15 dk), `heavy-test: 1800` (30 dk). Bunlar teknik işler için mantıklı.

**[P2] ERP/iş-kaynağı kilitlerinde TTL modeli yanlış soyutlama.** Bir ERP lot-kilidinin geçerlilik süresi saatler veya günler olabilir (üretim emri boyunca). `ttlSeconds: 86400` (1 gün) gibi değerler için:
- Crash kurtarması (stale-by-mtime) **gün boyunca kapalı kapasite** demektir — pid-liveness check yok.
- `deckent lease release` CLI müdahalesi gerekir — bu operatörün haberi olmasına ve manuel işlem yapmasına bağımlıdır.
- Spec §7 "crash → TTL/mtime stale → temizlik" diyorsa 1800 saniyelik stale bekleme bile iş kaynakları için sorunlu; 86400 saniyelik bekleme enterprise için blokerdir.
- **Çözüm önerisi:** ERP kapsamı için `LeaseBackend` arayüzüne pid-liveness hook veya "extend-on-heartbeat" dışında "explicit-release only" policy eklenmeli; TTL'siz ("infinite") mode V2'ye ertelenmemeli, V1 ERP-genellemesi için şart.

### [P2] `tenant` alanı — F3/F4 planlarıyla hizalama

Spec §5.3: `resource_classes` config'de `tenant?` alanı "V1'den rezerve".

**[P2] Tenant threading'i V1'de gerçekleşmeyecek — beklenenden daha zayıf hizalama.** ADR-067 (Sprint 281 amendi): `resolveTenant()` **0-caller (dormant)**; "tüm Process-Mode bileşenleri TenantContext parametre alır" kararı kod gerçekliğiyle çelişiyor. `tenant` alanı backlog entry'de düz `string` olarak var (`docs/MASTER-PLAN.md:134`) ama resource arbiter ile nasıl entegre edileceği belirsiz — hangi tenant'ın hangi resource_class'ına erişimi var? ADR-068 §3 ve §4 "gerçek çok-kiracılı yetkilendirme F4" dese de F4 "runtime izolasyon yok" diye not düşmüş. Lease-level tenant izolasyonu **V2+ açıkça belirtilmemiş** ama zorunlu.

**Güçlü yön:** `tenant` alanının V1'de rezerve edilmesi forward-compat açısından doğru karar — sonraki migration'ı önler. ADR-068 "terfi gerekçesi" enterprise temelinin var olduğunu kanıtlıyor.

---

## 4. Prior-Art Kıyası

### [P3] GNU make jobserver

Make jobserver, pipe'dan token okur (POSIX token model): her paralel iş bir token eder, biter, token'ı iade eder. **Fark:** Token model tür-bağımsız — her iş aynı pool'dan token alır. Deckent'in sınıf modeli daha granüler (heavy-test sınıfı ayrı, package-install ayrı), ama token modelinin "recursive sub-make" gücünü taşımıyor — çocuk process (iç içe shim) parent'ın lease'ini otomatik devralamaz.

**Deckent'in üstün yönü:** Sınıf bazlı kapasite, farklı iş türlerine farklı limit koymayı sağlar. Jobserver'da tüm işler aynı rekabeti eder.

**[P3] Kaçırılan:** Make jobserver pipe-token'ın atomik dağıtım garantisi daha güçlü; deckent'in rename-promotion'ı FS semantiğine bağlı (NFS, Docker bind-mount'ta sorunlu olabilir — T1 architectural review'da ayrıca işlendi).

### [P3] GitHub Actions `concurrency`

GH Actions: `concurrency: group: ${{ github.workflow }}` + `cancel-in-progress: true`. Tüm-ya-da-hiç: group başına 1 çalışan iş, geri kalanlar iptal veya queue. Spec'in `reject` policy'ye en yakın analog. **Fark:** GH Actions `capacity > 1` desteklemez; deckent'in kapasiteli FIFO modeli daha zengin.

**Kaçırılan:** GH Actions'ın `cancel-in-progress` (iptal semantiği) deckent spec'te yok. Kuyruktaki worker gelen yeni sürümde anlamsızlaştıysa (örn. newer commit) iptal edilemez — `reject` bu boşluğu kısmen kapatır ama tam cancel-vs-supersede semantiği yok.

### [P2] k8s ResourceQuota / PriorityClass

k8s ResourceQuota: namespace-seviyesinde `requests.cpu`, `limits.memory` hardlimit. PriorityClass: öncelikli Pod preempt eder düşük-önceliklileri. **Deckent farkı:** Deckent proje-scoped, kullanıcı-konfigüreli, daemon'suz. k8s daha güçlü ama çok daha karmaşık ve her ortamda değil.

**[P2] Kaçırılan kritik: preemption yok.** k8s'te öncelikli iş düşük-önceliğiyi kümeden kaldırabilir. Deckent'te `CRITICAL` öncelikli task kuyruğun başına atlayamaz (spec §3: "Öncelik/CRITICAL kuyruk atlama — FIFO yeterli (YAGNI)"). CRITICAL bug-fix görevi test kuyruğunun arkasında 30 dk bekleyebilir. Tek-makine için kabul edilebilir ama enterprise SLA senaryolarında sorunlu.

**[P2] Kaçırılan: LimitRange (min floor).** k8s LimitRange, kaynak tüketiminin alt sınırını da koyar — kaynak boşa gitmez. Deckent spec'te `capacity=1` bile ayarlansa garanti edilen bir "minimum reservation" yok — arbiter var ama kaynak gerçekten ayrılmış mı, yoksa sadece sıralı mı?

---

## 5. Konfigürasyon UX

### [P1] Şema doğrulama ve hata mesajları belirtilmemiş

Spec §5.3: `resource_classes` JSON config, `match` regex dizisi, `capacity`, `policy`, `ttlSeconds` alanları.

**[P1] Kullanıcı hatalı JSON yazarsa ne olur? Spec bu soruyu cevaplamıyor.** Örnekler:
- `match: ["\\bvitest\\b"` — eksik kapanış parantez → JSON parse hatası → muhtemelen `resource_classes: {}` ile devam (fail-open). Kullanıcı hatayı fark etmez.
- `capacity: "many"` — geçersiz değer → arbiter başlatılırken ne olur? Zod mı, hand-written validate mı?
- `policy: "kill"` — geçersiz enum → sessizce `reject`'e mi düşer?

Spec ne Zod ne hand-written validator ne de hata mesajı formatı tanımlıyor. `deckent config set resource_classes.heavy-test.capacity 2` komutunun çalışıp çalışmadığı belirsiz — mevcut `deckent config set` yalnızca düz `key=value` destekler, iç içe objeler için syntax yok.

**Öneri:** `resource-classes.ts` şema validatörü (ADR-010 / hand-written) + 3-layer merge sırasında `deckent doctor` uyarısı + açık hata mesajı. Bu spec yazmadan önce tanımlanmalıydı.

### [P1] Stack profil dağıtım mekanizması — "el sallama"

Spec §5.3: "Stack profilleri JSON-veri: TS/generic V1 built-in; python/c++/ERP profilleri **kod değişikliği gerektirmeden veri olarak eklenir** (kullanıcı tanımlar veya **ürün data-update gönderir**)."

**[P1] "Ürün data-update gönderir" mekanizması belirsiz.** Şu anki mimari alternatifleri:
- (a) `npm update deckent` ile yeni built-in profiller → ürün güncellemesi, kod değişikliği yok ✓ ama "zero-code" iddiasıyla çelişir.
- (b) `.deckent/resource-profiles/*.json` — kullanıcı koyar, deckent yükler → güzel ama spec'te bu yol tanımlanmamış.
- (c) "ürün data-update" → merkezi API'den çekme → ADR-010/AS-7 air-gapped ile çelişir; spec §2 K3 "offline uyumlu" der.

Pratikte (a) muhtemel ama "veri olarak eklenir, kod değişikliği gerekmez" iddiası sahte. Bu boşluk kullanıcı onboarding'inde problem: "python projesi için resource class nasıl eklerim?" sorusunun cevabı belirsiz.

---

## 6. Görünürlük / i18n Kapsamı

### [P2] i18n mesaj listesi eksik ve kısmen varlığı doğrulanamaz

Spec §5.6: "tüm user-facing mesajlar `getMessage` (en+tr); shim/arbiter mekanizması string-free."

**[P2] Spec'te ne EN ne de TR mesaj anahtarları listelenmemiş.** `src/cli/helpers/messages.ts` incelendi — arbiter/lease ile ilgili HIÇBIR mesaj anahtarı yok (resource-arbiter.ts henüz implement edilmedi). Asgari mesaj listesi şunları içermeli:

| Anahtar | EN | TR |
|---------|----|----|
| `lease.waiting` | `Worker {workerId} queued for {classId}, position {pos}` | `Worker {workerId} sınıf {classId} kuyruğunda, sıra {pos}` |
| `lease.granted` | `Worker {workerId} granted {classId} lease (seq {seq})` | `Worker {workerId} {classId} lease'i aldı (seq {seq})` |
| `lease.released` | `Worker {workerId} released {classId} (seq {seq})` | `Worker {workerId} {classId} serbest bıraktı (seq {seq})` |
| `lease.stale_cleared` | `Stale lease cleared for {classId} (holder {holder})` | `{classId} için bayat lease temizlendi (sahip {holder})` |
| `lease.fail_open` | `Arbiter error — running {cmd} without gate` | `Hakem hatası — {cmd} serbest çalıştırılıyor` |
| `lease.rejected` | `{classId} lease rejected (policy: reject)` | `{classId} lease reddedildi (politika: reject)` |
| `lease.timeout_frozen` | `Worker {workerId} clock frozen (WAITING_LEASE {classId})` | `Worker {workerId} saat donduruldu (WAITING_LEASE {classId})` |

Bu liste spec'te yok. Implementasyonda hardcode risk var.

### [P2] Docs / onboarding güncellenmesi gereken dosyalar

Spec mevcut kullanıcıya hiçbir onboarding referansı vermiyor. Asgari güncellenecekler:
- `DECKENT.md` §5 (Bileşenler): `resource_classes` konfigürasyonu
- `docs/MASTER-PLAN.md` §4: yeni `AS-8 Resource Arbiter` öğesi eklenmeli (şu an yok)
- `docs/reference/api-surface.md`: `.deckent/leases/` dosya formatı kontratı
- Yeni: `docs/guide/resource-arbiter.md` — solo user quick-start (capacity:auto ne üretir, nasıl izlenir)
- `docs/adr/XXX-resource-arbiter-design.md` — spec "ADR-090 önerisi implementasyon sprint'inde yazılacak" diyor, onboarding dokümanında bu ADR referansı eksik

---

## 7. V1/V2 Kesimi — Ürün Değeri

### [P1] Autonomous engine V1'de arbiter dışında — gerçek risk

Spec §3 (Non-Goals): "REPL agentic + autonomous capability wire — çekirdek API hazır, wire V2."

**[P1] Otonom motor (AS-6 / F3-009) üretimde çalışıyor ve arbiter V1'de buna bağlanmıyor.** MASTER-PLAN §4 (commit `5191b8a6`): engine live, durable backlog, `deckent autonomous start` gerçek iş yapıyor. Bu engine parallel task'lar başlatabilir. V1'de bu task'lar `heavy-test` veya `package-install` arbiter'ından geçmeden koşar → **spec'in çözdüğü problemin aynısı otonom modda hâlâ mevcut.** Spec "tetikleyici ölçülmüş: 8 worker aynı anda vitest → makine kilitlenir" diyorsa, otonom modda da aynı durum tetiklenebilir.

**[P2] REPL tek-agent'ta gerçek risk düşük ama sıfır değil.** REPL'de genellikle 1 aktif agent var. ADR-081 agentic tool-use (F2 streaming) ile birden fazla concurrent dispatch mümkün. Spec "REPL tek-agent" varsayımı doğru ama kural değil. V1 için tolere edilebilir ama belgelenmelidir.

### [P2] Dashboard kuyruk paneli V2 — enterprise demo açığı

Spec §10: "dashboard kuyruk paneli V2".

**[P2] F4 enterprise "✅ 100%" iken (MASTER-PLAN §4) kuyruk izleme V2'ye bırakılıyor.** Enterprise satış/demo senaryosunda müşteri "hangi worker neyi bekliyor" görmek ister. Dashboard'da `EnterprisePage.tsx` var (`run-proven Sprint 218`) ama kaynak sınıfı/kuyruk görünürlüğü yok. Bu:
- Enterprise POC sunumunda "gözlemlenebilirlik" sorusunu açıkta bırakır
- `deckent status --json` queue bilgisini içerse de JSON çıktısını enterprise müşteri göremez
- **Öneri:** V1 kısmında en azından `deckent status` çıktısına `[queued: N workers waiting for heavy-test]` ekleyin — dashboard olmasın ama CLI görünürlüğü V1'de olsun.

---

## 8. Güçlü Yönler (Dengeli Denetim)

- **Fail-open ana ilkesi** (§7) doğru ürün kararı — yeni katman sprint'i asla düşürmemeli.
- **`capacity:auto` zero-hard-code** felsefesi öğretici ve ADR-070 ile uyumlu.
- **Öğrenme döngüsü** (§8): nervous detector → rule-evolver → `nervous accept/edit` → resource_classes. Bu, resource yönetimini "manuel kural listesi" olmaktan çıkarıp "akıllı sistem" yapıyor — rekabet avantajı.
- **`policy: "reject"` dürüstlüğü**: worker NO_GO yazmasına izin vermek, sahte başarı yerine şeffaf başarısızlık — ADR-035 verification protocol ruhuyla uyumlu.
- **`tenant?` V1'den rezerve**: migration borcu bırakmayan forward-compat karar.
- **Saat-dondurma (K2)** mantığı temiz: bekleme süresi çalışmak sayılmaz, timeout'u uzatır.
- **4-katman mimari (L1-L4)** açık sorumluluk ayrımı; L3 hard-gate + L4 mevcut backstop iyi combo.

---

## Verdict: APPROVE_WITH_CHANGES

**Temel tasarım sağlam**, ürün kararları doğru (fail-open, auto-capacity, FIFO, öğrenme döngüsü). Aşağıdaki 3 madde implementasyona başlamadan önce ele alınmalıdır:

1. **[P1] Shim→PROGRESS köprüsü netleştirilmeli** (§5.5/5.6): bash shim `WAITING_LEASE` yazar — kim okuyup `emitProgress`/`notifyProgress` çağırır? Auditor mı, result-collector polling mı? Bu köprü spec'te yok ve en görünür UX özelliğinin arkasındaki mekanizma. Sprint başlamadan önce 1 paragraf eklenebilir.

2. **[P1] `resource_classes` şema doğrulama** (§5.3): hatalı regex/policy/capacity için `deckent doctor` uyarısı ve hand-written validator gerekli. Spec bunu tamamen atlıyor. Sessiz fail-open config hatası = "neden arbiter çalışmıyor?" sorusu.

3. **[P1] Stack profil dağıtım mekanizması** (§5.3): "ürün data-update gönderir" ifadesi AS-7 air-gapped ve ADR-010 ile çelişir. Mekanizma netleştirilmeli: ya npm bundle (honest), ya `.deckent/resource-profiles/` user-dir (clean), ya da V2'ye ertelenmeli.

**Ek P2 izleme listesi:** TTL modeli ERP ölçeğinde (§3), V1 otonom motor arbiter boşluğu (§7), i18n mesaj listesi (§6), dashboard queue V1 minimal CLI görünürlüğü (§7).
