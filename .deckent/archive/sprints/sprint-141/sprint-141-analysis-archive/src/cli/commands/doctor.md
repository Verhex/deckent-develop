# Analysis: src/cli/commands/doctor.ts
**Task ID:** 141-003 | **LoC:** 1069

## 1. Amacı
Sistem sağlık kontrolü yapan en kapsamlı CLI dosyası. Node.js, git, tmux, Claude CLI, Docker, platform, workspace, brain dir, directives, memory budget, debt, lock, .deck security, write permissions kontrolü yapar.

## 2. Public API (export listesi)
- `isRunningInWSL(): boolean`
- `checkPlatform(): DoctorCheck`
- `checkTmux(providerNames?, spawnBackend?): DoctorCheck`
- `checkClaude(checkAuth?): DoctorCheck`
- `runDoctorChecks(root, providerNames?, spawnBackend?): DoctorResult`
- `getLastSprintId(root): string | null`
- `countDebtItems(root): { total: number; critical: number }`
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
- `getDeckFileStatus(root): string`
- `formatProviderHealthSection(providers, root): string[]`
- `getProviderTips(providers): string[]`
- `formatSystemProfile(profile, subscription?): string`
- `checkWritePermissions(root): DoctorCheck`
- `checkDeckSecurity(root): DoctorCheck`
- `checkDocker(spawnBackend?): DoctorCheck`
- `runPreFlightHealthCheck(root): PreFlightResult`
- `registerDoctor(program): void`

## 3. İç + Dış Bağımlılıklar
İç:
- `../../core/memory-store.js` (MemoryStore) — Memory V2
- `../../core/constants.js` — DECKENT_DIR, BRAIN_DIR, MEMORY_FILE, DEBT_FILE, DECISIONS_FILE, DIRECTIVES_FILE, LOCKS_DIR, DEBT_TABLE_HEADER, MEMORY_DB_FILE, PROJECT_CONFIG_PATH
- `../../core/system-profile.js`, `../../core/subscription.js`
- `../../core/provider.js`, `../../core/environment.js`
- `../../core/deck-file.js`, `../../core/errors.js`
- `../../orchestra/connector.js` (HealthCheckResult)

Dış:
- `../helpers/output.js` (print, formatDoctorResult, formatCIHealthSection)
- `../helpers/process.js`, `../helpers/messages.js`, `../helpers/config-reader.js`
- `commander` (Command)
- `node:fs`, `node:path`, `node:os`, `node:child_process`

## 4. Complexity
- 28 exported functions/interfaces
- 14 check fonksiyonu (checkNode, checkGit, checkTmux, vb.)
- Cyclomatic: ~15+ (en yüksek: formatHumanDoctor ~8, checkDocker ~6)
- Dosya boyutu: 1069 satır — refactor adayı (tek file'da çok sorumluluk)

## 5. Type Safety
- `DoctorCheck` interface: `name, passed, message, required` — clean ✅
- `HumanDoctorInput` interface — kapsamlı ✅
- `PreFlightCheckResult` ve `PreFlightResult` interface — typed ✅
- `spawnSync` result dönüşleri type assertion gerektiriyor — acceptable
- `JSON.parse(raw) as Record<string, unknown>` — casting ile okuyor

## 6. ADR Compliance
- ✅ ADR-001: ESM import
- ✅ ADR-006: spawnSync pattern — komut argümanları array olarak verilmiş (injection safe)
- ✅ ADR-010: commander + node: built-ins, dışarıdan dep yok
- ✅ Memory V2 DB-First: `getMemoryEntryCount` → MemoryStore.totalCount()
- ✅ Legacy `countBrainLines` kaldırılmış

## 7. Test Coverage
Test: `tests/cli/doctor.test.ts` beklenen:
- `isRunningInWSL()` — WSL env var, /proc/version
- `checkPlatform()` — win32/linux/darwin
- `checkTmux()` — provider-aware
- `getMemoryEntryCount()` — db yoksa 0, db varsa totalCount
- `checkBrainBudget()` — budget aşımı
- `formatHumanDoctor()` — output format

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
- `countOpenDebtItems` — export edilmiş ama hangi caller kullanıyor? Dış kod varsa mevcut, yoksa dead
- `formatProviderHealthSection` — `formatConnectorHealthLines` gelince yerini almış olabilir (iki paralel implementasyon)

## 10. Security Findings
- `spawnSync('docker', ['info'])` — timeout: 5_000 ✅ (DoS engeli)
- `spawnSync('node', [scriptPath, '--json', '--root', root])` — scriptPath join ile oluşturulmuş; root parametresi process.cwd()'den geliyor — injection riski düşük
- `spawnSync('git', ...)`, `spawnSync('tmux', ...)` — array args ✅
- `.deck` file committed check — güvenlik feature ✅

## 11. Memory V2 Uyumu
✅ `getMemoryEntryCount` → MemoryStore.totalCount() ile DB-first (satır 218-226)
✅ `checkBrainBudget` → `getMemoryEntryCount` kullanıyor
✅ Legacy `countBrainLines` yok
⚠️ `checkBrainDir` fonksiyonu: `MEMORY_FILE, DEBT_FILE, DECISIONS_FILE` kontrolü yapıyor — bu dosyalar eski V1 dosyaları, Memory V2'de bunlar deprecated. Memory V2 kurulumunda `memory.db` kontrolü eklenmeli.
⚠️ `countDebtItems`, `countOpenDebtItems` → DEBT.md dosyasını parse ediyor — Memory V2 sonrası bunlar DB-first olabilir.

## 12. Öneriler
- **P1:** `checkBrainDir` → `memory.db` varlığını da kontrol etmeli (V2 indicator)
- **P1:** `countDebtItems` / `countOpenDebtItems` → DB-first alternatifleri eklenebilir (MemoryStore.getByType('debt'))
- **P2:** `formatProviderHealthSection` vs `formatConnectorHealthLines` — ikisi benzer işlev yapıyor, birleştirilebilir
- **P2:** 1069 satır dosya refactor adayı — `doctor-checks.ts`, `doctor-format.ts`, `doctor-preflight.ts` gibi split
- Eski `MEMORY_FILE` varlık kontrolü V2 migration sonrası opsiyonel hale getirilebilir

## 13. Verdict: ANALYZED
