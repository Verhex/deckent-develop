# Resource Arbiter Spec Denetimi — Mimari & Eşzamanlılık Doğruluğu (fable-01)

**Denetlenen:** `docs/superpowers/specs/2026-06-11-resource-arbiter-design.md`
**Denetçi perspektifi:** system-architect + typescript-expert · **Tarih:** 2026-06-11
**Yöntem:** Her iddia gerçek kaynak koda karşı dosya-gövdesi okumasıyla doğrulandı/çürütüldü (`file:line`). Bağımsızlık kuralı gereği bu dizindeki diğer denetim raporları OKUNMADI.
**Okunan kod:** `src/core/file-lock.ts` (tam), `src/core/host-detector.ts` (tam), `src/orchestra/spawn-backend-docker.ts`, `src/orchestra/result-collector.ts`, `src/monitor/auditor.ts`, `src/orchestra/tmux.ts`, `src/providers/subprocess.ts`, `src/orchestra/conflict-resolver.ts`, `src/orchestra/dependency-scheduler.ts`, `src/core/system-capacity.ts`, `src/core/event-stream.ts`, `src/core/notification-dispatcher.ts`, `src/nervous/ipc-queue.ts`, `src/orchestra/spawn-coordinator.ts`, `Dockerfile.worker`, `docs/adr/008`, `docs/adr/064`.

---

## Yönetici Özeti

Tasarımın **yönü doğru**: izin-önce-eylem admission-control modeli, deterministik hakem (K4), `LeaseBackend` arayüzü ve V1/V2 kesimi sağlam mimari kararlar. Spec'in "zaten var" dediği altyapının çoğu **gerçekten var ve canlı** (PROGRESS channel, notify tipleri, nervous edit transport, TOPP dispatch, tierBasedMaxWorkers).

Ancak **çekirdek algoritma katmanında (§5.2, §5.4, §5.5) üç adet P0 hata** var: (1) `trap release EXIT` + `exec` kombinasyonu POSIX'te release'i **asla çalıştırmaz**; (2) monoton `seq` sayacının atomik artırımı için atıfta bulunulan "file-lock deseni" kod tabanında **mevcut değil** — naive implementasyon çift-grant üretir; (3) motive eden senaryonun kendisi (`npx vitest run`) PATH-shim'i **bypass eder** (node_modules/.bin önceliği). Ayrıca K2 saat-donması kontratı, docker/tmux'un container-içi sabit GNU `timeout` mimarisiyle **cerrahi olarak bağdaşmıyor** ve hb-dosyası mevcut 15 sn'lik dual-writer ile çakışıyor.

Bu bulgular tasarımın iptalini değil, §5.2/§5.4/§5.5'in algoritma-seviyesinde yeniden yazılmasını gerektiriyor.

**Verdict: REWORK** (gerekçe ve en kritik 3 madde en sonda).

---

## (a) FileLeaseBackend Algoritması — §5.1/§5.2

### [P0] A-1 — `trap release EXIT` + `exec` POSIX'te birlikte ÇALIŞMAZ: release asla koşmaz

**Spec iddiası (§5.4, satır 107):** "Shim: `acquire(class)` → `trap release EXIT` → kendi dizinini PATH'ten çıkararak **gerçek binary'yi exec** eder." **§6 adım 3:** "w1 biter → trap release → head-of-line ... promote".

**Gerçek:** POSIX sh ve bash'te `exec command` **process imajını değiştirir** — kabuk "exit" etmez, EXIT trap'i **hiçbir zaman tetiklenmez** (POSIX Shell §2.14 exec / §2.11 trap; bash builtin semantiği aynı). Yani exec tercih edilirse release **hiçbir normal-bitiş yolunda çalışmaz**. Sonuçlar:

1. **Her lease TTL'e kadar yaşar.** `heavy-test` için `ttlSeconds: 1800` (§5.3, satır 88): 5 dakikalık vitest biter, lease 25 dakika daha slotu işgal eder → kuyruk fiilen 30-dk-periyotlu serileşmeye döner. §6'daki veri akışı (w1 biter → promote "1-2 sn içinde") **gerçekleşmez**.
2. **TTL'den uzun süren test = kapasite aşımı.** Granted dosyasının mtime'ı promotion anında kalır (renewal yok — bkz. E-1); 30 dk'yı aşan gerçek bir suite koşarken stale-temizlik canlı holder'ın lease'ini söker → sıradaki promote edilir → eşzamanlı heavy-test sayısı kapasiteyi aşar → spec'in çözdüğünü iddia ettiği kilitlenme senaryosu geri gelir ("Kilitlenme fiziken imkânsız" iddiası §6 adım 4 çürür).

**Öneri:** Shim **exec ETMEMELİ** — gerçek binary'yi çocuk süreç olarak çalıştırıp `wait` etmeli (`real_bin "$@" & wait $!; rc=$?; release; exit $rc` ya da düz çağrı + trap). Bunun bedelleri spec'e yazılmalı: sinyal iletimi (`trap 'kill $child' TERM INT`), exit-code sadakati, süreç zincirinde +1 halka. `trap release EXIT` yalnız exec YOKSA anlamlıdır; ayrıca POSIX sh'ta SIGTERM'de EXIT trap'inin koşması için `trap ... TERM INT HUP` da gerekir (docker kill yolu `--signal=SIGTERM`, `spawn-backend-docker.ts:1018`).

### [P0] A-2 — Monoton `seq` atomik artırımı: atıf yapılan "file-lock deseni" kod tabanında YOK; naive yorum çift-grant üretir

**Spec iddiası (§5.2, satır 74):** `.deckent/leases/<classId>/seq # monoton sayaç (atomik artırım, file-lock deseni)`.

**Gerçek:** `src/core/file-lock.ts` baştan sona okundu (632 satır). Mevcut desenlerin TÜMÜ **create-once (O_EXCL)** veya delete'tir:
- `acquireLock` — O_EXCL atomik oluşturma (`file-lock.ts:100`), sahiplik kontrolü, contention'da **throw** (bekleme döngüsü yok).
- `acquireSpawnLock` — aynı O_EXCL deseni (`file-lock.ts:369`).
- `clearStaleLocks` — JSON `acquiredAt` alanına göre temizlik (`file-lock.ts:236-240`).

**Hiçbirinde read-modify-write sayaç primitivi yoktur.** İki süreç `seq` dosyasını aynı anda okuyup artırıp yazarsa (lost update) **aynı seq'i alır**. Bunun zinciri ölümcül: dosya adları holder içerdiğinden (`waiting/<seq>-<holder>.json`, satır 76) aynı-seq'li iki waiting dosyası **farklı dosya adlarıyla** birlikte var olabilir → ikisi de `seq == min(waiting)` koşulunu sağlar → ikisi de **kendi** dosyasını rename eder (rename yalnız dosya-başına atomiktir, holder'lar arası hakemlik yapmaz) → **iki grant, kapasite aşımı + FIFO bozulması**. "Atomik rename ile waiting→granted (tek-kazanan)" iddiası (satır 79-80) ancak seq benzersizse doğrudur; benzersizliği sağlayan mekanizma spec'te tanımsız.

**Öneri (iki geçerli yol, spec birini SEÇMELİ ve yazmalı):**
1. **O_EXCL ile seq-claim:** sayaç dosyası yerine `seq/` dizininde `O_EXCL` ile `<n>` marker dosyası oluşturma yarışı — kazanan n'i alır, kaybeden n+1 dener (gerçekten "file-lock deseninin" doğru kompozisyonu). Marker dosyaları periyodik budanır.
2. **Kilitli artırım:** `acquireLock` ile seq güncellemesini sarmak — ama `acquireLock` contention'da throw eder (retry-loop tanımlanmalı) ve artırım ortasında crash → stale lock tüm sınıfın acquire'ını `clearStaleLocks` ufkuna kadar bloke eder. Bu yan etkiler spec'e girmeli.

### [P1] A-3 — Promotion TOCTOU: `granted < capacity` + `seq == min(waiting)` kontrolü rename ile atomik değil; okuma SIRASI zorunlu kılınmalı

§5.2 algoritması iki ayrı dizini (`granted/`, `waiting/`) ayrı `readdir`'larla okur; rename tek dosyada atomiktir ama **karar yüklemi atomik değildir**. Yarış örneği (capacity=1, waiting={3,4}):

1. holder-4 `granted/` okur → boş (count 0 < 1 ✓)
2. holder-3 `waiting/3` → `granted/3` rename eder (meşru promotion)
3. holder-4 `waiting/` okur → {4} → min=4 == kendi seq ✓
4. holder-4 kendi dosyasını rename eder → **granted={3,4}, kapasite 1 aşıldı.**

**Kapanış:** rename tek atomik olay olduğundan, **önce `waiting/` sonra `granted/`** okunursa bu pencere kapanır: "3 waiting'den gitmiş" gözlemi ancak rename SONRASI mümkündür; o durumda daha sonra okunan `granted/` 3'ü mutlaka içerir → count kapasiteye ulaşır → yanlış promotion imkânsızlaşır (tek-rename-aynı-anda değişmezi: yalnız head promote edebildiğinden, benzersiz seq varsayımıyla sınıf başına aynı anda en çok bir rename uçuştadır). Spec bu **okuma-sırası disiplinini** ve dayandığı "benzersiz seq" önkoşulunu (A-2) açıkça yazmalı; ek emniyet olarak promote-sonrası `granted/` yeniden sayım + kapasite aşıldıysa kendini geri-alma (rename-back) deseni değerlendirilmelidir.

### [P1] A-4 — Stale-temizlik × promotion etkileşimi: ölü waiting-HEAD kuyruğu TTL boyunca dondurur; waiting/granted için AYRI stale eşiği tanımlanmamış

§5.2 yalnız tek stale kuralı verir: "mtime > ttl → temizlenir". Waiting dosyaları her tick (1-2 sn) yenilenir; **crash eden head-of-line waiter**'ın dosyası ama `ttlSeconds` (heavy-test: **1800 sn**) dolana dek `min(waiting)` hesabını işgal eder — promotion yalnız head-of-line olduğundan **arkadaki herkes 30 dk'ya kadar bekler**. Bu, spec'in savaştığı "her şey timeout'a sürüklenir" (§1) belirtisinin kendisidir. Ayrıca temizliği kim/ne sıklıkla koşar (her waiter her tick mi? `deckent lease clear --stale` mı?) tanımsız.

**Öneri:** waiting-stale eşiği tick'in küçük katı olmalı (örn. 10-30 sn; class ttl'inden bağımsız), `min(waiting)` yalnız **taze** waiting kayıtları üzerinden hesaplanmalı; granted-stale için class ttl + (mümkünse) süreç-canlılık sinyali kullanılmalı (bkz. A-6). İki eşik spec'te ayrı ayrı tanımlanmalı.

### [P2] A-5 — mtime-tabanlı TTL: Linux/WSL2'de güvenilir, macOS Docker Desktop'ta saat-sapması riski; atıf yapılan `clearStaleLocks` aslında mtime kullanmaz

- **Linux/WSL2:** container'lar host kernel'ini paylaşır → bind-mount (`-v ${dir}:/workspace`, `spawn-backend-docker.ts:699`) üzerindeki mtime tek saat etki alanında damgalanır → container-container ve container-host okumaları tutarlıdır. Spec'in "tek makine, tutarlı" varsayımı (satır 141) bu platformlarda **doğru**.
- **macOS Docker Desktop:** mtime'ı VM kernel'i damgalar; host tarafı (`deckent lease ls/clear`, Auditor) host saatine göre karşılaştırır. Docker Desktop VM'inin host-uykusu sonrası saat sapması belgeli bir sorundur ve bu proje uyku-sonrası crash'i fiilen yaşamıştır (sprint-267 kaydı). Yanlış-stale (canlı lease söküm → kapasite aşımı) veya yanlış-taze (ölü lease bekletme) iki yönde de mümkün. Platform notu + savunma (örn. yalnız in-container temizlik, host CLI'da uyarı) spec'e girmeli.
- **Desen-atfı düzeltilmeli:** spec "`clearStaleLocks` deseni" der (satır 81) ama `clearStaleLocks` mtime değil **JSON `acquiredAt` alanı + `Date.now()`** kullanır (`file-lock.ts:236-240`). mtime seçimi (ucuz renewal=touch) savunulabilir ve muhtemelen daha iyidir — ama "mevcut desen" değil **yeni** desendir; spec bunu dürüstçe yeni karar olarak yazmalı.

### [P2] A-6 — Mevcut canlılık-probe altyapısı (isWorkerProcessAlive) granted-stale kararında kullanılmıyor — fırsat kaçırma

Kod tabanında backend-farkındalıklı süreç/container canlılık probu zaten var: `isWorkerProcessAlive` (`auditor.ts:100`) + async batch liveness cache (`auditor.ts:386-390`, Sprint 279 WK-7). Granted lease'in holder'ı `docker-<taskId>` / pid ise, mtime-TTL'i beklemeden "holder ölü → lease'i hemen reap" yapılabilir; §6 adım 4'teki crash-kurtarma 30 dk yerine saniyeler olur. V1'e ucuz, etkisi büyük; en azından V2 yol haritasına yazılmalı.

---

## (b) ADR Uyumu — §11 İddiaları

### [DOĞRULANDI] ADR-008 — yön kurgusu doğru; bilinen 1 rezidüel ihlal bağlam notu

ADR-008'in güncel rafine ifadesi `core/ → orchestra/` import yönünü yasaklar (`docs/adr/008-...md`, "Note (current enforcement & refinement)"). Spec'in yerleşimi (arbiter + resource-classes `core/`'da, shim-üretici `orchestra/`'da; orchestra→core importu serbest) **uyumludur**. Bağlam: kod tabanında izlenen 1 rezidüel ihlal var (`src/core/routing-engine.ts:30` → `orchestra/ecosystem-intelligence.js`; ADR-008 dokümanında "ADR-008-W" olarak kayıtlı) — spec'in yeni modülleri bu borcu büyütmemeli. [P3] not: `lease-shim.ts`'in arbiter'ı çağırması orchestra→core olduğundan sorunsuz; ancak shim **script'lerinin** arbiter'ı çağırma yolu E-2'deki köprü sorununa tabidir.

### [DOĞRULANDI] ADR-010 — yeni dependency yok

Tasarım node:fs + POSIX sh ile ifade edilebilir; `package.json`'a dokunma ihtiyacı görünmüyor. ✓

### [DOĞRULANDI] ADR-037 — "ilk gerçek hard-enforce, çelişki yok" iddiası tutarlı

ADR-037 V1.0 RBAC'ı **scope** ekseninde advisory'dir (compile-time lint + audit-trail; runtime warn+emit, bloke etmez — CLAUDE.md Gotchas + `worker-default.md` Verify Loop dürüstlük notu "0-caller"ı doğruluyor). Arbiter **kaynak-admission** eksenindedir; eksenler ayrıktır, çelişki yok. K1 gerekçesindeki "ADR-037 advisory dersi" atfı da yerindedir. ✓ — Yalnız [P3]: shim dosyalarının "worker scope.filesWrite DIŞINDA" tutulması (§5.4, satır 110) Auditor'ün `git diff --stat` taramasına dayanır; `.deckent/shims/` gitignore'daysa diff'te görünmez — ihlal sinyalinin gerçek mekanizması spec'te netleştirilmeli.

### [KISMEN DOĞRULANDI] ADR-045/064 — TOPP "dispatch erteleme" mekanik olarak GERÇEKÇİ, ama önkoşulu eksik

Continuous dispatch gerçekten yaşıyor ve spec'in iddia ettiği ekleme noktası mevcut: `planDispatch` saf planlayıcı (`result-collector.ts:227`), `dispatchTick` ana-döngü girişi (`result-collector.ts:787-790, 1005`), `dispatchReadyTasks` (`result-collector.ts:915`), `forceRescanIfIdle` (`result-collector.ts:872`). Saf-fonksiyon planlayıcıya "doygun sınıfın task'ını bu tick atla" filtresi eklemek **cerrahi ve test-edilebilir** — iddia (§4-L1, satır 53) bu yönüyle gerçekçi. **Ancak** dispatcher'ın bir task'ın hangi kaynak sınıfına dokunacağını bilmesi gerekir; bu sinyal spec'te tanımsız (bkz. D-1) — mekanik uygun, girdi eksik.

### [DOĞRULANDI] ADR-087 — test stratejisi uyumlu

§9 kuralları (tmpdir, async spawn, spawnSync yasak, gitignored-state okunmaz) ADR-087/test:ci-sim standardıyla bire bir. ✓ — [P3] öneri: tek-kazanan-promotion birim testine ek olarak **interleaving/stres testi** (N paralel acquire × M release turu, kapasite hiç aşılmadı assertion'ı) eklenmeli; A-2/A-3 sınıfı yarışlar tekil senaryo testleriyle yakalanmaz.

### [P3] ADR-005/087 — yeni core modülünde I/O modeli belirtilmemiş

`file-lock.ts` sync-I/O'dur (deprecated ADR-005 dönem deseni); ADR-087 async-first'tür. `FileLeaseBackend.acquire` Promise döndürüyor (✓) ama iç poll döngüsünün I/O modeli (sync readdir vs fs/promises) spec'te yok — ADR-087'ye açık referansla async seçilmeli.

---

## (c) Saat-Donması Kontratı (K2, §5.5) — Kod Gerçekliğiyle Karşılaştırma

### [P1] C-1 — "Deadline uzatma" docker ve tmux'ta mevcut mimariye CERRAHİ uygulanamaz: per-task zamanlayıcı container-içi sabit GNU `timeout`

**Spec iddiası (§5.5, satır 114-116):** "Timeout-watchdog (spawn-backend-docker + result-collector deadline mantığı): hb'de taze WAITING_LEASE işareti varsa deadline'ı bekleme süresi kadar uzatır."

**Gerçek — üç backend üç farklı dünya:**
- **Docker:** per-task zamanlayıcı, container-İÇİ script'teki `timeout $TIMEOUT ${workerCmd}` satırıdır (`spawn-backend-docker.ts:652` TIMEOUT env, `:656` wrapper; `TASK_TIMEOUT` env `:727`). Spawn anında sabitlenir; koşan bir GNU `timeout` sürecinin süresi **dışarıdan uzatılamaz**. Host tarafında uzatılabilir bir per-task deadline YOKTUR (host `monitorContainer` exit-SONRASI işleyicidir, `:1254+`).
- **tmux:** aynı desen — `timeout ${tSec} sh -c '...'` (`tmux.ts:150`). Uzatılamaz.
- **subprocess:** TEK uzatılabilir olan — host-side `setTimeout` → SIGKILL (`src/providers/subprocess.ts:184-188`); timer'ı hb'ye bakarak yeniden kurmak gerçekten cerrahidir.

**result-collector tarafı:** per-task deadline yok; yalnız **sprint-global** `waitForResults` timeout'u (`result-collector.ts:515-516`, döngü `:996`) ve container'ın yazdığı `.timeout` marker'ının tüketimi (`:648-666`) var. Sprint-global süreyi WAITING_LEASE görünce uzatmak kolaydır ama per-task kill'i durdurmaz — kill container'ın İÇİNDEN gelir.

**Sonuç:** K2 kontratı docker+tmux için "mevcut watchdog'a koşul ekleme" değil, **wrapper-script timeout mekanizmasının yeniden tasarımıdır** (örn. GNU `timeout` yerine hb/lease-wait-ledger okuyan ve yalnız "aktif süreyi" sayan in-container watchdog döngüsü). Yapılabilir, ama spec'in ima ettiği eforun katbekat üstü; spec bunu dürüstçe "docker/tmux wrapper redesign" olarak adlandırmalı ve V1 kapsam kararını buna göre vermelidir.

### [P1] C-2 — hb dosyası dual-writer çakışması: docker'ın 15 sn'lik arka-plan HB döngüsü WAITING_LEASE işaretini ezer; format da JSON şemasıyla uyumsuz

**Spec iddiası (§5.5, satır 113-114):** "Shim beklerken `.tasks/task-XXX.hb` içine `WAITING_LEASE:<classId>:pos=<n>` yazar, her poll tick'inde mtime yeniler."

**Gerçek:**
1. **Dual-writer:** docker worker script'i, hb dosyasını 15 sn'de bir **sabit-şablon JSON** ile koşulsuz yeniden yazar (`status:"EXECUTING"`, artan SEQ — `spawn-backend-docker.ts:650`). Shim'in yazdığı her WAITING_LEASE işareti ≤15 sn içinde **silinir**; watchdog/Auditor okuyucuları flapping içerik görür. Spec bu mevcut yazıcıdan habersiz görünüyor.
2. **Format:** hb tüketicileri `readJsonSafe<Heartbeat>` ile **JSON parse eder** (`auditor.ts:68`, `:471-472`). Düz-string `WAITING_LEASE:...` yazılırsa parse null döner → Auditor o worker'ı **sessizce atlar** (`if (!hb) continue;`) — stale alarmı çıkmaz (tesadüfen "sessiz") ama worker heartbeat listesinden, liveness probundan ve dashboard'dan **kaybolur**; mevcut hb içeriği (workerId/taskId/status) yok edilir.

**Öneri:** İşaret ya **ayrı dosyaya** (`task-XXX.leasewait` — `.timeout` marker deseni zaten var) ya da `Heartbeat` şemasına eklenen opsiyonel `leaseWait?: { classId, pos, since }` alanına yazılmalı; ikinci yol seçilirse docker script'inin 15 sn'lik HB şablonunun lease-state'i side-file'dan okuyup taşıması gerekir (script değişikliği). Spec mekanizmayı bu gerçeklikle yeniden yazmalı.

### [P2] C-3 — Auditor staleness mtime'a DEĞİL JSON `timestamp` alanına bakar; "taze-mtime'lı hb sağlıklıdır" kontratı mevcut kodda karşılıksız

`isWorkerStale` tazeliği `hb.timestamp` **JSON alanından** hesaplar (`auditor.ts:362-369`); dosya mtime'ı yalnız parse-cache invalidasyonunda kullanılır (`auditor.ts:53-79`). Spec'in "mtime yenile" eylemi (touch) Auditor'ün stale kararını **etkilemez** — JSON gövdesinde taze `timestamp` (+ tercihen artan `sequence`, Signal C `auditor.ts:392-398`) yazılması gerekir. Hafifletici gerçek: multi-signal tasarımda **Signal B (süreç/container canlı)** bekleyen worker'ı zaten stale saymaz (`auditor.ts:386-390`) — yani Auditor tarafı pratikte büyük ölçüde kendiliğinden sessiz kalır; ama spec'in verdiği mekanizma (mtime) yanlış adrestir ve §9'daki "stale-alarm yok (4+)" test grubu yanlış mekanizmayı test edecektir.

### [P1] C-4 — Shim'in hb entegrasyonu için dayandığı env değişkenleri 3 backend'in 2'sinde YOK

**Spec iddiası (§5.4, satır 108-109):** "`DECKENT_TASK_ID`/`DECKENT_WORKER_ID` env zaten worker'a enjekte."

**Gerçek:** `DECKENT_TASK_ID` yalnız **docker** spawn'ında enjekte edilir (`spawn-backend-docker.ts:724`); tmux ve subprocess spawn yollarında bu env **yoktur** (tmux.ts/spawn-backend.ts'te sıfır geçiş). `DECKENT_WORKER_ID` ise **hiçbir spawn yolunda set edilmez** — tek referans worker.ts'in fallback'li okumasıdır (`worker.ts:720`). Spec'in fallback'i ("env yoksa — REPL/manuel — hb adımını atlar") tmux/subprocess **sprint worker'larını** da yanlışlıkla "manuel" sınıfına sokar → o backend'lerde WAITING_LEASE işareti hiç yazılmaz → K2 donması docker dışında **ölü doğar** (bekleme süresi timeout'a sayılır → sentetik-NO_GO ailesi geri gelir; K2'nin varlık sebebi buydu). Düzeltme basit (3 backend'e env enjeksiyonu eklemek) ama spec "zaten var" varsaymayı bırakıp bunu iş kalemi olarak yazmalı.

---

## (d) L1 Plan-Time Packing (§4-L1)

### [P1] D-1 — Task→resource-class çıkarım sinyali tanımsız: match regex'leri RUNTIME komut satırına bakar, plan-time'da komut satırı YOKTUR

`resource_classes.match` desenleri (`\bvitest\b.*\brun\b` vb., §5.3) shim'in gördüğü **komut satırına** uygulanır. Plan aşamasında elde olan veri task JSON'udur (scope, description, agent, skills — `api-surface.md` .tasks formatı); worker'ın hangi komutları koşacağı bilinmez. "Aynı ağır sınıfa dokunması beklenen task sayısı" (satır 52) hesaplanamaz çünkü **"beklenen sınıf" üreten hiçbir sinyal spec'te yok**. Seçenekler adlandırılmalı: planner'ın task şemasına `expectedResourceClasses?: string[]` alanı eklemesi (Kanıt/Test satırlarından + taskType'tan türetme), ya da kaba sezgisel (test-içeren her task = heavy-test adayı). Bu alan `.tasks` şema değişikliğidir → `api-surface.md` sözleşme güncellemesi gerekir; spec bunu da listelemeli. (L1 "doğruluk garantisi vermez" dediği için P0 değil; ama V1 kapsamında sayılan bir bileşenin girdisi tanımsız → P1.)

### [P2] D-2 — capacity=N sayma-kısıtı, mevcut pairwise çakışma modeliyle İFADE EDİLEMEZ — "genişleme" değil yeni mekanizma

**Gerçek mekanizma:** `detectScopeCollisions` dosya-yazarlarından **ikili çakışma çiftleri** üretir (`conflict-resolver.ts:173-212`); `buildDependencyGraph` bu çiftleri **bağımlılık kenarına** çevirir — düşük-ID önce, yüksek-ID ona bağımlı (`dependency-scheduler.ts:233-249`). Bu model ikili **serileştirme** ifade eder (fiilen capacity=1'in çift-bazlı hali). `capacity: 2` ("aynı anda en çok 2") bir **kardinalite/bin-packing** kısıtıdır: 4 heavy-test task'ı için ne tüm çiftleri kenarlamak (aşırı-serileştirme: zincir 4 wave) ne kenarsız bırakmak doğru sonucu verir. Spec'in "dosya-scope çakışma tespitinin kaynak-boyutuna genişlemesi" cümlesi (satır 51-52) mimari olarak yanıltıcı — wave-builder'a yeni bir "sınıf-başına-eşzamanlılık-kotası" gruplama mekanizması yazılması gerekir. TOPP continuous-dispatch yolunda ise (D-1 sinyali varsa) saturation-filtresi doğal ve yeterlidir — spec L1'i wave-packing yerine yalnız dispatch-deferral olarak daraltmayı değerlendirmeli (daha az yeni kod, ADR-064 ile daha uyumlu).

---

## (e) Eksik Bileşen Taraması

### [P1] E-1 — `renew()` granted-holder yaşam döngüsü: kim, ne zaman, hangi süreçten çağırır — TANIMSIZ

`renew(classId, seq)` arayüzde var (§5.1, satır 65) ama spec yalnız **waiting** dosyasının yenilenmesini anlatır (satır 80-81: "waiting mtime yenile"). Lease **granted** olduktan sonra: shim exec ederse yenileyecek süreç kalmaz (A-1); exec etmezse bile spec, bekleyen ebeveynin arka-plan renewal alt-döngüsü (`while sleep 60; do renew; done &`) kurması gerektiğini söylemez. Renewal'sız granted + uzun koşu = A-1'deki kapasite-aşımı; agresif kısa TTL = canlı sökme. `ttlSeconds` değerlerinin (1800) anlamı renewal varlığına göre kökten değişir — bu yaşam döngüsü spec'in zorunlu parçasıdır.

### [P1] E-2 — Shim (shell) → arbiter (TS) köprüsü tanımsız; worker container'ında deckent YOK

Shim POSIX shell script'idir; `FileLeaseBackend` TS sınıfıdır. Köprü nasıl kurulur?
- **Node-CLI köprüsü** (`node .../dist/core/lease-cli.js acquire ...`): worker image'ı `node:24-trixie-slim` + yalnız **claude CLI** içerir (`Dockerfile.worker:9,24`) — **deckent kurulu DEĞİL**. Dogfood'da proje mount'unda `dist/` bulunur ama **kullanıcı projelerinde bulunmaz** (deckent host'ta global kuruludur, container'a mount edilmez). Ürün perspektifinde bu köprü bugün kurulamaz.
- **Pure-shell implementasyon:** acquire/release algoritmasının sh'ta ikinci kez yazılması — TS backend'le **çift-implementasyon drift riski** (TS taraf yalnız CLI/status/temizliğe iner; "çekirdek core'da" iddiası fiilen boşalır).

Her iki yolun da gerçek maliyeti var; spec **seçim yapmıyor ve sorunu adlandırmıyor**. Aynı köprü §5.6 PROGRESS/notify emisyonunu da etkiler: `emitProgress` TS fonksiyonudur (`event-stream.ts:610-627`) — kuyruk olayını shim yaşar, emit'i kim yapar? (Shell'den JSONL append etmek format sözleşmesini kırılganlaştırır.)

### [P2] E-3 — `capacity:"auto"` veri kaynakları ve ÇÖZÜM YERİ: host-detector cores SAĞLAMAZ; nerede hesaplandığı belirsiz

**Spec iddiası (§5.3, satır 96-97):** "host-detector'dan formül: `heavy-test = max(1, min(3, floor(totalGB/16), floor(cores/4)))`".

**Gerçek:** `src/core/host-detector.ts` (tam okundu, 103 satır) **yalnız RAM** sağlar (`detectHostMemory` → totalGB, `:59-76`); **cores yoktur**. Çekirdek sayısı `system-capacity.ts:35` (`cpus().length`) / `system-profile.ts:19`'dadır. Modül atfı düzeltilmeli. Daha önemlisi: formül **nerede** çözülür? Acquire anında her waiter kendi ortamında hesaplarsa container-içi okumalar (cgroup `--memory 8g` altında, farklı /proc görünümleri) host'la ve birbirleriyle tutarsız kapasiteler üretebilir → aynı sınıf için farklı süreçler farklı `capacity` ile karar verir → admission tutarsızlığı. Kapasite **tek yerde** (host, spawn/config-resolve anında) çözülüp lease-dizini metadata'sına (örn. `<classId>/meta.json`) yazılmalı; spec bunu belirtmeli. Formül sayıları doğrulandı: 40 GB/20 core → min(3, 2, 5)=2 ✓. [P3] not: "zero-hard-code" başlığı altında 16/4/3 sabitleri gömülü — config-override mevcut olsa da formülün kendisi de config-edilebilir olmalı.

### [P2] E-4 — `exec` + PATH-self-exclusion: shim DİZİNİNİN tamamen çıkarılması, torun süreçler için TÜM shim'leri devre dışı bırakır

§5.4 "kendi dizinini PATH'ten çıkararak exec" deseni, exec edilen gerçek binary'nin **torunlarına da** shim-dizinsiz PATH miras bırakır: `make`(native-build) çocuğu `npm install` çağırırsa npm shim'i **artık PATH'te değildir** → iç içe korumalı komut gate'siz koşar. Doğru desen: gerçek binary'yi shim-dizini-hariç PATH'le **çözümleyip mutlak yolla** çalıştırmak, ortam PATH'ini **olduğu gibi bırakmak** (+ re-entrancy işareti, bkz. E-5). Spec'in mevcut cümlesi yanlış davranışı yazıyor.

### [P1] E-5 — "Deadlock imkânsız" (§7, satır 139) iddiası iç içe cross-class komutlarda KANITSIZ: nested-acquire politikası tanımsız

"V1 tek-lease-per-holder (iç içe acquire aynı lease'i döndürür) → çevrim imkânsız" yalnız **aynı sınıfın** re-entrancy'sini çözer. Farklı sınıfların doğal iç içe geçmesi engellenmemiştir: `make -j`(native-build lease'i tutar) → alt süreç `npm install` → npm shim `package-install` acquire'ında **bloklanır** = holder fiilen 2 lease ekseninde (1 tutuyor, 1 bekliyor). İki worker ters sırada girerse (W1: native-build tutar, package-install bekler; W2: package-install tutar — postinstall'ı make tetikler — native-build bekler) **çevrim oluşur**; TTL (30 dk) dolana dek karşılıklı blok. Spec üç politikadan birini seçip yazmalı: (i) holder zaten lease tutuyorsa nested acquire **pass-through** (env işareti `DECKENT_LEASE_HELD` ile — gate'te bilinçli delik, belgelenir), (ii) nested acquire **reject** (dürüst hata), (iii) sınıflara global edinim-sırası dayatması. Mevcut metindeki "imkânsız" iddiası bu haliyle yanlıştır.

### [P0] E-6 — PATH-shim'in motive eden senaryoda BYPASS edilmesi: `npx vitest run` / `npm test` node_modules/.bin'i kullanır, ambient shim asla kazanamaz

**Spec'in kendi senaryosu (§6 adım 1):** "w1 `npx vitest run` → shim `acquire('heavy-test')`".

**Gerçek:** vitest bu projede (ve tipik kullanıcı projelerinde) **lokal devDependency**'dir. `npx vitest`, lokal `node_modules/.bin/vitest`'i bulur ve **doğrudan onu** çalıştırır (npx, `node_modules/.bin`'i PATH'in EN ÖNÜNE ekler) — ambient PATH'e prepend edilmiş `.deckent/shims/current` dizinine hiç bakılmaz. Aynı şekilde `npm test`/`npm run` script gövdesine `node_modules/.bin` öncelikli PATH verir → script içindeki `vitest run` da shim'i atlar. `./node_modules/.bin/vitest` doğrudan çağrısı da atlar. **Sonuç: K1 "korumalı komut lease almadan exec olamaz" garantisi, sistemin var oluş nedeni olan vitest senaryosunda boştur.** Shim listesi (§5.4: "vitest, npm, pnpm, yarn, pytest, make, cmake, cargo") `npx`'i içermiyor; içerse bile `npm test`-içi çözümleme ambient PATH'ten geçmez.

**Öneri:** Spec kapsama matrisini açıkça çizmeli: (i) `npx`/`npm exec` shim'i eklenip arg'ları match-regex'lerine karşı değerlendirmek; (ii) `npm`/`pnpm`/`yarn` shim'lerinin `run`/`test` alt-komutlarında script gövdesini değil **kendisini** sarması (npm-shim acquire eder → gerçek npm'i koşar — script içi vitest lease kapsamında kalır; kaba ama etkili); (iii) spawn-time'da worker env'ine `npm_config_*`/wrapper enjekte etmek; (iv) kapsanamayan vektörleri (doğrudan `node_modules/.bin/...`, `node ...` çağrıları) **bilinen-delik** olarak belgelemek. Bunlar tasarım kararı gerektirir — implementasyona bırakılamaz.

### [P3] E-7 — Küçük eksikler

- **Seq dosya-adı sıralaması:** `min(waiting)` filename'den hesaplanacaksa zero-padding veya numeric-parse zorunlu (`10-...` < `9-...` lexicografik tuzağı).
- **`release(classId, seq)` imzasında holder yok** (§5.1, satır 64) — granted dosya adı `<seq>-<holder>.json`; seq-prefix glob'u benzersiz-seq önkoşuluna (A-2) bağlı.
- **`.deckent/leases/` + `.deckent/shims/` gitignore** girişi ve sprint CLEANUP/`deckent recover` entegrasyonu (orphan lease temizliği `clearOrphanSpawnLocks` desenine paralel) spec'te anılmalı.
- **Docker path-çevirisi:** shim script'leri ve lease yolları container'da `/workspace/...` (CONTAINER_WORKSPACE, `spawn-backend-docker.ts:32`), host'ta proje yolu — PATH-prepend değeri backend'e göre üretilmeli (kod tabanında `container-path-sanitizer.ts` emsali var).

### [P2] E-8 — Fail-open × K1 gerilimi: koruma tam da aşırı-yük anında gevşer

§7 "arbiter/shim İÇ hatası → komut SERBEST çalışır" ilkesi, sistemin önlemeye çalıştığı yük profilinde (disk doygunluğu, fd tükenmesi, OOM-baskısı) `leases/` yazımlarının başarısız olma olasılığının EN YÜKSEK olduğu anda **tüm gate'i açar** → 8 vitest yine serbest. Fail-open REPL/sprint-düşürmeme için doğru ilke; ama hata sınıfları ayrılmalı: yapılandırma/parse/modül hatası → fail-open; **transient I/O hatası → sınırlı backoff-retry, sonra fail-open + yüksek-görünürlüklü uyarı**. Spec bu ayrımı yapmalı ya da trade-off'u bilinçli kabul ettiğini yazmalı.

---

## Teyit Edilen Güçlü Yönler (dengeli denetim)

1. **Problem teşhisi ölçülü ve doğru:** resource-log altyapısı gerçek (`.deckent/resource-log.jsonl` diskte; `orchestra/resource-monitor.ts`/`resource-report.ts` mevcut); `tierBasedMaxWorkers` gerçekten yalnız worker SAYISINI sınırlar (`spawn-coordinator.ts:70,103`) — "ne çalıştırdıkları serbest" tespiti kod-doğru.
2. **İzin-önce-eylem + deterministik hakem (K4) mimari olarak isabetli:** tespit-sonra-müdahalenin bu hata sınıfında geç kaldığı analizi doğru; hakemi LLM'siz/daemon'suz tutmak (K3) bu kod tabanının dosya-tabanlı koordinasyon geleneğiyle (.locks/.tasks/.hb) tutarlı.
3. **Katman ayrımı temiz:** L1 = optimizasyon (doğruluk iddiasız), L3 = garanti, L4 = mevcut backstop — doğruluk sorumluluğunun tek katmana verilmesi sağlam mühendislik.
4. **ADR-008/010 yerleşimi doğru:** core arbiter + orchestra shim yönü kurallara uygun; yeni dependency yok.
5. **Dayanılan altyapı iddiaları büyük oranda GERÇEK ve canlı:** PROGRESS channel + `emitProgress` (`event-stream.ts:162-163, 610-627`), notify `'progress'`/`'phase-change'` (`notification-dispatcher.ts:19-20, 167-168`), nervous edit `modifiedPayload` transport (`ipc-queue.ts:85-97`), rule-evolver, TOPP continuous dispatch (`result-collector.ts:177-231, 787-790`) — §5.6/§8 entegrasyon vizyonu hayal değil, mevcut raylara oturuyor.
6. **`.deckent/leases` container-paylaşım iddiası doğru:** proje kök mount'u (`spawn-backend-docker.ts:699`) `.deckent`'i zaten kapsıyor; `.tasks`/`.locks` emsalleri açık mount'larla teyitli (`:701, :703`).
7. **`policy:"reject"` dürüstlüğü:** sahte-başarı yerine açık hata + worker NO_GO — projenin honest-assessment kültürüyle (ADR-035/070) hizalı.
8. **V1/V2 kesimi ve non-goal disiplini:** tek-lease, FIFO-yeterli, Brain-devri-V2 — YAGNI'ye sadık, kapsam şişmesi yok.
9. **TTL-tabanlı crash-recovery kavramsal olarak doğru** (parametreleştirme ve renewal eksikleri ayrı — A-1/A-4/E-1); mtime-renewal fikri ucuz-yenileme için doğru içgüdü.
10. **ERP/enterprise genellemesi** (lease adı serbest anahtar, `erp.material.<lot>`) primitive'i değiştirmeden taşınıyor — LeaseBackend arayüzü V2 API-backend'e gerçekten elverişli (provider-adapter emsali kodda mevcut).

---

## Verdict: REWORK

Tasarımın mimari iskeleti (4 katman, LeaseBackend arayüzü, dosya-tabanlı çekirdek, fail-open ilkesi, V1/V2 kesimi) korunmalı; ancak üç P0, spec'in **çekirdek güvenlik/işlev iddialarını** (tek-kazanan promotion, release yaşam döngüsü, hard-gate kapsamı) çürüttüğü ve K2 kontratı 2/3 backend'de bugünkü kodla uygulanamaz olduğu için spec bu haliyle implementasyona giremez. §5.2 (seq + promotion + stale eşikleri), §5.4 (shim yürütme modeli + bypass matrisi + köprü) ve §5.5 (K2'nin backend-gerçekçi mekanizması) yeniden yazılmalı.

**En kritik 3 madde:**

1. **[P0 A-1] `trap release EXIT` + `exec` birlikte çalışmaz** — release hiçbir normal yolda koşmaz; her lease TTL'e (30 dk) kadar yaşar, TTL'i aşan koşularda canlı lease sökülüp kapasite aşılır. Shim çocuk-süreç + wait modeline geçmeli, granted-renewal yaşam döngüsü (E-1) tanımlanmalı.
2. **[P0 E-6] `npx vitest run` / `npm test` PATH-shim'i bypass eder** (node_modules/.bin önceliği) — K1 hard-gate, sistemin var oluş nedeni olan senaryoda boş. Kapsama matrisi (npx/npm-run sarmalama + bilinen delikler) tasarım kararı olarak spec'e girmeli.
3. **[P0 A-2] Monoton seq'in atomik artırım mekanizması tanımsız ve atıf yapılan "file-lock deseni" kodda yok** (`file-lock.ts` yalnız O_EXCL create-once içerir) — duplicate seq, "tek-kazanan" rename'i çift-grant'a çevirir. O_EXCL-tabanlı seq-claim veya kilitli-artırım açıkça spesifiye edilmeli; promotion'a okuma-sırası disiplini (A-3) eklenmelidir.
