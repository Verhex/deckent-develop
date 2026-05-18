# Analysis: src/cli/commands/doctor.ts
**Task ID:** 142-017 | **Model:** opus | **LoC:** 1069 | **Effort:** max

## 1. Amaci
`deckent doctor` CLI komutunu register eder. Sistem sagligi kontrolu: Node.js, git, tmux, Docker, Claude CLI, workspace, brain dir, directives, brain budget, debt, stale locks, .deck guvenlik, yazma izinleri. Ayrica provider health, CI health, system profile gosterir. 3 output modu: human-friendly (varsayilan), legacy, JSON. Pre-flight sprint gate olarak da kullanilir. Projenin en buyuk CLI dosyasi.

## 2. Public API
**26 export** — cok fazla:
- `registerDoctor(program: Command): void` — ana kayit fonksiyonu
- `isRunningInWSL(): boolean`
- `checkPlatform(): DoctorCheck`
- `checkTmux(providerNames?, spawnBackend?): DoctorCheck`
- `checkClaude(checkAuth?): DoctorCheck`
- `checkDocker(spawnBackend?): DoctorCheck`
- `checkDeckSecurity(root): DoctorCheck`
- `checkWritePermissions(root): DoctorCheck`
- `runDoctorChecks(root, providerNames?, spawnBackend?): DoctorResult`
- `runPreFlightHealthCheck(root): PreFlightResult`
- `getLastSprintId(root): string | null`
- `countDebtItems(root): { total; critical }`
- `countOpenDebtItems(root): number`
- `readCIBaseline(root): CIBaseline | null`
- `readLatestCIReport(root, sprintId?): CIReport | null`
- `readAllCIReports(root, count?): CIReport[]`
- `getMemoryHealthLabel(pct): string`
- `getProviderSummary(providers): string`
- `getReadinessLabel(result, brainLines, brainBudget): string`
- `getProviderInstallHint(name): string`
- `buildConnectorHealthResults(providers): HealthCheckResult[]`
- `formatConnectorHealthLines(results, root): string[]`
- `formatHumanDoctor(input): string`
- `formatProviderHealthSection(providers, root): string[]`
- `getProviderTips(providers): string[]`
- `formatSystemProfile(profile, subscription?): string`
- `getDeckFileStatus(root): string`
- Interface: `HumanDoctorInput`, `PreFlightCheckResult`, `PreFlightResult`
- JSDoc: Cogunlukta MEVCUT (iyi dokumantasyon)

## 3. Ic Bagimliliklar
- `../../core/types.js` → DoctorResult, SystemProfile
- `../../core/constants.js` → 8 constant import
- `../../core/memory-store.js` → MemoryStore
- `../../core/system-profile.js`, `../../core/subscription.js`, `../../core/errors.js`
- `../../core/provider.js` → detectAvailableProviders, formatDetectedProviders, DetectedProvider
- `../../core/environment.js` → detectEnvironment
- `../../core/deck-file.js` → loadDeckSecrets, validateDeckFile, KNOWN_DECK_KEYS, isDeckFileCommitted
- `../../orchestra/connector.js` → HealthCheckResult (TYPE ONLY — uyumlu)
- `../helpers/output.js` → print, formatDoctorResult, formatCIHealthSection, CIBaseline, CIReport
- `../helpers/process.js`, `../helpers/messages.js`, `../helpers/config-reader.js`
- Dongusel bagimllik: `orchestra/connector.js` import TYPE ONLY — ADR-008 UYUMLU

## 4. Dis Bagimliliklar
- `commander` (ADR-010)
- `node:fs` (readFileSync, existsSync, readdirSync, accessSync, constants)
- `node:path`, `node:os` → platform, `node:child_process` → spawnSync

## 5. Complexity
- **26+ fonksiyon** — God Object anti-pattern riski
- Max cyclomatic: ~10 (formatHumanDoctor — 15+ branch)
- En karmasik fonksiyon: `formatHumanDoctor` (satir 512-661, 150 satir) — 6 section (System, Project, Health, CI, Provider, Readiness, Recommendation)
- `registerDoctor` action handler (satir 934-1068) — async, 5 output modu branch

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- non-null `!`: 2 (satir 92: `match[1]!`, satir 201: `parts[0]!`) — regex match guard ile korunmus
- `as Record<string, unknown>` cast: satir 957 — JSON parse sonrasi, makul
- `as HealthCheckResult['authStatus']` cast: satir 466 — explicit narrowing
- Genel: IYI — 1069 satirda sifir any

## 7. ADR Compliance
- ADR-006 spawnSync: 6 spawnSync cagrisi (node, git, tmux, claude, docker) — UYUMLU (hepsi CLI tool check, user input yok)
- ADR-008: orchestra/connector.js'den sadece TYPE import — UYUMLU
- ADR-010: UYUMLU
- ADR-022 CLI/MCP parity: UYUMLU — `deckent_doctor` MCP tool mevcut
- Memory V2 DB-first: UYUMLU — `getMemoryEntryCount` MemoryStore.totalCount()
- **DIKKAT:** `checkDebt` (satir 239-255) ve `countDebtItems` (satir 304-315) hala DEBT.md dosyasini parse ediyor (readFileSync + split + filter) — DB-first degil, V1 kalintisi

## 8. Test Coverage
- `tests/cli/commands/doctor.test.ts` — MEVCUT
- `tests/cli/commands/doctor-json.test.ts` — MEVCUT (JSON output)
- `tests/cli/commands/doctor-watch-provider.test.ts` — MEVCUT (provider watch)
- Kapsam: Iyi coverage — 3 test dosyasi. Ama pre-flight check, Docker check, CI health gibi yeni ozelliklerin coverage'i bilinmiyor.

## 9. TODO/FIXME/HACK inventory
- YOK (1069 satirda hicbir marker bulunamadi)

## 10. Dead Code
- `countOpenDebtItems` (satir 321-340) — kullanilip kullanilmadigi belirsiz; dosya icinde cagrilmiyor, disaridan import edilebilir
- `formatProviderHealthSection` (satir 701-735) — legacy format, `formatConnectorHealthLines` ile replace edilmis ama hala fallback olarak kullaniliyor (satir 626)

## 11. Security
- spawnSync cagrilerinin hicbirinde user input yok — GUVENLI
- `checkClaude(checkAuth)` satir 159: `claude config get account` — kimlik bilgisi okuma, output print edilmiyor — GUVENLI
- `loadDeckSecrets(root)` — .deck dosyasi icerigi doctor output'ta gosterilmiyor (sadece count) — GUVENLI
- `isDeckFileCommitted(root)` — git tracked kontrolu, secret exposure uyarisi — GUVENLI

## 12. Memory V2 Uyumu
- KISMI UYUMLU:
  - `getMemoryEntryCount` → MemoryStore.totalCount() — DOGRU (satir 218-226)
  - `checkBrainBudget` → getMemoryEntryCount — DOGRU
  - **UYUMSUZ:** `checkDebt` (satir 239-255) ve `countDebtItems` (satir 304-315) hala DEBT.md dosyasi parse ediyor — DB-first degil
  - **UYUMSUZ:** `checkBrainDir` (satir 187-198) MEMORY_FILE, DEBT_FILE, DECISIONS_FILE dosya varlik kontrolu yapiyor — DB-first dunyada bu kontrol yaniltici (DB varsa yeterli)

## 13. i18n
- `getMessage()` KULLANIYOR — `doctor.checks_passed` (legacy mod)
- **BUYUK GAP:** formatHumanDoctor icindeki tum mesajlar hardcoded EN: "Your System:", "Your Project:", "Memory:", "Status:", "Recommendation:", "Provider Health:", "Everything looks good!" — hicbiri cevrilmemis
- Sadece legacy mod i18n destekliyor — human-friendly mod tamamen EN

## 14. Dokumantasyon Tutarliligi
- JSDoc: ISINSAL — cogu public fonksiyon icin JSDoc mevcut (iyi)
- `DoctorCheck` interface: internal, JSDoc yok ama acik isimler
- `HumanDoctorInput` interface: acik field isimleri + optional JSDoc — yeterli
- **UYUMSUZLUK:** `checkBrainBudget` "lines" diyor ama aslinda "entries" sayiyor (V2 sonrasi)

## 15. Performance
- Sync I/O: readFileSync (14), existsSync (15), readdirSync (2), spawnSync (6), accessSync (2) = 39 sync cagri — YUKSEK
- `registerDoctor` icinde `detectAvailableProviders()` ASYNC — dogru
- Doctor checks sequential — paralel calistirma potansiyeli var (spawnSync'ler bagimsiz)
- 6 spawnSync her doctor cagrisinda calisir — ama CLI one-shot oldugu icin kabul edilebilir

## 16. Oneriler
- **P0:** God Object: 1069 satir, 26 export — doctor-checks.ts (check fonksiyonlari) + doctor-format.ts (formatting) + doctor.ts (CLI kayit) olarak 3'e bolunmeli
- **P1:** `checkDebt` ve `countDebtItems` DB-first olmali — MemoryStore.getByType('debt') kullanmali
- **P1:** `checkBrainDir` DB varlik kontrolu eklemeli (memory.db mevcut mu?)
- **P1:** "lines" → "entries" terminoloji duzeltmesi (checkBrainBudget, formatHumanDoctor)
- **P2:** `getMemoryEntryCount` 4 yerde duplicate — ortak utility'ye tasinmali
- **P2:** i18n: formatHumanDoctor tamamen EN — getMessage() ile cifte dil desteği
- **P3:** Check fonksiyonlari paralel calistirilabilir (Promise.all ile)

## Verdict: ANALYZED
