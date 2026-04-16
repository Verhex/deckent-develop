# Analysis: src/cli/commands/onboard.ts
**Task ID:** 142-020 | **Model:** opus | **LoC:** 238 | **Effort:** max

## 1. Amaci
Onboarding wizard komutu. Yeni kullanicilarin deckent projesini ilk kez kurmasi icin interaktif wizard akisi sunar. Claude CLI varligini, Codex/Gemini provider'larini, sistem profilini ve proje stack'ini tespit eder. Sonucta `deckent init` komutunu otomatik calistirir. `registerOnboard()` ile commander'a kayit olur.

## 2. Public API
- `detectClaudeCli(): { available: boolean; version: string }` — JSDoc YOK, EKSIK
- `detectProviders(): ProviderStatus` — JSDoc VAR
- `detectProjectInfo(root: string): {...}` — JSDoc YOK, EKSIK
- `buildOnboardSteps(projectName: string): WizardStep[]` — JSDoc YOK, EKSIK
- `runOnboard(root: string, opts: {...}): Promise<void>` — JSDoc YOK, EKSIK
- `registerOnboard(program: Command): void` — JSDoc YOK, EKSIK
- `interface ProviderStatus` — duzgun tanimlanmis

## 3. Ic Bagimliliklar
- `../helpers/output.js` → print
- `../helpers/process.js` → resolveProjectRoot
- `../../core/system-profile.js` → getSystemProfile
- `../../core/constants.js` → DECKENT_DIR, DECKENT_VERSION
- `../helpers/wizard.js` → runWizard, WizardStep
- `../../core/stack-detector.js` → detectProjectStack
- Dongusel bagimllik riski: YOK

## 4. Dis Bagimliliklar
- `node:fs` (existsSync, readFileSync) — built-in
- `node:path` (join) — built-in
- `node:child_process` (spawnSync) — built-in, ADR-006 uyumlu
- `commander` (Command type) — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayisi: 6
- En karmasik: `runOnboard()` (satir 134-218, ~84 satir, lineer akis)
- Max cyclomatic: ~4 (detectProjectInfo icerisinde if/else zinciri)
- Genel karmasiklik: DUSUK

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: 1 — satir 74: `as { name?: string }` (JSON.parse sonrasi, kabul edilebilir)
- Genel: IYI

## 7. ADR Compliance
- **ADR-006 spawnSync:** UYUMLU — spawnSync timeout ile kullaniliyor (satir 17: 5_000ms, satir 197: 30_000ms)
- **ADR-008 brain import:** UYUMLU — brain'den import yok
- **ADR-010 deps:** UYUMLU — sadece commander dis dependency
- **ADR-022 CLI/MCP parity:** MCP'de `deckent_init` var ama `deckent_onboard` YOK — **PARITY GAP**
- **ADR-033 product vision:** UYUMLU — onboarding kullanici deneyimi
- **ADR-037 RBAC:** N/A (CLI komutu, brain/worker/auditor degil)
- **Memory V2 DB-first:** N/A (memory islemi yok)

## 8. Test Coverage
- `tests/cli/onboard.test.ts` — MEVCUT
- `tests/cli/commands/onboard.test.ts` — MEVCUT (iki test dosyasi!)
- Mock kalitesi: Bilinmiyor (test dosyasi okunmadi — batch analiz)
- Edge case: detectProviders env var yokken, detectClaudeCli hata durumu

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz

## 10. Dead Code
- `readDirectivesContent` quick-start.ts'de export ediliyor ama onboard.ts'de kullanilmiyor — FARKLI DOSYA
- `ProviderStatus` interface export ediliyor, dis kullanim dogrulanmali
- Genel: Temiz

## 11. Security
- `spawnSync('claude', ...)` — satir 17: shell=true SADECE win32'de, uygun
- `spawnSync('npx', initArgs, ...)` — satir 197: initArgs kullanici girdisi icermiyor, GUVENLI
- `JSON.parse(readFileSync(...))` — satir 74: yerel dosya, injection riski dusuk
- Secret exposure: YOK
- OWASP: N/A (lokal CLI komutu)

## 12. Memory V2 Uyumu
- Memory islemi yok — N/A
- Eski .md parse: YOK — UYUMLU

## 13. i18n
- Satir 106-110: Wizard'da "English"/"Turkce" secenekleri — HARDCODED UI metinleri
- print() mesajlari tamamen INGILIZCE hardcoded (satir 137-217)
- getMessage() KULLANILMIYOR — i18n gap
- turkishNormalize: N/A

## 14. Dokumantasyon Tutarliligi
- 6 export'un 5'inde JSDoc YOK
- detectProviders tek dogru JSDoc'a sahip
- DECKENT.md'de onboard komutu icin referans YOK (MCP tool tablosunda yok)
- CLI help mesaji: "Run the onboarding wizard" — yeterli

## 15. Performance
- spawnSync x2 (satir 17, 197) — CLI baslangicinda tek seferlik, kabul edilebilir
- existsSync x4, readFileSync x1 — startup path, performans etkisi minimal
- Hot path degil

## 16. Oneriler
- **P2:** JSDoc eksikligi — detectClaudeCli, detectProjectInfo, buildOnboardSteps, runOnboard, registerOnboard icin ekle
- **P2:** i18n — print() mesajlarini getMessage() ile degistir, TR/EN parity sagla
- **P3:** ADR-022 parity — MCP'ye `deckent_onboard` tool eklenmeli veya onboard CLI-only olarak belgelenmeli
- **P3:** ProviderStatus interface'ini ayri types dosyasina tasima dusunulebilir

## Verdict: ANALYZED
