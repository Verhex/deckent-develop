# Analysis: src/orchestra/managed-docs/doc-cache.ts
**Task ID:** 142-012 | **Model:** opus | **LoC:** 57 | **Effort:** max

## 1. Amacı
Sprint finalize sırasında managed doc güncellemelerini hızlandırmak için hafif bir cache katmanı sağlar. `.deckent/cache/managed-docs-cache.json` dosyasında doc ID bazlı (entryHash, fileHash, updatedAt) tuple'ları saklar. Hem entry konfigürasyonu hem dosya içeriği değişmediyse yeniden üretimi atlar. ADR-031 (Content Hash Cache) implementasyonunun merkezi. managed-doc-runner.ts tarafından kullanılır.

## 2. Public API
- `contentHash(input: string): string` — JSDoc VAR, SHA-1 hex digest
- `readDocCache(projectRoot: string): DocCache` — JSDoc eksik (sadece fonksiyon imzası)
- `writeDocCache(projectRoot: string, cache: DocCache): void` — JSDoc eksik
- `clearDocCache(projectRoot: string): void` — JSDoc VAR, "Exposed for CLI docs run --no-cache"
- `DocCacheEntry` interface — export, 3 alan (entryHash, fileHash, updatedAt)
- `DocCache` type — `Record<string, DocCacheEntry>`

readDocCache ve writeDocCache için JSDoc EKSIK.

## 3. İç Bağımlılıklar
- `../../core/utils.js` → debugLog

Döngüsel bağımlılık riski: YOK. Tek import core/utils.

## 4. Dış Bağımlılıklar
- `node:crypto` — createHash (SHA-1)
- `node:fs` — existsSync, mkdirSync, readFileSync, writeFileSync
- `node:path` — dirname, join

ADR-010 uyumu: TAMAM. Sadece Node built-in.

## 5. Complexity
- 4 fonksiyon, hepsi düşük karmaşıklık
- Max cyclomatic: readDocCache (~3 branch: existsSync, try/catch, typeof check)
- Toplam: Çok basit modül, iyi kapsüllenmiş

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 1 adet — satır 35 `JSON.parse(raw) as unknown` — güvenli pattern, sonra typeof check yapılıyor
- Non-null `!`: 0
- Unsafe cast: `parsed as DocCache` (satır 36) — typeof object check'ten sonra, kabul edilebilir ama DocCache yapısı doğrulanmıyor (entryHash/fileHash/updatedAt alanları check edilmiyor)

## 7. ADR Compliance
- **ADR-006 (spawnSync):** UYUMLU — kullanılmıyor
- **ADR-008 (brain import):** UYUMLU — brain import yok
- **ADR-010 (deps):** UYUMLU
- **ADR-031 (Content Hash Cache):** UYUMLU — bu modülün kendisi ADR-031'in implementasyonu
- **ADR-033 (product vision):** UYUMLU
- **ADR-037 (RBAC):** N/A
- **ADR-039 (self-modifying):** N/A
- **Memory V2 DB-first:** N/A — bu modül memory ile ilgili değil, doc cache mekanizması

## 8. Test Coverage
- Test dosyası: tests/orchestra/managed-docs/ altında ayrı doc-cache.test.ts YOK
- managed-doc-runner.test.ts içinde cache dolaylı olarak test ediliyor olabilir
- **Coverage gap:** contentHash, readDocCache, writeDocCache, clearDocCache için dedicated test YOK
- **Severity:** P2 — basit modül ama test eksik

## 9. TODO/FIXME/HACK Inventory
Hiçbiri yok.

## 10. Dead Code
- `clearDocCache` — CLI `docs run --no-cache` için expose ediliyor. Kullanılıyor mu kontrol gerekli ama JSDoc'a göre aktif.
- Tüm export'lar kullanımda görünüyor.

## 11. Security
- SHA-1 kullanımı: Cache invalidation için yeterli. Kriptografik güvenlik gerekmiyor — collision riski kabul edilebilir.
- JSON.parse: try/catch içinde, parse hatası graceful handle ediliyor
- File path injection: `projectRoot` kullanıcı girdisi olabilir — join ile birleştiriliyor, path traversal riski düşük (projectRoot brain tarafından sağlanıyor)
- Secret exposure: YOK

## 12. Memory V2 Uyumu
- DB-first mi? N/A — doc cache ayrı bir mekanizma, memory DB ile ilgisi yok
- Eski .md parse: YOK
- Doğru ayrım: Cache JSON dosyası .deckent/cache/ altında, .brain/ ile karışmıyor

## 13. i18n
- i18n içerik: YOK — cache mekanizması dil-agnostik
- turkishNormalize: N/A

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ davranış: contentHash JSDoc'u "Stable SHA-1" diyor — doğru
- clearDocCache JSDoc'u CLI referansı veriyor — doğru
- readDocCache/writeDocCache JSDoc EKSIK
- Modül başı açıklama yeterli ve doğru

## 15. Performance
- Sync I/O: 4 çağrı (existsSync, readFileSync, mkdirSync, writeFileSync)
- Hot path: Sprint finalize başında 1 kez read, sonunda 1 kez write — düşük sıcaklık
- SHA-1 hesaplama: Küçük stringler için ihmal edilebilir
- Cache dosyası büyüklüğü: doc sayısına bağlı, genellikle <10 entry — performans sorunu yok

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | Dedicated doc-cache.test.ts ekle — contentHash, readDocCache corrupt JSON, writeDocCache mkdir |
| P3 | readDocCache/writeDocCache için JSDoc ekle |
| P3 | readDocCache'de DocCacheEntry yapı doğrulaması ekle (entryHash/fileHash string mi?) |
| P3 | SHA-1 yerine xxHash veya daha hızlı hash — şu an gereksiz, boyut küçük |

## Verdict: ANALYZED
