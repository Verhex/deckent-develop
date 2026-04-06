# DIRECTIVES — Sprint 092: Config Temizliği + Dashboard i18n Tam Kapsam

## Goal: Config.json'u agresif temizle (usage artıkları, duplikasyon, tip güvenliği). Dashboard'daki 6 bileşende ~109 hardcoded İngilizce string'i i18n ile çevir. Türkçe seçildiğinde tüm UI Türkçe olmalı. Phase/Status enum değerleri İngilizce kalacak (teknik terim).

---

## Task 1: Config.json Agresif Temizlik + Tip Güvenliği
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: .deckent/config.json, src/core/config-types.ts, src/core/config.ts
- Scope: .deckent/, src/core/

### Description
Config.json'u temizle ve tip güvenliğini sağla.

A) `.deckent/config.json`'dan kaldır:
- Her mod (max_plan, max5x_plan, pro_plan, api) altındaki `usage_thresholds` objesini SİL — usage özelliği Sprint 089'da kaldırıldı
- Üst seviye `brain_planning` field'ını kaldır — duplike, zaten modes altında var
- Gereksiz/boş field'ları temizle

B) `src/core/config-types.ts`'de:
- `DeckentConfig`'e `last_sprint_id?: string` ekle (tip güvenliği)
- `PlanModeConfig`'den `usage_thresholds` field'ı kalmışsa kaldır (Sprint 089'dan kalma)
- `brain_planning` üst seviye field varsa kaldır veya deprecated işaretle

C) `src/core/config.ts`'de:
- `createDefaultConfig()` ve `loadConfig()`'da usage_thresholds referansı kaldıysa kaldır
- `last_sprint_id` load/save akışını kontrol et, DeckentConfig üzerinden geçmeli

D) Config.json'un final hali temiz, okunabilir, kategorize olmalı

**Kanıt:** `grep "usage_thresholds\|brain_planning" .deckent/config.json` → 0 eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/core/config*.test.ts` → 0 fail.

---

## Task 2: Dashboard i18n — StatusPage + SprintSummary (~34 key)
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/dashboard/src/pages/StatusPage.tsx, src/dashboard/src/components/SprintSummary.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/

### Description
StatusPage ve SprintSummary bileşenlerindeki hardcoded string'leri i18n ile çevir.

A) `StatusPage.tsx` — useTranslation import et ve tüm string'leri t() ile değiştir:
- "No active sprint." → t('status.no_sprint')
- "Run deckent start to begin." → t('status.run_start')
- "Loading sprint data..." → t('status.loading')
- "Sprint Status" → t('status.title')

B) `SprintSummary.tsx` — useTranslation import et ve ~30 string'i t() ile değiştir:
- Status label'ları: "Done", "Active", "Writing code", "Running tests", "Type checking", "Needs attention", "Error", "Paused", "Queued", "Draft", "Waiting"
- Zaman: "< 1 min remaining", "~N min remaining", "just started", "N min elapsed"
- Task sayıları: "N/M tasks done", "Done: N", "Active: N", "Queued: N", "N done", "N active", "N queued", "N auto-fixed"
- Bölüm başlıkları: "What's happening now", "Working...", "Tasks", "Providers", "Needs attention"
- NOT: Phase/Status enum değerleri (PLAN, EXECUTE, DONE vb.) İngilizce KALACAK — çevirme

C) `en.ts`'e ~34 yeni key ekle (status.* ve sprint_summary.* prefix'leri)
D) `tr.ts`'e aynı ~34 key'in Türkçe çevirilerini ekle

**Kanıt:** `grep -n "useTranslation" src/dashboard/src/pages/StatusPage.tsx src/dashboard/src/components/SprintSummary.tsx` → 2 eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run --config src/dashboard/vitest.config.ts` → 0 fail.

---

## Task 3: Dashboard i18n — TaskCard (~30 key)
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/dashboard/src/components/TaskCard.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/

### Description
TaskCard bileşenindeki ~30 hardcoded string'i i18n ile çevir.

A) `TaskCard.tsx` — useTranslation import et ve tüm string'leri t() ile değiştir:
- Status label'ları: "Completed", "Working...", "Writing code", "Running tests", "Running tests (attempt N/3)", "Type checking", "Failed — needs attention", "Error occurred", "Paused", "Waiting for Task X", "Queued", "Waiting"
- Badge label'ları: "Done", "Active", "Writing code", "Running tests", "Type checking", "No-Go", "Error", "Paused", "Queued", "Draft", "Waiting"
- Detay bölümleri: "Task N", "Files changed (N)", "Test results", "N passed", "N failed", "N total", "Retry history (N)", "Attempt N: reason"
- NOT: Phase/Status enum değerleri İngilizce KALACAK

B) `en.ts`'e ~30 yeni key ekle (task_card.* prefix'i)
C) `tr.ts`'e aynı ~30 key'in Türkçe çevirilerini ekle

**Kanıt:** `grep -n "useTranslation" src/dashboard/src/components/TaskCard.tsx` → 1 eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run --config src/dashboard/vitest.config.ts` → 0 fail.

---

## Task 4: Dashboard i18n — DebtTable + SprintChart + Layout + Kalan (~25 key)
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/dashboard/src/components/DebtTable.tsx, src/dashboard/src/components/SprintChart.tsx, src/dashboard/src/components/Layout.tsx, src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/pages/ConfigPage.tsx, src/dashboard/src/components/NewSprintModal.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/

### Description
Kalan bileşenlerdeki hardcoded string'leri i18n ile çevir.

A) `DebtTable.tsx` — useTranslation import et:
- "No technical debt entries." → t('debt.no_entries')
- Tablo başlıkları: "ID", "Description", "Priority", "Sprint", "Status" → t('debt.col_id'), vb.

B) `SprintChart.tsx` — useTranslation import et:
- Tooltip: "Coverage", "Tasks" → t('chart.coverage'), t('chart.tasks')
- "No data available." → t('chart.no_data')
- "Success Rate" → t('chart.success_rate')
- "Tasks", "Coverage %" → t('chart.tasks'), t('chart.coverage_pct')
- "No chart data available." → t('chart.no_chart_data')

C) `Layout.tsx` — SSE_LABELS'ı t() ile değiştir:
- "Live" → t('common.live')
- "..." → t('common.connecting')
- "Offline" → t('common.offline')

D) `DashboardPage.tsx` — relativeTime fonksiyonunu i18n-aware yap:
- "Ns ago" → t('common.seconds_ago', { n })
- "Nm ago" → t('common.minutes_ago', { n })
- "Nh ago" → t('common.hours_ago', { n })

E) `WorkerCard.tsx` — aynı relativeTime düzeltmesi

F) `ConfigPage.tsx` — kalan hardcoded string'ler:
- "Reset to default: X" → t('config.reset_to_default', { value })
- "(default: X)" → t('config.default_value', { value })

G) `NewSprintModal.tsx`:
- Placeholder "# Sprint Directives..." → t('modal.directives_placeholder')

H) `en.ts` + `tr.ts`'e ~25 yeni key ekle

**Kanıt:** Tüm hedef dosyalarda useTranslation kullanılıyor

**Test:** `tsc --noEmit` temiz. `npx vitest run --config src/dashboard/vitest.config.ts` → 0 fail.

---

## Task 5: i18n Doğrulama — Hardcoded String Tarama + Key Eşitliği
- Model: opus
- Effort: normal
- Agent: test-writer
- Skills: typescript-expert, testing-expert
- Files: tests/dashboard/i18n-coverage.test.ts, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: tests/dashboard/, src/dashboard/

### Description
Dashboard i18n tam kapsam doğrulaması.

A) `tests/dashboard/i18n-coverage.test.ts` yeni dosya:
- Test 1: en.ts ve tr.ts key sayıları eşit olmalı
- Test 2: en.ts'deki her key tr.ts'de de bulunmalı (ve tersi)
- Test 3: Hiçbir tr.ts çevirisi boş string olmamalı
- Test 4: Tüm bileşen dosyalarında hardcoded İngilizce UI string taraması (regex ile)
  - StatusPage, SprintSummary, TaskCard, DebtTable, SprintChart, Layout hedef dosyalar
  - "No ", "Loading", "Error", "Failed", gibi pattern'ler bulunamazsa geçer
  - Teknik terimler (PLAN, EXECUTE, DONE, NO_GO) hariç tutulmalı

B) en.ts ve tr.ts arasında eksik key varsa düzelt

**Kanıt:** `ls tests/dashboard/i18n-coverage.test.ts` → dosya var

**Test:** `tsc --noEmit` temiz. `npx vitest run --config src/dashboard/vitest.config.ts tests/dashboard/i18n-coverage.test.ts` → 0 fail.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- npx vitest run --config src/dashboard/vitest.config.ts → 0 fail
- Dashboard Türkçe'de hardcoded İngilizce UI string → 0 (teknik terimler hariç)
- config.json'da usage_thresholds → 0
- en.ts ve tr.ts key sayısı eşit
- %100 GO hedefli — yarım iş yok
