# Resource Arbiter — İzin-Önce-Eylem Kaynak Hakemi (Admission Control)

**Tarih:** 2026-06-11 · **Durum:** Tasarım onaylı (Alperen, brainstorm oturumu) · **Kapsam:** V1 (tek makine) + V2 yol haritası
**ADR:** ADR-090 önerisi implementasyon sprint'inde yazılacak (md + memory.db eş-zamanlı)

---

## 1. Problem & Motivasyon

**Tetikleyici (ölçülmüş):** 8 worker aynı anda tam vitest suite koşarsa makine kilitlenir. Resource-log analizi
(2026-06-10/11, 5248 örnek): tek worker tepe 1.24 GB ama vitest çekirdek-başına fork havuzu açar — 8 × N fork
aynı çekirdekleri ve diski döver. **RAM'den önce CPU/IO aşırı-aboneliği kilitler**; her şey timeout'a sürüklenir.
`tierBasedMaxWorkers` worker SAYISINI kısıtlıyor, ama spawn edilmiş worker'ların **aynı anda ne çalıştırdığı**
tamamen serbest.

**Genelleme (ürün perspektifi — user + enterprise):** Bu, paylaşılan-kaynak çekişmesi sınıfının tek örneği.
Aynı problem: 2 agent'ın aynı iş emriyle aynı malzemeyi (ERP lot) tüketmesi, 2 worker'ın aynı DB migration'ı
koşması, N worker'ın aynı anda `npm install` çalıştırması. Scope izolasyonu (filesWrite) dosyaları korur ama
**ortak alanları, ortak test/build süreçlerini ve ortak iş kaynaklarını korumaz.**

**Temel içgörü (Alperen):** Tespit-sonra-müdahale bu hata sınıfında matematiksel olarak geç — Brain veriyi alıp
analiz edip dönene kadar sistem çoktan kilitlenmiştir. Model **izin-önce-eylem** olmalı: "X işini yapacaksan
önce onay + sıra numarası al."

## 2. Alınan Kararlar (brainstorm, 2026-06-11)

| # | Karar | Gerekçe |
|---|-------|---------|
| K1 | **Hard gate V1'den itibaren** — korumalı komut lease almadan exec olamaz | Geç müdahale = kilitlenme; ADR-037 advisory dersi (Verify Loop bugün hâlâ 0-caller) |
| K2 | **Bekleme saati dondurur** — lease kuyruğundaki worker'ın timeout sayacı işlemez | Beklemek çalışmak değildir; sentetik NO_GO ailesine yeni üye eklenmez |
| K3 | **Dosya-tabanlı çekirdek + `LeaseBackend` arayüzü** — daemon'suz, .locks deseni | En az yeni hata-noktası; 3 backend'de çalışır; offline/air-gapped (AS-7) uyumlu; enterprise backend V2'de aynı arayüze takılır |
| K4 | **Hakem LLM değil, deterministik kod** — Brain politikayı koyar, çekirdek uygular | Gecikme + maliyet + Brain her zaman ayakta değil (REPL solo, autonomous) |

## 3. Non-Goals (V1)

- Cross-machine / distributed arbitration (V2+, `LeaseBackend` arayüzüne API backend)
- Çoklu-lease (bir holder aynı anda birden fazla sınıf) — V1'de tek lease, deadlock imkânsız
- Öncelik/CRITICAL kuyruk atlama — FIFO yeterli (YAGNI)
- REPL agentic + autonomous capability-dispatch wire — çekirdek API hazır, wire V2
- Brain'e-devir (max-wait aşımında reroute) — V2

## 4. Mimari — 4 Katman

```
┌─ L1 PLAN-TIME (Brain politikası) ── wave/dispatch paketleme, kapasite-farkındalıklı (optimizasyon)
├─ L2 SPAWN-TIME (enjeksiyon) ─────── PATH-prepend shim dizini + prompt bilgilendirme
├─ L3 RUNTIME (hard gate — DİŞ) ───── shim: acquire → exec → release; FIFO + sıra numarası
└─ L4 BACKSTOP (mevcut) ───────────── cgroup --memory + tierBasedMaxWorkers (değişmez)
```

- **L1** dosya-scope çakışma tespitinin (`detectScopeCollisions` → `buildCollisionAwareWaves`) kaynak-boyutuna
  genişlemesi: aynı ağır sınıfa dokunması beklenen task sayısı wave/dispatch başına kapasiteyle sınırlanır.
  TOPP (ADR-064, continuous dispatch) yolunda: dispatcher doygun sınıfın task'ını erteleyip başka task seçer.
  L1 **doğruluk garantisi vermez** — kuyruğu kısaltan optimizasyondur; garanti L3'tedir.
- **L3** tüm yürütme yollarında aynıdır: docker (entrypoint env), tmux, subprocess (spawn env PATH-prepend) —
  ADR-089 backend-bağımsızlık ruhu.

## 5. Bileşenler

### 5.1 `src/core/resource-arbiter.ts` — çekirdek (yeni)
```ts
interface LeaseBackend {
  acquire(classId: string, holder: LeaseHolder, opts?: AcquireOpts): Promise<LeaseGrant>; // bloklar (FIFO)
  release(classId: string, seq: number): void;
  renew(classId: string, seq: number): void;          // TTL/mtime yenileme
  status(classId?: string): LeaseStatus[];            // granted + waiting + seq
}
class FileLeaseBackend implements LeaseBackend { /* .deckent/leases/ */ }
```
- ADR-008 uyumlu: core/ modülü, orchestra'dan import ETMEZ. ADR-010: yeni dependency yok (node:fs).

### 5.2 Lease deposu — `.deckent/leases/` (mount'la container'lar arası paylaşımlı, `.tasks`/`.locks` gibi)
```
.deckent/leases/<classId>/seq                      # monoton sayaç (atomik artırım, file-lock deseni)
.deckent/leases/<classId>/granted/<seq>-<holder>.json   # {holder, taskId?, acquiredAt, ttlSeconds}
.deckent/leases/<classId>/waiting/<seq>-<holder>.json
```
**Acquire algoritması:** waiting kaydı al (seq) → döngü: stale-granted temizle → `granted < capacity` VE
`seq == min(waiting)` ise atomik rename ile waiting→granted (tek-kazanan) → değilse 1-2 sn uyu + waiting
mtime yenile + hb güncelle. Head-of-line promotion: basit, doğru; capacity>1'de ardışık tick'lerde dolar
(1-2 sn ek gecikme kabul). **Stale:** mtime > ttl → temizlenir (`clearStaleLocks` deseni; crash kurtarması).

### 5.3 `src/core/resource-classes.ts` — parametrik sınıf tanımları (yeni)
```jsonc
// .deckent/config.json → "resource_classes" (3-katman config merge: defaults → global → project)
{
  "heavy-test":      { "match": ["\\bvitest\\b.*\\brun\\b", "\\bjest\\b", "\\bpytest\\b", "\\bgo test\\b"],
                       "capacity": "auto",  "policy": "queue",  "ttlSeconds": 1800 },
  "package-install": { "match": ["\\b(npm|pnpm|yarn)\\b.*\\binstall\\b", "\\bpip install\\b"],
                       "capacity": 1,       "policy": "queue",  "ttlSeconds": 600 },
  "native-build":    { "match": ["\\bmake\\b.*-j", "\\bcmake --build\\b", "\\bcargo build\\b"],
                       "capacity": "auto",  "policy": "queue",  "ttlSeconds": 1800 },
  "db-migration":    { "match": ["\\bmigrate\\b"], "capacity": 1, "policy": "reject", "ttlSeconds": 900 }
}
```
- **`capacity: "auto"` — zero-hard-code:** host-detector'dan formül:
  `heavy-test = max(1, min(3, floor(totalGB/16), floor(cores/4)))` (bu makine 40 GB/20 core → 2).
  Sabit sayı gömülmez; config'den sayıyla override edilebilir.
- **`policy: "queue"`** = FIFO bekle · **`"reject"`** = dürüst hata döndür (worker NO_GO yazabilir — sahte başarı yok).
- **Stack profilleri JSON-veri:** TS/generic V1 built-in; python/c++/ERP profilleri kod değişikliği
  gerektirmeden veri olarak eklenir (kullanıcı tanımlar veya ürün data-update gönderir).
- Şemada `tenant?` alanı V1'den rezerve (F3/F4 hizası) — V1'de kullanılmaz.

### 5.4 `src/orchestra/lease-shim.ts` — shim üretici (yeni)
- Spawn sırasında `resource_classes`'tan `.deckent/shims/current/<binary>` script'leri üretir
  (vitest, npm, pnpm, yarn, pytest, make, cmake, cargo… — match listesinden türetilir).
- Shim: `acquire(class)` → `trap release EXIT` → kendi dizinini PATH'ten çıkararak **gerçek binary'yi exec** eder.
- Worker spawn'ı (3 backend) PATH-prepend yapar; `DECKENT_TASK_ID`/`DECKENT_WORKER_ID` env zaten worker'a
  enjekte — shim hb entegrasyonu için bunu okur (env yoksa — REPL/manuel — hb adımını atlar, gate yine çalışır).
- Shim dosyaları worker `scope.filesWrite` DIŞINDA (spawner üretir; worker düzenlemesi Auditor ihlal sinyali).

### 5.5 Saat dondurma (K2) — kontrat
- Shim beklerken `.tasks/task-XXX.hb` içine `WAITING_LEASE:<classId>:pos=<n>` yazar, her poll tick'inde
  mtime yeniler.
- **Timeout-watchdog** (spawn-backend-docker + result-collector deadline mantığı): hb'de taze
  `WAITING_LEASE` işareti varsa deadline'ı bekleme süresi kadar uzatır.
- **Auditor:** taze-mtime'lı `WAITING_LEASE` hb'si sağlıklıdır — stale-heartbeat alarmı üretmez.

### 5.6 Görünürlük & CLI
- Kuyruğa giriş/grant/release → `emitProgress` (PROGRESS channel, Sprint 280-001) +
  `notify('progress')` (280-002) → tty + MCP + file 3-surface: *"w-3 heavy-test kuyruğunda, sıra 2"*.
- `deckent lease ls|release <class> <seq>|clear --stale` — operatör görünürlüğü + acil müdahale.
- **i18n:** tüm user-facing mesajlar `getMessage` (en+tr); shim/arbiter mekanizması string-free.

## 6. Veri Akışı — 8 worker × vitest senaryosu

1. w1 `npx vitest run` → shim `acquire('heavy-test')` → kapasite 2 → w1+w2 granted (seq 1,2) → exec.
2. w3..w8 → waiting (seq 3..8); hb `WAITING_LEASE:heavy-test:pos=N` → sayaç durur, Auditor sessiz,
   PROGRESS/notify: "6 worker test kuyruğunda".
3. w1 biter → trap release → head-of-line (seq 3) 1-2 sn içinde promote → exec.
4. w2 crash → TTL/mtime stale → temizlik → sıradaki devam. Kilitlenme **fiziken imkânsız**.

## 7. Hata Yönetimi

- **Fail-open (ana ilke):** arbiter/shim İÇ hatası (modül yüklenemedi, leases/ yazılamıyor, bozuk lease
  dosyası) → komut SERBEST çalışır + uyarı loglanır. Yeni katman sprint'i/REPL'i ASLA düşürmez
  (Sprint 280 fail-safe kuralının aynısı).
- **Bozuk lease dosyası** → stale say + temizle + devam.
- **Deadlock:** V1 tek-lease-per-holder (iç içe acquire aynı lease'i döndürür) → çevrim imkânsız.
- **Açlık:** FIFO seq garantisi; promotion yalnız head-of-line.
- **Saat çarpıklığı:** TTL kararları wall-clock yerine dosya mtime'ı üstünden (tek makine, tutarlı).
- **`reject` çakışması** (örn. eşzamanlı db-migration): açık i18n hata → worker dürüst NO_GO → Brain FIX.

## 8. Genelleme — ERP/Enterprise + Öğrenme Döngüsü

- **ERP/iş kaynakları:** lease adı serbest anahtar — `erp.material.<lot>` capacity-1 → "2 agent aynı
  malzemeden mamul üretemez" aynı primitive. Autonomous capability-dispatch V2'de acquire çağırır.
- **Tecrübeyle öğrenme:** nervous detector resource-log + exit-137/timeout forensiğini izler → yeni
  kural önerisi (rule-evolver deseni) → **nervous accept/edit/reject** onayı (Sprint 280 APPROVE-007b
  edit akışı) → `resource_classes`'a eklenir. "Zamanla içeriye ekleme" böylece ürünleşir, elle kalmaz.
- **Enterprise V2+:** `LeaseBackend` arayüzüne API-server backend (tenant-scoped, multi-machine) —
  çağıran kod değişmez (provider-adapter deseni).

## 9. Test Stratejisi

| Grup | İçerik |
|------|--------|
| Birim (hermetik, tmpdir) | FileLeaseBackend: acquire/release/FIFO sırası/capacity/stale-temizlik/tek-kazanan-promotion/fail-open (8+) |
| Birim | resource-classes: şema doğrulama, config merge, capacity-auto formülü, match-regex derlemesi (5+) |
| Birim | lease-shim: shim üretimi, PATH-self-exclusion, trap-release, env-yokken hb-atlama (5+) |
| Entegrasyon | 2 gerçek subprocess, capacity-1 sınıf → serileşme kanıtı; crash→stale→devralma (3+) |
| Watchdog/Auditor | WAITING_LEASE hb → deadline uzar, stale-alarm yok (4+) |
| Tier-1 smoke (gerçek-binary) | docker'da 3 worker × sleep'li sahte-vitest → kuyruk+sıra+release gerçek logda (ADR-079) |
| Gerçek-dünya kanıtı | Bu makinede hepsi-test-koşan 8-task sprint → resource-log'da eşzamanlı heavy-test ≤ capacity |

Kurallar: async spawn (spawnSync YASAK), tmpdir, gitignored-state okunmaz (ADR-087 / test:ci-sim).

## 10. V1 / V2 Kesimi

**V1:** core arbiter + FileLeaseBackend + 3-backend shim + 4 built-in profil + saat-donması +
PROGRESS/notify + `deckent lease` CLI + basit L1 packing (TOPP-uyumlu dispatch erteleme).
**V2:** REPL agentic + autonomous capability wire · max-wait→Brain devri (askBrain) · tenant/API backend ·
çoklu-lease (sıralı edinim) · öncelik · dashboard kuyruk paneli · cross-machine mesh (#3-mesh hizası).

## 11. ADR Etkileri

- **ADR-090 (yeni, önerilecek):** Resource Arbiter — izin-önce-eylem admission control.
- **ADR-008 ✓** core→orchestra tek yön korunur (arbiter core/, shim orchestra/).
- **ADR-010 ✓** yeni runtime dependency yok.
- **ADR-037:** ilk gerçek **hard-enforce** katmanı — RBAC advisory'sinin tamamlayıcısı (çelişki yok; scope farklı).
- **ADR-045/064:** L1 packing wave/TOPP semantiğine ek — dispatch-erteleme kapasite-farkındalıklı.
- **ADR-079:** Tier-1 smoke zorunlu. **ADR-087 ✓** hermetik/async. **ADR-032/i18n ✓** getMessage en+tr.
- **AS-7 (air-gapped) ✓** ağ yok, daemon yok — offline'da aynen çalışır.
