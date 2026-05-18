# Analysis: src/core/config-types.ts
**Task ID:** 140-001 | **LoC:** 451

## 1. Amaci
Config, CLI ve proje analizi ile ilgili tüm TypeScript tiplerini tanımlar. `DeckentConfig`, `ResolvedConfig`, `StartOptions`, `DoctorResult`, `ProjectAnalysis` gibi merkezi tipler buradadır. Memory V2 config section (`memory?: {...}`) eklenmiş.

## 2. Public API (export listesi)
- `PlanModeConfig`, `BrainPlanningMode`, `PlanMode`, `SkillConfig`, `AdaptiveConfig`
- `DeckentConfig` (ana config interface — 60+ alan)
- `ResolvedConfig` (runtime resolved config)
- `ConfigCategory`, `ConfigFieldMeta`
- `AutoDocsConfig`, `StartOptions`, `DoctorResult`
- `SubscriptionDetected`, `DetectionMethod`, `SubscriptionProfile`
- `SetupRecommendation`
- Proje analiz tipleri: `DetectedFramework`, `DetectedLanguage`, `DetectedTestFramework`, `DetectedBuildTool`, `DetectedCI`, `ProjectSize`, `MethodologyRecommendation`, `AnalyzerSuggestion`, `ProjectAnalysis`
- `SystemProfile`

## 3. İç + Dış Bağımlılıklar
- **İç**: `decision-config.ts`, `notifications.ts`, `task-types.ts`, `mode-presets.ts`, `model-equivalence.ts`
- **Dış**: Yok (pure type file)

## 4. Complexity
- Fonksiyon: 0 (pure interface/type definitions)
- Satır sayısı: 451 — büyük ama makul

## 5. Type Safety
- `any` kullanımı: 0
- `@ts-ignore`: 0
- Non-null assertion: 0

## 6. ADR Compliance
- **ADR-004** (3-Layer Config Merge): tip düzeyinde destek var
- **Memory V2**: `DeckentConfig.memory` bloğu mevcut ✅

## 7. Test Coverage
- Doğrudan tip dosyası — runtime test minimal, compile-time doğrulama yeterli

## 8. TODO/FIXME/HACK inventory
- `@deprecated` alanlar açıkça işaretlenmiş (memory_budget, decay_after_sprints)
- `output_render_mode` type alias string — `'explainatory'` yazım hatası ("explanatory" değil) — teknik borç

## 9. Dead Code Candidates
- `PlanMode` içinde `'max_plan' | 'max5x_plan' | 'pro_plan'` — legacy alias'lar, `resolveMode()` ile çözümleniyor. Tip genişletici ama runtime'da gerekli.

## 10. Security Findings
- `api_auth_token?: string` — dokümanlar env var kullanımını öneriyor, ancak config dosyasında tutulabilir. Hassas veri riski.

## 11. Memory V2 Uyumu
- `DeckentConfig.memory` section eklenmiş ✅
  - `backend?: 'sqlite' | 'json'`
  - `search?: 'fts5' | 'semantic' | 'hybrid'`
  - `decay_after_sprints?: number`
  - `export_md?: boolean`
  - vb.
- Flat V1 alanlar `@deprecated` ile işaretlenmiş ✅

## 12. Öneriler
- `'explainatory'` typo düzeltilmeli → `'explanatory'` (breaking change değil eğer kullanım minimal)
- `api_auth_token` için `env: 'DECKENT_API_TOKEN'` notu eklenmeli

## 13. Verdict: ANALYZED
