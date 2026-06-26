# DIRECTIVES — Sprint: KPI SYSTEM — PHASE 1 (customizable KPI engine, dogfood)

## Goal
Build the **Phase-1 KPI subsystem**: a tenant-aware engine that records base measures at sprint-finalize,
rolls them up in `memory.db`, evaluates customizable derived-KPI formulas (sandboxed DSL), and surfaces
8 KPIs via `deckent kpi` (Tier-1 CLI) + the sprint retro — using **only data already available today**
(no new instrumentation). Dual-lens (Law #1): serves deckent dogfood orchestration-quality AND the
end-user product. Architecture **C (hybrid)**: a single formula-evaluator (SSOT) feeds both the rollup
(historical) and live (active-sprint) paths.
**Records of truth (READ FIRST):**
- Spec: `docs/superpowers/specs/2026-06-26-kpi-system-design.md` (§4 architecture, §5 measures, §6 DSL, §7 store, §8 status, §9 tenant, §10 surfaces).
- Plan (EXACT CODE per task): `docs/superpowers/plans/2026-06-26-kpi-system-phase1.md` — each Task N below maps to the same-numbered plan task; the plan carries the full TDD code. Follow it.
New module home: `src/core/kpi/`. CLI: `src/cli/commands/kpi.ts`. Wiring: `sprint-finalizer.ts`, `sprint-retro-writer.ts`.

## 🔒 BAĞLAYICI — her task (3 Yasa anchor)
- **NETWORK-ZERO (belkemiği):** KPI store/engine/evaluator/collection ASLA network yapmaz — yalnız lokal `memory.db`. Bir task network koyarsa YANLIŞ.
- **SANDBOX-EVALUATOR:** `formula-evaluator` yalnız whitelist (ölçüm-id + `+ - * /` + parantez) çözer; fonksiyon-çağrısı/member-access/keyfi-kod **reddedilir** (FormulaError throw). Bilinmeyen-ölçüm → throw; sıfıra-bölme → `null` (legit "veri yok"). Multi-tenant'ta kod-injection sıfır.
- **TENANT-AWARE baştan:** `tenant_id` her ölçüm/rollup/result satırından + her sorgudan geçer (auto-filter); Faz-1 default tenant `'default'`; **sızıntı testi zorunlu** (tenant A sorgusu B satırı dönmez). Enterprise yüzeyleri = Faz-3.
- **NON-BLOCKING wiring:** finalizer/retro KPI hook'ları sprinti/retroyu ASLA fail etmez — `try/catch` + `debugLog`, advisory.
- **Cerrahi + distinct-file:** iki task aynı dosyaya yazmaz. ESM `.js` zorunlu. `process.cwd()` YASAK → `join(root, …)`. Additive + graceful (mevcut davranış byte-for-byte korunur).
- **Hermetik test:** tmpdir `memory.db`, async, no spawnSync, no HOME-leak; `tsc --noEmit` 0-yeni-hata (src/core/kpi, src/cli, src/orchestra); affected-suite yeşil per task; ci-sim yeşil.
- **i18n-first:** kullanıcı-görünür string `getMessage(key, lang)` (en/tr); KPI title definition'da `{en,tr}`; mekanizma modülleri string-free. **No haiku** (kod). 
- **NO-TECH-DEBT:** placeholder yok; tek istisna gerekçeli `TODO(phase2)`. **Cost kaynağı Faz-1 = `TaskResult.tokenUsage` × public fiyat** (limit-ledger transcript ground-truth = Faz-2 doğruluk yükseltmesi, in-code işaretli).
- **PROOF-OF-FUNCTION (ADR-079):** Tier-1 CLI (`deckent kpi`) gerçek-binary `Smoke:` ile kapanır (mock yetmez).

---

## Task 1: shared types + base-measure catalog (foundation)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/kpi/types.ts, src/core/kpi/measure-catalog.ts, tests/kpi/measure-catalog.test.ts
- Scope: src/core/kpi/, tests/kpi/
- Dependencies: 0
### Description
Plan Task 1. `types.ts`: tüm paylaşılan tipler (`MeasureKind`, `AggMethod`, `BaseMeasure`, `KpiDirection|Format|Tier|Grain|Status`, `KpiThreshold`, `KpiDefinition`, `Measurement`, `RollupRow`, `KpiResult`, `KpiView`). `measure-catalog.ts`: 11 Faz-1 base measure (`BASE_MEASURES: Record<string,BaseMeasure>`: sprint_count, tasks_total, tasks_done, no_go, boundary_violations, retries, lines_added, cost_usd, tokens_input, tokens_output, cache_read) + `getMeasure(id)`. Hepsi sprint-finalize'da scope'taki veriden türetilebilir. Exact code: plan Task 1.
### goNogo
- goCriteria: BASE_MEASURES 11 girdi, her m.id key'iyle eşleşir; cost_usd gauge/USD; getMeasure bilinmeyen→undefined; tsc 0-yeni.
- nogo: network; Faz-2 ölçümü (tool_calls/pr/adr/bug) buraya eklenirse (kapsam-dışı).

## Task 2: sandboxed formula-evaluator (SSOT)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/kpi/formula-evaluator.ts, tests/kpi/formula-evaluator.test.ts
- Scope: src/core/kpi/, tests/kpi/
- Dependencies: 0
### Description
Plan Task 2. `evaluateFormula(formula, measures): number|null` + `class FormulaError`. Recursive-descent aritmetik (expr→term→factor; `+ - * /`, parantez, tekli `-`). Yalnız `measures` map'inde olan identifier'lar geçerli; fonksiyon-çağrısı/member-access/keyfi-kod **reddedilir**. Bilinmeyen-id → FormulaError; div-by-zero → null (null-propagation); trailing-token → FormulaError. Pure, network YOK. Güvenlik kritik — sandbox-escape testleri dahil. Exact code: plan Task 2.
### goNogo
- goCriteria: a/b, parantezli oran, nested (cost/(lines/1000)) doğru; div-by-zero→null; unknown-id→throw; `process.exit(1)`/fonksiyon-çağrısı→throw; precedence doğru.
- nogo: `eval`/`Function`/`new Function` kullanımı; identifier-whitelist bypass; herhangi I/O.

## Task 3: KpiStore — better-sqlite3 tables, tenant-filtered
- Model: opus
- Effort: high
- Agent: data-engineer
- Skills: typescript-expert, database-migration
- Files: src/core/kpi/kpi-store.ts, tests/kpi/kpi-store.test.ts
- Scope: src/core/kpi/, tests/kpi/
- Dependencies: 1
### Description
Plan Task 3. `class KpiStore(dbPath)` — `new Database(dbPath)`, WAL; idempotent `initSchema()` 3 tablo: `kpi_measurements` (append, INDEX tenant/sprint/measure), `kpi_rollups` (PK tenant,measure,grain,period), `kpi_results` (PK tenant,kpi,grain,period). Metotlar: `recordMeasurements` (txn), `foldSprintRollups(tenant,sprint)` (group-by measure → count/sum/min/max/last upsert), `getRollupValues`, `upsertResults` (ON CONFLICT upsert), `getResults`, `getSprintMeasurements`, `close`. **Her sorgu tenant_id filtreli.** Prepared statements + transactions (MemoryStore deseni: memory-store.ts:88-212). Exact code: plan Task 3.
### goNogo
- goCriteria: record+fold → rollup.sum doğru; **tenant izolasyon testi** (tenant-a sorgusu tenant-b satırı dönmez) GREEN; upsert idempotent (2× fold = aynı sonuç); results round-trip.
- nogo: tenant_id'siz sorgu yolu; cross-tenant sızıntı; raw string-concat SQL (prepared-stmt zorunlu).

## Task 4: KPI definitions — zod schema + 8 builtin KPIs + config loader
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/kpi/kpi-definitions.ts, tests/kpi/kpi-definitions.test.ts
- Scope: src/core/kpi/, tests/kpi/
- Dependencies: 1
### Description
Plan Task 4. `KPI_DEFINITION_SCHEMA` (zod) + `validateKpiDefinition`. `BUILTIN_KPIS` = 8 Faz-1 KPI: **universal** (cost_per_sprint [threshold 3.0/3.5], token_per_task, cache_hit_rate ↑, cost_per_kloc, avg_retry) + **dogfood** (no_go_rate [0.15/0.3], completion_rate ↑, boundary_violation_rate). `loadKpiDefinitions(customDefs?)` = builtins + valide-custom (id ile override; custom katmanı). i18n title `{en,tr}`. zod deseni: config.ts:286 (NERVOUS_SYSTEM_SCHEMA). Exact code: plan Task 4.
### goNogo
- goCriteria: 8 builtin (universal+dogfood); geçersiz-custom reddedilir (zod throw); custom builtin'i id ile override eder; her formül yalnız katalog-ölçüm-id'leri kullanır.
- nogo: hardcode TR/EN title (definition {en,tr} olmalı); formülde katalog-dışı ölçüm.

## Task 5: rollup-engine — fold → compute results + direction-aware status
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/kpi/rollup-engine.ts, tests/kpi/rollup-engine.test.ts
- Scope: src/core/kpi/, tests/kpi/
- Dependencies: 1, 2, 3, 4
### Description
Plan Task 5. `computeStatus(value, def): KpiStatus` — **yön-duyarlı** (↓ KPI: value≥critical→critical, ≥warn→warn; ↑ KPI: value≤critical→critical, ≤warn→warn; null→na; threshold yok→ok). `computeSprintKpis(store, defs, tenant, sprint)`: fold → rollup-değerlerini measure.agg'a göre (counter→sum, gauge→last…) measure-map'e çevir → her enabled `grain==='sprint'` def için `evaluateFormula` (FormulaError→null/na: Faz-2 ölçümü henüz yokken crash YOK) → status → `upsertResults` → döndür. Exact code: plan Task 5.
### goNogo
- goCriteria: cost_per_sprint=7 (cost 7/sprint 1) + status critical (≥3.5); cache_hit_rate≈0.75; tasks_done=0 → token_per_task status `na` (crash yok); computeStatus ↑/↓ her iki yön doğru.
- nogo: evaluator dışında formül-hesabı (SSOT ihlali); FormulaError'da crash.

## Task 6: collection — derive base measures from sprint data + record pipeline
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/kpi/collection.ts, tests/kpi/collection.test.ts
- Scope: src/core/kpi/, tests/kpi/
- Dependencies: 1, 3, 4, 5
### Description
Plan Task 6. `UsageTotals{costUsd,inputTokens,outputTokens,cacheRead}` + minimal `SprintMetricsLike`/`TaskResultLike` (yalnız okunan alanlar — full types.ts'e sıkı-kuplaj YOK). `deriveMeasurements(sprintId,tenantId,metrics,results,usage,ts): Measurement[]` **pure**: sprint_count=1, tasks_total/done/no_go/boundary (metrics'ten), retries=Σ(tscAttempts+testAttempts), lines_added=Σ, cost/tokens (usage'dan). `recordKpiMeasurements(dbPath,…)`: derive → `recordMeasurements` → `computeSprintKpis` (kendi KpiStore'unu aç/kapat). Exact code: plan Task 6.
### goNogo
- goCriteria: deriveMeasurements 11 ölçümü doğru üretir (retries=2, lines=2000, cost=7…); recordKpiMeasurements uçtan-uca → getResults('default','cost_per_sprint').value=7.
- nogo: deriveMeasurements'da I/O (pure olmalı); tokenUsage yokken crash.

## Task 7: KpiService facade — list sprint views + trend (live fallback)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/kpi/kpi-service.ts, tests/kpi/kpi-service.test.ts
- Scope: src/core/kpi/, tests/kpi/
- Dependencies: 1, 3, 4, 5
### Description
Plan Task 7. `class KpiService(dbPath, {tenantId?, customDefs?})`: `listSprintViews(sprintId): KpiView[]` (sprint'in results'larını definition'lara join; rollup yoksa ama ölçüm varsa **computeSprintKpis ile canlı-hesapla** — aktif-sprint/live yolu), `getTrend(kpiId, n)` (results periodKey'e göre, eski→yeni reverse), `close()`. Single evaluator yolu (Task 5) — drift yok. Exact code: plan Task 7.
### goNogo
- goCriteria: listSprintViews definition+değer+status birlikte döner (title.tr='Sprint Başına Maliyet'); rollup'lanmamış sprintte canlı-hesap; getTrend 2-sprint serisi [7,5] döndürür.
- nogo: live ve rollup yollarının farklı formül-motoru kullanması.

## Task 8: wire collection into sprint-finalizer (non-blocking hook)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, tests/kpi/finalizer-hook.test.ts
- Scope: src/orchestra/, tests/kpi/
- Dependencies: 6
### Description
Plan Task 8. `sprint-finalizer.ts`'e (a) **exported** `buildUsageTotals(results): UsageTotals` — `TaskResult.tokenUsage` topla, cost = tokens × Opus-tier public fiyat (in 5e-6, out 25e-6, cacheRead 0.5e-6); `TODO(phase2)`: limit-ledger ground-truth. (b) `finalizeSprint` içinde `sprint.metrics = metrics;` SONRASI (~satır 693) **non-blocking** hook: `try { recordKpiMeasurements(join(projectRoot,'.brain','memory.db'), sprint.id, metrics, results, buildUsageTotals(results)); } catch (e) { debugLog(...); }`. Mevcut finalize davranışı byte-for-byte korunur. Exact code: plan Task 8.
### goNogo
- goCriteria: buildUsageTotals tokenUsage'ı toplar + cost>0; tokenUsage-yok→sıfırlar; hook non-blocking (atılan hata sprinti fail etmez); `npm run lint` finalizer'da 0-yeni-hata.
- nogo: hook'un sprinti bloke/fail etmesi; mevcut finalize çıktısının değişmesi.

## Task 9: i18n labels + `deckent kpi` CLI command (Tier-1)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/cli/commands/kpi.ts, src/cli/index.ts, src/cli/helpers/messages.ts, tests/kpi/kpi-format.test.ts
- Scope: src/cli/, tests/kpi/
- Dependencies: 7
### Description
Plan Task 9. `messages.ts`'e `kpi.*` anahtarları (en/tr): header_kpi/value/target/status, no_data, title. `kpi.ts`: `registerKpi(program)` — `deckent kpi [--sprint <id>] [--json]`; current-sprint çözümü (`.deckent/current-sprint`, status komutu deseni); `KpiService.listSprintViews` → table (i18n header + title[lang] + `formatKpiValue` + yön-oku ↓/↑ + status) veya `--json`. **exported** `formatKpiValue(value,format)` (currency `$x.xx`, percent `x.x%`, number locale, null→`—`). `src/cli/index.ts buildProgram()`'a `registerKpi(program)` ekle (registerUsage yanına). Exact code: plan Task 9.
### goNogo
- goCriteria: formatKpiValue currency/percent/number/null doğru; `deckent kpi --json` geçerli JSON (kpis[]); table i18n (tr/en) + yön-oku; index.ts register'lı; tsc 0-yeni.
- nogo: hardcode TR/EN string (getMessage zorunlu); current-sprint çözümü uydurma kaynak.
Smoke: node dist/cli/entry.js kpi --json → bu sprintin (KPI Faz-1) gerçek hesaplı KPI'larını içeren JSON (kpis[] boş değil, cost_per_sprint value sayısal)

## Task 10: retro scorecard section + real-binary smoke (proof-of-function)
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/kpi/scorecard.ts, src/orchestra/sprint-retro-writer.ts, tests/kpi/scorecard.test.ts, tests/kpi/kpi-cli.smoke.test.ts
- Scope: src/core/kpi/, src/orchestra/, tests/kpi/
- Dependencies: 7, 9
### Description
Plan Task 10. `scorecard.ts`: `renderScorecardMarkdown(sprintId, views, lang): string` (KPI markdown tablosu; `formatKpiValue` Task 9'dan import; boş-views→''). `sprint-retro-writer.ts`: mevcut token-usage bölümü sonrası **non-blocking** KPI Scorecard bölümü ekle (`try{ KpiService.listSprintViews → renderScorecardMarkdown }catch{}`; retroyu bloke etmez). `kpi-cli.smoke.test.ts`: **gerçek-binary** — `recordKpiMeasurements` ile memory.db seed et, `dist/cli/entry.js kpi --json` çalıştır, GERÇEK stdout'ta `cost_per_sprint.value===7` assert; `dist` yoksa graceful-skip. Exact code: plan Task 10.
### goNogo
- goCriteria: renderScorecardMarkdown '### KPI Scorecard' + değer + status; boş→''; retro hook non-blocking; smoke (dist varsa) gerçek stdout'ta hesaplı değer assert eder; `npx vitest run tests/kpi/` tümü yeşil.
- nogo: scorecard'ın retroyu fail etmesi; smoke'un mock'a assert etmesi (gerçek-binary zorunlu).
Smoke: npm run build && node dist/cli/entry.js kpi --json → KPI Scorecard değerleri gerçek-binary'den okunur (mock değil)

## Task 11: docs — spec/MASTER-PLAN/ADR durum güncelle (no-silent-debt)
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/superpowers/specs/2026-06-26-kpi-system-design.md, docs/MASTER-PLAN.md
- Scope: docs/
- Dependencies: 10
### Description
Spec §13'ü "Faz 1 ✅ implemente (collection→store→rollup→evaluator→8 KPI→CLI/retro, tenant-aware)" olarak güncelle. `docs/MASTER-PLAN.md` §10'a KPI Faz-1 satırı + açık follow-up (Faz-2: tool_calls/PR/ADR/bug enstrümantasyonu + dashboard/API/MCP/Telegram; Faz-3: enterprise multi-tenant + SLO). Kalan iş açıkça işaretli (over-claim YOK). 
### goNogo
- goCriteria: spec+MASTER-PLAN Faz-1'i live yansıtır; Faz-2/3 follow-up işaretli; lint:link/lint:adr yeşil.
- nogo: Faz-2/3 yokken "KPI sistemi tam" demek (over-claim).

---

# ═══ APPENDED WORKSTREAM — PROVIDER-AGNOSTIC WORKER-PROMPT & CACHE ARCHITECTURE (dogfood) ═══
> **Appended 2026-06-27 (Alperen) — additive; the KPI Phase-1 tasks (Task 1–11) above are UNTOUCHED.**
> **Records of truth (READ FIRST):** Spec `docs/superpowers/specs/2026-06-26-worker-prompt-provider-cache-architecture-design.md`
> (Pillar 1 prompt-representation · 2 tiered-prefix · 3 provider cache-adapter 5-archetype · 4 catalog-source ·
> 5 two-regime cost · 6 protected-set). Each Task 12–22 maps to a spec pillar/phase.
> MASTER-PLAN code: **F1-PCACHE** (§14.B). Cross-ref F1-TOK (cache economics) · F1-009r (models.dev catalog) · F1-012 (provider registry).

## 🔒 BAĞLAYICI — bu workstream'in her task'ı (3 Yasa anchor)
- **PROVIDER-AGNOSTIC (Law #2):** Claude varsayımı YOK; tek prompt-builder + tek arketip taksonomisi; desteklenmeyen provider **dürüstçe fail** eder (sessiz "claude"a düşmez).
- **DATA-DIŞ / LOGIC-ÇEKİRDEK:** fiyat/limit/cache-alanı/model-listesi **swappable catalog-source**'tan gelir; cache **arketip + emit MANTIĞI** çekirdektedir. **Hiçbir dış katalog (models.dev/OpenRouter) runtime bağımlılığı DEĞİL** — yalnız sync-time enrichment; LocalStatic (`.deckent/cost-config.json`) offline-default her zaman çalışır.
- **HOT-PATH NETWORK-ZERO:** catalog source'lar yalnız sync-time network yapar; spawn/runtime yolu internal registry'den okur, ağ yapmaz. Enrichment-source testleri network'ü **mock**'lar (gerçek fetch YASAK).
- **DUAL-REGIME cost (Law #1):** subscription (cacheRead≈bedava, cacheWrite baskın — F1-TOK ground-truth) **ve** $-API (ölçülen `cached_tokens` ratio) birinci-sınıf; `cost-calculator.ts:124` `0.70`/`8000` hardcode'u kaldırılır, hit-ratio **ÖLÇÜLÜR** (uydurulmaz).
- **TENANT-AWARE baştan:** per-tenant cache-key (`prompt_cache_key`/`x-grok-conv-id`/`cache_salt`) + **cross-tenant cache-bleed sızıntı testi** zorunlu (milyon-tenant).
- **İKİ-PROMPT-YOL PARİTESİ:** her invariant hem `buildTaskPrompt` (CLI/Codex/Gemini) hem Ollama agentic `buildSystemPrompt` yolunda garanti edilir.
- **ADDITIVE / SURGICAL / BYTE-FOR-BYTE:** mevcut davranış korunur; `prompt-god-template` reorder **flag-gated (default-off)** + `tests/orchestra/prompt-determinism.test.ts` byte-order korunur; `cost-calculator` mevcut export-API'si korunur (regime additive); cache-pricing adapter'da HARDCODE edilmez (registry'den) — **UNCONFIRMED** provider sayıları (xAI/Together…) bir adapter kodlanmadan yeniden-doğrulanır + in-code işaretlenir.
- **HERMETİK test:** tmpdir, **mock-network**, async, no spawnSync, no HOME-leak; ESM `.js` zorunlu; `tsc --noEmit` 0-yeni-hata; affected-suite + ci-sim yeşil. **i18n-first** (kullanıcı-görünür string `getMessage`). **No haiku** (kod). **NO-TECH-DEBT** (placeholder yok; gerekçeli `TODO(phaseN)` istisna).
- **TIER-0 (internal/structural):** tüm task'lar `src/core`·`src/orchestra`·`src/providers`·`src/agents` — unit-test-sufficient (kullanıcı-yüzeyi yok → `Smoke:` gerekmez).

---

## Task 12: catalog-source port + normalized types + CacheArchetype enum (foundation)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/catalog/types.ts, src/core/catalog/catalog-source.ts, tests/catalog/catalog-types.test.ts
- Scope: src/core/catalog/, tests/catalog/
- Dependencies: 0
### Description
Spec Pillar 4. `types.ts`: normalized `CatalogEntry` (`providerId, modelId, apiStyle, contextLimit, outputLimit, price:{input,output,cacheRead,cacheWrite}, cacheArchetype, cacheVerifyField, minCacheablePrefix?, sourceId, confidence:'confirmed'|'unconfirmed'}`) + `CacheArchetype` enum (`'IMPLICIT_AUTO'|'EXPLICIT_MARKER'|'EXPLICIT_RESOURCE'|'LOCAL_KV'|'NONE'`) + `Regime` (`'subscription'|'api'|'local'`). `catalog-source.ts`: `interface ModelCatalogSource { id: string; fetch(): Promise<CatalogEntry[]> }` (port) + provider-id normalize map (kimi→moonshotai, qwen→alibaba, grok→xai, together→togetherai, fireworks→fireworks-ai). Pure types + port, no I/O.
### goNogo
- goCriteria: CatalogEntry/CacheArchetype/Regime export'lu; ModelCatalogSource port imzası net; id-normalize map 5 alias doğru; tsc 0-yeni.
- nogo: port'a I/O/network gömmek; cache-pricing'i tipe hardcode etmek (veri runtime'da gelir).

## Task 13: LocalStaticSource + catalog-registry (offline-first SSOT, precedence merge)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/core/catalog/local-static-source.ts, src/core/catalog/catalog-registry.ts, tests/catalog/catalog-registry.test.ts
- Scope: src/core/catalog/, tests/catalog/
- Dependencies: 12
### Description
Spec Pillar 4. `LocalStaticSource` implements `ModelCatalogSource` — `.deckent/cost-config.json`'ı (mevcut local kaynak) okur, normalize → `CatalogEntry[]` (offline DEFAULT; ağ yok). `catalog-registry.ts`: `class CatalogRegistry` — `register(source)`, `sync()` (her `source.fetch` → merge), `get(provider, model): CatalogEntry|undefined`, precedence merge `custom > local-override > enrichment > builtin-default` (config.ts 3-layer merge desenini izle). **Runtime yalnız `registry.get`'i okur; sync-time enrichment ayrı.** Kaynak yoksa/boşsa LocalStatic ile çalışır (graceful).
### goNogo
- goCriteria: LocalStatic cost-config.json'dan CatalogEntry üretir; registry precedence (custom üste yazar) doğru; **offline test** (yalnız LocalStatic, ağ yok) → registry.get çalışır; bilinmeyen model → undefined (crash yok).
- nogo: registry.get'in network yapması; cost-config.json yokken crash; precedence-sırası ihlali.

## Task 14: ModelsDevSource + OpenRouterSource (optional enrichment, sync-time, mock-network)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/catalog/models-dev-source.ts, src/core/catalog/openrouter-source.ts, tests/catalog/enrichment-sources.test.ts
- Scope: src/core/catalog/, tests/catalog/
- Dependencies: 12, 13
### Description
Spec Pillar 4. `ModelsDevSource` (`https://models.dev/api.json`) ve `OpenRouterSource` (`/models`) implement `ModelCatalogSource` — her biri kendi şemasını **adapter sınırında normalize** eder (`cost.cache_read→price.cacheRead`, `cost.cache_write→price.cacheWrite`; id-normalize Task 12 map). **Opsiyonel enrichment**: çekirdek bunlara bağlı değil; fetch hata/timeout → boş[] döner + log (LocalStatic'i bozmaz). Network **yalnız sync-time**; testler `fetch`'i **mock**'lar (gerçek HTTP YASAK — hermetik).
### goNogo
- goCriteria: ModelsDev/OpenRouter mock-JSON'dan CatalogEntry'ye normalize eder; cache_read/cache_write doğru maplenir; fetch-fail → boş[] + log (throw yok); registry'ye register edilince enrichment-precedence doğru.
- nogo: testte gerçek network; fetch-fail'in sprinti/registry'yi bozması; çekirdeğin bu source'lara runtime-bağımlı olması.

## Task 15: cache-archetype classification (A–E core logic, per-provider map)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/catalog/cache-archetype.ts, tests/catalog/cache-archetype.test.ts
- Scope: src/core/catalog/, tests/catalog/
- Dependencies: 12
### Description
Spec Pillar 3. `classifyArchetype(providerId): CacheArchetype` + `cacheVerifyField(providerId): string` — **çekirdek MANTIĞI, KATALOG-VERİSİNDEN GELMEZ**: A·IMPLICIT_AUTO (openai, deepseek, gemini-impl, mistral, xai, glm, groq, together, fireworks, qwen-impl, claude-cli) · B·EXPLICIT_MARKER (anthropic-api/bedrock/vertex, qwen-explicit) · C·EXPLICIT_RESOURCE (gemini-cachedcontent, moonshotai) · D·LOCAL_KV (vllm, llamacpp, ollama) · E·NONE (cohere). Verify-field map (deepseek→`prompt_cache_hit_tokens`, anthropic→`cache_read_input_tokens`, gemini→`cachedContentTokenCount`, others→`prompt_tokens_details.cached_tokens`). Bilinmeyen provider → arketip-belirsiz + **dürüst sinyal** (sessiz default YOK).
### goNogo
- goCriteria: 5 arketip doğru sınıflar (openai→A, anthropic-api→B, gemini-cache→C, ollama→D, cohere→E); verify-field map doğru; bilinmeyen-provider dürüst işaret (Law #2).
- nogo: arketibi katalog-source'tan okumak (mantık çekirdekte); bilinmeyeni sessizce A/claude saymak.

## Task 16: regime-aware cost-calculator rewrite (registry-fed; kill 0.70/8000 hardcodes)
- Model: opus
- Effort: high
- Agent: data-engineer
- Skills: typescript-expert, testing-expert
- Files: src/core/cost-calculator.ts, tests/core/cost-calculator-regime.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 13, 15
### Description
Spec Pillar 5. `cost-calculator.ts`'i regime-aware yap: **subscription** (limit-eşdeğeri = `in·$in + out·$out + cacheWrite·1.25$in`; **cacheRead ağırlık 0** — F1-TOK ground-truth) · **$-API** (per-model fiyat registry'den (Task 13); hit-ratio `cached_tokens`'tan ÖLÇÜLÜR, varsayılmaz) · **local** ($0). `DEFAULT_CACHE_HIT_RATIO=0.70` + `DEFAULT_CACHEABLE_CONTEXT=8000` (`:124/:126`) **kaldırılır**. **Mevcut export-API + çağıranlar korunur** (additive regime param, default = mevcut davranış); mevcut cost-calculator testleri yeşil kalır.
### goNogo
- goCriteria: subscription burn-unit cacheRead'i sıfır-ağırlık sayar, cacheWrite'ı 1.25×in ile; $-API per-model fiyatı registry'den çeker + ölçülen ratio; local=$0; `0.70`/`8000` sabitleri kodda YOK; mevcut cost-calc testleri yeşil.
- nogo: cacheRead'i subscription'da ücretlendirmek; hit-ratio'yu sabit varsaymak; mevcut export-imzasını kırmak.

## Task 17: ProviderCacheAdapter interface + A/B/D/E impls + extractCacheUsage
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/providers/cache-adapter.ts, tests/providers/cache-adapter.test.ts
- Scope: src/providers/, tests/providers/
- Dependencies: 15
### Description
Spec Pillar 3. `interface ProviderCacheAdapter { archetype; emit(segmented, tenantKey): ProviderCachePayload; extractCacheUsage(raw): {cacheReadTokens, cacheCreationTokens, source} }` + impl'ler: **A** (marker yok; byte-stabil prefix + tenant cache-key emit: `prompt_cache_key`/`x-grok-conv-id`) · **B** (`cache_control` breakpoint'i T0/T1 sınırına, ≤4) · **D** (byte-exact prefix + `cache_salt` tenant-izolasyon) · **E** (no-op + dürüst "cache yok" işareti). `extractCacheUsage` provider verify-field'ından (Task 15) okur; alan yoksa `source:'unmeasured'` (uydurma sayı YOK).
### goNogo
- goCriteria: A tenant-key emit eder + prefix'e dokunmaz; B breakpoint'i doğru sınıra koyar (≤4); D cache_salt ile tenant-izole; E no-op+işaret; extractCacheUsage 3 provider-şeklini doğru parse eder; alan-yok→`unmeasured`.
- nogo: cache-pricing'i adapter'da hardcode; ölçülmeyen cache'i sayıya uydurmak; E'yi sessiz-cache gibi göstermek.

## Task 18: ProviderCacheAdapter C (EXPLICIT-RESOURCE) — create→use→delete lifecycle + storage guard
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/providers/cache-adapter-resource.ts, tests/providers/cache-adapter-resource.test.ts
- Scope: src/providers/, tests/providers/
- Dependencies: 17
### Description
Spec Pillar 3 (Archetype-C hazard). Gemini `CachedContent` + Kimi/Moonshot explicit cache için `ResourceCacheAdapter implements ProviderCacheAdapter` — **lifecycle**: `createCache(prefix)→reference(handle)→deleteCache(handle)`; fan-out'ta cache fatura-açık kalmaz (Kimi ¥10/M-tok/dk storage, Gemini $1-4.5/M/saat). **delete-guard**: hata/exception'da bile faturalı cache **best-effort silinir** + ledger'a yazılır (leaked-storage YOK). Network mock'lı test.
### goNogo
- goCriteria: create→use→delete tam döngü; exception'da delete yine çağrılır (leaked-storage yok) testi GREEN; handle-ref doğru iletilir; storage-süre ledger'a düşer.
- nogo: create edip delete etmemek (storage sızıntısı); delete-fail'in sessiz yutulması.

## Task 19: prompt-god-template hardening — tiered T0/T1/T2 segmentation + verify-precedence-always + protected-set diff test
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/orchestra/prompt-segmentation.ts, src/orchestra/prompt-god-template.ts, tests/orchestra/prompt-segmentation.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 0
### Description
Spec Pillar 1+2+6. `prompt-segmentation.ts`: T0 (global worker-contract/Karpathy/verify-precedence) / T1 (tenant-proje: persona/skills/ADR-operative) / T2 (volatile tail: task/scope/goNogo) sınıflandırma + per-(tenant,task-class) **byte-stable** prefix. `prompt-god-template.ts`: **flag-gated (default-off)** leading-T0 reorder; `verify-precedence` notunu **koşulsuz/protected** yap (`:953` `verificationMode` gate'i kaldır → her zaman emit). `tests/orchestra/prompt-determinism.test.ts` byte-order **korunur**; yeni `prompt-protected-set` diff testi: derlenen prompt'taki scope/goNogo/verify-precedence kaynakla diff-equal mi.
### goNogo
- goCriteria: T0/T1/T2 sınıflama doğru; aynı task-class'ta prefix byte-identik, varyasyon yalnız T2'de; verify-precedence koşulsuz emit; reorder flag-default-off; **prompt-determinism.test.ts yeşil**; protected-set diff testi (scope/goNogo/verify) GREEN.
- nogo: determinism testini kırmak; reorder'ı default-on yapmak; protected-set'i (scope/goNogo/verify) yeniden-sözcüklemek/düşürmek.

## Task 20: ADR operative-state structured schema (enforcement_level / exceptions / flag_gating)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, database-migration
- Files: src/core/adr-operative-state.ts, src/core/adr-seed.ts, tests/core/adr-operative-state.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 0
### Description
Spec Pillar 6 (protected-set diff ön-koşulu). `adr-operative-state.ts`: ADR `metadata` JSON-blob'una makine-okunur alanlar (`enforcementLevel:'soft'|'hard'`, `exceptions:string[]`, `flagGating?:string`) — **şema migration YOK** (mevcut metadata blob'unda saklanır) + `readOperativeState(adr)`/`writeOperativeState(adr, state)` + `extractOperative(content)` (mevcut `<!-- worker-operative -->` marker'ını bitir, `adr-selector.ts:411` yarı-adımını tamamla). `adr-seed.ts`: seed-ADR'lere operative-state populate (örn. RBAC→soft + residual exception). Prose'dan değil **alandan** okunur (Auditor false-NO_GO kökü kapanır).
### goNogo
- goCriteria: readOperativeState/writeOperativeState round-trip (metadata blob); seed-ADR'lerde enforcementLevel/exceptions dolu; extractOperative marker'ı doğru çıkarır; mevcut ADR yükleme/akış byte-for-byte korunur.
- nogo: memory-store şema-migration'ı (blob'da sakla); soft/hard'ı yalnız prose'da bırakmak; mevcut ADR davranışını bozmak.

## Task 21: agentic-path parity — Ollama buildSystemPrompt under same protected-set invariants
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/agents/agentic-worker-runner.ts, tests/agents/agentic-prompt-parity.test.ts
- Scope: src/agents/, tests/agents/
- Dependencies: 19, 20
### Description
Spec Pillar 1 (iki-yol paritesi). `agentic-worker-runner.ts:156` `buildSystemPrompt(scope, goNogo)` (Ollama agentic yolu) Task 19'un protected-set invariant'larını taşır: scope/goNogo/verify-precedence/ADR-operative-state aynı garantilerle enjekte edilir — CLI yolunda garanti edilen hiçbir kural agentic yolda sızmaz. Mevcut agentic davranış additive korunur.
### goNogo
- goCriteria: agentic system-prompt scope/goNogo/verify-precedence/operative-ADR içerir; CLI-yol protected-set'i ile **parite** testi GREEN (iki yol aynı invariant kümesini taşır); mevcut agentic-worker testleri yeşil.
- nogo: agentic yolunda protected-set sızıntısı; CLI'ya özel bir kuralın agentic'te eksik kalması.

## Task 22: docs — spec status → implemented + MASTER-PLAN §14.B follow-up (no-silent-debt)
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/superpowers/specs/2026-06-26-worker-prompt-provider-cache-architecture-design.md, docs/MASTER-PLAN.md
- Scope: docs/
- Dependencies: 14, 16, 18, 19, 20, 21
### Description
Spec'e "## Status (implemented)" bölümü ekle (hangi pillar/phase landed, hangi follow-up açık — over-claim YOK; native-API worker yolu + per-provider adapter genişlemesi + UNCONFIRMED-doğrulama açık-işaretli). `docs/MASTER-PLAN.md` §14.B **F1-PCACHE** satırını `[~]`/landed-durumla güncelle + açık follow-up. lint:link/lint:adr yeşil.
### goNogo
- goCriteria: spec Status live yansıtır; F1-PCACHE durumu güncel + follow-up işaretli; lint:link/lint:adr yeşil.
- nogo: implemente-olmayanı "tam" demek (over-claim); UNCONFIRMED provider-sayılarını doğrulanmış gibi yazmak.
