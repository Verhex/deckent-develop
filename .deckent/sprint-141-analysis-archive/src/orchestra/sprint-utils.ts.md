# Analysis: src/orchestra/sprint-utils.ts
**Task ID:** 140-002 | **LoC:** 361

## 1. Amaci
Sprint operasyonları için pure utility fonksiyonlar koleksiyonu. `sprint-controller.ts` God Object Split Phase 2 (Sprint 075). `now()`, `readFileSafe()`, `isTmuxProvider()`, `resolveTaskProvider()`, `getProviderAdapterForTask()`, `PAUSE_STATE_FILE`, `SPRINT_STATE_FILE` sabitler.

## 2. Public API
- `PAUSE_STATE_FILE`, `SPRINT_STATE_FILE` — path sabitleri
- `readFileSafe(filePath): string`
- `now(): string`
- `isTmuxProvider(provider): boolean`
- `resolveTaskProvider(task): ProviderName`
- `getProviderAdapterForTask(provider): ProviderAdapter | null`
- `isStaleTaskFile(filePath): boolean`
- Ve ek classification/yardımcı fonksiyonlar

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:path`
- **Dis:** `../core/types.js` (getProviderForModel, Task, Sprint, ModelType, ProviderName)
- **Dis:** `../core/constants.js` (TASKS_DIR)
- **Dis:** `../core/utils.js` (readJsonSafe, debugLog)
- **Dis:** `../core/model-registry.js` (modelRegistry)
- **Dis:** `../core/system-profile.js` (getSystemProfile)
- **Dis:** `../core/provider.js` (providerRegistry, ProviderError)
- **Dis:** `./tmux.js` (listWorkers)

## 4. Complexity
- 361 LoC, 10+ export, cyclomatic ~15

## 5. Type Safety
- Tip güvenli genel olarak
- `SOURCE_CODE_PREFIXES` const array — kullanımı kontrol edilmeli

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-026 (God Object Split Phase 2):** ✓

## 7. Test Coverage
- `tests/orchestra/sprint-utils.test.ts` bekleniyor — pure fonksiyonlar test için ideal

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `SOURCE_CODE_PREFIXES` — kullanıldığı yer kontrol edilmeli

## 10. Security Findings
- `readFileSafe`: I/O hata silently caught — debugLog ile izlenebilir ✓

## 11. Memory V2 Uyumu
- Memory V2 ile ilgisi yok — utility functions

## 12. Oneriler
- `SOURCE_CODE_PREFIXES` sabitinin kullanım yerini belgele veya ADR-038 dead code kandidatı olarak işaretle

## 13. Verdict: ANALYZED
