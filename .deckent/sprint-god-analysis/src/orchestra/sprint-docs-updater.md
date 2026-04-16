# Analysis: src/orchestra/sprint-docs-updater.ts
**Task ID:** 142-014 | **Model:** opus | **LoC:** 684 | **Effort:** max

## 1. Amaci (detayli)
Sprint sonrasi dokuman guncelleme orkestratoru. Sprint log yazma, proje identity guncelleme, DEBT.md otomatik resolve, DECISIONS.md otomatik ADR draft, pattern dosyasi guncelleme, DIRECTIVES.md arsivleme, orphan task arsivleme ve eski arsiv temizleme islevlerini icerir. Sprint-reporter.ts'den extract edilmis, managed-docs ve doc-updaters pipeline'lari ile entegredir. Brain tarafindan sprint finalize fazinda cagirilir.

## 2. Public API
- `writeSprintLog(projectRoot, sprint, metrics, evaluations?, results?)`: void — Sprint log .md dosyasi yazar. JSDoc VAR.
- `updateProjectDocs(projectRoot, sprintResult, config?)`: DocUpdateResult[] — Tum doc updater'lari calistirir. JSDoc VAR.
- `generateProjectIdentity(info)`: string — PROJECT-IDENTITY.md icerigi uretir (delegate). JSDoc VAR.
- `countProjectTestCases(projectRoot)`: number — Test dosyalarini tarayarak test sayisi hesaplar. JSDoc VAR.
- `parseCoverageFromClover(projectRoot)`: number | null — clover.xml'den coverage parse eder. JSDoc VAR.
- `getTestCountFromVitest(projectRoot)`: number | null — vitest JSON output'undan test sayisi alir. JSDoc VAR.
- `getCoverageFromVitest(projectRoot)`: number | null — vitest --coverage text output'undan coverage alir. JSDoc VAR.
- `readPreviousTestCount(content)`: number | null — PROJECT-IDENTITY.md'den onceki test sayisini okur. JSDoc VAR.
- `updateProjectIdentity(projectRoot, sprintId, metrics, totalSprints?)`: void — PROJECT-IDENTITY.md gunceller. JSDoc VAR.
- `autoResolveDebt(projectRoot, sprint, evaluations)`: number — DEBT.md satirlarini auto-resolve eder. JSDoc VAR.
- `autoDraftDecisions(projectRoot, sprintId)`: number — Yeni moduller icin draft ADR yazar. JSDoc VAR.
- `addRecurringPatternsToFile(projectRoot, recurringFiles)`: number — Pattern dosyasina recurring error ekler. JSDoc VAR.
- `collectSprintFiles(root)`: Array — Sprint log dosyalarini toplar. JSDoc VAR.
- `archiveDirectives(projectRoot, sprintId)`: void — DIRECTIVES.md'yi arsivler. JSDoc VAR.
- `archiveOrphanTasks(projectRoot, sprintId)`: number — Orphan task dosyalarini arsivler. JSDoc VAR.
- `cleanTasksArchive(projectRoot, retentionCount?)`: number — Eski arsivleri temizler. JSDoc VAR.
- Re-export: `ProjectIdentityInfo` type.
**JSDoc durumu: TAMAM — tum export'lar belgelenmis.**

## 3. Ic Bagimliliklar
- `../core/types.js` (TaskEvaluation, TaskResult, Sprint, SprintMetrics, ResolvedConfig, SprintResult, PatternEntry)
- `../core/constants.js` (BRAIN_DIR, SPRINTS_DIR, ARCHIVE_DIR, SPRINT_LOG_MAX_LINES, PATTERNS_FILE, DEBT_FILE, DECISIONS_FILE, DIRECTIVES_FILE, PROJECT_IDENTITY_FILE)
- `./doc-updaters/registry.js` (runAllUpdaters)
- `./doc-updaters/types.js` (DocUpdateResult)
- `./doc-updaters/index.js` (side-effect import — updater registration)
- `./managed-docs/managed-doc-runner.js` (runManagedDocUpdates)
- `../core/utils.js` (debugLog)
- `../core/model-registry.js` (modelRegistry)
- `./sprint-metrics.js` (extractSprintNumber)
- `./sprint-docs-helpers.js` (10 helper fonksiyon + type)
**Dongusel bagimllik riski: YOK. Tum import'lar tek yonlu.**

## 4. Dis Bagimliliklar
- `node:fs` (readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync, rmdirSync)
- `node:child_process` (execSync, spawnSync)
- `node:path` (join)
**ADR-010 uyumu: TAMAM — sadece Node.js built-in modulleri kullanilmis.**

## 5. Complexity
- **Fonksiyon sayisi:** 16 (public) + 1 (private readFileSafe)
- **En karmasik fonksiyon:** `autoResolveDebt` (satir 325-370) — nested loop, string manipulation, regex replacement chain. Cyclomatic ~8.
- **Ikinci:** `updateProjectIdentity` (satir 268-314) — fallback chain mantigi, birden fazla data kaynagi.
- **Ucuncu:** `archiveOrphanTasks` (satir 586-634) — dosya sistem islemleri, copy+delete loop.
- **Toplamda:** Dosya buyuk (684 LoC) ama fonksiyon basina 20-40 satir ile yonetilebilir boyutta.

## 6. Type Safety
- **any sayisi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown: 0**
- **non-null !:** Satir 357: `lines[i]!.includes(sprint.id)` — autoResolveDebt icinde, index kontrol edilmis ama dizi erisimi `lines[i]` zaten check edilebilir. Risk: DUSUK.
- **unsafe cast:** Satir 91-92: `as ResolvedConfig['activeModeConfig']['brain_model']` — modelRegistry sonucu string, ResolvedConfig union type'a cast. Semantik olarak dogru ama compile-time constraint zayif.
- **Genel:** Type safety cok iyi.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** spawnSync satir 203 (getTestCountFromVitest) ve satir 231 (getCoverageFromVitest) — timeout parametresi ile korunmus. TAMAM.
- **ADR-008 (brain import):** Bu modul brain'den import almaz, brain tarafindan cagirilir. Tek yonlu. TAMAM.
- **ADR-010 (deps):** Sadece Node.js built-in. TAMAM.
- **ADR-022 (CLI/MCP parity):** Bu bir ic modul, parity uygulanmaz.
- **ADR-033 (product vision):** DECKENT-MASTER-BLUEPRINT.md kontrolu satir 86 (isInternalProject). TAMAM.
- **ADR-037 (RBAC):** Dogrudan authority enforcement yok ama Brain tarafindan cagirilir. Uygun.
- **ADR-039 (self-modifying):** N/A.
- **Memory V2 DB-first:** **IHLAL** — autoResolveDebt (satir 325-370) hala DEBT.md dosyasini dogrudan okuyup yaziyor. autoDraftDecisions (satir 380-449) hala DECISIONS.md dosyasini dogrudan okuyup yaziyor. addRecurringPatternsToFile (satir 457-499) PATTERNS.md'yi dogrudan yaziyor. Bu islemler DB uzerinden yapilmali.

## 8. Test Coverage
- **Test dosyasi: YOK** — `tests/orchestra/sprint-docs-updater.test.ts` mevcut degil.
- **Sprint-docs-helpers test'i var mi?** Muhtemelen, ama bu dosyanin kendisi icin birim test yok.
- **KRITIK BULGU:** 684 LoC'lik, 16 public fonksiyonlu bir modul icin sifir test coverage ciddi bir risktir.
- **Onerilen testler:**
  - writeSprintLog: dosya yazma + SPRINT_LOG_MAX_LINES truncation
  - autoResolveDebt: resolve logic + edge cases
  - autoDraftDecisions: git diff parsing + ADR numbering
  - archiveOrphanTasks: file copy/delete + extension filtering
  - cleanTasksArchive: retention policy

## 9. TODO/FIXME/HACK Inventory
**YOK** — Temiz.

## 10. Dead Code
- `readFileSafe` (satir 42-49): Sadece `updateProjectIdentity` tarafindan dolayli olarak kullaniliyor. AKTIF.
- Tum 16 public fonksiyon kullaniliyor (sprint lifecycle, finalize, init).
- **Dead code YOK.**

## 11. Security
- **execSync satir 386:** `git diff --name-status HEAD~1` — kullanici girdisi yok, hardcoded komut. Risk: DUSUK.
- **spawnSync satir 203, 231:** vitest calistirma — timeout korunmasi var. Risk: DUSUK.
- **Dosya islemleri:** projectRoot parametresi disaridan geliyor, path traversal riski teorik. Risk: DUSUK (brain tarafindan saglaniyor).
- **OWASP:** Injection riski yok, secret exposure yok.

## 12. Memory V2 Uyumu
- **autoResolveDebt (satir 325-370):** DEBT.md dosyasini dogrudan `readFileSync` + `writeFileSync` ile okuyor/yaziyor. **Memory V2 ihlali.** DB uzerinden `store.update()` ile yapilmali.
- **autoDraftDecisions (satir 380-449):** DECISIONS.md dosyasini dogrudan okuyor/yaziyor. **Memory V2 ihlali.** DB uzerinden `store.insert({ type: 'adr' })` ile yapilmali.
- **addRecurringPatternsToFile (satir 457-499):** PATTERNS.md dosyasini JSON olarak okuyor/yaziyor. **Memory V2 ihlali.** DB uzerinden `store.insert({ type: 'pattern' })` ile yapilmali.
- **writeSprintLog:** .brain/sprints/*.md dosyasi yaziyor — bu sprint log export'u olarak kabul edilebilir, ayrica DB'ye de yazilmali.
- **updateProjectIdentity:** PROJECT-IDENTITY.md guncelliyor — dosya-bazli kalabilir cunku dosya decay_exempt.
- **Sonuc:** 3 fonksiyon Memory V2 DB-first kuralini ihlal ediyor. **P1 severity.**

## 13. i18n
- Tum mesajlar Ingilizce hardcoded (debugLog mesajlari, markdown icerikleri).
- turkishNormalize kullanimi: YOK (bu modul arama yapmaz).
- i18n uyumu: Uygulanabilir degil (ic modul, kullanici-facing degil).

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: UYUMLU. Tum public fonksiyonlar belgelenmis.
- .md referans dogrulugu: DEBT_FILE, DECISIONS_FILE, PATTERNS_FILE constant'lari constants.ts'den geliyor.
- Sayi tutarliligi: N/A.

## 15. Performance
- **Sync I/O sayisi:** readFileSync (7), writeFileSync (6), existsSync (9), mkdirSync (4), readdirSync (4), copyFileSync (2), unlinkSync (3), rmdirSync (1), execSync (1), spawnSync (2) = **TOPLAM 39 sync I/O cagri noktasi.**
- **Hot path mi?:** EVET — sprint finalize fazinda cagrilir, her sprint sonunda. Ama tek seferlik islem.
- **Gereksiz disk I/O:** countProjectTestCases (satir 138-165) tum tests/ dizinini recursive tarar — her dosyayi readFileSync ile acar. Bu yavasti ama vitest JSON fallback'i olarak nadiren cagrilir.
- **getTestCountFromVitest + getCoverageFromVitest:** Her biri ayri bir `npx vitest run` process spawn eder. Eger her ikisi de cagirilirsa 2x vitest suresi. Bu birlestirilmeli.

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P1** | autoResolveDebt, autoDraftDecisions, addRecurringPatternsToFile fonksiyonlarini Memory V2 DB-first'e migrate et |
| **P1** | Test dosyasi olustur: tests/orchestra/sprint-docs-updater.test.ts (16 public fonksiyon icin en az 30 test) |
| **P2** | getTestCountFromVitest + getCoverageFromVitest birlestirilmeli (tek vitest calistirma) |
| **P2** | autoResolveDebt regex chain'i fragile — tablo formati degisirse kirilir |
| **P3** | countProjectTestCases recursive scan yavas — cache mekanizmasi eklenebilir |
| **P3** | Non-null assertion (satir 357) optional chaining ile degistirilmeli |

## Verdict: ANALYZED
