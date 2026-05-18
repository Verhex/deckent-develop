# Analysis: src/core/memory-import.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 251 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
memory-import.ts, mevcut `.brain/` markdown dosyalarini Memory V2 DB'sine aktarmak icin parse fonksiyonlari saglar. Uc parser — parseDecisionsMd (ADR'ler), parseMemoryMd (sprint learnings), parseDebtMd (teknik borc tablosu) — her biri markdown string alir ve CreateEntryInput[] dondurur. Bir defaya mahsus migration icin tasarlanmis (pre-V2 → V2 gecisi). `extractKeywords()` fonksiyonu icerikten otomatik tag uretir. migrate-brain-v2.mjs scripti tarafindan kullanilir.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `extractKeywords` | `(text: string): string[]` | **VAR** — "Extract unique, lowercased keywords" |
| `parseDecisionsMd` | `(content: string): CreateEntryInput[]` | **VAR** — "Parse DECISIONS.md into CreateEntryInput[]." |
| `parseMemoryMd` | `(content: string): CreateEntryInput[]` | **VAR** — "Parse MEMORY.md into CreateEntryInput[]." |
| `parseDebtMd` | `(content: string): CreateEntryInput[]` | **VAR** — "Parse DEBT.md pipe-delimited markdown table" |

**Toplam: 4 public export, hepsinde JSDoc VAR.**

## 3. Ic Bagimliliklar
- `./memory-types.js` → `CreateEntryInput` (type import)

Dongusel bagimllik: **YOK.**

## 4. Dis Bagimliliklar
**SIFIR.** Tamamen internal.

## 5. Complexity
| Metrik | Deger |
|--------|-------|
| Toplam fonksiyon | 4 public + 0 private = 4 |
| En karmasik fonksiyon | `parseDebtMd()` (satir 174-251, ~77 satir, cyclomatic ~10) |
| Ikinci en karmasik | `parseDecisionsMd()` (satir 54-113, ~59 satir, cyclomatic ~8) |

`parseDebtMd()` pipe-delimited tablo parse eder — header bulma, separator atlama, 9 kolon ayristirma. Karmasik ama dogru yapilandirilmis.

## 6. Type Safety
| Sorun | Satir | Aciklama |
|-------|-------|----------|
| `match[1] ?? ''` | 65-66 | Regex group sonucu. `??` ile guvenli fallback. |
| `headers[i]!` | 76, 141 | Loop icinde `i < headers.length`. **GUVENLI.** |
| `headers[i+1]` | 77, 142 | `nextHeader` olarak kullaniliyor, `undefined` kontrolu var. **GUVENLI.** |
| `cells[0] ?? ''` vb. | 209-217 | Array index. `cells.length < 9` guard'i var. **GUVENLI.** |

**Toplam: 0 any, 0 @ts-ignore. Non-null assertion'lar guvenli context'te.**

## 7. ADR Compliance
| ADR | Uyum |
|-----|------|
| ADR-008 | **UYUMLU** |
| ADR-010 | **UYUMLU** |
| Memory V2 | **UYUMLU** — MD→DB one-time import |

## 8. Test Coverage
- **Test dosyasi:** `tests/core/memory-import.test.ts` — MEVCUT
- **Esleme:** 1:1 dogru
- Beklenen testler: ADR parse, duplicate ADR handling (v1 superseded + v2), status extraction, memory sprint grouping, debt table 9-column parse, empty content, malformed input
- **extractKeywords:** stop word filtering, max 15, unique, >3 chars

## 9. TODO/FIXME/HACK inventory
**SIFIR.**

## 10. Dead Code
- **POTANSIYEL:** Bu dosya one-time migration icin yazilmis. Migration tamamlandiktan sonra (pre-V2 backup olusturulduktan sonra) runtime'da kullanilmayabilir. Ancak:
  - `deckent memory rebuild` CLI komutu bu fonksiyonlari kullanabilir
  - Yeni bir DB olusturulurken (ilk kurulum) kullanilabilir
  - Test'ler aktif olarak bagimliligi dogruluyor
- **Karar:** Dead code DEGIL — migration + rebuild senaryolari icin gerekli.

## 11. Security
- **Regex injection:** `headerPattern` ve diger regex'ler sabit pattern. Kullanici girdisi regex'e gecmiyor. **GUVENLI.**
- **ReDoS:** Pattern'lar basit ve linear match. Catastrophic backtracking YOK.
- **Input validation:** Bos/null content icin erken return. `cells.length < 9` guard. **YETERLI.**

## 12. Memory V2 Uyumu
- **Rolü:** MD → DB import (one-time migration veya rebuild).
- **readFileSync: YOK.** Content parametre olarak geliyor — I/O cagiran tarafin sorumlulugu.
- **ADR duplicate handling:** `seenIds` Map ile ADR-022 gibi superseded+accepted cifleri dogru islenir (satir 72-91). Dogru v2 suffix ekleme.
- **Relation support:** Superseded ADR'ler icin `supersedes` relation otomatik olusturulur (satir 95-97). **Iyi tasarim.**

## 13. i18n
- **Stop words:** EN (55 kelime, satir 10-19) + TR (16 kelime, satir 21-25). Reasonable coverage.
- **extractKeywords:** `>3 chars` filtresi kisa Turkce ekleri kesebilir (ör. "daha" TR stop word'de var, ama "yok" 3 char — filtrelenir). Minor.
- **Regex:** Ozel karakter temizleme `[*#|>\`_\-=\[\](){}:;,."'!?/\\~@+^$%&<>]` — kapsamli.
- **Hardcoded pattern:** `## ADR-NNN: Title` ve `## Sprint sprint-NNN Learnings` — .brain/ dosya formatina bagli. Format degisirse parse kirilir. P3.

## 14. Dokumantasyon Tutarliligi
- **api-surface.md:** "entries, tags, relations, entry_history, schema_version" — parseDecisionsMd'nin urettigi CreateEntryInput bu tablolara yazilir. **UYUMLU.**
- **parseDecisionsMd:** `id = adr-NNN` format. DB'deki ADR id'leri ile uyumlu.
- **parseMemoryMd:** `id = mem-NNN` format. DB'deki memory id'leri ile uyumlu.
- **parseDebtMd:** `id = debt-NNN` format. DB'deki debt id'leri ile uyumlu.
- **DEBT_TABLE_HEADER** (constants.ts): "| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |" — `parseDebtMd` "| ID |" header'i ariyor (satir 183). **UYUMLU** (partial match).

## 15. Performance
- **Sync I/O:** SIFIR. Pure string parsing.
- **Hot path:** DEGIL. One-time migration veya manual rebuild.
- **Regex performance:** `headerPattern.exec()` ile iteratif match — O(n) dosya boyutuna gore. DECISIONS.md 96K icerik icin ~40 ADR header match, performans iyi.
- **extractKeywords:** O(n × m) — n kelime sayisi, m stop word count. Set kullanildigindan m O(1). **OPTIMAL.**

## 16. Oneriler
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| P3 | Header format flexibility | Regex'i daha esnek yap (farkli markdown header formatlari icin) |
| P3 | sprint_num extraction | parseDecisionsMd'de sprint_num set edilmiyor (default 0). ADR'lerin hangi sprint'te kabul edildigini cikaramaz. |
| P3 | Stop words genisletme | TR stop word listesi kisa (16). Daha kapsamli liste performansi etkilemez. |
| INFO | Migration status tracking | Import sonuclarini (kac entry parse edildi, kac hata) log'a yaz |

## Verdict: ANALYZED
