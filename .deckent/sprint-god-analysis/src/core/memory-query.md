# Analysis: src/core/memory-query.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 379 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
memory-query.ts, Memory V2'nin arama motorudur. Dual-layer FTS5 full-text search saglar: birinci katman orijinal metin uzerinde, ikinci katman `turkishNormalize()` ile normalize edilmis metin uzerinde arama yapar. Iki katman OR ile birlestirilir — boylece "brain import" sorgusu Turkce "Brain merkezi import kurali" icerigini de bulur. searchMemory() ana giris noktasi olarak MemoryStore + MemoryQueryParams alir ve MemorySearchResult[] dondurur. Ayrica buildAutoQuery() fonksiyonu Brain lifecycle entegrasyonu icin task DNA keyword'lerinden otomatik sorgu parametreleri uretir.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `searchMemory` | `(store: MemoryStore, params: MemoryQueryParams): MemorySearchResult[]` | **VAR** — detayli JSDoc |
| `buildAutoQuery` | `(taskKeywords: string[], taskScope: string[], opts?: { type?: string[]; sprintRange?: number }): MemoryQueryParams` | **VAR** — detayli JSDoc |
| `escapeFts5Query` | `(input: string): string` — **NOT EXPORTED** (modul-private) | **VAR** |

**Toplam: 2 public export, her ikisinde JSDoc VAR. IDEAL durum.**

## 3. Ic Bagimliliklar (import chain listesi, dongusel bagimllik riski var mi?)
- `./memory-store.js` → `MemoryStore` (type import)
- `./memory-normalize.js` → `turkishNormalize`
- `./memory-types.js` → `MemoryQueryParams`, `MemorySearchResult`, `MemoryEntryV2`

Dongusel bagimllik riski: **YOK.** memory-query → memory-store → memory-normalize. memory-store, memory-query'den import etmiyor. Tek yonlu zincir.

## 4. Dis Bagimliliklar (node_modules, native modul — ADR-010 uyumu)
Dogrudan dis bagimllik YOK. better-sqlite3'e memory-store.ts uzerinden dolayli erisim (`store.getRawDb()`).

## 5. Complexity (fonksiyon sayisi, max cyclomatic rough, en karmasik fonksiyon adi + satir no)
| Metrik | Deger |
|--------|-------|
| Toplam fonksiyon | 2 public + 5 private = 7 |
| En karmasik fonksiyon | `buildFilterClauses()` (satir 255-331, ~76 satir, cyclomatic ~12) |
| Ikinci en karmasik | `ftsSearch()` (satir 163-215, ~52 satir, cyclomatic ~4) |

`buildFilterClauses()` 7 farkli filtre turunu kontrol eder (deleted_at, type, source, status, sprint_range, decay_exempt, tags_contain). Her biri dinamik SQL clause olusturur. Karmasiklik kacinilmaz ama fonksiyon net sekilde bolumlenmis.

## 6. Type Safety (any sayisi, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast — SATIR NUMARALARIYLA)
| Sorun | Satir | Aciklama |
|-------|-------|----------|
| `db: any` | 165 | `ftsSearch()` parametresi. `// eslint-disable-next-line` ile isaretli. **P1 — DatabaseType kullanilmali.** |
| `db: any` | 221 | `structuredSearch()` parametresi. Ayni sorun. **P1.** |
| `params.text!` | 169, 170 | Non-null assertion. **GUVENLI** — `text` varligini satir 138'de kontrol ediyor. |
| `as MemoryEntryV2['source']` | 100 | Source string cast. Onceki dosyadaki ayni potansiyel risk. |
| `as FtsResultRow[]` | 204 | SQLite `.all()` donus tipi. Guvenli. |
| `as StructuredResultRow[]` | 245 | SQLite `.all()` donus tipi. Guvenli. |

**Toplam: 2 `any` (eslint comment ile), 2 non-null `!` (guvenli), 0 `@ts-ignore`.** `db: any` en buyuk type safety sorunu.

## 7. ADR Compliance (ADR-006 spawnSync, ADR-008 brain import, ADR-010 deps, ADR-022 CLI/MCP parity, ADR-033 product vision, ADR-037 RBAC, ADR-039 self-modifying, Memory V2 DB-first)
| ADR | Uyum | Aciklama |
|-----|------|----------|
| ADR-006 | N/A | spawnSync kullanmiyor |
| ADR-008 | **UYUMLU** | Sadece core/ icinden import |
| ADR-010 | **UYUMLU** | Dis bagimllik yok |
| ADR-033 | **UYUMLU** | Lokal-only islem |
| Memory V2 | **UYUMLU** | FTS5 dual-layer search, readFileSync YOK |

## 8. Test Coverage (src/X.ts → tests/X.test.ts eslesmesi var mi? mock kalitesi, edge case coverage, Memory V2 mock dogru mu?)
- **Test dosyasi:** `tests/core/memory-query.test.ts` — MEVCUT
- **Esleme:** 1:1 dogru
- Beklenen testler: FTS5 text search, normalized search, structured search (no text), sprint_range, tags_contain, type filter, empty results, FTS5 syntax error handling
- `buildAutoQuery()` icin ayri test beklenir

## 9. TODO/FIXME/HACK inventory (her biri satir numarasiyla, severity P0-P3)
**SIFIR.** Temiz.

## 10. Dead Code (unused export, unreachable branch, @deprecated hala var mi?)
- `pickBestSnippet()` (satir 149-159): Modul-private, sadece ftsSearch icinde kullaniliyor. Dead code DEGIL.
- `buildTagsContainClause()` (satir 333-358): Sadece structuredSearch'te kullaniliyor. Dead code DEGIL.
- **DIKKAT:** `buildFilterClauses()` icinde FTS path'i icin `tags_contain` handling'i var (satir 312-328), AYNI ZAMANDA `buildTagsContainClause()` structuredSearch icin ayri tags_contain handling'i var. **DUPLIKASYON.** FTS path'teki tags_contain ve structured path'teki tags_contain farkli bind prefix kullanir (`@tag_` vs `@stag_`). Kasitli ancak belgelenmemis. P3.

## 11. Security (input validation, injection riski, secret exposure, OWASP, SQL injection for DB)
| Alan | Durum | Aciklama |
|------|-------|----------|
| SQL Injection | **DIKKATLI** | FTS MATCH sorgusu `escapeFts5Query()` ile sanitize ediliyor. Token'lar double-quote ile sarmalaniyor. OR/AND/NOT operatorleri korunuyor. **Ancak:** `*` wildcard'i sonunda birakilir — FTS5 prefix search icin dogru. |
| FTS5 Injection | **GUVENLI** | `escapeFts5Query()` kullanici girdisini tokenize edip literal quote'a aliyor. `"token"` formati FTS5 ozel karakterlerini etkisizlestirir. |
| Error Swallowing | **DIKKAT** | satir 211: `catch { return []; }` — FTS5 syntax hatasi sessizce yutulur. Log/metric EKSIK. P2. |

## 12. Memory V2 Uyumu (DB-first mi? Eski .md parse kaldi mi? readFileSync + DECISIONS/MEMORY/DEBT parse var mi?)
- **DB-first: EVET.** Tamamen MemoryStore.getRawDb() uzerinden SQLite sorgusu.
- **readFileSync: YOK.**
- **Eski parse: YOK.**
- **Dual-layer search:** Original + normalized OR ile birlestiriliyor. **api-surface.md'deki spec ile UYUMLU.**

## 13. i18n (TR/EN hardcoded string, locale-aware mi? turkishNormalize kullanimi dogru mu?)
- `turkishNormalize` sorgu tarafinda cagriliyor (satir 170): Kullanici sorgusu da normalize edilerek normalized kolonlarla eslestirilir.
- FTS5 tokenizer: `unicode61 remove_diacritics 2` — en agresif diacritic removal. turkishNormalize ile birlikte %100 recall saglaniyor.
- Hardcoded string: Snippet marker `>>>` ve `<<<` hardcoded. Goruntuleme icin dogru.

## 14. Dokumantasyon Tutarliligi (JSDoc ↔ gercek davranis uyumu, .md referans dogrulugu, sayi tutarliligi)
- **api-surface.md** `searchMemory()` ornegi 6 parametre gosteriyor. Kod'daki `MemoryQueryParams` 10 alan iceriyor (text, type, source, status, sprint_range, tags_contain, include_deleted, decay_exempt, limit, min_score). **Dok eksik — min_score api-surface.md'de yok.** P3.
- **searchMemory** JSDoc "When no text is provided, returns filtered entries ordered by sprint_num DESC" — Kod bu davranisi dogru uyguluyor. **UYUMLU.**
- `buildAutoQuery()` JSDoc — aciklama uyumlu.

## 15. Performance (sync I/O sayisi, hot path mi?, gereksiz disk okuma/yazma)
- **Sync I/O:** better-sqlite3 senkron. FTS5 MATCH sorgusu index'li, hizli.
- **Hot path:** `searchMemory()` Brain her task icin PLAN fazinda cagriliyor. 48 task × 1 sorgu = 48 FTS5 MATCH. Performans kabul edilebilir.
- **Snippet generation:** Her sonuc icin 3 snippet uretiliyor (title, content, tags). FTS5 `snippet()` fonksiyonu indeks uzerinde calisiyor, ek disk I/O gerektirmez.
- **Limit:** Default 10, `buildAutoQuery()` default 5. Makul.

## 16. Oneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| P1 | `db: any` type safety | `DatabaseType` (better-sqlite3) kullan veya minimal interface olustur |
| P2 | Silent FTS5 catch | satir 211: Hata durumunda log/metric ekle, tum hatalari sessizce yutma |
| P3 | tags_contain duplikasyonu | FTS ve structured path'lerdeki tags_contain logic'ini ortak fonksiyona cikart |
| P3 | `min_score` parametresi | MemoryQueryParams'ta tanimli ama `searchMemory()` icinde kullanilmiyor — ya implement et ya kaldir |
| P3 | api-surface.md guncelle | min_score, include_deleted, decay_exempt parametrelerini dokumante et |

## Verdict: ANALYZED
