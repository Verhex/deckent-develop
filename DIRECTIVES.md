# DIRECTIVES — Sprint 083: Docs Güncelleme + Dashboard Smoke Test Hazırlığı

## Goal: Sprint numarası eşitleme dokümantasyonu, CHANGELOG/SPRINT-LOG catch-up, dashboard build. Hızlı sprint — dashboard izleme testi yapılacak.

---

## Task 1: CHANGELOG + SPRINT-LOG Sprint 078-082 Toplu Güncelleme
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/CHANGELOG.md, docs/SPRINT-LOG.md
- Scope: docs/

### Description
Sprint 078-082 değişikliklerinin tamamını CHANGELOG ve SPRINT-LOG'a ekle.

CHANGELOG: `[0.3.0-beta.1]` entry'si zaten olabilir — yoksa ekle, varsa zenginleştir:
- Sprint 078: docs catch-up, HistoryPage trend
- Sprint 079: README-TR fix, dashboard kontrol, init dil-ilk
- Sprint 080: Dashboard UX Overhaul (WorkerCard, Timeline, ActivityFeed)
- Sprint 081: Config birleşme, i18n tam kapsam
- Sprint 082: MCP/CLI parity, usage fix, version bump, Dashboard Faz B

SPRINT-LOG: Her sprint için entry (tarih, task, süre, öne çıkanlar).

**Kanıt:** `grep "Sprint 082\|sprint-082" docs/CHANGELOG.md docs/SPRINT-LOG.md` → entry var

**Test:** Bu task test gerektirmez.

---

## Task 2: PROJECT-IDENTITY + VISION Sayı Güncelleme
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: .brain/PROJECT-IDENTITY.md, VISION.md, .deckent/workspace/IDENTITY.md
- Scope: .brain/, VISION.md, .deckent/

### Description
Tüm sayısal referansları güncel değerlere eşitle:
- Sprint: 82
- Test: 12,193+
- MCP: 19 tools, 9 resources
- CLI: 33 commands
- Dashboard: 4 sayfa, 23+ bileşen
- Version: v0.3.0-beta.1
- Dashboard bileşenleri: WorkerCard, SprintPhaseTimeline, ActivityFeed, Skeleton, EmptyState, AgentDetail

**Kanıt:** `grep "12,193\|sprint.*82\|19 tools" .brain/PROJECT-IDENTITY.md` → güncel

**Test:** Bu task test gerektirmez.

---

## Task 3: Dashboard Vite Build + dist/ Güncelleme
- Model: haiku
- Effort: low
- Agent: refactorer
- Skills: typescript-expert
- Files: src/dashboard/
- Scope: src/dashboard/

### Description
Dashboard'un son değişikliklerinin Vite build'i:

A) `cd src/dashboard && npx vite build --outDir ../../dist/dashboard`
B) `chmod +x dist/cli/entry.js dist/mcp/server.js`
C) Doğrula: `ls dist/dashboard/index.html` → mevcut

NOT: Bu task sadece build komutu çalıştırır. Kaynak kodu değiştirme.

**Kanıt:** `ls dist/dashboard/index.html` → mevcut

**Test:** `tsc --noEmit` temiz.

---

## Quality Rules
- tsc --noEmit MUST pass
- Mevcut testlerde 0 regresyon
- Sprint numarası: 082 (Deckent sayacı = tek kaynak)
- %100 GO hedefli
