# Red-Team Denetimi — Resource Arbiter Spec (ADR-090 önerisi)

**Denetçi:** fable-02 (security-auditor / kırmızı-takım perspektifi) · **Tarih:** 2026-06-11
**Hedef:** `docs/superpowers/specs/2026-06-11-resource-arbiter-design.md`
**Yöntem:** Her iddia gerçek kaynak koddan `file:line` ile teyit/çürütüldü (gövde-okuma, yüzeysel grep değil).
**Bağımsızlık:** `docs/reviews/resource-arbiter-spec/` altındaki diğer raporlar OKUNMADI (körleme).

> **Kapsam notu:** Spec, henüz var olmayan 3 modülü tarif ediyor (`resource-arbiter.ts`, `resource-classes.ts`,
> `lease-shim.ts` — hepsi "yeni"). Bu yüzden saldırı, spec'in DAYANDIĞI mevcut mekanizmaların (docker spawn,
> heartbeat, git-diff audit, in-container timeout, file-lock, PATH çözümleme) gerçek davranışına karşı yapıldı.
> Bulguların hepsi spec'in açık iddialarını kodla çürütüyor.

---

## Tehdit Modeli — Saldırgan Profilleri

| # | Profil | Niyet | Yetenek |
|---|--------|-------|---------|
| **A1** | Dürüst-ama-habersiz LLM worker (EN SIK) | Görevini yapmak | worker-rules gereği "proje test komutunu koş" → `npm test`/`npx vitest`; lease'ten habersiz |
| **A2** | Kafası karışık / agresif LLM worker | Takılan testi "debug" etmek | `--dangerously-skip-permissions` tam otonomi; PATH reset, shim silme, alternatif çağrı |
| **A3** | Kötü niyetli task yazarı / prompt-injection | Gate'i devre dışı bırakmak | RW mount'ta lease/shim dosyalarını spoof/sil/pin |
| **A4** | Korumasız katılımcı | (niyet yok) | Host'ta elle `vitest`, 2. sprint, REPL, CI — gate'i HİÇ görmez |
| **A5** | Crash/OOM (sistemin KENDİ hata modu) | (niyet yok) | RAM tükenmesi → kernel OOM-kill = SIGKILL (yakalanamaz) |

Saldırının çıpası: spec'in tek garanti-veren katmanı **L3 hard gate** ("garanti L3'tedir", §4) ve onun iki
yük-taşıyan iddiası — **K1 (lease'siz exec edilemez)** ve **K2 (bekleme saati dondurur)**. Her ikisi de ana
(docker) backend'de mevcut kodla çürüyor.

---

## Bulgular

### [P0] F1 — PATH-shim, projenin KENDİ kanonik test çağrılarıyla aşılıyor

**İddia (spec §4, §5.4):** "L3 tüm yürütme yollarında aynıdır… shim: kendi dizinini PATH'ten çıkararak gerçek
binary'yi exec eder" ve K1: "korumalı komut lease almadan exec olamaz" → **hard gate, garanti L3'te**.

**Çürütme — kanonik çağrılar PATH-shim'i HİÇ görmez:**

1. **`npm test`** — projenin dokümante test komutu `package.json:21` → `"test": "vitest run"`. `npm run`,
   çocuk-process PATH'inin BAŞINA `node_modules/.bin`'i ekler. Yani script içindeki `vitest`,
   shim dizininden ÖNCE `node_modules/.bin/vitest`'e çözülür. Shim devre dışı.
2. **`npx vitest run`** — Deckent'in KENDİ verify yolu bunu kullanıyor: `worker-verify.ts:481`
   (`const vitestCmd = scopeArg ? \`npx vitest run ${scopeArg}\` : 'npx vitest run'`), `:399`
   (`runCoverageVerify` → `npx vitest run --coverage`), `:450`. `npx`, yerel `node_modules/.bin`'i
   PATH'ten önce çözer → shim atlanır.
3. **`node node_modules/vitest/vitest.mjs`** / **`./node_modules/.bin/vitest`** — mutlak/göreli yol;
   PATH araması HİÇ yapılmaz. (Sembolik link mevcut: `node_modules/.bin/vitest -> ../vitest/vitest.mjs`, doğrulandı.)
4. **Agentic worker talimatı** — `agentic-worker-runner.ts:179`: *"Run verification commands (e.g. tsc,
   vitest, pytest) via run_bash"* → LLM'e doğrudan `vitest`/`pytest` koş deniyor. `run_bash` ise
   `bash -lc` (login shell) ile çalışıyor (`agentic-worker-tools.ts:94`; executor `chat-tool-exec.ts:58`
   → `spawn('bash', ['-lc', cmd], …)`). **Login shell `/etc/profile`'ı source edip PATH'i yeniden
   türetir** → process-env'e enjekte edilmiş shim-prepend düşebilir.

**Senaryo (A1, en sık):** w1..w8 spawn olur, her biri görevini bitirip worker-rules gereği `npm test` koşar.
8'i de `node_modules/.bin/vitest`'i doğrudan çalıştırır, hiçbiri `acquire('heavy-test')` çağırmaz →
spec §6'daki "kuyruk" hiç oluşmaz → 8× vitest fork-stampede → makine kilitlenir. **Tetikleyici senaryonun
TA KENDİSİ savunmasız.**

**Severity gerekçesi:** Bu edge-case değil; spec'in motive ettiği birincil yol (worker-default.md "Run
project-specific lint/build and test suite") ve Deckent'in kod-default'u. K1 "hard gate" iddiası fiilen
advisory. PATH-shim mimari olarak gözenekli.

**Savunma:**
- Enforcement'ı PATH'in ALTINA indir: exec-wrapper / `LD_PRELOAD` / seccomp, **ya da** worker'ın zorunlu
  geçtiği bir entrypoint'in `node_modules/.bin`'i lease-bilinçli wrapper'larla yeniden-yazması
  (npm/npx'in çözdüğü dizinin kendisini ele geçir).
- En dürüst kısa-yol: K1'i **"advisory + L4 cgroup zemini"**ne indir, "hard gate L3'te" iddiasını GERİ ÇEK.
  L4 (`--memory` cap, `spawn-backend-docker.ts:694-695`) zaten gerçek-zorunlu olan tek kat; onu birincil yap.
- `npm`/`npx`/`node` shim'lemek pratik değil (node'u shim'lemek worker CLI'ı + shim'in kendisini kırar).

---

### [P0/P1] F2 — Saat-donması (K2), mevcut docker heartbeat yazıcısı + in-container timeout ile çakışıyor

**İddia (spec §5.5, K2):** Shim beklerken `.tasks/task-XXX.hb`'ye `WAITING_LEASE:<classId>:pos=<n>` yazar;
watchdog bunu görüp deadline'ı uzatır; Auditor stale-alarm üretmez. → "bekleyen worker'ın timeout sayacı işlemez".

**Çürütme — ÜÇ bağımsız kırık:**

1. **Daima-açık ikinci yazıcı (overwrite):** docker spawn, container içinde her 15 sn'de bir hb dosyasını
   TRUNCATE-overwrite eden bir arka-plan döngüsü başlatıyor:
   `spawn-backend-docker.ts:650` →
   `( SEQ=2; while true; do sleep 15; …; echo "{…\"status\":\"EXECUTING\"…}" > "$HBFILE"; done ) &`.
   Shim'in `WAITING_LEASE` işareti ≤15 sn içinde `EXECUTING` ile EZİLİR → watchdog `EXECUTING` görür →
   deadline UZAMAZ.
2. **Format uyumsuzluğu:** hb katı JSON şeması; `status: AgentStatus` enum'u (`monitoring-types.ts:25-39`,
   enum değerleri `monitoring-types.ts:10-23` — `WAITING_LEASE` YOK). `WAITING_LEASE:heavy-test:pos=2`
   geçerli JSON değil → `readHeartbeatCached` → `readJsonSafe` **null döner** (`auditor.ts:57-85`,
   `utils.ts:78`) → Auditor "hb yok/bozuk" sayar (stale RİSKİ artar, spec'in iddiasının TERSİ).
3. **Asıl kill in-container, host-watchdog'a SAĞIR:** worker'ı öldüren şey host değil, container içindeki
   `timeout $TASK_TIMEOUT` komutu: `spawn-backend-docker.ts:656` →
   `timeout $TIMEOUT ${workerCmd}… || echo "WORKER_TIMEOUT" > …`. Bu süre spawn anında sabit env'den
   (`TASK_TIMEOUT`, `:727`) geliyor; **host, container başladıktan sonra onu uzatamaz**. Host
   `waitForResults` döngüsü zaten saf wall-clock (`result-collector.ts:996` →
   `while (unlimited || Date.now() - startTime < timeout)`), hb'ye bağlı bir freeze YOK.

**Senaryo (A1+A5):** heavy-test `ttlSeconds: 1800` (30 dk); 8 worker capacity-2 → 4 seri parti. Kuyruğun
sonundaki w8, sırası gelene kadar onlarca dakika bekler. Ama container'ının `timeout $TASK_TIMEOUT`'u
beklerken işliyor → w8 **kuyrukta beklerken SIGKILL** edilir → `.timeout` marker → sentetik NO_GO.
**K2'nin önlemeye SÖZ verdiği sentetik-NO_GO ailesine yeni üye, K2'nin KENDİsi tarafından eklenir.**

**Savunma:**
- Lease'i `timeout $TASK_TIMEOUT workerCmd`'den ÖNCE al (acquire bloklarken in-container timeout başlamasın),
  veya acquire sonrası timeout saatini shim yeniden başlatsın.
- WAITING durumu, AYNI tek-yazıcı tarafından yazılan geçerli JSON heartbeat olsun (yeni `AgentStatus.WAITING`),
  ikinci yazıcı ekleme. docker hb döngüsünü lease-farkında yap (beklerken `WAITING` bas).
- Watchdog freeze'i sadece host-tarafı değil, in-container timeout'u da kapsamalı.

---

### [P1] F3 — Gitignore'lu lease/shim dizinleri Auditor'a görünmez; "worker düzenlemesi = ihlal sinyali" YANLIŞ

**İddia (spec §5.4):** "Shim dosyaları worker `scope.filesWrite` DIŞINDA (spawner üretir; **worker düzenlemesi
Auditor ihlal sinyali**)."

**Çürütme:** Auditor sınır-ihlali tespiti TEK mekanizma — `git diff --stat` (`auditor.ts:600`). Gitignore'lu
dosyalar git diff'te GÖRÜNMEZ. `.tasks/` ve `.locks/` gitignore'lu (`.gitignore:7-8`); `.deckent/*` runtime
dizinleri gitignore'lu (`.gitignore:50-61` — jobs/usage/cache/routing…). Önerilen `.deckent/leases/` +
`.deckent/shims/` de aynı sınıfa girer (spec §5.2 zaten ".locks gibi" diyor). Proje mount'u **READ-WRITE**
(`spawn-backend-docker.ts:699` → `-v ${dir}:${CONTAINER_WORKSPACE}`). Otonom worker
(`--dangerously-skip-permissions`) lease/shim dosyalarını `rm`/spoof/`touch`-pin edebilir ve **git diff'te
sıfır iz** bırakır → Auditor ASLA flag'lemez.

**Senaryo (A2/A3):** Worker, takılan testi "çözmek" için `rm -rf .deckent/shims/current` veya
`chmod -R 000 .deckent/leases` yapar; ya da kendi `granted/` kaydını elle yazıp sıraya kaynak yapar. Auditor
boundary-scan temiz döner; spec'in tek tespit mekanizması kör.

**Savunma:**
- Bütünlüğü arbiter KENDİsi zorlasın: holder-kimlik bağlama (lease JSON'undaki holder ↔ gerçek workerId/uid),
  append-only seq, sahip-doğrulama. git-diff audit'e GÜVENME.
- `.deckent/shims`'i container'a **read-only** mount et (`-v …:…:ro`) — worker silemez/değiştiremez.
- Lease dosyası bütünlüğü için minimum kontrol (sahip + mtime + monotonluk); ihlalde fail-CLOSED (bkz F4).

---

### [P1] F4 — Fail-open, bir DoS'u topyekûn gate-bypass'a çeviriyor

**İddia (spec §7):** "Fail-open (ana ilke): arbiter/shim iç hatası (leases/ yazılamıyor, bozuk lease) → komut
SERBEST çalışır." (Sprint 280 fail-safe ilkesiyle hizalı.)

**Çürütme:** Fail-open availability için doğru DEFAULT ama burada hata **worker-tetiklenebilir ve sessiz**.
leases dizini RW mount'ta. Bir worker (veya kazara bozuk-state) `chmod 000 .deckent/leases` yapar ya da
`waiting/`'i çöp dosyayla doldurur → sonraki HER acquire fail-open → gate global devre dışı → 8× vitest
stampede geri döner. "Bypass'a dönüşen DoS" yüzü tam burada: korumayı kapatmak için onu KIRMAK yeterli.

**Senaryo (A3):** Tek `chmod` ile kalıcı, sessiz, sistem-geneli gate kapatma. Üstelik F3 nedeniyle iz yok.

**Savunma — minimum bütünlük zemini:**
- "leases hiç yapılandırılmamış" (fail-open OK) ile "leases yapılandırılmış AMA yazılamıyor/bozuk"
  (fail-LOUD) durumlarını AYIR.
- `policy: "reject"` sınıfları (db-migration) için bozuk-state'te **fail-CLOSED** + L4 cgroup zeminine düş +
  CRITICAL alert (`emitProgress`/`notify` ile operatöre).
- leases dizini izinlerini spawn-time doğrula; beklenenden sapma → CRITICAL.

---

### [P1] F5 — Kuyruk başındaki crash'lemiş BEKLEYEN, tüm kuyruğu ttlSeconds (≤30 dk) kilitliyor

**İddia (spec §7):** "Açlık: FIFO seq garantisi; promotion yalnız head-of-line." (Bunu güç sayıyor.)

**Çürütme — head-of-line promotion'ın karanlık yüzü:** Acquire yalnız `seq == min(waiting)` olanı terfi
ettirir (spec §5.2). Eğer kuyruk başındaki BEKLEYEN crash olursa (A5 — OOM, sistemin kendi hata modu), onun
`waiting/<seq>` dosyası mtime-yenilenmeyi durdurur ve ancak `mtime > ttlSeconds` olunca reap edilir. Ama tek
`ttlSeconds` hem holder-TTL hem waiter-liveness için kullanılıyor. heavy-test `ttlSeconds: 1800` →
**ölü bir bekleyen, arkasındaki HERKESİ 30 dakika dondurur** (hiçbiri min-waiting olamadığı için terfi edemez).

**Kök neden:** Holder-TTL (uzun olmalı — bir test koşusu 20 dk) ile waiter-liveness (kısa olmalı — birkaç poll)
tek `ttlSeconds`'a yıkılmış. Spec §5.2 "stale: mtime > ttl → temizlenir" ikisini ayırmıyor.

**Savunma:** `waiterStaleSeconds` (küçük, ör. 3× poll = 3-6 sn) ile holder `ttlSeconds`'ı AYIR; ölü bekleyeni
hızlı reap et. Promotion, min-waiting taze değilse bir sonraki seq'e atlasın.

---

### [P1] F6 — `match` regex → shim-dosya-adı türetimi sağlam değil; en kritik sınıf shim'lenemiyor

**İddia (spec §5.4):** Shim'ler "vitest, npm, pnpm, yarn, pytest, make, cmake, cargo… — **match listesinden
türetilir**."

**Çürütme — binary-adı PATH shim'i komut-deseni yakalayamaz:**
- `db-migration` match'i `\bmigrate\b` (`resource-classes` örneği, spec §5.3 — capacity 1, **policy reject**,
  en güvenlik-kritik sınıf). Ama `migrate` adında binary YOK; migration'lar `npm run migrate`,
  `prisma migrate`, `./migrate.sh`, `knex migrate:latest` olarak koşar. Binary-adı shim'i bunların HİÇBİRİNİ
  yakalayamaz → "2 agent aynı DB migration'ı koşamaz" garantisi (spec §1 motive eden ERP örneği) **sessizce
  hiç devreye girmez**.
- Subcommand desenleri: `\bgo test\b` → binary `go` (alt-komut `test`); `\bcmake --build\b` → binary `cmake`.
  `go`/`cmake`'i shim'lersen TÜM `go`/`cmake` alt-komutlarını ele geçirirsin (aşırı-geniş, build dışı
  komutları da bloklar).
- Genel: bir regex'ten tek bir dosya-adı türetmek lossy/belirsiz (`\b(npm|pnpm|yarn)\b` → üç ad mı?).

**Senaryo:** Reject-policy db-migration sınıfı, en kritik koruma olmasına rağmen, kullanıcının migration
komutu `migrate` binary'si OLMADIĞI için (gerçekte hep `npm run`/script) ASLA tetiklenmez. Sessiz başarısızlık.

**Savunma:** Regex'ten dosya-adı türetimini BIRAK; her sınıfta açık `binaries: []` listesi iste. Keyfi-komut
sınıflarının (subcommand/script/run-target) PATH-shim ile değil farklı katmanla (wrapper / PROMPT kontratı /
exec-interpose) yakalanması gerektiğini kabul et.

---

### [P2] F7 — Atomik seq sayaç + capacity kontrolü yetersiz-tanımlı; capacity>1'de çift-grant penceresi

**İddia (spec §5.2):** `seq` dosyası "monoton sayaç (**atomik artırım, file-lock deseni**)"; acquire
"`granted < capacity` VE `seq == min(waiting)` ise atomik rename ile waiting→granted (**tek-kazanan**)".

**Çürütme:** "file-lock deseni" = O_EXCL (`file-lock.ts:100` → `openSync(..., O_WRONLY|O_CREAT|O_EXCL)`).
O_EXCL **atomik CREATE** verir, atomik **read-modify-write artırım** DEĞİL. İki eşzamanlı acquirer `seq`
dosyasını okuyup aynı değeri görebilir (artırımın kendisi bir create-collision döngüsü değilse). Ayrıca
capacity kapısı (`granted < capacity`) dizin-listeleme ile rename arasında TOCTOU. Katı head-of-line
promotion pratikte pencereyi daraltıyor (tek-tek terfi) ama spec artırım primitifini KESİN tanımlamazsa
duplicate-seq / çift-grant riski var. `reject` policy'de eşzamanlı iki acquire: ikisi de `granted == 0 <
capacity == 1` görüp ikisi de "kazandım" sanabilir veya ikisi de reddedebilir — atomiklik rename'in
benzersizliğine bağlı, spec bunu kanıtlamıyor.

**Savunma:** seq'i `seq/<n>` O_EXCL-create olarak uygula (collision = retry, monoton garanti). Grant'ı, başarısı
capacity-token'ın TA KENDİSİ olan tek atomik rename yap; "say-sonra-davran" deseninden kaçın. `reject`
yarışını rename-kazananı belirlesin (kaybeden deterministik red).

---

### [P2] F8 — Aynı host'ta çoklu-proje / korumasız-katılımcı boşluğu

**İddia (spec §3 non-goal):** Sadece cross-MACHINE V2'ye ertelendi. Aynı-makine çoklu-bağlam ele alınmış varsayımı.

**Çürütme:** capacity-auto HOST `totalmem`/`cpus`'tan hesaplanıyor (`system-capacity.ts:32` →
`detectSystemCapacity()`, `totalmem()` + `cpus().length`) AMA lease deposu proje-köküne bağlı (`.deckent/leases`).
İki FARKLI repo aynı host'ta → iki ayrı `.deckent/leases` → her biri bağımsız capacity=2 hesaplar ve bağımsız
grant verir → 4 eşzamanlı heavy-test → host yine thrash. Host'ta elle koşan `vitest`, ikinci sprint, REPL, CI
lease dizinine hiç DOKUNMAZ (A4). Spec §3 bu aynı-makine-çoklu-proje senaryosunu adreslemez; gerçekçi
"korumasız katılımcı" açığı.

**Savunma:** Gerçek host-koruması için lease deposu **host-scoped** olmalı (ör. `~/.deckent/leases` veya XDG
runtime dir), proje-scoped değil. Korumasız katılımcıların garantiyi bozduğunu spec'e açıkça yaz (tehdit
sınırı dürüstlüğü).

---

### [P2] F9 — `trap release EXIT`, SIGKILL/OOM'de ÇALIŞMAZ — sistemin baskın crash modu

**İddia (spec §5.4):** Shim "`acquire(class)` → `trap release EXIT` → gerçek binary'yi exec".

**Çürütme:** Tüm motivasyon RAM tükenmesi → kernel OOM-kill = **SIGKILL (yakalanamaz)**; `docker stop`/`timeout`
de SIGTERM→SIGKILL'e tırmanır. `trap … EXIT`/`trap … TERM` (spawn'da kullanılan desen, `spawn-backend-docker.ts:646-648`)
SIGKILL'de ASLA tetiklenmez → lease TTL'e kadar sızar. Yani arbiter'ın VAR OLMA sebebi olan koşulda (bellek
basıncı → OOM), birincil release yolu çöker ve yavaş 30-dk TTL'e düşer (F5 ile birleşince katmerli).

**Senaryo (A5):** w1 heavy-test holder, vitest fork havuzu RAM'i şişirir, container OOM-kill (exit 137 —
kod zaten `>128 ⇒ signal (137 = SIGKILL/OOM)` biliyor, `spawn-backend-docker.ts:102`). `trap release` çalışmaz
→ heavy-test slot'u 30 dk (`ttlSeconds: 1800`) ölü tutulur → kapasite yarıya iner → kuyruk birikir.

**Savunma:** Granted lease'lere kısa holder-heartbeat-renew + kısa stale-reap. Host-tarafı release hook:
orchestrator zaten container çıkışını izliyor (`docker wait`, exit-kod sınıflama `:102`, `:841` retry/inspect)
— lease'i ORADA bırak, sadece in-container trap'e güvenme.

---

### [P3] F10 — Otomatik-evrilen resource_classes kuralları (regex) injection/ReDoS yüzeyi

**İddia (spec §8):** nervous detector → rule-evolver → **nervous accept/edit** (Sprint 280 APPROVE-007b
modifiedPayload merge) → `resource_classes`'a eklenir. "Zamanla içeriye ekleme ürünleşir."

**Çürütme:** modifiedPayload edit yolu keyfi anahtarları **birleştirir** (`{...orijinal, ...modifiedPayload}` —
Sprint 280 Task 3 kontratı, DIRECTIVES'te tanımlı). Kötü/yanlış-edit edilmiş bir `match` regex'i:
(a) shim-generator'ın regex compile/scan'ini ReDoS'layabilir (catastrophic backtracking);
(b) `\bnode\b`/`\bsh\b`/`\bbash\b` ya da provider CLI binary'sini (claude/codex/gemini) match edip
**self-deadlock** yaratabilir (worker başlayamaz bile — kendi runtime'ı lease bekler). İnsan onayı tek başına
yeterli güvence değil (operatör regex'in tehlikesini göremez).

**Savunma:** Önerilen sınıfı persist ÖNCESİ doğrula: regex güvenli-compile + tarama-timeout (ReDoS guard);
binary denylist `{node, sh, bash, claude, codex, gemini, vitest-runner-kendisi}`; `capacity ≥ 1`; ttl alt/üst
sınır. Şema-gate'siz ASLA auto-apply etme. modifiedPayload edit'i yalnız allow-listed alanlara izin versin.

---

## Teyit Edilen Güçlü Yönler (adil değerlendirme)

- **K3 — dosya-tabanlı, daemon'suz, `LeaseBackend` arayüzü:** Gerçekten mevcut `.locks` / O_EXCL desenleriyle
  hizalı (`file-lock.ts:100`, `clearStaleLocks:218`), AS-7 offline uyumlu, 3-backend parity (ADR-089) ruhuna
  uygun. Sağlam temel; backend soyutlaması doğru karar.
- **K4 — deterministik hakem (LLM değil):** Doğru. Gecikme/maliyet/Brain-availability bağımlılığından kaçınır.
- **L4 cgroup `--memory` zemini GERÇEKTEN zorunlu:** `spawn-backend-docker.ts:694-695` (`--memory effectiveMemory`,
  `--memory-swap`). Bu, L3'ün tüm bypass'larına RAĞMEN ayakta kalan tek gerçek-hard kat. Spec'in en değerli
  güvencesi aslında bu — "backstop"tan **eş-birincil**e yükseltilmeli.
- **FIFO + tek-kazanan head-of-line promotion:** Makul adalet modeli (F5/F7 düzeltmeleri saklı).
- **Fail-open default felsefesi:** YENİ kesişen-kat için doğru başlangıç (F4'ün tamper-case'i hariç).
- **`policy: reject` dürüst hata döndürür (sahte başarı yok):** Anti-sentetik-NO_GO kültürüyle hizalı, iyi.
- **Görünürlük gerçekten mevcut:** `emitProgress` (PROGRESS channel) + `notify('progress')` Sprint 280'de
  wire'lı ve canlı (`result-collector.ts:1021`). CLI/observability temeli hazır.
- **ADR hizası dürüst:** ADR-008 (core→orchestra tek yön), ADR-010 (yeni dependency yok, node:fs) iddiaları
  tutarlı; arbiter core/, shim orchestra/ ayrımı doğru.

---

## Verdict: REWORK

**Gerekçe:** Tasarımın iki yük-taşıyan garantisi — **K1 "hard gate" (L3)** ve **K2 "saat dondurma"** — ana
(docker) backend'de MEVCUT kodla çürüyor (F1, F2). Pratikte güvenlik, zaten var olan **L4 cgroup zeminine**
iniyor; yani spec yeni karmaşıklık ekliyor ama merkezi sözünü tutmuyor ve hatta DURUMU KÖTÜLEŞTİREBİLİYOR
(F2: kuyrukta beklerken SIGKILL = daha fazla sentetik NO_GO). Bunlar parametre-ayarı değil **mimari**
değişiklik gerektiriyor. Çekirdek fikir (lease-tabanlı admission control) ve temel (K3/K4/L4/LeaseBackend)
sağlam ve KURTARILABİLİR — reddetme değil, yeniden-kurgu.

**Sprint öncesi MUTLAK kapatılması gereken en kritik 3 madde:**

1. **F1 (P0) — L3 enforcement'ı dürüstleştir.** PATH-shim, `npm test`/`npx vitest`/`node …` (projenin kendi
   kanonik yolları) ile aşılıyor → ya PATH-altı interception (exec-wrapper/entrypoint node_modules/.bin
   yeniden-yazımı) ekle, ya K1'i "advisory + L4 cgroup zemini"ne indirip "hard gate" iddiasını geri çek.
2. **F2 (P0/P1) — K2'yi docker gerçeğiyle barıştır.** Daima-açık hb-overwrite döngüsü (`:650`) + in-container
   `timeout $TASK_TIMEOUT` (`:656`) WAITING işaretini ezerek/sağır kalarak saat-donmasını imkânsız kılıyor.
   Lease acquire'ı in-container timeout'tan ÖNCE al; WAITING'i tek-yazıcılı geçerli-JSON heartbeat
   (`AgentStatus.WAITING`) yap.
3. **F3+F4 (P1) — Bütünlük + fail-mode.** Gitignore'lu RW lease/shim dizinleri Auditor'a görünmez
   (`git diff --stat`, `:600`) → tamper tespit edilemez; fail-open tek `chmod`'la gate'i topyekûn kapatır.
   Arbiter-içi sahip-doğrulama + "yapılandırılmış-ama-bozuk → fail-CLOSED + CRITICAL" + shim'i RO-mount ile çöz.
