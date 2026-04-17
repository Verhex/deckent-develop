# Analysis: src/orchestra/managed-docs/doc-cache.ts
**Task ID:** 140-002 | **LoC:** 57

## 1. Amaci
Managed docs için SHA-1 tabanlı hash cache sistemi. `.deckent/cache/managed-docs-cache.json` dosyasında (entryHash + fileHash + updatedAt) tuple'ları saklar. Aynı içerik üretildiğinde gereksiz writeFileSync'i önler. ADR-031 (Content Hash Cache) implementasyonu.

## 2. Public API
- `contentHash(input: string): string` — SHA-1 hex digest
- `readDocCache(projectRoot): DocCache`
- `writeDocCache(projectRoot, cache): void`
- `clearDocCache(projectRoot): void`

Export tipler:
- `DocCacheEntry` interface
- `DocCache` type (Record<string, DocCacheEntry>)

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:crypto` (createHash)
- **Dis:** `node:fs` (existsSync, mkdirSync, readFileSync, writeFileSync)
- **Dis:** `node:path` (dirname, join)
- **Dis:** `../../core/utils.js` (debugLog)

## 4. Complexity
- 4 fonksiyon, cyclomatic ~4 (guard + try/catch)

## 5. Type Safety
- `JSON.parse(raw) as unknown` → `as DocCache` — generic parse güvenli ✓
- `typeof parsed === 'object'` guard ✓

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-031 (Content Hash Cache):** tam implementasyon ✓
- SHA-1 güvenlik notu: cache invalidation için yeterli, kriptografik amaçla kullanılmıyor — açıklama iyi

## 7. Test Coverage
- `tests/docs/doc-cache.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Yok

## 10. Security Findings
- SHA-1 kullanımı: sadece cache key, güvenlik değil — kabul edilebilir ✓
- Cache dosyası `.deckent/cache/` altında — gitignore'da mı? Kontrol gerekli

## 11. Memory V2 Uyumu
- Cache dosya tabanlı — Memory V2 DB'ye taşınabilir ama gerekli değil (ephemeral cache)

## 12. Oneriler
- `.deckent/cache/` dizininin `.gitignore`'a eklendiğini doğrula

## 13. Verdict: ANALYZED
