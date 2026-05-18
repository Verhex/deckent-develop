# Analysis: src/orchestra/planner.ts
**Task ID:** 141-002 | **LoC:** 522

## 1. Amaci
AI planner subprocess çağrısını, prompt oluşturmayı, yanıt parse etmeyi ve zero-config planlama modunu sağlar. Yalnızca core/ modüllerinden import eder — brain.ts'e bağımlılığı yoktur.

## 2. Public API (export listesi)
- `buildPriorityContextBlock(sections, maxLines)` — öncelik bazlı context kırpma
- `buildPlanPrompt(context, recommendation, projectName, zeroConfigDescription, language, worstCombinations)` — AI planner prompt
- `parsePlannerResponse(raw)` → `PlannerResult | null`
- `buildPlannerSpawnArgs(adapter, prompt, model)` — spawn argümanları
- `resolveAdapter(adapter?)` → `ProviderAdapter`
- `callBrainPlanner(context, recommendation, model, projectName, adapter?, timeout?, worstCombinations?)` → `PlannerResult | null`
- `buildZeroConfigPlanPrompt(description, projectName, fileTree, language)` — zero-config prompt
- `callZeroConfigPlanner(description, model, projectName, fileTree, adapter?, timeout?)` → `PlannerResult | null`
- `buildZeroConfigFallbackPlan(description)` → `PlannerResult`

## 3. Ic + Dis Bagimliliklar
- **Dış:** ../core/types.js, ../core/constants.js, ../core/provider.js, ../core/utils.js
- **Node:** node:child_process (spawnSync)
- **Harici:** zod
- NOT: Brain.ts veya orchestra/ alt modüllerinden HIÇBIR import yok — ADR-008 uyumlu.

## 4. Complexity
`buildPlanPrompt`: ~120 LoC, cyclomatic ~5 (TR/EN dil dalı). `buildPriorityContextBlock`: priority sort + truncation, cyclomatic ~8. `callBrainPlanner`: spawnSync + parse, cyclomatic ~3. Toplam: ~20.

## 5. Type Safety
- `PlannerTaskSchema`, `PlannerResultSchema` — Zod ile full validation. `safeParse` kullanılmış.
- `ALL_MODELS as unknown as [string, ...string[]]` — Zod enum için zorunlu cast.
- `result.data as PlannerResult` — zod validasyondan sonra güvenli.

## 6. ADR Compliance
- **ADR-008 (Brain Merkezi Import):** EXEMPLARY — planner.ts sadece core/'dan import eder. "─── Core (types only — NO brain.ts imports)" yorumu açık.
- **ADR-006 (spawnSync):** `spawnSync(command, args, { encoding, timeout })` — ADR-006 pattern uyumlu. user-controlled input komuta değil prompt dosyasına aktarılıyor.
- **ADR-010 (Tek Runtime Dependency):** commander.js değil zod kullanımı ADR-010 kapsamı dışında (planner-only).

## 7. Test Coverage
- `tests/orchestra/planner.test.ts` mevcut beklenir.
- `parsePlannerResponse` için valid/invalid JSON test edilmeli.
- `buildPriorityContextBlock` truncation mantığı test edilmeli.

## 8. TODO/FIXME/HACK inventory
Yorum: `// ─── Provider Command Extraction ──` açıklayıcı — TODO yok.

## 9. Dead Code Candidates
`buildZeroConfigFallbackPlan` — zero-config AI başarısız olduğunda fallback. Kullanım analizi gerekiyor.

## 10. Security Findings
- `spawnSync(command, args, ...)` — `command` ProviderAdapter'den geliyor. Adapter doğrulandığında güvenli ama adapter kaynak kodu kontrol edilmeli.
- Prompt: `{ encoding: 'utf-8', timeout: BRAIN_PLAN_TIMEOUT_MS }` — timeout var, denial-of-service riski azaltılmış.

## 11. Memory V2 Uyumu
Doğrudan Memory V2 işlemi yok. Context `BrainContext`'ten geliyor — sprint-planner.ts DB'den dolduruyor.

## 12. Oneriler
- TR/EN language parameter şu an sadece prompta yansıyor; test coverage eklenmeli.
- `worstCombinations` parameter dokümantasyonu yetersiz — OutcomeTracker.getWorstCombinations() ile bağlantı.

## 13. Verdict: ANALYZED
