# Analysis: src/core/memory-export.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 226 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
memory-export.ts, SQLite DB'den markdown snapshot'lari uretir. Dort export fonksiyonu — exportSummaryMd (@ referans context), exportDecisionsMd (ADR full content), exportMemoryMd (sprint learnings), exportDebtMd (teknik borc tablosu) — her biri MemoryStore instance alir ve markdown string dondurur. Sprint sonunda Brain tarafindan cagrilerek `.brain/exports/` dizinine yazilir ve git-tracked olarak versiyon kontrolune dahil edilir. Bu sayede DB icerigi hem makineler hem insanlar tarafindan okunabilir hale gelir.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `exportSummaryMd` | `(store: MemoryStore): string` | **VAR** — "Compact context file for @ reference loading. Target < 5000 chars." |
| `exportDecisionsMd` | `(store: MemoryStore): string` | **VAR** — "Full ADR content for git review." |
| `exportMemoryMd` | `(store: MemoryStore): string` | **VAR** — "Sprint learnings grouped by sprint." |
| `exportDebtMd` | `(store: MemoryStore): string` | **VAR** — "Active + resolved debt as markdown tables." |

**Toplam: 4 public export, hepsinde JSDoc VAR. IDEAL.**

## 3. Ic Bagimliliklar (import chain listesi, dongusel bagimllik riski var mi?)
- `./memory-store.js` → `MemoryStore` (type import)
- `./memory-types.js` → `MemoryEntryV2` (type import)

Dongusel bagimllik riski: **YOK.**

## 4. Dis Bagimliliklar (node_modules, native modul — ADR-010 uyumu)
**SIFIR.** Tamamen internal.

## 5. Complexity (fonksiyon sayisi, max cyclomatic rough, en karmasik fonksiyon adi + satir no)
| Metrik | Deger |
|--------|-------|
| Toplam fonksiyon | 4 public + 3 private = 7 |
| En karmasik fonksiyon | `exportSummaryMd()` (satir 40-102, ~62 satir, cyclomatic ~6) |
| Ortalama fonksiyon uzunlugu | ~25 satir |

Karmasiklik dusuk. Her fonksiyon DB'den oku → markdown string olustur pattern'ini takip eder.

## 6. Type Safety (any sayisi, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast — SATIR NUMARALARIYLA)
| Sorun | Satir | Aciklama |
|-------|-------|----------|
| `adrs[i]!` | 122 | Non-null assertion. Loop icinde `i < adrs.length` guard'i var. **GUVENLI.** |

**Toplam: 0 any, 0 @ts-ignore, 1 non-null ! (guvenli).** Type safety ISKI.

## 7. ADR Compliance
| ADR | Uyum |
|-----|------|
| ADR-008 | **UYUMLU** — sadece core/ import |
| ADR-010 | **UYUMLU** — dis dep yok |
| ADR-033 | **UYUMLU** — lokal islem |
| Memory V2 | **UYUMLU** — DB→MD one-way export |

## 8. Test Coverage
- **Test dosyasi:** `tests/core/memory-export.test.ts` — MEVCUT
- **Esleme:** 1:1 dogru
- Beklenen testler: bos DB, tek ADR, coklu ADR siralama, sprint learning gruplama, debt active/resolved ayristirma, truncate edge case, status duplication strip

## 9. TODO/FIXME/HACK inventory
**SIFIR.**

## 10. Dead Code
- `isoDate()` (satir 14): Sadece `exportSummaryMd`'de kullaniliyor. Dead code DEGIL.
- `truncate()` (satir 21): Sadece `exportSummaryMd`'de kullaniliyor. Dead code DEGIL.
- `sortById()` (satir 30): `exportSummaryMd` ve `exportDecisionsMd`'de kullaniliyor. Dead code DEGIL.

## 11. Security
- **Injection riski:** YOK — markdown string uretimi, DB sorgusu yok, HTTP yok.
- **Status duplication strip:** satir 131-133'te regex ile `**Status:**` satirini icerikten soyuyor — iyi defansif programlama.

## 12. Memory V2 Uyumu
- **DB-first: EVET.** Tum veri MemoryStore uzerinden sorgulanir.
- **readFileSync: YOK.**
- **Export yonu:** DB → MD (tek yonlu). Roundtrip icin memory-import.ts gerekli.
- **Target boyut:** "< 5000 chars" — IDENTITY.md'deki "96% context reduction" iddiasi ile uyumlu.

## 13. i18n
- Sabit Ingilizce basliklar: "# Brain Summary (auto-generated)", "## Active Architecture Decisions", vb.
- Turkce localization YOK — ama bu dosyalar makine-generated, insan-readable referans icin, i18n gerekliligi dusuk.
- `isoDate()`: ISO 8601 format (YYYY-MM-DD), locale-agnostic. **DOGRU.**

## 14. Dokumantasyon Tutarliligi
- **api-surface.md:** "exports/summary.md, decisions.md, memory.md, debt.md (git-tracked)" — Kod 4 fonksiyon uretir. **UYUMLU.**
- **DECKENT.md:** ".brain/exports/summary.md" @ referans — exportSummaryMd bu dosyayi uretir. **UYUMLU.**
- **JSDoc "< 5000 chars" hedefi:** 40 ADR + 10 learning + debt ile ~4000-5000 karakter civarinda. Hedef sinirda — buyume riski var.

## 15. Performance
- **Sync I/O:** SIFIR. Pure string concat.
- **Hot path:** Sprint sonunda 1x cagriliyor. Performans kritik degil.
- **String concat:** `lines.join('\n')` — Array push + join pattern, `+=` concat'ten daha performansli. **DOGRU.**
- **Potansiyel:** `exportDecisionsMd()` tum ADR iceriklerini icerir. 40+ ADR ile buyuk string olabilir (~96K eski DECISIONS.md boyutu) ama git-tracked export icin kabul edilebilir.

## 16. Oneriler
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| P3 | Summary boyut guard | exportSummaryMd icinde karakter sayaci ekle, 5000 asilirsa truncate |
| P3 | i18n baslik | Export basliklari config.language'a gore TR/EN yapilabilir (dusuk oncelik) |
| INFO | export roundtrip test | import → export → import roundtrip test ekle (entegrasyon) |

## Verdict: ANALYZED
