# Analysis: src/cli/commands/test-run.ts
**Task ID:** 142-020 | **Model:** opus | **LoC:** 271 | **Effort:** max

## 1. Amaci
Test sprint komutu. `deckent test` ile retro/memory/decay olmadan sprint calistirir. Git stash sandbox modu, ozel directives dosyasi, model override, JUnit/TAP reporter formatlari, minimum coverage threshold destegi sunar. En zengin flag setine sahip CLI komutlarindan biri.

## 2. Public API
- `type TestReporter` — export type ('default' | 'junit' | 'tap')
- `gitStash(projectRoot: string): boolean` — JSDoc aciklayici ama tam degil
- `gitStashPop(projectRoot: string): void` — JSDoc eksik, EKSIK
- `formatJUnit(sprintId, tasks): string` — JSDoc aciklayici
- `formatTAP(tasks): string` — JSDoc aciklayici
- `registerTestRun(program: Command): void` — JSDoc YOK, EKSIK

## 3. Ic Bagimliliklar
- `../../core/config.js` → loadConfig
- `../../core/constants.js` → DIRECTIVES_FILE
- `../../core/types.js` → ModelType, ALL_MODELS
- `../../orchestra/brain.js` → runSprint, BrainError
- `../helpers/output.js` → print, printError, formatSprintSummary
- `../helpers/process.js` → resolveProjectRoot
- Dongusel bagimllik riski: YOK

## 4. Dis Bagimliliklar
- `node:fs` (existsSync, copyFileSync, unlinkSync — dynamic import satir 211/217) — built-in
- `node:path` (join, resolve) — built-in
- `node:child_process` (execSync) — built-in
- `commander` (Command type) — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayisi: 5 (gitStash, gitStashPop, formatJUnit, formatTAP, registerTestRun)
- En karmasik: `registerTestRun().action()` (satir 96-269, **~173 satir** — UZUN FONKSIYON ❌)
- Max cyclomatic: ~12 (sandbox/directives/model/reporter/coverage/error dallanmalari)
- Genel karmasiklik: **YUKSEK**

## 6. Type Safety
- `any` sayisi: 0 (satir 224 "any NO_GO" yorum icinde, tip degil)
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: 1 — satir 168: `opts.model as ModelType` (ALL_MODELS.includes kontrolunden sonra, kabul edilebilir)
- Genel: IYI

## 7. ADR Compliance
- **ADR-006 spawnSync:** N/A (execSync kullaniyor, spawnSync degil — **ADR-006 execSync icin kapsamda mi? Belirsiz**)
- **ADR-008 brain import:** brain.js import — runSprint, BrainError. CLI komutu olarak uygun
- **ADR-010 deps:** UYUMLU
- **ADR-022 CLI/MCP parity:** MCP'de `deckent_run` var, ama test-specific flag'ler (sandbox, reporter, min-coverage) MCP'de YOK — **PARTIAL PARITY**
- **ADR-033:** UYUMLU — test atyapisi product ozeligi
- **Memory V2:** N/A

## 8. Test Coverage
- `tests/cli/test-run.test.ts` — MEVCUT ✅
- `tests/cli/commands/test-run-overhaul.test.ts` — MEVCUT ✅ (2 test dosyasi!)
- formatJUnit ve formatTAP saf fonksiyonlar — kolay test edilebilir
- gitStash/gitStashPop shell cagrilari — mock gerektirir

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz

## 10. Dead Code
- Dynamic import `unlinkSync` (satir 211, 217) — **gereksiz**, dosya basinda zaten `node:fs`'ten import var ama `unlinkSync` dahil degil. `copyFileSync` import edilmis, `unlinkSync` ise lazily import ediliyor — **tutarsiz pattern**
- Genel: Kucuk tutarsizlik

## 11. Security
- `execSync('git stash push -u -m "deckent-test-sandbox"')` — satir 33: **sabit string**, injection riski YOK
- `execSync('git stash pop')` — satir 47: sabit, GUVENLI
- `copyFileSync(customPath, directivesPath)` — customPath kullanici girdisi, path traversal **potansiyel** ama node:path resolve() satir 133'te kullaniliyor → GUVENLI
- `config.activeModeConfig` mutation — satir 169-173: **mutable config** dogrudan degistiriliyor, kotu pratik ama scope sinirli

## 12. Memory V2 Uyumu
- Memory islemi yok — N/A (test mode: skip memory/retro/decay)
- Eski .md parse: YOK — UYUMLU

## 13. i18n
- Tum print mesajlari INGILIZCE hardcoded
- getMessage() KULLANILMIYOR — i18n gap
- JUnit/TAP output'lari dogal olarak Ingilizce — kabul edilebilir (standart formatlar)

## 14. Dokumantasyon Tutarliligi
- registerTestRun JSDoc EKSIK
- gitStashPop JSDoc YOK — EKSIK
- CLI help mesajlari aciklayici: "Run a test sprint (no retro, no memory update, no decay)"
- Flag sayisi 7 — iyi dokumante edilmis (option description'lar)

## 15. Performance
- execSync x2 (git stash push/pop) — sandbox modunda tek seferlik
- copyFileSync x2-3 (directives backup/restore) — dosya kopyalama
- Dynamic import x2 (unlinkSync) — **gereksiz overhead**, statik import yeterli
- Hot path degil, test sprint suresine kiyasla ihmal edilebilir

## 16. Oneriler
- **P1:** Action handler 173 satir — extract helper fonksiyonlar (runTestSprint, restoreDirectives, handleReporter)
- **P2:** Dynamic import unlinkSync → dosya basinda statik import olarak ekle (tutarlilik)
- **P2:** config.activeModeConfig dogrudan mutasyon — spread ile kopya uzerinde calis
- **P2:** i18n — print mesajlarini getMessage() ile wrap et
- **P3:** ADR-006 kapsami — execSync de ADR-006 altinda mi? Netlestirilmeli
- **P3:** registerTestRun, gitStashPop JSDoc ekle
- **P3:** formatJUnit XSS-safe XML escape — `[c] ?? c` default case iyi ama `'` (apostrof) eksik

## Verdict: ANALYZED
