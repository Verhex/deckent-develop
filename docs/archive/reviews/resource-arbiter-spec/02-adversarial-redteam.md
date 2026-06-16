# Resource-Arbiter Spec — Adversarial Kırmızı-Takım Denetimi

**Görev:** 281-002 · **Perspektif:** Tasarımı KIR (security-auditor + red-team) · **Tarih:** 2026-06-11
**Hedef spec:** `docs/superpowers/specs/2026-06-11-resource-arbiter-design.md` (commit fbaed64b)
**Yöntem:** Her iddia GERÇEK koddan `file:line` ile teyit/çürütüldü. Yüzeysel okuma yapılmadı. Her bulgu: çalışır kötüye-kullanım/kaçış senaryosu + severity + savunma.

> **Tehdit modeli.** İki saldırgan profili: **(A) Buggy/dürüst-ama-hatalı worker** (LLM yanlış komut seçer, kaynak israf eder) ve **(B) Kötü-niyetli/uzlaşılmış worker** (proje RW mount'una sahip, gate'i bilinçli atlatır). Spec ADR-037 dersini ("advisory = 0-enforce") tekrarlamamayı hedeflediği için, hard-gate'in B profiline karşı GERÇEKTEN dişli olup olmadığı kritik soru. Aşağıda gösterilen ana sonuç: **seçilen enforcement mekanizması (PATH-prepend shim) B profiline karşı sızdırır ve hatta A profiline (en doğal komut formu) karşı bile motive-edici senaryoda devreye girmez.**

---

## [P0] Bulgu 1 — Shim, motive-edici komutun (npm/npx/node) tam da kendisinde devreye GİRMEZ

**Spec referansı:** §4 L2/L3 ("PATH-prepend shim dizini"), §5.4 (shim "kendi dizinini PATH'ten çıkararak gerçek binary'yi exec eder"), §5.3 match `"\\bvitest\\b.*\\brun\\b"`, §6 ("w1 `npx vitest run` → shim acquire").

**Kod kanıtı:**
- `package.json:21` → `"test": "vitest run"`. Projenin DOKÜMANTE test komutu `npm test` (CLAUDE.md "Commands" + worker-default.md "Run project-specific … test suite").
- `spawn-backend-docker.ts` içinde PATH/env enjeksiyonu **yok** (grep `PATH|prepend|node_modules` → 0 eşleşme); L2 tamamen yeni kod.

**Kaçış senaryosu (çalışır):**
1. **`npm test` / `npm run test`:** npm bir script çalıştırırken çocuk-process PATH'inin **BAŞINA** `node_modules/.bin`'i ekler (npm'in belgelenmiş davranışı). Spawn-time `.deckent/shims/current` PATH'in başına eklenmiş olsa bile, npm onun da ÖNÜNE `node_modules/.bin`'i koyar → iç `vitest` çağrısı `node_modules/.bin/vitest` (gerçek) olarak çözülür, **shim atlanır.** Worker `npm test` derken `heavy-test` lease'i HİÇ alınmaz.
2. **`npx vitest run`:** Shell `npx`'i çözer (shim listesinde yok) → npx `node_modules/.bin`'i PATH'e ekleyip gerçek vitest'i exec eder → shim görülmez.
3. **`node node_modules/vitest/vitest.mjs`:** Shell `node`'u çözer (shim yok) → script doğrudan koşar.
4. **Spec'in kendi örneği bile riskli:** §6 "w1 `npx vitest run`" yazıyor — yani spec, shim'i atlayan komut formunu örnek veriyor.

**Etki:** 8-worker-vitest senaryosu (tasarımın TEK ölçülmüş motivasyonu, §1) için koruma **sıfır**: workers en doğal/dokümante formu (`npm test`) kullandığında makine yine kilitlenir. A profili (dürüst worker) bile bypass'ı tetikler — kötü niyet GEREKMEZ.

**Savunma önerisi:**
- PATH-shim **tek katman olamaz.** En az biri eklenmeli: (a) `npm`/`npx`/`node` için DE shim üretip bunların da `acquire` etmesi — ama bu, args'a bakmayan shim'de yanlış sınıf riskini doğurur (bkz. Bulgu 11); (b) **`NODE_OPTIONS=--require <preload>`** ile process-başlangıcında acquire eden bir Node preload kancası (vitest/jest Node süreçleridir) — npm/npx/node tüm yolları kapsar; (c) vitest-düzeyi `maxWorkers`/`fileParallelism` + `poolOptions` global semafor (test-spesifik ama motive-edici sınıfı doğrudan hedefler). Spec, mekanizmanın leakage analizini (npm/npx/node) yapmadan "3 backend'de aynı" demiş — bu eksik.

---

## [P0] Bulgu 2 — "Monoton seq atomik artırım" belirsiz ve mevcut O_EXCL deseninden TÜRETİLEMEZ → çift-promosyon / kapasite ihlali

**Spec referansı:** §5.2 `.deckent/leases/<classId>/seq` "monoton sayaç (atomik artırım, file-lock deseni)"; acquire "`seq == min(waiting)` ise atomik rename ile waiting→granted (tek-kazanan)".

**Kod kanıtı (çürütme):** `src/core/file-lock.ts`'te **monoton sayaç deseni YOKTUR.** Mevcut O_EXCL kullanımı (`acquireLock:100`, `acquireSpawnLock:369`) **bilinen bir dosya adını** atomik yaratır — taze bir artan sayı TAHSİS etmez. "file-lock deseni" ile atomik-artırım arasında köprü yok; spec bunu hand-wave ediyor.

**Kaçış/yarış senaryosu (çalışır):**
- İki worker eşzamanlı `read(seq)=5` → ikisi de `write(seq, 6)` → **iki waiter seq=6** sanır. `min(waiting)` artık iki dosyaya işaret eder; ikisi de "ben min'im" diyerek `waiting/6-*.json → granted/6-*.json` rename eder (farklı holder adları → farklı dosya adları, ikisi de başarılı) → **granted sayısı kapasiteyi aşar.** Tam da önlenmek istenen "aynı anda 2+ ağır iş" durumu.
- Klasik atomik-artırım fs ile zordur: O_EXCL ile `waiting/<n>.json` deneyip çakışmada retry gerekir; spec bu protokolü tanımlamıyor.

**Etki:** Kapasite garantisi (tasarımın çekirdek vaadi) yarış altında ihlal edilebilir → kilitlenme geri döner. P0 çünkü "garanti L3'tedir" (§4) iddiasını çürütür.

**Savunma:** seq tahsisini O_EXCL-retry döngüsü olarak AÇIKÇA belirle (`for n in count..∞: try O_EXCL create waiting/<n> → success=seq`) VEYA promotion'ı dizin-listeleme + lexicographic-min + tek-yazar-rename ile seq dosyasına hiç bağlı kılmadan kur. Birim test: "N eşzamanlı acquire → granted ≤ capacity her zaman" (§9 "tek-kazanan-promotion" testi bunu kanıtlamalı; spec test listesinde var ama mekanizma yoksa test yazılamaz).

---

## [P0] Bulgu 3 — Saat-donması (K2) container `timeout $TIMEOUT` katmanında UYGULANAMAZ; spec yalnız result-collector/Auditor'ı adresliyor

**Spec referansı:** K2 "Bekleme saati dondurur"; §5.5 "Timeout-watchdog (spawn-backend-docker + result-collector deadline mantığı): hb'de taze WAITING_LEASE varsa deadline'ı bekleme süresi kadar uzatır."

**Kod kanıtı (çürütme):** `spawn-backend-docker.ts:652,656`:
```
TIMEOUT=${TASK_TIMEOUT:-<effectiveTimeout>}
timeout $TIMEOUT ${workerCmd} || echo "WORKER_TIMEOUT" > "$timeoutPath"
```
Bu, container içinde **shell `timeout` komutu** — worker (LLM agent) sürecinin TAMAMINI sarar ve **spawn anında SABİTLENMİŞ** bir wall-clock kill'dir. Worker, vitest'i shim üzerinden çağırıp lease kuyruğunda **15 dk** beklerse, bu bekleme `timeout $TIMEOUT`'un saymasını DURDURMAZ — `timeout` bu süreci dışarıdan sayar ve süre dolunca **SIGTERM/SIGKILL** atar. Runtime'da `$TIMEOUT`'u uzatmak imkânsız (zaten başlamış bir `timeout` invocation'ı).

**Senaryo:** capacity=2, 8 worker. w7 sıra-7'de ~20 dk bekler. Container timeout 30 dk ise w7'nin testi koşturmaya yalnız ~10 dk kalır; kuyruk daha uzunsa `timeout` w7'yi **lease beklerken/test ortasında öldürür** → `WORKER_TIMEOUT` → sentetik NO_GO. K2'nin "sentetik NO_GO ailesine yeni üye eklenmez" vaadi **ihlal edilir.**

**Etki:** Spec result-collector loop (`result-collector.ts:996` `Date.now()-startTime < timeout`) ve Auditor'ı doğru tespit etmiş ama **asıl öldürücü saat olan container-içi `timeout $TIMEOUT`'u atlamış.** Saat-donması iki ayrı katmanda yaşıyor; spec yalnız birini görüyor → kontrat eksik.

**Savunma:** Container `timeout`'unu lease-aware yap: ya (a) shim, lease beklerken `$TIMEOUT`'u uzatamayacağı için **bekleme süresini `timeout` SAYACINDAN ÇIKARMALI** — bu, `timeout cmd`'i bölmeyi gerektirir (örn. acquire'ı `timeout` DIŞINDA yap, sonra exec); ya da (b) `timeout`'u tamamen kaldırıp deadline'ı yalnız host-side watchdog'a taşı (mevcut `WORKER_TIMEOUT` yolu yeniden tasarlanır). Bu, "cerrahi" değil; §5.5'in iddia ettiğinden derin refactor.

---

## [P1] Bulgu 4 — Mevcut Docker hb-daemon (her 15 sn) WAITING_LEASE sentinel'ini EZER + format uyumsuz

**Spec referansı:** §5.5 "Shim beklerken `.tasks/task-XXX.hb` içine `WAITING_LEASE:<classId>:pos=<n>` yazar, her poll tick'inde mtime yeniler."

**Kod kanıtı (çürütme):** `spawn-backend-docker.ts:650`:
```
( SEQ=2; while true; do sleep 15; SEQ=$((SEQ+1));
  echo "{...\"status\":\"EXECUTING\"...}" > "$HBFILE"; done ) &
```
Docker backend, worker ile **paralel** bir arka-plan hb döngüsü çalıştırır ve `$HBFILE`'ı her 15 sn **JSON** olarak ve `status:"EXECUTING"` ile ÜZERİNE YAZAR (`>`). Shim'in yazdığı `WAITING_LEASE:<classId>:pos=<n>` **string sentinel** (a) en geç 15 sn içinde EXECUTING JSON ile silinir, (b) JSON şemasıyla uyumsuz (hb okuyucular `JSON.parse` eder — `heartbeat-types.ts` TaskStatus enum'unda `WAITING_LEASE` yok).

**Etki:** WAITING_LEASE-tabanlı deadline-uzatma sinyali **güvenilmez** — watchdog onu rastgele anlarda görür/görmez. Worst-case: watchdog hiç göremez → Bulgu 3'teki erken-kill kesinleşir.

**Savunma:** WAITING_LEASE'i ayrı dosyaya (`.tasks/task-XXX.lease-wait`) yaz, hb'yi kirletme; VEYA hb-daemon'u shim acquire sırasında duraklat/koordine et (env flag ile). Format ayrımı şart.

---

## [P1] Bulgu 5 — Sahte WAITING_LEASE'in arbiter-side doğrulaması YOK → saat-donması suistimali (sentetik-NO_GO-kaçınma istismarı)

**Spec referansı:** §5.5 (WAITING_LEASE hb → deadline uzar). Spec'te hb iddiasının `leases/waiting/<seq>-<holder>.json` kaydıyla **çapraz kontrolü tanımlı değil.**

**Kaçış senaryosu (B profili):** Worker, ASLA lease kuyruğuna girmeden, `.tasks/task-XXX.hb`'ye (veya Bulgu 4 nedeniyle ayrı dosyaya) sürekli taze `WAITING_LEASE:heavy-test:pos=1` yazar. Watchdog deadline'ı süresiz uzatır → worker **timeout'suz sonsuza** koşar (kaynak israfı / DoS / maliyet). Tasarım "bekleme = saat durur" vaadini sahte beklemeye açıyor.

**Etki:** Bulgu 4 (hb-daemon ezme) bunu docker'da KISMEN engeller (EXECUTING ezer) ama **subprocess/tmux backend'lerde** hb'yi shim/worker kontrol eder → orada istismar tam çalışır. Backend'e göre asimetrik güvenlik açığı.

**Savunma:** Watchdog deadline'ı uzatmadan ÖNCE `leases/<class>/waiting/`'de bu holder için GERÇEK bir kayıt olduğunu (ve seq'in makul olduğunu) **arbiter-side teyit etmeli.** hb yalnız worker-beyanı; tek doğruluk kaynağı leases/ dizini olmalı.

---

## [P1] Bulgu 6 — Fail-open, "bozuk leases/" yolunda DoS→bypass'a dönüşür; minimum bütünlük kontrolü yok

**Spec referansı:** §7 "Fail-open (ana ilke): … leases/ yazılamıyor, bozuk lease dosyası → komut SERBEST çalışır"; "Bozuk lease dosyası → stale say + temizle + devam."

**Kaçış senaryosu (B profili — proje RW mount, bkz. Bulgu 8):**
1. Worker `.deckent/leases/heavy-test/`'i siler / içine dizin-yerine-dosya koyar / `granted/`'i salt-okunur yapar / diski doldurur → arbiter "leases/ yazılamıyor" hatasına düşer → **fail-open** → o sınıf için gate TOPYEKÛN açılır → 8×vitest serbest → **kilitlenme.** "Geç müdahale = kilitlenme" tehdidi fail-open kapısından geri girer.
2. Daha sinsi: yalnız `seq` dosyasını boz → her acquire stale-temizleme + fail-open karışımı → öngörülemez davranış.

**Etki:** Fail-open doğru bir crash-güvenliği ilkesi (sprint'i düşürmemek) ama **adversarial bağlamda kasıtlı bozma ile gate-kapatma silahına** dönüşür. Spec, "transient hata" (disk dolu) ile "kasıtlı tahrip" (dizin silindi) arasında ayrım yapmıyor.

**Savunma:** Minimum bütünlük + **fail-closed/fail-degraded** seçeneği: leases/ yoksa **yeniden oluşturmayı dene**; ardışık-K-başarısızlıkta fail-open yerine **kapasiteyi 1'e düşür** (tam-açık değil) + yüksek-öncelik alarm (`emitProgress`/`notify`). Bozuk dosya = sahibini doğrula, körlemesine "stale say" değil. En azından "leases/ dizini yok" durumu fail-open DEĞİL, kritik-alarm + tek-akış olmalı.

---

## [P1] Bulgu 7 — "Korumasız katılımcı" problemi: host'ta elle `vitest`, 2. sprint, REPL gate'i HİÇ görmez

**Spec referansı:** §5.2 "mount'la container'lar arası paylaşımlı"; §3 Non-Goals "REPL/autonomous wire V2". Spec, paylaşılan makinede **shim PATH'ine sahip OLMAYAN** katılımcıları adreslemiyor.

**Kod kanıtı:** Lease store `.deckent/leases/` host FS'te (`spawn-backend-docker.ts:699` proje RW mount ile container'lara taşınır). Ama kapasite garantisi **yalnız shim-PATH'li süreçler** için geçerli.

**Senaryo:** Sprint capacity-2 heavy-test'i uygularken Alperen host terminalinde `npx vitest run` koşar (shim PATH yok) → makinede artık 3 eşzamanlı ağır test → kapasite ihlali, makine yine boğulur. Aynısı: ikinci eşzamanlı sprint (farklı proje ama aynı CPU/disk), REPL'in tek-agent test'i, `npm install` host-side. Lease store paylaşımlı olsa bile **gate'e abone olmayan** katılımcı sayılmaz.

**Etki:** Tasarım "makineyi koru" diyor ama gerçekte "shim'li worker'ları birbirine karşı koru" yapıyor. Makine-düzeyi garanti DEĞİL.

**Savunma:** Sınır açıkça belgelenmelidir (bu bir makine-genel cgroup/semafor değil). İdeal: opt-in `deckent lease acquire <class>` CLI'ı host-side koşulara da takılabilsin (insan/script gönüllü katılımı). En azından spec "Non-Goals"a "shim'siz host süreçlerine karşı koruma yok" eklemeli — bugün sessiz.

---

## [P1] Bulgu 8 — Lease-store + shim bütünlüğü: tüm proje RW mount → spoof / pin / sil mümkün; Auditor yalnız advisory

**Spec referansı:** §5.4 "Shim dosyaları worker `scope.filesWrite` DIŞINDA … worker düzenlemesi Auditor ihlal sinyali"; §7 fail-open.

**Kod kanıtı:** `spawn-backend-docker.ts:699` → `-v ${dir}:${CONTAINER_WORKSPACE}` (salt-okunur DEĞİL; satır-içi yorum "Project mounted read-write"). Yani worker container'ı `.deckent/leases/` ve `.deckent/shims/`'e **tam RW** erişir. ADR-037 dersi gereği scope-ihlali **bloke etmez** (advisory/soft — Gotchas + ADR-037 V1.0). Auditor `git diff --stat` ile sonradan görür ama `.deckent/` çoğu yerde gitignored → diff'te bile görünmeyebilir.

**Kaçış senaryoları (B profili):**
1. **Sıra atlama:** worker doğrudan `granted/1-<self>.json` yazar (acquire'ı atlayıp) → kapasiteyi şişirir / sıra atlar.
2. **Lease pinleme (starvation):** worker sahip olduğu granted dosyasını periyodik `touch`'lar → mtime taze kalır → stale-cleanup hiç tetiklenmez (§5.2 stale = mtime>ttl) → lease **süresiz** tutulur → diğerleri açlıkta.
3. **Shim devre-dışı:** worker `.deckent/shims/current/vitest`'i siler/boşaltır → kendi gate'ini kapatır (advisory ihlal, bloke yok).

**Etki:** Hard-gate'in "dişli" olma iddiası, mount RW + advisory-enforcement nedeniyle B profiline karşı zayıf. ADR-037'nin advisory dersinin tekrarına yaklaşıyor.

**Savunma:** `.deckent/leases` + `.deckent/shims`'i container'a **salt-okunur** ayrı mount'la (worker yazamaz; yalnız arbiter-host yazar) — `.tasks`/`.locks` RW kalır ama lease/shim RW olmamalı. Acquire/release host-side bir IPC ile (mevcut askBrain IPC deseni) yapılabilir, container içi dosya-yazımına bağlı kalmadan. En azından granted JSON'una holder-imzası (HMAC) + arbiter-side doğrulama.

---

## [P1] Bulgu 9 — `reject` policy'de eşzamanlı çift-grant yarışı (check-then-rename atomik değil)

**Spec referansı:** §5.3 `db-migration` `"policy":"reject"` capacity 1; §7 "reject çakışması … açık i18n hata → worker dürüst NO_GO". §5.2 acquire algoritması reject için ayrı tanımlı DEĞİL.

**Kaçış/yarış senaryosu:** İki worker eşzamanlı `acquire('db-migration')`. Algoritma "granted<capacity VE seq==min" kontrolü yapar; reject'in fast-path'i tanımsız. Eğer ikisi de `granted=0` (capacity 1) okur ve check-then-rename arası atomik değilse → ikisi de `granted/<seq>-<holder>.json` yazar (farklı ad → ikisi de başarılı) → **iki migration aynı anda koşar** = tam olarak reject'in önlemesi gereken felaket (DB bozulması).
- Ters uç (DIRECTIVES sorusu): ikisi de waiting yazıp reject'e düşerse → **ikisi de reddedilir** → iki worker NO_GO → migration HİÇ koşmaz → Brain FIX döngüsünde aynı yarış tekrar (livelock riski).

**Etki:** capacity-1 reject, en yüksek-riskli sınıf (DB migration); burada double-grant veri-bütünlüğü P0-yakını sonuç doğurur. Atomiklik kanıtlanmadan reject "güvenli serileştirme" sağlamaz.

**Savunma:** Tek-yazar promotion'ı O_EXCL ile `granted/HOLDER.lock` (capacity-1 için bilinen ad) üzerinden kur — Bulgu 2'nin atomiklik çözümüyle aynı kök. reject fast-path'i açıkça: "O_EXCL granted-slot dene; EEXIST → reject". Birim test: "2 eşzamanlı reject → tam 1 grant, tam 1 reject" (§9'a eklenecek).

---

## [P2] Bulgu 10 — Crash penceresi: SIGKILL/OOM'da `trap release EXIT` koşmaz; TTL 1800 sn kapasite kaybı; pid-liveness yok

**Spec referansı:** §5.4 "shim: acquire → `trap release EXIT`"; §5.2 stale "mtime>ttl"; §6 "w2 crash → TTL/mtime stale → temizlik."

**Kod kanıtı:** Sprint 139 dersi (DECKENT.md/IDENTITY.md "Docker HB Core Fix … SIGTERM fsync handler") + `spawn-backend-docker.ts:648` SIGTERM trap'i — ama **SIGKILL/OOM-kill trap çalıştırmaz** (POSIX). `heavy-test` ttl=1800 sn.

**Senaryo:** capacity-2 heavy-test holder'ı OOM-kill (137) ile düşer → `trap release EXIT` ÇALIŞMAZ → granted dosyası kalır → mtime tazeliği son yazımdan sayılır → **30 dakikaya kadar** kapasite-1'e düşmüş kuyrukta herkes bekler. Bu, tasarımın çözmek istediği "kaynak boğulması"nı **gecikmeli açlığa** çevirir.

**Etki:** Crash kurtarması yalnız TTL'e dayanıyor; OOM (bu sistemin en olası crash'i — RAM çekişmesi!) için 1800 sn çok uzun.

**Savunma:** **pid/heartbeat-liveness erken-tespit:** granted JSON'una `pid`+`hbPath` yaz; stale-tarayıcı "pid ölü VEYA hb mtime > 2×poll" → ttl beklemeden temizle. Mevcut Auditor liveness-probe deseni (`auditor.ts:324` `batchProbeLiveness`) yeniden kullanılabilir. ttl yalnız son-çare olmalı.

---

## [P2] Bulgu 11 — Shim adı/içerik injection: match-regex'ten binary adı türetimi + config-pushed sınıflar

**Spec referansı:** §5.4 "shim'ler … match listesinden türetilir"; §5.3 "ürün data-update gönderir" (resource_classes harici veriden gelebilir); §8 nervous-önerisi yeni kural ekler.

**Kaçış senaryosu:** Shim dosya adı, `match` regex'inden çıkarılır (`\bvitest\b` → `vitest`). Sınıf tanımları **veri** olduğundan (kullanıcı config'i veya "ürün data-update" veya nervous-önerisi) güvenilmeyen kaynaktan gelebilir. Kötü/sakar bir `match` (örn. `"; rm -rf"` ya da `"../../etc/cron.d/x"` benzeri) → naif türetme → (a) **path-traversal'lı shim dosya adı**, (b) shim **içeriğine** (üretilen shell script'i) binary-adı interpolasyonuyla **komut injection**. Shim'ler 0755 shell script (`spawn-backend-docker.ts:660` deseni) → injection doğrudan host-yürütmeye gider (spawner host-side üretir).

**Etki:** Supply-chain-benzeri vektör: "zamanla içeriye ekleme" (§8) ürünleştikçe, güvenilmeyen sınıf-verisi host'ta kod yürütebilir. Severity P2 (kötü/uzlaşılmış config gerekir) ama nervous-auto-öneri + ürün-push yolları bunu uzaktan-erişilebilir kılar.

**Savunma:** Binary adı için katı allow-list/regex (`^[a-zA-Z0-9._-]+$`); regex'ten türetme YERİNE sınıf tanımında **açık `binaries: string[]`** alanı (regex yalnız runtime-match için, dosya-adı için değil). Shim içeriğinde tüm değişkenler shell-quote'lanmalı. nervous-önerisi şema-doğrulamadan geçmeli.

---

## [P2] Bulgu 12 — Starvation/livelock & polling gecikmesi: capacity>1 tek-promoter serileştirir, 1-2 sn × derin kuyruk

**Spec referansı:** §5.2 "capacity>1'de ardışık tick'lerde dolar (1-2 sn ek gecikme kabul)"; §7 "Açlık: FIFO seq garantisi; promotion yalnız head-of-line."

**Analiz/senaryo:**
- **Soğuk-başlangıç serileştirme:** capacity=C boş havuz; her tick yalnız `seq==min` promote ettiği için C slotu doldurmak **C tick = C×(1-2 sn)** sürer. C küçük (auto formülü 2) için kabul, ama "auto" 3'e (40GB/20core makinede) çıkınca + her release sonrası tek-promote → throughput düşer.
- **FIFO + head-of-line adalet:** seq tahsisi yarışı (Bulgu 2) bozulursa FIFO da bozulur → açlık garantisi seq-atomikliğine BAĞLI; o çözülmeden "açlık yok" iddiası kanıtsız.
- **Polling savurganlığı:** 6 bekleyen × 1-2 sn poll → her biri sürekli mtime-yazımı (Bulgu 4 hb + waiting mtime) → paylaşılan disk I/O artışı; ironik olarak korumaya çalıştığı IO-çekişmesine katkı.

**Etki:** Doğruluk-bozucu değil ama performans/adalet, seq-atomikliğine ve poll-frekansına duyarlı; spec "1-2 sn kabul" diyerek geçmiş.

**Savunma:** Release-anında **toplu promote** (granted<capacity olduğu sürece sıradaki K'yı tek tick'te al), tek-tek değil. Poll'ü exponential-backoff + (mümkünse) `fs.watch` ile olay-tabanlı yap. seq-atomikliği (Bulgu 2) önkoşul.

---

## [P3] Bulgu 13 — `capacity:"auto"` formülü host-detector'da eksik veri (cores) + `notification-dispatcher` atfı yanlış

**Spec referansı:** §5.3 "host-detector'dan formül: `max(1,min(3,floor(totalGB/16),floor(cores/4)))`"; §5.6 "`emitProgress` (PROGRESS channel) + `notify('progress')` … `src/core/notification-dispatcher.ts`".

**Kod kanıtı (kısmi çürütme):**
- `host-detector.ts` yalnız `totalGB` döndürür (`detectHostMemory`); **CPU `cores` YOK** → formülün `floor(cores/4)` parçası başka modülden (`system-profile.ts`/`system-capacity.ts`/`os.cpus()`) gelmeli. "host-detector'dan formül" ifadesi tek-kaynak izlenimi veriyor; gerçekte iki-kaynak.
- notify yüzeyi `src/core/notify.ts:47` (`notify`) + `notifyProgress:98`; PROGRESS/emitProgress `src/core/event-stream.ts`. DIRECTIVES'in işaret ettiği `notification-dispatcher.ts` notify fonksiyonunu **içermiyor** (grep 0). Yüzeyler VAR ama spec'in modül atfı yanlış → implementasyonda yanlış dosyaya bağlama riski.

**Etki:** Düşük; doğru modüller mevcut, yalnız spec'teki atıf isimleri güncellenmeli (aksi halde worker yanlış dosyada arar).

**Savunma:** Formül kaynağını netleştir: RAM=`host-detector.detectHostMemory`, cores=`os.cpus().length`/`system-profile`. notify atfını `core/notify.ts` + `core/event-stream.ts` olarak düzelt.

---

## Teyit Edilen Güçlü Yönler (dengeli denetim)

- **[Strength] Fail-open default doğru crash-güvenliği:** "yeni katman sprint'i/REPL'i ASLA düşürmez" (§7) Sprint-280 fail-safe ruhuyla tutarlı; tek-katmanlı bypass riskine rağmen (Bulgu 6) **çökme-güvenliği** ilkesi doğru. Sorun fail-open'ın kendisi değil, "kasıtlı bozma" ile "transient hata"yı ayırmaması.
- **[Strength] Hakem deterministik kod, LLM değil (K4):** Gecikme/maliyet/Brain-yokluğu gerekçesi sağlam; REPL-solo + autonomous için doğru karar.
- **[Strength] `.locks` deseninin yeniden kullanımı (K3):** Daemon'suz, O_EXCL + stale-cleanup (`file-lock.ts` `acquireLock`/`clearStaleLocks`) mevcut+test-edilmiş desen — en az yeni hata-noktası argümanı geçerli (atomik-seq hariç, Bulgu 2).
- **[Strength] Air-gapped/offline uyumu (AS-7):** Ağ/daemon yok → offline aynen çalışır; enterprise V2 için `LeaseBackend` arayüzü provider-adapter desenine uygun temiz soyutlama.
- **[Strength] `capacity:"auto"` zero-hard-code yönelimi:** Sabit-sayı gömmeme (ADR-070 ruhu) ve config-override doğru; yalnız kaynak-modül atfı netleştirilmeli (Bulgu 13).
- **[Strength] İzin-önce-eylem içgörüsü (§1) doğru teşhis:** "tespit-sonra-müdahale matematiksel olarak geç" tespiti ADR-037 advisory dersiyle tutarlı ve admission-control literatürüyle (aşağı) hizalı — problem teşhisi sağlam; zayıflık ENFORCEMENT mekanizmasında.

---

## Verdict: REWORK

Çekirdek fikir (izin-önce-eylem admission-control, dosya-tabanlı lease, fail-open crash-güvenliği, deterministik hakem) **sağlam ve kurtarılabilir** — ancak adversarial mercek altında, **seçilen enforcement mekanizması tasarlandığı tehdidi karşılamıyor** ve birden fazla P0-sınıfı blocker implementasyon-öncesi temel revizyon gerektiriyor. Mevcut haliyle hard-gate, hem dürüst worker'ın en doğal komutunda devreye girmiyor hem de kapasite garantisini yarış altında ihlal edebiliyor.

**En kritik 3 madde (implementasyondan ÖNCE çözülmeli):**

1. **[P0 — Bulgu 1] PATH-shim mekanizması motive-edici senaryoda sızdırıyor.** `npm test` (projenin DOKÜMANTE komutu), `npx vitest run` (spec'in KENDİ örneği) ve `node …vitest.mjs` shim'i atlar — çünkü npm/npx `node_modules/.bin`'i PATH'in başına ekler. 8-worker-vitest koruması bugün **sıfır**. Çözüm: `NODE_OPTIONS=--require` preload kancası veya vitest-pool semaforu gibi npm/npx/node-bağışık bir katman; PATH-shim tek başına yetmez.

2. **[P0 — Bulgu 2+3] Atomiklik ve saat-donması temelleri eksik.** "Monoton seq atomik artırım" mevcut O_EXCL deseninden türetilemez → seq-collision → çift-promosyon → kapasite ihlali (Bulgu 2). Ayrıca saat-donması (K2) container-içi `timeout $TIMEOUT` (spawn-backend-docker.ts:656) katmanında uygulanamaz; lease-bekleme sabit container timeout'unu yer → SIGKILL → sentetik NO_GO (Bulgu 3). İkisi de "garanti L3'tedir / saat durur" çekirdek vaatlerini çürütüyor.

3. **[P1 — Bulgu 6+8] Hard-gate B profiline karşı dişli değil + fail-open silahlaştırılabilir.** Tüm proje RW-mount (spawn-backend-docker.ts:699) + ADR-037 advisory-enforcement → worker `granted/` JSON spoof'lar, lease'i `touch`'la pinler, leases/'i bozarak fail-open ile gate'i topyekûn kapatır (DoS→bypass). Çözüm: `.deckent/leases`+`.deckent/shims` salt-okunur mount + arbiter-side IPC/imza doğrulama + fail-open yerine "kasıtlı-bozma"da fail-degraded (capacity→1) + kritik alarm.

> **Not:** Yukarıdaki 3 madde + Bulgu 4/5/7/9 çözülürse tasarım APPROVE_WITH_CHANGES'e taşınabilir. Bulgu 10-13 implementasyon-sırası iyileştirmeleri (blocker değil). Mimari/eşzamanlılık derinliği için kardeş rapor `01-architecture-correctness.md`, ürün perspektifi için `03-product-perspective.md`.
