# Analysis: src/cli/commands/analyze.ts
**Task ID:** 142-020 | **Model:** opus | **LoC:** 45 | **Effort:** max

## 1. Amaci
Proje analiz komutu. `deckent analyze` ile projenin framework, dil, test atyapisi, build araci, CI, dosya sayisi, yazar sayisi, boyutu ve onerilen metodolojisini gosterir. `--json` ile ham JSON ciktisi destekler. En kisa CLI komutlarindan biri — neredeyse tamamen `analyzeProject()` core fonksiyonuna delege eder.

## 2. Public API
- `formatAnalysisResult(analysis: ProjectAnalysis): string` — JSDoc YOK, EKSIK
- `registerAnalyze(program: Command): void` — JSDoc YOK, EKSIK

## 3. Ic Bagimliliklar
- `../../core/types.js` → ProjectAnalysis (type import)
- `../../core/analyzer.js` → analyzeProject
- `../helpers/output.js` → print, formatTable
- `../helpers/process.js` → resolveProjectRoot
- Dongusel bagimllik riski: YOK

## 4. Dis Bagimliliklar
- `commander` (Command type) — ADR-010 uyumlu
- Diger: YOK (node built-in bile import etmiyor — sadece core modulleri)

## 5. Complexity
- Fonksiyon sayisi: 2
- En karmasik: `formatAnalysisResult()` (satir 8-23, ~16 satir, lineer mapping)
- Max cyclomatic: 1 (if yok, saf fonksiyonlar)
- Genel karmasiklik: COK DUSUK

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
- **ADR-022 CLI/MCP parity:** ✅ MCP'de `deckent_analyze_project` mevcut — PARITY SAGLANMIS
- **ADR-033:** UYUMLU
- **Memory V2:** N/A

## 8. Test Coverage
- `tests/cli/commands/analyze.test.ts` — MEVCUT ✅
- `tests/cli/analyze-coverage.test.ts` — MEVCUT ✅ (2 test dosyasi!)
- formatAnalysisResult saf fonksiyon — kolay test edilebilir

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz

## 10. Dead Code
- Genel: Temiz — 45 satir, gereksiz sey yok

## 11. Security
- Guvenlik sorunu: YOK
- analyzeProject core fonksiyonu is agirligini tasir, CLI katmani sadece format/output
- OWASP: N/A

## 12. Memory V2 Uyumu
- Memory islemi yok — N/A
- Eski .md parse: YOK — UYUMLU

## 13. i18n
- formatAnalysisResult icinde hardcoded Ingilizce property isimleri: "Framework", "Language", "Test Framework", "Build Tool", "CI", "File Count", "Authors", "Size", "Methodology"
- getMessage() KULLANILMIYOR — i18n gap (ama property label'lari genellikle cevirilmez)
- turkishNormalize: N/A

## 14. Dokumantasyon Tutarliligi
- 2 export'un ikisinde de JSDoc EKSIK
- CLI help: "Analyze project stack, size, and recommended methodology" — yeterli

## 15. Performance
- analyzeProject sync fonksiyon — core'da sync I/O olabilir
- CLI katmaninda ek I/O yok
- Hot path degil

## 16. Oneriler
- **P3:** JSDoc eksikleri — formatAnalysisResult, registerAnalyze icin ekle
- **P3:** i18n — property label'lari icin getMessage() opsiyonel olabilir
- **P3:** Dosya cok kisa ve temiz — modifiye etmeye gerek yok, ornek CLI komutu olarak referans alinabilir
- **Not:** Bu dosya proje genelinde "iyi CLI komutu nasil yazilir" icin minimal ornek — temiz, odakli, delege edici

## Verdict: ANALYZED
