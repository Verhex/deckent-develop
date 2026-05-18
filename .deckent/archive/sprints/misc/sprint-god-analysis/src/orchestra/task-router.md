# Analysis: src/orchestra/task-router.ts
**Task ID:** 142-010 | **Model:** opus | **LoC:** 268 | **Effort:** max

## 1. Amaci (detayli)
V1 task router — her task'ı provider, agent ve skill set'e yönlendirir. Config override'lar, forceModel, provider preference, skill affinity ve availability fallback'i ile 6 seviyeli priority chain uygular. V2 routing-engine.ts'den AYRI modül — bu dosya task-level routing, V2 ise DNA-based activation engine. İkisi paralel çalışır.

## 2. Public API
- `SkillRoutingConfig` (interface) — JSDoc yok, EKSIK
- `TaskRouterConfig` (interface) — JSDoc yok, EKSIK
- `TaskRouting` (interface) — JSDoc ✓ (inline field docs)
- `TaskType` (type) — JSDoc yok
- `detectTaskType(task)` → TaskType — JSDoc ✓
- `routeTask(task, config, available)` → TaskRouting — JSDoc ✓ (detailed priority chain)

## 3. Ic Bagimliliklar
- `../core/types.js` (Task type)
- `../core/task-types.js` (ProviderName, ModelType, PROVIDER_MODEL_MAP)
- Döngüsel bağımlılık riski: YOK — tek yönlü core/ import

## 4. Dis Bagimliliklar
- NONE — pure TypeScript logic, no external deps ✓
- ADR-010 uyumu: ✓

## 5. Complexity
- Fonksiyon sayısı: 4 exported + 2 private (isProviderName, inferProviderFromModel, ensureAvailable)
- Max cyclomatic complexity: `detectTaskType()` (satır 84-131) ≈ CC 8 (multiple if/some chains)
- `routeTask()` (satır 151-254) ≈ CC 7 (6 priority levels, each with guard + fallback)
- En karmaşık: detectTaskType — nested conditions with both dirs and files checks

## 6. Type Safety
- `as ProviderName` — satır 69 (guarded by PROVIDER_MODEL_MAP key iteration)
- `as ProviderName` — satır 247 (`availableProviders[0] ?? 'claude'` — precedence issue: `??` binds tighter, so `as` applies to the entire expression, correct)
- `any` sayısı: 0 ✓
- `@ts-ignore`: 0 ✓
- Non-null `!`: 0 ✓
- Satır 247: `availableProviders[0] ?? 'claude' as ProviderName` — operator precedence: `as` binds to `'claude'` not the entire expression. This means if `availableProviders[0]` is `undefined`, result is `'claude'` (a string literal), then `as ProviderName` applies to the string literal — technically correct but confusing. Same issue on satır 266.

## 7. ADR Compliance
- **ADR-006 spawnSync**: N/A ✓
- **ADR-008 brain import**: core/ only ✓
- **ADR-010 deps**: zero external deps ✓
- **ADR-022 CLI/MCP parity**: N/A (internal module)
- **ADR-028**: This is V1 router. V2 routing-engine.ts exists separately. Both are wired — task-router is used by sprint-spawner.routeSprintTasks(). V2 is used by routing-engine.routeTaskV2(). No conflict — V1 is provider-level, V2 is DNA/activation-level.
- **Memory V2 DB-first**: N/A (no memory operations)

## 8. Test Coverage
- `tests/orchestra/task-router.test.ts` — EXISTS ✓
- detectTaskType + routeTask tested
- Priority chain coverage: likely tests all 6 levels
- Edge: empty availableProviders → falls back to 'claude' (satır 161-167)

## 9. TODO/FIXME/HACK inventory
- NONE ✓

## 10. Dead Code
- `TaskType` includes 'unknown' — never produced by routeTask (only by detectTaskType if no pattern matches). But 'unknown' maps to null in TASK_TYPE_TO_ROUTING_KEY, so it's handled. Not dead, just rare.
- No unused exports detected
- No `@deprecated`

## 11. Security
- No user input handling
- No external calls
- No injection surface
- ✓ Clean

## 12. Memory V2 Uyumu
- N/A — no memory operations in this file

## 13. i18n
- No hardcoded strings (reason strings are English, acceptable for internal logging)
- No locale-dependent logic

## 14. Dokumantasyon Tutarliligi
- routeTask JSDoc is excellent — documents all 6 priority levels ✓
- detectTaskType JSDoc ✓
- SkillRoutingConfig, TaskRouterConfig, TaskType missing JSDoc — minor

## 15. Performance
- No I/O operations — pure CPU logic ✓
- No hot path concerns — called once per task per sprint
- detectTaskType iterates scope arrays — O(n) per task, negligible

## 16. Oneriler
- **P3**: Satır 247 ve 266 — `availableProviders[0] ?? 'claude' as ProviderName` — operator precedence confusing. Parenthesiz ekle: `(availableProviders[0] ?? 'claude') as ProviderName`
- **P3**: Add JSDoc to SkillRoutingConfig, TaskRouterConfig
- **P3**: Consider consolidating V1 router + V2 routing-engine in future — current dual-router is intentional (different levels) but could confuse newcomers

## Verdict: ANALYZED
