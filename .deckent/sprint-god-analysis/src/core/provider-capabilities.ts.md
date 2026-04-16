# Analysis: src/core/provider-capabilities.ts
**Task ID:** 142-004 | **Model:** opus | **LoC:** 157 | **Effort:** max

## 1. Amaci
Provider seviyesinde yetenek matrisi tanimlar: streaming, toolUse, vision, codeExecution, maxContextTokens, costPerMillionTokens. Provider karsilastirmasi, task-provider eslestirmesi ve maliyet butce kontrolu icin kullanilir. getModelCapabilities() ile model seviyesinde sorgulama da saglar.

## 2. Public API
- `interface ProviderCapability` — yetenek tipi (streaming, toolUse, vision, codeExecution, maxContextTokens, costPerMillionTokens)
- `function getCapabilities(provider): ProviderCapability` — provider capability sorgula
- `function getProvidersWithCapability(capability): ProviderName[]` — belirli capability'ye sahip providerlari bul
- `function canProviderHandle(provider, requirements): boolean` — provider gereksinim karsilama testi
- `function getAllProviders(): ProviderName[]` — tum provider isimleri
- `function getModelCapabilities(modelId): ProviderCapability` — model → provider capability

JSDoc: **MEVCUT** — tum public fonksiyonlarda detayli JSDoc. Yeterli.

## 3. Ic Bagimliliklar
- `./model-equivalence.js` → ProviderName, getModelProvider
- `./task-types.js` → ModelType
- `./errors.js` → DeckentError

Dongusel bagimllik riski: **YOK**

## 4. Dis Bagimliliklar
Yok (ADR-010 uyumlu).

## 5. Complexity
- Fonksiyon sayisi: 5
- Max cyclomatic complexity: `canProviderHandle()` (satir 101-125) — typeof branch'leri ile ~6 cyclomatic
- Genel complexity: DUSUK

## 6. Type Safety
- `any` sayisi: **0**
- `@ts-ignore`: **0**
- `as` cast: Satir 109 `key as keyof ProviderCapability`, satir 115 `actual as number`, satir 118-119 `required as { input: number; output: number }`, `actual as { input: number; output: number }` — Object.entries donus tipi nedeniyle gerekli. **P3 — TypeScript sinirlamasi, kacinilmaz.**
- Non-null `!`: **0**

## 7. ADR Compliance
- **ADR-006**: N/A
- **ADR-008**: ✅ core/ icerisinde, orchestra/ import yok
- **ADR-010**: ✅
- **ADR-033**: ✅ provider-agnostic capability matrix

## 8. Test Coverage
- `tests/core/provider-capabilities.test.ts` — 18 test
  - getCapabilities: 5 test (3 provider + unknown + copy check)
  - getProvidersWithCapability: 4 test (streaming, toolUse, maxContext, cost)
  - canProviderHandle: 7 test (boolean, numeric, cost, empty, unknown)
  - getAllProviders: 1 test
- Mock kalitesi: N/A (statik veri, mock gereksiz)
- **EKSIK:** getModelCapabilities() icin HICBIR test yok! **P1**

## 9. TODO/FIXME/HACK Inventory
- Satir 138-139: Yorum "When ModelRegistry (Task 1) lands, this will delegate to per-model definitions." — **P2 — STALE TODO**: ModelRegistry zaten Sprint 134'te implement edildi. Bu yorum eskimis. Ayrica getModelCapabilities() hala provider-level capability donuyor, per-model capability degil.

## 10. Dead Code
Yok.

## 11. Security
Guvenlik riski yok — statik veri, kullanici girdisi almaz.

## 12. Memory V2 Uyumu
N/A

## 13. i18n
- DeckentError mesajlari Ingilizce — uygun.

## 14. Dokumantasyon Tutarliligi
- **⚠️ TUTARSIZLIK — maxContextTokens**: PROVIDER_CAPABILITIES'de Claude `maxContextTokens: 200_000` (satir 28). Ancak ModelRegistry'de opus `contextWindow: 1_000_000`, sonnet `contextWindow: 200_000`. Provider-level 200K Sonnet'e karsilik geliyor ama Opus 1M. **Bu provider-level capability en dusuk model'i yansitmali veya max model'i yansitmali — suan belirsiz. P1 — veri tutarsizligi.**
- Codex `maxContextTokens: 1_047_576` vs ModelRegistry gpt-4.1 `contextWindow: 1_000_000` — burada da tutarsizlik var (1,047,576 vs 1,000,000). **P2.**

## 15. Performance
Sync I/O: **0** — tamamen in-memory. Performans sorunu yok.

## 16. Oneriler
1. **P1 — maxContextTokens tutarsizligi**: Claude provider-level 200K ama opus 1M context window. Provider capability ya max model window'u (1M) ya da minimum common window'u (200K) gostermeli — ama bu acikca belgelenmeli. Ayni durum Codex icin de gecerli.
2. **P1 — getModelCapabilities() test eksikligi**: 0 test. Ozellikle unknown model fallback logic test edilmeli.
3. **P2 — Stale yorum**: Satir 138-139 "When ModelRegistry (Task 1) lands" — ModelRegistry zaten mevcut. getModelCapabilities() ModelRegistry'den per-model capability cekmeli, provider-level approximation yerine.
4. **P3 — canProviderHandle() as cast**: TypeScript sinirlamasi, ancak generic overload ile type-safe hale getirilebilir.

## Verdict: ANALYZED
