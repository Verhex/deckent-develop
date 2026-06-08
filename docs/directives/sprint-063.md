# DIRECTIVES — Sprint 063: CLI %100 Tamamlama (43 Kalan Öneri + Dokümantasyon)

## Goal: cli-deep-analysis.md'deki kalan 43 açık öneriyi TAMAMEN çöz. 190/190 = %100. Sprint 055-056 CHANGELOG/SPRINT-LOG entry'lerini restore et. CLI tarafı bu sprint ile KAPANACAK.

---

## Task 1: init Kalan — Build/Test Dinamik + Çift Çağrı + --env Çakışma
- Model: sonnet
- Effort: high
- Files: src/cli/commands/init.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
3 kalan init önerisi:

**A) DECKENT.md Build/Test Dinamik:** `Build: tsc`, `Test: npx vitest run` hardcode. `analyzeProject()` sonucundan (buildTool, testFramework) al ve DECKENT.md'ye yaz.

**B) İkinci analyzeProject() Çift Çağrı Kaldır:** init.ts'de analyzeProject() 2 kez çağrılıyor. İlk çağrının sonucunu (detectedAnalysis) ikinci yerde kullan.

**C) --env ve Otomatik Detect Çakışması:** Her ikisi de env dosya oluşturabilir. Mevcut env dosya varsa uyar: "Environment file already exists. Overwrite? (use --force)"

**Test:** 6+ test

---

## Task 2: plan Kalan — Timeout, Parser, Safeguard, Logging, Default, Truncation
- Model: opus
- Effort: high
- Files: src/orchestra/planner.ts, src/orchestra/task-builder.ts, src/orchestra/sprint-controller.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
6 kalan plan önerisi:

**A) AI Planner Timeout Configurable:** 60s hardcode → `config.ai_planner_timeout ?? 60000` ms.

**B) Structured Parser Bullet/Prose:** Sadece `## Task N:` değil, `- Task:` veya numaralı liste de parse edebilsin.

**C) Auto Mode Fazla Task Safeguard:** AI planner DIRECTIVES task sayısının 2x'inden fazla üretirse uyar ve fallback.

**D) Agent/Skill Selection Hata Loglaması:** Sessiz catch → `debugLog('Agent selection failed: ${reason}')`.

**E) Usage Safe Default:** Başarısız olunca %50 yerine 'unknown' dön, sprint boyutunu etkilemesin.

**F) Context Truncation Önceliklendirme:** DIRECTIVES > MEMORY > DEBT > PATTERNS sırasıyla truncate et.

**Test:** 8+ test

---

## Task 3: start Kalan — Sandbox, Zero-Config, Fix Timeout, Queue, Usage, Watch, Phase
- Model: opus
- Effort: high
- Files: src/cli/commands/start.ts, src/orchestra/sprint-controller.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
7 kalan start önerisi:

**A) --sandbox-mode Gerçek İmplementasyon:** `git stash` + sprint çalıştır + `git stash pop`. Worker'lar stash üzerinde çalışır.

**B) Zero-Config DIRECTIVES Çakışma:** Mevcut DIRECTIVES.md varken zero-config kullanılırsa uyar.

**C) Fix Phase Timeout Configurable:** 10dk hardcode → `config.fix_phase_timeout ?? 600000`.

**D) Queue Spawn Hata Loglaması:** Spawn hatası sessizce geçilmesin, hata logla.

**E) Dashboard Final Update Gerçek Usage:** Sprint bittiğinde `fiveHourPercent: 0` yerine son gerçek usage yaz.

**F) --watch Subprocess Alternatifi:** tmux yoksa worker log dosyasını tail et.

**G) Phase Arası Durum Kaybı:** `.deckent/sprint-state.json` → phase kaydı + restart'ta orphan detection.

**Test:** 10+ test

---

## Task 4: status Kalan — Regex, Stale, Budget, Alert
- Model: sonnet
- Effort: high
- Files: src/cli/commands/status.ts, src/cli/helpers/output.ts
- Scope: src/cli/commands/, src/cli/helpers/, tests/cli/

### Description
4 kalan status önerisi:

**A) readSprintMeta Toleranslı Regex:** Çok spesifik format → daha gevşek regex.
**B) Progress Stale Uyarı:** Dashboard 30s, task dosyaları anlık → tutarsızlık varsa uyar.
**C) Budget Gerçek Kontrol:** "Budget: OK" hardcode → gerçek countBrainLines() ile kontrol.
**D) Alert Detayı:** Sadece sayı değil, alert mesajlarını göster.

**Test:** 6+ test

---

## Task 5: doctor Kalan — Memory Dedup, Debt Cache, ErrorRegistry, Permission, Subscription
- Model: sonnet
- Effort: high
- Files: src/cli/commands/doctor.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
5 kalan doctor önerisi:

**A) Memory Bilgisi Tekrarlama Kaldır:** "Your Project" ve "System Health" aynı veri → birini kaldır.
**B) countOpenDebtItems Tekrar Okuma:** checkDebt() sonucunu cache'le, tekrar dosya okuma.
**C) Error Registry Tutarlılık:** Tüm check'ler ErrorRegistry kullansın.
**D) Disk/Permission Check:** .tasks/ ve .brain/ yazma izni kontrolü.
**E) detectSubscription Mode Uyumluluk:** Ana doctor'da mode uyumluluk kontrolü.

**Test:** 6+ test

---

## Task 6: retro Kalan — Parse Fix, Learnings Kalite, Arşivleme
- Model: sonnet
- Effort: high
- Files: src/cli/commands/retro.ts, src/orchestra/sprint-reporter.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
3 kalan retro önerisi:

**A) Sprint Log Parse Fragile Fix:** Header format toleransı artır.
**B) Learnings Kalitesi:** result.notes'u MEMORY.md learnings'e dahil et.
**C) Retro Arşivleme:** Overwrite öncesi `.brain/archive/retro-sprint-NNN.md` olarak arşivle.

**Test:** 6+ test

---

## Task 7: cleanup Kalan — Çift Geçiş, Sahte Sprint, destroy, Decay, Parse, .gitignore
- Model: sonnet
- Effort: high
- Files: src/cli/commands/cleanup.ts, src/orchestra/debt-manager.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
6 kalan cleanup önerisi:

**A) Task Dosyası Çift Geçiş Fix:** Tek geçişe indir.
**B) Sahte Sprint Objesi Kaldır:** CLI'daki yapay Sprint → gerçek task'lardan oluştur.
**C) destroy() Sadece Kendi Session:** tmux session adı kontrolü, diğer projeleri etkilemesin.
**D) Decay Truncation İyileştirme:** Sprint başlıklarını koru, detayları kırp.
**E) Decay Sprint Number Parse Toleranslı:** "## Sprint 1-5 Özet" formatını da tanı.
**F) Archive .gitignore Fix:** .brain/archive/ git'te takip edilsin.

**Test:** 8+ test

---

## Task 8: usage + history Kalan — Canlı Usage, Subscription, Trend, Format, İçerik
- Model: sonnet
- Effort: high
- Files: src/cli/commands/usage.ts, src/cli/commands/history.ts, src/orchestra/sprint-reporter.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
5 kalan usage+history önerisi:

**A) Canlı Usage (5hr/weekly) Göster:** checkUsageWithProvider() sonucunu usage çıktısına ekle.
**B) Subscription Modda Rate Limit Bilgisi:** Maliyet yerine kullanım yüzdesi.
**C) History Trend Analizi:** Son 5 sprint success rate/coverage trendi.
**D) History Parse ↔ Write Format Tutarlılık:** header naming eşleştir.
**E) Sprint Log İçeriği Zenginleştirme:** Dosya değişiklik sayısı, süre, hata detayları.

**Test:** 8+ test

---

## Task 9: config Kalan — autoMigrate, Modes, Validation
- Model: sonnet
- Effort: high
- Files: src/cli/commands/config.ts, src/core/config.ts, src/core/config-migration.ts
- Scope: src/cli/commands/, src/core/, tests/

### Description
3 kalan config önerisi:

**A) autoMigrateOnLoad İmplementasyonu:** loadConfig() içinde needsMigration() kontrol → otomatik migration.
**B) Migration modes Nesting Fix:** Yeni mode field'ları algılansın, mode nesting'i migration'a dahil.
**C) Validation Hata Mesajı İyileştirme:** "Invalid value 'xyz' for field 'mode'. Valid: max_plan, pro_plan, ..."

**Test:** 6+ test

---

## Task 10: spawn/kill + attach/watch Kalan — Scope, Subprocess, Multi-Provider, Watch
- Model: opus
- Effort: high
- Files: src/cli/commands/spawn.ts, src/cli/commands/kill.ts, src/cli/commands/attach.ts, src/cli/commands/watch.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
7 kalan spawn/kill/attach/watch önerisi:

**A) spawn Scope/AllowedTools:** Worker'a scope boundary enforcement. allowedTools listesini task scope'dan üret.
**B) kill Subprocess Worker:** PID-based kill. Process.kill() ile subprocess worker'ı durdur.
**C) spawn Multi-Provider:** Codex/Gemini adapter.spawn() kullan.
**D) Watch Dashboard Formatlanmış:** cat .dashboard yerine formatlanmış output.
**E) Heartbeat Panel İyileştirme:** ls -la yerine heartbeat içeriğini göster.
**F) tmux Bağımlılığı Subprocess Alt:** Log dosyası tail ile izle.
**G) Terminal Durumu:** tmux detach sonrası cursor/renk reset.

**Test:** 8+ test

---

## Task 11: analyze Kalan — Birleştirme, Git Fallback, Cache, LOC, Monorepo, Dep Cap
- Model: opus
- Effort: high
- Files: src/core/analyzer.ts, src/core/stack-detector.ts
- Scope: src/core/, tests/core/

### Description
8 kalan analyze önerisi:

**A) İki Analiz Motoru Birleştir:** analyzer.ts → stack-detector.ts wrapper.
**B) Git Bağımlılık fs Fallback:** Git repo yoksa readdirSync ile dosya say.
**C) Analyzer Cache:** .deckent/analyzer-cache.json (staleness: package.json mtime).
**D) Metodoloji LOC/Complexity:** Dosya sayısı yerine satır sayısı ile ölç.
**E) Monorepo/Multi-Language:** Birden fazla dil algıla.
**F) Alt Dizin package.json:** Root dışındaki package.json'ları tara.
**G) Dependency Cap 50 → 200:** İlk 50 yerine 200 dep sakla.
**H) Config Önerisi:** Tespit sonucundan actionable öneri üret.

**Test:** 10+ test

---

## Task 12: Küçük Komut Kalan — dashboard/sync/run/test/agent/skill/marketplace/explain
- Model: sonnet
- Effort: high
- Files: src/cli/commands/dashboard.ts, src/cli/commands/sync.ts, src/cli/commands/run.ts, src/cli/commands/test-run.ts, src/cli/commands/agent.ts, src/cli/commands/skill.ts, src/cli/commands/skill-marketplace.ts, src/cli/commands/explain.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
10 kalan küçük komut önerisi:

**A) Dashboard/Status Duplikasyon Çözümü:** Dashboard'u status --raw'a yönlendir veya ortak logic paylaş.
**B) Sync MEMORY.md Section Replace Fragile Fix:** Regex → daha toleranslı parser.
**C) Sync Sprint Yoksa Silent Fix:** Son sprint yoksa uyarı ver.
**D) Run Polling → fs.watch:** 5s polling yerine fs.watch.
**E) Run Heartbeat Monitoring:** result-based yerine heartbeat izle.
**F) Test --min-coverage Flag:** `--min-coverage 80` başarı kriteri.
**G) Agent Interactive Wizard:** create sırasında prompt/trigger sor.
**H) Skill Git Clone Timeout + Manifest Validation + Tmp Cleanup:** 30s timeout artır, Zod validation, tmp dizin temizle.
**I) Marketplace Publish Author Validation:** manifest.json'da author zorunlu.
**J) Explain --verbose Flag:** Tüm learnings + dosya değişiklikleri göster.

**Test:** 10+ test

---

## Task 13: review/finalize/onboard/upgrade/plugin/archive-debt Kalan
- Model: sonnet
- Effort: high
- Files: src/cli/commands/review.ts, src/cli/commands/finalize.ts, src/cli/commands/onboard.ts, src/cli/commands/upgrade.ts, src/cli/commands/plugin.ts, src/cli/commands/archive-debt.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
8 kalan komut önerisi:

**A) Review State Kalıcılık:** .brain/reviews/review-sprint-NNN.json olarak sakla.
**B) Finalize --sprint Flag:** Belirli sprint'i finalize et.
**C) Onboard API Mode:** Wizard seçeneklerine api ekle.
**D) Onboard Provider Detection:** Codex/Gemini kurulu mu göster.
**E) Upgrade Changelog Göster:** npm view ile changelog bilgisi.
**F) Plugin test/info/--json:** plugin test, info relative path, --json list flag.
**G) Archive-debt --count Flag:** Kaç tane arşivlenecek göster.
**H) Archive-debt parseDebtTable Tutarlılık:** Shared util kullan.

**Test:** 8+ test

---

## Task 14: Dokümantasyon Restore + cli-deep-analysis Final
- Model: sonnet
- Effort: high
- Files: docs/CHANGELOG.md, docs/SPRINT-LOG.md, docs/analysis/cli-deep-analysis.md
- Scope: docs/

### Description
**A) Sprint 055-056 CHANGELOG Entry:** Git history'den bilgileri alarak entry oluştur.
**B) Sprint 055-056 SPRINT-LOG Entry:** MEMORY.md özet bilgilerinden oluştur.
**C) cli-deep-analysis.md Final:** Bu sprint'te çözülen 43 öneriyi [DONE] olarak işaretle. İstatistik tablosunu güncelle: 190/190 = %100. "CLI TAMAMLANDI" kapanış notu ekle.

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression (11,500+ test geçmeli)
- cli-deep-analysis.md: 190/190 [DONE] = %100
- CHANGELOG + SPRINT-LOG: Sprint 055-063 tüm entry'ler mevcut
- %100 GO hedefli — NO_GO KABUL EDİLMEZ
