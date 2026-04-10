# DIRECTIVES — Sprint 133: Security Hardening + Critical Fixes + Load Test + Auto-Archive

## Goal: Sprint 132 Full 360° audit'inde tespit edilen 4 CRITICAL + 3 HIGH bulgusunu kapatmak, 3 dokümantasyon/test borcunu çözmek, kullanıcı tarafından önerilen DIRECTIVES auto-archive özelliğini eklemek, Sprint 134'ten erken çekilen 2 düşük riskli task'ı dahil etmek ve Deckent'in hot path'lerini empirik yük testine sokmak. Referans: docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md ve docs/superpowers/specs/2026-04-10-sprint-133-design.md.

---

## Task 1: Plugin Hook Sandbox Sertleştirme
- Model: opus
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/core/plugin.ts, src/core/plugin-loader.ts
- Scope: src/core/

### Description
Sprint 132 W1 CRITICAL #1 bulgusu: Plugin hook modülleri `import()` ile imza doğrulaması veya izin listesi olmaksızın yükleniyor. Bu sprint'te plugin hook yükleyici öncesi SkillSandbox AST taramasını zorunlu kılacak, plugin manifest'inde `sha256` imza alanı bekleyecek, allowed path list kontrolü ekleyecek, doğrulama başarısız olursa yüklemeyi reddedecek bir koruma katmanı ekle.

- `loadHookModule()` çağrısı öncesi plugin dosyasını SkillSandbox ile tara
- PluginManifest tipine optional `signature: { algorithm: 'sha256', value: string }` alanı ekle
- Plugin lifecycle'da imza eşleşmezse `PluginSecurityError` fırlat
- Mevcut plugin'lerin kırılmaması için: manifest'te imza yoksa `UNSIGNED` uyarısı verilsin, `config.plugin_require_signature=true` set edilirse yüklemeyi reddetsin (varsayılan false, backwards-compat)
- En az 4 yeni unit test: (a) sandbox-less plugin reject, (b) imza eşleşmezse reject, (c) UNSIGNED warning when require=false, (d) valid plugin still loads

**Kanıt:** `grep -n "PluginSecurityError\|require_signature" src/core/plugin.ts src/core/plugin-loader.ts` → yeni eklemeler görünmeli

**Test:** 4+ test (sandbox scan, imza reject, unsigned warning, happy path)

---

## Task 2: npm --ignore-scripts Varsayılan
- Model: sonnet
- Effort: low
- Agent: security-auditor
- Skills: security-specialist
- Files: package.json, src/core/plugin.ts
- Scope: ., src/core/

### Description
Sprint 132 W1 CRITICAL #2 bulgusu: plugin install akışında `npm install` çağrıları `--ignore-scripts` bayrağını geçmiyor; kötü niyetli postinstall script'leri sandbox'sız çalışabilir.

- package.json `scripts` bloğuna `"install": "npm install --ignore-scripts"` veya `.npmrc` dosyasına `ignore-scripts=true` ekle (minimum invasive olanı seç)
- src/core/plugin.ts içinde npm install komutu oluşturan her yerde `--ignore-scripts` bayrağını append et
- CI workflow dosyalarını (eğer .github/workflows altında varsa) gözden geçir ve `--ignore-scripts` geç
- 2+ unit test: plugin install komutu testinde `--ignore-scripts` argumanı geçildiğini assert et

**Kanıt:** `grep "ignore-scripts" package.json src/core/plugin.ts .npmrc 2>/dev/null` → en az 2 hit

**Test:** 2+ test (install komut assertion, .npmrc varlığı eğer oluşturulursa)

---

## Task 3: HTTP API Bearer Token Auth
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: security-specialist, api-builder
- Files: src/api/server.ts, src/api/auth.ts
- Scope: src/api/

### Description
Sprint 132 W1 HIGH #3 bulgusu: HTTP API GET endpoint'leri kimlik doğrulama istemiyor. Bearer token middleware ekle, token'lar src/core/credentials.ts üzerinden okunsun, tüm endpoint'ler auth ardında olsun (health endpoint hariç).

- Yeni dosya `src/api/auth.ts` — `bearerAuthMiddleware(req, res, next)` Express middleware
- Token kaynağı: `config.api_auth_token` veya `DECKENT_API_TOKEN` env var
- src/api/server.ts tüm GET/POST endpoint'lerine middleware uygula, `/health` istisna
- Auth başarısız → 401 Unauthorized + JSON `{ error: "authentication required" }`
- Auth başarılı ama token yanlış → 403 Forbidden
- En az 5 yeni test: (a) no token → 401, (b) wrong token → 403, (c) right token → 200, (d) health endpoint bypass, (e) env var fallback

**Kanıt:** `grep "bearerAuthMiddleware\|api_auth_token" src/api/server.ts src/api/auth.ts` → hit

**Test:** 5+ test (no token, wrong token, right token, health bypass, env fallback)

---

## Task 4: loadConfig() Module-Level Cache
- Model: opus
- Effort: low
- Agent: performance-analyzer
- Skills: performance-optimizer, typescript-expert
- Files: src/core/config.ts
- Scope: src/core/

### Description
Sprint 132 W2 CRITICAL #2 bulgusu: `loadConfig()` her çağrıda 3-layer deepMerge + 4x structuredClone yapıyor, hiçbir cache yok. Sprint pipeline boyunca onlarca gereksiz reload.

- Module-level `let cachedConfig: DeckentConfig | null = null; let cacheStamp: number = 0`
- `loadConfig(options?: { force?: boolean })` imzasını genişlet
- Cache invalidation tetikleyicileri: (a) explicit `force: true`, (b) `.deckent/config.json` mtime değişikliği (stat check), (c) `DECKENT_CONFIG_RELOAD=1` env var
- Cache hit durumunda structuredClone maliyeti kaldırılsın (immutable return için Object.freeze opsiyonu düşünülebilir ama şimdilik referans dönelim)
- En az 4 test: (a) ilk çağrı disk I/O, (b) ikinci çağrı cache hit, (c) mtime değişince reload, (d) force: true reload

**Kanıt:** `grep -n "cachedConfig\|cacheStamp" src/core/config.ts` → hit

**Test:** 4+ test (cold load, cache hit, mtime invalidation, force reload)

---

## Task 5: results → Map Index (O(n²)→O(n))
- Model: opus
- Effort: low
- Agent: performance-analyzer
- Skills: performance-optimizer, typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/result-collector.ts
- Scope: src/orchestra/

### Description
Sprint 132 W2 HIGH bulgusu: sprint-controller.ts ve result-collector.ts içinde `results.find(r => r.taskId === ...)` O(n²) linear scan yapıyor. `Map<taskId, TaskResult>` index'e çevir.

- result-collector.ts'de `results: TaskResult[]` yerine `resultsMap: Map<string, TaskResult>` kullan
- sprint-controller.ts içinde her `.find(r => r.taskId === X)` → `resultsMap.get(X)` dönüştür
- Mevcut API call-site'ları (dashboard, retro, reporter) Array dönüşü bekliyorsa `Array.from(resultsMap.values())` helper'ı ekle
- Type safety: TaskResult import'u kontrol et, resultsMap tipi tam annotate
- En az 3 test: (a) Map get performance delta assertion (opsiyonel), (b) duplicate taskId override davranışı, (c) serialization backward-compat

**Kanıt:** `grep -n "results\.find\|resultsMap" src/orchestra/sprint-controller.ts src/orchestra/result-collector.ts` → `results.find` 0 match, `resultsMap` hit

**Test:** 3+ test (Map get, duplicate taskId, array compat helper)

---

## Task 6: Sprint 131 ADR'leri Yazımı (ADR-029..032)
- Model: sonnet
- Effort: normal
- Agent: architect
- Skills: documentation-writer, system-architect
- Files: .brain/DECISIONS.md
- Scope: .brain/

### Description
Sprint 132 W5 HIGH #6 bulgusu: Sprint 131'in 5 büyük özelliği ADR olmadan implement edildi. Bu sprintte 4 ADR yaz:

- **ADR-029: Managed-Docs Universalization** — sprint lifecycle'daki dokümanların template engine tabanlı üretimi
- **ADR-030: Template Engine + Plugin Loader** — managed-docs template render pipeline
- **ADR-031: Content Hash Cache** — sprint dokümanlarının hash-based invalidation
- **ADR-032: i18n Pattern System** — tr/en içerik çeşitliliği desteği

Her ADR için standart format: Title, Status (ACCEPTED), Context, Decision, Consequences (+/-), Alternatives, References (Sprint 131 commit hash'i). ADR-028'den sonra ekle, `.brain/DECISIONS.md` mevcut format'ı koru.

**Kanıt:** `grep -c "^## ADR-029\|^## ADR-030\|^## ADR-031\|^## ADR-032" .brain/DECISIONS.md` → 4

**Test:** Doküman task'ı, test gerekmiyor; md dosyası var olmalı ve 4 ADR her biri ≥50 satır içermeli

---

## Task 7: Kritik Modül Unit Testleri (5 Modül, ≥15 Test)
- Model: opus
- Effort: high
- Agent: test-writer
- Skills: testing-expert, typescript-expert
- Files: tests/unit/heartbeat-daemon.test.ts, tests/unit/mid-sprint-adapter.test.ts, tests/unit/promotion-pipeline.test.ts, tests/unit/spawn-backend-docker.test.ts, tests/unit/sprint-utils.test.ts
- Scope: tests/unit/, src/orchestra/, src/core/

### Description
Sprint 132 W3 HIGH #1-4 bulgusu: 9 kritik kaynak modülün doğrudan test dosyası yok. Bu sprintte en kritik 5'i için unit test oluştur:

1. **heartbeat-daemon.ts** (247 LoC) — 3+ test: heartbeat write/read, stale detection, daemon stop
2. **mid-sprint-adapter.ts** (182 LoC) — 3+ test: failure detection, reroute logic, history tracking
3. **promotion-pipeline.ts** (286 LoC) — 3+ test: built-in guard, promotion happy path, demotion
4. **spawn-backend-docker.ts** (332 LoC) — 3+ test: mock Docker spawn, exit handling, timeout
5. **sprint-utils.ts** (361 LoC) — 3+ test: helper functions, shared utilities

Toplam **≥15 test** gereksinimi. Mock Docker için child_process.spawn mock'ı kullan. Her test dosyası vitest `describe` + `it` yapısında, `beforeEach` cleanup ile.

**Kanıt:** `ls tests/unit/heartbeat-daemon.test.ts tests/unit/mid-sprint-adapter.test.ts tests/unit/promotion-pipeline.test.ts tests/unit/spawn-backend-docker.test.ts tests/unit/sprint-utils.test.ts 2>&1 | wc -l` → 5

**Test:** 15+ test toplam, her dosyada ≥3 test, tüm testler yeşil

---

## Task 8: Competitive Analysis Güncelleme
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/analysis/competitive-analysis.md, README.md, README-TR.md
- Scope: docs/analysis/, .

### Description
Sprint 132 W6 HIGH bulgusu: `docs/analysis/competitive-analysis.md` tamamen güncel değil (skill:10 vs 21, agent:8 vs 16, MCP:12 vs 21). Nisan 2026 tarihli yenile.

- Mevcut competitive-analysis.md'yi oku, tarih bölümünü "Mart 2026" → "Nisan 2026" güncelle
- 5 rakip tablosu: Devin, OpenHands, Cursor Agents, Copilot Cowork, OpenClaw (+ Deckent)
- Her rakip için: SWE-bench skoru (biliniyorsa), fiyat, lisans, unique selling point, weakness
- Deckent feature matrix güncelle: 21 MCP tool, 16 built-in agent, 21 built-in skill, 130+ sprint, 89.33% coverage
- README.md ve README-TR.md'deki rakip paragrafını yenile

**Kanıt:** `grep "Nisan 2026\|April 2026" docs/analysis/competitive-analysis.md` → hit. `grep "21 MCP\|16 agent\|21 skill" docs/analysis/competitive-analysis.md` → hit.

**Test:** Doküman task'ı, test gerekmiyor

---

## Task 9: Yük Testi — P50/P95/P99 Mikrobenchmark
- Model: opus
- Effort: high
- Agent: performance-analyzer
- Skills: performance-optimizer, testing-expert
- Files: tests/load/load-harness.test.ts, tests/load/hot-paths.bench.ts
- Scope: tests/load/

### Description
Deckent'in hot path'lerini empirik yük testine sok. Sprint 132 rapor bulguları (799 sync I/O, config caching yok, O(n²) find) için P50/P95/P99 latency ölçümü üret.

- `tests/load/load-harness.test.ts` — vitest test içinde:
  - (a) loadConfig() × 100 çağrı → P50/P95/P99 ms
  - (b) Task claim/release simulation × 50 → P50/P95/P99 ms
  - (c) result Map lookup × 1000 vs Array find × 1000 benchmark karşılaştırma
  - (d) plugin hook sandbox AST scan × 20 → P50/P95/P99 ms
- `tests/load/hot-paths.bench.ts` — vitest bench mode ile:
  - spawnWorkers, waitForResults, evaluateResult mock harness
- Sonuçlar test output'una JSON format'ında yazılsın: `{ metric: string, p50: number, p95: number, p99: number }`
- Load test task'ın `.result` dosyasına bu JSON'u append et (notes alanında)
- Bu task diğer tüm task'ların eşzamanlı çalıştığı ortamda koşsun → gerçek sprint load condition

**Kanıt:** `ls tests/load/` → 2+ dosya. `.result` notes alanında P50/P95/P99 değerleri görünmeli.

**Test:** Yük testi task'ı kendi kendi kanıtı; vitest run yeşil olmalı, timeout 60s

---

## Task 10: finalizeSprint() DIRECTIVES Auto-Archive
- Model: opus
- Effort: normal
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-reporter.ts
- Scope: src/orchestra/

### Description
Sprint 132 kullanıcı talebi: Brain `finalizeSprint()` sonunda DIRECTIVES.md'yi otomatik arşivle + sprint N için hazır mesajla sıfırla. Bu manuel adımı ortadan kaldırır.

- Yeni helper `archiveDirectives(sprintId: string): Promise<void>` → sprint-reporter.ts veya sprint-utils.ts içinde
- DIRECTIVES.md'yi `.brain/archive/DIRECTIVES-sprint-NNN.md` olarak taşı
- Yerine placeholder DIRECTIVES.md yaz: başlık "DIRECTIVES — (Sprint N+1 için hazırlanıyor)", son sprint sonucu özeti, referans link'ler
- `finalizeSprint()` içinde RETRO yazıldıktan sonra `archiveDirectives(currentSprintId)` çağır
- Config flag: `config.auto_archive_directives: boolean` (varsayılan `true`)
- .brain/archive/ dizini yoksa oluştur
- En az 4 test: (a) archive happy path, (b) placeholder yazımı, (c) config flag off davranış, (d) dizin yoksa oluşturma

**Kanıt:** `grep -n "archiveDirectives\|auto_archive_directives" src/orchestra/sprint-controller.ts src/orchestra/sprint-reporter.ts` → hit

**Test:** 4+ test (archive path, placeholder, flag off, mkdir)

---

## Task 11: Credential Encryption (OS Keychain Minimal Wrapper)
- Model: opus
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/core/credentials.ts, src/core/credential-encryption.ts
- Scope: src/core/

### Description
Sprint 132 W1 HIGH #6 bulgusu: API key'leri plaintext JSON'da saklanıyor. Minimal OS keychain wrapper ekle — ilk adım olarak AES-256-GCM encryption, key'in kendisi OS environment veya future-safe `~/.deckent/.keyring` (chmod 0600) dosyasında.

- Yeni dosya `src/core/credential-encryption.ts`:
  - `encrypt(plaintext: string, masterKey: Buffer): { iv: string, ciphertext: string, tag: string }`
  - `decrypt(encrypted: EncryptedPayload, masterKey: Buffer): string`
  - Master key kaynak: `DECKENT_MASTER_KEY` env var (32-byte hex) VEYA `~/.deckent/.keyring` (auto-generated ilk çağrıda)
- src/core/credentials.ts'i migrate et: `saveCredential(key, value)` artık encrypt edilmiş yazsın, `loadCredential(key)` decrypt etsin
- Backward-compat: eski plaintext credentials hala okunsun (legacy fallback), ama save sırasında re-encrypt edilsin
- En az 5 test: (a) encrypt/decrypt roundtrip, (b) wrong key → decrypt fail, (c) legacy plaintext read, (d) master key auto-generation, (e) save re-encrypts legacy

**Kanıt:** `ls src/core/credential-encryption.ts` + `grep -n "encrypt\|decrypt" src/core/credentials.ts` → hit

**Test:** 5+ test (roundtrip, wrong key, legacy read, auto-gen, migrate)

---

## Task 12: Marketplace [EXPERIMENTAL] Işaretleme
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/marketplace.md, README.md
- Scope: docs/guide/, .

### Description
Sprint 132 W4 MEDIUM #4 bulgusu: Marketplace registry canlı değil ama dokümanlarda production-ready gibi sunuluyor. `[EXPERIMENTAL]` etiketi ekle + kullanıcı beklentisini yönet.

- docs/guide/marketplace.md başlığına `[EXPERIMENTAL]` prefix ekle
- İlk paragrafta "Marketplace registry şu anda canlı değil, bu bölüm scaffold/preview kapsamındadır" uyarısı
- README.md'de marketplace'ten bahseden her yere `[EXPERIMENTAL]` işareti
- README-TR.md'ye de aynı değişiklikleri uygula
- Eğer src/core/marketplace.ts veya benzeri kod dosyası varsa header comment'e EXPERIMENTAL notu ekle

**Kanıt:** `grep "EXPERIMENTAL" docs/guide/marketplace.md README.md README-TR.md` → her dosyada ≥1 hit

**Test:** Doküman task'ı, test gerekmiyor

---

## Sprint 133 Notları

- **max_workers=4** (hard limit, RAM/CPU kapasitesi)
- **brain_planning: structured** (DIRECTIVES deterministik parse edilsin)
- **worker_tier: premium** (opus varsayılan, task-level override ile sonnet/haiku LOW effort'larda)
- **verify loop: aktif** (her worker `tsc --noEmit` + `npx vitest run` çalıştırmalı)
- **task dependencies:** bilgilendirici, Deckent'in parser'ı dependency ignore edebilir (Sprint 132 W5 bulgusu)
- **external monitoring:** 3 CC sub-agent ana session'dan (Watchdog 15s, Verifier 45s, Report Updater 90s) — non-Deckent
- **acceptance:** Layer 3 tam doğrulama (tsc + vitest + grep + per-task criteria) sprint sonrası
- **FINAL-EXECUTIVE-REPORT.md:** yalnızca Layer 3 geçen task'lar rapor güncellemesine dahil
