# Analysis: src/core/token-counter.ts
**Task ID:** 142-007 | **Model:** opus | **LoC:** 203 | **Effort:** max

## 1. Amacı
Worker prompt'larının token sayısını tahmin eder ve model context window bütçesiyle karşılaştırır. Agent + skill + task prompt boyutlarını hesaplayarak bütçe aşımı uyarıları üretir. `ModelRegistry`'den context window bilgisini alarak otomatik bütçe hesaplama yapar. task-builder.ts tarafından prompt boyutu tahmini için kullanılır.

## 2. Public API
- `type ModelName = ModelType` — **@deprecated** ✓ (JSDoc ile işaretli, satır 11)
- `type TokenBudget = Record<string, number>` — JSDoc VAR ✓
- `interface PromptSizeEstimate` — JSDoc VAR (field-level) ✓
- `interface ContextBudgetEstimate` — JSDoc VAR (field-level) ✓
- `interface BudgetWarning` — JSDoc YOK ✗ (ama field isimleri açıklayıcı)
- `class TokenCounter` — JSDoc VAR (method-level) ✓
  - `constructor(budgets?: TokenBudget)`
  - `countTokens(text: string): number` — JSDoc VAR
  - `estimatePromptSize(...)` — JSDoc VAR
  - `isWithinBudget(tokens, model): boolean` — JSDoc VAR
  - `warnIfExceeding(tokens, model): BudgetWarning | null` — JSDoc VAR
  - `formatWarning(warning): string` — JSDoc VAR
  - `getBudget(model): number` — JSDoc VAR
  - `setBudget(model, budget): void` — JSDoc VAR
  - `estimateTaskContextBudget(...)` — JSDoc VAR ✓ (en detaylı, param açıklamaları mevcut)

## 3. İç Bağımlılıklar
- `import type { ModelType } from './task-types.js'` — Salt tip
- `import type { ModelDefinition } from './model-registry.js'` — Salt tip
- `import { modelRegistry } from './model-registry.js'` — Runtime singleton
- Döngüsel bağımlılık riski: Düşük — model-registry → token-counter yönünde import yok.

## 4. Dış Bağımlılıklar
- YOK — Sıfır dış bağımlılık. ADR-010 uyumlu ✓.

## 5. Complexity
- 1 sınıf, 9 method, 1 standalone fonksiyon.
- Max cyclomatic complexity: `estimateTaskContextBudget` — 2 (null coalescing + conditional).
- En karmaşık fonksiyon: `buildDefaultBudgets` (satır 58-64) — modelRegistry üzerinde iterasyon + min hesaplama.
- Genel karmaşıklık: DÜŞÜK ✓

## 6. Type Safety
- `any` kullanımı: 0 ✓ (satır 14'teki "any" bir JSDoc comment içinde, tip değil)
- `@ts-ignore`: 0 ✓
- `@ts-expect-error`: 0 ✓
- `as unknown`: 0 ✓
- Non-null `!`: 2 — satır 243 (`first = reports[0]!`) ve satır 244 (`last = reports[reports.length - 1]!`) — AMA BUNLAR ci-learning.ts'de, token-counter.ts'de DEĞİL. Token-counter'da: 0 ✓
- Unsafe cast: 0 ✓

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A.
- **ADR-008 (brain import):** ✓ — Sadece core modüllerden import.
- **ADR-010 (tek dependency):** ✓ — Sıfır dış bağımlılık.
- **ADR-033 (product vision):** ✓ — Veri göndermez.
- **ADR-037 (RBAC):** N/A.
- **Memory V2:** N/A — Memory ile etkileşim yok.

## 8. Test Coverage
- Test dosyası: `tests/core/token-counter.test.ts` ✓ MEVCUT
- Eşleşme: src/core/token-counter.ts → tests/core/token-counter.test.ts ✓
- Beklenen testler: countTokens (empty, single word, long text), estimatePromptSize, isWithinBudget, warnIfExceeding, formatWarning, estimateTaskContextBudget, buildDefaultBudgets.

## 9. TODO/FIXME/HACK Inventory
- NONE ✓

## 10. Dead Code
- `ModelName` type alias: **@deprecated** olarak işaretli (satır 11). Dışarıdan kullanılıp kullanılmadığı kontrol edilmeli.
- `TokenCounter` sınıfı: `task-builder.ts` tarafından import ediliyor ✓ — Aktif.
- `buildDefaultBudgets`: Modül seviyesinde çağrılıyor (satır 66) ✓ — Aktif.

## 11. Security
- Input validation: `countTokens` — `!text || typeof text !== 'string'` kontrolü var (satır 81) ✓.
- Injection riski: YOK — dış giriş yok, pure logic.
- SQL injection: N/A.

## 12. Memory V2 Uyumu
- N/A — Memory ile etkileşim yok.

## 13. i18n
- Hardcoded string: `formatWarning` metodu İngilizce mesaj üretiyor (satır 146). CLI/MCP'de kullanılıyorsa i18n gerekebilir.
- turkishNormalize: N/A.

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✓ UYUMLU.
- `WORDS_PER_TOKEN = 0.75` — Bu "4/3 word per token" anlamına gelir (tipik GPT tokenizer yaklaşımı). Doğru.
- `DEFAULT_BUDGET = 200000` — ModelRegistry'deki context window ile min alınarak güvenli cap uygulanıyor. İyi tasarım.
- `estimateTaskContextBudget` `avgTokensPerLine = 10` default'u makul.

## 15. Performance
- Sync I/O: 0 ✓ — Tamamen in-memory, pure computation.
- `buildDefaultBudgets()` modül yükleme sırasında çalışır (top-level constant). Tek seferlik, hızlı.
- Hot path: countTokens — her prompt için çağrılabilir. split/filter operasyonu O(n) ama tipik metin boyutlarında sorun değil.

## 16. Öneriler
- **P2 (Medium):** `@deprecated ModelName` type alias'ı — Kullanılmıyorsa silinmeli.
- **P3 (Low):** `formatWarning` İngilizce hardcoded — i18n düşünülmeli.
- **P3 (Low):** countTokens'ın words/0.75 yaklaşımı kabaca doğru ama tiktoken veya gerçek tokenizer'a göre %10-20 sapma olabilir. Yeterli tahmin amaçlı.
- **Genel:** İyi yapılandırılmış, temiz TypeScript. `ModelRegistry` entegrasyonu düzgün.

## Verdict: ANALYZED
