# Audit Report: `src/agents/prompt-analytics.ts`

**Sprint:** sprint-186 (per-file pilot batch 1, task 186-009)
**Auditor:** w-186-009 (doc-writer · typescript-expert · security-specialist)
**Date:** 2026-05-21
**Source LoC:** 474
**Companion test LoC:** `tests/agents/prompt-analytics.test.ts` (full coverage of public API)
**Focus per directive:** ADR-048 (Prompt Lifecycle Contract) + telemetry surface

---

## 1. Inventory

| Aspect | Value |
|--------|-------|
| Path | `src/agents/prompt-analytics.ts` |
| LoC | 474 |
| Module type | TypeScript module — 3 exported classes + 4 exported interfaces, sync fs I/O |
| Imports (runtime) | `node:fs` (`existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`, `readdirSync`), `node:path` (`join`), `../core/errors.js` (`ErrorRegistry`) |
| Imports (type-only) | `./prompt-version.js` (`PromptVersion`) |
| Exports (interfaces) | `ExperimentResult`, `Experiment`, `ExperimentAnalysis`, `PromptMetricsReport` |
| Exports (classes) | `PromptABTester`, `PromptMetrics`, `PromptAnalytics` (unified façade) |
| Public API (PromptABTester) | `createExperiment`, `getActiveExperiment`, `getExperiment`, `assignVariant`, `recordResult`, `analyzeExperiment`, `completeExperiment` |
| Public API (PromptMetrics) | `collectMetrics`, `formatMetricsReport` |
| Public API (PromptAnalytics) | all 9 of the above + `collectMetricsWithExperiment` |
| Internal constants | `EXPERIMENTS_DIR = '.deckent/experiments'`, `MIN_SAMPLES_FOR_WINNER = 4`, `TREND_WINDOW = 3`, `TREND_THRESHOLD = 0.05` |
| Error codes raised | `DECKENT_E064` (duplicate active experiment), `DECKENT_E065` (experiment not found), `DECKENT_E066` (experiment not active) |
| On-disk state | `<projectRoot>/.deckent/experiments/<agentId>/<expId>.json` — JSON snapshots |
| Side effects | `mkdirSync` + `writeFileSync` per `recordResult`/`createExperiment`/`completeExperiment` |
| Async surface | None — all methods sync (fs sync API throughout) |
| Reverse deps in `src/` | **2 dosya, ikisi de salt re-export shim'i** — `src/agents/prompt-ab-test.ts` (10 LoC, dead shim), `src/agents/prompt-metrics.ts` (6 LoC, dead shim). Hiçbir `orchestra/`, `core/`, `monitor/`, `nervous/`, `connectors/`, `cli/`, `mcp/` modülü bu sınıfları **import etmiyor**. |
| Reverse deps in `tests/` | 3 dosya: `tests/agents/prompt-analytics.test.ts` (canonical), `tests/agents/prompt-ab-test.test.ts` (shim üzerinden), `tests/agents/prompt-metrics.test.ts` (shim üzerinden), `tests/core/error-handling-unification.test.ts` (E064–E066 hata kodları için referans), `tests/core/non-null-safety.test.ts` (non-null guard kontrolleri için referans) |
| Random sources | `Math.random()` — variant assignment + `generateId()` (non-cryptographic) |

---

## 2. Baglam (Architectural Context)

`prompt-analytics.ts`, Deckent'in **prompt evolution + telemetry** boru hattının analytical-leg'ini temsil eder. Header yorumu açıkça "Unified module combining prompt metrics collection and A/B testing. Merges prompt-metrics.ts and prompt-ab-test.ts into a single cohesive module." der — yani bir önceki sprint döneminde (muhtemelen Sprint 141, `archive/sprints/sprint-141/` altındaki audit dosyalarıyla uyumlu) iki ayrı dosya birleştirilmiş, eski isimler backward-compat için stub olarak bırakılmıştır.

**Tasarlanan rol (header + ADR-048 referansından çıkarılan):**
- `PromptABTester` — bir agent prompt'unun iki varyantını sprintler boyunca dener, sonuçları diske JSON olarak yazar, analiz fonksiyonuyla kazanan varyantı (veya `inconclusive`) raporlar.
- `PromptMetrics` — `PromptVersion[]` üzerinden en iyi/en kötü versiyon, current success rate ve 3-versiyonluk pencerede trend (improving/declining/stable) hesaplar.
- `PromptAnalytics` — üst seviye façade, her iki alt-sınıfa delege eder + `collectMetricsWithExperiment` ile aktif experiment'i otomatik çeker.

**Mantıksal bağlanma noktaları (beklenen):**
| Beklenen çağıran | Mevcut mu? | Not |
|------------------|-----------|-----|
| `prompt-evolution.ts` (önerinin uygulanması) | ❌ kontrol gerekli | İsim akrabası ama PromptAnalytics'i import etmiyor (grep negatif) |
| `prompt-version.ts` (versiyon kayıt) | ❌ ters bağ | `PromptVersion` tipi *bu* dosyaya import ediliyor, geri yok |
| `sprint-controller.ts` finalize fazı | ❌ | grep negatif |
| `agent-pool.ts` (agent stats güncellemesi) | ❌ | grep negatif |
| `worker-event-hook` / `notification-dispatcher` | ❌ | grep negatif |
| Brain ↔ Auditor verify pipeline (ADR-035) | ❌ | grep negatif |

**Sonuç (architectural):** Modül **production runtime'da çağrılmıyor**. ADR-048'in (Prompt Lifecycle Contract) "telemetry" katmanı olarak tasarlanmış görünüyor ancak telemetry üretiyor ama tüketici yok — observable bir "ölü-çıkış" (dead-egress) yüzeyidir. Karşılaştırma için: `adaptive-agent.ts` (task 186-001) da aynı durumda — Sprint 141'den miras kalan prompt-evolution kuşağı production-wired değil.

---

## 3. Debt Risk

| Risk | Severity | Evidence | Notes |
|------|---------|----------|-------|
| **Üretim çağıranı yok** — telemetry üretici var, tüketici yok | HIGH | `grep -rn "PromptAnalytics\|PromptABTester\|PromptMetrics" src/` → sadece bu dosya ve 2 re-export shim'i | ADR-048 "Prompt Lifecycle" tam değil; lifecycle "collect → analyze → act" üçlüsünün üçüncü ayağı bağlanmamış. |
| **Senkron fs I/O** | MEDIUM | `writeFileSync` (L244–248), `readFileSync` (L260), `readdirSync` (L256, L279), `mkdirSync` (L243) | ADR-005 "Synchronous I/O" deprecated. Off-hot-path olduğu için bloke etmez ama sprint sayısı 200+ olduğunda I/O burst yaratabilir. |
| **Math.random güvensiz ID + variant** | LOW (analytics scope) | `generateId()` L62–64, `assignVariant` L122–124 | Kriptografik değil; A/B variant atamasında istatistiksel bias kaynağı değil ama experiment ID çakışması teorik olarak mümkün (timestamp + 6-char base36 = düşük entropi). |
| **Sessiz catch blokları** | MEDIUM | L265–267 (malformed JSON), L269–271 (dir read), L280–282 (`_listAgentDirs`) | Diskte bozulan deneyimler iz bırakmadan yok sayılıyor → telemetry kayıp riski (ADR-044 Sprint State Observability Contract ihlali yumuşak). |
| **Sihirli sabitler** | LOW | `MIN_SAMPLES_FOR_WINNER = 4` (L52), `TREND_WINDOW = 3` (L53), `TREND_THRESHOLD = 0.05` (L54), winner threshold `diff < 0.05` (L185), confidence formula (L182) | Konfigüre edilemez; statistical justification doc yok. |
| **Confidence formülü gerçek istatistik değil** | MEDIUM | L182 `Math.min(100, Math.round(diff * 100 * Math.sqrt(sampleSize)))` | İsim "confidence" diyor ama gerçek bir CI/p-value değil; ileride Hybrid Scoring 5-Layer (ADR-055) için yanıltıcı sinyal. |
| **`_findBest`/`_findWorst` length-guard tekrarı** | TRIVIAL | L348–353, L367–372 | TypeScript NonNullable çıkarımı kuvvetli değil; defensive guards okunabilirliği bozuyor. |
| **`assignVariant` parametresi unused** | TRIVIAL | L122 `_experimentId` underscored, hiç okunmuyor | API consistency için tutulmuş — kabul edilebilir. |
| **Test mock fragmanı yok** | LOW | `tests/agents/prompt-analytics.test.ts` real fs (mkdtemp) kullanıyor → temiz ama IO-locked test | Hızlı; ama sandbox kısıtlamalarında flaky olabilir. |

---

## 4. Dead Code Candidates

| Candidate | Evidence | Disposition Önerisi |
|-----------|----------|---------------------|
| `src/agents/prompt-ab-test.ts` (10 LoC) | Sadece `export { PromptABTester } from './prompt-analytics.js'` ve type re-exportları | Production'da 0 caller, sadece `tests/agents/prompt-ab-test.test.ts` shim üzerinden. Test'leri canonical path'e taşıyıp shim'i sil → ADR-038 dead-code disposition. |
| `src/agents/prompt-metrics.ts` (6 LoC) | Sadece `export { PromptMetrics } from './prompt-analytics.js'` ve type re-export | Aynı pattern; aynı disposition. |
| `PromptABTester` (standalone export) | Test dışı `new PromptABTester(` çağrısı: **0** | Façade `PromptAnalytics` zaten delegate ediyor; `PromptABTester` ve `PromptMetrics` ayrı export'larını `@internal` ya da private hâle çevirmek API yüzeyini daraltır. |
| `PromptMetrics` (standalone export) | Test dışı `new PromptMetrics(` çağrısı: **0** | Aynı. |
| `assignVariant` method (`PromptABTester` + `PromptAnalytics`) | Test'lerde çağrılıyor ama production'da 0 çağıran | Lifecycle bağlanana kadar muhtemelen kullanılmayacak; silme erken, bekletilmeli. |
| `formatMetricsReport` | Test'te çağrılıyor ama production'da 0 çağıran (CLI raporlama yüzeyi yok) | Tipik formatter; CLI veya dashboard'a bağlanırsa kalır, aksi halde dead. |
| `collectMetricsWithExperiment` | Production'da 0 çağıran | Aynı kategori — convenience method, lifecycle bağlanmadan değersiz. |

**Grep doğrulamaları:**
```text
$ grep -rn "PromptAnalytics\b" src/ --include='*.ts'
src/agents/prompt-analytics.ts:406:export class PromptAnalytics { ... }
# (no other production hits)

$ grep -rn "new PromptABTester\|new PromptMetrics\|new PromptAnalytics" src/
src/agents/prompt-analytics.ts:411:    this.abTester = new PromptABTester(projectRoot);
src/agents/prompt-analytics.ts:412:    this.metrics = new PromptMetrics();
# (only internal façade wiring)
```

---

## 5. Documentation Gaps

1. **Modül başlık yorumu eksik** — header yalnızca "Unified module combining prompt metrics collection and A/B testing." der; lifecycle'da nereye oturduğu (ADR-048 hangi safhayı temsil ediyor?) açıklanmamış.
2. **Confidence formülünün yorumu yok** — L182 satırında `diff * 100 * sqrt(n)` heuristic'i statistical justification olmadan duruyor; ileride Auditor ya da rule-evolver bu sayıyı yanlış yorumlayabilir.
3. **Skoring ağırlıkları belgesiz** — L178–179 satırlarında `successRate * 0.7 + (avgCoverage/100) * 0.3` — neden 0.7/0.3, neden 0.05 kazanan eşiği, neden 4 minimum örnek? Tek bir yorum cümlesi yok.
4. **JSDoc kapsamı dengesiz** — public methodların çoğu `Brief desc + behavior note` ile minimal yorumlanmış; `@throws`, `@example`, `@returns` JSDoc tag'leri yok. doc-writer agent standardına göre (her public method en az 1 example) ↓ büyük gap.
5. **Error code anlamlandırması yok** — E064/E065/E066 koda yazılı ama yan etkisi (Brain'in evaluator'ı ne yapacak?) belirsiz.
6. **Disk şeması belgesiz** — `.deckent/experiments/<agentId>/<expId>.json` JSON kontratı serileştirilmiş ama versiyon/migration alanı yok; ileride alan eklenirse parse hatası → sessiz catch (L265–267).
7. **`patternsByLang` veya i18n** — ADR-032 i18n için açık olan generator'larla kıyaslandığında, prompt-analytics çıktıları (`formatMetricsReport`) yalnızca İngilizce string'lerle hard-coded.
8. **Telemetry hedefi yok** — eğer bu modül observability boru hattı parçasıysa (ADR-044), event emit, IPC publish veya `notification-dispatcher` çağrısı belgelenmemiş.
9. **`PromptVersion` import-ı re-explained değil** — type-only import → readers `prompt-version.ts`'i okumadıkça `versions[].stats.successRate` şemasını çıkaramaz.

---

## 6. ADR Compliance Check

| ADR | Compliance | Detay |
|-----|-----------|-------|
| **ADR-001 (TypeScript + ESM)** | ✅ | ESM uzantısı `'./prompt-version.js'`, `'../core/errors.js'` — Node16 resolution doğru. |
| **ADR-002 (Node16 module resolution)** | ✅ | Tüm relative import'lar `.js` ile bitiyor. |
| **ADR-005 (Synchronous I/O — DEPRECATED)** | ⚠️ | Off-hot-path olarak kullanılıyor; ADR-005 deprecated olmasına rağmen analytics yazımı için kabul edilebilir ama gelecek refactor adayı. |
| **ADR-006 (spawnSync security)** | N/A | Bu dosyada spawn yok. |
| **ADR-008 (Brain merkezi import / tek yönlü bağımlılık)** | ✅ | Modül core/errors ve agents/prompt-version'a depend ediyor; ters yön yok. |
| **ADR-019 (Language-agnostic worker verify)** | N/A | Test infra'sı değil. |
| **ADR-035 (Brain ↔ Worker ↔ Auditor verification protocol)** | ⚠️ | Modül telemetry üretir ama Brain'in evaluator'ına emit etmez (notification-dispatcher veya event-stream çağrısı yok). |
| **ADR-037 (Brain-Auditor-Worker RBAC Authority Matrix V1.0)** | ✅ | Yalnızca own-state (`.deckent/experiments/`) yazar, scope dışı dosyaya dokunmaz. |
| **ADR-038 (Dead Code Disposition — Sprint 139)** | ⚠️ | İki re-export shim (`prompt-ab-test.ts`, `prompt-metrics.ts`) ve modülün kendisi production'da unwired — dead-code disposition kuralına göre ya bağlanmalı ya emekliye ayrılmalı. |
| **ADR-039 (Self-modifying detection)** | N/A | Self-modifying yüzeyi yok. |
| **ADR-044 (Sprint State Observability Contract)** | ⚠️ | Sessiz catch (L265–271, L280–282) observability contract'ını yumuşak ihlal eder; Auditor pattern emit'i yok. |
| **ADR-046 (Brain Self-Update Hook Architecture)** | N/A | Self-update yüzeyi değil. |
| **ADR-048 (Prompt Lifecycle Contract)** | ⚠️ **Kısmi** | Lifecycle'ın **measure** ayağını sağlar (analyze, collect, trend). Ama **observe** ayağı (event emit, IPC publish) ve **act** ayağı (önerinin uygulanması) yok. Şu anki haliyle ADR-048'in tam contract'ını karşılamaz — bağlanma gerekli. |
| **ADR-055 (Hybrid Scoring 5-Layer — proposed)** | ⚠️ Gelecek risk | "confidence" alanı statistical confidence değil; ADR-055 hybrid scoring katmanı bu sayıyı kullanırsa yanıltıcı sinyal alabilir. |
| **ADR-060 (Self-Awareness Propagation — proposed)** | ⚠️ Gelecek fırsat | `collectMetricsWithExperiment` agent-self-awareness için ideal context kaynağı, ama henüz 5-channel enrichment'a beslemiyor. |

---

## 7. Refactor Recommendations

| Öneri | Effort | Impact | Sprint hedefi |
|-------|--------|--------|----------------|
| **R1 — Re-export shim'leri sil**: `src/agents/prompt-ab-test.ts` ve `src/agents/prompt-metrics.ts` dosyalarını sil; test import path'lerini canonical `'./prompt-analytics.js'`'e taşı. | ~30 dk | Dead surface ortadan kalkar (ADR-038). | Sprint 188 |
| **R2 — Production wiring**: `sprint-controller.ts` finalize fazına `PromptAnalytics.collectMetricsWithExperiment(agentId, versions)` çağrısı ekle ve sonucu `sprint-reporter.ts` retro panel'ine yaz. | 2 sa | ADR-048'in measure → observe ayağı kapanır. | Sprint 188 (öncelik) |
| **R3 — Confidence formülünü yeniden adlandır**: `confidencePercent` → `divergencePercent` veya `effectSizeBps`; gerçek confidence için Wilson interval ekle (opsiyonel). | 1 sa | ADR-055 hybrid scoring layer'ı yanıltmaz. | Sprint 188 |
| **R4 — Sabitler config'e taşı**: `MIN_SAMPLES_FOR_WINNER`, `TREND_WINDOW`, `TREND_THRESHOLD`, score weights (0.7/0.3), winner threshold (0.05) → `.deckent/config.json` `prompt_analytics: { ... }` bloku. | 1 sa | Konfigürasyon yüzeyi ADR-004 3-layer merge'e uyumlu. | Sprint 189 |
| **R5 — Async fs**: `writeFile`/`readFile` (promises) + `await` chain; `_loadExperiments` parallel `Promise.all(files.map(...))` ile. | 2 sa | ADR-005 deprecated path terk edilir; 200+ sprint senaryosunda I/O burst yok. | Sprint 189 |
| **R6 — Telemetry emit**: Her `recordResult` çağrısında `notification-dispatcher` veya `event-stream` üzerinden `prompt.ab.result` event yayınla. | 1 sa | ADR-044 observability tam, ADR-048 observe ayağı kapanır. | Sprint 188 |
| **R7 — Silent-catch loglama**: L265–271 ve L280–282 catch bloklarına `debug-log` veya `ErrorRegistry.warn` ekle (data loss visibility). | 30 dk | ADR-044 ihlali yumuşar. | Sprint 188 |
| **R8 — JSDoc + @example genişletme**: Tüm public method'lara `@throws`, `@example`, `@returns` tag'leri ekle. doc-writer agent standardına ulaşılır. | 1 sa | Documentation gap kapanır (Section 5/1, 5/4, 5/5). | Sprint 188 |
| **R9 — i18n metrik mesajları**: `formatMetricsReport` çıktısını ADR-032 i18n stratejisine taşı (`patternsByLang` analoğu metin lookup). | 1 sa | i18n surface uniform. | Sprint 190 |
| **R10 — `Math.random` → `crypto.randomUUID()`**: `generateId()` collision riski sıfırlanır (TypeScript >= 4.9 / Node 14.17+). | 15 dk | Düşük risk ama "doğru" çözüm. | Sprint 188 |

---

## 8. Sprint 188 Follow-up Items

1. **[BLOCKER for ADR-048]** Production-wire `PromptAnalytics.collectMetricsWithExperiment` to `sprint-controller.ts` finalize phase — without this, ADR-048 "Prompt Lifecycle Contract" stays half-implemented across the codebase (companion files `prompt-evolution.ts`, `prompt-rollback.ts`, `prompt-version.ts` audited under tasks 187-010..187-013 must also be wired together as a single pipeline).
2. **[DECISION REQUIRED]** Decide whether to keep `PromptABTester` and `PromptMetrics` as separate exported classes. If only `PromptAnalytics` façade is the supported API, mark the other two `@internal` and update tests.
3. **[CLEANUP]** Delete dead-shim files `src/agents/prompt-ab-test.ts` + `src/agents/prompt-metrics.ts` per ADR-038 disposition; migrate the 2 companion test files to canonical import path.
4. **[OBSERVABILITY]** Emit a `prompt.ab.result` and `prompt.metrics.snapshot` event via `event-stream.ts` so the dashboard/Auditor pipeline can surface telemetry (ADR-044 + ADR-035).
5. **[CONFIG]** Move magic constants (`MIN_SAMPLES_FOR_WINNER`, `TREND_WINDOW`, `TREND_THRESHOLD`, score weights, winner threshold) into `.deckent/config.json` `prompt_analytics` block.
6. **[STATS]** Replace the confidence heuristic with either (a) honest renaming (`divergencePercent`) or (b) a real Wilson/Agresti–Coull interval — pick before ADR-055 hybrid scoring layer is wired.
7. **[DEBT]** Audit `tests/agents/prompt-ab-test.test.ts` + `tests/agents/prompt-metrics.test.ts` and consolidate into `prompt-analytics.test.ts` (or document why they remain split).
8. **[SECURITY]** Replace `generateId()`'s `Math.random()` with `crypto.randomUUID()`; harmless but defaults Deckent to a hardened cryptographic baseline.
9. **[PARITY]** Confirm via grep that no `cli/` or `mcp/` command exposes `PromptAnalytics` — if not, evaluate whether to add a `deckent prompt:metrics <agent>` CLI for operator visibility (ADR-022 CLI/MCP parity).
10. **[DOC]** Add an architectural diagram to `docs/architecture/` showing the prompt lifecycle (version → experiment → metrics → evolution → rollback) and where each `src/agents/prompt-*.ts` module sits.

---

## 9. Summary

`src/agents/prompt-analytics.ts` is a **474-LoC, well-structured, fully-tested, but production-unwired** module that consolidates A/B testing and metrics collection into a unified façade. Code quality is acceptable — clean class boundaries, defensive null-guards, sync but contained I/O scope (`.deckent/experiments/`), and consistent error-code usage via `ErrorRegistry`. Three error codes (E064–E066) are correctly wired into `core/errors.ts`.

The **architectural concern is not what the module does — it is that nothing calls it**. Production reverse-dependency search returns only the two backward-compat shim files (`prompt-ab-test.ts`, `prompt-metrics.ts`), which are themselves orphan re-exports. No code in `orchestra/`, `core/`, `monitor/`, `nervous/`, `cli/`, or `mcp/` instantiates `PromptAnalytics`. ADR-048 (Prompt Lifecycle Contract) is therefore only **half satisfied**: the *measure* leg exists, but the *observe* (event emit / dispatcher) and *act* (apply suggestion) legs are missing.

**Severity ranking:**
- HIGH: unwired-from-production (R2, F1).
- MEDIUM: silent catches (R7), sync fs at scale (R5), confidence-naming honesty (R3).
- LOW: magic constants (R4), JSDoc gaps (R8), `Math.random` (R10), i18n (R9).
- TRIVIAL: dead-shim cleanup (R1, F3), test consolidation (F7).

**Verdict:** Hold the implementation as-is, but **prioritize wiring (R2 + R6) and dead-shim cleanup (R1 + F3) in Sprint 188**. The module is the closest Deckent has to a production-ready prompt-telemetry layer; finishing the loop unlocks ADR-048 fully, feeds ADR-055 (Hybrid Scoring) honest data, and creates a context source for ADR-060 (Self-Awareness Propagation). Without that wiring, every sprint accrues silent debt — the module produces telemetry no one consumes, the way a black box flight recorder records on a plane no one ever lands.
