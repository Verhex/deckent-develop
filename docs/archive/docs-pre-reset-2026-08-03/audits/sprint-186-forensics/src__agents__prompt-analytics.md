# Audit: src/agents/prompt-analytics.ts — 2026-05-21

## 1. Inventory

- **LoC:** 473
- **Last modified (git log -1 --format=%cs):** 2026-03-22
- **First commit sprint:** sprint-036 (commit `f95d1178` — "brain.ts split + architectural cleanup")
- **Public exports:**
  - `interface ExperimentResult` — single A/B trial outcome (variant, evaluation, coverage, sprintId)
  - `interface Experiment` — experiment shell (id, agentId, variantA/B, results[], status, createdAt)
  - `interface ExperimentAnalysis` — winner determination output (winner, confidencePercent, sampleSize, aStats/bStats)
  - `interface PromptMetricsReport` — per-agent prompt performance summary
  - `class PromptABTester` — A/B test lifecycle (create/get/record/analyze/complete), persists to `.deckent/experiments/<agentId>/<id>.json`
  - `class PromptMetrics` — version-trend analytics (collectMetrics, formatMetricsReport)
  - `class PromptAnalytics` — unified facade combining ABTester + Metrics, single entry point
- **Direct imports:**
  - `node:fs` — `existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync` (sync I/O)
  - `node:path` — `join`
  - `../core/errors.js` — `ErrorRegistry` (DECKENT_E064/E065/E066)
  - `./prompt-version.js` — `PromptVersion` type only
- **Reverse dependencies (grep -r "prompt-analytics" src/ tests/):**
  - `src/agents/prompt-ab-test.ts` — re-export stub (`PromptABTester` + 3 types)
  - `src/agents/prompt-metrics.ts` — re-export stub (`PromptMetrics` + `PromptMetricsReport` type)
  - `tests/agents/prompt-analytics.test.ts` — primary test surface (35 references to symbols)
  - Indirect (via stubs): `tests/agents/prompt-ab-test.test.ts`, `tests/agents/prompt-metrics.test.ts` (backward-compat coverage)

## 2. Bağlam (Architectural Context)

- **Katman:** `src/agents/` — Worker execution + prompt engineering layer (per CLAUDE.md "Architecture / agents/" entry).
- **Sub-system role:** Adaptive prompt-engineering subsystem'in **ölçüm + deney** ayağı. `PromptVersion` (prompt-version.ts) ile birlikte agent prompt'larının evrimini tetikler:
  - `PromptABTester` iki prompt varyantını rastgele dağıtıp sonuçları biriktirir
  - `PromptMetrics` versiyon serisinin trendini hesaplar (improving/declining/stable)
  - `PromptAnalytics` her ikisini tek facade'de birleştirir — agent-pool ve evolution-pipeline tüketicisi
- **ADR-related:**
  - **ADR-001 (TypeScript + ESM)** — modül yalnızca `interface`/`class` exports, ESM uyumlu
  - **ADR-002 (Node16 — `.js` suffix)** — tüm internal import'lar `.js` uzantısı ile (`../core/errors.js`, `./prompt-version.js`)
  - **ADR-005 (Synchronous I/O — DEPRECATED)** — modül sync `existsSync/readFileSync/writeFileSync/mkdirSync/readdirSync` kullanıyor; ADR-005 deprecated olduğundan bu kalıbın koruması yok ama yeni async pattern'le replace edilmesi öncelikli değil (sprint-end I/O, hot-path değil)
  - **ADR-008 (Brain Merkezi Import — Tek Yönlü)** — bu dosya `orchestra/` modüllerinden hiçbir şey import etmez; tek-yönlü bağımlılık korunuyor (agents ← core)
  - **ADR-038 (Dead Code Disposition)** — re-export stub'lar (`prompt-ab-test.ts`, `prompt-metrics.ts`) backward-compat için tutuluyor — Sprint 036 consolidation kalıntısı

## 3. Debt Risk

| Risk Area | Severity | Evidence (file:line) | Recommendation |
|-----------|----------|----------------------|----------------|
| `Math.random()` ile experiment ID (`generateId`) | low | `prompt-analytics.ts:62-64` | crypto.randomUUID() ile değiştir — collision riski düşük ama testlerde determinism için seed enjeksiyonu eklenebilir |
| `Math.random()` ile variant assignment (`assignVariant`) | medium | `prompt-analytics.ts:122-124` | 50/50 random; küçük sample'larda dağılım dengesizliği oluşturabilir → deterministik round-robin veya stratified assignment seçeneği değerlendirilebilir |
| Silent error swallowing (`_loadExperiments` JSON parse, dir read) | medium | `prompt-analytics.ts:265-271` | malformed JSON ve `readdirSync` hataları sessizce yutuluyor — en azından `process.stderr` ya da `ErrorRegistry.log` çağrısı eklenmeli; aksi halde production'da bozuk experiment dosyaları görünmeden eklenebilir |
| Sync file I/O ısrarı | low | `prompt-analytics.ts:243-271` | sprint-end / dashboard tüketici; hot-path değil. ADR-005 zaten deprecated olduğu için bloke etmez ama async migration listesine yazılmalı |
| `_findBest` / `_findWorst` boundary check (`length === 0` çift kontrol) | low | `prompt-analytics.ts:348-378` | `versions.length === 0` kontrolünden sonra `if (!best) return ...` redundant; `at(0)` ile non-null assertion + erken return tek satıra düşer |
| Magic numbers (0.7/0.3 skor ağırlıkları, 0.05 inconclusive threshold) | low | `prompt-analytics.ts:178-185` | Sabit olarak modül-üstüne çıkarılmalı (`SUCCESS_WEIGHT`, `COVERAGE_WEIGHT`, `WINNER_DIFF_THRESHOLD`) — `MIN_SAMPLES_FOR_WINNER` zaten constants bölümünde |
| `confidencePercent` formülü heuristic, no statistical basis | medium | `prompt-analytics.ts:182` | `Math.min(100, Math.round(diff * 100 * Math.sqrt(sampleSize)))` informel; chi-square / Wald interval gibi gerçek istatistiksel test düşünülmeli — analiz dokümanına "non-statistical confidence" notu eklenmeli |
| `_listAgentDirs` filtreleme yok | low | `prompt-analytics.ts:275-283` | `readdirSync` rastgele dosya da dönebilir; `withFileTypes: true` + `isDirectory()` filtresi temiz olur |
| `getExperiment` O(N agents × M files) lineer arama | low | `prompt-analytics.ts:108-116` | Az sayıda agent için sorun değil; experiment sayısı büyürse `<id>.json` lookup table'ı eklenmeli |
| API surface dual-class + facade (3 sınıf, 2 stub) | medium | `prompt-analytics.ts:68-473` + `prompt-ab-test.ts`, `prompt-metrics.ts` | Kullanıcılar 3 farklı entry-point arasında seçmek zorunda; `PromptAnalytics` tek public API olarak konumlandırılıp diğerleri `@internal` JSDoc tag'i alabilir |

## 4. Dead Code Candidates

- [ ] **`assignVariant` `_experimentId` parametresi underscore prefix** (`prompt-analytics.ts:122`) — parametre kullanılmıyor, "ileride deterministik assignment için" yer tutucu. Ya kaldırılmalı (signature simplify) ya da JSDoc'a açıklama eklenmeli (ADR-038 muhasebesi)
- [ ] **`prompt-ab-test.ts` ve `prompt-metrics.ts` re-export stub'ları** — yalnızca backward-compat için var; grep göstergesi: test'leri hala stub üzerinden import ediyor (`tests/agents/prompt-ab-test.test.ts`, `tests/agents/prompt-metrics.test.ts`). Eğer testler `prompt-analytics.js` üzerine taşınırsa stub'lar deprecate edilebilir. Ancak public API surface olduğundan removal breaking change — gradual deprecation strategy gerekir (ADR-038)
- [ ] **`PromptABTester` ve `PromptMetrics` ayrı public class'lar** — `PromptAnalytics` facade tüm yetenekleri delegate ediyor; ayrı class'ları doğrudan kullanan call-site yok (sadece kendi stub'larından re-export). İçeride `private` yapmak veya `@internal` etiketlemek mümkün
- ADR-038 cross-reference: Sprint 139 Task 51/52 dead-code-disposition manifest'ine "re-export stubs after migration" kategorisi eklenmeli

## 5. Documentation Gaps

- **Public API JSDoc kapsama:**
  - `PromptABTester` class-level: docstring **YOK** (her metot doc'lu ama class amacı kayıtsız)
  - `PromptMetrics` class-level: docstring **YOK**
  - `PromptAnalytics` class-level: docstring **VAR** (line 402-405) — örnek
  - `interface ExperimentResult/Experiment/ExperimentAnalysis/PromptMetricsReport`: property-level docstring **YOK** — alanların anlamı isimden çıkarılıyor (örn. `confidencePercent` neyin yüzdesi?)
  - `generateId`, `isSuccess` helper'ları için docstring yok (private, opsiyonel)
- **Sabitler (line 49-54):** `MIN_SAMPLES_FOR_WINNER=4`, `TREND_WINDOW=3`, `TREND_THRESHOLD=0.05` neden bu değer? — Sprint 036'da seçilmiş, rationale eksik
- **`analyzeExperiment` confidence formülü** (line 178-191): magic weights/formula açıklanmamış, ADR-grade decision olarak ya inline JSDoc ya da ayrı ADR ("ADR-XXX: Prompt A/B Winner Scoring Heuristic") gerekli
- **Stale comments:** `// length > 0 guarantees defined` yorumu (line 352, 371) — `noUncheckedIndexedAccess` veya defansif kontrol için var; `if (!best) return` çift güvence — yorumla kod hafif çelişiyor
- **Cross-reference eksik:** `prompt-analytics.ts` ⇄ `prompt-version.ts` ilişkisi (`PromptVersion.stats.successRate` field'ı tüketiliyor) modül-üstü yorumda belirtilmemiş

## 6. ADR Compliance Check

| ADR | Relevant? | Compliant? | Evidence/Violation |
|-----|-----------|------------|--------------------|
| ADR-001 TypeScript+ESM | yes | yes | `export interface`/`export class` syntax, no CommonJS construct |
| ADR-002 Node16 (.js suffix) | yes | yes | `'../core/errors.js'`, `'./prompt-version.js'` — uzantılar mevcut |
| ADR-003 vitest over Jest | yes (test ekosistemi) | yes | bu dosya production kod; testler `tests/agents/prompt-analytics.test.ts` vitest formatında |
| ADR-004 3-Layer Config Merge | no | n/a | config okumuyor, projectRoot constructor param |
| ADR-005 Sync I/O (deprecated) | yes | partial | sync I/O kullanılıyor ama ADR-005 zaten deprecated; replacement async pattern aktif zorunlu değil |
| ADR-006 spawnSync Security | no | n/a | child_process çağrısı yok |
| ADR-007 SpawnOptions | no | n/a | child_process yok |
| ADR-008 Brain Merkezi Import | yes | yes | `orchestra/` ya da `monitor/` import'u yok; agents → core tek-yönlü |
| ADR-009 DEBT.md Format | no | n/a | DEBT yazma noktası değil |
| ADR-010 Tek Runtime Dependency | yes | yes | sadece `node:fs`, `node:path` stdlib + iç modüller; harici npm bağımlılığı yok |
| ADR-011 readline/promises | no | n/a | CLI prompt yok |
| ADR-012 register\<Name\>(program) | no | n/a | CLI command tanımı değil |
| ADR-035 Verification Protocol Standard | yes | partial | A/B sonuçları `evaluation` string field — Sprint 138 channel codes ile uyumlu mu doğrulanmamış; "DONE"/"GO_WITH_TECH_DEBT" string compare (line 58-60) hard-coded |
| ADR-037 RBAC | yes (worker-domain) | yes (advisory) | yalnızca `.deckent/experiments/<agentId>/` altına yazıyor; cross-agent scope ihlali yok |
| ADR-038 Dead Code Disposition | yes | partial | re-export stub'lar manifest'lenmemiş — Sprint 139 audit results dışı bırakılmış |
| ADR-046 Brain Self-Update | no | n/a | brain self-update lifecycle değil |

## 7. Refactor Recommendations

1. **Magic constants extract** — `prompt-analytics.ts:178-185` → `SUCCESS_WEIGHT=0.7`, `COVERAGE_WEIGHT=0.3`, `WINNER_DIFF_THRESHOLD=0.05` modül-üstü `const`. Effort: low (~5 LoC). Impact: testability + future tuning.
2. **`crypto.randomUUID()` ile `generateId` değişimi** — `prompt-analytics.ts:62-64` — collision-resistant + standartlaşmış. Effort: low (~2 LoC). Impact: deterministik testler için `Math.random()` mock'lamayı azaltır.
3. **Silent error logging** — `prompt-analytics.ts:265-271` — boş `catch {}` blokları `ErrorRegistry.log` veya `console.warn` ile değiştirilmeli. Effort: low (~6 LoC). Impact: production'da malformed experiment dosyalarını teşhis kolaylığı.
4. **`PromptABTester` ve `PromptMetrics` `@internal` tag** — TSDoc `@internal` ile public surface'ten gizle, sadece `PromptAnalytics` resmi entry-point. Effort: low (~2 docstring ekleme). Impact: API yüzeyi netleşir, gradual deprecation path açılır.
5. **`confidencePercent` istatistiksel formül yenileme** — `prompt-analytics.ts:182` heuristic'i Wilson score interval veya basit z-test ile değiştir. Effort: medium (~30 LoC + test). Impact: A/B kararlarının güvenilirliği.
6. **`_listAgentDirs` filtre eklenmesi** — `readdirSync(baseDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)` ile rastgele dosyalardan korunma. Effort: low (~3 LoC). Impact: robust dir scanning.
7. **`assignVariant` deterministik mode** — second param `seed?: number` opsiyonel, test'ler için reproducible variant assignment. Effort: low (~5 LoC). Impact: test flake azalır.
8. **Re-export stub'lar deprecation banner'ı** — `prompt-ab-test.ts` ve `prompt-metrics.ts` head'ine `/** @deprecated Use 'prompt-analytics.ts' directly */` ekle, IDE warning'i tetikle. Effort: low (~2 LoC × 2 dosya). Impact: gradual migration sinyali.
9. **`Experiment` interface JSDoc property docstring'leri** — özellikle `confidencePercent`'in domain'i ([0,100]) ve `winner: 'inconclusive'` durumu net olmalı. Effort: low (~10 LoC docstring). Impact: API self-documentation.
10. **`_findBest`/`_findWorst` simplification** — `versions.length === 0` check sonrası `at(0)!` non-null kullanımı + `reduce` ile tek pass. Effort: low (~10 LoC). Impact: kod daha okunabilir, double-defensive azalır.

## 8. Sprint 187 Follow-up Items

- [ ] **P1** — Magic constants çıkar (Recommendation #1) + `confidencePercent` formülüne ADR yaz (Recommendation #5) — single commit, kod + test güncelleme
- [ ] **P1** — Re-export stub'ları (`prompt-ab-test.ts`, `prompt-metrics.ts`) için `@deprecated` JSDoc banner ekle (Recommendation #8) — public API migration path
- [ ] **P2** — Silent error swallowing'i `ErrorRegistry.log` ile değiştir (Recommendation #3) — yeni `DECKENT_E0XX` error code allocate
- [ ] **P2** — `crypto.randomUUID()` migration (Recommendation #2) + `assignVariant` seed parametresi (Recommendation #7) — test determinism iyileştirmesi
- [ ] **P2** — Interface property-level JSDoc (Recommendation #9) + `PromptABTester`/`PromptMetrics` `@internal` tag (Recommendation #4) — API surface temizliği
- [ ] **P2** — `_listAgentDirs` `withFileTypes` filtresi (Recommendation #6) — robustness
- [ ] **P2** — ADR-035 channel code uyumu doğrulaması — `isSuccess` (line 58-60) "DONE"/"GO_WITH_TECH_DEBT" hard-coded string'leri merkezi enum'a taşı
- [ ] **P0** — ADR-038 manifest'ine "re-export stub" kategorisi ekle (sprint-186 sırasında discover edildi)

## 9. Summary

- **Overall health:** healthy
- **Top 3 priorities:**
  1. Magic constants + non-statistical `confidencePercent` formülü — A/B sonuçlarının güvenilirliği için ADR-grade karar gerekli (P1)
  2. Public API surface temizliği — `PromptAnalytics` tek entry-point, diğer iki sınıf `@internal`, re-export stub'lar deprecated banner (P1)
  3. Silent error swallowing → `ErrorRegistry` ile değiştir + ADR-035 channel code uyumu (P2)

**Notes:**
- Modül **sprint-036'da konsolide edildi** (`prompt-ab-test.ts` + `prompt-metrics.ts` → `prompt-analytics.ts`); o günden 2026-03-22'ye kadar değişmemiş. Stable, low-churn.
- 473 LoC tek dosya — sınır limitin altında (cohesive: A/B + metrics + facade tek konuda)
- ADR-001/002/008/010 tam uyum; ADR-038 partial (stub manifest gap)
- Tests: `tests/agents/prompt-analytics.test.ts` 35 referans ile kapsamlı; refactor yapılırsa test güvenli ağ sağlar
- Production-critical değil ama Prompt Evolution Pipeline'ın ölçüm bacağı — yanlış skor → yanlış prompt seçimi → agent kalite düşüşü zinciri olası
