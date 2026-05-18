# Analysis: src/cli/helpers/prompt.ts
**Task ID:** 142-021 | **Model:** opus | **LoC:** 62 | **Effort:** max

## 1. Amaci
Terminal'den interaktif kullanici girdisi alan basit prompt fonksiyonlari. `node:readline/promises` uzerine ince bir sarmalayici olarak text, select ve confirm prompt'lari saglar. ADR-011'de (node:readline/promises — Built-in Prompt) belirlenen yaklasima uygun olarak dis bagimlilik kullanmaz. CLI komutlarinda plan onaylama, dil secimi gibi islemlerde kullanilir.

## 2. Public API
- `promptText(question: string, defaultValue?: string): Promise<string>` — Metin girdisi
- `promptSelect<T extends string>(question: string, options: { label: string; value: T }[]): Promise<T>` — Secim listesi
- `promptConfirm(question: string, defaultValue?: boolean): Promise<boolean>` — Evet/Hayir onay
- JSDoc: **TAMAMEN EKSIK**

## 3. Ic Bagimliliklar
- `./output.js` → `print` fonksiyonu
- Dongusel bagimlilik riski: YOK

## 4. Dis Bagimliliklar
- `node:readline/promises` — ADR-011 uyumlu (built-in prompt)
- **SIFIR runtime dep** — ADR-010 tam uyumlu

## 5. Complexity
- 3 export fonksiyon + 1 private (`createRl`)
- En karmasik: `promptSelect` (satir 23-46, cyclomatic ~3, while loop)
- Cok basit modul

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `as T` cast (satir 39): `options[idx]?.value as T` — idx range check sonrasi, guvenli
- Non-null `!`: 0
- **IYI** tip guvenligi
- Generic `T extends string` dogru kullanilmis

## 7. ADR Compliance
- **ADR-011 (node:readline/promises):** TAMAMEN UYUMLU — bu dosya ADR-011'in dogrudan uygulamasi
- ADR-006: N/A
- ADR-008: N/A
- ADR-010: UYUMLU
- Memory V2: N/A

## 8. Test Coverage
- `tests/cli/helpers/prompt.test.ts` — MEVCUT
- Edge case: Bos giris + default deger → defaultValue return (satir 15-16)
- Edge case: Gecersiz secim numarasi → tekrar soru sor (while loop, satir 40-41)
- **UYARI:** `promptSelect` sonsuz while loop (satir 35) — kullanici geçerli input girene kadar devam eder. Test'te readline mock ile kontrol edilmeli.

## 9. TODO/FIXME/HACK Inventory
- `// eslint-disable-next-line no-constant-condition` (satir 34) — while(true) loop icin ESLint suppress. Kabul edilebilir pattern.

## 10. Dead Code
- `createRl` private fonksiyon — tum 3 public fonksiyon tarafindan kullaniliyor
- **DEAD CODE YOK**

## 11. Security
- Kullanici girdisi: `answer.trim()` ile temizleniyor ✓
- parseInt: `radix: 10` belirtilmis ✓
- readline close: `finally` blokunda garanti ediliyor ✓ — kaynak sizintisi YOK
- Injection riski: Girdi sadece string olarak deger dondurur, shell execution YOK

## 12. Memory V2 Uyumu
- N/A — kullanici girdisi modulu, hafiza erisimi yok

## 13. i18n
- Hardcoded Ingilizce:
  - "Please enter a number between 1 and {options.length}" (satir 41)
- **P3 SORUN:** Hata mesaji i18n desteksiz — messages.ts'e tasinabilir

## 14. Dokumantasyon Tutarliligi
- JSDoc: TAMAMEN EKSIK — hicbir fonksiyonda yok
- **P3:** Public API'da JSDoc olmamasi dokumantasyon kalitesini dusurur

## 15. Performance
- Sync I/O: 0
- Readline acilis/kapanis her fonksiyon cagrisinda — kisa omurlu, sorun yok
- **PERFORMANS SORUNU YOK**

## 16. Oneriler
- **P3:** JSDoc eklenmesi — ozellikle `promptSelect` generic kullanimi icin
- **P3:** "Please enter a number..." mesajini messages.ts'e tasima
- **P3:** `promptSelect` options bos array ile cagrildiginda sonsuz dongu riski — guard eklenmeli: `if (options.length === 0) throw new Error(...)`
- **P3:** `promptConfirm` default parametresi `= true` — bu `false` default isteyenler icin kafa karistirici olabilir

## Verdict: ANALYZED
