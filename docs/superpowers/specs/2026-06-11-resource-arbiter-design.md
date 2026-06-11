# Resource Arbiter — İzin-Önce-Eylem Kaynak Hakemi (Admission Control) — **v2**

**Tarih:** 2026-06-11 · **Durum:** v2 — 6-rapor denetimi sonrası revize (Alperen onaylı yön) · **Kapsam:** V1 (tek makine) + V2 yol haritası
**ADR:** ADR-090 önerisi implementasyon sprint'inde yazılacak (md + memory.db eş-zamanlı)

## Revizyon Geçmişi
- **v1 (2026-06-11):** İlk tasarım (brainstorm K1-K4). PATH-shim + dağıtık dosya-semafor modeli.
- **v2 (2026-06-11):** 6 bağımsız denetim sonrası (sprint-281: opus×2+sonnet; fable sub-agent ×3 körleme — `docs/reviews/resource-arbiter-spec/`, verdicts 3×REWORK + 3×APPROVE_WITH_CHANGES) mekanizma katmanı yeniden kuruldu: **Host-Hakem + İnce-İstemci** omurgası, enforcement kapsama matrisi, K2'nin backend-gerçekçi yeniden tasarımı, tehdit modeli, global havuz, fail-mode matrisi. Çekirdek fikir (izin-önce-eylem, deterministik hakem, fail-open ruhu, dosya-tabanlı, daemon'suz) korunmuştur. Bulgu→çözüm izlenebilirliği §19'da.

---

## 1. Problem & Motivasyon

**Tetikleyici (ölçülmüş):** 8 worker aynı anda tam vitest suite koşarsa makine kilitlenir. Resource-log analizi
(2026-06-10/11, 5248 örnek): tek worker tepe 1.24 GB; ama vitest çekirdek-başına fork havuzu açar — 8 × N fork
aynı çekirdekleri ve diski döver. **RAM'den önce CPU/IO aşırı-aboneliği kilitler.** `tierBasedMaxWorkers`
(`spawn-coordinator.ts:70`) worker SAYISINI sınırlar; spawn edilmiş worker'ların **aynı anda ne çalıştırdığı**
serbesttir. Ek içgörü (denetim F3-B9): tehlike sınıf-içi olduğu kadar **sınıf-çaprazıdır** — 2 vitest + 2 cargo
+ 1 npm install ayrı sınıflarda meşru görünüp makineyi yine boğar (make jobserver'ın tek-havuz dersi).

**Genelleme (ürün perspektifi):** Paylaşılan-kaynak çekişmesi sınıfının tek örneği değil: 2 agent'ın aynı iş
emriyle aynı ERP lotunu tüketmesi, eşzamanlı DB migration, eşzamanlı `npm install`. Scope izolasyonu dosyaları
korur; ortak süreçleri/kaynakları korumaz.

**Temel içgörü (Alperen):** Tespit-sonra-müdahale bu hata sınıfında matematiksel olarak geç. Model
**izin-önce-eylem**: "X işini yapacaksan önce onay + sıra numarası al."

## 2. Tehdit Modeli (v2 — denetim F2 tehdit-profillerinden)

| Profil | Tanım | V1 kapsamı |
|--------|-------|-----------|
| **A1** Dürüst-ama-habersiz worker | Görevi gereği `npm test` koşar, lease'ten habersiz | ✅ **birincil hedef** |
| **A2** Kafası karışık worker | Takılan işi "debug" için alternatif çağrı dener | ✅ kapsama matrisi ölçüsünde |
| **A5** Crash/OOM | SIGKILL — sistemin baskın hata modu | ✅ hızlı-reap ile |
| **A3** Kötü niyetli/uzlaşılmış worker | RW mount'ta lease spoof/sil/pin | ❌ **açık Non-Goal V1** — deckent'in mevcut güven modeli (ADR-037 advisory) hiçbir katmanda A3'ü bloke etmez; tutarlılık gereği arbiter de etmez. V2 sertleştirme: RO-mount, sahip-doğrulama, HMAC. |
| **A4** Korumasız katılımcı | Host'ta elle vitest, 2. repo, CI | ❌ **açık sınır** — garanti "deckent-spawn'lı worker'lar" içindir (§5 dürüst-iddia). V2: host-scoped store + opsiyonel `deckent shell-init`. |

## 3. Kararlar

| # | Karar | Gerekçe |
|---|-------|---------|
| K1 | **Hard gate V1** — korumalı komut, deckent-spawn'lı worker'larda lease almadan exec olamaz; kapsama matrisi + bilinen-delikler dürüstçe belgelenir (§8) | ADR-037 advisory dersi; "fiziken imkânsız" v1-iddiası geri çekildi (overclaim — F3-B16) |
| K2 | **Bekleme saati dondurur** — saat host-ledger'dan işletilir; bekleyen worker timeout'tan ölmez | Sentetik-NO_GO ailesine üye eklenmez; v2'de mekanizma backend-gerçekçi (§9) |
| K3 | **Dosya-tabanlı + `LeaseBackend` arayüzü** — daemon'suz, ağ'sız, AS-7 uyumlu; enterprise backend V2'de aynı arayüze | En az yeni hata-noktası; provider-adapter deseni |
| K4 | **Hakem deterministik kod** — Brain politikayı koyar, çekirdek uygular | Gecikme/maliyet/Brain-yokluğu |
| **K5 (yeni)** | **Host-Hakem + İnce-İstemci:** TÜM karar mantığı (sıra, kapasite, terfi, reap) host'ta TEK süreçte; container/worker tarafı yalnız "istek bırak + poll et" yapan mantıksız ince istemcidir | Dağıtık atomiklik problemlerini (seq-yarışı, TOCTOU, çift-grant — F1-A2/A3, F2-F7) kökten yok eder: tek tahsisçi = yarış yok. Köprü problemi (üründe deckent'siz container — F3-B1) çözülür. |
| **K6 (yeni)** | **İki-seviyeli kapasite:** sınıf-kapasitesi VE global `heavy` havuz-kapasitesi — acquire ikisini birden geçer | Sınıf-çaprazı aşırı-abonelik (F3-B9, jobserver dersi) |
| **K7 (yeni)** | **Tek doğruluk kaynağı host ledger'ı** — hb dosyasına lease durumu YAZILMAZ; bekleme/aktif süre muhasebesi yalnız hakemin kendi kaydından | Dual-writer çakışması (F2-C2/F2-F2) ve sahte-WAITING istismarı (S2-B5) sınıf olarak yok olur |
| **K8 (yeni)** | **Fail-open katmanlı:** yapılandırılmamış→sessiz geç; yapılandırılmış-ama-bozuk→**fail-degraded** (havuz=1) + CRITICAL alarm; `reject`-sınıfları bozuk-state'te **fail-closed** | Fail-open'ın DoS→bypass silahlanması (S2-B6, F2-F4) kapanır; ana akış yine düşmez |

## 4. Non-Goals (V1)

- A3 kötü-niyetli worker savunması (RO-mount/HMAC/sahip-imza) — V2 (§2 gerekçesi)
- A4 korumasız katılımcı: host'ta elle komut, **aynı host'ta ikinci repo** (store proje-scoped — F2-F8 bilinen sınır), CI — V2 (host-scoped store + shell-init)
- Cross-machine; çoklu-lease (iç içe FARKLI sınıf → pass-through, §8.4); öncelik/preemption; `coalesce`/singleflight policy (şema enum'u genişlemeye açık — F3-B10); Brain'e-devir; dashboard kuyruk paneli
- REPL agentic wire — **olgusal gerekçe (F3-B17):** REPL bugün bash tool taşımıyor (`tool-permissions.ts:1-15`); ağır iş zaten sprint/task yoluyla worker'a iner = V1 koruması miras. **Yeniden-açma tetiği:** ADR-081 REPL'e bash tool eklediği gün.
- İş-kaynağı (ERP) lease'lerinin çağıranı — primitive hazır, ilk tüketici V2 capability-dispatch (§14)

## 5. Garanti Bildirimi (dürüst-iddia)

> **V1 garantisi:** *deckent-spawn'lı worker'lardan kaynaklanan* eşzamanlı korumalı-iş sayısı, sınıf- ve
> havuz-kapasitesini aşmaz (kapsama matrisi §8 ölçüsünde; bilinen delikler §8.5). Makine-genel mutlak garanti
> DEĞİLDİR (A4). L4 cgroup zemini (`--memory`, `spawn-backend-docker.ts:694`) her durumda ayakta kalan
> eş-birincil kattır.

## 6. Mimari — 4 Katman (v2)

```
┌─ L1 PLAN/DISPATCH (politika) ── TOPP dispatch-erteleme: doygun sınıfın task'ı bu tick atlanır (yeni filtre,
│                                  planDispatch saf-fonksiyonuna — result-collector.ts:227; YENİ KOD, mevcut
│                                  kancanın "genişlemesi" değil). reject-sınıfı task'ları ASLA birlikte
│                                  dispatch edilmez (zorunlu kural — F3-B18). Sinyal: §11 expectedResourceClasses.
├─ L2 SPAWN (enjeksiyon) ──────── shim dizini PATH-prepend + NODE_OPTIONS preload + env (DECKENT_TASK_ID/
│                                  WORKER_ID — 3 backend'e DE enjeksiyon: bugün yalnız docker'da TASK_ID var,
│                                  F1-C4 → açık iş kalemi) + prompt bilgilendirme satırı
├─ L3 RUNTIME (hard gate) ─────── İnce-istemci: istek-bırak → host-grant bekle → child-spawn → release.
│                                  Karar veren HOST-HAKEM (K5). Garanti §5 ölçüsünde.
└─ L4 BACKSTOP (mevcut) ───────── cgroup --memory + tierBasedMaxWorkers — değişmez; eş-birincil güvence
```

**Host-Hakem (ArbiterLoop):** `src/core/resource-arbiter.ts` mantığı; sprint bağlamında **result-collector
dispatch tick'i** içinden sürülür (zaten sprint boyunca canlı — `result-collector.ts:787 dispatchTick`);
`runTaskMode` (autonomous kind=task) kendi idempotent `startArbiterLoop(root)`'unu başlatır (1 sn aralık,
süreç-başına tekil). Hakem her tick: istekleri tarar → varış-sırası ledger'ına işler → kapasite (sınıf+havuz)
elverişliyse grant → ölü holder/waiter reap → PROGRESS/notify emit → kuyruk-durumunu `queue.json`'a yazar.
Tek-yazar olduğu için **promotion/reject yarışları tanım gereği yoktur** (F1-A3, F2-F7, S1 reject-TOCTOU çözümü).

## 7. Lease Protokolü (dosya-tabanlı, host-granted)

```
.deckent/leases/
  arbiter-alive.json            # hakem kalp atışı (her tick; ts JSON alanı) — istemci "hakem var mı" bununla bilir
  ledger.json                   # tek-yazar: varış sırası, grant/release olayları, bekleme aralıkları (K2 muhasebesi)
  queue.json                    # görünürlük anlık-görüntüsü (status/lease ls okur)
  <classId>/requests/<holderId>.json   # istemci yazar: {holder, taskId?, classId, cmd, pid, requestedAt, ts}
  <classId>/granted/<holderId>.json    # HOST yazar (grant); istemci ts alanını ~5 sn'de bir yeniler (renew)
  <classId>/release/<holderId>.json    # istemci çıkışta yazar (veya granted dosyasını siler) → host terfi tick'i
```

- **Benzersizlik dosya-adından:** `holderId = <taskId|manual>-<pid>-<nonce>` — istemci tarafında HİÇBİR atomik
  sayaç/seq gerekmez (v1'in çözümsüz "atomik artırım" problemi — F1-A2/F2-F7 — ortadan kalkar). FIFO sırasını
  host, isteği **ilk gördüğü** tick'te ledger'a yazarak belirler (tek-yazar = çelişki yok). Zero-padding/lexicografik
  tuzaklar (F1-E7) konu dışı kalır — sıra ledger'da, dosya adında değil.
- **Zaman damgaları JSON alanı, mtime DEĞİL** — `clearStaleLocks`'un gerçek deseniyle (acquiredAt,
  `file-lock.ts:236`) ve Auditor'ın JSON-timestamp okumasıyla (`auditor.ts:362`) tutarlı (F1-A5/C3). macOS
  Docker Desktop saat-sapması notu: V1 hedef platform Linux/WSL2; macOS'ta uyku-sonrası sapma bilinen sınır
  (doctor uyarısı).
- **Liveness — iki AYRI eşik (F2-F5 kök-neden düzeltmesi):** `waiterStale = 15 sn` (ts yenilenmeyen bekleyen
  hızla düşer — kuyruğu donduramaz); `holderStale = 60 sn ts-bayatlığı VE canlılık-probu negatif` (pid/container
  probe — auditor `batchProbeLiveness`/`isWorkerProcessAlive` desenleri yeniden kullanılır, F1-A6) → saniyeler
  ölçeğinde reap. `ttlSeconds` yalnız **son-çare** tavanıdır (SIGKILL/OOM'da bile probe-reap önce yetişir — F2-F9).
- **İstemci akışı:** istek yaz → poll (1 sn): grant var mı? → grant → gerçek binary **child-spawn** (`exec`
  YASAK — F1-A1/F3-B2 deneyle kanıtlı; sinyal-iletimi: `trap 'kill $child' TERM INT`), ts-renew arka planda →
  çıkışta release + exit-code sadakati. SIGKILL'de release yazılamaz → host probe-reap (yukarıda).
- **Hakem yoksa:** `arbiter-alive.json` tazeliği yok + `maxArbiterWait` (60 sn) doldu → istemci **fail-open**
  geçer + `bypass-log.jsonl`'a iz bırakır (manuel/REPL bağlamı — gate yalnız orkestrasyon bağlamında etkin).

## 8. Enforcement Kapsama Matrisi (v2 — F1-E6/F2-F1 cevabı)

PATH-shim tek başına YETMEZ (npm/npx `node_modules/.bin`'i öne koyar; `bash -lc` login-shell PATH'i yeniden
türetir — `chat-tool-exec.ts:58`). v2 çok-katmanlı:

| Katman | Kapsadığı vektör | Mekanizma |
|--------|------------------|-----------|
| 8.1 **PM-shim** (npm/pnpm/yarn/npx) | `npm test`, `npm run X`, `npx vitest` | Shim, paket-yöneticisinin KENDİSİNİ sarar: alt-komut + (run/test için) `package.json` script GÖVDESİNİ sınıf-regex'lerine karşı değerlendirir; eşleşirse lease alır, sonra gerçek PM'i koşar — script-içi vitest lease kapsamında kalır |
| 8.2 **NODE_OPTIONS preload** | `node node_modules/.bin/vitest`, `./node_modules/.bin/vitest`, login-shell PATH-reset'e dayanıklı (env var PATH'ten bağımsız taşınır) | `--require <preload.cjs>`: process.argv'yi sınıf-desenlerine karşı sınar; eşleşirse ince-istemci protokolüyle acquire. **Re-entrancy:** `DECKENT_LEASE_HELD=<classId>` env'i — vitest'in fork çocukları yeniden acquire ETMEZ (F1-E5 nested-pass-through); worker-CLI'ın kendi node süreci hiçbir desene uymaz → no-op |
| 8.3 **Binary PATH-shim** | `make -j`, `cargo build`, `cmake --build`, `pytest`, `go test` (node-dışı) | Sınıf şemasındaki **açık `binaries: []` listesinden** üretilir (regex'ten ad türetme YOK — F2-F6 injection/lossy sorunu; üretim allow-list `^[a-zA-Z0-9._-]+$`). Self-exclusion düzeltmesi (F1-E4): shim gerçek binary'yi **mutlak yolla** çözer, PATH'i torunlar için OLDUĞU GİBİ bırakır |
| 8.4 **Komut-deseni sınıfları** (db-migration gibi binary'siz) | `npm run migrate`, `prisma migrate`, `knex migrate:latest` | 8.1 + 8.2 katmanlarının regex değerlendirmesiyle yakalanır (bağımsız `migrate` binary'si yoktur — F2-F6); standalone-shim üretilmez |
| 8.5 **Bilinen delikler (belgelenmiş)** | NODE_OPTIONS'u bilinçli sıfırlayan komutlar; PATH+NODE_OPTIONS ikisini birden söküp mutlak-yol çağrı; node-dışı binary'nin mutlak-yol çağrısı | A2/A3 sınırı — §2 tehdit modeli; Auditor advisory + worker prompt kuralı ("korumalı komutları sarmalayıcısız çağırma") |

**İnce-istemci gerçeklenmesi (F3-B1 çözümü):** `lease-shim.ts` üretici, shim'lerin yanına **bağımsız,
import'suz tek-dosya `arbiter-client.mjs`** yazar (`.deckent/shims/`); shim/preload `node arbiter-client.mjs
acquire <class> -- <cmd…>` çağırır. Worker imajında node:24 zaten var (`Dockerfile.worker:9`); **deckent kurulu
olması GEREKMEZ** → kullanıcı-projesi container'ında çalışır (dogfood-körlüğü kapandı). Protokol aptal
(yaz+poll) olduğu için çift-implementasyon riski minimal; karar mantığı yalnız host-TS'te.

## 9. K2 — Saat-Donması v2 (backend-gerçekçi)

v1'in "watchdog hb'ye bakıp deadline uzatır" kontratı ÜÇ kez çürüdü: bağlayıcı saat container-İÇİ sabit
`timeout $TIMEOUT` (`spawn-backend-docker.ts:652-656`; tmux'ta da `tmux.ts:150` — F1-C1); docker hb-daemon'u
15 sn'de bir hb'yi ezer (`:650` — F2-C2); Auditor mtime değil JSON-timestamp okur (F1-C3). v2:

- **Muhasebe host'ta:** hakem ledger'ı her holder için bekleme aralıklarını bilir → `aktifSüre = duvar −
  Σbekleme`. **Hassas deadline'ı host uygular:** `aktifSüre > task_timeout` → host worker'ı öldürür (mevcut
  kill yolları: docker stop / pid-kill) + dürüst `.timeout` işareti. subprocess backend'de mevcut host-side
  `setTimeout` (`subprocess.ts:184`) doğrudan lease-aware yeniden kurulur.
- **Container-içi `timeout` BACKSTOP'a iner:** değeri `task_timeout + max_wait_budget` (default: task_timeout
  ×1, config'lenebilir) — spawn-script değişikliği tek satır; hassasiyet host'ta, emniyet container'da.
- **hb dosyasına DOKUNULMAZ (K7):** WAITING_LEASE sentineli YOK → ezilme, format-uyumsuzluğu, sahte-bekleme
  istismarı (S2-B4/B5) sınıf olarak yok. Auditor değişikliği gerekmez: Signal-B süreç-canlılığı bekleyen
  worker'ı zaten stale saymaz (`auditor.ts:386` — S1/F1 teyitli bonus). Auditor'a tek ekleme: `.dashboard`'a
  kuyruk-özeti **info** satırı (queue.json'dan).
- **Uzun-bekleme gözlemi (F3-B11):** bekleme > sınıf-TTL eşiği → bir-kez `notify('progress', warning)` +
  `.dashboard` info — "sağlıklı ama uzun" durumu sessiz kalmaz; preemption yok (Non-Goal).

## 10. Bileşenler

| Bileşen | Yer | İçerik |
|---------|-----|--------|
| `resource-arbiter.ts` | `src/core/` (yeni) | `LeaseBackend` arayüzü + `FileLeaseBackend` (host-hakem mantığı: ledger, grant, reap, queue.json); **async I/O** (ADR-087; sync `file-lock.ts` deseni miras alınmaz — F1-ADR005 notu) |
| `resource-classes.ts` | `src/core/` (yeni) | Şema (§11) + doğrulama + 3-katman merge + `capacity:"auto"` çözümü — **bir kez, host'ta, spawn/shim-üretim anında** çözülür ve sınıf-snapshot'ı shim'lere/meta'ya gömülür (container-içi tutarsız hesap riski — F3-B3); veri kaynakları: RAM=`host-detector.detectHostMemory`, cores=`system-capacity.ts:35` (v1'in "host-detector'dan" tek-kaynak atfı düzeltildi) |
| `lease-shim.ts` | `src/orchestra/` (yeni) | PM-shim + binary-shim + preload.cjs + `arbiter-client.mjs` üretimi; 3 backend spawn-yoluna PATH/NODE_OPTIONS/env enjeksiyonu |
| ArbiterLoop sürücüsü | result-collector tick + `startArbiterLoop` | §6; PROGRESS/notify emit'i BURADA (host) — shim emit etmez (F3-B4: emitProgress sprint-scoped + in-process, `event-stream.ts:618`, `notify.ts:83`) |
| Env enjeksiyonu | 3 backend spawn | `DECKENT_TASK_ID` + `DECKENT_WORKER_ID` docker+tmux+subprocess'e (bugün yalnız docker TASK_ID — F1-C4 iş kalemi) |
| CLI | `deckent lease ls\|release\|clear --stale\|test "<cmd>"` | `test` = dry-run matcher: komut hangi sınıfa düşer (F3-B12 debug değeri) |
| `deckent status` + `.dashboard` | mevcut dosyalara bölüm | sınıf başına `granted/capacity + bekleyen + en-uzun-bekleme` (queue.json'dan) — "neden yavaş?" status'ta cevaplanır (F3-B5) |
| Config doğrulama | `validatePartialConfig` zinciri (hazır: `config.ts:1575`, `cli/config.ts:108`) | yazım-anında reddet (i18n: sınıf/alan/beklenen-tip); runtime'da bozuk sınıf → fail-open + bir-kez warning + `deckent doctor` kalıcı bulgusu (F3-B12) |
| Gitignore + lifecycle | `.gitignore`, CLEANUP/recover | `.deckent/leases/` + `.deckent/shims/` girişleri; sprint CLEANUP + `deckent recover` orphan-lease temizliği (`clearOrphanSpawnLocks` paraleli — F1-E7) |

## 11. `resource_classes` Şeması (v2)

```jsonc
// .deckent/config.json → "resource_classes" (3-katman deep-merge: capacity-override match'i YAŞATIR;
// built-in kapatma: "enabled": false — S1 P3)
{
  "heavy-test":      { "match": ["\\bvitest\\b.*\\brun\\b", "\\bjest\\b", "\\bpytest\\b", "\\bgo test\\b"],
                       "binaries": ["vitest", "jest", "pytest"],
                       "pool": "heavy", "capacity": "auto", "policy": "queue", "ttlSeconds": 1800 },
  "package-install": { "match": ["\\b(npm|pnpm|yarn)\\b.*\\binstall\\b", "\\bpip install\\b"],
                       "binaries": [],
                       "pool": "heavy", "capacity": 1, "policy": "queue", "ttlSeconds": 600 },
  "native-build":    { "match": ["\\bmake\\b.*-j", "\\bcmake --build\\b", "\\bcargo build\\b"],
                       "binaries": ["make", "cmake", "cargo"],
                       "pool": "heavy", "capacity": "auto", "policy": "queue", "ttlSeconds": 1800 },
  "db-migration":    { "match": ["\\bmigrate\\b"], "binaries": [],
                       "pool": "heavy", "capacity": 1, "policy": "reject", "ttlSeconds": 900 }
}
// pools (yeni — K6): { "heavy": { "capacity": "auto" } }  → acquire sınıf VE havuz kapısını birlikte geçer
```

- `binaries: []` = standalone shim üretilmez; yalnız 8.1/8.2 komut-deseni katmanları (F2-F6).
- `capacity:"auto"` formülleri (config-override'lı; formül sabitleri de config'te — zero-hard-code):
  sınıf `heavy-test = max(1, min(3, floor(totalGB/16), floor(cores/4)))`; havuz `heavy = max(1, min(4,
  floor(totalGB/12), floor(cores/3)))`. 8-16 GB makinede sınıf=1 → **bilinçli tam-serileşme**; UX sonucu
  (test fazı N× seri) docs/onboarding'de açıkça anlatılır + formül tablosu spec eki (F3-B3).
- `policy` enum'u genişlemeye açık tasarlanır (`queue | reject` V1; `coalesce` V2 — F3-B10).
- Şema rezervleri: `tenant?: string`, `scope?: 'machine' | 'tenant'` (default 'machine'; V2 tenant-backend'de
  makine-kaynağı/iş-kaynağı ayrımı için — F3-B8), `ttlSeconds: null` = explicit-release-only (V2 ERP — F3-B7).
- Kayıtsız/dinamik classId (`erp.material.<lot>`): V2 prefix-kuralı + default-sınıf (capacity 1, queue) (F3-B8).
- **Profil dağıtımı (dürüst ifade — F3-B13):** built-in profiller **npm release'iyle paket-içi JSON-veri**
  olarak gelir; kullanıcı `.deckent/resource-profiles/*.json` ile ekler. **Runtime'da hiçbir uzak çekme/itme
  yoktur** (AS-7 sıfır-phone-home, ADR-010).
- **Öğrenilen kural doğrulaması (F2-F10):** nervous/rule-evolver önerisi persist ÖNCESİ şema-gate: regex
  güvenli-compile + tarama-timeout (ReDoS), binary denylist `{node, sh, bash, claude, codex, gemini}`,
  `capacity ≥ 1`, ttl sınırları; `modifiedPayload` edit'i yalnız allow-listed alanlara.

## 12. Veri Akışı — 8 worker × vitest (v2)

1. Worker `npm test` → **PM-shim** npm'i sarar, script gövdesi `vitest run` → sınıf `heavy-test` →
   `arbiter-client.mjs` istek dosyası bırakır, poll'a geçer. (`npx vitest run` → PM-shim; `node .../vitest.mjs`
   → preload — hangi kapıdan girerse girsin aynı protokol.)
2. Host-hakem tick'i: istekleri varış sırasıyla ledger'a işler; sınıf-kapasite 2 + havuz-kapasite 3 →
   w1+w2 grant; w3..w8 kuyruk → `queue.json` + PROGRESS event + `notify('progress')` ("6 worker test
   kuyruğunda") — emit host'ta.
3. w1 testi child olarak koşar (exec yok), istemci ts-renew atar; biter → release dosyası → bir sonraki tick
   w3 grant (≤1-2 sn).
4. w2 OOM-kill (SIGKILL, trap çalışmaz) → host probe-reap **saniyeler içinde** (TTL'i beklemez) → slot döner.
5. w8'in beklediği 18 dk, host ledger'ında bekleme-aralığı → aktif-süre saati DONUK; container backstop
   timeout'u gevşek (task+wait bütçesi) → **sentetik NO_GO yok**.

## 13. Hata Yönetimi Matrisi (K8)

| Durum | Davranış |
|-------|----------|
| Arbiter/istemci İÇ hatası (modül, parse) | fail-open + uyarı log (ana akış asla düşmez) |
| `resource_classes` geçersiz (yazım-anı) | `deckent config set` REDDEDER (i18n hata: sınıf/alan/tip) |
| Geçersiz sınıf runtime'da | o sınıf fail-open + **bir-kez** notify warning + doctor kalıcı bulgusu (sessiz koruma-kaybı yok — F3-B12) |
| `leases/` yok | yeniden-oluştur; başarısızsa ↓ |
| `leases/` yapılandırılmış-ama-bozuk/yazılamaz (transient dahil) | sınırlı backoff-retry (3×) → **fail-degraded: havuz kapasitesi 1** + CRITICAL notify (topyekûn-açılma yok — F2-F4/F1-E8); `reject`-sınıfları bu durumda **fail-closed** (dürüst hata) |
| Hakem yok (arbiter-alive bayat) | istemci maxArbiterWait (60 sn) → fail-open + bypass-log izi (manuel bağlam) |
| Holder SIGKILL/OOM | probe-reap saniyeler; TTL son-çare |
| Bekleyen crash | waiterStale 15 sn → kuyruk akmaya devam (F2-F5) |
| `reject` çakışması | tek-tahsisçi belirler: biri grant, diğeri deterministik red → dürüst NO_GO; **FIX-prompt'una red-nedeni taşınır** (ADR-073 deseni) + L1 reject-sınıfı eş-zamanlı-dispatch yasağı retry-burn'ü önler (F3-B18) |

## 14. Genelleme — ERP/Enterprise + Otonom + Öğrenme

- **Otonom motor V1 KAPSAMDA (düzeltme):** autonomous `kind=task|sprint` işleri `execute-dispatcher.ts` →
  aynı worker-spawn yollarına iner → L2 enjeksiyonu + L3 korumasını **otomatik miras alır** (F3-B6/B17 olumlu
  teyidi). V2'ye kalan yalnız **capability-dispatch iş-kaynağı lease'leri** (`erp.material.<lot>`).
- **ERP semantiği (V2, arayüz-öngörüsü V1'de):** iş-kaynağı lease'i OS-process'e değil iş-akışı kimliğine
  bağlıdır; TTL-stale yerine **explicit-release + sahiplik-devri** gerekir → `ttlSeconds: null` V1 şemasında
  rezerve (F3-B7); scope:'tenant' ayrımı §11.
- **Öğrenme döngüsü:** resource-log + exit-137/timeout forensiği → nervous detector → kural önerisi →
  **şema-gate (§11)** → nervous accept/edit/reject (APPROVE-007b) → `resource_classes`. "Sistem kendi kaynak
  profilini öğrenir" — enterprise farklılaştırıcı.

## 15. Görünürlük & i18n

- Emit yalnız host'ta: hakem tick'i grant/queue/uzun-bekleme olaylarında `emitProgress` + `notifyProgress`
  (3-surface). Sprint'siz bağlamda yüzey `deckent lease ls` + status (dürüst sınır — F3-B4).
- **i18n anahtar envanteri (en+tr, `getMessage`):** `lease.waiting`, `lease.granted`, `lease.released`,
  `lease.stale_cleared`, `lease.fail_open`, `lease.fail_degraded`, `lease.rejected`, `lease.wait_long`,
  `lease.config_invalid`, `lease.ls_*`/`lease.test_*` CLI çıktıları (F3-B14 tablosu temel). Mekanizma
  modülleri (arbiter/istemci/shim) string-free — etiketler caller'dan.
- **Docs teslimatı (V1 kapsamı — F3-B15):** `docs/reference/cli-commands.md` (+`lease`), `features.md`,
  config referansı (`resource_classes` şema + auto-formül tablosu), DECKENT.md Gotchas ("test'leriniz
  kuyruklanıyorsa kasıtlı — `deckent lease ls`"), `api-surface.md` (lease protokol dosya formatları +
  `.tasks` şemasına `expectedResourceClasses?`), MASTER-PLAN §4I işaretleri.

## 16. Test Stratejisi (v2)

| Grup | İçerik |
|------|--------|
| Birim (hermetik, tmpdir, async) | host-hakem: FIFO ledger, sınıf+havuz çift-kapı, waiter/holder ayrık-stale, fail-degraded geçişi, reject tek-grant (8+) |
| **Stres/interleaving** | N eşzamanlı istemci-simülasyonu × M tur: `granted ≤ capacity` değişmezi HER ARA DURUMDA (F1-ADR087 önerisi) (3+) |
| Birim | resource-classes: şema doğrulama (bozuk regex/capacity/policy → yazım-anı red), merge (override match'i yaşatır, enabled:false), auto-çözüm-yeri snapshot, öğrenilen-kural şema-gate + ReDoS guard (6+) |
| Birim | lease-shim üretimi: PM-shim script-gövdesi eşleme, preload re-entrancy (DECKENT_LEASE_HELD), binary allow-list, mutlak-yol çözümleme (5+) |
| **Bypass-matrisi (entegrasyon)** | fixture projede `npm test` / `npx vitest` / `node node_modules/.bin/...` ÜÇÜNÜN DE acquire tetiklediği kanıtı (4+) |
| K2 | host aktif-süre muhasebesi: bekleme deadline'ı yemez; backstop timeout hesabı (3+) |
| İstemci | child-spawn + sinyal-iletim + release; SIGKILL→probe-reap; hakem-yok→fail-open+iz (4+) |
| **Tier-1 smoke (ADR-079)** | docker'da 3 worker × sleep'li sahte-vitest → kuyruk+grant+release gerçek logda; **deckent-DIŞI kullanıcı-projesi fixture'ında** koşar (dogfood-körlüğü gate'i — F3-B1) |
| i18n | en+tr anahtar çifti mevcut; mekanizma modülleri getMessage import etmez |
| Gerçek-dünya kanıtı | bu makinede hepsi-test-koşan 8-task sprint → resource-log'da eşzamanlı heavy ≤ havuz-kapasitesi |

Kurallar: async spawn (spawnSync YASAK), tmpdir, gitignored-state okunmaz (ADR-087 / test:ci-sim).

## 17. V1 / V2 Kesimi

**V1:** host-hakem + ince-istemci protokolü + kapsama matrisi (PM-shim/preload/binary-shim) + 4 built-in sınıf
+ `heavy` havuzu + K2-v2 (host muhasebe + backstop) + probe-reap + fail-degraded + env-enjeksiyon (3 backend)
+ `deckent lease` CLI (test dahil) + status/.dashboard kuyruk satırı + config doğrulama + L1 dispatch-erteleme
+ reject-sınıfı dispatch-yasağı + autonomous task/sprint mirası + i18n + docs.
**V2:** capability-dispatch iş-kaynağı lease'leri (explicit-release, tenant scope, dinamik classId) ·
host-scoped store + `deckent shell-init` (A4) · A3 sertleştirme (RO-mount, sahip-doğrulama, HMAC) · `coalesce`
policy · öncelik · Brain'e-devir · dashboard kuyruk paneli · cross-machine/API backend · REPL (tetik: ADR-081
bash tool).

## 18. ADR Etkileri

- **ADR-090 (önerilecek):** Resource Arbiter — izin-önce-eylem admission control, host-hakem modeli.
- **ADR-008 ✓** arbiter core/, shim+loop-sürücüsü orchestra/ (core→orchestra import yok). **ADR-010 ✓** yeni
  dependency yok (node:fs + tek-dosya .mjs istemci). **ADR-087 ✓** yeni kod async + hermetik test.
- **ADR-037:** ürünün ilk hard-gate'i — RBAC advisory ile çelişmez (ayrı eksen); A3'ü kapsamama kararı ADR-037
  güven modeliyle TUTARLILIK gereğidir (§2). **ADR-045/064:** L1 = planDispatch'e yeni saturation-filtresi
  (dispatch-deferral; wave-packing değil — F1-D2 daraltması). **ADR-079:** Tier-1 smoke + kullanıcı-projesi
  fixture'ı. **ADR-070 ✓** zero-hard-code (auto-formüller + sabitleri config'te). **AS-7 ✓** ağ/daemon/uzak-veri yok.

## 19. Bulgu → Çözüm İzlenebilirliği (6 rapor)

| Bulgu (rapor-kod) | Sev | v2 çözümü |
|---|---|---|
| npm/npx/node bypass (S2-B1, F1-E6, F2-F1) | P0 | §8 kapsama matrisi: PM-shim + preload + bilinen-delik tablosu |
| seq atomikliği yok (S1, S2-B2, F1-A2) | P0 | K5 tek-tahsisçi: istemci-side sayaç tamamen kaldırıldı |
| exec+trap release çalışmaz (S1, F1-A1, F3-B2) | P0 | §7 child-spawn + wait + sinyal-iletim; exec yasak |
| K2 container-timeout'ta uygulanamaz (S1, S2-B3, F1-C1, F2-F2) | P0 | §9 host-ledger muhasebesi + backstop'a indirilen container timeout |
| Ürün-modunda köprü yok / Dockerfile'da deckent yok (F1-E2, F3-B1) | P0 | §8 import'suz `arbiter-client.mjs` (node:24 imajda var) + kullanıcı-projesi smoke |
| hb dual-writer + format (S2-B4, F1-C2/C3, F2-F2) | P1 | K7: hb'ye yazım YOK; tek doğruluk = host ledger |
| sahte-WAITING istismarı (S2-B5) | P1 | K7: hb sentineli kaldırıldı; host yalnız kendi kaydına güvenir |
| fail-open→bypass DoS (S2-B6, F1-E8, F2-F4) | P1 | K8 fail-degraded(havuz=1)+CRITICAL; reject fail-closed |
| ölü head-of-line waiter kuyruğu dondurur (F1-A4, F2-F5) | P1 | §7 waiterStale=15 sn (holder eşiğinden AYRI) |
| renew lifecycle tanımsız (S1, F1-E1) | P1 | §7 istemci ts-renew + host probe-reap; TTL son-çare |
| promotion TOCTOU / reject çift-grant (S1, F1-A3, F2-F7) | P1 | K5 tek-yazar grant — yarış sınıfı yok |
| gitignore körlüğü / Auditor göremez (S2-B8, F2-F3) | P1 | §2 A3 dürüst Non-Goal; V2 sertleştirme; "Auditor ihlal sinyali" iddiası kaldırıldı |
| sınıf-çaprazı global bütçe yok (F3-B9) | P1 | K6 `heavy` havuzu, çift-kapı acquire |
| env'ler 2/3 backend'de yok (F1-C4) | P1 | §10 env-enjeksiyon iş kalemi (3 backend) |
| L1 sinyal+capacity=N ifade edilemez (S1, F1-D1/D2) | P1/P2 | §6 L1 dispatch-deferral'a daraltıldı + `expectedResourceClasses` (DIRECTIVES `- ResourceClass:` opt-in) |
| görünürlük köprüsü/sprint-scope (S3, F3-B4) | P1 | §15 emit yalnız host'ta; sprint'siz sınır dürüst |
| config doğrulama sözleşmesi (S3, F3-B12) | P1 | §10/§13 yazım-anı red + doctor + bir-kez warning |
| profil dağıtımı AS-7 çelişkisi (S3, F3-B13) | P1 | §11 paket-içi veri + user-dir; uzak yok |
| otonom motor V1 dışı sanılıyordu (S3) | P1 | §14 spawn-yolu mirası — V1 kapsamda |
| regex→shim-adı injection (S2-B11, F2-F6/F10) | P2 | §8.3 `binaries` allow-list + §11 şema-gate/denylist/ReDoS |
| auto'nun çözüm yeri/cores kaynağı (S1, S3, F1-E3, F3-B3) | P2 | §10 host'ta bir-kez snapshot; kaynak modüller düzeltildi |
| status'ta kuyruk yok (F3-B5) | P2 | §10 status+.dashboard satırı V1 |
| ERP TTL uyumsuz (S3, F3-B7) | P2 | §14 ttl:null rezerve; ERP V2 explicit-release |
| reject×FIX retry-burn (F3-B18) | P2 | §13 L1 yasağı + FIX-prompt'a neden |
| coalesce yok (F3-B10) / max-wait alarmsız (F3-B11) / macOS skew (F1-A5) / multi-repo (F2-F8) | P2 | §4 V2 + §9 uzun-bekleme alarmı + §7 platform notu + §4 bilinen sınır |
| "fiziken imkânsız" overclaim (F3-B16) | P2 | §5 dürüst garanti bildirimi |
| built-in kapatılamaz (S1) | P3 | §11 `enabled:false` |
| i18n/docs eksik (S3, F3-B14/B15) | P2/P3 | §15 envanter + teslimat listesi |

*(S=sprint-281 raporu, F=fable raporu; S1/S2/S3 ve F1/F2/F3 = 01-mimari / 02-redteam / 03-ürün)*
