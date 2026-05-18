# Analysis: src/core/memory-types.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 167 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
memory-types.ts, Memory V2 sisteminin tum tip tanimlarini icerir. SQLite schema ile birebir eslesen MemoryEntryV2, CRUD input icin CreateEntryInput, entry-arasi iliskiler icin EntryRelation, degisiklik gecmisi icin EntryHistoryRecord, arama parametreleri icin MemoryQueryParams, ve arama sonuclari icin MemorySearchResult arayuzlerini tanimlar. Tum memory-*.ts modulleri ve bunlari kullanan orchestra/cli/mcp katmanlari tarafindan import edilir. Type-level kaynak olarak projenin tip guvenliginin temelini olusturur.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Tur | JSDoc |
|--------|-----|-------|
| `EntryType` | type alias (union of 9 string literals) | **VAR** — "Built-in entry types" |
| `EntrySource` | type alias (union of 5 string literals) | **VAR** — "Who created this entry" |
| `EntryStatus` | type alias (union of 8 string literals) | **VAR** — "Entry status" |
| `RelationType` | type alias (union of 6 string literals) | **VAR** — "Relation types between entries" |
| `ChangeType` | type alias (union of 5 string literals) | **VAR** — "Change types for history tracking" |
| `MemoryEntryV2` | interface (21 alanlar) | **VAR** — "A single knowledge entry in the memory DB" |
| `CreateEntryInput` | interface (14 alan, 11 optional) | **VAR** — "Input for creating a new entry" |
| `EntryRelation` | interface (4 alan) | **VAR** — "A cross-reference between two entries" |
| `EntryHistoryRecord` | interface (7 alan) | **VAR** — "A change history record" |
| `MemoryQueryParams` | interface (10 alan, tumu optional) | **VAR** — "Query parameters for searching memory" + per-field JSDoc |
| `MemorySearchResult` | interface (3 alan) | **VAR** — "A single search result with relevance score" |
| `SummaryExportEntry` | interface (5 alan) | **VAR** — "Summary entry for the summary.md context file" |

**Toplam: 12 export, hepsinde JSDoc VAR. IDEAL.**

## 3. Ic Bagimliliklar
**SIFIR import.** Tamamen bagimsiz tip tanimlari. Diger tum memory-*.ts dosyalari bu dosyayi import eder, ama bu dosya hicbir sey import etmez. **Leaf node.**

## 4. Dis Bagimliliklar
**SIFIR.**

## 5. Complexity
| Metrik | Deger |
|--------|-------|
| Toplam type/interface | 12 |
| En buyuk interface | MemoryEntryV2 (21 alan) |
| Toplam alan sayisi | ~75 |

Tamamen deklaratif — runtime karmasikligi SIFIR.

## 6. Type Safety
- **MemoryEntryV2.type:** `string` — `EntryType` union yerine generic string. Bu tasarim karari custom type'lara izin vermek icindir (satir 20: `'custom'`). Ancak type narrowing zayiflar.
- **MemoryEntryV2.status:** `string` — `EntryStatus` union yerine generic string. Ayni trade-off.
- **MemoryEntryV2.priority:** `string` — Typed union yok. DB'den gelen herhangi bir string kabul edilir.
- **MemoryEntryV2.metadata:** `string` — JSON string olarak saklanir. `Record<string, unknown>` yerine string. DB katmani JSON.stringify/parse yapar ama tip guvenli degil.
- **CreateEntryInput.metadata:** `Record<string, unknown>` — MemoryEntryV2.metadata `string` iken CreateEntryInput.metadata `Record`. Asimetri kasitli (insert sirasinda obje, DB'de string) ama confusing.

**Onemli bulgu:** `MemoryEntryV2.type` ve `MemoryEntryV2.status` icin string kullanilmasi type safety'yi azaltir. `EntryType` ve `EntryStatus` union type'lari tanimlanmis ama MemoryEntryV2'de kullanilmiyor.

## 7. ADR Compliance
| ADR | Uyum |
|-----|------|
| ADR-008 | **UYUMLU** — import yok |
| Memory V2 | **UYUMLU** — DB schema ile eslesiyor |

## 8. Test Coverage
- **Test dosyasi:** `tests/core/memory-types.test.ts` — **MEVCUT DEGIL!**
- Type-only dosya icin runtime test'e ihtiyac dusuk. Ancak:
  - Tip uyumlulugunun compile-time'da dogrulanmasi yeterli olmayabilir
  - EntryType union'daki 'custom' literal'i test ile dogrulanabilir
- **Risk:** Dusuk — tsc --noEmit zaten tip kontrolu yapar.

## 9. TODO/FIXME/HACK inventory
**SIFIR.**

## 10. Dead Code
- **SummaryExportEntry** (satir 160-167): Bu interface aktif olarak kullaniliyor mu? `exportSummaryMd()` dogrudan `MemoryEntryV2` kullaniyor, `SummaryExportEntry` referansi yok.
  - **Grep sonucu:** `SummaryExportEntry` sadece bu dosyada tanimli, baska yerde import edilmiyor olabilir. **POTANSIYEL DEAD CODE.** P3.
- **min_score** (MemoryQueryParams, satir 147): Tanimli ama `searchMemory()` icinde kullanilmiyor. **DEAD FIELD.** P3.

## 11. Security
- **Tip tanimlari:** Runtime riski yok. Compile-time only.
- **metadata: Record<string, unknown>:** Serbest obje yapisi — prototype pollution riski disarida (JSON.parse ile olusturulursa safe).

## 12. Memory V2 Uyumu
- **DB schema eslesmesi:** MemoryEntryV2 alanlari entries tablosu kolonlari ile birebir eslesiyor:
  - id, type, source, title, content, summary, tag_text, title_norm, content_norm, summary_norm, tag_norm, status, priority, sprint_id, sprint_num, lang, decay_exempt (boolean ↔ INTEGER 0/1), metadata (string ↔ TEXT JSON), created_at, updated_at, deleted_at.
  - **UYUMLU.** `decay_exempt` boolean ↔ DB INTEGER conversion memory-store.ts'deki `rowToEntry()` icinde yapiliyor.
- **CreateEntryInput → entries INSERT:** Optional alanlar default degerlerle memory-store.ts insert()'te karsilaniyor. **UYUMLU.**

## 13. i18n
- `lang: string` alani MemoryEntryV2'de tanimli. Default 'en'. Turkce icerik 'tr' olarak isaretlenebilir.
- Hardcoded string YOK.

## 14. Dokumantasyon Tutarliligi
- **api-surface.md DB Schema:** "5 tables (entries, tags, relations, entry_history, schema_version) + FTS5 virtual table" — Type'lar bu tabloları yansıtıyor. **UYUMLU.**
- **api-surface.md Query API:** `searchMemory(store, { text, type, status, sprint_range, tags_contain, limit })` — MemoryQueryParams bu alanlari iceriyor + ek alanlar (source, include_deleted, decay_exempt, min_score). **Dok eksik** — ek alanlar belgelenmemis.
- **IDENTITY.md:** "MemoryEntryV2, CreateEntryInput, MemoryQueryParams, MemorySearchResult interfaces" — **UYUMLU.**

## 15. Performance
- **Runtime etkisi:** SIFIR. Type-only dosya, compile-time'da erase edilir.

## 16. Oneriler
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| P2 | Type narrowing | MemoryEntryV2.type → `EntryType`, MemoryEntryV2.status → `EntryStatus` yap. Custom type'lar icin union extension kullan. |
| P3 | SummaryExportEntry | Kullanilmiyorsa kaldir |
| P3 | min_score | `MemoryQueryParams.min_score` implement et veya kaldir |
| P3 | metadata asimetrisi | CreateEntryInput.metadata ve MemoryEntryV2.metadata arasi transformation dokumante et |

## Verdict: ANALYZED
