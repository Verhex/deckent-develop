# Analysis: .claude/rules/ + .contracts/ + .deckent/ config + scripts/
**Task ID:** 142-041 | **Model:** opus | **Effort:** max

---

## FILE 1: .claude/rules/brain.md (40 lines)

### 1. Amaci
Brain orchestrator icin kurallar dosyasi. Sprint yasam dongusunu yoneten Brain ajaninin tum karar, planlama ve degerlendirme kurallarina rehberlik eder. MemoryStore, ADR sorgulama, sprint retro, decay ve agent/skill secim kurallarini icerir. Frontmatter'da `paths: [".tasks/*", ".brain/*", ".contracts/*"]` ile dosya erisim scope'u tanimli.

### 2. DB-First Compliance: PASS
- Satir 6: `All brain knowledge lives in '.brain/memory.db' (SQLite) — this is the single source of truth` — DOGRU
- Satir 7: `Query ADRs via MemoryStore: store.getByType('adr') — never parse .md files directly` — DOGRU
- Satir 9: `New architectural decisions → store.insert({ type: 'adr', status: 'accepted', ... })` — DOGRU
- Satir 18: `Write sprint learnings to DB: store.insert({ type: 'memory', sprint_id, ... })` — DOGRU
- Satir 19: `Write retrospective to DB: store.upsert({ type: 'retro', sprint_id, ... })` — DOGRU
- Satir 20: `Trigger decay via store.decay(currentSprintNum, decayAfterSprints)` — DOGRU
- Satir 21: `Export .md snapshots after sprint: deckent memory export` — DOGRU (export, parse degil)

### 3. Eski V1 Referanslar: TEMIZ
- "read DECISIONS.md" ifadesi YOK — tamamen kaldirilmis
- "parse .md" ifadesi sadece "never parse .md files directly" (negatif kural) olarak mevcut — DOGRU
- "countBrainLines" referansi YOK
- "readFileSync" referansi YOK

### 4. Eksiklikler ve Oneriler
- **P2 — searchMemory API ornegi eksik:** brain.md'de `store.getByType('adr')` var ama `searchMemory()` FTS5 sorgu ornegi yok. Brain'in PLAN fazinda ilgili ADR/pattern arama yapabilmesi icin bir ornek satir eklenebilir.
- **P3 — memory V2 config referansi eksik:** `config.json`'daki `memory_budget`, `decay_after_sprints` gibi alanlarin brain.md'de anilmasi yok. Brain'in bu degerleri nereden okumasi gerektigine dair bir not faydali olurdu.
- **P3 — store.close() cagrisi bahsedilmiyor:** Sprint sonunda DB baglantisi kapatmasi gerektigi yazilmamis.

### 5. Frontmatter Scope
```yaml
paths: [".tasks/*", ".brain/*", ".contracts/*"]
```
- Scope uygun: Brain'in erisim gerektirdigi tam dizinler. Ancak `.deckent/config.json` okumasina da izin verilmesi gerekirdi — suan kapsam disinda.

### 6. Verdict: ANALYZED — DB-first PASS, kucuk eksiklikler var (P2-P3)

---

## FILE 2: .claude/rules/auditor.md (33 lines)

### 1. Amaci
Auditor (denetci) ajaninin kurallar dosyasi. Periyodik tarama, heartbeat izleme, sinir ihlali tespiti, kilit kontrolu ve dashboard yazma kurallari. Kaynak kod YAZMAMA kisitlamasi var.

### 2. DB-First Compliance: PASS
- Satir 6: `All brain knowledge is in '.brain/memory.db' (SQLite) — query via MemoryStore, never parse .md files` — DOGRU
- Satir 7: `ADR compliance: load ADRs from store.getByType('adr'), not from DECISIONS.md` — DOGRU
- Satir 8: `Write patterns to DB: store.insert({ type: 'pattern', ... })` — DOGRU

### 3. Eski V1 Referanslar: TEMIZ
- "read DECISIONS.md" sadece negatif formda mevcut ("not from DECISIONS.md") — DOGRU
- "parse .md" yoksa "never parse .md files" olarak negatif kural — DOGRU

### 4. TUTARSIZLIK: Satir 16
- `Append new patterns to PATTERNS.md (never overwrite)` — **BU ESKIMiS**
  - Memory V2'de pattern'lar DB'ye yaziliyor (`store.insert({ type: 'pattern' })` — satir 8)
  - Ancak satir 16'da hala dosyaya yazma talimati var
  - **TUTARSIZLIK SKORU: P1** — bir rule DB'ye yaz diyor, diger rule dosyaya yaz diyor
  - **ONERI:** Satir 16'yi `Write patterns to DB via store.insert() — exports are auto-generated` olarak guncelle

### 5. Eksiklikler
- **P2 — checkADRCompliance reference eksik:** Auditor'un `checkADRCompliance()` fonksiyonuna referans yok. Sprint 138 Task 3'te eklenen bu fonksiyonun kurallarda anilmasi gerek.
- **P2 — Memory V2 query ornegi eksik:** Auditor'un spesifik DB sorgu ornekleri yok (sadece genel `store.getByType('adr')` var).
- **P3 — `.dashboard` dosyasi vs DB dashboard resource:** Satir 15 `.dashboard` dosyasina yazmayi soyluyor — bu MCP resource (`deckent://dashboard`) ile nasil iliskili? Aciklama eksik.

### 6. Frontmatter Scope
```yaml
paths: [".dashboard", ".brain/PATTERNS.md"]
```
- **TUTARSIZLIK:** `.brain/PATTERNS.md` yazma izni var ama Memory V2'de bu dosya auto-generated export olmali. Frontmatter'in `.brain/PATTERNS.md` yerine `.dashboard` ile sinirli kalmasi daha dogru olurdu.

### 7. Verdict: ANALYZED — DB-first PARTIAL PASS, P1 tutarsizlik mevcut

---

## FILE 3: .claude/rules/worker-default.md (36 lines)

### 1. Amaci
Varsayilan worker ajani icin kurallar. Task dosyasi okuma, heartbeat, scope kurallari, tsc/vitest verify loop, result dosyasi yazma. Skill ve agent context yonlendirmesi.

### 2. DB-First Compliance: PASS
- Satir 6: `ADRs are injected into your prompt automatically from '.brain/memory.db' — they are mandatory constraints` — DOGRU
- Satir 7: `relevant ADRs and past learnings are provided by Brain via MemoryStore` — DOGRU
- Satir 8: `If your implementation would violate an accepted ADR → stop, write NO_GO, propose ADR amendment` — DOGRU

### 3. Eski V1 Referanslar: TEMIZ
- "read DECISIONS.md" referansi YOK
- "parse .md" referansi YOK
- Worker'in .md dosyasi okumasi YASAK — sadece DB'den enjekte edilen bilgiyi kullanir

### 4. Eksiklikler
- **P3 — tokenUsage zorunlulugu yazili degil:** Sprint 140+ .result dosyasinda `tokenUsage` zorunlu ama worker-default.md'de bu alan bahsedilmiyor. Sadece `files_changed, lines_added/removed, test results, coverage, self_assessment, notes` listelenmis.
- **P3 — rubricScores zorunlulugu yazili degil:** Ayni sekilde `rubricScores` alani da kurallarda yok.
- **P2 — Honest Self-Assessment blogu yok:** Sprint 138 Task 8'de eklenen "Honest Self-Assessment" calibration kurallari worker-default.md'de yansitilmamis.

### 5. Frontmatter Scope
```yaml
paths: ["src/**", "tests/**"]
```
- Makul: Worker'lar src/ ve tests/ altinda calisir. Ancak `.tasks/` dizinine de yazma izni olmali (heartbeat + result) — bu frontmatter'da eksik. Muhtemelen Claude Code'un kendi scope mekanizmasi bunu ayri yonetiyor.

### 6. Verdict: ANALYZED — DB-first PASS, kucuk eksiklikler (P2-P3)

---

## FILE 4: .contracts/api-surface.md (159 lines)

### 1. Amaci
Inter-agent kontrati. Task JSON formati, result dosya formati, sprint fazlari, worker scope kurallari, .brain/ dosya formatlari ve modul import kurallari (ADR-008). Tum ajanlar (Brain, Worker, Auditor) bu kontrata uyar.

### 2. Memory V2 DB Schema Dokumentasyonu: PASS
- Satir 98-117: "Memory V2 — DB-First (Primary)" bolumu mevcut
- `memory.db`: "single source of truth" — DOGRU
- `exports/summary.md`, `decisions.md`, `memory.md`, `debt.md` — DOGRU
- DB Schema (satir 108-117): 5 tablo + FTS5 + schema_version listelenmis
  - `entries`, `tags`, `relations`, `entry_history`, `entries_fts`, `schema_version` — DOGRU
  - FTS5 aciklamasi: "8 columns: 4 original + 4 turkishNormalize" — DOGRU

### 3. Memory V2 Query API: PASS
- Satir 119-130: `searchMemory()` ornek kodu mevcut
- Parametreler: `text`, `type`, `status`, `sprint_range`, `tags_contain`, `limit` — DOGRU
- Return type: `MemorySearchResult[]` — DOGRU

### 4. Legacy Dosya Referanslari: PASS
- Satir 132-138: "Legacy .brain/ Files (archived, read-only)" bolumu
- `archive/pre-v2/DECISIONS.md` — backup olarak isaretlenmis
- `ERRORS.md` — hala file-based (DB'de degil) — DOGRU
- `PROJECT-IDENTITY.md` — hem dosya hem DB (decay_exempt) — DOGRU

### 5. Eksik/Tutarsiz Noktalar
- **P2 — DB schema detay eksik:** Kontrat 5 tablo + FTS5 listeler ama:
  - Tablo kolonlari yazili degil (sadece yorum olarak)
  - Trigger'lar bahsedilmiyor (FTS5 insert/update/delete trigger'lari)
  - Indeksler bahsedilmiyor (9 indeks oldugu claim ediliyor ama kontrat'ta yok)
  - **ONERI:** En azindan `entries` tablosunun kolon listesi eklenebilir
- **P3 — RETRO fazi hala "Retrospective written to RETRO.md" diyor (satir 86):** Memory V2'de retro DB'ye yaziliyor, .md export sonra uretiliyor. Bu ifade yaniltici olabilir.
- **P3 — Result dosya formati tokenUsage ornegi DOGRU:** `inputTokens`, `outputTokens`, `cacheReadTokens`, `provider`, `model` — tam ve guncel
- **P3 — rubricScores ornegi mevcut ve DOGRU:** `correctness`, `test_coverage`, `scope_compliance`, `documentation`

### 6. ADR-008 Import Rules: DOGRU
- Satir 152-158: Brain = tek orchestrator import noktasi, Planner sadece core/, Worker/Auditor disk'ten task oku
- Circular dependency yasak — DOGRU

### 7. Model Listesi Guncelligi
- Satir 13: `opus | sonnet | haiku | gpt-5 | gpt-4.1 | gpt-5-mini | gemini-2.5-pro | gemini-2.5-flash`
- **EKSIK MODELLER:** `o3`, `o4-mini`, `gpt-4.1-mini`, `gemini-2.0-flash`, `gemini-3.1-pro-preview` — DECKENT.md'de 13 model listeleniyor ama api-surface.md'de sadece 8 model var
- **P2 — Model listesi eski:** api-surface.md'deki model listesi ModelRegistry (13 model) ile eslesmemis

### 8. Verdict: ANALYZED — Memory V2 PASS, model listesi STALE (P2)

---

## FILE 5: .deckent/config.json (97 lines)

### 1. Amaci
Proje yapilandirma dosyasi. Sprint modu, model stratejisi, provider ayarlari, butce, decay, scan intervali, routing engine versiyonu ve diger operasyonel parametreler.

### 2. Memory V2 Config Section: PARTIAL
Mevcut alanlar:
- `memory_budget: 5000` (satir 57) — MEVCUT ama isim `memory_budget` mi `brain_budget` mi? Brain.md'de "memory budget" deniyor, pre-flight-health-check.mjs'de `checkBrainBudget` fonksiyonu var, ama `.brain/*.md` satir sayisini kontrol ediyor (varsayilan 900). `config.json`'daki `memory_budget: 5000` ile pre-flight'taki `budget = 900` TUTARSIZ.
- `decay_after_sprints: 20` (satir 58) — MEVCUT ve dogru
- `patterns_enabled: true` (satir 59) — MEVCUT
- `search_enabled: true` (satir 64) — MEVCUT (FTS5 arama)
- `search_provider: "context7"` (satir 65) — MEVCUT ama "context7" nedir? FTS5 degil mi? Muhtemelen dis arama provider'i.
- `search_cache_ttl: 3600` (satir 66) — MEVCUT

### 3. EKSIK Memory V2 Alanlari
- **`memory.backend`:** DECKENT.md'de `memory.backend` config alani bahsediliyor ama config.json'da bu nested obje YOK. Ya nested format kullanilmiyor ya da DECKENT.md eski.
- **`memory.search`:** Ayni sekilde DECKENT.md `memory.search` diyor ama config.json'da `search_enabled` flat alan var.
- **`memory.decay_after_sprints`:** DECKENT.md nested, config.json flat.
- **P2 — DECKENT.md ile config.json format TUTARSIZLIGI:** DECKENT.md'de `config.json → memory.backend, memory.search, memory.decay_after_sprints` nested format gosteriliyor ama gercek config.json flat alanlar kullaniyor.

### 4. Diger Analiz
- `routing_engine: "v2"` (satir 78) — DOGRU, V2 routing aktif
- `spawn_backend: "docker"` (satir 6) — DOGRU, Docker backend
- `claude_backend: "tmux"` (satir 93) — Bu `spawn_backend` ile cakisiyor mu? `spawn_backend: docker` ama `claude_backend: tmux` — bunlar farkli mi? Muhtemelen `claude_backend` eski bir alan.
- `sprint_timeout_minutes: 0` (satir 84) — Sifir = timeout yok. Sprint Timeout Reform'a ragmen devre disi.
- `mode: "performance"` (satir 2) — Performance mode: opus/opus, max_workers=3, structured planning
- `last_sprint_id: "sprint-142"` (satir 5) — Guncel

### 5. Model Strategy Section: DOGRU
```json
"model_strategy": {
  "brain_tier": "premium",
  "worker_tier": "premium",
  "min_tier": "standard",
  "max_tier": "premium",
  "auto_upgrade": true,
  "auto_downgrade": false
}
```
- Tier-based routing ADR-023 uyumlu — DOGRU

### 6. Eksik Modern Alanlar
- **`checkpoint_interval`:** Sprint 138 Task 9'da eklenen checkpoint ozelligi icin `sprint_checkpoint_interval: 3` (satir 96) mevcut — DOGRU
- **`notification` config:** `notify_on_complete: false`, `notify_channel: null`, `notify_url: null` — mevcut ama Sprint 139 Task 41'deki notification-dispatcher icin yetersiz olabilir (discord/slack/webhook URL'leri yok)

### 7. Verdict: ANALYZED — PARTIAL Memory V2 config (P2 DECKENT.md tutarsizligi)

---

## FILE 6: .deckent/docs.json (47 lines)

### 1. Amaci
Managed docs yapilandirmasi. Hangi .md dosyalarinin hangi bolumlerinin auto-update edilebilecegini, hangilerinin korunmus (protected) oldugunu tanimlar.

### 2. Analiz
- 7 dokuman tanimi: CLAUDE.md, VISION.md, VISION-TR.md, BETA-TRACKER.md, BETA-TRACKER-TR.md, IDENTITY.md, DECKENT-MASTER-BLUEPRINT.md
- `autoSections`: Sprint Metrics, Active Debt, Agent Performance — auto-update alanlari
- `protectedSections`: Architecture, Commands, Vision, Mission — elle duzenlenen alanlar
- ADR-029/030/031 uyumlu — managed-docs yapilandirmasi dogru

### 3. Eksiklikler
- **P3 — DECKENT.md docs.json'da YOK:** DECKENT.md de auto-update bolumleri iceriyor (MCP tool tablosu, agent/skill listeleri) ama docs.json'da tanimli degil.
- **P3 — api-surface.md docs.json'da YOK:** Kontrat dosyasi da model listesi gibi auto-update olabilecek bilgi iceriyor.

### 4. Verdict: ANALYZED — Yapisal olarak DOGRU, kapsam genisletilebilir (P3)

---

## FILE 7: .deckent/project-stack.json (46 lines)

### 1. Amaci
Proje teknoloji stack'ini tanimlar. Stack detector sonuclari: dil, framework, bagimliliklar, build tool, test framework, alt projeler.

### 2. Analiz
- `language: "typescript"`, `framework: "react"` — DOGRU
- `testFramework: "vitest"` — DOGRU (ADR-003)
- `buildTool: "vite"` — BU KISMI YANLIS: Ana proje `tsc` ile build ediliyor, sadece dashboard Vite kullaniyor. `buildTool: "tsc"` olmali.
- **P2 — buildTool yanlis:** `"vite"` yerine `"tsc"` olmali (dashboard haric)
- Dependencies listesi 30 paket: commander, better-sqlite3, @modelcontextprotocol/sdk, zod (runtime) + vitest, typescript, vite (dev) — DOGRU
- `subProjects: ["docs", "examples/quickstart", "src/dashboard"]` — DOGRU

### 3. ADR-010 Uyumu
ADR-010 "Tek Runtime Dependency — commander.js" diyor ama gercek runtime dependency'ler:
- `commander` (CLI)
- `better-sqlite3` (Memory V2 DB)
- `@modelcontextprotocol/sdk` (MCP)
- `zod` (validation)

ADR-010 STALE — artik 4 runtime dependency var. ADR-010 guncellenmeli veya "minimal runtime dependency" olarak yeniden ifade edilmeli.

### 4. Verdict: ANALYZED — buildTool YANLIS (P2), ADR-010 STALE (P2)

---

## FILE 8: scripts/adr-validator.mjs (177 lines)

### 1. Amaci
ADR validasyon araci. `.brain/DECISIONS.md` dosyasini parse edip MADR v3 hibrit format uyumunu kontrol eder. CLI + library olarak kullanilabilir.

### 2. Memory V2 Uyumu: STALE
- **KRITIK:** Bu script hala `.brain/DECISIONS.md` dosyasini DOGRUDAN okuyor (`readFileSync` satir 138)
- Memory V2'de ADR'ler DB'de. `.brain/DECISIONS.md` artik archive/pre-v2/'de backup olarak duruyor veya exports/decisions.md olarak auto-generate ediliyor.
- **P1 — Script DB-first degil:** ADR validator DB'den okumali veya en azindan exports/decisions.md'yi hedeflemeli
- Varsayilan dosya yolu: `resolve(process.cwd(), '.brain', 'DECISIONS.md')` (satir 161) — bu dosya artik archive'da

### 3. Fonksiyonel Analiz
- `parseADRs()`: `## ADR-NNN:` pattern ile parse — DOGRU format
- `validateADRs()`: duplicate ID, status enum, required fields (Decision/Context) — DOGRU kontroller
- `validate()`: full pipeline — DOGRU
- CLI entry point: process.argv ile dosya yolu parametresi — DOGRU

### 4. Eksiklikler
- **P1 — DB-first uyumsuzluk:** Memory V2'de bu script ya DB'den sorgulayarak validate etmeli ya da exports/decisions.md'yi kullanmali
- **P2 — VALID_STATUSES:** `['accepted', 'deprecated', 'superseded', 'proposed', 'rejected']` — DB'deki status enum'u ile eslesiyor mu? `memory-types.ts`'deki `MemoryEntryV2.status` ile karsilastirilmali
- **P3 — Test yoklugu:** `tests/scripts/adr-validator.test.ts` mevcut mu? Kontrol edilmeli.

### 5. Security
- `readFileSync` kullanimi — path injection riski dusuk (CLI arg olarak geliyor, kullanici kontrolunde)
- Input validation: content null kontrolu yok ama `try/catch` ile yakalaniyor

### 6. Verdict: ANALYZED — STALE (P1 DB-first uyumsuzluk)

---

## FILE 9: scripts/migrate-brain-v2.mjs (233 lines)

### 1. Amaci
One-time migration script. `.brain/*.md` dosyalarini SQLite DB'ye (`.brain/memory.db`) migrate eder. 7 adimli verified migration: inventory → backup → parse+insert → verify → export → reference swap → report.

### 2. Kalite Degerlendirmesi: YUKSEK
Bu script iyi yapilandirilmis bir migration pipeline:

**Step 1 — Inventory:** MD dosya envanteri, ADR sayimi, SHA-256 hash — DOGRU
**Step 2 — Backup:** `archive/pre-v2/` altina kopyalama, `migration-manifest.json` — DOGRU
**Step 3 — Parse + Insert:** Dynamic import (`dist/core/memory-store.js`, `memory-import.js`), ADR/memory/debt/retro/identity/sprint insert — DOGRU
**Step 4 — Verification Gate:** DB count vs manifest count, sample content check, dangling relations, FTS5 smoke test — KAPSAMLI
**Step 5 — Export:** `exportSummaryMd`, `exportDecisionsMd`, `exportMemoryMd`, `exportDebtMd` — DOGRU
**Step 6 — Reference Swap:** CLAUDE.md, DECKENT.md, AGENTS.md icerisindeki `@.brain/MEMORY.md` → `@.brain/exports/summary.md` — DOGRU
**Step 7 — Final Report:** Ozet istatistikler — DOGRU

### 3. Guvenlik
- `store.getRawDb().prepare(...)` direkt SQL — parametrized degil ama sadece SELECT, input yok — DUSUK risk
- File path'ler `join()` ile olusturuluyor — path traversal riski dusuk
- Verification gate basarisiz olursa `process.exit(1)` — DOGRU (abort)

### 4. Eksiklikler
- **P2 — PATTERNS.md parse edilmiyor:** `mdFiles` listesinde `PATTERNS.md` var ama Step 3'te parse/insert yok. Sadece ADR, memory, debt, retro, identity migrate ediliyor. Pattern'lar atlaniyor.
- **P2 — ERRORS.md migrate edilmiyor:** Kasitli olabilir (hala file-based) ama aciklama yok.
- **P3 — Idempotent degil:** `existsSync(dbPath)` kontrolu var ama "delete and re-run" talimati disinda geri donusum yok. Partial failure durumunda cleanup mekanizmasi eksik.
- **P3 — Sprint log parse basitligi:** Sprint log'lar butun dosya olarak tek entry olarak insert ediliyor — icerik parse edilmiyor.

### 5. Guncellik
- Script purpose: one-time migration — tamamlanmis ve basarili. Yeniden calistirilmasi gerekmez (memory.db zaten var).
- Ancak referans olarak saklanmasi dogru — `archive/pre-v2/migration-manifest.json` ile baglantili.

### 6. Verdict: ANALYZED — YUKSEK kalite, P2 PATTERNS.md gap

---

## FILE 10: scripts/check-error-handling.mjs (175 lines)

### 1. Amaci
ErrorRegistry lint araci. `src/orchestra/` altinda `throw new Error(` kullanimini tarar ve `DeckentError(ErrorCode.DECKENT_EXXX)` kullanilmasini zorunlu kilar.

### 2. Analiz
- Sadece `src/orchestra/` taranir — `src/core/`, `src/cli/`, `src/mcp/` kapsam disinda
- **P3 — Kapsam kisitli:** Orchestra disindaki modullerde de `throw new Error(` olabilir ama taranmiyor
- Regex: `/throw new Error\(/g` — temel ama islevsel
- CLI + library pattern — DOGRU

### 3. Memory V2 Uyumu: UYGULANAMAZ
Bu script memory sistemiyle ilgili degil — error handling lint'i.

### 4. Verdict: ANALYZED — Islevsel, kapsam genisletilebilir (P3)

---

## FILE 11: scripts/pre-flight-health-check.mjs (370 lines)

### 1. Amaci
Sprint oncesi saglik kontrolu. 7 kontrol: TypeScript build, Vitest baseline, Brain memory budget, stale locks, Docker daemon, MCP server, deckent doctor.

### 2. Memory V2 Uyumu: STALE
- **checkBrainBudget (satir 124-150):** `.brain/*.md` dosyalarinin toplam satir sayisini kontrol ediyor (varsayilan butce: 900)
- **P1 — DB-first degil:** Memory V2'de `.brain/*.md` dosyalari auto-generated export'lar. Gercek memory butcesi DB entry sayisindan olmali.
- `config.json`'daki `memory_budget: 5000` ile `checkBrainBudget`'in varsayilan `budget = 900` degeri TUTARSIZ
- Script `.brain/*.md` satir sayisi sayiyor, ama gercek veri DB'de. MD dosyalari sadece export oldugu icin satir sayisi yaniltici.

### 3. Diger Kontroller
- `checkTypeScript`: `tsc --noEmit` — DOGRU, `spawnSync` ile (ADR-006 uyumlu)
- `checkVitestBaseline`: `vitest run --bail 1` — DOGRU, `required: false` (test failure sprint'i engellemiyor)
- `checkStaleLocks`: `.locks/` dosya yasi kontrolu — DOGRU
- `checkDockerDaemon`: `docker info` — DOGRU, `required: false`
- `checkMCPServer`: Basit dosya varlik kontrolu — DOGRU
- `checkDeckentDoctor`: `deckent doctor --json` parse — DOGRU

### 4. Verdict: ANALYZED — checkBrainBudget STALE (P1), diger kontroller DOGRU

---

## FILE 12: scripts/dead-code-audit.mjs (496 lines)

### 1. Amaci
Dead code audit araci. Sprint 139'da olusturulmus. src/ altinda kullanilmayan export'lari, import edilmeyen modulleri tespit eder. READ-ONLY — kod silmez.

### 2. Analiz
- 11 bilinen suspect: 4 ADR-protected (V1 decision engine), 7 import edilmeyen modul
- Kategorizasyon: Dead / Dormant / Lightly-Used / Active — DOGRU
- Rapor cikti yeri: `docs/audits/sprint-139/dead-code-report.md` — DOGRU

### 3. Memory V2 Uyumu: UYGULANAMAZ
Bu script memory sistemiyle ilgili degil — dead code analiz araci.

### 4. Teknik Notlar
- `spawnSync('find', ...)` ve `spawnSync('grep', ...)` kullanimi — ADR-006 uyumlu (spawnSync)
- Unused export tespiti regex-based — false positive/negative riski var ama yeterli
- `countImporters()`: grep -r -l ile import sayimi — basit ama islevsel

### 5. Verdict: ANALYZED — Islevsel, Sprint 139'a spesifik

---

## FILE 13: scripts/copy-assets.mjs (58 lines)

### 1. Amaci
Build post-processing: `src/` altindaki non-TS asset'leri (JSON, MD) `dist/` altina kopyalar. `tsc` sadece .ts derler, bu script JSON schema ve baseline dosyalarini tasir.

### 2. Analiz
- Asset uzantilari: `.json`, `.md` — DOGRU
- Dashboard haric tutulmus (`if (entry === 'dashboard') continue`) — DOGRU (ayri build pipeline)
- Sprint 141 Task 141-SAFE-01'de olusturulmus

### 3. Memory V2 Uyumu: UYGULANAMAZ

### 4. Verdict: ANALYZED — Basit, dogru, islevsel

---

## CROSS-VALIDATION: TUTARLILIK KONTROLLERI

### Kontrol 1: brain.md ↔ auditor.md ↔ worker-default.md DB-first uyumu
| Dosya | DB-first Kural | Eski V1 Referans | Sonuc |
|-------|---------------|-----------------|-------|
| brain.md | PASS (6 DB kural) | TEMIZ | OK |
| auditor.md | PARTIAL (DB kural var AMA PATTERNS.md yazma hala var) | satir 16 STALE | **P1 TUTARSIZLIK** |
| worker-default.md | PASS (ADR injection) | TEMIZ | OK |

### Kontrol 2: api-surface.md ↔ config.json memory alanlari
- api-surface.md: Memory V2 DB schema, query API dokumante — DOGRU
- config.json: Flat alanlar (memory_budget, decay_after_sprints, search_enabled) — DOGRU
- DECKENT.md: Nested format (`memory.backend`, `memory.search`) — **TUTARSIZ** (config.json flat, DECKENT.md nested soyluyor)

### Kontrol 3: scripts/ Memory V2 uyumu
| Script | DB-First | Guncel | Sorun |
|--------|----------|--------|-------|
| adr-validator.mjs | HAYIR — hala DECISIONS.md okuyor | STALE | **P1** |
| migrate-brain-v2.mjs | EVET (migration amacli) | Tamamlanmis | P2 PATTERNS gap |
| pre-flight-health-check.mjs | HAYIR — .brain/*.md satir sayar | STALE | **P1** |
| check-error-handling.mjs | N/A | Guncel | — |
| dead-code-audit.mjs | N/A | Guncel | — |
| copy-assets.mjs | N/A | Guncel | — |

### Kontrol 4: config.json ↔ DECKENT.md config referanslari
- DECKENT.md: `memory.backend`, `memory.search`, `memory.decay_after_sprints` nested
- config.json: `memory_budget`, `decay_after_sprints`, `search_enabled` flat
- **SONUC:** Format uyumsuzlugu — ya DECKENT.md guncellenmeli ya da config.json nested yapiya migrated olmali

### Kontrol 5: project-stack.json dogrulugu
- `buildTool: "vite"` — **YANLIS** (ana proje tsc, sadece dashboard vite)
- ADR-010 runtime dependency: 1 → 4 (commander, better-sqlite3, @mcp/sdk, zod) — **STALE ADR**

---

## SONUC VE ONERILER

### P0 (Kritik) — YOK

### P1 (Yuksek Oncelik)
1. **auditor.md satir 16 TUTARSIZLIGI:** "Append new patterns to PATTERNS.md" → DB'ye yazma kurali ile celisiyor. Guncellenmeli.
2. **auditor.md frontmatter:** `.brain/PATTERNS.md` yazma izni Memory V2 ile uyumsuz.
3. **adr-validator.mjs STALE:** Hala `.brain/DECISIONS.md` okuyor, DB-first veya exports/decisions.md kullanmali.
4. **pre-flight-health-check.mjs checkBrainBudget STALE:** `.brain/*.md` satir sayisi yerine DB entry count kullanmali. Budget degeri (900 vs 5000) TUTARSIZ.

### P2 (Orta Oncelik)
5. **DECKENT.md ↔ config.json format tutarsizligi:** Nested vs flat memory config.
6. **api-surface.md model listesi STALE:** 8 model vs 13 model (ModelRegistry).
7. **project-stack.json buildTool YANLIS:** "vite" → "tsc".
8. **migrate-brain-v2.mjs PATTERNS.md gap:** Pattern'lar migrate edilmiyor.
9. **worker-default.md tokenUsage/rubricScores eksik:** Zorunlu alanlar kurallarda yok.
10. **ADR-010 STALE:** "Tek runtime dependency" artik 4 dependency.

### P3 (Dusuk Oncelik)
11. brain.md searchMemory ornegi eksik
12. brain.md store.close() referansi yok
13. auditor.md checkADRCompliance referansi eksik
14. worker-default.md Honest Self-Assessment blogu eksik
15. docs.json DECKENT.md/api-surface.md kapsam disinda
16. api-surface.md DB schema kolon detay eksik
17. api-surface.md RETRO fazi ifadesi yaniltici
18. check-error-handling.mjs kapsam kisitli (sadece orchestra/)

---

## METRIKLER

| Metrik | Deger |
|--------|-------|
| Analiz edilen dosya | 13 |
| P1 bulgu | 4 |
| P2 bulgu | 6 |
| P3 bulgu | 8 |
| DB-first PASS | 3/3 rule dosyasi (brain, worker — full; auditor — partial) |
| DB-first STALE script | 2/6 (adr-validator, pre-flight) |
| api-surface Memory V2 | PASS (schema + query API dokumante) |
| config.json Memory V2 | PARTIAL (flat alanlar mevcut, nested format DECKENT.md ile uyumsuz) |
| Toplam satir | 13 dosya, ~1,434 satir analiz |

**Verdict: ANALYZED**
