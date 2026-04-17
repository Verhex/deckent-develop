# Analysis: src/core/token-counter.ts
**Task ID:** 141-001 | **LoC:** 203

## 1. Amaci (1-2 cumle)
Agent+skill+task prompt icin token sayimi ve maliyet koruma saglar. `TokenCounter` sinifi ile prompt boyutu tahmini, model bazli budget kontrolu ve context budget estimasyonu yapar.

## 2. Public API (export listesi)
- `ModelName` type (deprecated, `ModelType` kullanilmali)
- `TokenBudget`, `PromptSizeEstimate`, `ContextBudgetEstimate`, `BudgetWarning` interfaces
- `TokenCounter` class:
  - `countTokens(text): number`
  - `estimatePromptSize(agentPrompt, skillContents, taskDescription, model): PromptSizeEstimate`
  - `isWithinBudget(tokens, model): boolean`
  - `warnIfExceeding(tokens, model): BudgetWarning | null`
  - `formatWarning(warning): string`
  - `getBudget(model): number`
  - `setBudget(model, budget): void`
  - `estimateTaskContextBudget(scopeFileLineCount, agentPrompt, skillPrompts, model, avgTokensPerLine?): ContextBudgetEstimate`

## 3. Ic + Dis Bagimliliklar
- **Ic import:** `./task-types.js` (ModelType), `./model-registry.js` (ModelDefinition, modelRegistry)
- **Kullanildiği yerler:** task-builder.ts, routing-engine.ts (context budget degerlendirmesi)

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- 8 public metot + 1 module-level private fonksiyon (buildDefaultBudgets)
- `estimateTaskContextBudget()`: 4 bilesenin toplami — linear, dusuk karmasiklik
- Cyclomatic rough: 8-10

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any`: 0
- `@ts-ignore`: 0
- Non-null assertion: 0
- `/** @deprecated Use ModelType */` isaretli `ModelName` var

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- ADR-001 (ESM): `.js` import uzantilari — UYUMLU
- ADR-010 (tek dep): sadece iç moduller, no external — UYUMLU
- `modelRegistry.getAllModels()` ile budget hesabi: ModelRegistry'ye doğru bagimlilik — UYUMLU

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/core/token-counter.test.ts` MEVCUT olmali
- Token count tahmini deterministik — test edilmesi kolay

## 8. TODO/FIXME/HACK inventory
- `/** @deprecated Use ModelType from task-types.ts instead */` — ModelName tipi

## 9. Dead Code Candidates
- `ModelName` deprecated alias — kaldirilabilir

## 10. Security Findings
- Pure estimation logic; guvenlik riski yok
- `WORDS_PER_TOKEN = 0.75` sabit tahmin — GPT/Claude icin kabul gorulen heuristik

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile dogrudan iliskisi yok; ancak DB'den yüklenen skill/agent prompt'larinin token estimasyonu icin kullanilabilir
- .md parse kodu yok

## 12. Oneriler (Sprint 142+ input)
- `ModelName` deprecated tipi kaldirılmali
- `WORDS_PER_TOKEN` konfigüre edilebilir yapilabilir (farkli modeller icin)
- `SYSTEM_PROMPT_OVERHEAD = 2000` hardcoded; model bazli override destegi
- Cost guard entegrasyonu: `estimateTaskContextBudget` sonucu brain'de kullaniliyor mu? Tam entegrasyon dogrulanmali

## 13. Verdict: ANALYZED
