# Analysis: src/core/intent-classifier.ts
**Task ID:** 142-003 | **Model:** opus | **LoC:** 393 | **Effort:** max

## 1. Amaci
Intent Classifier, V2 routing engine'in Layer 1 moduludur. Task title + description + scope'undan TaskDNA yapisi uretir. Eski `detectTaskType()` fonksiyonunun yerini alan weighted, multi-signal analiz sistemidir. Primary/secondary intent, domain extraction, operation detection, complexity analysis ve write-scope analysis yapar. Activation engine (Layer 2) ve routing engine (Layer 3) icin giris verisini hazirlar.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `classifyIntent()` | `(task: {title, description, scope: TaskScope}) => TaskDNA` | VAR |
| `detectPrimaryIntent()` | `(text, scope, scopeAnalysis?) => { intent: IntentType, confidence: number }` | EKSIK — fonksiyon exported ama JSDoc minimal |
| `detectSecondaryIntents()` | `(text, scope, primary, scopeAnalysis?) => IntentType[]` | EKSIK — exported, JSDoc minimal |
| `detectDomains()` | `(scope: TaskScope) => Array<{ name, weight }>` | VAR |
| `detectOperations()` | `(text, scope) => Array<{ type, weight }>` | EKSIK — exported, JSDoc yok |
| `analyzeComplexity()` | `(scope: TaskScope) => TaskDNA['complexity']` | EKSIK |
| `analyzeWriteScope()` | `(scope: TaskScope) => TaskDNA['scope']` | EKSIK |
- **JSDoc EKSIK**: 5/7 exported fonksiyon icin detayli JSDoc yok. Sadece `classifyIntent()` ve `detectDomains()` iyi dokumante edilmis.

## 3. Ic Bagimliliklar
- `./task-types.js` — TaskScope
- `./routing-types.js` — TaskDNA, IntentType, OperationType, TaskSize
- Dongusel bagimllik riski: YOK

## 4. Dis Bagimliliklar
- **HIC YOK** — Pure logic modulu.
- ADR-010 uyumu: UYUMLU

## 5. Complexity
- Fonksiyon sayisi: 9 (7 exported + 2 private)
- En karmasik fonksiyon: `detectPrimaryIntent()` (satir 87-182, ~95 satir) — multi-layer scoring, write-ratio analysis, confidence calculation
- Max cyclomatic rough: ~20 (5 for-loop + 8 if + score accumulation)
- `classifyIntent()`: Orchestrator — 5 alt fonksiyonu cagiriyor. Temiz decomposition.

## 6. Type Safety
- **non-null ! assertion**: 2 adet
  - satir 168: `scores[0]!` — scores bos olmadiginda gecerli (satir 160 kontrolu sonrasi). **ANCAK** `scores.length === 0` kontrolu satir 160'ta var, 168'e ulasildiysa scores bos degil. **KABUL EDILEBILIR.**
  - satir 265: `parts[0]!` — `parts.length === 0` kontrolu satir 262'de. **KABUL EDILEBILIR.**
- **any kullanimi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown: 0**
- **as string[]: 0** (tek cast: `intent as IntentType` — satir 102, Object.entries ile gerekli)
- Tip guvenligi: **IYI** — iki non-null assertion guard'li.

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 | N/A | |
| ADR-008 | UYUMLU | core/ icinde |
| ADR-010 | UYUMLU | |
| ADR-028 V1→V2 | **UYUMLU** — Bu V2 routing'in Layer 1'i |
| Memory V2 | N/A | |

## 8. Test Coverage
- `tests/core/intent-classifier.test.ts` — MEVCUT
- Beklenen testler: classifyIntent, detectPrimaryIntent, writeRatio analysis, secondary intents, domain extraction, complexity sizing
- KRITIK TEST: Write ratio analysis (satir 121-133) — testWriteRatio < 0.3 && src/ writes → implementation boost. Bu "CRITICAL FIX" olarak isaretlenmis ve iyi test edilmis olmali.

## 9. TODO/FIXME/HACK Inventory
**HIC YOK** — Ama satir 120'de `// CRITICAL FIX:` yorumu var — bu bir FIXME degil, onceki bug'in cozum dokumantasyonu.

## 10. Dead Code
- Tum exported fonksiyonlar aktif:
  - `classifyIntent()` → routing-engine.ts
  - `detectPrimaryIntent()` → dogrudan test'lerden
  - Diger fonksiyonlar classifyIntent icinden cagirilir ve test'lerden dogrudan erisilebilir.
- `extractDomainFromPath()` private helper — sadece `detectDomains()` icinde. **Aktif.**
- INTENT_KEYWORDS ve OPERATION_KEYWORDS: Tam kullanim. **Aktif.**

## 11. Security
- Pure logic — dosya/ag erisimi yok. Guvenlik riski yok.
- Task title/description user-input olabilir — ama sadece keyword matching yapiliyor, regex injection yok.

## 12. Memory V2 Uyumu
- **UYUMLU** — Memory ile ilgisiz. Pure intent classification.

## 13. i18n
- **KRITIK SORUN**: INTENT_KEYWORDS ve OPERATION_KEYWORDS tamamen **ingilizce**. Eger DIRECTIVES.md turkce yazilmissa (ki yaziliyor!), keyword matching dusuk recall olusturur.
  - Ornek: "guvenlik acigi tara" → "security" keyword'u match etmez.
  - Ornek: "test yaz" → "test" match eder (turkce/ingilizce ayni kelime).
  - **Severity: P1** — DIRECTIVES.md turkce yazildigi icin intent classification kalitesi etkileniyor. Turkce keyword'ler eklenmeli: `security: [..., 'guvenlik', 'kimlik dogrulama', 'yetki']`, `bugfix: [..., 'hata', 'duzelt', 'cokme']`, vb.
- `text.toLowerCase()` — turkce "I"→"i" riski. `turkishNormalize()` kullanilmali.
  - **Severity: P1**

## 14. Dokumantasyon Tutarliligi
- JSDoc: classifyIntent iyi, ama diger 5 exported fonksiyon icin **YETERSIZ**.
- INTENT_KEYWORDS comment ile aciklanmis: 12 intent type listelenmis — routing-types.ts IntentType union ile **TUTARLI**.
- `SCORE_THRESHOLD` satir 128: `3` hardcoded — detectPrimaryIntent icindeki score'lar keyword match sayisina bagli. **Bu threshold configurable degil.**
- `CRITICAL FIX` yorumu (satir 120): Write ratio analysis detayli aciklanmis — **IYIN DOKUMANTASYON.**

## 15. Performance
- **Sync I/O: 0** — Pure logic.
- `classifyIntent()`: 5 fonksiyon cagrisi, her biri O(|keywords| * |scope|). N = typical 10-50 → ihmal edilebilir.
- SCOPE_INTENT_SIGNALS regex matching: 4 regex * (|directories| + |filesWrite|) → tipik 5-20 path → ihmal edilebilir.
- Confidence calculation: O(1).

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P1** | INTENT_KEYWORDS ve OPERATION_KEYWORDS icine turkce keyword'ler ekle. DIRECTIVES.md turkce yazildigi icin intent classification recall'u dusuk. `security: [..., 'guvenlik', 'kimlik', 'yetki']`, `bugfix: [..., 'hata', 'duzelt']`, `testing: [..., 'test', 'sinav']`, `documentation: [..., 'belge', 'dokuman']` |
| **P1** | `text.toLowerCase()` yerine `turkishNormalize()` + `toLowerCase()` kullan. Turkce I/i donusumu icin. |
| **P2** | 5 exported fonksiyon icin JSDoc ekle (detectPrimaryIntent, detectSecondaryIntents, detectOperations, analyzeComplexity, analyzeWriteScope). |
| **P3** | SCOPE_INTENT_SIGNALS configurable yapilabilir (yeni domain ekleme kolayligi). |

## Verdict: ANALYZED
