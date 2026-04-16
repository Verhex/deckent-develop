# Analysis: src/orchestra/managed-docs/docs-config.ts
**Task ID:** 142-012 | **Model:** opus | **LoC:** 101 | **Effort:** max

## 1. Amacı
`.deckent/docs.json` dosyasını yönetir: load, save, add, remove, get işlemleri. User-defined managed document entry'lerinin CRUD katmanı. `deckent docs add/remove/list` CLI komutları ve MCP `deckent_docs` tool'u tarafından kullanılır. Her doc entry bir ID, path, autoSections, protectedSections ve templates alanlarından oluşur. ID otomatik olarak dosya yolundan üretilir.

## 2. Public API
- `generateDocId(filePath: string): string` — JSDoc VAR, path→ID dönüşümü
- `loadDocsConfig(projectRoot: string): DocsConfig | null` — JSDoc VAR, null-safe
- `saveDocsConfig(projectRoot: string, config: DocsConfig): void` — JSDoc VAR
- `addDoc(projectRoot: string, entry: Omit<ManagedDocEntry, 'id'> & { id?: string }): string` — JSDoc VAR, upsert semantiği
- `removeDoc(projectRoot: string, idOrPath: string): boolean` — JSDoc VAR
- `getDoc(projectRoot: string, idOrPath: string): ManagedDocEntry | null` — JSDoc VAR

Tüm public fonksiyonlar JSDoc'lu. İyi dokümante edilmiş.

## 3. İç Bağımlılıklar
- `../../core/constants.js` → DOCS_CONFIG_FILE
- `../../core/utils.js` → debugLog
- `./types.js` → DocsConfig, ManagedDocEntry

Döngüsel bağımlılık riski: YOK.

## 4. Dış Bağımlılıklar
- `node:fs` — existsSync, readFileSync, writeFileSync, mkdirSync
- `node:path` — join, dirname

ADR-010 uyumu: TAMAM.

## 5. Complexity
- 6 fonksiyon, hepsi düşük-orta karmaşıklık
- Max cyclomatic: addDoc (~5 branch: config null, entry.id, findIndex, existing >= 0)
- generateDocId: 4 regex chain — basit ama chain uzun

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: `JSON.parse(raw) as DocsConfig` (satır 36) — parse sonucu hemen version/docs kontrolü yapılıyor (satır 37). Yeterli.
- addDoc imzası: `Omit<ManagedDocEntry, 'id'> & { id?: string }` — doğru TypeScript pattern, id optional override.

## 7. ADR Compliance
- **ADR-006:** UYUMLU
- **ADR-008:** UYUMLU
- **ADR-010:** UYUMLU
- **ADR-029 (Managed-Docs Universalization):** UYUMLU — config management bu ADR'nin parçası
- **ADR-031 (Content Hash Cache):** N/A — config, cache değil
- **ADR-033:** UYUMLU
- **Memory V2 DB-first:** N/A — docs config ayrı bir JSON dosyası, memory DB değil

## 8. Test Coverage
- Test dosyası: `tests/orchestra/managed-docs/docs-config.test.ts` — MEVCUT
- generateDocId, loadDocsConfig, addDoc, removeDoc, getDoc test ediliyor olmalı
- Edge case'ler: corrupt JSON, missing file, duplicate ID, path normalization

## 9. TODO/FIXME/HACK Inventory
Hiçbiri yok.

## 10. Dead Code
- Tüm export'lar index.ts barrel'dan re-export ediliyor → aktif
- getDoc: managed-doc-runner'da doğrudan kullanılmıyor ama CLI docs komutunda kullanılıyor olabilir

## 11. Security
- Input validation: `generateDocId` regex ile sanitize ediyor (non-alphanumeric → `-`). Path traversal koruması dolaylı.
- addDoc: Duplicate check mevcut (id veya path eşleşmesi) — data integrity koruması
- JSON.parse: try/catch içinde
- **Potansiyel risk:** `saveDocsConfig` herhangi bir path'e yazabilir — projectRoot doğrulaması yok. Brain tarafından sağlandığı için düşük risk.

## 12. Memory V2 Uyumu
- N/A — docs config Memory V2 kapsamı dışında
- Doğru ayrım: `.deckent/docs.json` ≠ `.brain/memory.db`

## 13. i18n
- i18n içerik: YOK — config yönetimi dil-agnostik
- turkishNormalize: N/A

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ davranış: UYUMLU
- generateDocId örnekleri JSDoc'ta: "docs/ARCHITECTURE.md" → "docs-architecture-md" — regex ile doğrulanabilir, doğru
- addDoc "Creates config file if missing" — loadDocsConfig null → default config oluşturuluyor (satır 62), doğru

## 15. Performance
- Sync I/O: 6 çağrı (existsSync, readFileSync ×2, writeFileSync ×2, mkdirSync)
- Hot path: CLI veya MCP komut çağrısında 1 kez — düşük sıcaklık
- loadDocsConfig her addDoc/removeDoc/getDoc'ta çağrılıyor — tekrarlı disk okuma, ama config dosyası küçük

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P3 | addDoc'ta mevcut entry güncellenirken spread kullanımı (`...config.docs[existing], ...entry, id`) — enabled=false olan entry'yi yanlışlıkla enabled yapabilir (entry'de enabled undefined ise eski değer korunur, sorun yok) |
| P3 | loadDocsConfig tekrarlı çağrıları azaltmak için in-memory cache düşünülebilir |
| P3 | generateDocId edge case: boş string → "" dönüyor (`.replace(/^-|-$/g, '')` sonrası boş kalabilir) |

## Verdict: ANALYZED
