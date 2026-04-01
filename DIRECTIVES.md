# DIRECTIVES — Sprint 081: Dokümantasyon Catch-Up + History Trend

## Goal: Sprint 078-080 sonuçlarını CHANGELOG, SPRINT-LOG, PROJECT-IDENTITY'ye yansıt. HistoryPage'e success rate trend ekle. Temiz, push'a hazır state.

---

## Task 1: CHANGELOG Sprint 078-080 Entry
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/CHANGELOG.md
- Scope: docs/

### Description
Sprint 078-080 değişikliklerini docs/CHANGELOG.md'ye ekle. En son entry [0.2.0-beta.3-sprint76] — onun üstüne yeni entry'ler:

**Sprint 078 (2026-04-01):**
- Changed: Blueprint senkronizasyonu — MCP 10→17 tools, 5→9 resources, memory 600→900
- Changed: ANA-PLAN-TR.md tam güncelleme — CLI 21→32, MCP sayıları, sprint tablosu
- Changed: BETA-ROADMAP Sprint 076-077 DONE, Sprint 078 AKTİF
- Fixed: brain.md MEMORY 200→300, RETRO 100→120, budget 600→900
- Fixed: docs/architecture, security, release-notes memory budget 600→900

**Sprint 079 (2026-04-01):**
- Added: Dashboard i18n — LanguageProvider, 90+ TR/EN key, sidebar dil switcher
- Added: README-TR.md — README.md'nin tam Türkçe çevirisi (466 satır)
- Added: VISION-EN.md — VISION.md'nin tam İngilizce çevirisi (110 satır)
- Added: GET /api/tasks endpoint — .tasks/ dizininden task listesi
- Fixed: Blueprint testleri 10→17 tools, 5→9 resources

**Sprint 080 (2026-04-01):**
- Added: SSE bağlantı durumu göstergesi (connected/connecting/disconnected)
- Changed: ConfigPage mode seçenekleri performance/balanced/economic
- Fixed: ConfigPage memory_budget varsayılan 600→900
- Fixed: ConfigPage language alanı text→select
- Changed: SettingsPage mode seçenekleri güncellendi

Keep a Changelog formatı. Section başlıkları İngilizce, açıklamalar Türkçe.

**Kanıt:** `grep "Sprint 078\|sprint-078\|sprint78\|sprint-079\|sprint-080" docs/CHANGELOG.md` → entry var

**Test:** Bu task test gerektirmez.

---

## Task 2: SPRINT-LOG Sprint 078-080 Entry
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/SPRINT-LOG.md
- Scope: docs/

### Description
docs/SPRINT-LOG.md'nin sonuna Sprint 078, 079, 080 entry'lerini ekle.

Sprint 078: Dokümantasyon senkronizasyonu — 4 task, 4 done, 0 tech debt, 0 no-go
Sprint 079: i18n + TR/EN docs + /api/tasks — 3 task, 3 done, 0 tech debt, 0 no-go
Sprint 080: Dashboard zenginleştirme — 3 task, 3 done, 0 tech debt, 0 no-go

Her entry için: tarih, süre, task sayıları, öne çıkan değişiklikler.

**Kanıt:** `grep "Sprint 078\|Sprint 079\|Sprint 080" docs/SPRINT-LOG.md` → 3 entry var

**Test:** Bu task test gerektirmez.

---

## Task 3: PROJECT-IDENTITY Güncelleme
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: .brain/PROJECT-IDENTITY.md
- Scope: .brain/

### Description
PROJECT-IDENTITY.md güncelle:

- Test Count: 12,198 (12,182 passed + 15 skipped + 1 fail)
- Last Sprint: sprint-080
- Total Sprints: 80
- MCP: 17 tools + 9 resources (eski 16 tools ise düzelt)
- CLI: 32 commands (eski 33+ ise düzelt)
- Yeni modül: i18n/LanguageProvider.tsx (dashboard), i18n/en.ts, i18n/tr.ts
- Yeni dosya: README-TR.md, VISION-EN.md
- Yeni endpoint: GET /api/tasks
- Dashboard: 6 sayfa (eski 4 ise düzelt), SSE bağlantı göstergesi, dil switcher

**Kanıt:** `grep "12,198\|sprint-080\|17 tools" .brain/PROJECT-IDENTITY.md` → güncel

**Test:** Bu task test gerektirmez.

---

## Task 4: HistoryPage Success Rate Trend Bileşeni
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/pages/HistoryPage.tsx, src/dashboard/src/components/SprintChart.tsx
- Scope: src/dashboard/

### Description
HistoryPage'e sprint success rate trend gösterimi ekle:

A) SprintChart bileşenini kontrol et — mevcut chart'ın yanına veya altına success rate bar chart ekle
B) Her sprint için success rate = (done / total) * 100 hesapla
C) Son 10 sprint'in trend çizgisini göster
D) Renk kodlaması: %100 yeşil, %80+ sarı, <%80 kırmızı
E) Mevcut table'da zaten "noGoRate" var — bunu bar/chip olarak görselleştir

i18n kullan: `useTranslation` hook'undan `t()` çağır.

**Kanıt:** `grep "success\|trend\|useTranslation" src/dashboard/src/pages/HistoryPage.tsx` → var

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Quality Rules
- tsc --noEmit MUST pass
- Mevcut testlerde 0 regresyon
- Tüm sayılar gerçek verilere dayalı
- %100 GO hedefli
