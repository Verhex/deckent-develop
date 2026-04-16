# Analysis: src/core/config-types.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 451 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
config-types.ts, konfigürasyon alanindaki tum tip tanimlarini icerir. types.ts'den ayrilmis — config, setup, CLI, ve proje analiz tipleri burada. DeckentConfig (60+ alan), ResolvedConfig, PlanModeConfig, SkillConfig, AdaptiveConfig, AutoDocsConfig gibi temel arayuzleri tanimlar. Ayrica CLI tipleri (StartOptions, DoctorResult), subscription profili, setup recommendation, ve proje analiz tipleri (ProjectAnalysis, SystemProfile) icerir. Tum config-related modüller bu dosyayi import eder.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Tur | JSDoc |
|--------|-----|-------|
| `PlanModeConfig` | interface (8 alan) | Inline per-field JSDoc VAR |
| `BrainPlanningMode` | type alias | EKSIK |
| `PlanMode` | type alias (7 literal) | EKSIK |
| `SkillConfig` | interface (4 alan) | Inline comments VAR |
| `AdaptiveConfig` | interface (3 alan) | Per-field JSDoc **VAR** |
| `DeckentConfig` | interface (~60 alan) | Per-field JSDoc **VAR** (kapsamli) |
| `ResolvedConfig` | interface (~35 alan) | Per-field JSDoc **VAR** |
| `ConfigCategory` | type alias (12 literal) | EKSIK |
| `ConfigFieldMeta` | interface (5 alan) | EKSIK |
| `AutoDocsConfig` | interface (3 alan) | Inline comments VAR |
| `StartOptions` | interface (2 alan) | Inline comments VAR |
| `DoctorResult` | interface | EKSIK |
| `SubscriptionDetected` | type alias | EKSIK |
| `DetectionMethod` | type alias | EKSIK |
| `SubscriptionProfile` | interface (4 alan) | EKSIK |
| `SetupRecommendation` | interface (7 alan) | Per-field JSDoc VAR (deprecated notlari) |
| 8x Detected* type aliases | type aliases | EKSIK |
| `AnalyzerSuggestion` | interface | EKSIK |
| `ProjectAnalysis` | interface | EKSIK |
| `SystemProfile` | interface (4 alan) | EKSIK |

**Toplam: ~26 export. ~10 JSDoc VAR, ~16 EKSIK.** Major tiplerde (DeckentConfig, ResolvedConfig, PlanModeConfig) JSDoc iyi. Minor tiplerde eksik.

## 3. Ic Bagimliliklar
- `./decision-config.js` → DecisionEngineConfig, LearningConfig, CollaborationConfig
- `./notifications.js` → NotificationConfig
- `./task-types.js` → ModelType, ProviderName, EvaluationRubric
- `./mode-presets.js` → ModelStrategy
- `./model-equivalence.js` → ModelTier

5 import — tumu type-only. Dongusel risk: **DUSUK.** decision-config.ts ve notifications.ts'nin config-types.ts'yi geri import etmemesi gerekir.

## 4. Dis Bagimliliklar
**SIFIR.**

## 5. Complexity
| Metrik | Deger |
|--------|-------|
| Toplam type/interface | ~26 |
| En buyuk interface | DeckentConfig (~60 alan) |
| Ikinci buyuk | ResolvedConfig (~35 alan) |

Tamamen deklaratif. Runtime karmasikligi SIFIR.

## 6. Type Safety
- **DeckentConfig vs ResolvedConfig drift:** ResolvedConfig, DeckentConfig'in resolved hali ama alanlar el ile kopyalanmis. Eklenen yeni DeckentConfig alanlari ResolvedConfig'te unutulabilir. **P2 — otomatik turetme daha guvenli olur.**
- **output_render_mode:** `'explainatory'` yazim hatasi — dogru yazim `'explanatory'`. Ancak bu kod'daki yazim tutarli kullaniliyorsa breaking change olur. **P3 — yazim hatasi.**
- **PlanMode:** `'max_plan' | 'max5x_plan' | 'pro_plan'` hala union'da — deprecated legacy aliases. Temizlenmesi ADR-023 gercekteki kullanima bagli.

## 7. ADR Compliance
| ADR | Uyum | Aciklama |
|-----|------|----------|
| ADR-004 | **UYUMLU** | 3-layer config merge tipleri |
| ADR-023 | **UYUMLU** | ModelTier, ModelStrategy, brain_tier/worker_tier tanimli |
| ADR-033 | **UYUMLU** | telemetry alanları tanimli, default false |
| Memory V2 | **UYUMLU** | DeckentConfig.memory section tanimli (satir 168-187), backend/search/semantic_provider/decay_after_sprints/export_md/export_trigger/custom_types/keyword_aliases |

## 8. Test Coverage
- **Test dosyasi:** `tests/core/config-types.test.ts` — MEVCUT
- Type-only dosya — runtime testi sinirli. Tip uyumlulugu tsc ile dogrulanir.

## 9. TODO/FIXME/HACK inventory
**SIFIR.**

## 10. Dead Code
- **@deprecated alanlar:** 4 adet
  - DeckentConfig.memory_budget (satir 157-159) — "Use memory.backend instead"
  - DeckentConfig.decay_after_sprints (satir 160-162) — "Use memory.decay_after_sprints instead"
  - SetupRecommendation.brainModel (satir 402-403) — "Use brain_tier instead"
  - SetupRecommendation.defaultModel (satir 404-405) — "Use worker_tier instead"
- Bu @deprecated alanlar HALA aktif kullaniliyor (config.ts'te memory_budget, decay_after_sprints okunuyor). Kaldirmak breaking change olur. **Deprecated ama dead DEGIL.**
- **ConfigFieldMeta** (satir 353-359): CONFIG_METADATA config.ts'te `ConfigMetadataEntry` kullaniyor, `ConfigFieldMeta` degil. **POTANSIYEL DEAD TYPE.** P3.

## 11. Security
- **api_auth_token** (satir 154): Bearer token DeckentConfig'te string olarak saklanabilir. Config dosyasina yazilirsa disk'te plaintext kalir. **P2 — DECKENT_API_TOKEN env var tercih edilmeli, config dosyasindaki token warn edilmeli.**
- **api_keys** (satir 96): Record<string, string> — API key'ler plaintext.

## 12. Memory V2 Uyumu
- **DeckentConfig.memory section:** TANIMLI (satir 168-187). 8 alt alan:
  - backend: 'sqlite' | 'json' — DB backend secimi
  - search: 'fts5' | 'semantic' | 'hybrid' — arama modu
  - semantic_provider: 'claude' | 'openai' | 'local' | null
  - decay_after_sprints: number — soft-delete threshold
  - export_md: boolean — MD snapshot uretimi
  - export_trigger: 'sprint_end' | 'every_write' | 'manual'
  - custom_types: string[] — kullanici tanimli entry tipleri
  - keyword_aliases: Record<string, string[]> — i18n keyword eslestirme
- **ResolvedConfig.memory:** **EKSIK!** DeckentConfig'te var ama ResolvedConfig'te yok. Bu config.ts'deki P2 gap ile uyumlu.
- **Legacy flat alanlar:** memory_budget, decay_after_sprints ResolvedConfig'te mevcut ama @deprecated.

## 13. i18n
- **output_render_mode:** 'explainatory' → yazim hatasi (Ingilizce 'explanatory'). 'standart' → yazim hatasi (Ingilizce 'standard'). Turkce/Ingilizce karisimi convention. Teknik olarak string literal — calismasi icin yazimin tutarli olmasi yeterli.
- JSDoc aciklamalari Ingilizce.

## 14. Dokumantasyon Tutarliligi
- **DECKENT.md Memory V2 section:** "Config: .deckent/config.json → memory.backend, memory.search, memory.decay_after_sprints" — DeckentConfig.memory section'da tanimli. **UYUMLU.**
- **DeckentConfig.memory.backend JSDoc:** "default: 'sqlite'" — Ancak createDefaultConfig()'te memory section YOK (implicit undefined → default behavior). **IMPLICIT vs EXPLICIT default gap.**
- **ResolvedConfig vs DeckentConfig:** ~25 alan ResolvedConfig'te DeckentConfig'ten eksik. Bunlarin cogu optional/advanced — ama Memory V2 memory section'in eksikligi P2.

## 15. Performance
- **Runtime etkisi:** SIFIR. Type-only dosya.

## 16. Oneriler
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| **P2** | ResolvedConfig'e memory section ekle | loadConfig'te DeckentConfig.memory → ResolvedConfig.memory aktarimi yap |
| P2 | DeckentConfig → ResolvedConfig otomatik turetme | `Omit<DeckentConfig, 'modes'> & { activeModeConfig: PlanModeConfig }` gibi otomatik turetme — drift onle |
| P3 | ConfigFieldMeta dead type | Kullanilmiyorsa kaldir |
| P3 | output_render_mode yazim | 'explainatory' → 'explanatory' (breaking change riski deger) |
| P3 | Legacy PlanMode literals | 'max_plan', 'max5x_plan', 'pro_plan' union'dan kaldir |
| P3 | api_auth_token guvenlik | Config dosyasinda token saklandiginda warning log'u ekle |

## Verdict: ANALYZED
