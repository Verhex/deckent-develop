# Analysis: src/cli/helpers/messages.ts
**Task ID:** 142-021 | **Model:** opus | **LoC:** 359 | **Effort:** max

## 1. Amaci
CLI mesajlarinin cok dilli (i18n) yonetim merkezi. TR (Turkce) ve EN (Ingilizce) ceviri tablolarini icerir. `getMessage()` fonksiyonu ile key-based mesaj getirme ve `{varName}` placeholder interpolasyon destegi saglar. `getLanguage()` fonksiyonu ile dil tespiti yapar (config > LC_ALL > LANG > en). Tüm CLI komutlari (start, plan, status, cleanup, finalize, doctor, init, kill, spawn, set-directives, attach) icin lokalize mesajlar icerir. Ayrica yapilandirilmis hata kodlari (error.*) i18n destegi saglar.

## 2. Public API
- `getMessage(key: string, lang: string, vars?: Record<string, string>): string` — Lokalize mesaj getirme + interpolasyon
- `getLanguage(configLanguage?: string): string` — Dil tespiti (config > env > default)
- JSDoc: `getMessage` (satir 309-313), `getLanguage` (satir 335-339) — MEVCUT

## 3. Ic Bagimliliklar
- HICBIR ic bagimlilik YOK — tamamen bagimsiz modul
- Dongusel bagimlilik riski: YOK

## 4. Dis Bagimliliklar
- HICBIR dis bagimlilik YOK — saf TypeScript
- ADR-010 tam uyumlu

## 5. Complexity
- 2 export fonksiyon + 1 private type + 1 const MESSAGES + 1 const SUPPORTED_LANGS
- En karmasik: `getMessage` (satir 314-330, cyclomatic ~3) — key lookup + interpolasyon
- `getLanguage` (satir 339-358, cyclomatic ~4) — env fallback chain
- MESSAGES objesi: ~65 mesaj key, her biri tr+en ceviri
- **ORTA** karmasiklik — ceviri tablosu buyuk ama mantik basit

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `as unknown`: 0
- Non-null `!`: 0
- `type MessageMap = Record<string, Record<string, string>>` — tip guvenli
- `(SUPPORTED_LANGS as readonly string[]).includes(normalized)` (satir 343, 352) — as const narrowing icin gerekli cast, **GUVENLI**
- **IYI** tip guvenligi

## 7. ADR Compliance
- **ADR-032 (i18n Pattern System):** Bu dosya ADR-032'nin dogrudan uygulamasi — TR/EN icerik cesitliligi ✓
- ADR-006: N/A
- ADR-008: N/A
- ADR-010: UYUMLU
- Memory V2: N/A

## 8. Test Coverage
- `tests/cli/helpers/messages.test.ts` — MEVCUT
- Test senaryolari: getMessage basic, interpolation, missing key, getLanguage fallback
- Edge case: Bilinmeyen key → key kendisi return (satir 320) ✓
- Edge case: Bilinmeyen dil → 'en' fallback (satir 323) ✓
- Edge case: Bilinmeyen interpolation var → `{varName}` korunur (satir 328) ✓

## 9. TODO/FIXME/HACK Inventory
- **HIC YOK**

## 10. Dead Code
- MESSAGES icindeki tum key'ler kullaniliyor mu? — CLI komutlarinda `getMessage('key', lang)` cagrilari ile eslesmeli
  - `hint.COMPLETE`, `hint.EXECUTE`, `hint.PLAN`, `hint.IDLE` — hints.ts tarafindan kullaniliyor
  - `status.*`, `start.*`, `plan.*`, `cleanup.*`, `finalize.*`, `doctor.*`, `attach.*`, `kill.*`, `spawn.*`, `init.*`, `set_directives.*` — ilgili komut dosyalari tarafindan kullaniliyor
  - `error.*` mesajlari — error-handler.ts tarafindan kullaniliyor
  - **POTANSIYEL DEAD:** `status.tasks_running`, `status.sprint_active`, `status.no_sprint` — bunlar generic mesajlar, kullanilip kullanilmadigi dogrulanmali
- **DEAD CODE RISKI DUSUK** — cogu mesaj kullaniliyor

## 11. Security
- Process.env okuma (LC_ALL, LANG): readonly — guvenli
- Mesaj interpolasyonu: `vars[varName]` — kullanici kontrollü degil (programatik), injection riski YOK
- **GUVENLIK SORUNU YOK**

## 12. Memory V2 Uyumu
- N/A — i18n mesaj sistemi, hafiza erisimi yok
- **UYARI:** Memory V2 ile ilgili mesajlar (recall, remember, memory rebuild vs.) bu dosyada YOK — Memory V2 CLI komutlari (recall.ts, remember.ts, memory.ts) i18n KULLANMIYOR olabilir. **P2 GAP.**

## 13. i18n
- Bu dosya BIZZAT i18n sistemi
- TR ceviri kalitesi: Genel olarak IYI — dogru Turkce, dogal ifadeler
- **EKSIKLER:**
  - Memory V2 komutlari icin mesaj EKSIK (recall, remember, memory rebuild/export/stats)
  - Dashboard i18n mesajlari EKSIK (dashboard frontend ayri i18n kullaniyor — src/dashboard/src/i18n/)
  - `output.ts` icindeki hardcoded Ingilizce stringler burada YOK
  - `progress.ts` icindeki "Active Workers:", "Queued:" burada YOK
  - `wizard.ts` icindeki IDE guidance mesajlari burada YOK
- **COVERAGE:** Yaklasik %60 CLI mesajlari i18n edilmis — %40 hala hardcoded
- **P2 GAP:** i18n coverage eksik — bircok CLI modulu messages.ts'i KULLANMIYOR

## 14. Dokumantasyon Tutarliligi
- JSDoc mevcut ✓
- `getLanguage` priority chain JSDoc'ta aciklanmis (config > LC_ALL > LANG > 'en') ✓
- MESSAGES objesi icindeki bolum ayirici yorumlar (`// ─── start command ───`) — **IYI** organizasyon
- **IYI** dokumantasyon

## 15. Performance
- Process.env okuma: `getLanguage` 2 env var okur (LC_ALL, LANG) — minimal
- `getMessage` string replace: Tek regex pass — verimli
- MESSAGES lookup: O(1) obje erisimi — verimli
- **PERFORMANS SORUNU YOK**

## 16. Oneriler
- **P2:** Memory V2 CLI komutlari (recall, remember, memory) icin i18n mesajlari eklenmeli
- **P2:** output.ts, progress.ts, wizard.ts, terminal-utils.ts icindeki hardcoded Ingilizce stringler icin messages.ts key'leri eklenmeli — i18n coverage %60 → %90+ hedeflenmeli
- **P3:** `status.tasks_running`, `status.sprint_active`, `status.no_sprint` mesajlarinin kullanilip kullanilmadigini dogrulama
- **P3:** Mesaj key'leri icin TypeScript string literal union type tanimlanabilir — tip guvenligi ile yanlis key kullanimi onlenebilir:
  ```typescript
  type MessageKey = 'hint.COMPLETE' | 'hint.EXECUTE' | ... ;
  export function getMessage(key: MessageKey, ...): string;
  ```
- **P3:** TR cevirilerde ASCII-safe olmayan karakterler (ö, ü, ç, ş, ğ, ı, İ) dogru kullanilmis ✓ — ama bazi error.* mesajlarinda ASCII-only Turkce var (satir 268+): "tmux bulunamadi", "Yapilandirma gecersiz" — ö→o, ü→u, ı→i donusumleri — kasitli mi yoksa typo mu belirsiz. **Muhtemelen kasitli** (terminal uyumlulugu icin).

## Verdict: ANALYZED
