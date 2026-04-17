# Analysis: src/core/intent-classifier.ts
**Task ID:** 141-001 | **LoC:** 392

## 1. Amaci (1-2 cumle)
Routing Engine'in Layer 1 bileşeni. Gorev basligini, aciklamasini ve scope'unu analiz ederek `TaskDNA` yapisini uretir: primary/secondary intent, domains, operations ve complexity skorlari.

## 2. Public API (export listesi)
- `classifyIntent(task): TaskDNA` — ana API
- `detectPrimaryIntent(text, scope, scopeAnalysis?): {intent, confidence}` (export edilmis, test icin)
- `detectSecondaryIntents(text, scope, primary, scopeAnalysis?): IntentType[]`
- `detectDomains(scope): Array<{name, weight}>`
- `detectOperations(text, scope): Array<{type, weight}>`
- `analyzeComplexity(scope): TaskDNA['complexity']`
- `analyzeWriteScope(scope): TaskDNA['scope']`

## 3. Ic + Dis Bagimliliklar
- **Ic import:** `./task-types.js`, `./routing-types.js`
- **Kullanildiği yerler:** routing-engine.ts

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- 8 fonksiyon
- `detectPrimaryIntent()`: multi-signal scoring + CRITICAL FIX comment'li debunking mantigi — yuksek
- Cyclomatic rough: 30-35

## 5. Type Safety
- `any`: 0, `@ts-ignore`: 0, Non-null: 3

## 6. ADR Compliance
- ADR-028 (V1→V2): V2 intent classifier — UYUMLU

## 7. Test Coverage
- `tests/core/intent-classifier.test.ts` MEVCUT olmali

## 8. TODO/FIXME/HACK inventory
- `// CRITICAL FIX: Write ratio analysis prevents the detectTaskType ordering bug.` — belgelenmis fix

## 9. Dead Code Candidates
- `SCOPE_INTENT_SIGNALS` — daha az signal; genisletilebilir

## 10. Security Findings
- Pure analysis logic; guvenlik riski yok

## 11. Memory V2 Uyumu
- Dogrudan iliskisi yok

## 12. Oneriler
- ML-based classification dusunulebilir (keyword lists brittle)
- Test coverage: edge cases (bos scope, sadece test dosyalari)

## 13. Verdict: ANALYZED
