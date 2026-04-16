# Analysis: src/orchestra/promotion-pipeline.ts
**Task ID:** 142-016 | **Model:** opus | **LoC:** 286 | **Effort:** max

## 1. Amaci (detayli)
Gecici (temp) agent/skill'leri performansa dayali olarak kalici (permanent) statüye yukselten veya kotu performansli kalici entity'leri devre disi birakan pipeline. Promotion kriteri: 8+ task, %85+ basari orani. Demotion kriteri: %50+ basarisizlik orani. isBuiltIn() kontrolu ile built-in agent/skill'ler korunur. Sprint retro asamasinda brain tarafindan calistirilir. .deckent/agents/ ve .deckent/skills/ dizinlerinde manifest dosyalarini gunceller.

## 2. Public API
- `PromotionPipeline` class — constructor(projectRoot, promotionCriteria?, demotionCriteria?). JSDoc YOK.
- `evaluatePromotions(tracker: OutcomeTracker): PromotionResult[]` — promotion adaylari. JSDoc VAR.
- `evaluateDemotions(tracker: OutcomeTracker): PromotionResult[]` — demotion adaylari. JSDoc VAR.
- `promote(entityId, entityType): boolean` — entity'yi permanent'a taşı. JSDoc VAR, detayli.
- `demote(entityId, entityType): boolean` — entity'yi devre disi birak. JSDoc VAR.
- Tipler: PromotionCriteria, DemotionCriteria, PromotionResult — EXPORTED

## 3. Ic Bagimliliklar
- `./outcome-tracker.js` — OutcomeTracker, EntityPerformance
- `../core/utils.js` — debugLog
- `fs`, `path` — Node built-in
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- `fs` (cpSync, mkdirSync, readFileSync, writeFileSync, existsSync) — Node >=16.7
- `path` — Node built-in
- ADR-010: UYUMLU

## 5. Complexity
- Fonksiyon sayisi: 8 (4 public + 4 private)
- En karmasik: `promote()` (sat 108-165, 57 satir, 3 path search: persistent temp, sprint-scoped temp, fallback)
- Max cyclomatic: ~7

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- Non-null `!`: 0
- Unsafe pattern: sat 128, 186, 241 — `JSON.parse(readFileSync(...))` sonrasi tipi `any` (implicit). Schema validation YOK.
- **KRITIK BULGU sat 275:** `const { readdirSync } = require('fs')` — ESM modulunde CommonJS require() kullanimi!
  - Bu satir ESM strict modda CALISIR (Node.js require() ESM'de hala destekliyor) ama:
  - `import { readdirSync } from 'fs'` zaten dosya basinda yapilmis (sat 5)
  - Bu `require()` satiri TAMAMEN GEREKSIZ ve YANILTICI — zaten import edilmis fs module'unu tekrar require ediyor
  - ADR-002 (Node16 Module Resolution) ihlali sayilabilir

## 7. ADR Compliance
- ADR-006 spawnSync: UYUMLU (spawnSync yok)
- ADR-008 brain import: UYUMLU (outcome-tracker aynı dizin, core/ import)
- ADR-010 deps: UYUMLU
- **ADR-002 IHLALI:** sat 275 `require('fs')` — ESM modülünde CommonJS require. Zaten import ile mevcut.

## 8. Test Coverage
- tests/orchestra/promotion-guard.test.ts — built-in koruma testleri
- tests/orchestra/evolution-pipeline.test.ts — entegrasyon (promotion + rule evolver)
- Mock kalitesi: OutcomeTracker mock, dosya sistemi mock
- Edge case: isBuiltIn guard, threshold edge values, missing manifest

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- orchestra/index.ts'den export: `PromotionPipeline` — AKTIF

## 11. Security
- cpSync ile dizin kopyalama — source kontrollü (temp dir), hedef kontrollü (.deckent/) — OK
- JSON.parse sonrasi tip kontrolsuz — `raw.source`, `raw.id`, `raw.enabled` field'lari varsayiliyor
  - Corrupt manifest → runtime property access error (try/catch ile korunuyor)
- Manifest dosya yazma: JSON.stringify — injection riski YOK

## 12. Memory V2 Uyumu
- N/A — promotion/demotion manifest dosyalarla calisir, Memory V2 ile etkilesmiyor

## 13. i18n
- Reason mesajlari Ingilizce — tutarli
- debugLog mesajlari Ingilizce — uygun

## 14. Dokumantasyon Tutarliligi
- promote() JSDoc detayli ve dogru (2 konum arama: .tasks/agents/, .deckent/agents/temp-{id}/)
- DEFAULT_PROMOTION/DEMOTION threshold'lari acik
- JSDoc ↔ gercek davranis: TUTARLI

## 15. Performance
- Sync I/O: readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync
- cpSync recursive — buyuk dizin yapilari icin potansiyel yavas
- Hot path: HAYIR — retro sonrasi bir kez calisir

## 16. Oneriler
- **P0:** sat 275 `require('fs')` → KALDIR. `readdirSync` zaten sat 5'te import edilmis. ESM'de require() kullanimi ADR-002 ihlali.
- **P2:** JSON.parse sonrasi minimal schema validation (source, id, enabled field kontrolu)
- **P3:** promote/demote islemleri icin event/log kaydı (kim, ne zaman, neden — audit trail)

## Verdict: ANALYZED
