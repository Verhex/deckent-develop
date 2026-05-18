# Analysis: src/cli/commands/memory.ts
**Task ID:** 141-003 | **LoC:** 125

## 1. Amacı
Memory V2 yönetim CLI komutlarını uygular: `deckent memory rebuild|export|stats` subcommandları.

## 2. Public API (export listesi)
- `registerMemory(program: Command): void` — memory subcommandlarını register eder

## 3. İç + Dış Bağımlılıklar
İç:
- `../../core/memory-store.js` (MemoryStore)
- `../../core/memory-import.js` (parseDecisionsMd, parseMemoryMd, parseDebtMd)
- `../../core/memory-export.js` (exportSummaryMd, exportDecisionsMd, exportMemoryMd, exportDebtMd)
- `../../core/constants.js` (BRAIN_DIR, MEMORY_DB_FILE, MEMORY_EXPORTS_DIR)

Dış:
- `../helpers/process.js` (resolveProjectRoot)
- `../helpers/output.js` (print, printError)
- `commander` (Command)
- `node:path` (join)
- `node:fs` (existsSync, readFileSync, writeFileSync, mkdirSync)

## 4. Complexity
- 1 exported function (registerMemory)
- 3 subcommand action handlers: rebuild, export, stats
- Cyclomatic: ~5 (db check, export dir check, decisionsPath, memoryPath, debtPath, origDecisions)

## 5. Type Safety
- `mem.command('rebuild').action(...)` callback — opts parametresi var ama kullanılmıyor (no-op)
- `store.countByType()` dönüş tipi Map<string, number> varsayılıyor — tip annotation kontrol gerekli
- `store.getSchemaVersion()` → satır 119 — return type: number varsayılıyor

## 6. ADR Compliance
- ✅ ADR-001: ESM import
- ✅ ADR-008: core/ modüllerinden doğrudan import
- ✅ Memory V2 DB-First: MemoryStore merkezi
- ✅ export command: 4 .md dosyasını DB'den üretiyor
- ✅ rebuild command: .md dosyalarını okuyup DB'ye import ediyor

## 7. Test Coverage
Beklenen testler:
- `deckent memory rebuild` — db mevcut olduğunda hata, başarılı rebuild
- `deckent memory export` — db yokken hata, başarılı export
- `deckent memory stats` — db yokken hata, count output formatı

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
- `mem.command('rebuild')` → `count === 0 && existsSync(origDecisions)` fallback — bu branch ne zaman tetikleniyor? exports klasörü yokken çalışır, ancak dokümantasyon edilmemiş.

## 10. Security Findings
- `readFileSync(decisionsPath, 'utf-8')` — dosya içeriği parse ediliyor, ancak .md parse güvenilir (parseDecisionsMd)
- `MEMORY_DB_FILE` path sabit, user-controlled değil — güvenli

## 11. Memory V2 Uyumu
✅ Tam DB-first: rebuild komutu .md → DB, export komutu DB → .md
✅ `store.close()` finally bloğunda çağrılıyor (her 3 subcommand'da)
✅ MEMORY_EXPORTS_DIR kullanılıyor (sabit import)
⚠️ rebuild: `memory.db already exists. Delete it first` — güvenlik için doğru ama `--force` flag yokluğu kullanıcı deneyimini zorlaştırıyor

## 12. Öneriler
- `memory rebuild --force` flag eklenebilir (mevcut DB'yi sil + rebuild)
- `memory migrate` subcommand: eski .brain/ dosyalarından ilk kez migration (DIRECTIVES.md'de bahsedilen)
- `memory rebuild` output: "ADRs: X" formatı yerine richer tablo çıktı
- `memory export` başarısını doğrulamak için `print(`Exported: summary.md (${count} entries)`)` daha bilgilendirici

## 13. Verdict: ANALYZED
