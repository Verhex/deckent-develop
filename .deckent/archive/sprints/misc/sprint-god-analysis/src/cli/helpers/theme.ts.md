# Analysis: src/cli/helpers/theme.ts
**Task ID:** 142-021 | **Model:** opus | **LoC:** 94 | **Effort:** max

## 1. Amaci
CLI icin merkezi ANSI renk tema sistemi. `Theme` sinifi uzerinden success (yesil), error (kirmizi), warning (sari), info (mavi), muted (gri), accent (cyan) ve bold stilleri saglar. FORCE_COLOR, NO_COLOR cevresel degiskenleri ve TTY tespiti ile akilli renk yonetimi yapar. Singleton `theme` ornegi ile tum CLI'da tutarli renklendirme garanti eder.

## 2. Public API
- `class Theme`
  - `success(text: string): string` — Yesil (DONE, PASS)
  - `error(text: string): string` — Kirmizi (NO_GO, FAIL)
  - `warning(text: string): string` — Sari (TECH_DEBT)
  - `info(text: string): string` — Mavi (hints)
  - `muted(text: string): string` — Gri/dim (secondary)
  - `accent(text: string): string` — Cyan (links, highlights)
  - `bold(text: string): string` — Kalin
  - `strip(text: string): string` — ANSI strip
- `const theme: Theme` — Singleton instance
- JSDoc: Her metotta JSDoc MEVCUT — **MÜKEMMEL**

## 3. Ic Bagimliliklar
- HICBIR ic bagimlilik YOK
- Dongusel bagimlilik riski: YOK

## 4. Dis Bagimliliklar
- HICBIR dis bagimlilik YOK — saf TypeScript
- ADR-010 tam uyumlu

## 5. Complexity
- 1 sinif, 8 metot + 1 private fonksiyon (`shouldUseColor`) + 1 private fonksiyon (`wrap`)
- En karmasik: `shouldUseColor` (satir 5-18, cyclomatic ~3)
- **COK BASIT** modul

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `as unknown`: 0
- Non-null `!`: 0
- **MÜKEMMEL** tip guvenligi

## 7. ADR Compliance
- ADR-006: N/A
- ADR-008: N/A
- ADR-010: UYUMLU
- Memory V2: N/A

## 8. Test Coverage
- `tests/cli/helpers/theme.test.ts` — MEVCUT
- Test senaryolari: Her renk metodu, NO_COLOR/FORCE_COLOR, strip fonksiyonu
- Edge case: `FORCE_COLOR=0` → renk devre disi (satir 10) ✓
- Edge case: TTY degil + NO_COLOR/FORCE_COLOR yok → renksiz (satir 17) ✓

## 9. TODO/FIXME/HACK Inventory
- `// eslint-disable-next-line no-control-regex` (satir 85) — ANSI regex icin ESLint suppress. Kabul edilebilir.

## 10. Dead Code
- Tum metotlar ve singleton kullaniliyor
- **DEAD CODE YOK**

## 11. Security
- Process.env okuma: readonly — guvenli
- ANSI escape: Terminal kontrol — injection riski YOK

## 12. Memory V2 Uyumu
- N/A

## 13. i18n
- Kullanici-gorunur string YOK — tamamen renk utility
- **i18n SORUNU YOK**

## 14. Dokumantasyon Tutarliligi
- JSDoc: Tum public metotlarda mevcut ✓
- Her metodun kullanim amaci belirtilmis (success: DONE/PASS, error: NO_GO/FAIL vs.) ✓
- Singleton JSDoc mevcut ✓
- **MÜKEMMEL** dokumantasyon

## 15. Performance
- `shouldUseColor()` her wrap() cagrisinda cagirilir → her renk metodu cagrisinda process.env okunur
  - **P3 NOT:** Sik cagirildiginda (ornegin uzun tablo render'inda) her satir icin env kontrolu. Ama JS engine process.env'i cache'ler, pratikte maliyet ihmal edilebilir.
- Sync I/O: 0
- **PERFORMANS SORUNU YOK**

## 16. Oneriler
- **P2 TUTARSIZLIK:** `output.ts`'deki `isNoColor()` ve `color()` fonksiyonlari ile bu `Theme` sinifi PARALEL renklendirme sistemleri. `output.ts` dogrudan `\x1b[...` escape kodlari kullaniyor, `theme.ts` ise `wrap()` sarmalayicisi kullaniyor. Ayrica `output.ts`'deki `isNoColor()` FORCE_COLOR desteklemiyor, sadece NO_COLOR. Bu cift sistem karisiklik yaratir.
  - **ONERI:** Tum CLI renklendirmesi `theme` singleton'u uzerinden yapiilmali. `output.ts`'deki `color()` ve `isNoColor()` deprecated edilmeli.
- **P3:** `strip` metodundaki regex `\x1b\[\d+m` sadece tek sayi grubu yakaliyor. `\x1b\[0;32m` gibi coklu parametreli escape'ler yakalanMAZ. `output.ts`'deki `stripAnsi` ise `/\x1b\[[0-9;]*m/g` ile daha kapsamli. Tutarsizlik ve potansiyel bug.

## Verdict: ANALYZED
