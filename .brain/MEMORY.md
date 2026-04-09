## Sprint sprint-100 Learnings
- Config Ölü Alan Temizliği: NO_GO — A) config.json legacy modları (max_plan, max5x_plan, pro_plan) zaten yoktu — Sprint 097'de temizlenmiş. B) config.json'd
- Constants→Config Entegrasyonu: NO_GO
- Dashboard CONFIG_FIELDS Güncelleme: NO_GO — Edit/Write tool permissions denied in don't-ask mode. Cannot modify ConfigPage.tsx without file write permissions. All p
- Init Wizard İyileştirme: NO_GO — Init wizard genişletildi — 15+ yeni config alanı eklendi.

A) CLI init config bloğuna 10 yeni alan eklendi: routing_engi
- Worker Result Yazma Güvenilirliği — tmux Timeout + Fallback: NO_GO
- Sprint Status + Dashboard Stale Data Fix: NO_GO
## Sprint sprint-101 Learnings
- Fix debt: Tech debt from 098-001: buildAgentPerformance() ve buildSkillPerformance() zaten: NO_GO — Edit/Write tool permissions denied in don't-ask mode. Root cause fully analyzed: (1) handleEvaluation() in debt-manager.
- Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp: GO_WITH_TECH_DEBT — debt-098-002 already fully resolved. collectSprintFiles() in sprint-reporter.ts (line 2051) reads both .brain/sprints/ a
- Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa: GO_WITH_TECH_DEBT — Fixed debt-098-004: (A) Removed obsolete 'Usage-Aware Planning' from Key Features in both README.md and README-TR.md — u
- Sprint Singleton + Lock Mekanizması: NO_GO — Edit/Write tool permissions denied in don't-ask mode. Cannot modify sprint-controller.ts, start.ts, or MCP start.ts with
- Brain Evaluate Fix — Result Dosyalarını Doğru Oku: NO_GO
- Zombie Process Koruması + tmux Cleanup: NO_GO — Edit/Write tool permissions denied in don't-ask mode. Cannot modify sprint-controller.ts, start.ts, or cleanup.ts withou
- Prompt Dosyası Lifecycle Düzeltme: NO_GO — Edit and Write tools denied in don't-ask mode. Cannot modify source files. Two changes needed: (1) cleanupDraftTasks() —
- CLI/MCP Start Parity — Davranış Eşitliği: NO_GO
## Sprint sprint-102 Learnings
- Fix debt: Tech debt from 098-001: buildAgentPerformance() ve buildSkillPerformance() zaten: NO_GO — Worker timeout — process exceeded time limit and was killed
- Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp: NO_GO — Worker timeout — process exceeded time limit and was killed
- Fix debt: Tech debt from 098-003: ANALYSIS-2026-04-02.md Sprint 097 sonuçlarıyla güncellen: NO_GO — Worker timeout — process exceeded time limit and was killed
- Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa: NO_GO — Worker timeout — process exceeded time limit and was killed
- Fix debt: Tech debt from 098-005: Modül sayıları güncellendi: orchestra/ 47→49, core/ 50→5: NO_GO — Worker timeout — process exceeded time limit and was killed
- Docker Smoke Test: NO_GO — Worker timeout — process exceeded time limit and was killed
## Sprint sprint-103 Learnings
- Fix debt: Tech debt from 098-001: buildAgentPerformance() ve buildSkillPerformance() zaten: NO_GO — Edit/Write tool permissions denied in don't-ask mode. Root cause fully analyzed: handleEvaluation() in debt-manager.ts:1
- Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp: GO_WITH_TECH_DEBT — debt-098-002 is already fully resolved in code. collectSprintFiles() in sprint-reporter.ts (line 2051-2077) reads both .
- Fix debt: Tech debt from 098-003: ANALYSIS-2026-04-02.md Sprint 097 sonuçlarıyla güncellen: GO_WITH_TECH_DEBT — ANALYSIS-2026-04-02.md güncellendi: (1) Bölüm I tablosu Sprint 102+, orchestra 49, core 50, kaynak 799+ olarak düzeltild
- Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa: GO_WITH_TECH_DEBT — Sprint badge sayıları 101+ → 102+ olarak güncellendi: README.md (satır 5), README-TR.md (satır 7), IDENTITY.md (satır 12
- Fix debt: Tech debt from 098-005: Modül sayıları güncellendi: orchestra/ 47→49, core/ 50→5: GO_WITH_TECH_DEBT — debt-098-005 resolved: (A) CLAUDE.md orchestra/ module count 63→65, (B) PROJECT-IDENTITY.md orchestra/ 63→65, Test Count
- Docker Backend Integration Test: GO_WITH_TECH_DEBT — Docker Backend Integration Test yazıldı. 7 test, hepsi geçiyor. Test tasarımı: DockerSpawnBackend'in claude CLI'nin test
- Docker Backend Kullanım Rehberi: GO_WITH_TECH_DEBT — Created docs/guide/docker-backend.md (362 lines). Covers: (1) Overview with backend comparison table, (2) Prerequisites 
## Sprint sprint-104 Learnings
- README Docker Backend Bolumu: NO_GO — Worker timeout — process exceeded time limit and was killed
- Version Bump + CHANGELOG: NO_GO — Worker timeout — process exceeded time limit and was killed
- CLI/MCP Start Parity Duzeltme: NO_GO — Worker timeout — process exceeded time limit and was killed
- Docker Sprint Canli Dogrulama: NO_GO — Worker timeout — process exceeded time limit and was killed
## Sprint sprint-105 Learnings
## Sprint sprint-106 Learnings
- Auditor Edge Test Fix: GO_WITH_TECH_DEBT — Root cause: debugLog() → appendToErrorsFile() calls readFileSync('.brain/ERRORS.md') when an ENOENT is thrown inside rea
- Pattern Reader Test Fix: GO_WITH_TECH_DEBT — Root cause: debugLog() -> appendToErrorsFile() -> readFileSync(errorsPath) was consuming mockReturnValueOnce queue entri
## Sprint sprint-107 Learnings
- CLI Smoke Dosyalari: GO_WITH_TECH_DEBT — docs/cli-smoke/ dizini oluşturuldu. 3 markdown dosyası (a.md, b.md, c.md) DIRECTIVES formatına uygun olarak oluşturuldu.
- Vitest Kontrolu: GO_WITH_TECH_DEBT — Created tests/smoke/cli-smoke.test.ts with 3 existsSync-based smoke tests. All 3 pass: docs/cli-smoke/a.md, b.md, c.md v
## Sprint sprint-108 Learnings
- Tmux Smoke Dosyalari: GO_WITH_TECH_DEBT — docs/tmux-smoke/ dizini oluşturuldu. 3 markdown dosyası (x.md, y.md, z.md) DIRECTIVES formatına uygun olarak oluşturuldu
- Tmux Smoke Test Dosyasi: GO_WITH_TECH_DEBT — Created tests/smoke/tmux-smoke.test.ts with 3 existsSync-based smoke tests. All 3 pass: docs/tmux-smoke/x.md, y.md, z.md
## Sprint sprint-119 Learnings
- Docker Verification Files: NO_GO — Docker worker exited without writing result file
## Sprint sprint-120 Learnings
- MCP Docker Test Dosyasi: NO_GO — Docker worker exited without writing result file
## Sprint sprint-121 Learnings
- CLI Docker Test Dosyasi: GO_WITH_TECH_DEBT — docs/docker-smoke/cli-test.md olusturuldu. Icerigi: '# CLI Docker Test\nSprint 121 — Docker backend CLI ile dogrulandi.'
## Sprint sprint-122 Learnings
- MCP Reconnect Test Dosyasi: GO_WITH_TECH_DEBT — docs/docker-smoke/mcp-ok.md olusturuldu. Icerik: '# MCP Docker OK\nSprint 122 — Docker backend MCP reconnect sonrasi dog
## Sprint sprint-123 Learnings
- Hybrid Backend ADR Yazımı: GO_WITH_TECH_DEBT — ADR-027 (Hybrid Spawn Backend) .brain/DECISIONS.md dosyasına eklendi. Karar: Hibrit backend DEFERRED — auditor zaten in-
- Heartbeat Tipine Backend Alanı Ekle: GO_WITH_TECH_DEBT — Changes applied successfully:
1. src/core/monitoring-types.ts — Heartbeat interface'e `backend?: 'docker' | 'tmux' | 'su
- Dashboard WorkerCard Backend Badge: GO_WITH_TECH_DEBT — AgentInfo tipine backend?: 'docker' | 'tmux' | 'subprocess' alanı eklendi. WorkerCard bileşenine BACKEND_BADGE mapping v
## Sprint sprint-124 Learnings
- Context Estimator — Task Scope Token Tahmini: GO_WITH_TECH_DEBT — Task 124-001 completed. Changes: (1) Added estimatedTokens?: number to Task interface in task-types.ts. (2) Added Contex
- Context-Aware Router — Model Seçimine Budget Faktörü Ekle: GO_WITH_TECH_DEBT — Context-Aware Router implemented successfully. Changes: (1) routing-types.ts — RoutingDecision interface'e contextFit?: 
- Token Usage — Worker Result'a Token Verisi Ekle: GO_WITH_TECH_DEBT — TokenUsage interface defined in task-types.ts with inputTokens, outputTokens, cacheReadTokens, provider, model fields. A
- Sprint Reporter Token Summary — RETRO.md Token Tablosu: GO_WITH_TECH_DEBT — Task 124-004 completed. Changes: (1) Added TokenUsage type import to sprint-reporter.ts. (2) Added formatTokenCount() he
## Sprint sprint-125 Learnings
- Rubric-Based Grading — Yapılandırılmış Değerlendirme Sistemi: NO_GO — Rubric-Based Grading sistemi implemente edildi. Değişiklikler: (1) task-types.ts — RubricCriterion, EvaluationRubric, Ru
- Worker Question Mechanism — askBrain IPC: NO_GO — Worker Question Mechanism implemented. Changes: (1) task-types.ts — WorkerQuestion and BrainAnswer interfaces added. (2)
- Explain MCP Tool — deckent_explain: NO_GO — deckent_explain MCP tool implemented. New file src/mcp/tools/explain.ts created, registered in index.ts (21st tool). Cor
- Workspace + DECKENT.md Tutarlılık Düzeltmesi: NO_GO — All 5 documentation files synchronized with Sprint 124 codebase state. IDENTITY.md: Tests 12,103+, Sprints 124+, Feature
- BETA-TRACKER Sprint 124 Güncellemesi: NO_GO — BETA-TRACKER EN+TR Sprint 124 güncellemesi tamamlandı. Yapılan değişiklikler: (1) Current Status tabloları sprint-125'e 
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