# DIRECTIVES — Sprint 089: Usage Özelliğini Tamamen Kaldır

## Goal: Projedeki usage tracking, usage thresholds, usage CLI/MCP/API/Dashboard özelliğini tamamen kaldır. Tüm referansları temizle, tsc --noEmit ve testler temiz kalmalı.

---

## Task 1: Usage Core Modülleri Kaldır — Tipler, Config, Tracker
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/usage-tracker.ts, src/core/config-types.ts, src/core/config.ts, src/core/monitoring-types.ts, src/core/config-migration.ts, src/core/provider.ts, src/core/types.ts
- Scope: src/core/

### Description
Usage ile ilgili tüm core tanımlarını kaldır.

A) `src/core/usage-tracker.ts` dosyasını SİL (295 satır) — UsageTracker class, UsageEntry, SprintUsage, TotalUsage, ModelBreakdown, ProviderBreakdown, TaskUsage, MODEL_TOKEN_ESTIMATES, DEFAULT_TOKEN_COSTS

B) `src/core/config-types.ts`'den kaldır:
- `UsageMetrics` interface (fiveHourPercent, weeklyPercent, measuredAt)
- `UsageThresholds` interface ('5hr', weekly)
- `PlanModeConfig.usage_thresholds` field
- Bu tiplere referans veren diğer field'lar

C) `src/core/config.ts`'den kaldır:
- Her plan mode'daki `usage_thresholds` defaults (max_plan, max5x_plan, pro_plan, api — 4 adet)
- Usage ile ilgili config metadata descriptions

D) `src/core/monitoring-types.ts`'den kaldır:
- `'usage_threshold_exceeded'` alert type
- `DashboardState` içindeki `usage: UsageMetrics` field

E) `src/core/config-migration.ts`'den kaldır:
- `usage_thresholds` field kontrolü

F) `src/core/provider.ts`'den kaldır:
- `ProviderAdapter` interface'inden `checkUsage()` metodu

G) `src/core/types.ts` barrel'dan ilgili export'ları temizle

**Kanıt:** `grep -rn "UsageMetrics\|UsageTracker\|UsageThresholds\|usage_thresholds" src/core/ | wc -l` → 0

**Test:** `tsc --noEmit` temiz.

---

## Task 2: Usage Orchestra + Provider Modülleri Kaldır
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/usage-manager.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-phases.ts, src/orchestra/sprint-reporter.ts, src/orchestra/brain.ts, src/orchestra/model-selector.ts, src/orchestra/decision-engine.ts, src/orchestra/index.ts, src/providers/claude.ts, src/providers/codex.ts, src/providers/gemini.ts, src/providers/subprocess.ts, src/providers/sandbox.ts
- Scope: src/orchestra/, src/providers/

### Description
Usage manager ve tüm orchestra/provider referanslarını kaldır.

A) `src/orchestra/usage-manager.ts` dosyasını SİL (462 satır) — checkUsage, adjustSprintSize, checkAllProviderUsage, selectOptimalProvider, suggestFallbackProvider, getSprintUsageEstimate, recordSprintUsage

B) `src/orchestra/sprint-controller.ts`'den kaldır:
- `UsageTracker` import
- Sprint state'deki usage metrics
- `checkUsage()` fonksiyon çağrıları

C) `src/orchestra/sprint-phases.ts`'den usage referanslarını kaldır

D) `src/orchestra/sprint-reporter.ts`'den usage referanslarını kaldır

E) `src/orchestra/brain.ts`'den kaldır:
- Usage-manager comment
- `SprintUsage, TotalUsage, ModelBreakdown` export'ları

F) `src/orchestra/model-selector.ts`'den usage referanslarını kaldır

G) `src/orchestra/decision-engine.ts`'den usage referanslarını kaldır

H) `src/orchestra/index.ts`'den usage-manager export'larını kaldır

I) Tüm provider dosyalarından `checkUsage()` implementasyonlarını kaldır:
- src/providers/claude.ts, codex.ts, gemini.ts, subprocess.ts, sandbox.ts

**Kanıt:** `grep -rn "usage-manager\|UsageTracker\|checkUsage\|adjustSprintSize" src/orchestra/ src/providers/ | wc -l` → 0

**Test:** `tsc --noEmit` temiz.

---

## Task 3: Usage CLI + MCP + API + Dashboard Kaldır
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/cli/commands/usage.ts, src/cli/index.ts, src/mcp/tools/usage.ts, src/mcp/tools/index.ts, src/mcp/resources/usage.ts, src/mcp/resources/index.ts, src/mcp/index.ts, src/api/server.ts, src/dashboard/analytics/usage-graph-data.ts
- Scope: src/cli/, src/mcp/, src/api/, src/dashboard/

### Description
Usage CLI komutu, MCP tool/resource, API endpoint ve Dashboard bileşenini kaldır.

A) `src/cli/commands/usage.ts` dosyasını SİL (214 satır)
B) `src/cli/index.ts`'den `registerUsage` import ve çağrısını kaldır

C) `src/mcp/tools/usage.ts` dosyasını SİL (52 satır)
D) `src/mcp/tools/index.ts`'den `registerUsageTool` import ve çağrısını kaldır

E) `src/mcp/resources/usage.ts` dosyasını SİL (50 satır)
F) `src/mcp/resources/index.ts`'den `registerUsageResource` import ve çağrısını kaldır

G) `src/mcp/index.ts`'den usage tool kaydını kaldır (varsa)

H) `src/api/server.ts`'den:
- `/plan` endpoint'teki usage check kodunu kaldır (checkUsage, adjustSprintSize çağrıları)
- `/api/usage` endpoint'i varsa kaldır

I) `src/dashboard/analytics/usage-graph-data.ts` dosyasını SİL — UsageGraphData class, BarDataEntry, UsageEntry, TaskTypeEntry

J) Dashboard'da usage-graph-data'ya referans veren bileşenleri temizle

**Kanıt:** `ls src/cli/commands/usage.ts src/mcp/tools/usage.ts src/mcp/resources/usage.ts src/dashboard/analytics/usage-graph-data.ts 2>&1 | grep "No such file" | wc -l` → 4

**Test:** `tsc --noEmit` temiz.

---

## Task 4: Usage Test Dosyaları + Dokümantasyon Temizliği
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: tests/core/usage-tracker.test.ts, tests/cli/usage.test.ts, tests/cli/commands/usage.test.ts, tests/orchestra/usage-manager.test.ts, tests/analytics/usage-graph-data.test.ts, tests/orchestra/brain-usage.test.ts, DECKENT.md, docs/reference/cli.md, docs/reference/config-reference.md
- Scope: tests/, docs/, .brain/

### Description
Usage ile ilgili tüm test dosyalarını ve dokümantasyonu temizle.

A) Test dosyalarını SİL:
- `tests/core/usage-tracker.test.ts`
- `tests/cli/usage.test.ts`
- `tests/cli/commands/usage.test.ts` (varsa)
- `tests/orchestra/usage-manager.test.ts`
- `tests/analytics/usage-graph-data.test.ts`
- `tests/orchestra/brain-usage.test.ts`

B) `DECKENT.md`'den kaldır:
- MCP tools listesinden `deckent_usage` satırı
- MCP resources listesinden `usage` satırı
- Parametre örneklerinden usage referansları
- Tool reference tablosundan usage satırı
- Resource reference tablosundan usage satırı

C) `docs/reference/cli.md`'den `deckent usage` komut açıklamasını kaldır

D) `docs/reference/config-reference.md`'den usage_thresholds açıklamalarını kaldır

E) Diğer test dosyalarında usage import/mock varsa temizle (grep ile tara)

**Kanıt:** `find tests/ -name "*usage*" | wc -l` → 0

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail (pre-existing hariç)
- Usage kelimesi sadece "CLI usage help" gibi genel anlamda kalabilir, tracking/metrics/thresholds anlamında 0 referans kalmalı
- Silinen dosyaların import'ları başka dosyalarda kalmamalı
- %100 GO hedefli
