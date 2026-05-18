# Analysis: src/orchestra/managed-docs/managed-doc-runner.ts
**Task ID:** 140-002 | **LoC:** 183

## 1. Amaci
Managed docs güncelleme orkestratörü. `.deckent/docs.json`'daki tüm kayıtlı dokümanlar için içerik üretir ve dosyaları günceller. Hash cache ile değişmemiş dokümanları atlar. `docs run` CLI komutu için standalone context builder da sağlar.

## 2. Public API
- `runManagedDocUpdates(ctx: DocUpdateContext): DocUpdateResult[]`
- `buildStandaloneDocContext(projectRoot): DocUpdateContext | null`

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:path`
- **Dis:** `../../core/utils.js` (debugLog)
- **Dis:** `../../core/constants.js` (BRAIN_DIR, SPRINTS_DIR)
- **Dis:** `../../core/types.js` (Sprint, SprintMetrics, SprintResult, ResolvedConfig)
- **Dis:** `../doc-updaters/types.js` (DocUpdateContext, DocUpdateResult)
- **Dis:** `./docs-config.js`, `./content-generators.js`, `./section-updater.js`, `./template-renderer.js`, `./plugin-loader.js`, `./doc-cache.js`

## 4. Complexity
- 2 fonksiyon, cyclomatic ~12 (for döngüsü + çoklu guard + try/catch)
- Entegrasyon noktası — tüm managed-docs modüllerini bağlar

## 5. Type Safety
- `{ id: sprintId, number: ..., tasks: [] } as unknown as Sprint` — **double unsafe cast** ⚠️
  - `Sprint` tipi zorla dönüştürülüyor — standalone context için Sprint mock yapısı yetersiz
  - `emptyMetrics()` helper temiz ✓

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-030 (Template Engine + Plugin Loader):** tam implementasyon ✓
- **ADR-031 (Content Hash Cache):** cache integration ✓

## 7. Test Coverage
- Entegrasyon test bekleniyor — `tests/orchestra/managed-docs/managed-doc-runner.test.ts`

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Yok

## 10. Security Findings
- `loadUserGeneratorsAsync` (MJS plugin yükleme) production'da kullanılmıyor — only `loadUserGeneratorsSync`
- Plugin yükleme güvenlik notu: "MJS generators run in the Node process — only load from trusted sources" ✓

## 11. Memory V2 Uyumu
- `buildStandaloneDocContext`: sprint ID'yi `.brain/sprints/` dosyalarından okuyor — Memory V2 DB'den okuyabilir
- Sprint log için `SPRINTS_DIR` dosya tabanlı dependency

## 12. Oneriler
- `as unknown as Sprint` → `StandaloneSprintContext` gibi hafif interface ile çöz
- `buildStandaloneDocContext` Memory V2'ye migrate et (Sprint 142 P2)

## 13. Verdict: ANALYZED
