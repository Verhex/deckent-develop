# DIRECTIVES — Sprint 090: Usage Artık Referans Temizliği — Sıfır Tolerans

## Goal: Sprint 089'da kaldırılan usage özelliğinin TÜM artık referanslarını temizle. src/, tests/, docs/, README dosyalarında TEK BİR usage tracking/metrics/thresholds referansı kalmamalı. Enterprise seviye sıfır artık.

---

## Task 1: src/ Artık Temizliği — MCP Help, Server, Dashboard, Sprint Types
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/mcp/tools/help.ts, src/mcp/server.ts, src/dashboard/src/types/index.ts, src/core/sprint-types.ts, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/

### Description
src/ altındaki kalan usage referanslarını tamamen kaldır.

A) `src/mcp/tools/help.ts`:
- Satır 60: `deckent_usage` tool tanımını kaldır
- Satır 75: `deckent://usage` resource tanımını kaldır

B) `src/mcp/server.ts`:
- Satır 31: `deckent_usage` tanımını MCP instructions metninden kaldır
- Satır 43: `deckent://usage` tanımını MCP instructions metninden kaldır
- Tool/resource sayılarını güncelle (19→18 tool, 9→8 resource)

C) `src/dashboard/src/types/index.ts`:
- Satır 35-38: `usage` field'ı DashboardData interface'inden kaldır (fiveHourPercent, weeklyPercent, measuredAt)

D) `src/core/sprint-types.ts`:
- Satır 31-35: `SprintUsageReport` interface'i SİL
- Satır 49: `usageReport?: SprintUsageReport` field'ı Sprint'ten kaldır

E) `src/dashboard/src/i18n/en.ts`:
- Satır 27, 127-132: Tüm `dashboard.usage*` i18n key'lerini kaldır (6 adet)

F) `src/dashboard/src/i18n/tr.ts`:
- Satır 29, 129-134: Tüm `dashboard.usage*` i18n key'lerini kaldır (6 adet)

G) Tüm src/ altında `grep -rn "UsageMetrics\|UsageTracker\|usage_thresholds\|checkUsage\|adjustSprintSize\|fiveHourPercent\|weeklyPercent\|deckent_usage\|deckent://usage\|SprintUsageReport\|usage-tracker\|usage-manager\|usage-graph" src/` çalıştır — 0 eşleşme olmalı

**Kanıt:** Yukarıdaki grep → 0 satır

**Test:** `tsc --noEmit` temiz.

---

## Task 2: Test Dosyaları Artık Temizliği — Mock, Import, Fixture
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: tests/orchestra/checkUsage-parsing.test.ts, tests/docs/jsdoc.test.ts, tests/orchestra/brain.test.ts, tests/orchestra/sprint-controller.test.ts, tests/orchestra/brain-provider.test.ts, tests/orchestra/brain-rollback.test.ts, tests/orchestra/brain-autopause.test.ts, tests/orchestra/brain-coverage.test.ts, tests/orchestra/finalize-sprint.test.ts, tests/orchestra/runsprint-debt-integration.test.ts, tests/mcp/tools-quality-059010.test.ts, tests/mcp/tools/annotations.test.ts, tests/mcp/tools-debt-061-006.test.ts, tests/mcp/server.test.ts, tests/mcp/resources/resources.test.ts, tests/cli/index.test.ts, tests/cli/commands.test.ts
- Scope: tests/

### Description
Test dosyalarındaki TÜM usage artıklarını temizle.

A) `tests/orchestra/checkUsage-parsing.test.ts` — DOSYANIN TAMAMINI SİL (559 satır, tamamen usage testi)

B) `tests/docs/jsdoc.test.ts`:
- Satır 21: silinmiş `src/orchestra/usage-manager.ts` referansını kaldır

C) TÜM test dosyalarında `vi.mock('../../src/core/usage-tracker.js', ...)` bloklarını kaldır (11 dosya):
- tests/orchestra/brain-rollback.test.ts, brain-coverage.test.ts, brain-autopause.test.ts, brain-provider.test.ts, sprint-controller.test.ts, finalize-sprint.test.ts, runsprint-debt-integration.test.ts
- tests/mcp/tools-quality-059010.test.ts, tools/annotations.test.ts, tools-debt-061-006.test.ts

D) TÜM test dosyalarında `UsageMetrics` import/kullanımlarını kaldır. `UsageMetrics` tipi silindiği için bu import'lar kırık. Bunları kullanan yerlerde usage mock objesini tamamen kaldır veya boş objeyle değiştir. Etkilenen dosyalar:
- tests/integration/*.test.ts (8 dosya)
- tests/orchestra/*.test.ts (12 dosya)
- tests/providers/*.test.ts (4 dosya)

E) `adjustSprintSize` ve `checkUsage` mock/import/kullanımlarını kaldır. Bu fonksiyonlar artık yok. Etkilenen dosyalar:
- tests/mcp/*.test.ts, tests/cli/*.test.ts, tests/api/*.test.ts, tests/orchestra/*.test.ts

F) `usage_thresholds` fixture değerlerini TÜM config mock objelerinden kaldır (50+ dosya). Bu field config-types'tan silindiği için fixture'larda da olmamalı.

G) `registerUsage`, `registerUsageTool`, `registerUsageResource` import/çağrılarını kaldır (8 dosya)

H) `deckent_usage` ve `deckent://usage` test assertion'larını kaldır (6 dosya)

I) `fiveHourPercent`, `weeklyPercent` test değerlerini kaldır (provider test'leri + orchestra test'leri)

J) `getSprintUsage`, `getTotalUsage`, `getModelBreakdown` mock return'larını kaldır (10 dosya)

**Kanıt:** `grep -rn "UsageMetrics\|UsageTracker\|usage-tracker\|usage-manager\|checkUsage\|adjustSprintSize\|fiveHourPercent\|weeklyPercent\|usage_thresholds\|registerUsage\|deckent_usage\|deckent://usage\|SprintUsageReport\|checkUsage-parsing\|brain-usage\|usage-graph" tests/ | wc -l` → 0

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 3: Dokümantasyon + README Artık Temizliği
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: README.md, README-TR.md, docs/reference/api.md, docs/reference/performance.md, docs/reference/migration-guide.md, docs/reference/api-examples.md, docs/reference/health-check.md, docs/reference/glossary.md, docs/development/brain-guide.md, docs/guide/deckent-nedir.md, docs/architecture/architecture.md, docs/architecture/sprint-lifecycle.md, docs/architecture/agent-skill-architecture.md, docs/analysis/full-audit.md, docs/analysis/cli-deep-analysis.md, docs/analysis/cli-mcp-master-audit.md, docs/SPRINT-LOG.md, docs/CHANGELOG.md
- Scope: docs/, ./

### Description
Dokümantasyon ve README dosyalarından TÜM usage tracking referanslarını kaldır.

A) `README.md`:
- Satır 320: `deckent_usage` tool tablosundan satırı kaldır
- Satır 339: `deckent://usage` resource tablosundan satırı kaldır
- Tool/resource sayılarını güncelle

B) `README-TR.md`:
- Satır 322: `deckent_usage` tool tablosundan satırı kaldır
- Satır 341: `deckent://usage` resource tablosundan satırı kaldır
- Tool/resource sayılarını güncelle

C) `docs/reference/api.md`:
- UsageMetrics interface tanımını kaldır
- checkUsage, adjustSprintSize fonksiyon dökümantasyonunu kaldır
- usage_thresholds field tanımını kaldır

D) `docs/reference/performance.md`:
- usage_thresholds config örneklerini kaldır

E) `docs/reference/migration-guide.md`:
- usage_thresholds config örneklerini kaldır

F) `docs/reference/api-examples.md`:
- fiveHourPercent, weeklyPercent örneklerini kaldır
- usage_thresholds config örneklerini kaldır

G) `docs/reference/health-check.md`:
- checkUsage, adjustSprintSize referanslarını kaldır

H) `docs/reference/glossary.md`:
- checkUsage ProviderAdapter açıklamasından kaldır

I) `docs/development/brain-guide.md`:
- checkUsage, adjustSprintSize, usage_thresholds referanslarını kaldır
- Usage Constraints bölümünü kaldır

J) `docs/guide/deckent-nedir.md`:
- UsageTracker, adjustSprintSize, checkUsage referanslarını kaldır
- deckent usage komutu açıklamasını kaldır

K) `docs/architecture/architecture.md`:
- usage-manager.ts modül referansını kaldır
- checkUsage akış diyagramından kaldır
- usage_thresholds config örneğini kaldır

L) `docs/architecture/sprint-lifecycle.md`:
- checkUsage, adjustSprintSize açıklamalarını kaldır

M) `docs/architecture/agent-skill-architecture.md`:
- checkUsage, adjustSprintSize, UsageMetrics referanslarını kaldır

N) `docs/analysis/full-audit.md`:
- usage-tracker.ts, usage-manager.ts, UsageTracker referanslarını kaldır

O) `docs/analysis/cli-deep-analysis.md`:
- adjustSprintSize, checkUsage, usage-tracker.ts referanslarını kaldır

P) `docs/analysis/cli-mcp-master-audit.md`:
- deckent_usage, deckent://usage referanslarını kaldır

Q) `docs/SPRINT-LOG.md`:
- checkUsage public functions, UsageTracker referanslarını kaldır veya güncelle

R) `docs/CHANGELOG.md`:
- usage-manager.ts, UsageTracker referanslarını güncelle (Sprint 089'da kaldırıldı notu ekle)

**Kanıt:** `grep -rn "UsageMetrics\|UsageTracker\|usage-tracker\|usage-manager\|checkUsage\|adjustSprintSize\|fiveHourPercent\|weeklyPercent\|usage_thresholds\|deckent_usage\|deckent://usage" docs/ README.md README-TR.md | wc -l` → 0

**Test:** `tsc --noEmit` temiz.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- src/ altında usage tracking referansı → 0
- tests/ altında usage tracking referansı → 0
- docs/ altında usage tracking referansı → 0
- README dosyalarında usage tracking referansı → 0
- Genel "usage" kelimesi (CLI help text gibi) sorun değil — sadece tracking/metrics/thresholds kaldırılmalı
- %100 GO hedefli — yarım iş yok
