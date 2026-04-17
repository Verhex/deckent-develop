# Analysis: src/providers/gemini.ts
**Task ID:** 141-005-fix | **LoC:** 565

## 1. Amacı
Google Gemini CLI için ProviderAdapter implementasyonu. `gemini -p` ile headless çalışır, JSON output parse eder. REST API fallback script builder'ları içerir (deprecated). Streaming endpoint desteği.

## 2. Public API (export listesi)
- `GEMINI_TIER_MODELS` (deprecated), `GEMINI_AUTH_HEADER`
- `parseGeminiOutput`, `GeminiAdapter` class, `createGeminiAdapter` factory

## 3. İç + Dış Bağımlılıklar
- `core/model-registry.js` — modelRegistry
- `core/model-equivalence.js` — getModelForProviderTier
- `node:child_process`, `node:fs`, `node:path`

## 4. Complexity
- Yüksek — JSON/NDJSON parse, streaming endpoint, REST API fallback scripts

## 5. Type Safety
- `any` yok
- `parsed as { response?:..., candidates?:... }` — zorunlu JSON cast ✓

## 6. ADR Compliance
- **ADR-006:** `spawnSync('gemini', ['--version'], ...)` — array args ✓
- `spawn('gemini', args, spawnOpts)` — array args ✓. UYUMLU.

## 7. Test Coverage
- `tests/providers/gemini.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- `buildApiScript` ve `buildStreamingApiScript` — `@deprecated` işaretli, REST fallback.
- `GEMINI_TIER_MODELS` — `@deprecated`.

## 9. Dead Code Candidates
- `buildApiScript`, `buildStreamingApiScript` — deprecated, temizlenebilir.
- `GEMINI_TIER_MODELS` deprecated object.

## 10. Security Findings
- API key: `process.env.DECKENT_GOOGLE_API_KEY ?? process.env.GOOGLE_API_KEY` ✓
- `buildApiScript`: prompt string `escapedPrompt` — JS string içinde embed ediliyor, escape pattern var. Ancak XSS benzeri injection riski teorik; bu script node ile çalıştırılıyor değil, string olarak döndürülüyor.
- **DİKKAT:** `getStreamingEndpoint` ve `getEndpoint` API URL'leri string interpolasyonu ile build ediluyor: `${model}:streamGenerateContent` — model parametresi dışardan geliyorsa path injection riski var mı? Model sadece enum değerleri, config'den geliyor → düşük risk.

## 11. Memory V2 Uyumu - İlgisiz.

## 12. Öneriler
1. `buildApiScript`, `buildStreamingApiScript`, `GEMINI_TIER_MODELS` temizle.
2. `getEndpoint`/`getStreamingEndpoint` model parametresini validate et.

## 13. Verdict: ANALYZED
