## Sprint sprint-126 Learnings
- FIX Fazı Evaluations Map Update — CRITICAL Bug Fix: NO_GO — FIX fazı evaluations Map güncelleme bug'ı düzeltildi. runFixPhase() içinde fixEval hesaplandıktan sonra evaluations.set(
- evaluateResult() → evaluateWithRubric() Geçişi: NO_GO — Bash tool unavailable — tsc --noEmit ve vitest run çalıştırılamadı. Kod değişiklikleri tamamlandı: (1) evaluateWithRubri
- CI Guardian Granularity — Task-Spesifik tsc Kontrolü: NO_GO — Bash tool unavailable (session-env ENOENT) — tsc ve vitest çalıştırılamadı. Tüm kod değişiklikleri tamamlandı: (1) parse
- Context-Aware Evaluation — Bash Unavailable Toleransı: NO_GO — Bash tool unavailable — session-env ENOENT prevented running tsc --noEmit and vitest. Code changes applied correctly: (1
- Sprint Metrics Post-FIX Doğrulama + Debug Logging: NO_GO — Sprint Metrics Post-FIX Doğrulama + Debug Logging tamamlandı. Değişiklikler: (1) sprint-reporter.ts calculateMetrics() f
## Sprint sprint-127 Learnings
- Promotion Pipeline Guard Doğrulaması: GO_WITH_TECH_DEBT — Promotion Pipeline Guard test dosyası oluşturuldu. 4 test yazıldı: (1) promote() built-in agent için false döner, (2) de
## Sprint sprint-128 Learnings
- Rubric-Based Grading Doğrulaması: DONE — Sistem tam implemente, 85/85 test geçti. evaluateWithRubric() hem EVALUATE hem FIX fazında kullanılıyor.
- Worker Question Mechanism Doğrulaması: GO_WITH_TECH_DEBT — IPC + file-based fallback çalışıyor, 63/63 test geçti. askBrain() hybrid approach.
- deckent_explain MCP Tool Doğrulaması: DONE — Tool tam çalışıyor, 43 test geçti. debt-125-003-fix resolved.
- DEBT.md Parse Hatası Düzeltmesi: DONE — JSON.parse(debtRaw) → parseDebtTable(debtRaw) değiştirildi. 5 yeni test, 278 toplam geçti.
- Evaluator Tutarlılık Reformu: DONE — sprint-phases.ts zaten evaluateWithRubric() kullanıyor. evaluateResult() @deprecated yapıldı. 5 yeni test.
- FIX Fazı Map Mutation Doğrulaması: DONE — sprint-phases.ts satır 510-512 doğru çalışıyor, bug yok. 5 yeni test yazıldı.
- Documentation Sync: NO_GO — Docker worker timeout. debt-125-004-fix manuel kapatıldı.
## Sprint sprint-129 Learnings
## Sprint sprint-132 Learnings
## Sprint sprint-133 Learnings
- HTTP API Bearer Token Auth: GO_WITH_TECH_DEBT — HTTP API Bearer Token Authentication implemented. Changes:

1. NEW FILE: src/api/auth.ts — bearerAuthMiddleware with res
- loadConfig() Module-Level Cache: GO_WITH_TECH_DEBT — loadConfig() module-level cache implemented. Changes: (1) Added module-level cachedConfig/cacheStamp/cachedProjectRoot v
- Sprint 131 ADR'leri Yazımı (ADR-029..032): GO_WITH_TECH_DEBT — 4 ADR yazıldı (ADR-029 through ADR-032), her biri ≥50 satır. ADR-029 (51 lines): Managed-Docs Universalization — kullanı
- Competitive Analysis Güncelleme: GO_WITH_TECH_DEBT — Competitive analysis fully updated for April 2026. Changes: (1) competitive-analysis.md — title updated 'March 2026' → '