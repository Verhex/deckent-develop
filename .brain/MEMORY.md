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
## Sprint sprint-135 Learnings
- Docker Backend Graceful Shutdown (Docker Bug Offensive Root Cause Fix): GO_WITH_TECH_DEBT — Docker graceful shutdown offensive root cause fix implemented. Changes: (1) spawn-backend-docker.ts kill() method: docke
- askBrain() Extraction Finish — Conservative Move + Re-Export Shim: NO_GO — Docker worker exited without writing result file
- Structured Planner Priority + Dependencies Parsing: GO_WITH_TECH_DEBT — parseStructuredDirectives() and parseBulletOrNumberedTasks() now parse '- Priority: CRITICAL|HIGH|NORMAL|LOW' lines. New
- GO_WITH_GATE_FAILURE Status Propagation Wire: GO_WITH_TECH_DEBT — GO_WITH_GATE_FAILURE status propagation wire implemented:
1. Added `import { getRecentSprintStats, GO_WITH_GATE_FAILURE 
- Dashboard vs MCP State Divergence Fix: NO_GO — Created src/monitor/sprint-state.ts with getCurrentSprintId() that reads .deckent/sprint-state.json (source 1: sprint-ac
- Brain Memory Budget Enforcement + Config Sync: GO_WITH_TECH_DEBT — Brain Memory Budget Enforcement + Config Sync tamamlandı. (1) DECAY_EXEMPT constant: DECISIONS.md ve PROJECT-IDENTITY.md