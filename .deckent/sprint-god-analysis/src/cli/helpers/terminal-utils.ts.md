# Analysis: src/cli/helpers/terminal-utils.ts
**Task ID:** 142-021 | **Model:** opus | **LoC:** 76 | **Effort:** max

## 1. Amaci
Terminal boyutu algilama, string kirpma, tablo otomatik genislik ayarlama, ANSI satir temizleme ve interaktif terminal tespiti yapan yardimci fonksiyonlar. CLI ciktilarinin terminal genisligine gore uyarlanmasini saglar. `fitTable` fonksiyonu sutun genisliklerini otomatik olarak terminal genisligine sigacak sekilde hesaplar.

## 2. Public API
- `getTerminalWidth(): number` — Terminal genisligi (fallback 80)
- `truncateString(str: string, max: number): string` — String kirpma ("..." ile)
- `fitTable(columns: string[], data: string[][], width: number): string` — Otomatik genislik tablo
- `clearLines(n: number): string` — ANSI satir temizleme escape sequence
- `isInteractive(): boolean` — TTY kontrolu
- JSDoc: **TAMAMEN EKSIK**

## 3. Ic Bagimliliklar
- HICBIR ic bagimlilik YOK
- Dongusel bagimlilik riski: YOK

## 4. Dis Bagimliliklar
- HICBIR dis bagimlilik YOK — saf TypeScript
- ADR-010 tam uyumlu

## 5. Complexity
- 5 fonksiyon
- En karmasik: `fitTable` (satir 17-61, cyclomatic ~5) — sutun genisligi hesaplama
- Genel olarak basit utility modulu

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- Non-null `!`: 1 — satir 41: `colWidths[i]! > perCol` — for loop index guard'lu, **GUVENLI**
- `as unknown`: 0
- **IYI** tip guvenligi

## 7. ADR Compliance
- ADR-006: N/A
- ADR-008: N/A
- ADR-010: UYUMLU
- ADR-022: CLI-only utility — MCP'de terminal formatlama gereksiz
- Memory V2: N/A

## 8. Test Coverage
- `tests/cli/helpers/terminal-utils.test.ts` — MEVCUT
- Edge case: `max <= 0` → bos string (satir 11) ✓
- Edge case: `max <= 3` → "..." olmadan kirpma (satir 13) ✓
- Edge case: `columns.length === 0` → bos string (satir 21) ✓
- Edge case: `n <= 0` → bos string (satir 64) ✓
- **UYARI:** `fitTable` — `columns.length > 0` ve `totalNeeded > width` durumunda `perCol = Math.max(4, ...)` — minimum 4 karakter sutun genisligi garanti. Ama cok dar terminallerde (width < 4 * columns.length) sutunlar sigamaz. Edge case ama pratikte onemli degil.

## 9. TODO/FIXME/HACK Inventory
- **HIC YOK**

## 10. Dead Code
- Tum 5 fonksiyon export ve kullaniliyor
- **DEAD CODE YOK**

## 11. Security
- Process.stdout.columns okuma: readonly — guvenli
- ANSI escape kodlari: Yalnizca terminal kontrol — injection riski YOK
- `process.stdout.isTTY` okuma: readonly — guvenli

## 12. Memory V2 Uyumu
- N/A — terminal utility, hafiza erisimi yok

## 13. i18n
- Kullanici-gorunur string: `"..."` (truncate suffix) — evrensel
- **i18n SORUNU YOK**

## 14. Dokumantasyon Tutarliligi
- JSDoc: TAMAMEN EKSIK
- Fonksiyon isimleri aciklayici (`getTerminalWidth`, `truncateString`, `isInteractive`)
- **P3:** Public fonksiyonlara JSDoc eklenmesi faydali olur

## 15. Performance
- Sync I/O: 0
- `process.stdout.columns` — getter, minimal maliyet
- `fitTable` icinde `data.reduce` — O(rows * columns) — normal
- `clearLines` string birlesimi — kucuk n icin verimli
- **PERFORMANS SORUNU YOK**

## 16. Oneriler
- **P3:** JSDoc eklenmesi
- **P3:** `truncateString` fonksiyonu `output.ts`'deki `truncate` ile cok benzer (orada `…` karakteri kullaniliyor, burada `...`). Birlestirilebilir veya standartlastiriilabilir.
- **P3:** `fitTable` separator: `'-+-'` kullaniliyor ama header'da `' | '` — gorsel tutarlilik icin ayni karakter genisligi. Dogru davranis ama `-+-` vs ` | ` farkli genislik (3 karakter = esit). OK.

## Verdict: ANALYZED
