# Resource Arbiter Spec — Mimari & Eşzamanlılık Doğruluğu Denetimi

**Task:** 281-001 · **Perspektif:** Architect (system-architect + typescript-expert) · **Tarih:** 2026-06-11
**Denetlenen:** `docs/superpowers/specs/2026-06-11-resource-arbiter-design.md` (commit fbaed64b)
**Yöntem:** AUDIT (ADR-053, read-only). Tüm iddialar gerçek koddan `file:line` ile teyit/çürüt edildi.

---

## 0. Yönetici Özeti

Tasarımın **çekirdek tezi sağlam**: izin-önce-eylem (admission control) + deterministik kod hakemi + dosya-tabanlı
backend + fail-open ilkesi, deckent'in mevcut `.locks` / `clearStaleLocks` / 3-katman-config / Sprint-280
PROGRESS-notify desenleriyle iyi hizalanıyor. Ancak **eşzamanlılık çekirdeğinde (FileLeaseBackend §5.2) ve
saat-donması kontratında (§5.5) iki yapısal P1 problem** var ki bunlar implementasyona girmeden netleştirilmezse
"capacity ihlali" ve "lease-bekleyen worker yine de timeout'ta ölür" hatalarını üretir. Detaylar aşağıda.

Aşağıda **18 madde** (teyit + bulgu) + Verdict. Severity: P0=blocker, P1=major, P2=minor, P3=nit.

---

## (a) FileLeaseBackend Algoritması (§5.1–§5.2) — Eşzamanlılık Çekirdeği

### [P1] Monoton `seq` atomik-artırımı çözülmemiş bir primitif — "file-lock deseni yetiyor" iddiası YANLIŞ

Spec §5.2: `seq` dosyası "monoton sayaç (atomik artırım, **file-lock deseni**)" diyerek mevcut `file-lock.ts`
desenine atıf yapıyor. **Mevcut `file-lock.ts` bir sayaç/increment primitifi sağlamıyor.** Gerçek desen yalnız
*create-or-fail*'dir: `acquireLock` (`src/core/file-lock.ts:60`) ve `acquireSpawnLock` (`:335`) `openSync(..., O_WRONLY|O_CREAT|O_EXCL)`
ile (`:100`, `:369`) **tek bir dosyanın atomik OLUŞTURULMASINI** garanti eder — bir tamsayıyı atomik
**artırmayı** değil. Naif "oku→+1→yaz" (read-modify-write) iki worker arasında yarışır: ikisi de `seq=5` okur,
ikisi de `seq=6` yazar → **çakışan seq**.

Bu kritik çünkü §5.2'nin tüm tek-kazanan garantisi (`seq == min(waiting)`) seq'in **benzersiz + monoton**
olmasına dayanır. Çakışan seq → iki waiter de "min" olur → capacity=1'de bile **çift promotion → capacity ihlali**.
**Öneri:** atomik seq için kanıtlanmış desen seç ve spec'e yaz — örn. `O_EXCL` ile `seq/<n>.tok` sentinel
dosyaları oluştur, başarılı olana kadar n'i artır (O_EXCL doğal serileştirir), sonra `max(n)` head'i belirler.
"file-lock deseni yetiyor" cümlesi olduğu gibi bırakılırsa implementasyon naif counter yazıp sessizce racele olur.

### [P1] `renew()` granted-holder yaşam döngüsü tanımsız → uzun exec sırasında false-stale-clean → capacity over-subscription

§5.1 `renew(classId, seq)` tanımlıyor; §5.2 yalnız **waiting** tarafı için mtime yenilemeyi belirtiyor
("waiting mtime yenile"). **GRANTED holder'ın lease mtime'ını exec boyunca kim yeniliyor — spec söylemiyor.**
Sonuç: bir holder `ttlSeconds` (heavy-test=1800s) içinde biten bir iş yapıyorsa sorun yok; ama exec ttl'i aşarsa
(yavaş suite, IO contention) `granted/<seq>` mtime'ı yaşlanır → eşzamanlı bir waiter'ın stale-clean'i
(§5.2 "mtime > ttl → temizlenir") **canlı, hâlâ çalışan holder'ı siler** → o slotu boş sanıp promote eder →
**capacity over-subscription** (tam da arbiter'ın engellemesi gereken durum). Mevcut `clearStaleLocks`
(`src/core/file-lock.ts:221`) acquiredAt/ttl tabanlı aynı mantığı kullanıyor — orada da uzun-ömürlü lock'lar
için TTL bir "max-tutma" bombasıdır, kurtarma ağı değil.

**Öneri:** GRANTED holder için arka-plan mtime-renewer ZORUNLU (docker hb loop deseni gibi — `spawn-backend-docker.ts:650`'deki
15s subshell). Spec §5.4'e "shim, granted lease'i exec boyunca arka-plan subshell ile her ttl/3'te bir renew eder"
maddesi eklenmeli. Aksi halde ttl crash-recovery için değil, sessiz capacity-ihlali kaynağı olur.

### [P1] Shim `exec` kullanırsa `trap release EXIT` ÇALIŞMAZ — exec trap'leri atar

§5.4: "Shim: `acquire(class)` → **`trap release EXIT`** → kendi dizinini PATH'ten çıkararak gerçek binary'yi
**exec eder**." Bu iki ifade çelişkili: POSIX `exec` shell süreç imajını yerine koyar → **shell ve tüm trap'leri yok olur**;
gerçek binary çıkınca EXIT trap'i ASLA tetiklenmez → lease release edilmez → slot TTL dolana dek (1800s!) ölü kalır.
Karşılaştırma: `spawn-backend-docker.ts:646-648` worker'ı `exec` ETMEDEN child olarak koşturup trap'leri korur
(`trap on_exit EXIT` + `trap ... TERM`) — doğru desen budur.

**Öneri:** shim gerçek binary'yi **child olarak** koşmalı (`real_binary "$@"; rc=$?; release; exit $rc`) — `exec` DEĞİL.
Bu aynı zamanda yukarıdaki arka-plan renewer'ı da mümkün kılar (exec'te subshell de ölürdü). §5.4 metni düzeltilmeli.

### [P2] Shim (shell) → arbiter (TS) köprüsü eksik bileşen — ADR-008/tek-kaynak gerilimi

§5.1 arbiter'ı TS modülü (`LeaseBackend` arayüzü, `src/core/resource-arbiter.ts`), §5.4 shim'i **shell script**
olarak tanımlıyor. Bir shell script TS fonksiyonu `import` edemez. Köprü iki seçenekten biri olmalı ama spec
hiçbirini adlandırmıyor: (1) shim, bir node CLI entrypoint'i çağırır (`node dist/.../lease-cli.js acquire heavy-test`)
— yeni bir bileşen; veya (2) lease mantığı POSIX shell'de yeniden yazılır — `FileLeaseBackend` ile **çift
implementasyon**, divergence riski, system-architect skill'inin "tek kaynak" ilkesi ihlali. **Öneri:** §5.4'e
"shim, `deckent lease acquire/release` CLI alt-komutunu çağırır; lease mantığı tek yerde (arbiter) kalır" maddesi
eklenmeli. Bu aynı zamanda `deckent lease ls` (§5.6) ile aynı entrypoint'i paylaşır — temiz.

### [P3 / teyit] Atomik rename tek-kazanan İÇİN gerekli değil — gerçek garanti `min(waiting)` + benzersiz seq'te

§5.2 "atomik rename ile (tek-kazanan)" diyor. Teknik nüans: her waiter **kendi** `waiting/<seq>-<holder>.json`
dosyasını rename ettiği için rename'ler farklı kaynaklara dokunur — rename atomikliği burada waiter'lar arası
çekişme çözmez. Gerçek tek-kazanan, yalnız tek bir waiter'ın `seq == min(waiting)` testini geçmesinden gelir.
Yani tüm yük yukarıdaki [P1] seq-benzersizliğine biner. Tasarım yine de **doğru olabilir** — ama gerekçe spec'te
yanlış yere konmuş; rename değil, seq-monotonisitesi garantidir. Netlik için düzeltilmeli (tasarım davranışı değişmez).

### [P3 / teyit] mtime-tabanlı TTL Docker bind-mount'ta GÜVENİLİR — iddia doğrulandı

Endişe yerinde sorulmuş ama tasarım için olumlu: `.deckent/leases/` bind-mount'ta (`.tasks`/`.locks` gibi) host
fs'inde yaşar; inode host kernel'inde olduğundan mtime'ı **host kernel** damgalar — container içi/dışı tüm yazımlar
aynı saatle damgalanır. Docker varsayılanı per-container saat vermez (host clock paylaşılır), dolayısıyla stale-clean'in
`Date.now() - mtime` karşılaştırması container içinden koşsa bile tutarlıdır. Spec §7 "tek makine, tutarlı" iddiası
**doğru**. Tek koşul: leases/ gerçekten bind-mount volume'da olmalı (§5.2 bunu söylüyor) ve renewer mtime'ı
gerçekten touch etmeli (write/utimes host kernel'den mtime günceller). ✓

---

## (b) ADR Uyumu (§11)

### [P3 / teyit] ADR-008 (core→orchestra tek yön) — iddia tutarlı

Arbiter core/'da (`node:fs` yalnız, §5.1), shim+L1-packing orchestra/'da. Bağımlılık yönü orchestra→core
(shim arbiter'ı tüketir) — ADR-008'in koruduğu yöndür (`adr-008` gövdesi: "core/ orchestra'dan import etmez").
§5.5'in result-collector + spawn-backend-docker tarafına WAITING_LEASE okuması koyması da orchestra-içi kalır.
**Çelişki yok.** (Not: ADR-008'in bilinen kalan tek ihlali `routing-engine.ts:30 → ecosystem-intelligence` bu
spec'le ilgisiz; arbiter yeni ihlal getirmiyor.)

### [P3 / teyit] ADR-010 (yeni dependency yok) — doğru

`FileLeaseBackend` `node:fs` ile yazılabilir (file-lock.ts'in `openSync/readdirSync/unlinkSync` desenleri yeterli,
`src/core/file-lock.ts:12-15`). Shim POSIX sh. Yeni runtime paketi yok → ADR-010 (ve Sprint-281 amendment'ı)
ile uyumlu. ✓

### [P2] ADR-037 ile ilişki — "çelişki yok, tamamlayıcı" iddiası doğru AMA enforcement felsefesi farkı vurgulanmalı

§11 "ADR-037: ilk gerçek hard-enforce katmanı — RBAC advisory'sinin tamamlayıcısı" diyor. Teyit: ADR-037 V1.0
runtime'da **advisory/soft** (`checkWorkerAuthority` violation'da `return true` — ADR-037 amendment'ında re-doğrulandı).
Arbiter ise §2-K1'de **hard gate** vaat ediyor. İkisi farklı scope (RBAC=rol-yetki, arbiter=kaynak-kapasite) →
çelişki yok ✓. **Ancak** bir mimari tutarlılık sorusu var: deckent'in TÜM mevcut enforcement'ı (ADR-037 L2,
enforceVerifyLoop, scope-violation) bilinçle soft/advisory iken, arbiter ürünün **ilk hard-blocking** mekanizması
olacak. Bu felsefi sapma spec'te bir cümleyle gerekçelendirilmeli (§2-K1 gerekçesi "geç müdahale=kilitlenme" iyi
ama "neden burada hard, RBAC'ta soft" ayrımı net olmalı) — yoksa "neden worker scope-ihlali bloke etmiyor ama
vitest bloke ediyor?" sorusu gelir. Fail-open (§7) bu sertliği yumuşatıyor; bu bağ açıkça kurulmalı.

### [P1] ADR-045/064 — "TOPP dispatch erteleme" iddiası mevcut dispatch'te KARŞILIĞI YOK (yeni kod gerekir)

§4-L1: "TOPP (ADR-064) yolunda: dispatcher doygun sınıfın task'ını erteleyip başka task seçer." Gerçek dispatch
yolu okundu: `result-collector.ts:787` `dispatchTick` → `processQueue` + `maybeRespawn`; eligible seçim
`selectEligibleForSpawn` / `dispatchReadyTasks` (`:915`) / `findReadyUndispatchedTasks` ile yapılıyor ve tek
kriter **slot-müsaitliği (`computeSlotsAvailable`) + bağımlılık-hazırlığı**. **Resource-class farkındalığı SIFIR** —
kod bir task'ı "sınıfı doygun" diye erteleyemiyor bugün. Yani §4-L1 mevcut dispatch'i *genişletme* değil, dispatch
seçicisine **yeni class-aware filtreleme** enjeksiyonu (yeni kod). İddianın "L1 doğruluk garantisi vermez, optimizasyon"
kısmı bunu kurtarıyor (P0 değil), ama "TOPP yoluna ek" ifadesi mevcut bir kancayı ima ediyor — yok. **Öneri:**
§4'e "L1, `selectEligibleForSpawn`/`findReadyUndispatchedTasks` içine class-doygunluk filtresi ekler (yeni kod)"
diye netleştir; aksi halde planlayan "mevcut hook'a takarım" sanıp altyapı bulamaz.

### [P3 / teyit] ADR-087 (async/hermetik) — test stratejisi (§9) uyumlu

§9 "async spawn (spawnSync YASAK), tmpdir, gitignored-state okunmaz (ADR-087/test:ci-sim)" — ADR-087 (yeni,
accepted 2026-06-11) ile birebir. ✓ İroni notu (P3): mevcut `spawn-backend-docker.ts` ve `auditor.ts` hâlâ
`spawnSync` kullanıyor (ADR-087-W borç olarak izleniyor); arbiter'ın YENİ kodu bu borca eklenmemeli — §9'daki
async-spawn kuralı arbiter entegrasyon testleri (§9 "2 gerçek subprocess") için bağlayıcı tutulmalı.

---

## (c) Saat-Donması Kontratı (§5.5, K2) — En Riskli Bölüm

### [P1] Bağlayıcı timeout in-container `timeout` coreutil'i — host'tan "deadline uzatma" YAPILAMAZ

§5.5: "Timeout-watchdog (**spawn-backend-docker** + result-collector deadline mantığı): hb'de taze WAITING_LEASE
varsa deadline'ı bekleme süresi kadar uzatır." Gerçek docker timeout mekanizması okundu:
`spawn-backend-docker.ts:656` → `timeout $TIMEOUT ${workerCmd} || echo WORKER_TIMEOUT > ...`, `$TIMEOUT`
spawn anında baked (`:652` `TIMEOUT=${TASK_TIMEOUT:-effectiveTimeout}`, default 1200s `:31`). Bu **container içi
`timeout` coreutil'i**, worker-CLI exec'inden itibaren **duvar-saati** sayar ve **dışarıdan duraklatılamaz/uzatılamaz**.
Lease beklemesi worker'ın `timeout $TIMEOUT` penceresi İÇİNDE olur (shim, worker'ın çalışması sırasında `vitest`
çağırır) → bekleme **doğrudan worker'ın timeout bütçesini yer**. Host'taki result-collector hb'yi okuyup
"deadline uzat" diyemez çünkü öldüren saat container içindedir. **Bu, K2'nin ("bekleme saati dondurur") docker
backend'de en kritik vaadini boşa çıkarır.**

**Öneri (üç seçenek, spec seçmeli):** (1) Lease-acquire'ı `timeout $TIMEOUT` SARMASININ DIŞINA al — shim worker
CLI'dan önce değil, ama wrapper script seviyesinde acquire et (mimari olarak zor: hangi sınıf gerekeceği worker
çalışana dek bilinmez); (2) `$TIMEOUT`'u lease-bekleme tahminiyle cömert hesapla (kaba, K2'nin "kesin" vaadini
zayıflatır); (3) Shim, beklediği süreyi ölçüp `timeout`'u **kendi** yönetsin (worker CLI'ı shim `timeout`'u içinde,
ama lease-bekleme shim'in kendi sub-timeout'unun dışında). En temizi (3) ama §5.5 bunu hiç tarif etmiyor. Bu
madde netleşmeden K2 docker'da **kâğıt üstünde** kalır.

### [P1] result-collector deadline'ı düz sprint-geneli timeout — per-task değil; "deadline uzar" buraya da oturmuyor

§5.5 "result-collector deadline mantığı"na atıf yapıyor. Gerçek: `result-collector.ts:996`
`while (unlimited || Date.now() - startTime < timeout)` — bu **tüm sprint için tek, düz** bir deadline
(`:515` default 30dk, 0=sınırsız). Per-task deadline takibi YOK; `.timeout` marker'ı (`:648-651`) worker'ın
KENDİ (container-içi) timeout'undan üretilir, result-collector üretmez. Yani §5.5'in "hb'de taze WAITING_LEASE
varsa deadline uzar" kontratını result-collector'a uygulamak için **per-task deadline state'i + hb-WAITING_LEASE
okuyucu** sıfırdan eklenmeli — "cerrahi" değil, orta-çaplı yeni durum makinesi. Üstelik bu OUTER deadline zaten
bağlayıcı değil (yukarıdaki inner coreutil önce öldürür). **Öneri:** §5.5 hangi timeout'u uzattığını netleştirmeli
ve gerçek bağlayıcının inner container-timeout olduğunu kabul etmeli.

### [P2 / teyit] Auditor stale-heartbeat tarafı — WAITING_LEASE zaten sorunsuz (kod-değişikliği GEREKMEYEBİLİR)

§5.5 "Auditor: taze-mtime'lı WAITING_LEASE hb'si sağlıklıdır — stale-heartbeat alarmı üretmez." İyi haber: bu
ZATEN böyle çalışır, özel WAITING_LEASE tanıması gerekmeden. `auditor.ts:355` `isWorkerStale`:
(1) **birincil sinyal** hb timestamp tazeliği (`:366-368`) — shim her poll tick'inde mtime+timestamp yeniliyorsa
(§5.5 söylüyor) auditor zaten "taze → stale değil" der; (2) timestamp eskise bile **Signal B process-alive**
(`:382-390`) — bekleyen worker süreci canlı (shim sleep'te) → stale bastırılır; (3) Signal C monoton seq artışı
(`:392-397`). Yani auditor tarafı tasarımın en kolay parçası — **bonus**. §5.5 "WAITING_LEASE'i auditor tanımalı"
ima ediyorsa over-engineering; sadece "shim hb'yi taze tutar, mevcut multi-signal stale-detection bunu zaten
sağlıklı sayar" demek yeterli. (P2: spec'i basitleştirme fırsatı.)

---

## (d) L1 Plan-Time Packing (§4)

### [P1] `buildCollisionAwareWaves` capacity=1 (tam serileştirme) anlamlısı — capacity=N "ağır sınıf çoklu" İFADE EDEMEZ

§4-L1: "aynı ağır sınıfa dokunması beklenen task sayısı wave/dispatch başına **kapasiteyle** sınırlanır" —
`detectScopeCollisions → buildCollisionAwareWaves` genişlemesi olarak sunuluyor. Mevcut kod okundu
(`conflict-resolver.ts:227`): `buildCollisionAwareWaves` çakışan her çift için **sentetik bağımlılık kenarı**
ekliyor (`:242-251` "lower ID → higher ID") → çakışanlar **farklı wave'lere** düşer = **tam serileştirme
(capacity=1 semantiği)**. heavy-test `capacity:2` için gereken "wave başına EN FAZLA 2" ifadesi bu pairwise-edge
modeliyle **kurulamaz** (kenar modeli "ya bağımlı ya değil" — "en fazla N eşzamanlı" sayım kısıtı değildir).
`maxWorkers` bölmesi (`:264-273`) wave'i bölüyor ama bu global maxWorkers, sınıf-başına capacity değil.

Ayrıca `detectScopeCollisions` (`:173`) **yalnız `task.scope.filesWrite`** üzerinden çalışır (dosya yolu) —
resource-class tamamen FARKLI bir sinyal. Yani §4'ün "detectScopeCollisions'ın kaynak-boyutuna genişlemesi"
ifadesi yanıltıcı: bu fonksiyonun *genişlemesi* değil, **yeni bir packing boyutu** (class-başına sayaç + capacity
karşılaştırması). Canlı çağrı yolları teyit edildi (`dependency-scheduler.ts:151`, `sprint-spawner.ts:370`) —
yani genişletme runtime'a ulaşır, ama mantık yeniden yazılmalı. **Öneri:** §4 "L1 için yeni bir class-capacity
packer yazılır (mevcut file-collision'dan ayrı); pairwise-edge değil, wave-başına class-sayaç ≤ capacity kısıtı"
diye netleştirilmeli. (P0 değil çünkü L3 hard-gate doğruluğu garantiliyor; L1 sadece optimizasyon.)

### [P2] TaskKind→resource-class çıkarım sinyali belirsiz — planner çıktısından üretilebilir mi?

§4-L1 ve §6, bir task'ın hangi resource-class'a "dokunacağını" plan-time'da bilmeyi gerektiriyor ama bu sinyalin
KAYNAĞI spec'te yok. L3 (runtime) regex-match ile komutu yakalıyor (§5.3 `match`), ama L1 plan-time'da komut
henüz çalışmadı — task yalnız `description`/`scope` içeriyor. "Bu task vitest koşacak" çıkarımı: (1) heuristik
(description'da "test" geçiyorsa heavy-test) — kırılgan; (2) directive'e açık `- ResourceClass:` alanı eklemek —
temiz ama spec'te yok; (3) ADR-053 TaskKind taksonomisinden türetmek (audit/document/code-dev) — ama bu kaba.
**Öneri:** §4'e L1 sinyal kaynağını ekle. En temizi DIRECTIVES'e opt-in `- ResourceClass: heavy-test` alanı
(task-builder zaten `Agent:`/`Skills:` override parse ediyor — aynı desen). Belirsiz bırakılırsa L1 ya hiç
çalışmaz ya da kırılgan heuristik olur. (P2: L1 optimizasyon olduğu için P1 değil.)

---

## (e) Katman Sorumlulukları, V1/V2 Kesimi, Eksik Bileşen

### [P2] `capacity:"auto"` formülü host-detector'ı aşıyor — CPU cores BURADA yok

§5.3 formülü: `heavy-test = max(1, min(3, floor(totalGB/16), floor(cores/4)))`. `host-detector.ts` okundu:
yalnız **RAM** veriyor (`detectHostMemory().totalGB`, `:59`) — `cores` YOK. Modül başlık-yorumu (`:13-16`)
açıkça "CPU+RAM+Docker için `system-profile.ts` / `system-capacity.ts`'e bak" diyor. Yani auto-formül tek
kaynaktan beslenemez; spec "host-detector'dan formül" derken iki modülü kastediyor. **Öneri:** §5.3'te kaynağı
düzelt ("`detectHostMemory` (RAM) + `system-profile`/`system-capacity` (cores)"). Küçük ama formül kodlandığında
yanlış import'a yol açar. (Hesap teyidi: 40GB/20core → `min(3, floor(40/16)=2, floor(20/4)=5)`=2 ✓ spec doğru.)

### [P2] `policy:"reject"` eşzamanlı çift-migration'da İKİSİNİN DE reddi mümkün — "tek kazanan" garantisi reject'te yok

§5.3 `db-migration: capacity:1, policy:"reject"`. §7 "reject çakışması → dürüst NO_GO". Eşzamanlılık sorusu:
capacity=1, iki migration aynı anda acquire dener. queue-policy'de FIFO biri bekler; ama **reject**-policy'de
"granted<capacity" anında ikisi de `granted=0 < 1` görüp ikisi de "kazandım" sanabilir (TOCTOU) VEYA atomik-seq
düzgünse biri seq=1 (grant) biri seq=2 (reject). Doğruluk yine [P1] atomik-seq'e biner. Eğer seq atomikse reject
doğru (biri grant biri reject); değilse ya çift-grant (capacity ihlali) ya da — daha kötü — ikisi birbirini görüp
**ikisi de reject** (canlı kilit boş ama iki worker da NO_GO yazar = gereksiz başarısızlık). **Öneri:** reject
yolu için "grant denemesi atomik seq=1 edinimidir; edinemeyince reject" diye netleştir — yine [P1] seq primitifine
bağlı. (Kaydı: queue vs reject ayrımı tasarımda iyi düşünülmüş, sadece atomiklik temeli sağlamlaşmalı.)

### [P2] Çoklu-bağlam "korumasız katılımcı": host'ta elle koşan `vitest` shim'i hiç görmez

§5.4 shim'i worker spawn PATH-prepend ile enjekte ediyor. Ama aynı `.deckent/leases/` üstünde: (1) ikinci bir
sprint, (2) REPL, (3) host kabuğunda elle `npx vitest` koşan geliştirici — **shim PATH'ini görmez** → gate'i hiç
çalıştırmaz → capacity'yi kâğıt üstünde tutar ama gerçekte aşar. Bu V1 "tek makine" kapsamında gerçekçi bir senaryo
(dogfood'da Alperen elle test koşarken sprint de koşuyor olabilir). Spec bunu adreslemiyor. **Öneri:** Non-Goal
olarak açıkça yaz ("korumasız katılımcılar V1'de kapsam dışı — yalnız deckent-spawn'lı worker'lar gate'lenir")
VEYA repo-kök `package.json` script'ine ince bir shim-prelude düşün. En azından bilinen-sınır olarak belgele.
(Bu adversarial Task 2'nin de alanı; mimari açıdan "katılımcı kümesi" tanımı eksik.)

### [P3] V1/V2 kesimi mantıklı — `renew()` çağıranı netleştikten sonra V1 tutarlı

§10 V1 kümesi (core arbiter + FileLeaseBackend + 3-backend shim + 4 profil + saat-donması + PROGRESS/notify +
`deckent lease` CLI + L1 packing) **tutarlı bir dilim** — ekosistemin geri kalanından (REPL agentic, autonomous
capability wire, tenant/API backend, çoklu-lease, dashboard panel) temiz ayrılmış. Tek koşul: yukarıdaki [P1]
renew()-lifecycle ve [P1] saat-donması maddeleri V1 dilimine dahil olduğu için V1 "tasarım tamam" demeden bunlar
çözülmeli. Non-Goals (§3) iyi sınırlanmış (çoklu-lease V2, deadlock-imkansız argümanı V1 tek-lease ile geçerli ✓).

### [P3 / teyit] Sprint-280 PROGRESS/notify + nervous-edit altyapısı GERÇEKTEN var — §5.6/§8 iddiaları doğru

§5.6 `emitProgress` (`event-stream.ts:610`, PROGRESS channel ✓) + `notify('progress')` (`notify.ts:47`,
`DECKENT→USER:NOTIFY` + global dispatcher "CLI+MCP+file" `:82-87` ✓) — 3-surface iddiası kod ile birebir.
§8 "nervous accept/edit/reject (Sprint 280 APPROVE-007b edit akışı)" — `ipc-queue.ts:83` "APPROVE-007b (Sprint 280):
optional payload edits a human applied before [accept]" ✓ teyit. Küçük dil notu (P3): "edit" ayrı bir fiil değil,
accept'e iliştirilen opsiyonel payload (MCP araç listesinde accept/reject var, edit yok) — "accept-with-edit"
demek daha doğru. Mekanizma mevcut, rule-evolver→nervous-onay→resource_classes döngüsü gerçekçi.

### [P3 / teyit] 3-katman config merge resource_classes'ı taşır — ama built-in sınıf KALDIRMA mümkün değil

§5.3 "3-katman config merge: defaults→global→project". `config.ts:1284/1314` `deepMerge` global sonra project
uygular ✓. `deepMerge` (`:455`) plain-object'leri **recursive per-key** birleştirir (`:466-470`); array'ler
replace edilir. Sonuç: project config bir sınıfın `capacity`/`ttl`/`policy`'sini override edebilir, `match`
array'ini değiştirebilir (replace) ✓ — ama **bir built-in sınıfı KALDIRAMAZ** (per-key merge built-in'i hep
miras alır). §5.3 "python/c++/ERP veri olarak eklenir" (ADD) çalışır; "TS-only istiyorum, package-install'ı
kapat" (REMOVE) çalışmaz. **Öneri (P3):** sınıf-başına `"enabled": false` bayrağı veya null-ile-silme semantiği
ekle; aksi halde kullanıcı built-in'i kapatamaz, sadece capacity'sini absürt yükseltir.

---

## Eksik Bileşen Kontrol Listesi (özet)

| Bileşen | Spec durumu | Risk |
|---------|-------------|------|
| Atomik seq primitifi | "file-lock deseni" (yanlış atıf) | **P1** — tek-kazanan buna bağlı |
| GRANTED renew() çağıranı | tanımsız | **P1** — false-stale over-subscription |
| Shim release (exec vs child) | çelişkili (`exec`+`trap`) | **P1** — release hiç koşmaz |
| Shim→arbiter köprüsü (CLI) | adlandırılmamış | P2 — çift-impl riski |
| L1 class-aware packer | mevcut fonksiyon ima ediliyor | P1 — yeni kod, pairwise-edge yetmez |
| L1 sinyal kaynağı (TaskKind→class) | belirsiz | P2 — kırılgan heuristik riski |
| capacity:auto cores kaynağı | yanlış modül (host-detector) | P2 — import hatası |
| Korumasız katılımcı (host vitest) | adreslenmemiş | P2 — V1 kapsam belirsizliği |

---

## Verdict: APPROVE_WITH_CHANGES

Tasarımın yönü, katman modeli (L1-L4), fail-open ilkesi ve mevcut deckent desenleriyle (locks/config/Sprint-280
notify/nervous-edit) hizası **sağlam ve onaya değer**. Ancak implementasyona girmeden ÖNCE çözülmesi gereken
**3 P1 blocker-adayı** var; bunlar netleşmeden kod yazılırsa tasarımın kendi vaadini (capacity garantisi, saat-donması)
ihlal eder:

1. **[P1] Atomik `seq` primitifi** "file-lock deseni" ile çözülmüyor — `file-lock.ts` yalnız O_EXCL create-or-fail
   sağlıyor (`:60/:100`), atomik-increment değil. Tek-kazanan/FIFO garantisinin TAMAMI buna biner; benzersiz-seq
   mekanizması (O_EXCL sentinel-tarama vb.) spec'te tanımlanmalı.
2. **[P1] Saat-donması (K2) docker'da uygulanamaz** — bağlayıcı timeout in-container `timeout $TIMEOUT` coreutil'i
   (`spawn-backend-docker.ts:656`), worker-CLI exec'inden duvar-saati sayar ve host'tan uzatılamaz. Lease beklemesi
   worker bütçesini yer. result-collector deadline'ı (`:996`) düz sprint-geneli, per-task değil. §5.5 hangi timeout'u
   nasıl uzattığını yeniden tasarlamalı (shim-yönetimli sub-timeout en olası çözüm).
3. **[P1] `renew()` granted-holder lifecycle + shim `exec`/`trap` çelişkisi** — uzun exec'te lease yenilenmezse
   false-stale-clean capacity'yi aşar; `exec` kullanılırsa EXIT-trap release hiç koşmaz. Shim: child-process +
   arka-plan renewer deseni (docker hb loop `:650` gibi) zorunlu.

Olumlu: ADR-008/010/087 uyumu doğru, mtime-bind-mount güvenilir, auditor stale-tarafı zaten çözülü (bonus),
Sprint-280 PROGRESS/notify + nervous-edit altyapısı gerçekten mevcut, V1/V2 kesimi temiz. L1 packing (§4) ve
capacity:auto kaynak (§5.3) P2 düzeltmelerle netleşir. Bu üç P1 spec'te giderildiğinde tasarım APPROVE'a hazır.
