# Analysis: src/core/activation-engine.ts
**Task ID:** 142-003 | **Model:** opus | **LoC:** 270 | **Effort:** max

## 1. Amaci
Activation Engine, V2 routing engine'in Layer 2 moduludur. Intent classifier'dan gelen TaskDNA'yi, agent/skill'lerin activation config'larine (kurallar + exclusion'lar) karsi degerlendirir. Skor toplami yapar, exclusion kontrolu uygular, secondary intent matching (yari skor) saglar. Ayrica V1→V2 migration fonksiyonlari icerir: eski keyword/scope trigger'larini yapilandirilmis activation rule'larina donusturur.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `evaluateActivation()` | `(taskDNA, config: ActivationConfig) => ActivationResult` | VAR |
| `evaluateRuleViaSecondary()` | `(taskDNA, rule) => number` | VAR — detayli aciklama |
| `evaluateRule()` | `(taskDNA, rule) => { matched, score }` | VAR |
| `evaluateExclusion()` | `(taskDNA, exclusion) => boolean` | VAR |
| `migrateV1AgentToActivation()` | `(triggerKeywords, triggerScopes, triggerFilePatterns) => ActivationConfig` | VAR |
| `migrateV1SkillToActivation()` | `(triggers, category, stackDetection) => ActivationConfig` | VAR |

## 3. Ic Bagimliliklar
- `./routing-types.js` — TaskDNA, ActivationConfig, ActivationRule, ExclusionRule, ActivationResult
- `./skill-types.js` — SkillCategory, StackDetectionRule
- `./condition-evaluator.js` — evaluateCondition (Layer 2 → condition engine delegasyonu)
- Dongusel bagimllik riski: YOK — tek-yonlu zincir: activation-engine → condition-evaluator

## 4. Dis Bagimliliklar
- **HIC YOK** — Pure logic.
- ADR-010 uyumu: UYUMLU

## 5. Complexity
- Fonksiyon sayisi: 10 (6 exported + 4 private)
- En karmasik fonksiyon: `evaluateActivation()` (satir 15-56, ~41 satir) — exclusion check + rule scoring + secondary matching
- Max cyclomatic rough: ~10 (2 for-loop + 4 if)
- `migrateV1AgentToActivation()` ve `migrateV1SkillToActivation()`: Migration logic — orta karmasiklik.

## 6. Type Safety
- **non-null ! assertion**: 1 adet — satir 266: `parts[0]!` (extractDomainFromScope icinde). `parts.length === 0` kontrolu (satir 265) sonrasinda, guard mevcut. **KABUL EDILEBILIR.**
- `as string[]` cast: satir 68 — `taskDNA.intent.secondary as string[]`. `IntentType[]` zaten string union, ama `includes()` string parametresi kabul ettigi icin cast gerekli. **Tip sistemi sinirlamasi.**
- **any kullanimi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown: 0**

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 | N/A | |
| ADR-008 | UYUMLU | core/ icinde |
| ADR-010 | UYUMLU | |
| ADR-028 V1→V2 | **UYUMLU** — V1→V2 migration fonksiyonlari mevcut. Bu modul V2'nin kendisi. |
| Memory V2 | N/A | |

## 8. Test Coverage
- `tests/core/activation-engine.test.ts` — MEVCUT
- Beklenen testler: evaluateActivation (normal/excluded), evaluateRule, evaluateRuleViaSecondary (50% scoring), exclusion rules, V1 migration (agent/skill)
- KRITIK TEST: Secondary intent scoring (50% rule) dogru mu? evaluateRuleViaSecondary satir 66-72.

## 9. TODO/FIXME/HACK Inventory
**HIC YOK**

## 10. Dead Code
- `migrateV1AgentToActivation()` ve `migrateV1SkillToActivation()`: V1→V2 migration fonksiyonlari. **Aktif** — manifest-migrator.ts tarafindan kullaniliyor.
- `extractDomainFromScope()` private — sadece `migrateV1AgentToActivation()` icinde. **Aktif.**
- `inferIntentsFromKeywords()` private — her iki migration fonksiyonu tarafindan. **Aktif.**
- `taskDNAToRecord()` private — evaluateRule/evaluateExclusion tarafindan. **Aktif.**
- **Dead code: YOK.**

## 11. Security
- Pure logic — guvenlik riski yok.
- `evaluateCondition()` delegasyonu: condition-evaluator'a guvenilir. Eger condition data disaridan geliyorsa (kullanici manifest'i) ve evaluateCondition icinde `new Function()` veya `eval()` varsa risk olusur — ama condition-evaluator pure path/operator matching yapiyor. **GUVENLI.**

## 12. Memory V2 Uyumu
- **UYUMLU** — Memory ile ilgisiz.

## 13. i18n
- `KEYWORD_TO_INTENT` mapping (satir 234-248): Tamamen ingilizce keyword'ler. Turkce keyword'ler YOK.
  - **Severity: P1** — intent-classifier.ts ile ayni sorun. V1→V2 migration'da turkce trigger'lar kaybolur.
- `extractDomainFromScope()` icinde hardcoded `['index', 'utils']` exclude — ingilizce. Turkce dizin adlari olmadigi icin sorun degil.

## 14. Dokumantasyon Tutarliligi
- JSDoc: Her exported fonksiyon icin mevcut. **IYI.**
- `evaluateRuleViaSecondary()`: "50% score" documantasyonu acik. Kod ile **TUTARLI** (satir 69: `Math.floor(rule.score * 0.5)`).
- Migration fonksiyonlari: V1 field → V2 ActivationConfig donusumu acik. **IYI.**
- `migrateV1SkillToActivation()` icinde language/framework skill'leri icin `{ $not: 'unknown' }` rule'u — bu intent-agnostic activation demek. **POTANSIYEL SORUN**: Language skill her intent icin aktive olur (unknown haric). Bu kasitli mi?
  - **Severity: P2** — TypeScript-expert gibi language skill'ler her task'ta aktif olacak. Dogru davranis ama over-activation riski var.

## 15. Performance
- **Sync I/O: 0** — Pure logic.
- `evaluateActivation()`: O(|exclusions| + |rules|) * evaluateCondition maliyeti. Tipik 5-10 rule → ihmal edilebilir.
- Migration fonksiyonlari: Sprint basinda 1 kez calisir. O(|keywords|) → ihmal edilebilir.

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P1** | `KEYWORD_TO_INTENT` icine turkce keyword'ler ekle (intent-classifier ile paralel). |
| **P2** | Language/framework skill'lerin `{ $not: 'unknown' }` rule'u over-activation yaratabilir. Intent-specific veya confidence-thresholded rule dusunulebilir. |
| **P2** | `evaluateRuleViaSecondary()` icindeki 50% discount orani configurable yapilabilir (routing-engine config). |
| **P3** | `as string[]` cast (satir 68) — TypeScript 5.x `Array.prototype.includes()` narrowing improvement ile kaldiriabilir. |

## Verdict: ANALYZED
