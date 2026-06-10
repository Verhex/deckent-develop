# DIRECTIVES — Sprint 271: Kaynak Gözlemlenebilirliği + Optimizasyon Temeli + Publish Engelleri

## Goal: deckent'in docker worker kaynak ayak izi ÖLÇÜLEBİLİR ve YÖNETİLEBİLİR olsun (Alperen 2026-06-10: "anlık RAM datasına erişmek istiyorum; RAM/VRAM/SSD limitlerini netleyip optimize edeceğiz — daha az kaynakla aynı performans; kurumsal + yüksek-bütçesiz kullanıcılar için kritik"): docker-stats örnekleyici + sprint-yaşamdöngüsü wire'ı + `deckent resources` CLI + doctor kaynak satırı. Yanında: 270'in bıraktığı publish engelleri (pack 4.8MB>3MB, 17 kırık link, manifest F3-009) + crash-hardening (.spawnlock). MİKRO-TASK + DEPENDENCY + MODEL-KATMANLAMA. Mevcut gerçekler: per-container limit 4g/6g default (spawn-backend-docker.ts:41-42, Sprint 191), max_workers artık 6, image 1.72GB, VRAM container'da kullanılmıyor.

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable spawn/fs; gerçek docker/ağ YASAK testlerde; spawnSync YASAK.
- **Self-verify TARGETED:** yalnız kendi test dosyaların; başkasının yarım dosyası NO_GO sebebi değil (notes'a).
- **Fail-safe:** kaynak-izleme hatası sprint'i ASLA düşürmez/yavaşlatmaz (best-effort, log-and-continue).
- **Davranış korunumu:** her şey opt-in/additive; default'lar değişmez.
- **i18n-FIRST:** user-facing string `getMessage(key, lang)` (en+tr).
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını koş. Gerçek-binary smoke CC sprint-sonu (ADR-079).

---

## Task 1: resource-monitor çekirdeği — docker stats örnekleyici → JSONL
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: devops-engineer
- Skills: typescript-expert, testing-expert, docker-expert
- Files: src/orchestra/resource-monitor.ts, tests/orchestra/resource-monitor.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**YENİ `src/orchestra/resource-monitor.ts`** (orchestra'da — `parseMemoryString`'i `spawn-backend-docker.ts:52`'den import eder, ADR-008 uyumlu): `createResourceMonitor(opts: { intervalMs?: number; logPath: string; spawnImpl?; filterPrefix?: string }): { start(): void; stop(): Promise<void>; sampleOnce(): Promise<ResourceSample[]> }`. Her tick'te `docker stats --no-stream --format "{{json .}}"` (async spawn, injectable) → satır-satır parse → `filterPrefix` ('deckent-w-' default) ile süz → `ResourceSample { ts, container, taskId (addan türet: deckent-w-<id>), memUsageBytes, memLimitBytes, memPerc, cpuPerc, netIO, blockIO }` → `logPath`'e JSONL append (append-only, atomic gerekmez — tek yazar). Hatalar (docker yok, parse kırığı): log-and-continue, ASLA throw etmez; stop() bekleyen tick'i temiz kapatır. Testler: mock spawn ile örnekleme/parse/filtre/append; docker-yok senaryosu sessiz; stop temizliği; taskId türetimi.

**Kanıt:** `npx vitest run tests/orchestra/resource-monitor.test.ts` yeşil; `grep -n "parseMemoryString" src/orchestra/resource-monitor.ts` ≥ 1. **Test:** 8+.

---

## Task 2: resource_monitor config bloğu
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/config-types.ts, src/core/config.ts, tests/core/config-resource-monitor.test.ts
- Scope: src/core/, tests/core/

### Description
Config'e opt-in blok (autonomous bloğu desenini izle — config-types.ts + validateConfig): `resource_monitor?: { enabled: boolean (zorunlu, default davranış=blok yok=kapalı); interval_ms?: number (default 5000, min 1000 validasyonu); log_path?: string (default '.deckent/resource-log.jsonl') }`. Validation hataları mevcut stil; alan yokken sıfır davranış değişikliği. Testler: geçerli/geçersiz bloklar, min-interval, default'lar.

**Kanıt:** `npx vitest run tests/core/config-resource-monitor.test.ts` yeşil; `grep -n "resource_monitor" src/core/config-types.ts` ≥ 1. **Test:** 5+.

---

## Task 3: resource-log analiz fonksiyonları — per-task peak/avg
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: performance-analyzer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/resource-report.ts, tests/orchestra/resource-report.test.ts
- Dependencies: 271-001
- Scope: src/orchestra/, tests/orchestra/

### Description
**YENİ `src/orchestra/resource-report.ts`** (Task 1'in ResourceSample tipini import eder — Dependencies bu yüzden): pure fonksiyonlar — `parseResourceLog(content: string): ResourceSample[]` (bozuk satırları atla) + `summarizeByTask(samples): TaskResourceSummary[]` (`{ taskId, container, samples, peakMemBytes, avgMemBytes, peakMemPerc, peakCpuPerc, firstTs, lastTs, durationMs }`) + `summarizeSprint(samples)` (toplam eşzamanlı peak: aynı ts-penceresindeki container'ların mem toplamının maksimumu — sistem tavanı analizi için kritik) + `formatBytes(n)` (insan-okur). I/O YOK (pure — CLI Task 4'te okur). Testler: sentetik örneklerle peak/avg/eşzamanlı-toplam doğruluğu, bozuk satır toleransı, boş log.

**Kanıt:** `npx vitest run tests/orchestra/resource-report.test.ts` yeşil; `grep -n "summarizeByTask\|summarizeSprint" src/orchestra/resource-report.ts` ≥ 2. **Test:** 8+.

---

## Task 4: `deckent resources` CLI — anlık snapshot + log özeti
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/resources.ts, src/cli/index.ts, src/cli/helpers/messages.ts, tests/cli/resources-command.test.ts
- Dependencies: 271-001, 271-003
- Scope: src/cli/, tests/cli/

### Description
**YENİ `deckent resources` komutu** (register pattern ADR-012; `src/cli/index.ts`'e kayıt): (a) default: anlık snapshot — Task 1 `sampleOnce()` ile canlı `docker stats` tablosu (container, task, RAM kullanım/limit/%, CPU%) + altta etkin konfig satırı (memory limit 4g/6g default ?? config, max_workers, hesaplanan tavan = workers×limit); (b) `--log [path]`: Task 3 ile log özeti — task başına peak/avg tablo + sprint eşzamanlı-peak; (c) `--json` ham çıktı. i18n en+tr (tablo başlıkları dahil). Docker yoksa dürüst i18n mesajı, exit 0 (bilgi komutu). Testler: mock monitor/log ile tablo render, --json shape, docker-yok yolu.

**Kanıt:** `npx vitest run tests/cli/resources-command.test.ts` yeşil; `grep -n "registerResources" src/cli/index.ts` ≥ 1. **Test:** 7+.

---

## Task 5: sprint-yaşamdöngüsü wire — opt-in izleme SPAWN→CLEANUP
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: devops-engineer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-phases.ts, tests/orchestra/resource-monitor-wire.test.ts
- Dependencies: 271-001, 271-002
- Scope: src/orchestra/, tests/orchestra/

### Description
Task 1 monitor'ünü sprint yaşam döngüsüne bağla — YALNIZ `config.resource_monitor?.enabled === true` iken: SPAWN fazı başında `createResourceMonitor(...).start()`, CLEANUP'ta (ve TÜM erken-çıkış/hata yollarında — finally disiplini) `stop()`. Monitor başlatma/örnekleme hatası sprint'i ASLA etkilemez (try/catch + debugLog). Wire noktasını koda yorumla belgele (sprint-controller mı sprint-phases mı — mevcut faz-hook desenine en uygun yeri SEÇ, iki dosyaya da yazma yetkin var ama minimal-diff). Disabled iken sıfır davranış farkı (mevcut testler yeşil). Testler: enabled=true → start/stop çağrıları (mock monitor inject — DI seam'i ekle), disabled → hiç çağrı yok, monitor-throw → sprint akışı etkilenmez.

**Kanıt:** `npx vitest run tests/orchestra/resource-monitor-wire.test.ts` yeşil; `grep -n "resource_monitor" src/orchestra/sprint-controller.ts src/orchestra/sprint-phases.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 6: doctor "Worker Resources" satırı — limit görünürlüğü + tavan uyarısı
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: devops-engineer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/doctor.ts, src/cli/helpers/messages.ts, tests/cli/doctor-resources.test.ts
- Dependencies: 271-002
- Scope: src/cli/, tests/cli/

### Description
Doctor'a kaynak bölümü (270'in doctor desenini izle — auth-probe/image-check satırlarının yanına): etkin `worker_memory_limit/swap` (config ?? 4g/6g default — `spawn-backend-docker.ts` DEFAULT sabitlerini import et, hardcode ETME), `max_workers` (config ?? default), **hesaplanan RAM tavanı** = max_workers × limit, host toplam RAM (`os.totalmem()`) ve oran. Oran > %60 → `[WARN] worker RAM tavanı (XGB) host'un %N'i — max_workers/worker_memory_limit düşürmeyi düşünün` (i18n; bugünkü WSL-crash dersi). resource_monitor bloğu varsa enabled/interval bilgi satırı. Testler: hesap doğruluğu (mock os.totalmem), eşik uyarısı var/yok, default'lar.

**Kanıt:** `npx vitest run tests/cli/doctor-resources.test.ts` yeşil; `grep -n "totalmem\|RAM tavan\|ram_ceiling" src/cli/commands/doctor.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 7: resource-profile referansı — kod-türevli kaynak haritası
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/resource-profile.md
- Dependencies: 271-002, 271-004
- Scope: docs/reference/

### Description
**YENİ `docs/reference/resource-profile.md`** — kod-türevli (uydurma YOK): per-container default'lar 4g/6g (`spawn-backend-docker.ts:41-42`) + config anahtarları (`worker_memory_limit/swap`, `max_workers`, `resource_monitor` bloğu — Task 2 diskte olduğunda; Dependencies), Node heap'in cgroup'a oranlanması (`:98` civarı yorum), RAM tavan formülü (workers×limit), worker image boyutu (~1.7GB) ve `docker system df` ile katman temizliği, VRAM gerçeği (worker container'ları GPU KULLANMAZ — yalnız host-side ollama), `deckent resources` kullanımı (Task 4), `.deckent/resource-log.jsonl` formatı. "Ölçülmüş profil" bölümü için yer aç ve şunu yaz: gerçek ölçümler sprint-içi toplanır ve CC tarafından eklenir (boş tablo başlığı bırak — uydurma sayı YAZMA).

**Kanıt:** `grep -ciE "worker_memory_limit|resource_monitor|4g" docs/reference/resource-profile.md` ≥ 3. **Test:** yok — .result YAZ.

---

## Task 8: pack diyeti — 4.8MB → eşik altı
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: package.json, scripts/validate-publish.mjs, tests/scripts/validate-publish.test.ts
- Scope: ./package.json, scripts/, tests/scripts/

### Description
270 bulgusu: `pack_size_and_count` gate'i kırmızı — tarball 4.8MB > 3MB eşiği. ÖNCE analiz (`npm pack --dry-run --json` içerik dökümü — .result'a en büyük 10 girdiyi yaz): bilinen şüpheliler `dist/dashboard/decko-mascot.png` (779KB), source-map'ler, gereksiz asset'ler. SONRA diyet: `package.json files` allowlist'i / `.npmignore` ile gereksizleri at (mascot'u küçült/webp'e çevirme YOK — sadece dahil-etme kararları; dashboard'ın ÇALIŞIR kalması şart: index.html + assets bundle'ları pakette KALIR — Task 270-001 gate'i bunu doğruluyor). Hedef: eşik altı; mimari olarak inmiyorsa (dashboard bundle meşru büyüklükse) eşiği gerekçeli güncelle (örn. 5MB) + yorumla belgele — DÜRÜST karar, .result'a gerekçe. Test: gate yeşil senaryosu güncel.

**Kanıt:** `node scripts/validate-publish.mjs` çıktısında pack_size_and_count=PASS (`npm pack` gerektiriyorsa --dry-run yolunu kullan); `npx vitest run tests/scripts/validate-publish.test.ts` yeşil. **Test:** mevcut + güncellenen.

---

## Task 9: link lint — 17 kırık link
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, ci-testing
- Files: docs/
- Scope: docs/, README.md, scripts/lint-links.mjs

### Description
270 bulgusu: `link_lint` gate'i 17 kırık link raporluyor. `node scripts/lint-links.mjs` (veya `npm run lint:link`) koş, TÜM kırıkları listele (.result'a), her birini düzelt: taşınan/yeniden adlanan dosyalara güncel yol, silinmişlere en yakın güncel hedef, gerçekten ölü dış linklere kaldırma/değiştirme. Link hedefi belirsizse içerikten en mantıklı güncel dokümanı seç + .result'a not. lint-links.mjs'in KENDİSİNE dokunma (false-positive iddiası varsa düzeltme yerine .result'a yaz).

**Kanıt:** `node scripts/lint-links.mjs` exit 0. **Test:** lint yeşil — .result YAZ.

---

## Task 10: manifest F3-009 pre-existing test çifti
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: scripts/sync-manifest.mjs, tests/scripts/manifest-autonomous.test.ts
- Scope: scripts/, tests/scripts/

### Description
Pre-existing kırmızı çift: `tests/scripts/manifest-autonomous.test.ts` — "(a) sync-manifest.mjs source contains the F3-009 label string" + "(b) --dry-run --json active entry has the correct F3-009 label". ÖNCE kökü teşhis et: `scripts/sync-manifest.mjs` FEATURE_DEFINITIONS'taki autonomous-runtime girdisinin label'ı testin beklediğinden farklılaşmış (hangisi doğru? — feature GERÇEKTEN F3-009 etiketiyle mi anılmalı: MASTER-PLAN/manifest gerçeğine bak). Senkronla: ya script label'ını testin sözleşmesine döndür ya testi güncel gerçeğe güncelle — hangisini seçtiğini gerekçesiyle .result'a yaz. `--dry-run --json` çıktısı doğrulanır.

**Kanıt:** `npx vitest run tests/scripts/manifest-autonomous.test.ts` yeşil. **Test:** mevcut suite yeşil.

---

## Task 11: crash-hardening — .spawnlock bayat-kilit temizliği kurtarma araçlarında
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/core/file-lock.ts, src/cli/commands/recover.ts, tests/core/file-lock-spawnlock.test.ts
- Scope: src/core/, src/cli/, tests/core/, tests/cli/

### Description
Bugünkü canlı bulgu (WSL-crash kurtarması): crash sonrası `.locks/*.spawnlock` dosyaları kaldı ve sonraki `deckent spawn`'ı "Spawn lock conflict" ile blokladı; `clearStaleLocks` (`src/core/file-lock.ts`) yalnız `.lock` uzantısını süpürüyor. Fix: (1) `clearStaleLocks`'a (ya da yeni `clearStaleSpawnLocks` + recover'da ikisini çağır — mevcut sözleşmeyi bozmayan yolu seç) `.spawnlock` desteği — aynı yaş eşiği (acquiredAt/mtime > eşik) + ölü-koşu güvenliği; (2) `deckent recover` çıktısında temizlenen spawnlock sayısı raporlanır. Spawnlock'u YÖNETEN modülü bul (spawn-lock yazan kod) ve format sözleşmesini oradan türet (acquiredAt alanı var — gördük). Testler: tmpdir'de bayat/taze spawnlock ayrımı, recover entegrasyonu (dry-run sayımı).

**Kanıt:** `npx vitest run tests/core/file-lock-spawnlock.test.ts` yeşil; `grep -n "spawnlock" src/core/file-lock.ts src/cli/commands/recover.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 12: features + cli-commands — resources/resource_monitor satırları
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md, docs/reference/cli-commands.md
- Dependencies: 271-002, 271-004, 271-006
- Scope: docs/reference/

### Description
DİSKTEKİ koddan (Dependencies — inmemişleri yazma + .result'a not): `docs/reference/features.md`'e resource-monitor/`deckent resources`/doctor-resources satırları (tetikleyen config/komutla); `docs/reference/cli-commands.md`'e `deckent resources` bölümü (snapshot/--log/--json) + doctor kaynak satırı notu. Mevcut format korunur.

**Kanıt:** `grep -ciE "resources|resource_monitor" docs/reference/features.md docs/reference/cli-commands.md | paste -sd+ | bc` ≥ 4 (iki dosya toplamı). **Test:** yok — .result YAZ.

---

## Task 13: MASTER-PLAN işaretleri — 271 kapananlar
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Dependencies: 271-005, 271-008, 271-009, 271-011
- Scope: docs/

### Description
Diskte doğruladıklarını işaretle (inmemişleri İŞARETLEME): F1-LIM → "resource-aware spawn temel ölçüm katmanı ✅ Sprint 271 (monitor+CLI+doctor; algıla→park kalan)", publish engelleri pack/link satırları, crash-hardening spawnlock. Tek-satır ekler, mevcut metni silme.

**Kanıt:** `grep -c "Sprint 271" docs/MASTER-PLAN.md` ≥ 2. **Test:** yok — .result YAZ.

---

**Beklenen:** 13 mikro task (opus 1 · sonnet 9 · haiku 3), zincirler: 003→001 · 004→001,003 · 005→001,002 · 006→002 · 007→002,004 · 012→002,004,006 · 013→005,008,009,011. max_workers=6 (yeni config) — CC sprint boyunca kendi docker-stats örnekleyicisini koşturup CANLI RAM verisi toplar (Alperen'in anlık-data isteği bu sprint'te elle karşılanır; kalıcı mekanizma Task 1-5). CC sprint sonu: ölçüm raporu + tsc + testler + gerçek-binary `deckent resources` + commit/push + 🔨 BUILD. Sonraki: ölçüm-verisiyle optimizasyon kararları (limit düşürme denemeleri) + F1-LIM algıla→park + PLAN-INT-1/XVER-1.
