# Analysis: src/orchestra/model-selector.ts
**Task ID:** 142-016 | **Model:** opus | **LoC:** 282 | **Effort:** max

## 1. Amaci (detayli)
Gorev karmasikligina dayali otomatik model secimi yapar. Task baslik, aciklama ve scope bilgilerinden bir karmasiklik skoru hesaplar ve bu skora gore ekonomi/standart/premium tier'a esler. Katmanli filtreleme sistemiyle (plan access, task type, score, pattern, skill, provider) nihai modeli belirler. Brain tarafindan plan asamasinda ve task-router tarafindan spawn asamasinda kullanilir.

## 2. Public API
- `calculateModelScore(title, description, scope): number` — karmasiklik skoru hesapla. JSDoc VAR, tam signature.
- `inferModelFromDirective(title, description, scope): ModelType` — Claude-centric model onerir. JSDoc VAR.
- `parsePatterns(raw: string): PatternEntry[]` — JSON string'den pattern parse. JSDoc VAR.
- `deduplicatePatterns(patterns): PatternEntry[]` — pattern dedup (en yuksek occurrence tutar). JSDoc VAR.
- `suggestModelFromPatterns(scope, patterns): ModelType | null` — pattern'lardan model onerisi. JSDoc VAR.
- `resolveTaskModel(title, desc, scope, config, patterns?, forceModel?, skillModels?, provider?): ModelType` — katmanli model resolver. JSDoc VAR, tam detayli.

## 3. Ic Bagimliliklar
- `../core/types.js` — TaskScope, ModelType, ResolvedConfig, PatternEntry, ProviderName, getModelTier
- `../core/model-equivalence.js` — getEquivalentModel, isModelAvailable, ModelTier
- Dongusel bagimllik riski: YOK. model-selector tek yonlu core/ imports.

## 4. Dis Bagimliliklar
- Node built-in: YOK
- node_modules: YOK
- ADR-010 uyumu: UYUMLU (sifir runtime dep)

## 5. Complexity
- Fonksiyon sayisi: 8 (6 export + 2 private)
- En karmasik: `resolveTaskModel()` (sat 202-282, 80 satir, 7 katman)
- Max cyclomatic: ~8 (resolveTaskModel icindeki dallanmalar)

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: 1 — sat 274: `as ResolvedConfig` spread sonrasi. Guvenli: sadece worker_provider override.
- Genel: YUKSEK type safety.

## 7. ADR Compliance
- ADR-006 spawnSync: UYUMLU (spawnSync kullanmiyor)
- ADR-008 brain import: UYUMLU (sadece core/ importlar)
- ADR-010 deps: UYUMLU
- ADR-022 CLI/MCP parity: N/A (internal module)
- ADR-033 product vision: UYUMLU
- ADR-037 RBAC: N/A
- ADR-039 self-modifying: N/A
- Memory V2 DB-first: N/A (memory kullanmiyor)

## 8. Test Coverage
- tests/orchestra/model-selector-skill.test.ts — skill model preferences
- tests/orchestra/model-selector-provider.test.ts — provider mapping
- tests/orchestra/pattern-model-suggestion.test.ts — pattern-based suggestion
- Mock kalitesi: IYI (core module mocks)
- Edge case coverage: ORTA — premium_plus tier testi eksik olabilir

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- TIER_CLAUDE_MODEL premium_plus → 'opus' fallback (sat 23) — premium_plus modeller eklenene kadar kullanilmayacak ama intentional placeholder
- `inferModelFromDirective()` — resolveTaskModel tercih edildigi icin DIS kullanimda dead code adayi olabilir. Ama test'lerde ve task-builder'da hala kullaniliyor.

## 11. Security
- Input validation: scope.directories, scope.filesWrite uzunluk kontrolleri implicit (array ops guvenli)
- Injection riski: YOK (regex pattern'lar literal)
- Secret exposure: YOK

## 12. Memory V2 Uyumu
- N/A — bu modul memory sistemiyle etkilesmiyor

## 13. i18n
- architectPatterns regex'inde "mimari" Turkce keyword VAR (sat 58) — DOGRU, TR destegi
- Diger keyword'ler Ingilizce — TR/EN hybrid UYGUN

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: TUTARLI
- Layer sirasi dokumantasyonu (sat 186-199) ↔ kod sirasi: TUTARSIZ — dokumanda "Layer 1, 2, 3, 4, 5" ama kodda "0, 4, 4b, 4d, 2, 1, 1b, 5" sirasi. Neden boyle: en yuksek oncelikli layer en son uygulanir (override). Mantikli ama dokumanla cakisiyor.

## 15. Performance
- Sync I/O: 0
- Hot path: HAYIR — sadece plan/spawn zamani calisir
- Gereksiz disk I/O: YOK

## 16. Oneriler
- **P2:** resolveTaskModel JSDoc'taki layer sirasini gercek uygulama sirasina gore guncelle
- **P3:** premium_plus tier icin model eklendikten sonra TIER_CLAUDE_MODEL[premium_plus] guncellenmeli
- **P3:** `inferModelFromDirective` kullanim analizi — eger sadece internal ise export kaldirilebilir

## Verdict: ANALYZED
