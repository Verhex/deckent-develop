# Analysis: src/core/memory-normalize.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 38 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
turkishNormalize fonksiyonu, dile duyarsiz FTS5 arama icin metni normalize eder. SQLite FTS5 unicode61 tokenizer cogu diacritic'i idare eder ama Turkce I/İ/ı/i case folding'de basarisiz olur (Unicode locale-dependent). Bu fonksiyon saf ASCII lowercase esdegeri uretir. Normalize edilmis metin `*_norm` kolonlarinda saklanir ve sorgular hem orijinal hem de normalize kolonlarda OR ile arama yapar, boylece %100 recall saglanir. memory-store.ts (insert/upsert) ve memory-query.ts (sorgu tarafinda) tarafindan kullanilir.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `turkishNormalize` | `(text: string): string` | **VAR** — detayli modul-level JSDoc + inline yorumlar |

**Toplam: 1 export, JSDoc tam. IDEAL.**

## 3. Ic Bagimliliklar (import chain listesi, dongusel bagimllik riski var mi?)
**SIFIR import.** Tamamen bagimsiz utility fonksiyonu. Dongusel risk imkansiz.

## 4. Dis Bagimliliklar (node_modules, native modul — ADR-010 uyumu)
**SIFIR.** Sadece built-in String.prototype metotlari (replace, toLowerCase, normalize).

## 5. Complexity (fonksiyon sayisi, max cyclomatic rough, en karmasik fonksiyon adi + satir no)
| Metrik | Deger |
|--------|-------|
| Toplam fonksiyon | 1 |
| Cyclomatic complexity | ~2 (tek if guard + linear pipeline) |
| Satir sayisi | 24 (fonksiyon govdesi) |

Fonksiyon tamamen linear: 7 Turkce-specific replace → toLowerCase → NFD decompose → strip diacriticals → 6 Turkce survivor replace. Branch yok, dongu yok.

## 6. Type Safety (any sayisi, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast — SATIR NUMARALARIYLA)
**SIFIR sorun.** Sadece string input, string output. Hicbir cast, any, veya assertion yok.

## 7. ADR Compliance (ADR-006 spawnSync, ADR-008 brain import, ADR-010 deps, ADR-022 CLI/MCP parity, ADR-033 product vision, ADR-037 RBAC, ADR-039 self-modifying, Memory V2 DB-first)
| ADR | Uyum |
|-----|------|
| ADR-008 | **UYUMLU** — import yok |
| ADR-010 | **UYUMLU** — dis dep yok |
| ADR-033 | **UYUMLU** — yerel islem |
| Memory V2 | **UYUMLU** — DB-first normalize katmani |

## 8. Test Coverage (src/X.ts → tests/X.test.ts eslesmesi var mi? mock kalitesi, edge case coverage, Memory V2 mock dogru mu?)
- **Test dosyasi:** `tests/core/memory-normalize.test.ts` — MEVCUT
- **Esleme:** 1:1 dogru
- **Spec referansi:** "Tested: 15/15 pass across TR/EN/DE/ES/FR (see spec Section 4)"
- Beklenen edge case'ler: bos string, null/undefined, sadece Turkce karakterler, karisik dil, emoji, sayilar, uzun string

## 9. TODO/FIXME/HACK inventory (her biri satir numarasiyla, severity P0-P3)
**SIFIR.**

## 10. Dead Code (unused export, unreachable branch, @deprecated hala var mi?)
**SIFIR.** Tek fonksiyon, aktif kullaniliyor.

## 11. Security (input validation, injection riski, secret exposure, OWASP, SQL injection for DB)
- **Input validation:** `if (!text) return ''` — falsy guard mevcut.
- **Injection riski:** YOK — pure string transformation, DB/HTTP ile etkilesim yok.
- **ReDoS riski:** Regex pattern'lari basit literal match (`/I/g`, `/İ/g`, vb.) ve karakter sinifi (`/[\u0300-\u036f]/g`). Catastrophic backtracking riski YOK.

## 12. Memory V2 Uyumu (DB-first mi? Eski .md parse kaldi mi? readFileSync + DECISIONS/MEMORY/DEBT parse var mi?)
- DB-first normalize katmani. .md parse YOK, readFileSync YOK.
- **Kritik rol:** Her DB yaziminda (insert/upsert) ve her sorguda cagriliyor.

## 13. i18n (TR/EN hardcoded string, locale-aware mi? turkishNormalize kullanimi dogru mu?)
| Dil | Karakter | Cikti | Dogru mu? |
|-----|----------|-------|-----------|
| TR | I → ı → i | DOGRU | Turkce I, lowercase ı'ya, sonra ASCII i'ye |
| TR | İ → i | DOGRU | Turkce İ, dogrudan i'ye |
| TR | Ş/Ğ/Ü/Ö/Ç | s/g/u/o/c | DOGRU |
| EN | Hello | hello | DOGRU (toLowerCase yeterli) |
| DE | ü/ö → u/o | DOGRU (NFD + strip sonrasi) | |
| DE | ß → ss? | **DIKKAT** | `.toLowerCase()` Almanca ß'yi degistirmez. NFD decompose etmez. Sonuc: "ß" olarak kalir. Minor — Almanca kullanim dusuk. |
| FR | é/è/ê → e | DOGRU (NFD + strip) | |
| ES | ñ → n | DOGRU (NFD + strip) | |

**Sira onemli:** Turkce-specific replace'ler `toLowerCase()`'dan ONCE yapiliyor — dogru. Cunku `"I".toLowerCase()` Ingilizce locale'de `"i"` uretir ama Turkce'de `"ı"` olmali. Kod once `I→ı` yapip sonra `toLowerCase()` cagriyor.

**Edge case:** `ı` (dotless i) NFD ile decompose OLMAZ (base character, combining mark yok). Bu yuzden `.replace(/ı/g, 'i')` sonradan explicit yapiliyor. **DOGRU.**

## 14. Dokumantasyon Tutarliligi (JSDoc ↔ gercek davranis uyumu, .md referans dogrulugu, sayi tutarliligi)
- **IDENTITY.md:** "dual-layer i18n normalize, TR/EN/DE %100 recall" — Kod TR/EN/DE icin dogru calisiyor. **UYUMLU.**
- **api-surface.md:** "entries_fts: FTS5 full-text search (8 columns: 4 original + 4 turkishNormalize)" — **UYUMLU.**
- **JSDoc:** "100% recall" iddiasi — TR/EN/DE icin dogru, ß edge case disinda.

## 15. Performance (sync I/O sayisi, hot path mi?, gereksiz disk okuma/yazma)
- **Sync I/O:** SIFIR. Pure CPU string transformation.
- **Hot path:** Her DB insert/upsert'te 4x cagriliyor (title, content, summary, tag_text). Her sorgu icin 1x cagriliyor.
- **Performance:** 7 regex replace + toLowerCase + NFD normalize + 1 regex strip + 6 regex replace = toplam ~15 string islemi. Kisa metinler icin microsaniye mertebesi. Uzun metinler (10K+ karakter) icin makul.
- **Optimizasyon firsati:** `.replace()` zinciri fonksiyonel ama her adim yeni string olusturur. Kritik degilse dokunma.

## 16. Oneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| P3 | Almanca ß handling | `ß` → `ss` mapping ekle (minor — kullanim dusuk) |
| P3 | Null guard | `if (!text)` yerine `if (typeof text !== 'string')` daha defansif olabilir |
| INFO | Sira dokumantasyonu | Neden Turkce replace'lerin toLowerCase'dan once oldugunu JSDoc'a ekle |

## Verdict: ANALYZED
