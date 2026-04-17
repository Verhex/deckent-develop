# Analysis: src/orchestra/sprint-docs-updater.ts
**Task ID:** 140-002 | **LoC:** 684

## 1. Amaci
Sprint doküman güncellemelerinin dosya I/O kısmını yönetir. Sprint log yazma, PROJECT-IDENTITY.md güncelleme, DEBT.md auto-resolve, DECISIONS.md ADR draft, PATTERNS.md yönetimi, sprint dosyası arşivleme ve DIRECTIVES.md arşivleme. `sprint-reporter.ts`'den extract edilmiş.

## 2. Public API
- `writeSprintLog(projectRoot, sprint, metrics, evaluations?, results?): void`
- `updateProjectDocs(projectRoot, sprintResult, config?): DocUpdateResult[]`
- `generateProjectIdentity(info): string`
- `countProjectTestCases(projectRoot): number`
- `parseCoverageFromClover(projectRoot): number | null`
- `getTestCountFromVitest(projectRoot): number | null`
- `getCoverageFromVitest(projectRoot): number | null`
- `readPreviousTestCount(content): number | null`
- `updateProjectIdentity(projectRoot, sprintId, metrics, totalSprints?): void`
- `autoResolveDebt(projectRoot, sprint, evaluations): number`
- `autoDraftDecisions(projectRoot, sprintId): number`
- `addRecurringPatternsToFile(projectRoot, recurringFiles): number`
- `collectSprintFiles(root): Array<{file, dir}>`
- `archiveDirectives(projectRoot, sprintId): void`
- `archiveOrphanTasks(projectRoot, sprintId): number`
- `cleanTasksArchive(projectRoot, retentionCount?): number`

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:child_process` (execSync, spawnSync), `node:path`
- **Dis:** `../core/types.js`, `../core/constants.js`, `../core/utils.js`, `../core/model-registry.js`
- **Dis:** `./doc-updaters/registry.js`, `./doc-updaters/types.js`, `./doc-updaters/index.js` (side-effect)
- **Dis:** `./managed-docs/managed-doc-runner.js`
- **Dis:** `./sprint-metrics.js` (extractSprintNumber)
- **Dis:** `./sprint-docs-helpers.js` (11 helper import)

## 4. Complexity
- 16 export fonksiyon, cyclomatic toplam ~40+ (çok sayıda I/O guard + döngü)
- 684 LoC — büyük ama mantıksal bölümlere ayrılmış (comment dividers)

## 5. Type Safety
- `as ResolvedConfig['activeModeConfig']['brain_model']` double cast — model string tiplemesi için
- `(result?.stdout ?? '') + (result?.stderr ?? '')` — güvenli optional chain ✓
- `(sprint.tasks) as Array<{...}>`  — sprint.tasks tipi `Sprint['tasks']` uyumlu

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-006 (spawnSync Security Pattern):** spawnSync stdio: pipe kullanılıyor ✓
- **Memory V2 İhlali:** `autoResolveDebt` `DEBT_FILE` dosyasını okuyor — DB-first değil ⚠️
- **Memory V2 İhlali:** `autoDraftDecisions` `DECISIONS_FILE` dosyasını okuyor/yazıyor — DB-first değil ⚠️
- **Memory V2 İhlali:** `addRecurringPatternsToFile` `PATTERNS_FILE` dosyasını okuyor — DB-first değil ⚠️

## 7. Test Coverage
- `tests/orchestra/sprint-docs-updater.test.ts` bekleniyor
- `getTestCountFromVitest` ve `getCoverageFromVitest` için mock gerekli (spawnSync)

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `autoDraftDecisions`: DECISIONS_FILE (96K dosya) üzerinde çalışıyor — Memory V2 sonrası DB'ye taşınmalı
- `addRecurringPatternsToFile`: JSON file-based PATTERNS — Memory V2 DB'de `type: 'pattern'` var

## 10. Security Findings
- `execSync('git diff --name-status HEAD~1')` — shell injection riski: cwd ve timeout set edilmiş ✓
- `spawnSync('npx', ['vitest', 'run', ...]` — array args, shell injection yok ✓
- `archiveOrphanTasks`: `copyFileSync + unlinkSync` — destruktif operasyon, hata handling var ✓

## 11. Memory V2 Uyumu
- **3 kritik ihlal:** `autoResolveDebt`, `autoDraftDecisions`, `addRecurringPatternsToFile` hepsi dosya tabanlı
- `updateProjectIdentity`: `PROJECT_IDENTITY_FILE` dosyasına yazıyor — DB'ye de yazılmalı (dual-write)
- Sprint log: `writeFileSync` dosyaya yazıyor, DB dual-write kontrol edilmeli (`sprint-retro-writer.ts`)

## 12. Oneriler
- Sprint 142 P0: `autoResolveDebt` → `store.update()` ile debt DB'de güncelle
- Sprint 142 P0: `autoDraftDecisions` → `store.insert({ type: 'adr', status: 'proposed' })`
- Sprint 142 P1: `addRecurringPatternsToFile` → `store.insert({ type: 'pattern' })`
- 684 LoC büyük ama Sprint 138'de zaten split yapılmış — mevcut boyut kabul edilebilir

## 13. Verdict: ANALYZED (3 critical Memory V2 migration candidates)
