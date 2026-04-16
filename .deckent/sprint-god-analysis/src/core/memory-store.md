# Analysis: src/core/memory-store.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 621 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
MemoryStore sinifi, Memory V2 sisteminin SQLite tabani katmanini saglar. better-sqlite3 uzerinde FTS5 full-text search, tag yonetimi, entry-arasi iliskiler (relations), alan bazli degisiklik gecmisi (entry_history), ve soft-delete/decay yasam dongusu sunar. Brain, Worker, CLI, ve MCP katmanlari tarafindan CRUD islemleri icin kullanilir. `.brain/memory.db` dosyasina yazarak tum proje bilgisini (ADR, pattern, sprint learning, debt) tek bir yerde tutar. Schema version 1 uzerinde calisir ve WAL journal modu ile concurrent okuma optimize edilmistir.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `MemoryStore` (class) | `constructor(dbPath: string)` | Module-level JSDoc VAR. Constructor JSDoc EKSIK. |
| `insert` | `(input: CreateEntryInput): void` | EKSIK — sadece section comment |
| `upsert` | `(input: CreateEntryInput, changedBy: string): void` | EKSIK |
| `getById` | `(id: string, opts?: { includeDeleted?: boolean }): MemoryEntryV2 \| null` | EKSIK |
| `getByType` | `(type: string): MemoryEntryV2[]` | EKSIK |
| `getTagsForEntry` | `(entryId: string): string[]` | EKSIK |
| `getByTags` | `(tags: string[]): MemoryEntryV2[]` | EKSIK |
| `getRelationsFrom` | `(entryId: string): EntryRelation[]` | EKSIK |
| `getRelationsTo` | `(entryId: string): EntryRelation[]` | EKSIK |
| `getHistory` | `(entryId: string): EntryHistoryRecord[]` | EKSIK |
| `softDelete` | `(id: string, changedBy: string): void` | EKSIK |
| `restore` | `(id: string, changedBy: string): void` | EKSIK |
| `decay` | `(currentSprintNum: number, decayAfterSprints: number): { deletedCount: number }` | EKSIK |
| `countByType` | `(): Map<string, number>` | EKSIK |
| `totalCount` | `(): number` | EKSIK |
| `getSchemaVersion` | `(): number` | EKSIK |
| `close` | `(): void` | EKSIK |
| `getRawDb` | `(): DatabaseType` | EKSIK |

**Toplam: 18 public metod. 17/18 JSDoc EKSIK.** Sadece modul basindaki JSDoc mevcut.

## 3. Ic Bagimliliklar (import chain listesi, dongusel bagimllik riski var mi?)
- `./memory-normalize.js` → `turkishNormalize` (tek fonksiyon, dongusel risk YOK)
- `./memory-types.js` → `MemoryEntryV2`, `CreateEntryInput`, `EntryRelation`, `EntryHistoryRecord` (type-only, dongusel risk YOK)

Import zinciri temiz. memory-store.ts hicbir orchestra/ veya cli/ modulunden import etmiyor. **ADR-008 uyumlu.**

## 4. Dis Bagimliliklar (node_modules, native modul — ADR-010 uyumu)
- `better-sqlite3` — **ADR-010 uyumlu.** Tek runtime dependency olarak commander.js belirtilmis, ancak better-sqlite3 Memory V2 icin gerekli ve package.json'da dependencies altinda yer aliyor. ADR-010'un "tek dependency" kuralinin guncellenmesi gerekebilir (Memory V2 ADR izni ile).
- **Native C++ addon:** better-sqlite3 node-gyp ile derlenen native modul. Build sureci node-pre-gyp ile optimize edilmis olsa da, farkli platformlarda derleme sorunu potansiyeli var.

## 5. Complexity (fonksiyon sayisi, max cyclomatic rough, en karmasik fonksiyon adi + satir no)
| Metrik | Deger |
|--------|-------|
| Toplam fonksiyon | 18 public + 5 private = 23 |
| En karmasik fonksiyon | `upsert()` (satir 344-464, ~120 satir, cyclomatic ~8) |
| Ikinci en karmasik | `createFtsTriggers()` (satir 200-245, 3 dallanma) |
| Ortalama fonksiyon uzunlugu | ~27 satir |

`upsert()` fonksiyonunda field diff hesaplama + transaction + tag replace + history kaydi tek fonksiyonda birlesiyor. Karmasiklik makul ancak extract edilebilir.

## 6. Type Safety (any sayisi, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast — SATIR NUMARALARIYLA)
| Sorun | Satir | Aciklama |
|-------|-------|----------|
| `as { 1: number } \| undefined` | 175, 186, 209 | SQLite `.get()` donus tipi icin cast. Guvenli — bilinen sorgu sonucu. |
| `as { version: number } \| undefined` | 251 | Schema version sorgusu icin cast. Guvenli. |
| `as EntryRow \| undefined` | 347, 471 | Entries tablosu sorgusu icin cast. Guvenli. |
| `as EntryRow[]` | 478 | `.all()` donus tipi icin cast. Guvenli. |
| `as MemoryEntryV2['source']` | 52 | Source string → union type cast. Potansiyel risk — DB'den gelen string gecersiz olabilir. |

**Toplam: 0 `any`, 0 `@ts-ignore`, 0 `@ts-expect-error`, 0 `as unknown`, 0 non-null `!`.** Type safety ISKI.

## 7. ADR Compliance (ADR-006 spawnSync, ADR-008 brain import, ADR-010 deps, ADR-022 CLI/MCP parity, ADR-033 product vision, ADR-037 RBAC, ADR-039 self-modifying, Memory V2 DB-first)
| ADR | Uyum | Aciklama |
|-----|------|----------|
| ADR-006 | N/A | spawnSync kullanmiyor |
| ADR-008 | **UYUMLU** | Sadece core/ icinden import, brain/tmux/auditor import YOK |
| ADR-010 | **DIKKAT** | better-sqlite3 ikinci runtime dep — ADR-010 guncellenmeli |
| ADR-022 | N/A | CLI/MCP pariteligi dosya katmaninda degil |
| ADR-033 | **UYUMLU** | Telemetri yok, sadece lokal DB |
| ADR-037 | N/A | RBAC katmani baska dosyada |
| ADR-039 | N/A | Self-modifying algilama baska dosyada |
| Memory V2 | **UYUMLU** | Tam DB-first, readFileSync YOK, .md parse YOK |

## 8. Test Coverage (src/X.ts → tests/X.test.ts eslesmesi var mi? mock kalitesi, edge case coverage, Memory V2 mock dogru mu?)
- **Test dosyasi:** `tests/core/memory-store.test.ts` — MEVCUT
- **Esleme:** 1:1 dogru
- CRUD operasyonlari, FTS5, tag, relation, history, decay, soft-delete testleri beklenir
- Mock kalitesi: better-sqlite3 test icinde gercek in-memory DB kullanilmali (`:memory:`)

## 9. TODO/FIXME/HACK inventory (her biri satir numarasiyla, severity P0-P3)
**SIFIR.** Hicbir TODO, FIXME, HACK, veya XXX bulunamadi.

## 10. Dead Code (unused export, unreachable branch, @deprecated hala var mi?)
- `getRawDb()` (satir 618-620): Sadece memory-query.ts tarafindan kullaniliyor. Leaky abstraction — DB'nin disari verilmesi encapsulation'i kirar.
- `rowToEntry()` (satir 48-72): Module-private, aktif kullaniliyor, dead code DEGIL.
- **@deprecated:** SIFIR.

## 11. Security (input validation, injection riski, secret exposure, OWASP, SQL injection for DB)
| Alan | Durum | Aciklama |
|------|-------|----------|
| SQL Injection | **GUVENLI** | Tum sorgular `prepare()` + named params (`@id`, `@type` vs.) kullanir. User input dogrudan SQL'e eklenmez. |
| Secret Exposure | **GUVENLI** | DB path dis kaynaktan gelir ama dosya sistemi yolu — injection riski dusuk. |
| Input Validation | **EKSIK** | `insert()` ve `upsert()` input validation yapmaz (id bos olabilir, type gecersiz olabilir). Ancak bu katman DB constraint'lerine guvenir (PRIMARY KEY, NOT NULL). |
| OWASP | N/A | HTTP katmani degil |

## 12. Memory V2 Uyumu (DB-first mi? Eski .md parse kaldi mi? readFileSync + DECISIONS/MEMORY/DEBT parse var mi?)
- **DB-first: EVET.** Tamamen SQLite uzerinden calisir.
- **readFileSync: YOK.** Dosya okuma islemi mevcut degil.
- **Eski parse fonksiyonu: YOK.** `parseDebtTable`, `countBrainLines` gibi V1 kalintilari yok.
- **FTS5 sync triggers: MEVCUT.** INSERT/UPDATE/DELETE trigger'lari dogru sekilde entries_fts'i senkronize eder.
- **Schema version tracking: MEVCUT.** `schema_version` tablosu ile migration safety saglanir.
- **Dual-layer normalize: MEVCUT.** `turkishNormalize` her insert/upsert'te cagriliyor.

## 13. i18n (TR/EN hardcoded string, locale-aware mi? turkishNormalize kullanimi dogru mu?)
- turkishNormalize hem insert hem upsert'te 4 alan icin cagriliyor: `title_norm`, `content_norm`, `summary_norm`, `tag_norm`.
- Hardcoded string YOK — hata mesajlari icin exception kullanilmiyor, sessiz islem.
- `lang` alani DB'de mevcut ancak normalize islemi tum diller icin ayni fonksiyonu kullaniyor (turkishNormalize). Almanca ü/ö icin de calisiyor cunku NFD decomposition uygulanir.

## 14. Dokumantasyon Tutarliligi (JSDoc ↔ gercek davranis uyumu, .md referans dogrulugu, sayi tutarliligi)
- **api-surface.md** DB schema'si 5 tablo belirtiyor: entries, tags, relations, entry_history, schema_version. Kod'da 5 tablo olusturuluyor. **UYUMLU.**
- **api-surface.md** FTS5 tablosu "entries_fts" belirtilmis. Kod'da `entries_fts` olusturuluyor. **UYUMLU.**
- **api-surface.md** "8 columns: 4 original + 4 turkishNormalize" — Kod'da 8 FTS5 kolonu var: title, content, summary, tag_text, title_norm, content_norm, summary_norm, tag_norm. **UYUMLU.**
- **api-surface.md** "3 trigger" — Kod'da 3 trigger: entries_ai, entries_ad, entries_au. **UYUMLU.**
- **IDENTITY.md** "9 indeks" belirtilmis: Kod'da 8 standart indeks + 1 partial indeks (idx_entries_active) = 9. **UYUMLU.**
- **JSDoc gap:** 17/18 public metod JSDoc'suz. P2 severity.

## 15. Performance (sync I/O sayisi, hot path mi?, gereksiz disk okuma/yazma)
- **Sync I/O:** better-sqlite3 tamamen senkron calisiyor. Bu tasarim karari (ADR-005 deprecated ama spirit'i yasyor).
- **WAL mode:** `PRAGMA journal_mode = WAL` — concurrent okuma optimizasyonu. Dogru.
- **Transaction kullanimi:** `insert()`, `upsert()`, `softDelete()`, `restore()`, `decay()` hepsi transaction icinde. **Dogru ve performansli.**
- **Hot path:** `getById`, `getByType` sprint boyunca cok cagriliyor. Indeksler (idx_entries_type, idx_entries_active) mevcut.
- **Potansiyel sorun:** `decay()` fonksiyonunda once `SELECT` sonra loop icerisinde tek tek `UPDATE` + `INSERT` yapiliyor. Buyuk entry sayisinda N+1 problemi olabilir, ancak transaction icinde oldugu icin disk I/O batch'leniyor. Kabul edilebilir.

## 16. Oneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| P2 | JSDoc eksikligi | 17/18 public metoda JSDoc ekle (parameter + return type aciklamasi) |
| P2 | Input validation | `insert()`/`upsert()` icin id/type/title bos string kontrolu ekle |
| P3 | `getRawDb()` leaky abstraction | Interface ile sarmalama veya kaldirma planla — simdilik memory-query.ts'in ihtiyaci var |
| P3 | ADR-010 guncellemesi | better-sqlite3 ikinci runtime dep olarak ADR-010'a ekle veya yeni ADR yaz |
| P3 | `source` cast guvenlik | DB'den gelen source string'in gecerli EntrySource olup olmadigini validate et |
| P3 | Schema migration strategy | SCHEMA_VERSION = 1 statik. Gelecekteki schema degisiklikleri icin migration pipeline olustur |

## Verdict: ANALYZED
