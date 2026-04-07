## Sprint sprint-099 Learnings
- RETRO Done Sayacı — Evaluations Map Debug + Fix: GO_WITH_TECH_DEBT — Kök neden bulundu ve doğrulandı: Sprint 093 commit'inde (2085f0f) buildAgentPerformance() içindeki GO_WITH_TECH_DEBT blo
- Job Output Reform — Detaylı Gerekçe + Metrik: GO_WITH_TECH_DEBT — Job Output Reform tamamlandı: (A) finalizeSprint() job summary bloğu zenginleştirildi — her task için evaluation, reason
- VISION.md + health-check.md + roadmap.md Sayı Güncellemeleri: GO_WITH_TECH_DEBT — 3 dosyadaki tüm eski sayılar güncellendi: VISION.md (6 düzeltme: sprint 82→98+, CLI 33→34+, MCP resource 9→8, agent 9→16
- README Badge + ANALYSIS Sprint 098 Güncelleme: GO_WITH_TECH_DEBT — A) README.md ve README-TR.md: sprint badge 97+ → 98+ güncellendi. B) ANALYSIS-2026-04-02.md: Bölüm I tablosu güncellendi
- PROJECT-IDENTITY Test Count Fix + CLAUDE.md Module Count: GO_WITH_TECH_DEBT — PROJECT-IDENTITY.md: Test Count 12 → 12,193+ düzeltildi. CLAUDE.md zaten günceldi (49 modules orchestra, 52 modules core
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