# Analysis: src/mcp/tools/plan.ts
**Task ID:** 142-024 | **Model:** opus | **LoC:** 111 | **Effort:** max

## 1. Amacı
Sprint planını önizleyen MCP tool. `deckent_plan` olarak kayıtlı. DIRECTIVES.md'yi okur, task listesi çıkarır, wave breakdown ve risk değerlendirmesi yapar — herhangi bir şey çalıştırmadan. Kullanıcıya "bu sprint böyle görünecek" diye preview sunar. planSprint'in dry-run modunu kullanır.

## 2. Public API
- `registerPlanTool(server: McpServer): void` — tek export
- JSDoc: **YOK**

## 3. İç Bağımlılıklar
- `../../core/config.js` → loadConfig()
- `../../orchestra/brain.js` → readContext(), planSprint()
- `../../core/types.js` → BrainPlanningMode, SprintSizeRecommendation (type-only)
- `../helpers/enrich.js` → enrichResponse()
- `../helpers/format.js` → formatPlanResponse, wrapResponse
- Döngüsel bağımlılık riski: **YOK**

## 4. Dış Bağımlılıklar
- `zod/v4`, `@modelcontextprotocol/sdk` — standart
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 4 (computeWaveBreakdown, computeModelDistribution, computeRiskAssessment, registerPlanTool)
- Max cyclomatic: ~5 (handler — basit)
- En karmaşık fonksiyon: computeWaveBreakdown satır 9-20 — O(n/w) while loop

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `as unknown`: 0
- Non-null `!`: 0
- `as BrainPlanningMode | undefined` satır 63: ✅ güvenli — zod enum ile valide edilmiş
- **TEMİZ**

## 7. ADR Compliance
- **ADR-008 brain import**: `../../orchestra/brain.js` import — kabul edilebilir (re-export layer)
- **ADR-022 CLI/MCP parity**: ✅ CLI `deckent plan` ile paralel. mode parametresi eşleşiyor.
- **ADR-033**: ✅
- **Memory V2**: readContext() içinde DB-first context okuma yapılır — doğru

## 8. Test Coverage
- tests/mcp/tools/plan.test.ts: **MEVCUT** ✅

## 9. TODO/FIXME/HACK Inventory
- **YOK**

## 10. Dead Code
- `dryRun` schema parametresi (satır 45): default true, açıklama "Always dry-run for plan tool" — ama handler'da hiç kullanılmıyor. planSprint'e `{ mode: input.mode }` geçiriliyor, dryRun geçirilmiyor. Eğer plan tool her zaman dry-run ise, parametre gereksiz.
- **P3**: dryRun parametresi dead — ya kaldırılmalı ya da planSprint'e geçirilmeli

## 11. Security
- ✅ Read-only tool — güvenlik riski minimal
- Input validation: Zod ile mode enum check ✅

## 12. Memory V2 Uyumu
- ✅ Dolaylı — readContext() ve planSprint() DB-first kullanır
- Bu dosyada doğrudan memory erişimi yok — doğru mimari

## 13. i18n
- Hardcoded İngilizce: "Failed to plan sprint", "No usage constraints" — kabul edilebilir
- Risk assessment string'leri: "low", "medium", "high" — enum-like, i18n gerekmez

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Detaylı
- annotations: readOnlyHint=true, destructiveHint=false, idempotentHint=true — ✅ DOĞRU
- **Ancak**: readOnlyHint=true ama planSprint() task JSON'larını diske yazabilir mi? planSprint'in dryRun davranışı kontrol edilmeli. Eğer planSprint disk yazıyorsa annotation yanlış.

## 15. Performance
- Sync I/O: 0 (tüm işler planSprint async içinde)
- ✅ İyi performans

## 16. Öneriler
- **P2**: planSprint'e dryRun parametresi açıkça geçirilmeli (şu an handler'da `{ mode: input.mode }` — dryRun yok). Eğer planSprint default olarak task yazmıyorsa sorun yok, ama explicit olması daha güvenli.
- **P3**: `dryRun` schema parametresi kullanılmıyorsa kaldırılmalı
- **P3**: computeRiskAssessment basit threshold — daha sofistike olabilir (dosya sayısı, bağımlılık derinliği)

## Verdict: ANALYZED
