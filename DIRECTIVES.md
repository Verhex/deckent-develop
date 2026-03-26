# DIRECTIVES — Sprint 065: CLI Kalan Eksikler (Doğrulanmış)

## Goal: Sprint 063-064'te implement EDİLMEMİŞ maddeleri tamamla. Sadece grep/read ile doğrulanmış eksikler. cli-deep-analysis final update.

---

## Task 1: plan — AI Planner Timeout Configurable
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/planner.ts, src/core/config-types.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
**A) AI Planner Timeout Configurable:** planner.ts'de AI çağrısında timeout yok. `config.ai_planner_timeout ?? 60000` ms olarak configurable yap. config-types.ts'ye `ai_planner_timeout?: number` ekle.

**Test:** 3+ test

---

## Task 2: config — autoMigrateOnLoad + Modes Nesting
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/core/config.ts, src/core/config-migration.ts
- Scope: src/core/, tests/core/

### Description
**A) autoMigrateOnLoad:** loadConfig() içinde needsMigration() kontrol → otomatik migration çalıştır. Şu an config.ts'de bu yok.

**B) Migration modes Nesting:** config-migration.ts'de mode field'ları (brain_planning vs) algılansın, mode nesting migration'a dahil edilsin.

**Test:** 4+ test

---

## Task 3: cleanup — Çift Geçiş, Sahte Sprint, destroy Session, .gitignore
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/cleanup.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
**A) Task Dosyası Çift Geçiş Fix:** cleanup.ts'de task dosyaları 2 kez taranıyor olabilir. Tek geçişe indir.

**B) Sahte Sprint Objesi Kaldır:** CLI'daki yapay Sprint nesnesi → gerçek task dosyalarından oluştur.

**C) destroy() Sadece Kendi Session:** Şu an hardcoded `deckent-orchestra`. tmux session adını config/sprint'ten al, diğer projelerin session'larını etkilemesin.

**D) Archive .gitignore Fix:** .brain/archive/ dizini git'te takip edilsin. `.gitignore`'da `!.brain/archive/` exception ekle.

**Test:** 6+ test

---

## Task 4: spawn — Scope Enforcement + Multi-Provider
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/spawn.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
**A) spawn Scope/AllowedTools:** Worker'a scope boundary enforcement. Task scope'dan allowedTools listesi üret ve worker prompt'una inject et.

**B) spawn Multi-Provider:** Codex/Gemini provider ile spawn. adapter.spawn() kullan, sadece claude tmux değil.

**Test:** 4+ test

---

## Task 5: analyze — Wrapper Birleştirme + Monorepo
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/core/analyzer.ts, src/core/stack-detector.ts
- Scope: src/core/, tests/core/

### Description
**A) İki Analiz Motoru Birleştir:** analyzer.ts → stack-detector.ts wrapper. analyzer.ts analyzeProject() stack-detector detectProjectStack() üzerinden çağırsın, duplicated logic kaldırılsın.

**B) Monorepo/Multi-Language:** Root dışı package.json'ları tara, birden fazla dil algıla. Sadece dashboard sub-project check var, genelleştir.

**Test:** 4+ test

---

## Task 6: history Trend + retro Archive
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/history.ts, src/cli/commands/retro.ts, src/orchestra/sprint-reporter.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
**A) History Trend Analizi:** Son 5 sprint'in success rate/coverage trend'ini hesapla ve göster. Şu an history.ts'de trend yok.

**B) Retro Arşivleme:** RETRO.md overwrite öncesi `.brain/archive/retro-sprint-NNN.md` olarak arşivle. Şu an retro.ts'de archive mekanizması yok.

**Test:** 4+ test

---

## Task 7: Dokümantasyon — CHANGELOG/SPRINT-LOG Restore + cli-deep-analysis Final
- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Files: docs/CHANGELOG.md, docs/SPRINT-LOG.md, docs/analysis/cli-deep-analysis.md
- Scope: docs/

### Description
**A) Sprint 055-056 CHANGELOG Entry:** Git history'den (git log) bilgileri alarak CHANGELOG.md'ye entry oluştur.

**B) Sprint 055-056 SPRINT-LOG Entry:** MEMORY.md özet bilgilerinden SPRINT-LOG.md'ye entry oluştur.

**C) cli-deep-analysis.md Final:** Bu sprint'te ve önceki sprint'lerde çözülen tüm önerileri [DONE] olarak işaretle. İstatistik tablosunu güncelle. "CLI TAMAMLANDI" kapanış notu ekle.

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression
- %100 GO hedefli — NO_GO KABUL EDİLMEZ
