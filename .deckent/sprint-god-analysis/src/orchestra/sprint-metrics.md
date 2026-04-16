# Analysis: src/orchestra/sprint-metrics.ts
**Task ID:** 142-014 | **Model:** opus | **LoC:** 611 | **Effort:** max

## 1. Amaci (detayli)
Sprint metrik hesaplama ve raporlama modulu. Sprint sonuclarindan metrikler uretir (completed/techdebt/nogo sayilari, coverage, sure, debt), sprint karsilastirmasi yapar, agent/skill performansi hesaplar, token usage tablo olusturur, sure formatlama, Brain self-learning (config onerileri, recurring file error tespiti), sprint number extract eder. Sprint-reporter.ts'den 4-Way Split (Sprint 134) ile ayrilmis.

## 2. Public API
- `formatTokenCount(count)`: string — Token sayisini okunur formata cevirir. JSDoc VAR.
- `buildTokenUsageSection(results)`: string[] — Token usage markdown tablosu. JSDoc VAR.
- `calculateMetrics(sprint, evaluations, results, debt?)`: SprintMetrics — Ana metrik hesaplama. JSDoc VAR.
- `compareWithPreviousSprint(current, previous)`: SprintComparison — Iki sprint karsilastirmasi. JSDoc VAR.
- `readPreviousSprintMetrics(projectRoot, currentSprintId)`: SprintMetrics | null — Onceki sprint metriklerini okur. JSDoc VAR.
- `formatDuration(ms)`: string — Uzun format sure. JSDoc VAR.
- `formatDurationShort(ms)`: string — Kisa format sure. JSDoc VAR.
- `calculateSelfHealingRate(results?)`: SelfHealingRate | null — Self-healing orani. JSDoc VAR.
- `countFirstTryTasks(results?)`: number — Ilk denemede basarili tasklar. JSDoc VAR.
- `countNewTestFiles(results?)`: number — Yeni test dosyalari. JSDoc VAR.
- `countSelfHealedTasks(results?)`: number — Self-heal edilen tasklar. JSDoc VAR.
- `buildAgentPerformance(sprint, evaluations, results, agentMap?)`: AgentPerformanceRow[] — Agent performans tablosu. JSDoc VAR.
- `formatAgentPerformanceTable(rows)`: string[] — Agent markdown tablo. JSDoc VAR.
- `buildSkillPerformance(sprint, evaluations, skillMap?, results?)`: SkillPerformanceRow[] — Skill performans verisi. JSDoc VAR.
- `formatSkillPerformanceTable(rows)`: string[] — Skill markdown tablo. JSDoc VAR.
- `extractSprintNumber(sprintId)`: number | null — Sprint ID'den numara cikar. JSDoc VAR.
- `generateConfigSuggestions(sprintResult)`: ConfigSuggestion[] — Config iyilestirme onerileri. JSDoc VAR.
- `detectRecurringFileErrors(_projectRoot, sprintResults)`: string[] — Tekrarlayan hatali dosyalar. JSDoc VAR.
- `buildBrainInsights(sprintResult, configSuggestions, recurringFiles)`: string — Brain insights markdown. JSDoc VAR.
- Interface exports: `SprintComparison`, `SelfHealingRate`, `AgentPerformanceRow`, `SkillPerformanceRow`, `ConfigSuggestion`.
**JSDoc durumu: TAMAM — tum 19 fonksiyon ve 5 interface belgelenmis.**

## 3. Ic Bagimliliklar
- `../core/types.js` (TaskEvaluation, TaskResult, Sprint, SprintMetrics, DebtItem, TokenUsage)
- `../core/constants.js` (BRAIN_DIR, SPRINTS_DIR)
- `../core/utils.js` (debugLog)
- `./result-collector.js` (buildResultsMap)
**Dongusel bagimllik riski: YOK.**

## 4. Dis Bagimliliklar
- `node:fs` (readFileSync, existsSync, readdirSync)
- `node:path` (join)
**ADR-010 uyumu: TAMAM.**

## 5. Complexity
- **Fonksiyon sayisi:** 19 public + 2 private (readFileSafe, parseSprintLogMetrics)
- **En karmasik fonksiyon:** `buildAgentPerformance` (satir 341-385) — nested loop, Map<> accumulator, sort. Cyclomatic ~6.
- **Ikinci:** `buildSkillPerformance` (satir 419-467) — benzer pattern, Map<> accumulator.
- **Ucuncu:** `detectRecurringFileErrors` (satir 547-577) — triple-nested: sprints → tasks → files. Cyclomatic ~5.
- **Genel:** Fonksiyonlar kucuk ve odakli. 611 LoC buyuk ama iyi ayrilmis.

## 6. Type Safety
- **any sayisi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown: 0**
- **non-null !:** Satir 563: `fileSprintMap.get(f)!.add(sprintId)` — hemen onceki satirda `has()` kontrolu var, guvenli.
- **unsafe cast: 0**
- **Genel:** Mukemmel type safety.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Kullanilmiyor. TAMAM.
- **ADR-008 (brain import):** Brain'den import almaz. TAMAM.
- **ADR-010 (deps):** Sadece Node.js built-in. TAMAM.
- **Memory V2 DB-first:** readPreviousSprintMetrics (satir 157-170) .brain/sprints/*.md dosyalarini okur — sprint log export'u olarak kabul edilebilir. Ama bu fonksiyon da DB'den sorgulanabilir.
- **UYUMLU (iyilestirme potansiyeli var).**

## 8. Test Coverage
- **Test dosyasi: YOK** — `tests/orchestra/sprint-metrics.test.ts` mevcut degil.
- **KRITIK BULGU:** 611 LoC, 19 public fonksiyon, sifir test. Ozellikle extractSprintNumber ve calculateMetrics gibi kritik fonksiyonlar icin test sart.
- **Not:** extractSprintNumber bircok baska modul tarafindan import ediliyor — bu fonksiyonun dogru calismasi sistematik olarak kritik.
- **Onerilen testler:** Minimum 25 test (calculateMetrics edge cases, extractSprintNumber, formatDuration, buildAgentPerformance, generateConfigSuggestions).

## 9. TODO/FIXME/HACK Inventory
**YOK** — Temiz.

## 10. Dead Code
- **detectRecurringFileErrors:** `_projectRoot` parametresi underscore ile prefix'lenmis ama kullanilmiyor (satir 547). Fonksiyon sprint results dizisini alir, projectRoot'a ihtiyaci yok. **POTANSIYEL DEAD PARAMETER.**
- **buildBrainInsights:** Aktif olarak kullaniliyor.
- **Diger fonksiyonlar:** Tumu aktif.

## 11. Security
- **Input validation:** Sayisal hesaplamalarda division-by-zero kontrolu var (satir 108, 198).
- **Dosya okuma:** Sadece .brain/sprints/ dizini — guvenli.
- **Risk: COK DUSUK.**

## 12. Memory V2 Uyumu
- Bu modul dogrudan Memory DB ile etkilesmiyor.
- readPreviousSprintMetrics .brain/sprints/*.md dosyalarini okur — sprint log dosyalari DB'de de olabilir.
- **Potansiyel iyilestirme:** Sprint metrik verisi DB'den sorgulanabilir.
- **UYUMLU.**

## 13. i18n
- formatDuration ciktisi Ingilizce ("minutes", "seconds", "total").
- buildBrainInsights, formatAgentPerformanceTable ciktilari Ingilizce markdown.
- **i18n gap:** Bu metinler retro/rapor icinde kullanici-facing olabilir — TR cevirisi mevcut degil.

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: UYUMLU.
- calculateMetrics JSDoc parametreleri dogru ve aciklayici.
- **generateConfigSuggestions:** noGoRate > 0.5 kontrolu var (satir 513) — ama calculateMetrics'te noGoRate yuzde olarak hesaplaniyor (0-100). Bu threshold 50 olmali, 0.5 degil! **BUG: noGoRate karsilastirmasi hatali.** `noGoRate` 0-100 arasinda doner ama `> 0.5` ile karsilastiriliyor. Bu kosul neredeyse her zaman true olur (herhangi bir NO_GO > 0.5%).

## 15. Performance
- **Sync I/O sayisi:** readFileSync (2), existsSync (1), readdirSync (1) = **TOPLAM 4 sync I/O.**
- **Hot path mi?:** HAYIR — sprint retro/finalize fazinda tek seferlik.
- **buildSkillPerformance:** `results?.find()` satir 447 — O(n*m) where n=tasks, m=results. Kucuk veri setleri icin OK ama Map kullanilabilir.
- **Performans sorunu: MINIMAL.**

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P0** | generateConfigSuggestions: noGoRate threshold 0.5 → 50 olmali (bug: noGoRate 0-100 scale, 0.5 neredeyse her zaman true) |
| **P1** | Test dosyasi olustur: tests/orchestra/sprint-metrics.test.ts (19 fonksiyon, minimum 25 test) |
| **P2** | detectRecurringFileErrors: unused `_projectRoot` parametresi kaldirilmali |
| **P2** | buildSkillPerformance: results.find() → Map lookup ile degistirilmeli |
| **P3** | formatDuration ciktisi i18n-ready yapilabilir |

## Verdict: ANALYZED
