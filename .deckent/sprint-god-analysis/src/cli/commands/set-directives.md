# Analysis: src/cli/commands/set-directives.ts
**Task ID:** 142-020 | **Model:** opus | **LoC:** 84 | **Effort:** max

## 1. Amaci
DIRECTIVES.md dosyasina sprint hedeflerini yazan CLI komutu. 3 girdi yolunu destekler: `--content` ile dogrudan string, `--file` ile dosyadan okuma, veya stdin pipe ile girdi. MCP karsiliigi `deckent_set_directives`. Task sayisini regex ile sayar ve kullaniciya rapor eder.

## 2. Public API
- `registerSetDirectives(program: Command): void` — JSDoc YOK, EKSIK
- (Icelerdeki fonksiyonlar: `countTaskBlocks`, `readStdin` — export EDILMIYOR, internal)

## 3. Ic Bagimliliklar
- `../../core/constants.js` → DIRECTIVES_FILE
- `../../core/config.js` → loadConfig
- `../helpers/output.js` → print, printError
- `../helpers/process.js` → resolveProjectRoot
- `../helpers/messages.js` → getMessage
- Dongusel bagimllik riski: YOK

## 4. Dis Bagimliliklar
- `node:fs` (existsSync, readFileSync, writeFileSync) — built-in
- `node:path` (join) — built-in
- `commander` (Command type) — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayisi: 3 (registerSetDirectives + 2 internal helper)
- En karmasik: `registerSetDirectives().action()` (satir 37-83, ~46 satir)
- Max cyclomatic: ~5 (content/file/stdin branch + validation)
- Genel karmasiklik: DUSUK-ORTA

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Genel: MUKEMMEL

## 7. ADR Compliance
- **ADR-006 spawnSync:** N/A
- **ADR-008 brain import:** UYUMLU
- **ADR-010 deps:** UYUMLU
- **ADR-022 CLI/MCP parity:** ✅ MCP'de `deckent_set_directives` mevcut — PARITY SAGLANMIS
- **ADR-033:** UYUMLU
- **Memory V2:** N/A

## 8. Test Coverage
- **TEST DOSYASI YOK ❌** — set-directives icin test bulunamadi
- **P1 — Eksik test.** countTaskBlocks regex'i ve stdin okuma icin test olmali

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz

## 10. Dead Code
- `countTaskBlocks()` internal fonksiyon, sadece bu dosyada kullaniliyor — uygun
- `readStdin()` internal, sadece bu dosyada — uygun
- Genel: Temiz

## 11. Security
- `writeFileSync(directivesPath, content)` — content kullanici girdisi, path DIRECTIVES_FILE sabiti
- stdin'den okunan icerik dogrudan dosyaya yaziliyor — **path injection riski YOK** (path sabit)
- `opts.file` path'i existsSync ile dogrulaniyor — uygun
- Genel: GUVENLI

## 12. Memory V2 Uyumu
- Memory islemi yok — N/A
- Eski .md parse: YOK — UYUMLU

## 13. i18n
- ✅ **getMessage() KULLANIYOR** — satir 53, 61, 69, 78
- Bu 10 dosya icinde getMessage() kullanan TEK dosya — **iyi ornek**
- `config.language` alinip getMessage'a geciriliyor — dogru pattern
- turkishNormalize: N/A

## 14. Dokumantasyon Tutarliligi
- registerSetDirectives JSDoc EKSIK
- countTaskBlocks Turkce "Gorev" ve Ingilizce "Task" regex'ini destekliyor — i18n-aware ✅
- CLI help: "Write sprint goals to DIRECTIVES.md" — aciklayici

## 15. Performance
- readFileSync x1, writeFileSync x1, existsSync x1 — minimal
- loadConfig async — uygun
- stdin okuma Promise-based — uygun
- Genel: Sorunsuz

## 16. Oneriler
- **P1:** TEST YAZILMALI — countTaskBlocks regex, stdin okuma, 3 girdi modu icin test
- **P2:** registerSetDirectives JSDoc ekle
- **P3:** readStdin icinde hata durumu icin timeout eklenebilir (sonsuz bekleme riski stdin pipe kapanmazsa)
- **Not:** i18n kullanimi bu batch'in en iyi ornegi — diger komutlara ornek teskil etmeli

## Verdict: ANALYZED
