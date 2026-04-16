# Analysis: src/cli/auto-setup.ts
**Task ID:** 142-023 | **Model:** opus | **LoC:** 113 | **Effort:** max

## 1. Amaç
Otomatik kurulum öneri modülü. Sistem profili (CPU, RAM), abonelik tipi (max/pro/unknown) ve proje analizi (boyut) temelinde yapılandırma önerileri üretir. `init` komutu tarafından kullanılır — yeni proje kurulumunda optimal ayarları belirler: mode, worker sayısı, model tier, planning mode.

## 2. Public API
- `function generateSetupRecommendation(systemProfile, subscription, projectAnalysis): SetupRecommendation` — JSDoc VAR ✓

Internal helpers (export edilmiyor):
- `getWorkerMultiplier(size): number`
- `selectMode(subscription): PlanMode`
- `selectTiers(mode): { brain_tier, worker_tier }`
- `tierToModel(tier): ModelType`
- `selectPlanning(subscription): BrainPlanningMode`

## 3. İç Bağımlılıklar
- `../core/types.js` → SystemProfile, SubscriptionDetected, ProjectAnalysis, ProjectSize, SetupRecommendation, PlanMode, ModelType, BrainPlanningMode
- `../core/model-registry.js` → ModelTier, modelRegistry
- `../core/mode-presets.js` → getModePreset
- Döngüsel bağımlılık riski: YOK (tek yönlü core→cli)

## 4. Dış Bağımlılıklar
Hiçbir dış bağımlılık yok. ADR-010: TAM ✓

## 5. Complexity
- Fonksiyon sayısı: 6 (1 public + 5 private)
- Max cyclomatic: ~3 (switch cases)
- En karmaşık fonksiyon: `generateSetupRecommendation` (satır 72) — sequential pipeline, 5 step

## 6. Type Safety
- `any` sayısı: 0 ✓
- `(model?.id ?? 'sonnet') as ModelType` (satır 58): Unsafe cast
  - `modelRegistry.getByProviderAndTier` null dönebilir, fallback 'sonnet' doğru
  - Ama `as ModelType` cast güvenli çünkü 'sonnet' ModelType enum'unda
  - Severity: P3 (kabul edilebilir)
- Tip güvenliği: İYİ

## 7. ADR Compliance
- ADR-006: N/A ✓
- ADR-008: Brain import yok ✓
- ADR-010: TAM ✓
- ADR-023 Plan Tier Generalizasyonu: `selectTiers` tier-based routing kullanıyor ✓ — TAM UYUM
- ADR-033 Product Vision: Setup önerisi product-oriented ✓
- Memory V2: N/A (setup utility)

## 8. Test Coverage
- Test dosyası: `tests/cli/auto-setup.test.ts` MEVCUT ✓
- Kritik: her subscription tipi (max/pro/unknown), her proje boyutu (small/medium/large), edge case (0 core, minimal RAM)

## 9. TODO/FIXME/HACK Inventory
Hiç yok ✓

## 10. Dead Code
- Tüm fonksiyonlar aktif — `generateSetupRecommendation` `init.ts` tarafından çağrılıyor ✓
- Dead code: YOK ✓

## 11. Security
- Girdi doğrulama: TypeScript type constraint ile sınırlı
- Dışarıdan veri: systemProfile OS bilgisi — güvenli (internal)
- Secret exposure: YOK ✓

## 12. Memory V2 Uyumu
N/A — Setup utility, DB ile etkileşim yok.

## 13. i18n
- `reasons` array string'leri EN:
  - "Subscription \"{sub}\" → mode \"{mode}\""
  - "System recommends max N workers (N cores, N MB RAM)"
  - "Project size \"{size}\" (×N) → N workers"
  - "Brain tier: {tier} ({model}), Worker tier: {tier} ({model})"
  - "Planning mode: {mode}"
- Severity: P3 (iç debug/log bilgisi, kullanıcıya gösterilmiyor)

## 14. Dokümantasyon Tutarlılığı
- JSDoc: Public fonksiyon belgelenmiş ✓
- Mode-presets entegrasyonu: getModePreset doğru kullanılıyor ✓
- ModelRegistry entegrasyonu: tier→model mapping doğru ✓

## 15. Performance
- Sync I/O: 0 ✓
- ModelRegistry lookup: O(1) hash map ✓
- Hot path: Hayır (init sırasında bir kez çağrılır)

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P3 | `selectMode` — 'unknown' subscription 'economic' dönüyor, bu güvenli fallback ✓ |
| P3 | `getWorkerMultiplier` switch — exhaustiveness check (default case yok ama TypeScript narrow) |
| P3 | i18n: reasons string'leri locale-aware yapılabilir (düşük öncelik — debug/log) |

## Verdict: ANALYZED
