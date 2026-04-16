# Analysis: src/core/utils.ts
**Task ID:** 142-005 | **Model:** opus | **LoC:** 341 | **Effort:** max

## 1. Amaci
Deckent projesinin genel yardımcı fonksiyonlarını barındıran utility modülü. Debug logging (ERRORS.md'ye yazma), güvenli dosya/JSON okuma, sprint ID yönetimi, teknik borç tablosu parse/generate, DECKENT.md referans enjeksiyonu ve i18n tarih/süre formatlama işlevlerini sağlar. Brain, orchestra, CLI ve diğer tüm modüller tarafından yaygın olarak import edilir.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `debugLog` | `(context: string, error: unknown) => void` | Var ✓ |
| `readFileSafe` | `(filePath: string) => string` | Var ✓ |
| `readJsonSafe` | `<T>(filePath: string) => T \| null` | Var ✓ |
| `readJsonSafeAsync` | `<T>(filePath: string) => Promise<T \| null>` | Var ✓ |
| `getNextSprintId` | `(projectRoot: string) => string` | Var ✓ |
| `updateLastSprintId` | `(projectRoot: string, sprintId: string) => void` | Var ✓ |
| `parseSprintNumber` | `(sprintId: string) => number` | Var ✓ |
| `shouldRemoveResolvedDebt` | `(entry: DebtItem, currentSprintId: string, retentionSprints?: number) => boolean` | Var ✓ |
| `parseDebtTable` | `(content: string) => DebtItem[]` | Var ✓ — @deprecated |
| `generateDebtTable` | `(items: DebtItem[]) => string` | Var ✓ — @deprecated |
| `ensureDeckentImport` | `(filePath: string) => void` | Var ✓ |
| `formatDate` | `(date: Date \| string, lang: string) => string` | Var ✓ |
| `formatDuration` | `(ms: number, lang: string) => string` | Var ✓ |
| `formatRelativeTime` | `(date: Date, lang: string) => string` | Var ✓ |

Tüm public fonksiyonların JSDoc'u mevcut ve doğru. ✓

## 3. Ic Bagimliliklar
- `./constants.js`: BRAIN_DIR, SPRINTS_DIR, DEBT_TABLE_HEADER, DECKENT_FILE, PROJECT_CONFIG_PATH, ERRORS_FILE, ERRORS_MAX_LINES
- `./types.js`: DebtItem (type), DebtPriority (enum)
- `node:fs`: readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync
- `node:fs/promises`: readFile
- `node:path`: join

Döngüsel bağımlılık riski: YOK — utils.ts başka core modülünü import etmez, leaf node.

## 4. Dis Bagimliliklar
Sadece Node.js built-in modüller: `node:fs`, `node:fs/promises`, `node:path`. ADR-010 uyumlu ✓

## 5. Complexity
- **Fonksiyon sayısı:** 14 (12 export + 2 internal)
- **En karmaşık fonksiyon:** `getNextSprintId` (satır 110-141) — iki kaynak (dosya + config) scan + Math.max
- **Max cyclomatic:** ~6 (getNextSprintId — 3 branching point, parseDebtTable — benzer)
- Genel karmaşıklık: DÜŞÜK — her fonksiyon tek sorumluluk, kısa

## 6. Type Safety
- **`any` sayısı:** 0 (yalnızca JSDoc yorumlarında "any" kelimesi geçiyor — doğal dil)
- **@ts-ignore:** 0
- **@ts-expect-error:** 0
- **`as unknown`:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** `as T` (satır 81, 97) — generic fonksiyonlarda JSON.parse sonucu, caller doğrulama sorumluluğunda. Kabul edilebilir ama JSDoc'ta belirtilmiş.
- **`as DebtPriority`:** satır 224 — `isDebtPriority` guard'dan sonra, GÜVENLİ

Type safety skoru: **YÜKSEK** ✓

## 7. ADR Compliance
| ADR | Uyum | Detay |
|-----|------|-------|
| ADR-005 (Sync I/O deprecated) | ⚠️ KISMEN | readFileSync/writeFileSync/appendFileSync/existsSync/readdirSync yaygın kullanım. ADR-005 deprecated ama projede sync I/O hala standart pattern |
| ADR-006 (spawnSync security) | ✓ | spawnSync yok |
| ADR-008 (Brain import) | ✓ | utils.ts başka orchestra/brain modülü import etmez |
| ADR-010 (Tek dependency) | ✓ | Sadece Node built-in |
| ADR-033 (Product vision) | ✓ | Telemetri yok |
| ADR-037 (RBAC) | N/A | Scope enforcement ilgisiz |
| ADR-039 (Self-modifying) | N/A | Self-modifying detection ilgisiz |
| Memory V2 DB-first | ⚠️ İHLAL | parseDebtTable + generateDebtTable hala mevcut ve @deprecated etiketli. Aktif kullanım: src/cli/commands/archive-debt.ts, src/orchestra/sprint-phases.ts, src/orchestra/sprint-finalizer.ts |

## 8. Test Coverage
Test dosyaları (8 adet):
- `tests/core/utils-deckent.test.ts` → ensureDeckentImport
- `tests/core/utils-sprint-id.test.ts` → getNextSprintId, parseSprintNumber
- `tests/core/utils-decay.test.ts` → shouldRemoveResolvedDebt
- `tests/core/utils-date.test.ts` → formatDate, formatDuration, formatRelativeTime
- `tests/core/utils-io.test.ts` → readFileSafe, readJsonSafe, readJsonSafeAsync
- `tests/core/utils-shared.test.ts` → paylaşılan helper'lar
- `tests/core/utils-debug.test.ts` → debugLog
- `tests/core/utils-debug-logging.test.ts` → ERRORS.md yazma

**Coverage değerlendirmesi:** İYİ — 8 test dosyası tüm major fonksiyonları kapsıyor. parseDebtTable/generateDebtTable ayrı test dosyasında olmayabilir (eski V1 testlerinde olabilir).

## 9. TODO/FIXME/HACK Inventory
Yok ✓

## 10. Dead Code
| Bulgu | Satır | Severity |
|-------|-------|----------|
| `parseDebtTable` | 205-232 | **P1** — @deprecated, ama 3 yerde hala aktif kullanım |
| `generateDebtTable` | 241-247 | **P1** — @deprecated, 1 yerde aktif kullanım (archive-debt.ts) |
| `shouldRemoveResolvedDebt` | 186-195 | **P2** — DEBT.md decay için, V2 DB decay farklı mekanizma kullanabilir |
| `isDebtPriority` (internal) | 55-57 | **P2** — sadece parseDebtTable tarafından kullanılıyor |

**Not:** parseDebtTable/generateDebtTable "dead code" değil, "deprecated ama aktif" — V1 fallback kaldırılmadan silinemez.

## 11. Security
- **Input validation:** readFileSafe/readJsonSafe filePath doğrulaması yok (path traversal riski düşük — internal kullanım)
- **Secret exposure:** appendToErrorsFile mesajı 200 char'a kesiyor ama hassas bilgi loglama riski mevcut
- **Injection:** Yok
- **OWASP:** Risk düşük — dosya sistemi erişimi internal

## 12. Memory V2 Uyumu
- **parseDebtTable:** @deprecated ama HAM .md parse yapıyor — V1 legacy ⚠️
- **generateDebtTable:** @deprecated ama HAM .md oluşturuyor — V1 legacy ⚠️
- **countBrainLines:** SİLİNMİŞ ✓ (src/core/ dizininde aramada bulunamadı)
- **readFileSync + DECISIONS/MEMORY/DEBT parse:** parseDebtTable DEBT.md parse ediyor ama DB-first değil ⚠️
- Sonuç: Memory V2 geçişi %80 tamamlanmış, DEBT.md parse henüz DB-first'e migrasyon yapılmamış

## 13. i18n
- `formatDate`: locale-aware (en-US, tr-TR) ✓
- `formatDuration`: TR/EN çeviri desteği ✓
- `formatRelativeTime`: TR/EN "önce/ago", "sonra/in" ✓
- `DATE_LOCALES`: Sadece en, tr — genişletilebilir ama yeterli
- Hardcoded string: Yok

i18n skoru: **MÜKEMMEL** ✓

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gerçek davranış: UYUMLU ✓
- @deprecated etiketleri doğru açıklamalı ✓
- DEBT_TABLE_HEADER referansı constants.ts'den geliyor — doğru ✓
- getNextSprintId: dual source (file + config) JSDoc'ta açıklanmış ✓

## 15. Performance
| Sync I/O Sayısı | Fonksiyon |
|-----------------|-----------|
| readFileSync ×4 | readFileSafe, readJsonSafe, appendToErrorsFile, ensureDeckentImport |
| writeFileSync ×3 | appendToErrorsFile, updateLastSprintId, ensureDeckentImport |
| appendFileSync ×1 | appendToErrorsFile |
| existsSync ×4 | appendToErrorsFile, getNextSprintId, updateLastSprintId, ensureDeckentImport |
| readdirSync ×1 | getNextSprintId |

**Hot path:** `debugLog` → `appendToErrorsFile` her hata logunda disk yazma + okuma + trim yapıyor. Sprint sırasında yüzlerce hata oluşursa darboğaz olabilir. Ancak test ortamında (VITEST env) devre dışı — doğru.

**readJsonSafeAsync:** Async varyant mevcut ama sadece 2 yerde kullanılıyor — async migration incomplete.

## 16. Oneriler
| Severity | Öneri |
|----------|-------|
| **P1** | parseDebtTable/generateDebtTable kullanımlarını DB-first'e migrasyon yaparak kaldır (archive-debt.ts, sprint-phases.ts, sprint-finalizer.ts) |
| **P2** | appendToErrorsFile'da her hata için read-trim-write döngüsü yerine, 10-20 hata batch'leyerek trim yap |
| **P2** | `shouldRemoveResolvedDebt` fonksiyonunun V2 DB decay ile entegrasyonunu doğrula — dead code candidate olabilir |
| **P3** | readJsonSafe generic `as T` cast'ını Zod schema validation ile güçlendir (harici kullanım noktalarında) |
| **P3** | readJsonSafeAsync kullanımını artır — sync I/O'dan async'e geçiş için |

## Verdict: ANALYZED
