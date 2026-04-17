# Analysis: src/orchestra/task-router.ts
**Task ID:** 141-002 | **LoC:** 267

## 1. Amaci
Her task için en iyi provider, agent ve skill set seçimini yapar. config override, forceModel çıkarımı, skill affinity ve provider availability fallback zinciri içerir.

## 2. Public API (export listesi)
- `SkillRoutingConfig` interface
- `TaskRouterConfig` interface
- `TaskRouting` interface
- `TaskType` type ('code' | 'test' | 'doc' | 'design' | 'unknown')
- `detectTaskType(task)` → `TaskType`
- `routeTask(task, config, availableProviders)` → `TaskRouting`

## 3. Ic + Dis Bagimliliklar
- **Dış:** ../core/types.js, ../core/task-types.js (ProviderName, ModelType, PROVIDER_MODEL_MAP)
- **Node:** hiç yok

## 4. Complexity
`detectTaskType`: path/dir pattern matching, cyclomatic ~10. `routeTask`: 6 öncelik dalı, cyclomatic ~10. Toplam: ~20.

## 5. Type Safety
- `value === 'claude' || value === 'codex' || value === 'gemini'` — runtime type guard, SAFE.
- `available[0] ?? 'claude' as ProviderName` — güvenli fallback.
- Hiç `any` yok.

## 6. ADR Compliance
- **ADR-015 (TaskRouter Module — 6-level routing):** COMPLIANT — 6 öncelik seviyesi implement edilmiş.
- **ADR-027 (Hybrid Spawn Backend):** Provider routing burada; backend seçimi spawn-backend.ts'de.
- **ADR-022 (CLI/MCP parity):** Bu modül her iki ortama da aynı routing sağlıyor.

## 7. Test Coverage
- `tests/orchestra/task-router.test.ts` mevcut beklenir.
- `detectTaskType` src+test karışık kapsam için test edilmeli.
- 6 öncelik dalının her biri için test.

## 8. TODO/FIXME/HACK inventory
Yorum: `// FIX: Check code BEFORE test to prevent misclassification.` — düzeltilmiş.

## 9. Dead Code Candidates
`TASK_TYPE_TO_ROUTING_KEY` map: `code: null`, `unknown: null` — bu değerler kullanımda ama null döndürmesi açık bir intent.

## 10. Security Findings
Provider name validation ile arbitrary provider injection önleniyor. `isProviderName` guard tutarlı kullanılmış.

## 11. Memory V2 Uyumu
Doğrudan ilişki yok — pure routing logic.

## 12. Oneriler
- `detectTaskType` fonksiyonu `routing-engine.ts`'deki `routeTaskV2` ile çakışıyor olabilir — konsolidasyon değerlendirilebilir.

## 13. Verdict: ANALYZED
