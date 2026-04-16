# Analysis: src/core/agent-selector.ts
**Task ID:** 142-003 | **Model:** opus | **LoC:** 198 | **Effort:** max

## 1. Amaci
Agent selector, bir task icin en uygun agent'i secen V1 keyword-based routing moduldur. Task basligindan ve aciklamasindan keyword cikarir, agent'larin triggerKeywords/triggerScopes/triggerFilePatterns alanlarina karsi skorlar ve esik ustu en iyi agent'i dondurur. Ayrica, pool'da karsilanmayan keyword pattern'lari tespit edip yeni agent onerisi yapabilir. V2 routing engine (activation-engine.ts + routing-engine.ts) tarafindan supercede edilmek uzere, ama hala fallback olarak aktif.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `extractKeywords()` | `(text: string) => string[]` | VAR |
| `selectAgent()` | `(task, pool) => AgentSelectionResult` | VAR — detayli scoring algoritmasi dokumante edilmis |
| `suggestNewAgent()` | `(tasks[], pool) => { name, keywords, model } \| null` | VAR |

## 3. Ic Bagimliliklar
- `./types.js` — ModelType (suggestNewAgent return tipi icin)
- `./agent-types.js` — AgentDefinition, AgentPool, AgentSelectionResult
- Dongusel bagimllik riski: YOK

## 4. Dis Bagimliliklar
- **HIC YOK** — Pure logic modulu, fs/path yok.
- ADR-010 uyumu: UYUMLU.

## 5. Complexity
- Fonksiyon sayisi: 4 (3 exported + 1 private globMatch)
- En karmasik fonksiyon: `selectAgent()` (satir 79-146, ~67 satir) — uc katmanli scoring + threshold + tie-break
- Max cyclomatic rough: ~10 (3 nested for loop + if'ler)
- `globMatch()`: Regex-based glob simulation — karmasiklik orta.

## 6. Type Safety
- **any kullanimi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown: 0**
- **non-null !: 0**
- Tip guvenligi: **IYIN** — tum tipler AgentDefinition interface'inden geliyor.

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 | N/A | spawn kullanmiyor |
| ADR-008 | UYUMLU | core/ icinde, brain import yok |
| ADR-010 | UYUMLU | Sifir dis bagimllik |
| ADR-028 V1→V2 migration | **DIKKAT** | Bu V1 selector hala aktif. V2 routing-engine.ts `selectAgent` yerine activation-engine kullanmali. Dual-path calisiyorsa, V1 deprecated olmali. |
| Memory V2 | N/A | Memory ile ilgisi yok |

## 8. Test Coverage
- Test dosyasi: `tests/core/agent-selector.test.ts` — MEVCUT
- Beklenen testler: keyword extraction, stopword filtering, scoring, threshold, tie-break, globMatch, suggestNewAgent
- Memory V2 mock: N/A

## 9. TODO/FIXME/HACK Inventory
**HIC YOK**

## 10. Dead Code
- `suggestNewAgent()`: Aktif kullanilip kullanilmadigi kontrol edilmeli. Eger sadece V2 routing kullaniliyorsa, bu fonksiyon orphan olabilir.
  - **Severity: P3** — Rule-evolver.ts veya promotion-pipeline.ts tarafindan cagiriliyor olabilir.
- `globMatch()`: Sadece `selectAgent()` icinde kullaniliyor — **aktif** ama V1 bagimli.
- STOPWORDS set: 80+ kelime — kapsamli, ama "deckent-specific" terimler icermiyor.

## 11. Security
- `globMatch()` (satir 51-62): Kullanici girdisini RegExp'e donusturuyor. `pattern` degeri agent manifest'inden geliyor, kullanici girdisi degil. Ancak `new RegExp()` icinde escape edilmemis ozel karakterler (`.+^${}()|[]\`) `replace()` ile handle ediliyor — **DOGRU implementasyon.**
- ReDoS riski: Pattern `[^/]*` ve `.*` basit — catastrophic backtracking riski **DUSUK**.

## 12. Memory V2 Uyumu
- Memory V2 ile **ilgisiz**. Agent secimi task metadata ve agent manifest'ine dayanir.
- **UYUMLU**

## 13. i18n
- `extractKeywords()` `toLowerCase()` kullaniyor (satir 37). Turkce "I"→"i" donusumu locale-dependent olabilir.
  - **Severity: P3** — Pratikte agent triggerKeywords zaten ingilizce, etki minimal.
- STOPWORDS tamamen ingilizce. Turkce stopword desteği yok — eger DIRECTIVES turkce yazilirsa "bir", "bu", "ve" gibi kelimeler keyword olarak cikarilir.
  - **Severity: P2** — DIRECTIVES.md turkce yazildiginda keyword extraction kalitesi dusebilir.

## 14. Dokumantasyon Tutarliligi
- `selectAgent()` JSDoc'u scoring algoritmesini acikca dokumante ediyor: "+2 keyword, +3 scope, +1 file, threshold >= 3". **TUTARLI** — kodla eslesiyor.
- `suggestNewAgent()` "3+ tasks share keywords" kurali JSDoc'ta acik. **TUTARLI.**
- `SCORE_THRESHOLD = 3`: Hardcoded, configurable degil. DECKENT.md'de referans yok.

## 15. Performance
- **Sync I/O: 0** — Pure logic.
- `selectAgent()`: O(|pool| * |keywords| * max(|triggerKeywords|, |triggerScopes|, |triggerFilePatterns|))
  - Pool = ~16-66 agent, keywords = ~10-30, triggers = ~5-15 → ihmal edilebilir.
- `globMatch()`: Her dosya paterni icin yeni RegExp olusturuluyor — micro-optimization: precompile edilebilir ama 16 agent * 5 pattern = 80 regex — ihmal edilebilir.
- `suggestNewAgent()`: O(|tasks| * |keywords|) — N=10-50 task icin sorun yok.

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P2** | V1/V2 routing duality: `selectAgent()` V1 hala aktifse, V2 activation-engine ile birlikte kullanilip kullanilmadigini netlestir. Eger V2 tamamen wire edilmisse, V1 fonksiyonlari `@deprecated` olarak isaretlenmeli. |
| **P2** | Turkce stopword eksikligi: DIRECTIVES turkce yazildiginda keyword extraction kalitesi dusebilir. Turkce stopword set eklenebilir. |
| **P3** | `globMatch()` icinde precompiled regex cache'i eklenebilir (micro-optimization). |

## Verdict: ANALYZED
