# Analysis: src/orchestra/planner.ts
**Task ID:** 142-010 | **Model:** opus | **LoC:** 523 | **Effort:** max

## 1. Amaci (detayli)
AI planner modülü. DIRECTIVES.md context'ini + memory/debt/patterns bilgilerini alıp Claude/Codex/Gemini provider'ına göndererek yapılandırılmış task planı oluşturur. İki mod: normal (tam DIRECTIVES context) ve zero-config (tek satır doğal dil → 3-5 task split). Priority-based context truncation ile token limitine uyar. spawnSync ile subprocess çağrısı yapar (ADR-006).

## 2. Public API
- `buildPriorityContextBlock(sections, maxLines)` → string — JSDoc ✓ (@internal)
- `buildPlanPrompt(context, rec, name, zeroConfig?, lang?, worst?)` → string — JSDoc ✓ (@internal)
- `parsePlannerResponse(raw)` → PlannerResult | null ��� JSDoc ✓ (@internal)
- `buildPlannerSpawnArgs(adapter, prompt, model)` → {command, args} — JSDoc ✓ (@internal)
- `resolveAdapter(adapter?)` → ProviderAdapter — JSDoc ✓ (@internal)
- `callBrainPlanner(context, rec, model, name, adapter?, timeout?, worst?)` → PlannerResult | null — JSDoc ✓ (@internal)
- `buildZeroConfigPlanPrompt(desc, name, tree?, lang?)` → string — JSDoc yok, EKSIK
- `callZeroConfigPlanner(desc, model, name, tree?, adapter?, timeout?)` ��� PlannerResult | null — JSDoc ✓
- `buildZeroConfigFallbackPlan(desc)` → PlannerResult — JSDoc ✓

Tüm public API @internal olarak işaretli — orchestra/ dışında kullanılmaması bekleniyor. ✓

## 3. Ic Bagimliliklar
- `../core/types.js` (BrainContext, SprintSizeRecommendation, PlannerResult, ModelType, ALL_MODELS)
- `../core/constants.js` (BRAIN_PLAN_TIMEOUT_MS, BRAIN_PLAN_MAX_CONTEXT_LINES)
- `../core/provider.js` (ProviderAdapter, providerRegistry, ProviderError)
- `../core/utils.js` (debugLog)
- Döngüsel bağımlılık riski: YOK — ADR-008 uyumlu (planner imports only from core/)

## 4. Dis Bagimliliklar
- `zod` — schema validation (ADR-010 izinli)
- `node:child_process` (spawnSync) — ADR-006 uyumlu
- ADR-010 uyumu: ✓

## 5. Complexity
- Fonksiyon sayısı: 9 exported
- Max cyclomatic complexity: `buildPriorityContextBlock()` (satır 57-110) ≈ CC 7 (sort, iterate, partial inclusion)
- `buildPlanPrompt()` (satır 119-247) — long but mostly string template, CC ≈ 3
- `parsePlannerResponse()` (satır 255-275) — try/catch + fence strip + parse + validate, CC ≈ 3

## 6. Type Safety
- `as unknown as [string, ...string[]]` — satır 16 (MODEL_ENUM_VALUES, same pattern as task-builder.ts)
- `as unknown` — satır 264 (`JSON.parse(cleaned)` — safe, immediately validated by Zod)
- `as PlannerResult` — satır 270 (Zod-validated, safe cast)
- `any` sayısı: 0 ✓
- `@ts-ignore`: 0 ✓
- Non-null `!`: satır 97 (`sections[i]!` — within bounds) ✓

## 7. ADR Compliance
- **ADR-006 spawnSync**: spawnSync used in callBrainPlanner (satır 344) and callZeroConfigPlanner (satır 487). UYUMLU — planner is a synchronous subprocess call by design, matching ADR-006 pattern.
- **ADR-008 brain import**: planner.ts imports ONLY from core/ ✓ (explicit ADR-008 compliance comment on satır 6)
- **ADR-010 deps**: zod (allowed) + Node.js built-ins ✓
- **Memory V2**: Planner receives context via BrainContext (memory, decisions, debt etc.) — it does NOT query DB directly. Correct — DB queries happen in sprint-controller before passing context to planner.

## 8. Test Coverage
- `tests/orchestra/planner.test.ts` — EXISTS ✓
- `tests/orchestra/planner-zeroconfig.test.ts` — zero-config specific ✓
- `tests/orchestra/planner-edge.test.ts` — edge cases ✓
- 3 test dosyası — excellent coverage
- spawnSync mock doğru mu? (Muhtemelen vi.mock ile)

## 9. TODO/FIXME/HACK inventory
- NONE ��

## 10. Dead Code
- No `@deprecated` tags
- `buildZeroConfigPlanPrompt` exported but called only by `callZeroConfigPlanner` — could be private, but exported for testability. Acceptable.
- All 9 functions are reachable ✓

## 11. Security
- spawnSync — command injection risk? Provider adapter's buildCommand() returns shell command string. If malicious adapter is registered, it could inject arbitrary commands. HOWEVER: provider registration is controlled by project owner via config. Risk: LOW.
- Prompt content flows from BrainContext (DIRECTIVES, memory) → not user-hostile input in practice.
- buildPlannerSpawnArgs extracts firstToken from adapter output — if empty, throws ProviderError ✓

## 12. Memory V2 Uyumu
- Does NOT directly query memory.db — receives pre-built context strings via BrainContext ✓
- context.decisions, context.memory, context.patterns → all passed from caller (sprint-controller)
- No legacy .md file reading ✓

## 13. i18n
- Full TR/EN dual-language prompt support ✓ (satır 119-247 for normal plan, 362-463 for zero-config)
- Default language: 'tr' — consistent with project locale
- Prompt structure mirrors in both languages ✓
- `worstCombinations` section: TR "GEÇMIŞ SONUCLAR" / EN "PAST RESULTS" ✓

## 14. Dokumantasyon Tutarliligi
- JSDoc coverage: 8/9 — excellent
- Missing: buildZeroConfigPlanPrompt JSDoc — minor
- @internal annotations on all functions — correct, this is orchestra-internal

## 15. Performance
- spawnSync calls: 2 (callBrainPlanner, callZeroConfigPlanner) — blocking but intentional (plan phase is sequential)
- buildPriorityContextBlock: sorts + iterates sections — O(n log n) where n ≤ 10 sections, negligible
- String concatenation in buildPlanPrompt: template literal, single allocation ✓

## 16. Oneriler
- **P3**: Add JSDoc to buildZeroConfigPlanPrompt
- **P3**: MODEL_ENUM_VALUES `as unknown as` pattern duplicated from task-builder.ts — could extract to a shared utility in core/types.ts
- **P2**: spawnSync timeout (BRAIN_PLAN_TIMEOUT_MS) — if exceeded, returns null silently. No metric/alert emitted. Consider emitting a metric on timeout for observability.
- Bu dosya ADR-008 uyumu konusunda model örnek — import boundary mükemmel.

## Verdict: ANALYZED
