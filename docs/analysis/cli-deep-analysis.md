# CLI Komut Derin Analizi

Bu doküman deckent CLI'ın tüm komutlarının derinlemesine analizini, veri akışlarını, iç mekanizmalarını ve geliştirme önerilerini içerir.

---

## 1. `deckent init`

### Komut Tanımı
```
deckent init [--auto] [--manual] [--cursor] [--claude-code] [--env <envs>] [--all-envs]
```

### Akış (19 Adım)

```
1. Splash + Welcome Banner
2. Konfigürasyon Modu Seçimi (--auto vs interactive)
3. Dizin Yapısı Oluşturma (9 dizin)
4. Config Yazma (.deckent/config.json)
5. DECKENT.md (source of truth)
6. Agent/IDE Dosyaları (CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/)
7. Multi-env Config (--env / --all-envs)
8. .deck Template (secret dosyası)
9. Claude Rules (brain.md, auditor.md, worker-default.md)
10. DIRECTIVES.md
11. Brain Dosyaları (MEMORY, DECISIONS, DEBT, PATTERNS, RETRO)
12. PROJECT-IDENTITY.md
13. Workspace (TOOLS.md, BOOT.md)
14. i18n (en.json, tr.json)
15. .gitignore güncelleme
16. Provider Detection + Wizard
17. Doctor Health Check
18. IDE/MCP Guidance
19. Next Steps mesajı
```

### Oluşturulan Dizinler

| Dizin | Amaç |
|-------|-------|
| `.deckent/` | Ana config dizini |
| `.deckent/workspace/` | IDENTITY, TOOLS, BOOT dosyaları |
| `.brain/` | Bellek sistemi |
| `.brain/sprints/` | Sprint logları |
| `.tasks/` | Task JSON dosyaları (gitignore'd) |
| `.locks/` | File lock'ları (gitignore'd) |
| `.claude/rules/` | Agent kuralları |
| `.deckent/plugins/` | Plugin sistemi |
| `.deckent/i18n/` | Çeviri dosyaları |

### Oluşturulan Dosyalar (~20 dosya)

| Dosya | Strateji |
|-------|----------|
| `.deckent/config.json` | **Merge** — varsa mevcut field'ları korur |
| `DECKENT.md` | **writeIfNotExists** — varsa dokunmaz |
| `CLAUDE.md` | **ensureDeckentImport** — `@DECKENT.md` satırını prepend eder |
| `AGENTS.md` | **writeIfNotExists** + ensureDeckentImport |
| `.claude/rules/*.md` | **writeIfNotExists** — YAML frontmatter'lı |
| `DIRECTIVES.md` | **writeIfNotExists** |
| `.brain/*.md` (6 dosya) | **writeIfNotExists** |
| `.deckent/workspace/*.md` | **writeIfNotExists** |
| `.deckent/i18n/*.json` | **writeIfNotExists** |
| `.deck` | Her zaman yazar (secret template) |
| `.gitignore` | **append** — sadece eksik satırları ekler |

### 2 Mod: `--auto` vs Interactive

**`--auto`:**
- `getSystemProfile()` → CPU, RAM, max worker hesabı (formula: `max(1, min(freeMemMB/400, cpuCores-1, 30))`)
- `detectSubscription()` → `claude --model opus` probe → max/pro/unknown
- `analyzeProject()` → framework, dil, test, CI, dosya sayısı
- `generateSetupRecommendation()` → mode, worker sayısı, model, planning modu
- Dil her zaman `en`, proje adı dizin adından

**Interactive (default):**
- Plan seçimi: Max / Max 5x / Pro / API
- Dil seçimi: en / tr
- Proje adı input'u

### Provider Wizard
1. `detectAvailableProviders()` → claude, codex, gemini taranır
2. **Tek provider** → otomatik config
3. **Birden fazla** → brain/worker/fallback seçimi (wizard)
4. **`--auto` + çoklu provider** → ilk bulunanı her ikisi için kullanır

### Ortam Algılama (6 ortam)
```
VSCODE_PID/VSCODE_CWD → vscode
CURSOR_SESSION → cursor
CODEX_SESSION → codex
GEMINI_CLI → gemini
TMUX → tmux
fallback → shell
```

### Kaynak Dosyalar
- `src/cli/commands/init.ts` — Ana komut
- `src/cli/auto-setup.ts` — Öneri motoru
- `src/core/system-profile.ts` — Sistem profili
- `src/core/subscription.ts` — Abonelik tespiti
- `src/core/analyzer.ts` — Proje analizi
- `src/core/environment.ts` — Ortam algılama
- `src/core/deck-file.ts` — .deck template
- `src/cli/helpers/wizard.ts` — Provider wizard

### Geliştirme Önerileri

1. **`--auto` Dil Algılama Eksik** — `--auto` modda dil her zaman `en` olarak hardcode (satır 249). Sistem locale'inden algılanabilir.
2. **Config Merge Sığ** — `Object.assign(existing, newConfig)` sığ merge. Nested field'lar (skill_routing vb.) ezilir. `deepMerge` kullanılmalı.
3. **`.deck` Güvenlik Eksikliği** — `createDeckTemplate()` `.deck` dosyasını oluşturuyor ama `.gitignore`'a eklemiyor. `ensureDeckGitignore()` fonksiyonu var ama init'te çağrılmıyor.
4. **`--auto` Recommendation Bilgisi Gösterilmiyor** — `recommendation.reasons` dizisi dolu ama kullanıcıya gösterilmiyor.
5. **DECKENT.md Build/Test Komutları Hardcode** — `Build: tsc`, `Test: npx vitest run` hardcode. `analyzeProject()` zaten algılıyor.
6. **İkinci `analyzeProject()` Çağrısı** — Satır 455'te tekrar çağrılıyor ama satır 240'ta zaten `detectedAnalysis` var.
7. **Provider Wizard `--auto`'da Incomplete** — Çoklu provider'da fallback_provider atanmıyor.
8. **Error Recovery Yok** — Kısmi init'te rollback veya `--repair` mekanizması yok.
9. **`--env` ve Otomatik Detect Çakışması** — Her ikisi de dosya oluşturabilir, mantıksal çakışma.
10. **Re-init Desteği Zayıf** — `writeIfNotExists` yüzünden tekrar init'te dosyalar güncellenmez. `--force` veya `--upgrade` lazım.

---

## 2. `deckent plan`

### Komut Tanımı
```
deckent plan [--no-confirm] [--structured]
```

| Flag | Ne Yapar |
|------|----------|
| `--no-confirm` | Onay sormadan planı direkt PENDING olarak yazar |
| `--structured` | AI planner'ı atlayıp DIRECTIVES.md'yi regex ile parse eder |

### Akış (7 Adım)

```
1. loadConfig(root)          → .deckent/config.json + mode defaults merge
2. readContext(root)          → 10 kaynak okur
3. checkUsage(config)         → claude -p /usage → 5hr% + weekly%
4. adjustSprintSize()         → usage threshold → full/reduced/minimal
5. planSprint()               → AI veya structured parse → task JSON'ları yazar
6. Çıktı göster              → tablo + reasoning + planning mode
7. confirmDraftTasks()        → Onay → DRAFT → PENDING geçişi
```

### readContext() — 10 Kaynak

| Kaynak | Dosya | Amaç |
|--------|-------|------|
| directives | `DIRECTIVES.md` | Sprint hedefleri |
| memory | `.brain/MEMORY.md` | Geçmiş sprint öğrenmeleri |
| retro | `.brain/RETRO.md` | Son retrospektif |
| patterns | `.brain/PATTERNS.md` | Tespit edilen code pattern'ler |
| decisions | `.brain/DECISIONS.md` | Mimari kararlar |
| projectIdentity | `.brain/PROJECT-IDENTITY.md` | Kalıcı proje bilgisi |
| debt | `.brain/DEBT.md` | Teknik borç (pipe-delimited table parse) |
| existingTasks | `.tasks/task-*.json` | Varolan task'lar |
| gitStatus | `git status --porcelain` | Uncommitted değişiklikler |
| fileTree | `git ls-files` | Proje dosya ağacı |

### Usage → Sprint Boyutlandırma

```
checkUsage() → claude -p /usage komutu çalıştırır
  → regex ile "5hr: XX%" ve "weekly: XX%" parse eder
  → Başarısız → safe default: 50% / 30%

adjustSprintSize(config, usage):
  Her iki threshold aşıldı   → minimal  (1 worker, haiku/sonnet)
  Tek threshold aşıldı       → reduced  (max/2 worker, sonnet)
  Limit altında              → full     (max worker, serbest)
```

### planSprint() — 3 Katmanlı Planlama

```
Katman 1: CRITICAL Debt → Öncelikli fix task'ları (her zaman)
Katman 2: AI Planner (mode: ai | auto)
  ├─ Brain provider çözümle → model resolve → Türkçe prompt + context
  ├─ spawnSync(cli, prompt, model) → 60s timeout
  ├─ parsePlannerResponse() → JSON parse + Zod validation
  └─ Auto mode safeguard: AI task < directive task → fallback
Katman 3: Structured Fallback (mode: structured | AI fail + auto)
  ├─ parseStructuredDirectives() → "## Task N:" blokları parse
  ├─ Model/Effort/Provider override extraction
  └─ resolveTaskModel() → complexity + scope + usage
```

**Post-planning:**
```
→ detectDeadlocks() — Kahn's algorithm ile circular dependency check
→ Agent Selection — AgentPoolManager → task keyword matching
→ Skill Selection — SkillPoolManager → stack detection → max 3 skill
→ Task JSON yazma — .tasks/task-{sprintId}-{seq}.json
```

### AI Planner Prompt Yapısı

Türkçe system prompt + model seçim kriterleri + context block:
- Project name, DIRECTIVES, MEMORY, RETRO, CRITICAL DEBT, PATTERNS, DECISIONS, PROJECT IDENTITY, FILE TREE (ilk 100)
- Context `BRAIN_PLAN_MAX_CONTEXT_LINES` ile truncate edilir
- Çıktı: Strict JSON (Zod validated PlannerResultSchema)

### Kaynak Dosyalar
- `src/cli/commands/plan.ts` — CLI komutu
- `src/orchestra/sprint-controller.ts` — planSprint, readContext, checkUsage, adjustSprintSize
- `src/orchestra/planner.ts` — AI planner, buildPlanPrompt, parsePlannerResponse
- `src/orchestra/task-builder.ts` — parseStructuredDirectives, extractScopeFromDirective

### Geliştirme Önerileri

1. **`checkUsage()` Senkron ve Yavaş** — `spawnSync` 10 saniye timeout ile blocking. Async versiyon (`checkUsageWithProvider`) var ama kullanılmıyor.
2. **AI Planner Timeout Sabit (60s)** — Config'den ayarlanabilir olmalı.
3. **Structured Parser Sınırlı** — Sadece `## Task N:` formatını tanıyor. Bullet list, prose → her satır ayrı task olur.
4. **Auto Mode Safeguard Zayıf** — AI az task üretirse fallback ama fazla üretirse kontrol yok.
5. **Agent/Skill Selection Hata Yutma** — `try/catch` içinde sessizce geçiyor, neden başarısız olduğu loglanmıyor.
6. **Planner Prompt Dil Uyumsuzluğu** — Prompt Türkçe hardcode, `config.language` kontrol edilmiyor.
7. **`--dry-run` Flag'i Yok** — Task JSON'larını her zaman diske yazıyor.
8. **Usage Safe Default Agresif** — Başarısız olunca %50 varsayıyor, gereksiz yere sprint'i küçültebilir.
9. **Context Truncation Kaba** — Satır limiti aşılınca basitçe kesiyor, öncelik sıralaması yok.
10. **confirmDraftTasks İdempotent Değil** — Tekrar plan'da eski task'lar silinmiyor.

---

## 3. `deckent start`

### Komut Tanımı
```
deckent start [description] [--auto-approve] [--sandbox-mode] [--dry-run] [--force] [--watch]
```

| Flag | Ne Yapar |
|------|----------|
| `[description]` | Zero-config mod — DIRECTIVES.md yazmadan doğal dille sprint |
| `--auto-approve` | Worker'lara `--dangerously-skip-permissions` geçer |
| `--sandbox-mode` | Docker sandbox (henüz implement değil) |
| `--dry-run` | Planı gösterir, worker spawn etmez |
| `--force` | Doctor pre-flight check'leri atlar |
| `--watch` | Sprint sonrası tmux split view açar |

### Ana Akış (8 Phase)

```
Phase 0: BOOTSTRAP
  ├─ loadConfig, bootstrapProviders, runDoctorChecks (pre-flight)
  └─ Zero-config: prepareZeroConfig() → geçici DIRECTIVES.md

Phase 1: PLAN
  ├─ readContext → checkUsageWithProvider (async) → adjustSprintSize → planSprint
  ├─ createSafetyPoint (git stash/tag)
  └─ runHooks('beforeSprint') + loadPluginHooks

Phase 1.5: ROUTE
  └─ routeSprintTasks() → her task'a provider ata (skill_routing config)

Phase 2: SPAWN (1 retry)
  ├─ resolveEffectiveWorkers → activeTasks + queuedTasks
  ├─ Her task: resolveAgentPrompt + resolveSkillPrompts + buildWorkerPrompt
  ├─ Claude → tmux, Codex/Gemini → adapter.spawn()
  └─ startScanLoop (auditor 30s interval)

Phase 3: EXECUTE
  └─ waitForResults() → fs.watch + IPC + 30min timeout
      └─ Task bitince queue'dan sonraki spawn

Phase 4: EVALUATE
  ├─ evaluateResult → DONE / GO_WITH_TECH_DEBT / NO_GO
  ├─ updateAgentStats, usageTracker.recordCall, runHooks('afterTask')
  └─ Rollback: tüm NO_GO + policy=on_failure → git rollback

Phase 5: FIX
  ├─ handleCrossDependencies → fix task spawn (10min timeout)
  └─ escalateDebt (3+ sprint açık → priority yükselt)

Phase 6+7: RETRO + DECAY (finalizeSprint)
  └─ MEMORY, RETRO, PROJECT-IDENTITY güncelle, sprint log, decay

Phase 8: CLEANUP
  └─ Task/lock/prompt dosyaları sil, tmux window kapat
```

### Zero-Config Modu

```bash
deckent start "Express API'ye JWT auth ekle"
```
1. `prepareZeroConfig()` → geçici DIRECTIVES.md yazar
2. AI modda `callZeroConfigPlanner()` → 3-5 task'a böler
3. Sprint bitince `cleanupZeroConfig()` → geçici dosyayı siler

### Worker Spawn Mekanizması

3 backend: Legacy tmux (Claude), SpawnBackend (abstraction), ProviderAdapter (Codex/Gemini)

Worker prompt = Agent systemPrompt + Skill SKILL.md (max 3) + Task bilgisi + Scope

### Kuyruk Sistemi

```
activeTasks = tasks[0..maxWorkers] → hemen spawn
queuedTasks = tasks[maxWorkers..] → kuyrukta bekle
Worker bitirince → slot açılır → queue'dan sonraki spawn
```

### Rollback Mekanizması

Sprint başında safety point (git), sonunda: tüm NO_GO → otomatik rollback, kısmi başarı → safety point sil. `rollback_policy`: never/on_failure/always.

### Kaynak Dosyalar
- `src/cli/commands/start.ts` — CLI komutu
- `src/cli/commands/quick-start.ts` — Zero-config modu
- `src/orchestra/sprint-controller.ts` — runSprint, spawnWorkers, waitForResults, cleanup, finalizeSprint
- `src/orchestra/tmux.ts` — tmux worker management
- `src/orchestra/rollback.ts` — Safety points, rollback

### Geliştirme Önerileri

1. **`--sandbox-mode` Implement Değil** — Sadece "not implemented" mesajı.
2. **Zero-Config DIRECTIVES Çakışması** — Mevcut DIRECTIVES varsa sessizce geçiliyor, net uyarı yok.
3. **`waitForResults` 30 Dakika Hardcode** — Config'den ayarlanabilir olmalı.
4. **Spawn Retry Strateji Yok** — Tek retry, aynı şeyi deniyor, hata analizi yok.
5. **Fix Phase Timeout Kısa (10 dk)** — Fix task'ları karmaşık olabilir.
6. **Queue Spawn Hata Yutma** — Spawn hatası sessizce geçilip task timeout'a bırakılıyor.
7. **Dashboard Final Update Sıfırlı Usage** — Sprint bittiğinde `fiveHourPercent: 0` yazılıyor.
8. **`--watch` tmux Bağımlılığı** — Subprocess worker'lar için alternatif yok.
9. **Provider Bootstrap Her Start'ta** — 5-15 saniye. Cache'lenebilir.
10. **Phase Arası Durum Kaybı** — Process crash'te orkestrasyon kayıp, orphan worker detection yok.
11. **Cleanup Zero-Config `finally` Eksik** — try/catch'te çağrılıyor ama `finally` daha temiz.

---

## 4. `deckent status`

### Komut Tanımı
```
deckent status [--watch] [--json] [--raw] [--verbose]
```

### Veri Kaynakları

1. `.dashboard` (JSON) — Auditor tarafından 30 saniyede bir yazılır
2. `.tasks/task-*.json` — Task dosyaları (canlı durum)
3. `DIRECTIVES.md` — Sprint başlığı extraction
4. `.deckent/config.json` — Dil + sprint_started_at

### 4 Çıktı Formatı

**Default — Human-Friendly:** Progress, active workers, ETA, task status (✓/▶/✗/⏸/·), issues, blocked, next queue

**`--raw` — Legacy Box Format:** Unicode border'lı tablo, per-agent progress bar, ANSI renkli

**`--json`:** DashboardState JSON

**`--verbose`:** Agent/skill assignment tabloları

### Watch Mode
`setInterval(2000)` polling — `fs.watch` yok.

### Kaynak Dosyalar
- `src/cli/commands/status.ts` — CLI komutu
- `src/cli/helpers/output.ts` — formatHumanStatus, formatDashboard, formatElapsed, estimateRemaining

### Geliştirme Önerileri

1. **`.dashboard` Yoksa Kör Nokta** — Task dosyalarından standalone status oluşturulabilir.
2. **Watch Mode Polling** — `fs.watch` kullanılmalı, CPU dostu + anlık.
3. **`readSprintMeta` Fragile Regex** — Çok spesifik format, genelde match etmez.
4. **`startedAt` Hiçbir Zaman Dolu Değil** — `sprint.startedAt` config'e yazılmıyor → ETA çalışmaz.
5. **Progress Stale Olabilir** — Dashboard 30s'de bir güncelleniyor, task dosyaları anlık → tutarsızlık.
6. **`--json --verbose` Çalışmaz** — JSON'a verbose bilgi eklenmiyor.
7. **Usage "Budget: OK" Hardcode** — Gerçek budget durumuna bakılmıyor.
8. **Alert Detayı Gösterilmiyor** — Sadece sayı, içerik yok.
9. **Renk NO_COLOR Kontrolü Yok** — Pipe/CI'da bozuk çıktı.
10. **ETA Naif** — Lineer hesap. Son N task hızına göre daha doğru olur.

---

## 5. `deckent doctor`

### Komut Tanımı
```
deckent doctor [--profile] [--legacy]
```

### 11 Sağlık Kontrolü

| # | Kontrol | Required | Ne Kontrol Eder |
|---|---------|----------|-----------------|
| 1 | Platform | hayır | win32→UNSUPPORTED, linux/darwin→OK, WSL2 detect |
| 2 | Node.js | **evet** | `node --version`, major ≥ 18 |
| 3 | git | **evet** | `git --version` |
| 4 | tmux | **evet** | `tmux -V` |
| 5 | Claude CLI | **evet** | `claude --version` |
| 6 | Workspace | hayır | `.deckent/` dizini var mı |
| 7 | Brain Dir | hayır | `.brain/` + required dosyalar |
| 8 | Directives | hayır | `DIRECTIVES.md` var + boş değil |
| 9 | Brain Budget | hayır | `countBrainLines()` ≤ 600 |
| 10 | Debt | hayır | CRITICAL debt item sayısı |
| 11 | Locks | hayır | Stale lock (>5 dakika) |

`ok = tüm required check'ler pass`

### Human-Friendly Çıktı (5 Bölüm)
Your System → Your Project → System Health → Provider Health → Readiness + Recommendation

### `--profile` Ek Çıktı
System Profile: CPU, RAM, max worker, subscription tier (opus probe)

### Kaynak Dosyalar
- `src/cli/commands/doctor.ts` — CLI komutu + tüm check fonksiyonları
- `src/core/system-profile.ts` — getSystemProfile
- `src/core/subscription.ts` — detectSubscription
- `src/core/provider.ts` — detectAvailableProviders

### Geliştirme Önerileri

1. **tmux `required: true` Multi-Provider'da Gereksiz** — Codex/Gemini subprocess kullanıyorsa tmux gerekmez ama doctor FAIL verir.
2. **Memory Bilgisi Tekrarlanıyor** — "Your Project" ve "System Health"'te aynı veri.
3. **`countOpenDebtItems()` Tekrar Dosya Okuma** — `checkDebt()` zaten okumuş.
4. **`.deck` Güvenlik Kontrolü Eksik** — Git'te track edilip edilmediği kontrol edilmiyor, `isDeckFileCommitted()` var ama çağrılmıyor.
5. **Error Registry Kısmi Kullanım** — Bazı check'ler ErrorRegistry kullanıyor, bazıları düz string.
6. **Stale Lock Temizleme Önerisi Yok** — Sadece sayı, ne yapılacağı söylenmiyor.
7. **Disk/Permission Check Yok** — Yazma izni kontrolü yok.
8. **Claude CLI Auth Kontrolü Yok** — Sadece version check, login durumu kontrol edilmiyor.
9. **[DONE] `--json` Flag'i Yok** — CI/CD entegrasyonu için lazım. *Sprint 055: --json flag eklendi, JSON çıktı {ok, checks, providers}.*
10. **`detectSubscription()` Sadece `--profile`'da** — Mode uyumluluk kontrolü ana doctor'da yok.

---

## 6. `deckent retro`

### Komut Tanımı
```
deckent retro [--raw] [--compare]
```

### RETRO.md Üretimi (`finalizeSprint` → `writeRetrospective`)

Bölümler: Summary, Highlights, Issues, Metrics Table, Agent Performance, Skill Performance, Learnings

Max 100 satır. Sprint sonunda overwrite.

### Rich Summary Parse

`parseRetroToRichSummary()` regex ile: Total Tasks, Completed, No-Go, Tech Debt, Coverage, Duration

### `--compare` Delta

`computeRetroDelta()`: Success rate, No-Go, Tech Debt delta. `.brain/sprints/` dizininden önceki sprint okunur.

### Kaynak Dosyalar
- `src/cli/commands/retro.ts` — CLI komutu
- `src/orchestra/sprint-reporter.ts` — writeRetrospective, formatHumanRetro, buildRetroHighlights/Issues/Learnings

### Geliştirme Önerileri

1. **[DONE] Parse ↔ Write Format Uyumsuzluğu (KRİTİK)** — Yazma `| Tasks completed |` kullanıyor, okuma `| Completed |` arıyor. Regex match etmez → tüm değerler 0. *Sprint 055: retro.ts regex'leri sprint-reporter.ts formatına eşleştirildi.*
2. **[DONE] `--compare` Yanlış Dosyayı Karşılaştırır** — Son sprint logunu kendisiyle karşılaştırıyor (delta=0). Sondan bir öncekini almalı. *Sprint 055: loadPreviousRetro files.at(-2) ile fix edildi.*
3. **[DONE] `--json` Flag'i Yok**. *Sprint 055: --json flag eklendi.*
4. **Sprint Log Parse Fragile** — Header formatları tutarsız.
5. **Learnings Sığ** — Her zaman generic mesajlar, result.notes kullanılmıyor.
6. **Retro Dil Desteği Yok** — İngilizce hardcode, `config.language` kontrol edilmiyor.
7. **`--trend` Yok** — Son N sprint trend görünümü.
8. **Agent/Skill Performance CLI'da Görünmez** — RETRO.md'ye yazılıyor ama parse edilmiyor.
9. **MEMORY.md Learnings Kalitesi Düşük** — Sadece `task.title: evaluation`, neden/detay yok.
10. **Overwrite → Tarihçe Kaybı** — Retro arşivlenmiyor, sprint log farklı format.

---

## 7. `deckent cleanup`

### Komut Tanımı
```
deckent cleanup [--decay]
```

### 2 Mod

**Normal Cleanup:**
1. Worker'ları öldür (tmux + SpawnBackend + ProviderAdapter)
2. Lock'ları serbest bırak
3. Task dosyalarını sil (.json, .plan, .hb, .result, .paused, .log)
4. Stale dosyaları sil (>24 saat)
5. `.prompt-*` tmp dosyalarını sil
6. Lock dosyalarını sil
7. Plugin hook'larını temizle
8. tmux session'ı destroy et

**`--decay` (Memory Decay):**
1. Resolved pattern'ları sil
2. Resolved debt'i sil (retention: 3 sprint)
3. Eski sprint loglarını arşivle (son 2'yi koru)
4. Memory section decay (≥5 sprint eski → sil)
5. Son çare: MEMORY.md'yi 50 satıra kırp

### Kaynak Dosyalar
- `src/cli/commands/cleanup.ts` — CLI komutu
- `src/orchestra/sprint-controller.ts` — cleanup()
- `src/orchestra/debt-manager.ts` — runDecay()

### Geliştirme Önerileri

1. **Cleanup'ta Decay Otomatik Çağrılmıyor** — Budget uyarısı bile yok.
2. **Task Dosyası Silme Çift Geçiş Gereksiz** — İlk geçiş hepsini sildi, ikinci geçiş bir şey bulamaz.
3. **[DONE] `--dry-run` Yok** — Geri dönüşü olmayan silme için preview lazım. *Sprint 055: --dry-run flag eklendi, silinecek dosyalar listelenir.*
4. **Sahte Sprint Objesi** — CLI'da yapay Sprint oluşturuluyor.
5. **`destroy()` Her Zaman Çağrılıyor** — Diğer projelerin tmux session'ını da öldürebilir.
6. **Decay "Son Çare" Truncation Agresif** — Önemli erken learnings kaybı.
7. **Decay Sprint Number Parse Fragile** — "## Sprint 1-5 Özet" formatı match etmez.
8. **Archive `.gitignore`'da** — Arşiv kaybolma riski.
9. **Lock Temizleme Koşulsuz** — Aktif lock'lar da silinir.
10. **`--decay` Normal Cleanup Yapmıyor** — Early return, her ikisini istiyorsan 2 komut çalıştır.

---

## 8. `deckent usage`

### Komut Tanımı
```
deckent usage [--json] [--sprint <id>]
```

### Veri Kaynağı
`.deckent/usage/{sprintId}.json` — Her sprint için ayrı JSON, `UsageEntry[]` dizisi.

### Veri Kaydı

| Yer | Tetik | Token Tahmini |
|-----|-------|---------------|
| spawnWorkers | Worker spawn | 5,000 (sabit) |
| evaluateResult | Task eval | 2,000 (sabit) |
| Timeout result | Worker cevapsız | 1,000 (sabit) |

**Gerçek token sayısı ölçülmüyor.**

### Auth Mode → Maliyet Sütunu

`api` → maliyet gösterilir (opus: $0.015/1K, sonnet: $0.003/1K, haiku: $0.00025/1K)
`subscription` → maliyet gizli

### Kaynak Dosyalar
- `src/cli/commands/usage.ts` — CLI komutu
- `src/core/usage-tracker.ts` — UsageTracker sınıfı

### Geliştirme Önerileri

1. **Token Tahminleri Sabit ve Yanlış** — Gerçek kullanımla alakası yok. Claude CLI'dan gerçek token bilgisi alınabilir.
2. **recordCall Race Condition** — Concurrent write → last-write-wins, entry kaybı. File lock veya append-only.
3. **Canlı Usage (5hr/weekly) Gösterilmiyor** — Rate limit durumu yok.
4. **Maliyet Fiyatları Stale** — Hardcode, API fiyat değişiklikleri yansımaz.
5. **Usage Dosyaları Hiç Temizlenmiyor** — Sonsuza kadar birikir.
6. **`--since` / `--last` Filtre Yok**.
7. **Subscription Modda Faydasız** — Rate limit bilgisi gösterilmeli.
8. **Sprint Arası Karşılaştırma Yok** — Trend/insight yok.
9. **Task-Level Granularity Yok** — Hangi task en çok harcadı gösterilmiyor.
10. **Provider Ayrımı Yok** — Aynı model farklı provider'dan gelebilir, maliyet farklı.

---

## 9. `deckent history`

### Komut Tanımı
```
deckent history [--agent <name>] [--skill <name>]
```

### Veri Kaynağı
`.brain/sprints/sprint-NNN.md` — Metrics tablosu + task listesi

### Sprint Log Parse

Regex ile: Total Tasks, Completed, No-Go, Coverage, Duration, Agents, Skills

### Agent/Skill Filter
Log içinden veya `.brain/learning/{sprintId}.json`'dan zenginleştirme (varsa)

### Kaynak Dosyalar
- `src/cli/commands/history.ts` — CLI komutu

### Geliştirme Önerileri

1. **Agent/Skill Bilgisi Sprint Log'da Yok** — `writeSprintLog` agent/skill yazmıyor → sütun hep "-".
2. **`--json` Flag'i Yok**.
3. **`--last <N>` Flag'i Yok**.
4. **Trend Analizi Yok**.
5. **Parse ↔ Write Format Tutarsızlığı** — Farklı komutlarda farklı header naming.
6. **Sıralama Sadece Alphabetical** — Sprint-1000+ durumunda bozulabilir.
7. **Archive Sprint'ler Gösterilmiyor** — Decay sonrası eski sprint'ler kayıp.
8. **Usage Bilgisi Entegre Değil** — Token/call sütunu yok.
9. **Sprint Log İçeriği Fakir** — Dosya, süre, hata detayları yok.
10. **`loadLearningData` Dead Code** — `.brain/learning/` hiçbir yerde oluşturulmuyor.

---

## 10. `deckent config`

### Komut Tanımı
```
deckent config                          # Resolved config göster
deckent config set <key> <value>        # Bir alanı değiştir
deckent config export [file]            # Dışa aktar (comment strip)
deckent config import <file>            # İçe aktar (shallow merge)
deckent config migrate [--dry-run]      # Eksik alanları default'larla doldur
```

### Config Katmanları (Öncelik sırası)

```
1. createDefaultConfig()       → Hardcode default'lar
2. ~/.deckent/config.json      → Global config
3. .deckent/config.json        → Proje config (deepMerge)
4. Env vars                    → DECKENT_BRAIN_PROVIDER, DECKENT_WORKER_PROVIDER
```

### Validation
mode, language, max_workers (1-100 veya 'auto'), brain_model, default_model, haiku_allowed, usage_thresholds, brain_planning, brain_provider, worker_provider

### Migration
`getMissingFields()` → default'taki ama mevcut config'te olmayan top-level key'ler. `modes` atlanır. Backup → eksik alanları doldur → yaz.

### Kaynak Dosyalar
- `src/cli/commands/config.ts` — CLI komutu
- `src/core/config.ts` — loadConfig, validateConfig, createDefaultConfig
- `src/core/config-migration.ts` — migrateConfig, getMissingFields, needsMigration

### Geliştirme Önerileri

1. **[DONE] `config set` Sadece Top-Level** — Nested key (`modes.max_plan.max_workers`) desteklenmiyor, `setNestedValue` var ama kullanılmıyor. *Sprint 055: setNestedValue bağlandı, dot notation destekleniyor.*
2. **[DONE] `config import` Shallow Merge** — Nested obje alanları ezilir, `loadConfig` deep merge ama import shallow. *Sprint 055: deepMerge kullanılıyor.*
3. **`autoMigrateOnLoad` Yok** — `loadConfig` içinde otomatik migration implement edilmemiş.
4. **Migration `modes` Atlanıyor** — Yeni mode field'ları algılanmaz.
5. **Config Çıktısı Resolved** — Raw config değil, default'larla merge edilmiş. `--raw` lazım.
6. **JSON Comment Desteği Yarım** — Export'ta var, import ve loadConfig'te yok.
7. **Env Var Override Sınırlı** — Sadece 2 env var, DECKENT_MODE vb. yok.
8. **`config list` / `config keys` Yok** — Geçerli key listesi gösterilmiyor.
9. **Backup Temizliği Yok** — Her migration'da .bak ezilir.
10. **Validation Hata Mesajı Kötü** — Mode context yok, teknik mesajlar.

---

## 11. `deckent spawn` ve `deckent kill`

### Komut Tanımları
```
deckent spawn <taskId>    # Task için manuel worker başlat
deckent kill <taskId>     # Çalışan worker'ı öldür
```

### spawn Akışı

```
1. readTask(root, taskId) → .tasks/task-{taskId}.json
2. ensureSession() → tmux session aktifleştir
3. spawnWorker(taskId, model, genericPrompt, root, { autoApprove: false })
   ├─ tmux new-window
   ├─ writePromptFile → .tasks/.prompt-{random}.txt
   ├─ buildWorkerCommand → "claude -p - --model {model} < prompt"
   ├─ tmux send-keys
   └─ tmux pipe-pane → log
```

### kill Akışı

```
1. killWorker(taskId) → tmux kill-window -t w-{taskId}
2. TmuxError → "Worker not found"
```

### Güvenlik
Shell injection koruması: prompt dosyaya yazılıp stdin redirection, hiçbir zaman shell interpolation yok.

### Kaynak Dosyalar
- `src/cli/commands/spawn.ts`, `src/cli/commands/kill.ts`
- `src/agents/worker.ts` — readTask
- `src/orchestra/tmux.ts` — ensureSession, spawnWorker, killWorker

### Geliştirme Önerileri

1. **[DONE] spawn Prompt Çok Basit** — Tek cümle. `spawnWorkers()` ise agent+skill+scope inject ediyor. *Sprint 055: buildWorkerPrompt + agent/skill context injection eklendi.*
2. **spawn Sadece tmux** — Multi-provider (Codex/Gemini) desteklenmiyor.
3. **[DONE] spawn Task Status Kontrol Yok** — DONE task tekrar spawn edilebilir. *Sprint 055: Status kontrolü + --force flag eklendi.*
4. **[DONE] spawn autoApprove Hardcode false** — CLI flag yok. *Sprint 055: --auto-approve flag eklendi.*
5. **kill Sadece tmux Worker** — Subprocess worker öldüremez.
6. **[DONE] kill Lock Temizlemiyor** — Worker lock'ları serbest bırakılmıyor. *Sprint 055: releaseLocks() ile lock temizliği eklendi.*
7. **[DONE] kill Task Status Güncellemiyor** — Task hâlâ EXECUTING kalır. *Sprint 055: Kill sonrası task PAUSED olarak güncelleniyor.*
8. **[DONE] kill --all Flag'i Yok** — Tek tek öldürmek gerekiyor. *Sprint 055: --all flag ile toplu kill eklendi.*
9. **[DONE] Prompt Dosyası Temizlenmiyor** — `.prompt-*` dosyaları kalır. *Sprint 055: cleanPromptFiles() eklendi.*
10. **spawn Scope/AllowedTools Yok** — Worker sınırsız erişim, boundary enforcement bozulur.

---

## 12. `deckent attach` ve `deckent watch`

### Komut Tanımları
```
deckent attach                       # tmux session'a bağlan
deckent watch [--follow <taskId>]    # Split view: dashboard + heartbeat
```

### attach
`tmux attach -t deckent-orchestra` (stdio: inherit). Session yoksa hata.

### watch Layout

```
┌─────────────────────────────────┬────────────────────┐
│ watch -n 2 cat .dashboard       │ watch -n 3         │
│ (Dashboard JSON, 2s refresh)    │ ls -la .tasks/*.hb │
│          60%                    │      40%           │
└─────────────────────────────────┴────────────────────┘
```

### `--follow <taskId>`
Belirli worker'ın tmux window'una bağlanır — canlı terminal çıktısı.

### Kaynak Dosyalar
- `src/cli/commands/attach.ts`, `src/cli/commands/watch.ts`
- `src/orchestra/tmux.ts` — attach, createWatchLayout, attachToWorkerPane, setupWatchWindow

### Geliştirme Önerileri

1. **Watch Dashboard Ham JSON** — `cat .dashboard` formatlanmamış. `deckent status` kullanılmalı.
2. **Heartbeat Panel Faydasız** — `ls -la *.hb` sadece dosya listesi, içerik yok.
3. **tmux Bağımlılığı** — Subprocess worker çıktısı görülemez.
4. **attach Window Belirsiz** — Son aktif window'a gider, `--list` flag'i yok.
5. **Watch Window Kaldırılmıyor** — cleanup'ta temizlenmiyor.
6. **follow Hata Belirsiz** — Neden bulunamadığı açıklanmıyor (bitmiş? yanlış provider?).
7. **Watch re-attach** — Eski sprint'ten kalmış window tekrar kullanılır.
8. **Terminal Durumu** — tmux detach sonrası cursor/renk bozulabilir.
9. **Split Ratio Sabit** — Küçük terminallerde sığmaz.
10. **Nested tmux Sorunu** — `$TMUX` kontrolü yok.

---

## 13. `deckent analyze`

### Komut Tanımı
```
deckent analyze [--json]
```

### İki Analiz Motoru

**1. `analyzeProject()` (core/analyzer.ts) — CLI komutu**
Hafif, git bağımlı. Framework, dil, test, build, CI, dosya sayısı, yazar sayısı, boyut, metodoloji.

**2. `detectProjectStack()` (core/stack-detector.ts) — Skill/agent seçimi**
Zengin, cache'li, 9 dil. Python/Java/Go/Rust/C/C++ framework/test detection. Stack-aware komut eşleme. Cache: `.deckent/project-stack.json` + staleness check.

### Çıktı
Property-value tablosu: Framework, Language, Test Framework, Build Tool, CI, File Count, Authors, Size, Methodology

### Kaynak Dosyalar
- `src/cli/commands/analyze.ts` — CLI komutu
- `src/core/analyzer.ts` — analyzeProject (hafif)
- `src/core/stack-detector.ts` — detectProjectStack (zengin, cache'li)

### Geliştirme Önerileri

1. **İki Analiz Motoru — Duplikasyon** — analyzer.ts ve stack-detector.ts aynı iş, farklı kapsam. Birleştirilmeli.
2. **`analyzeProject()` Git Bağımlı** — Git repo olmayanda fileCount=0 → yanlış sonuç.
3. **Analyzer Cache Yok** — stack-detector cache'li ama analyzer her çağrıda git çalıştırır.
4. **Metodoloji Naif** — Dosya sayısıyla ölçülüyor, LOC/complexity yok.
5. **Monorepo/Multi-Language Yok** — Tek dil döndürüyor.
6. **Sadece Root Dizine Bakıyor** — Alt dizinlerdeki package.json algılanmaz.
7. **Dependency Cap 50** — İlk 50 dep saklanıyor, sonrakiler kayıp.
8. **Config Önerisi Yok** — Tespit sonucundan actionable öneri üretilmiyor.

---

## Genel Cross-Cutting Sorunlar

### Format Tutarsızlıkları
- [DONE] ~~RETRO.md yazma `| Tasks completed |`, okuma `| Completed |` arıyor → **parse bozuk**~~ *Sprint 055: regex'ler yazma formatına eşleştirildi.*
- Sprint log yazma `| Total Tasks |`, history okuma doğru eşleşiyor
- Agent/skill bilgisi sprint log'a yazılmıyor → history'de hep "-"

### Dil Desteği
- Plan komutu: prompt Türkçe hardcode, dil config'e bakılmıyor
- Retro: İngilizce hardcode
- Status, doctor, init: getMessage() ile dil desteği var

### Hata Yönetimi
- Çoğu `catch { /* non-fatal */ }` — sessiz hata yutma, debug zorluğu
- ErrorRegistry kısmi kullanım (bazı komutlarda var, bazılarında yok)

### Provider Uyumu
- spawn, kill, attach, watch: sadece tmux (Claude)
- Codex/Gemini subprocess worker'lar bu komutlarla yönetilemiyor

### Cache Stratejisi
- Stack detector: cache var, staleness check var
- Analyzer: cache yok
- Provider bootstrap: cache yok (her start'ta 5-15s)
- Usage: hiç temizlenmiyor

---

## 14. `deckent dashboard`

### Komut Tanımı
```
deckent dashboard [--interval <ms>]
```

Default interval: 2000ms. Terminal dashboard — Unicode box format, auto-refresh.

### Çıktı Formatı

```
╔════════════════════════════════════════════════════════════╗
║ DECKENT DASHBOARD  14:30:45                                ║
╠════════════════════════════════════════════════════════════╣
║ Sprint: sprint-052 (#52)                                   ║
║ Phase: EXECUTE  Status: ACTIVE                             ║
╠════════════════════════════════════════════════════════════╣
║ ID          Task                Status    Elapsed          ║
║ ──────────────────────────────────────────────────────     ║
║ w-052-001   Fix auth          EXECUTING  3m45s             ║
║ w-052-002   Add tests         DONE       2m10s             ║
╠════════════════════════════════════════════════════════════╣
║ [####+++.........] 2/5 done 1 active 2 pending             ║
╠════════════════════════════════════════════════════════════╣
║ Alerts:                                                    ║
║ No alerts.                                                 ║
╚════════════════════════════════════════════════════════════╝
```

Progress bar: `#` (done), `+` (active), `.` (pending)

### `status --watch` ile Farkı

| | `dashboard` | `status --watch` |
|---|------------|-----------------|
| Format | Box (Unicode border) | Human-friendly (text) |
| Worker detayı | ID + task + status + elapsed | Task status icon + title + action |
| Progress | ASCII progress bar | Percentage text |
| Alerts | Detaylı gösterir | Issues bölümü |
| Genişlik | 62 karakter sabit | Dinamik |

### Kaynak Dosyalar
- `src/cli/commands/dashboard.ts` — renderDashboard, readDashboardFile

### Geliştirme Önerileri

1. **`status --watch` ile Duplikasyon** — İki komut neredeyse aynı işi yapıyor, farklı formatta. Birleştirilebilir.
2. **Polling, `fs.watch` Yok** — `setInterval` ile polling.
3. **Genişlik Sabit (62)** — Terminal genişliğine adapte olmuyor.
4. **Agent/Skill Bilgisi Yok** — Worker tablosunda agent ve skill gösterilmiyor.
5. **Usage Metriği Yok** — `status --raw` usage gösteriyor ama dashboard göstermiyor.

---

## 15. `deckent serve`

### Komut Tanımı
```
deckent serve [--port <number>]
```

Default port: 3100. Sadece HTTP API sunucusu (frontend yok).

### API Endpoint'leri

**GET:**
| Endpoint | Ne Döndürür |
|----------|------------|
| `/api/status` | Dashboard JSON (.dashboard dosyası) |
| `/api/sprint` | Son sprint log (metrics + tasks) |
| `/api/history` | Tüm sprint logları |
| `/api/config` | Proje config (.deckent/config.json) |
| `/api/config/defaults` | Default config (createDefaultConfig) |
| `/api/doctor` | Sağlık kontrolü sonuçları |
| `/api/memory` | MEMORY.md içeriği |
| `/api/debt` | DEBT.md içeriği |
| `/api/job/:jobId` | Arka plan sprint job durumu |
| `/api/worker/:taskId/log` | Worker log + task bilgisi |
| `/api/events` | SSE (Server-Sent Events) — canlı dashboard |

**POST (Bearer token auth):**
| Endpoint | Ne Yapar |
|----------|---------|
| `/api/start` | Sprint başlat (arka planda, jobId döndürür) |
| `/api/plan` | Sprint planla (senkron) |
| `/api/kill/:workerId` | Worker öldür |
| `/api/set-directives` | DIRECTIVES.md yaz |
| `/api/config` | Config güncelle (merge + validate) |

### Güvenlik
- `127.0.0.1` binding (localhost-only)
- CORS: sadece `localhost:*` origin
- POST endpoint'ler Bearer token auth (timingSafeEqual + SHA-256 hash)
- Zod schema validation tüm POST body'lerde
- Static file serving path traversal koruması (`resolve` + `startsWith` check)
- Worker ID regex validation (`/^[a-zA-Z0-9-]+$/`)

### SSE (Server-Sent Events)
`.dashboard` dosyasını `watchDashboard()` ile izler, değişiklik olunca tüm SSE client'lara push.

### Kaynak Dosyalar
- `src/cli/commands/serve.ts` — CLI komutu
- `src/api/server.ts` — createHttpServer, route handler, auth
- `src/api/watcher.ts` — watchDashboard (SSE trigger)

### Geliştirme Önerileri

1. **Auth Token Otomatik Generate Edilmiyor** — Token CLI'dan geçilmeli, otomatik üretim yok.
2. **CORS Origin Hardcode** — `http://localhost:${DEFAULT_PORT}` sabit, port değişince bozulur.
3. **`/api/config` POST Shallow Merge** — `{ ...existing, ...parsed.data }` — nested config ezilir.
4. **Job Tracking Tek Sprint** — `activeJob` tek global variable, aynı anda 1 sprint.
5. **Rate Limiting Yok** — DoS koruması yok.
6. **API Versioning Yok** — `/api/v1/...` yok, breaking change riski.
7. **Body Size Limit Yok** — `parseBody` boyut kontrolü yapmıyor.
8. **SSE Reconnection** — Client disconnect sonrası reconnection bilgisi yok.

---

## 16. `deckent web`

### Komut Tanımı
```
deckent web [--port <number>] [--dev]
```

`serve` + static file serving (React dashboard). `--dev` modda Vite dev server bilgisi gösterir.

### serve ile Farkı

| | `serve` | `web` |
|---|--------|-------|
| Static dosya | Yok | `src/dashboard/dist/` |
| SPA fallback | Yok | index.html fallback |
| Dev mode | Yok | `--dev` flag |

### Geliştirme Önerileri

1. **`--dev` Sadece Mesaj** — Gerçek Vite proxy setup yok, sadece "cd src/dashboard && npm run dev" mesajı.
2. **Dashboard Build Gerekli** — `dist/` yoksa 404. Build check veya uyarı yok.
3. **MIME Type Sınırlı** — Sadece 5 tip (.html, .js, .css, .svg, .json). Resim, font vb. yok.

---

## 17. `deckent sync`

### Komut Tanımı
```
deckent sync [--git-only] [--adapters-only]
```

Git değişikliklerini algıla + adapter dosyalarını senkronize et.

### Akış
1. Git repo check
2. Son sprint timestamp'ini bul (`.brain/sprints/` mtime)
3. O zamandan bu yana commit'leri al (`git log --since`)
4. Değişen dosyaları kategorize et (M/A/D/R) (`git diff --name-status`)
5. MEMORY.md'ye "Out-of-band Changes" bölümü ekle/güncelle

### Geliştirme Önerileri

1. **Adapter Sync Detayı Belirsiz** — `--adapters-only` ne yapıyor net değil (CLAUDE.md/AGENTS.md resync).
2. **MEMORY.md Section Replace Fragile** — Regex ile bölüm değiştirme, format değişirse bozulur.
3. **Sprint Yoksa Silent** — Son sprint yoksa hiç değişiklik algılamaz.

---

## 18. `deckent run`

### Komut Tanımı
```
deckent run <description> [--model <model>] [--scope <dir>]
```

Sprint döngüsü olmadan tek seferlik task çalıştırır.

### Akış
1. Model validate (ALL_MODELS)
2. Task objesi oluştur (timestamp-based ID)
3. tmux worker spawn
4. `.result` dosyasını polling ile bekle (5s interval, 5 dakika timeout)
5. Sonucu göster + task dosyalarını temizle

### Geliştirme Önerileri

1. **5 Dakika Hardcode Timeout** — Config'den okunabilir.
2. **Polling 5 Saniye** — `fs.watch` kullanılabilir.
3. **Sadece tmux** — Codex/Gemini provider desteklenmiyor.
4. **Heartbeat Monitoring Yok** — Sadece result-based.
5. **Otomatik Cleanup** — Task geçmişi korunmuyor.

---

## 19. `deckent test`

### Komut Tanımı
```
deckent test [--keep] [--timeout <ms>]
```

Test sprint'i — retro, memory update ve decay yapmaz.

### Akış
`runSprint()` ile `testMode: true`. DIRECTIVES.md gerekli. NO_GO varsa exit 1.

### Geliştirme Önerileri

1. **Özel Test DIRECTIVES Desteği Yok** — Proje DIRECTIVES kullanılıyor, `--directives <file>` flag lazım.
2. **CI/CD Çıktı Formatı Yok** — JUnit XML, TAP format vb. yok.

---

## 20. `deckent agent`

### Komut Tanımı
```
deckent agent list [--json]
deckent agent create <name>
deckent agent enable <name>
deckent agent disable <name>
```

`.deckent/agents/{name}/agent.json` — Agent CRUD.

### Geliştirme Önerileri

1. **Agent Model Execution'da Kullanılmıyor** — Sadece saklanıyor, sprint routing'de etkisiz.
2. **Trigger Pattern Validation Yok**.
3. **`--stats` Flag'i Yok** — Agent performans metrikleri CLI'da gösterilmiyor.
4. **Interactive Wizard Yok** — `create` sadece scaffold, prompt/trigger sorumuyor.

---

## 21. `deckent skill`

### Komut Tanımı
```
deckent skill list [--json] [--category <cat>]
deckent skill create <name>
deckent skill install <source> [--force]
```

`.deckent/skills/{id}/manifest.json` — Skill CRUD + install (git/local).

### Geliştirme Önerileri

1. **Git Install Checksum Yok** — İndirilen skill doğrulanmıyor.
2. **Version Pinning Yok** — Git URL'de versiyon belirtilemez.
3. **Git Clone Timeout 30s** — Yavaş ağlarda fail.
4. **`--stats` Flag'i Yok**.

---

## 22. `deckent skill-marketplace`

### Komut Tanımı
```
deckent skill-marketplace search <query> [--category <cat>] [--json] [--limit <n>]
```

Registry API'den skill arama. Offline → local fallback.

### Geliştirme Önerileri

1. **Registry Cache Yok** — Her arama HTTP istek.
2. **Semver Validation Loose** — `/^\d+\.\d+\.\d+/` pre-release tag'lere izin verir.
3. **Publish Author Validation** — manifest.json'da author zorunlu ama schema'da değil.

---

## 23. `deckent review`

### Komut Tanımı
```
deckent review [--auto] [--json]
```

Task sonuçlarını değerlendir. DONE→approved, NO_GO→rejected, TECH_DEBT→tests pass ise approved.

### Geliştirme Önerileri

1. **Interactive Review Yok** — Sadece `--auto`, insan onayı yok.
2. **"retry" Decision Kullanılmıyor** — Enum'da var ama hiçbir zaman atanmıyor.
3. **Review State `.tasks/`'te** — Cleanup'ta silinir, kalıcı değil.

---

## 24. `deckent finalize`

### Komut Tanımı
```
deckent finalize [--skip-decay] [--skip-hooks]
```

Post-sprint: MEMORY, RETRO, PROJECT-IDENTITY güncelle, decay, plugin hooks.

### Geliştirme Önerileri

1. **Sprint Tamamlanma Kontrolü Yok** — Yarım sprint'i de finalize edebilir.
2. **Duplicate Finalize Koruması Zayıf** — MEMORY.md sprint header kontrolü var ama RETRO overwrite.

---

## 25. `deckent explain`

### Komut Tanımı
```
deckent explain
```

Son sprint'in ne yaptığını insan-dostu dille anlatır. Sprint log + RETRO.md parse.

### Geliştirme Önerileri

1. **Regex Parse Fragile** — Whitespace-sensitive markdown parsing.
2. **[DONE] Dil Desteği Yok** — İngilizce hardcode. *Sprint 055: Türkçe/İngilizce i18n etiketler eklendi.*
3. **[DONE] `--sprint <id>` Flag'i Yok** — Sadece son sprint. *Sprint 055: --sprint flag + --json flag eklendi.*

---

## 26. `deckent onboard`

### Komut Tanımı
```
deckent onboard [--non-interactive]
```

Interactive onboarding wizard: system check → project detection → init.

### Geliştirme Önerileri

1. **Mode Seçimi 3 Seçenek** — `api` modu yok.
2. **Non-interactive TTY Check** — stdin TTY değilse otomatik non-interactive.
3. **Init Subprocess Olarak Çağrılıyor** — `npx deckent init --force` — mevcut process'te çağırılabilir.

---

## 27. `deckent upgrade`

### Komut Tanımı
```
deckent upgrade [--check]
```

npm'den en son sürümü kontrol et, yükle.

### Geliştirme Önerileri

1. **Version Compare Fragile** — `parseFloat` tabanlı, pre-release tag'lerde bozulabilir.
2. **Rollback Yok** — Yükleme başarısız olursa geri dönüş yok.
3. **Global Install Varsayımı** — `npm install -g` — local install senaryosu yok.

---

## 28. `deckent plugin`

### Komut Tanımı
```
deckent plugin install <source>
deckent plugin list
deckent plugin info <dir>
deckent plugin create <name>
```

`.deckent/plugins/{name}/` — Plugin CRUD.

### Geliştirme Önerileri

1. **Entrypoint Validation Yok** — manifest.json'daki dosya var mı kontrol edilmiyor.
2. **Conflict Detection Yok** — Aynı isimli plugin install edilirse sessizce ezilir.
3. **Plugin Hooks Runtime** — `loadPluginHooks` sprint'te çağrılıyor ama hook sistemi limited.

---

## 29. `deckent archive-debt`

### Komut Tanımı
```
deckent archive-debt
```

Resolved debt item'larını `.brain/archive/DEBT-ARCHIVE.md`'ye taşır.

### Geliştirme Önerileri

1. **Tablo Parse Fragile** — Pipe-split, kolon sayısı hardcode (9).
2. **Git Integration Yok** — Dosya değişikliği commit edilmiyor.
3. **`--dry-run` Yok** — Preview yok.

---

---

# Detaylı Kaynak Kod İncelemeleri (Kalan Komutlar)

Aşağıdaki komutlar kaynak koddan satır satır incelenerek analiz edilmiştir.

---

## 17. `deckent sync` — Detaylı Analiz

### Kaynak: `src/cli/commands/sync.ts` (283 satır)

### İç Mekanizma

**Adım 1 — Adapter Sync:**
- `ensureDeckentImport(CLAUDE.md)` → dosyanın başına `@DECKENT.md` satırını ekler (yoksa)
- `ensureDeckentImport(AGENTS.md)` → aynı işlem
- Mevcut dosya içeriği korunur, sadece import satırı ensure edilir

**Adım 2 — Git Change Detection:**
```
getLastSprintTimestamp(root):
  .brain/sprints/ dizinindeki dosyaların mtime'ını karşılaştır
  → En son değiştirilen sprint dosyasının timestamp'ını döndür

getCommitsSince(root, since):
  git log --oneline --since={ISO timestamp}
  → Commit listesi

getChangedFiles(root, commitCount):
  git diff --name-status HEAD~{N} HEAD
  → M (modified), A (added), D (deleted), R (renamed) kategorize
```

**Adım 3 — MEMORY.md Güncelleme:**
```
writeSyncToMemory():
  "## Out-of-band Changes" section varsa → regex ile replace
  yoksa → append

  İçerik:
  - N commit(s) since Sprint #052
  - Modified: src/foo.ts, src/bar.ts
  - New: src/baz.ts
  - Deleted: old/removed.ts
```

### Kritik Detaylar

1. **Sprint timestamp mtime-based** — dosya sistemi mtime kullanıyor, git commit date değil. Dosya move/copy edilirse mtime değişir ve yanlış timestamp alınır.

2. **`HEAD~N` Overflow** — `getChangedFiles(root, commits.length)` commit sayısı kadar HEAD geri gidiyor. Eğer repo'da toplam commit commits.length'ten azsa git hata verir ama `status !== 0` ile sessizce geçilir.

3. **Regex Section Replace** — `sectionRegex = /## Out-of-band Changes[\s\S]*?(?=\n## |\n*$)/` — non-greedy match. Eğer "## Out-of-band Changes" son section ise ve sonrasında `\n## ` yoksa `\n*$` ile eşleşir. MEMORY.md'nin sonuna yeni section eklenirse eski out-of-band section düzgün silinir ama edge case'lerde fragile.

4. **Adapter sync GEMINI.md ve .cursor/rules yok** — Sadece CLAUDE.md ve AGENTS.md sync ediliyor. init'te Gemini ve Cursor dosyaları da oluşturuluyor ama sync'te atlanıyor.

### Geliştirme Önerileri

1. **mtime yerine git commit date kullanılmalı** — `git log -1 --format=%aI .brain/sprints/sprint-NNN.md`
2. **Çok fazla değişiklik → MEMORY.md şişmesi** — 100+ dosya değişmişse hepsini listeliyor. Limit veya kategorize edilmeli.
3. **`--json` flag yok** — Programmatic kullanım için.
4. **Gemini/Cursor adapter sync eksik** — init'te oluşturulan tüm adapter dosyaları sync edilmeli.
5. **Dry-run yok** — MEMORY.md'ye ne yazılacağını preview edemezsin.

---

## 18. `deckent run` — Detaylı Analiz

### Kaynak: `src/cli/commands/run.ts` (189 satır)

### İç Mekanizma

```
1. Model validation (ALL_MODELS listesine karşı)
2. createRunTaskId() → "run-{timestamp}-{counter}" (global counter)
3. buildRunTask() → Task objesi:
   - title: description'ın ilk 80 karakteri
   - scope: { directories: [scopeDir], filesRead: [], filesWrite: [] }
   - goNogo: generic criteria
4. Task JSON yaz → .tasks/task-run-{id}.json
5. ensureSession() → tmux
6. buildWorkerPrompt(task) → sprint-controller'daki prompt builder
7. spawnWorker() → tmux window
8. waitForRunResult() → 5 dakika timeout, 5 saniye polling
9. Sonuç göster + cleanupRunTask()
```

### Kritik Detaylar

1. **`buildWorkerPrompt(task)` kullanılıyor** — spawn komutundan farklı olarak düzgün prompt builder. Ama agent/skill context inject edilmiyor çünkü `resolveAgentPrompt` ve `resolveSkillPrompts` çağrılmıyor.

2. **Global counter `_runTaskCounter`** — Process içinde artan counter. Ama process restart'ta sıfırlanır. Aynı milisaniyede 2 run çağrılırsa farklı ID üretir (counter sayesinde).

3. **Cleanup her zaman yapılıyor** — Başarılı veya başarısız, task dosyaları silinir. Kullanıcı sonucu inceleyemez. `--keep` flag'i yok.

4. **[DONE] readJsonSafe lokal duplicate** — `src/core/utils.ts`'de aynı fonksiyon var ama run.ts kendi versiyonunu tanımlıyor. *Sprint 055: utils.ts'den import edildi.*

5. **autoApprove: false hardcode** — `deckent start --auto-approve` var ama `run`'da yok.

### Geliştirme Önerileri

1. **`--timeout` flag lazım** — 5 dakika hardcode. Opus ile karmaşık task 5 dakikada bitmez.
2. **`--keep` flag lazım** — Sonuç dosyalarını koruma.
3. **`--auto-approve` flag lazım** — Çalıştırma sırasında permission yönetimi.
4. **Agent/skill injection eksik** — `buildWorkerPrompt` agent/skill olmadan çağrılıyor.
5. **Multi-provider desteği yok** — Sadece tmux/Claude.
6. **`fs.watch` kullanılabilir** — 5s polling yerine event-driven.
7. **[DONE] readJsonSafe duplicate** — Import from utils.ts kullanılmalı. *Sprint 055: tüm 5 duplicate temizlendi.*
8. **`--verbose` flag** — Worker'ın canlı çıktısını gösterme (tail -f log).

---

## 19. `deckent test` — Detaylı Analiz

### Kaynak: `src/cli/commands/test-run.ts` (79 satır)

### İç Mekanizma

```
1. DIRECTIVES.md varlık kontrolü
2. loadConfig(root)
3. timeout parse (default 5 dakika, NaN check)
4. runSprint(root, config, { testMode: true, skipCleanup: opts.keep, timeoutMs })
5. NO_GO kontrolü → exit 1
6. formatSprintSummary(sprint)
```

**`testMode: true` ne değiştirir:**
- `finalizeSprint()` atlanır → MEMORY.md, RETRO.md, PROJECT-IDENTITY.md güncellenmez
- Decay çalışmaz
- Sprint log yazılmaz
- Ama planlama, spawn, execute, evaluate hepsi çalışır

### Kritik Detaylar

1. **`hasNoGo` çift kontrol** — `task.status === 'NO_GO' || sprint.metrics?.noGoTasks > 0` — ikisi de aynı şeyi kontrol ediyor. metrics task status'tan üretildiği için redundant. Ama edge case: metrics hesaplanmamışsa (testMode'da calculateMetrics hata atarsa) task status güvenli yol.

2. **`timeoutMs` runSprint'e geçiliyor** — Ama `RunSprintOptions` type'ında `timeoutMs` field'ı var mı kontrol edelim — evet, `waitForResults` fonksiyonuna geçiyor.

3. **Test sprint gerçek worker spawn ediyor** — Sandbox değil, gerçek tmux worker'lar çalışıyor. Projeyi değiştirebilirler. `--sandbox` flag'i veya git stash/restore ile korunmalı.

### Geliştirme Önerileri

1. **`--directives <file>` flag** — Proje DIRECTIVES yerine test-specific DIRECTIVES kullanma.
2. **`--sandbox` flag** — Worker'ların projeyi değiştirmemesi için git stash + restore.
3. **CI çıktı formatı** — JUnit XML, TAP, GitHub Actions annotations.
4. **`--model` override** — Tüm task'ları belirli modelle çalıştırma (maliyet kontrolü).
5. **Coverage threshold** — `--min-coverage 80` gibi başarı kriteri.

---

## 20. `deckent agent` — Detaylı Analiz

### Kaynak: `src/cli/commands/agent.ts` (222 satır)

### Veri Yapısı

```json
// .deckent/agents/{name}/agent.json
{
  "name": "typescript-expert",
  "type": "custom",
  "enabled": true,
  "model": "sonnet",
  "triggers": [],
  "description": "Custom agent: typescript-expert",
  "uses": 0,
  "successRate": 0,
  "createdAt": "2026-03-25T...",
  "updatedAt": "2026-03-25T..."
}
```

```markdown
// .deckent/agents/{name}/PROMPT.md
# Agent: typescript-expert
## Role
Describe what this agent specializes in.
## Instructions
- Follow project conventions
...
```

### Kritik Detaylar

1. **Name validation**: `/^[a-zA-Z0-9][a-zA-Z0-9-]*$/` + max 64 char. İlk karakter harf/rakam olmalı.

2. **`uses` ve `successRate` CLI'dan güncellenmiyor** — Sadece `sprint-controller.ts` içindeki `AgentPoolManager.updateAgentStats()` günceller. CLI'da `--stats` sütunları gösteriliyor ama değerler hep 0 kalabilir (agent activation henüz tam çalışmıyorsa).

3. **PROMPT.md template generic** — `{name}` placeholder'ı replace ediliyor ama Role, Instructions, Triggers bölümleri boş kalıyor. Interactive wizard olsa daha faydalı.

4. **[DONE] `agent delete` komutu yok** — Create, enable, disable var ama delete yok. Dosyayı manuel silmek gerekiyor. *Sprint 055: agent delete eklendi.*

5. **[DONE] `agent edit` komutu yok** — Agent config'i güncellemek için JSON dosyasını elle düzenlemek gerekiyor. *Sprint 055: agent edit eklendi.*

### Geliştirme Önerileri

1. **[DONE] `agent delete <name>` ekle** — Dizini sil + onay sor. *Sprint 055: agent delete komutu eklendi.*
2. **[DONE] `agent edit <name>` ekle** — Interactive: model, triggers, description güncelleme. *Sprint 055: agent edit --model/--description/--enable/--disable eklendi.*
3. **`agent stats <name>` ekle** — Belirli agent'ın sprint-by-sprint performansı.
4. **Trigger pattern wizard** — Create sırasında trigger keyword sorma.
5. **Model seçimi create'de** — Default sonnet yerine interactive seçim.
6. **systemPrompt alanı yok** — agent.json'da systemPrompt field'ı yok, sadece PROMPT.md var. PROMPT.md → systemPrompt eşlemesi `resolveAgentPrompt()`'ta yapılıyor.

---

## 21. `deckent skill` — Detaylı Analiz

### Kaynak: `src/cli/commands/skill.ts` (282 satır)

### Veri Yapısı

```json
// .deckent/skills/{id}/manifest.json
{
  "id": "testing-expert",
  "name": "testing-expert",
  "version": "1.0.0",
  "description": "Custom skill: testing-expert",
  "category": "general",
  "triggers": [],
  "enabled": true,
  "priority": 5,
  ...
}
```

### Git Install Akışı

```
1. isGitUrl(source) → https://, git://, git@, .git
2. git clone --depth 1 {source} .deckent/skills/.tmp-clone (30s timeout)
3. manifest.json var mı kontrol
4. validateManifest(data) → id, name, version string mi
5. Target dizin var mı + --force kontrolü
6. .git dizinini sil (clone'dan)
7. cpSync(tmp → target)
8. rmSync(tmp)
```

### Local Install Akışı

```
1. resolve(source) → absolute path
2. Kaynak dizin var mı kontrol
3. manifest.json oku + validate
4. Target dizin var mı + --force kontrolü
5. cpSync(source → target, recursive)
```

### Kritik Detaylar

1. **Manifest validation çok gevşek** — Sadece `id`, `name`, `version` string mi kontrol. `category`, `triggers`, `enabled` vb. kontrol edilmiyor. Malformed manifest kabul edilir.

2. **Git clone hata temizliği** — Clone başarısız olursa tmp dizin kalır (satır 202-203'te var ama clone hatası catch'te tmp silinmiyor — sadece manifest hatasında siliniyor). Aslında satır 210'da status check var, hatada return ediliyor ama tmp temizlenmemiyor.

3. **`--force` sadece git install'da soruluyor** — Local install'da da aynı kontrol var (satır 258-262 civarı).

4. **cpSync recursive** — Tüm dosyaları kopyalıyor, node_modules gibi büyük dizinler de kopyalanır.

### Geliştirme Önerileri

1. **Manifest Zod validation** — Gevşek type guard yerine Zod schema.
2. **Git clone tmp cleanup** — Her error path'te `.tmp-clone` silinmeli.
3. **node_modules exclude** — Git clone'da .gitignore işliyor ama local install'da node_modules kopyalanır.
4. **[DONE] `skill delete <name>` ekle**. *Sprint 055: skill delete komutu eklendi.*
5. **`skill update <name>` ekle** — Git source'u hatırlayıp re-clone.
6. **Checksum/integrity check** — İndirilen skill'in doğrulanması.
7. **[DONE] `skill enable/disable <name>` ekle** — Agent'ta var, skill'de yok. *Sprint 055: skill enable/disable eklendi.*

---

## 22. `deckent review` — Detaylı Analiz

### Kaynak: `src/cli/commands/review.ts` (174 satır)

### Auto-Review Karar Mantığı

```
autoReviewTask(result):
  result yok              → 'pending'
  DONE + tests pass       → 'approved'
  NO_GO                   → 'rejected'
  TECH_DEBT + tests pass  → 'approved'
  diğer                   → 'retry'   ← bu durum oluşur: DONE + tests fail
```

### ReviewState Persistence

`.tasks/review-{sprintId}.json` — task dizininde saklanır. `cleanup()` ile silinir.

### Kritik Detaylar

1. **`retry` decision gerçekten kullanılıyor** — DONE + testsPassed=false durumunda `retry` döner. Bu worker'ın "ben bitirdim" dediği ama testlerin geçmediği durum. Ama retry sonrası ne oluyor? Hiçbir komut retry decision'ı alıp task'ı tekrar çalıştırmıyor. Dead end.

2. **Review state `.tasks/`'te** — cleanup sonrası kaybolur. Sprint'in review durumu kalıcı değil.

3. **Manuel review yok** — `--auto` olmadan çalıştırınca sadece mevcut durumu gösterir, karar değiştirme imkanı yok. Interactive prompt (approve/reject her task için) olmalı.

4. **Review → finalize bağlantısı yok** — Review sonucu finalize'ı etkilemiyor. Review rejected olsa bile finalize hepsini kabul eder.

### Geliştirme Önerileri

1. **Interactive review modu** — Her task için approve/reject/retry prompt.
2. **Retry → respawn mekanizması** — Retry decision'ı worker'ı tekrar çalıştırsın.
3. **Review state kalıcı olsun** — `.brain/reviews/` veya sprint log'a ekle.
4. **Review → finalize entegrasyonu** — Rejected task'lar finalize'da NO_GO sayılsın.
5. **`--approve-all` / `--reject-all` shortcuts**.

---

## 23. `deckent finalize` — Detaylı Analiz

### Kaynak: `src/cli/commands/finalize.ts` (135 satır)

### İç Mekanizma

```
buildSprintFromTasks(root):
  1. .tasks/task-*.json → Task[] oku
  2. sprintId = tasks[0].sprintId
  3. .tasks/task-*.result → TaskResult[] oku
  4. Her task için evaluateResult(result, task) → evaluation
  5. Result yoksa → NO_GO

Sprint objesi oluştur:
  { id, number, status: COMPLETE, phase: COMPLETE, tasks, workers, completedAt }

finalizeSprint(root, sprint, evaluations, results, opts):
  1. calculateMetrics
  2. writeSprintLog → .brain/sprints/
  3. writeRetrospective → .brain/RETRO.md + MEMORY.md append
  4. Update PROJECT-IDENTITY.md
  5. Update last_sprint_id in config
  6. runDecay (if not --skip-decay)
  7. runHooks('afterSprint') (if not --skip-hooks)
```

### Kritik Detaylar

1. **Sprint tamamlanma kontrolü yok** — EXECUTING durumundaki task'lar da finalize edilir. Worker hâlâ çalışıyor olabilir.

2. **sprintId ilk task'tan** — `tasks[0]?.sprintId` — task yoksa `sprint-unknown`. Farklı sprint'lerdeki task'lar karışmışsa yanlış sprintId.

3. **[DONE] `readJsonSafe` lokal duplicate** — run.ts gibi burada da lokal tanım var. *Sprint 055: utils.ts'den import edildi.*

4. **evaluateResult import** — `sprint-controller.ts`'den import ediliyor, brain.ts re-export'undan değil. Direkt import doğru yaklaşım (ADR-008 uyumlu).

### Geliştirme Önerileri

1. **Sprint completion guard** — EXECUTING/CLAIMED task varsa uyar veya reddet.
2. **Mixed sprint detection** — Farklı sprintId'li task'lar varsa uyar.
3. **`--sprint <id>` flag** — Belirli sprint'i finalize et (task filter).
4. **Idempotency check** — Aynı sprint 2 kez finalize edilirse MEMORY.md'de duplicate learning oluşur (writeRetrospective header check var ama edge case'ler mümkün).

---

## 24. `deckent explain` — Detaylı Analiz

### Kaynak: `src/cli/commands/explain.ts` (204 satır)

### İç Mekanizma

```
1. findLatestSprintLog() → .brain/sprints/ dizininden sort().reverse()[0]
2. parseSprintLog(content) → regex ile metrics tablosu parse
3. parseSprintNumber(filename) → fallback (heading parse başarısızsa)
4. parseRetroLearnings(RETRO.md) → "## Learnings" section, max 3 item
5. buildExplainOutput(summary, learnings) → human-friendly text
```

### Çıktı Örneği

```
Sprint #052 Summary
━━━━━━━━━━━━━━━━━

Goal: No goal recorded

What happened:
  • 1 tasks completed successfully
  • 0 tasks failed (NO_GO)
  • 1 tasks completed with tech debt
  • Duration: 3m 38s

Key learnings:
  • Dashboard Full Expansion: GO_WITH_TECH_DEBT

Next: Run `deckent start` to continue, or `deckent plan` to see next sprint
```

### Kritik Detaylar

1. **Goal her zaman "No goal recorded"** — Sprint log'da goal bilgisi yazılmıyor. DIRECTIVES.md'den veya sprint title'dan alınabilir.

2. **`doneCount = completed + techDebt`** — Sprint log'da "Completed" ayrı, "Tech Debt" ayrı. Explain bunları topluyor. Doğru mantık: completed = DONE, techDebt = GO_WITH_TECH_DEBT.

3. **Max 3 learning** — `parseRetroLearnings` max 3 item alıyor. Sebebi çıktıyı kısa tutmak ama configurable değil.

4. **Unicode karakterler** — `\u2501` (━) ve `\u2022` (•) kullanılıyor. NO_COLOR desteği yok.

### Geliştirme Önerileri

1. **Goal bilgisi** — DIRECTIVES.md'den "## Goal" veya ilk heading'i al.
2. **`--sprint <id>` flag** — Belirli sprint'i explain et.
3. **`--verbose` flag** — Tüm learning'ler + dosya değişiklikleri.
4. **Dil desteği** — config.language kontrol edilmeli, Türkçe çıktı.
5. **`--json` flag**.

---

## 25. `deckent onboard` — Detaylı Analiz

### Kaynak: `src/cli/commands/onboard.ts` (173 satır)

### Wizard Adımları

```
1. Welcome + version
2. Claude CLI detection → version veya "not found"
3. System profile → CPU cores, RAM, recommended workers
4. Project analysis → name, language, package.json, tsconfig.json
5. Already initialized check → .deckent/ var mı
6. Wizard:
   - language: en/tr
   - mode: max_plan/pro_plan/max5x_plan
   - runInit: confirm
7. npx deckent init --force (30s timeout, stdio inherit)
8. Ready message
```

### Kritik Detaylar

1. **`api` mode seçimi yok** — Wizard'da 3 seçenek: max_plan, pro_plan, max5x_plan. API mode eksik.

2. **Wizard answer'ları init'e geçmiyor** — `npx deckent init --force` çağrılıyor ama language ve mode seçimleri argüman olarak geçilmiyor. Init tekrar interactive soracak (veya default kullanacak).

3. **Already initialized → init atlanıyor** — `.deckent/` varsa init çağrılmıyor. Ama kullanıcı re-onboard isteyebilir (config güncellemek için).

4. **Project detection sığ** — Sadece package.json ve tsconfig.json. analyzeProject() veya detectProjectStack() kullanılmıyor.

5. **Non-interactive TTY check** — `!process.stdin.isTTY` → otomatik non-interactive. CI ortamlarında doğru davranış.

### Geliştirme Önerileri

1. **Wizard answer'larını init'e geç** — `--mode max_plan --language tr` argümanları.
2. **`api` mode ekle** — Wizard seçeneklerine.
3. **detectProjectStack() kullan** — Daha zengin analiz.
4. **`--force` flag** — Already initialized olsa bile re-run.
5. **Provider detection** — Codex/Gemini kurulu mu göster, init wizard'ına bağla.

---

## 26. `deckent upgrade` — Detaylı Analiz

### Kaynak: `src/cli/commands/upgrade.ts` (100 satır)

### İç Mekanizma

```
compareVersions("1.2.3", "1.3.0"):
  [1,2,3] vs [1,3,0] → -1 (current < latest)

checkLatestVersion():
  npm view deckent version (15s timeout)
  → "1.3.0" veya null

runUpgradeInstall():
  npm install -g deckent@latest (60s timeout, stdio inherit)
  → true/false
```

### Kritik Detaylar

1. **Version compare doğru** — Segment-by-segment number karşılaştırma, 0 padding. `1.0` vs `1.0.1` → -1 (doğru). Ama `1.0.0-beta.1` → `Number("0-beta")` = NaN → karşılaştırma bozulur.

2. **npm view deckent** — Paket adı hardcode "deckent". Eğer paket ismi değişirse veya scoped package olursa (`@deckent/cli`) bozulur.

3. **Global install** — `npm install -g` — npx ile çalışan kullanıcı için yanlış. Local dev dependency olabilir.

4. **Rollback yok** — Install başarısız olursa veya yeni versiyon bozuksa geri dönüş yok.

### Geliştirme Önerileri

1. **Pre-release version desteği** — Semver library (semver npm) kullanılmalı.
2. **Install strategy detection** — Global mı, local mı, npx mi tespit et.
3. **Changelog göster** — `npm view deckent --json` ile changelog bilgisi.
4. **`--force` flag** — Aynı versiyon olsa bile reinstall.
5. **`--canary` / `--beta` flag** — Pre-release channel desteği.

---

## 27. `deckent plugin` — Detaylı Analiz

### Kaynak: `src/cli/commands/plugin.ts` (84 satır)

### Alt Komutlar

Thin wrapper — tüm iş `src/core/plugin.ts`'e delegate:
- `install <source>` → `installPlugin(source, pluginsDir)`
- `list` → `scanPlugins(root)`
- `info <dir>` → `loadPlugin(dir)`
- `create <name>` → `createPlugin(name, pluginsDir)`

### Kritik Detaylar

1. **`info <dir>` absolute path gerektirir** — Relative path'te çalışır mı belirsiz (resolve edilmiyor).

2. **`install` source types belirsiz** — npm, git, local destekleniyor ama hangi format? Kullanıcıya rehber yok.

3. **`uninstall` / `remove` yok** — Plugin kaldırma komutu eksik.

4. **Plugin hook sistemi** — `loadPluginHooks()` sprint'te çağrılıyor ama hangi hook'lar destekleniyor (`beforeSprint`, `afterTask`, `afterSprint`) burada açıklanmıyor.

### Geliştirme Önerileri

1. **`plugin remove <name>` ekle**.
2. **`plugin update <name>` ekle** — Source'u hatırlayıp reinstall.
3. **`plugin test <name>` ekle** — Plugin'in hook'larını dry-run test et.
4. **`info` relative path** — `resolveProjectRoot()` + relative path resolve.
5. **`--json` flag list'e** — Programmatic kullanım.

---

## 28. `deckent archive-debt` — Detaylı Analiz

### Kaynak: `src/cli/commands/archive-debt.ts` (103 satır)

### İç Mekanizma

```
1. DEBT.md oku
2. parseDebtRows(content) → header satırını bul, pipe-split, 9 kolon
3. Filter: resolved === 'true' → archive, diğerleri → keep
4. formatDebtTable(unresolved) → DEBT.md'ye yaz
5. mkdirSync(.brain/archive/)
6. DEBT-ARCHIVE.md yoksa → header + separator yaz
7. appendFileSync → resolved satırları ekle
```

### Tablo Formatı

```
| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
|----|-------------|------|--------|----------|------|----------|----------|---------|
| debt-052-001 | Missing tests | 052-001 | sprint-052 | HIGH | true | true | sprint-053 | 2026-03-25 |
```

### Kritik Detaylar

1. **Separator hardcode** — `'|----|-------------|------|--------|----------|------|----------|----------|---------|'` — kolon genişlikleri sabit. Eğer description uzunsa tablo bozulur (ama markdown'da sorun yok, sadece görsel).

2. **Header'ı `| ID |` ile buluyor** — `line.includes('| ID |')` ile header satırını tespit ediyor. Eğer description "ID" içerirse false positive olabilir (ama `| ID |` pattern'i spesifik enough).

3. **9 kolon zorunlu** — `cols.length < 9` → skip. DEBT.md formatı değişirse (kolon ekleme/kaldırma) tüm satırlar atlanır.

4. **Archive'a sadece append** — Hiçbir zaman archive temizlenmiyor. Proje ömrü boyunca büyür.

### Geliştirme Önerileri

1. **`--dry-run` flag** — Preview.
2. **Archive rotation** — Eski archive'ları tarih bazlı böl.
3. **`--before <sprint>` flag** — Belirli sprint öncesi resolved'ları arşivle.
4. **parseDebtTable ile tutarlılık** — `debt-manager.ts`'de de `parseDebtTable()` var. İki ayrı parser tutarsızlık riski.
5. **`--count` flag** — Sadece kaç tane arşivlenecek göster.

---

## Toplam İstatistikler

| Metrik | Değer |
|--------|-------|
| Toplam CLI komutu | 31 (+ alt komutlar) |
| İncelenen komut | 29 |
| Toplam geliştirme önerisi | ~180 |
| Kritik bug | ~~2~~ 0 (Sprint 055'te fix edildi: retro parse uyumsuzluğu, compare yanlış dosya) |
| Dead code | 3 (loadLearningData, --sandbox-mode, review retry) |
| Format tutarsızlığı | ~~4~~ 3 (Sprint 055'te retro format fix edildi) |
| Provider uyumsuzluğu | 5 komut (spawn, kill, attach, watch, run) tmux-only |
| Sprint 055'te çözülen | 22 öneri (2 P0 bug, 9 DRY, 5 fonksiyonel, 6 CRUD/flag) |
