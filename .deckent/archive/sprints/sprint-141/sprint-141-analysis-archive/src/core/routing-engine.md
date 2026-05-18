# Analysis: src/core/routing-engine.ts
**Task ID:** 140-001 | **LoC:** 553

## 1. Amaci
Layer 3 routing orchestrator. `routeTaskV2()` ile unified, intent-based task→agent+skills kararı verir. Agent seçimi, skill budget hesaplama, override çözümü, context fit assessment barındırır.

## 2. Public API (export listesi)
- `RoutingOptions`, `routeTaskV2()`
- `calculateSkillBudget()`, `resolveOverrides()`, `calculateConfidence()`
- `assessContextFit()`

## 3. İç + Dış Bağımlılıklar
- **İç**: `task-types.ts`, `agent-types.ts`, `skill-types.ts`, `routing-types.ts`, `intent-classifier.ts`, `activation-engine.ts`, `skill-selector.ts`, `model-registry.ts`, `utils.ts` (debugLog)

## 4. Complexity
- `routeTaskV2()`: 6 adımlı pipeline — orta
- `selectBestAgent()`: yüksek — pool iteration, learning bonus, confidence
- `selectBestSkills()`: yüksek — stack bonus, intent bonus, learning bonus, composition resolution
- `calculateSkillBudget()`: orta — effort-aware token allocation

## 5. Type Safety
- `any` kullanımı: 0
- `!` non-null: 3 (güvenli bağlamlarda)

## 6. ADR Compliance
- **ADR-028** (Decision-Engine V2): tam uyumlu ✅
- **ADR-015** (TaskRouter Module): bu ADR'ı uygular

## 7. Test Coverage
- `tests/core/routing-engine.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- Yorum: `// V2: stats live in learnings.json, not agent.json` — migration notu ✅

## 9. Dead Code Candidates
- `assessContextFit()` — context overflow detection, kullanımda ✅

## 10. Security Findings
- Task title/description'dan gelen veri `classifyIntent()` üzerinden geçiyor — prompt injection riski düşük

## 11. Memory V2 Uyumu
- N/A — routing layer, memory ile doğrudan ilişkili değil

## 12. Öneriler
- `getIntentPriorityBonus()` içinde hardcoded skill ID'leri (`testing-expert`, `documentation-writer`) — skill registry'den okunabilir
- Context fit thresholds (0.75, 0.90) config'e taşınabilir

## 13. Verdict: ANALYZED
