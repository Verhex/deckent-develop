# Analysis: src/core/task-types.ts
**Task ID:** 141-001 | **LoC:** 356

## 1. Amaci (1-2 cumle)
Task, planlama ve model ile ilgili tum tip tanimlamalari. types.ts monolitinden split edilmis; ModelRegistry'ye delegate ederek model bilgilerini tek kaynaktan saglar.

## 2. Public API (export listesi)
- `ClaudeModel`, `OpenAIModel`, `GeminiModel`, `ModelType` (union)
- `ProviderName`, `PROVIDER_MODEL_MAP`, `CLAUDE_MODELS`, `ALL_MODELS`, `MODEL_API_IDS`
- `resolveApiModelId(model): string`
- `getModelTier(model): number` (backward compat)
- `UnknownModelError` class
- `TaskScope`, `TaskStatus`, `EvaluationDecision` types
- `SpawnTask`, `SpawnResult` interfaces
- `EvaluationRubric`, `DEFAULT_RUBRIC`
- `TaskResult`, `SprintTask` interfaces

## 3. Ic + Dis Bagimliliklar
- **Ic import:** `./model-registry.js`
- **Kullanildiği yerler:** config-types, routing-types, agent-pool, ve bircok modul

## 4. Complexity
- 5 fonksiyon, cyclomatic: ~8

## 5. Type Safety
- `any`: 0
- Non-null assertion: 3 (`_providerMap['claude'] ?? []`)
- `as unknown as readonly` cast: 2 (tip uyumsuzlugu workaround)

## 6. ADR Compliance
- ADR-001 (ESM): UYUMLU
- ModelRegistry'ye delegate: single source of truth koruluyor

## 7. Test Coverage
- `tests/core/task-types.test.ts` MEVCUT olmali

## 8. TODO/FIXME/HACK inventory
- `getModelTier()` — `/** @deprecated Use modelRegistry.getNumericTier() */` isaretlenmeli

## 9. Dead Code Candidates
- `getModelTier()` deprecated olmali; `modelRegistry.getNumericTier()` var

## 10. Security Findings
- `resolveApiModelId()` `throw new UnknownModelError()` — guvenli

## 11. Memory V2 Uyumu
- Dogrudan iliskisi yok

## 12. Oneriler
- `getModelTier()` deprecated isaretlenmeli
- `as unknown as readonly` cast'lari tip guvenligi riskleri

## 13. Verdict: ANALYZED
