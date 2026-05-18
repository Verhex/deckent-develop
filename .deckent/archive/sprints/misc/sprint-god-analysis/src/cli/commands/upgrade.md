# Analysis: src/cli/commands/upgrade.ts
**Task ID:** 142-020 | **Model:** opus | **LoC:** 387 | **Effort:** max

## 1. Amaci
Self-update komutu. Deckent'in kendisini npm uzerinden guncellemesini saglar. Semver karsilastirmasi, install strategy tespiti (global/local/npx), release channel destegi (latest/beta/canary), changelog gosterimi, rollback mekanizmasi ve yerel .tgz'den kurulum icin `--local` flag'i sunar. En karmasik CLI komutlarindan biri.

## 2. Public API
- `parseSemver(version: string): {...}` — JSDoc VAR, detayli
- `compareVersions(current: string, latest: string): number` — JSDoc VAR, detayli
- `detectInstallStrategy(): InstallStrategy` — JSDoc VAR
- `getChangelog(version?: string): string | null` — JSDoc VAR
- `checkLatestVersion(channel?): string | null` — JSDoc VAR
- `saveVersionForRollback(version: string): boolean` — JSDoc VAR
- `getRollbackVersion(): string | null` — JSDoc VAR
- `buildInstallCommand(strategy, channel): string[]` — JSDoc YOK, EKSIK
- `runUpgradeInstall(strategy?, channel?): boolean` — JSDoc YOK, EKSIK
- `rollbackUpgrade(prevVersion, strategy): boolean` — JSDoc VAR
- `executeUpgrade(opts): void` — JSDoc YOK, EKSIK
- `upgradeFromLocal(tgzPath: string): boolean` — JSDoc VAR
- `registerUpgrade(program: Command): void` — JSDoc YOK, EKSIK
- `type InstallStrategy` — export type
- `type ReleaseChannel` — export type

## 3. Ic Bagimliliklar
- `../helpers/output.js` → print, printError
- `../../core/constants.js` → DECKENT_VERSION
- Dongusel bagimllik riski: YOK

## 4. Dis Bagimliliklar
- `node:child_process` (spawnSync) — built-in, ADR-006 uyumlu
- `commander` (Command type) — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayisi: 13
- En karmasik: `executeUpgrade()` (satir 235-331, ~96 satir, coklu branch)
- Max cyclomatic: ~7 (executeUpgrade icerisinde check/changelog/rollback/channel branching)
- Genel karmasiklik: ORTA

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: 0
- Genel: MUKEMMEL

## 7. ADR Compliance
- **ADR-006 spawnSync:** UYUMLU — tum spawnSync cagrilari timeout ile (5s-60s arasi)
- **ADR-008 brain import:** UYUMLU — brain'den import yok
- **ADR-010 deps:** UYUMLU — sadece commander
- **ADR-022 CLI/MCP parity:** MCP'de `deckent_upgrade` YOK — **PARITY GAP** (beklenen: self-update MCP'de mantikli degil)
- **ADR-033 product vision:** UYUMLU — product self-update uygun
- **Memory V2:** N/A

## 8. Test Coverage
- `tests/cli/commands/upgrade.test.ts` — MEVCUT ✅
- parseSemver ve compareVersions saf fonksiyonlar — kolay test edilebilir
- Edge case'ler: pre-release karsilastirmasi, npx tespiti, network hatalari

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz

## 10. Dead Code
- `buildInstallCommand` export ediliyor — dis kullanim dogrulanmali
- npx/unknown case'leri ayni komut donduruyor (satir 193-195) — **kasitli fallback**, dead code degil
- Genel: Temiz

## 11. Security
- **P1: spawnSync shell injection riski** — `spawnSync('npm', [...])` array args kullaniliyor, GUVENLI
- `saveVersionForRollback` npm config'e yazma: sideeffect riski dusuk
- `opts.local` path dogrudan spawnSync'e iletiliyor (satir 343-346) — yerel dosya yolu, kullanici girisi oldugu icin path traversal riski teorik ama npm install zaten sinirli
- Secret exposure: YOK

## 12. Memory V2 Uyumu
- Memory islemi yok — N/A
- Eski .md parse: YOK — UYUMLU

## 13. i18n
- Tum print mesajlari INGILIZCE hardcoded
- getMessage() KULLANILMIYOR — i18n gap
- turkishNormalize: N/A

## 14. Dokumantasyon Tutarliligi
- 13 export'un 9'unda JSDoc VAR — iyi oran
- buildInstallCommand, runUpgradeInstall, executeUpgrade, registerUpgrade JSDoc EKSIK
- CLI help: "Self-update deckent" — yeterli ama kisa

## 15. Performance
- spawnSync x12+ (npm list, view, install, config) — **yuksek sync I/O**
- Ancak bu upgrade islemi icin kabul edilebilir (kullanici bekler)
- Hot path degil
- `detectInstallStrategy` 2 ayri npm list cagiriyor — **optimize edilebilir** (tek cagri ile combined)

## 16. Oneriler
- **P2:** detectInstallStrategy() 2 spawnSync → tek cagri ile birlestirebilir (npm list -g + local)
- **P2:** i18n — print mesajlarini getMessage() ile wrap et
- **P3:** JSDoc eksikleri — buildInstallCommand, runUpgradeInstall, executeUpgrade, registerUpgrade
- **P3:** ADR-022 parity gap CLI-only olarak resmi belgelenmeli
- **P3:** Semver karsilastirmada pre-release sorting lexicographic — "alpha" < "beta" < "rc" olmasi gerekirken alphabetical sort yapiliyor (satir 52), edge case

## Verdict: ANALYZED
