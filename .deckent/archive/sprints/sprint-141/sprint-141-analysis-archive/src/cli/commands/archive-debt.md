# Analysis: src/cli/commands/archive-debt.ts
**Task ID:** 141-003 | **LoC:** 200

## 1. Amacı
Çözülmüş debt item'larını DEBT.md'den arşive taşır. DB-first pattern: SQLite'tan okur, dosya fallback kullanır.

## 2. Public API (export listesi)
- `registerArchiveDebt(program: Command): void` — commander program'a archive-debt komutunu register eder

İç yardımcılar:
- `formatDebtRow(r: DebtItem): string` — private
- `getRotatedArchivePath(archiveDir, maxSizeBytes): string` — private, rotation mantığı

## 3. İç + Dış Bağımlılıklar
İç:
- `../../core/memory-store.js` (MemoryStore)
- `../../core/constants.js` (BRAIN_DIR, DEBT_FILE, ARCHIVE_DIR, DEBT_TABLE_HEADER, MEMORY_DB_FILE)
- `../../core/utils.js` (parseDebtTable, generateDebtTable)
- `../../core/types.js` (DebtItem)

Dış:
- `../helpers/output.js` (print)
- `../helpers/process.js` (resolveProjectRoot)
- `commander` (Command)
- `node:fs` (readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync)
- `node:path` (join)

## 4. Complexity
- 1 exported function (registerArchiveDebt)
- 2 private helper functions
- Cyclomatic: ~10 (db check, count flag, before filter, dryRun combinations)
- `getRotatedArchivePath` — while döngüsü ile rotation

## 5. Type Safety
- `opts: { dryRun?, count?, before?, maxArchiveSize? }` — implicit any (commander)
- `JSON.parse(d.metadata || '{}') as Record<string, unknown>` — casting
- `DebtItem['priority']` type assertion kullanılıyor — safe
- `meta.sprintsOpen as number` — unsafe cast; undefined olursa 0 döner (|| 0 ile) ✅

## 6. ADR Compliance
- ✅ ADR-001: ESM import
- ✅ ADR-009: DEBT.md Markdown Tablo Formatı — `DEBT_TABLE_HEADER` kullanılıyor
- ✅ Memory V2 DB-First: önce SQLite, yoksa file fallback
- ⚠️ ADR-008: `parseDebtTable`, `generateDebtTable` core/utils'dan import ediliyor — bu fonksiyonlar deprecated mi? CLAUDE.md'de "@deprecated" olarak işaretlenmiş mi?

## 7. Test Coverage
Test: `tests/cli/archive-debt.test.ts` beklenen:
- DB yokken file fallback
- DB varken DB-first okuma
- --dry-run
- --count
- --before filter
- Archive rotation

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
Yok.

## 10. Security Findings
- `appendFileSync(archivePath, archiveContent)` — archivePath getRotatedArchivePath'ten geliyor, kullanıcı input değil ✅
- `formatDebtRow` — string concat ile row oluşturuyor; | karakteri içeren description SQL injection değil ama Markdown parse bozabilir

## 11. Memory V2 Uyumu
✅ DB-first okuma: `store.getByType('debt')` → satır 43
✅ DB-first yazma: `store.upsert(...)` ile status güncelleme → satır 143-153
✅ File fallback: debtPath'ten `parseDebtTable` → satır 59-61
✅ `store.close()` finally bloğunda
⚠️ `writeFileSync(debtPath, generateDebtTable(unresolved))` — hâlâ dosyaya da yazıyor: "backward compat" yorumu var → bu V1 backward compat ne zaman kaldırılacak?
⚠️ `parseDebtTable` / `generateDebtTable` kullanımı — CLAUDE.md'de @deprecated olarak işaretlenmiş mi?

## 12. Öneriler
- **P1:** Backward compat dosya yazma kaldırılabilir (V3 Sprint?) — sadece DB kullanmak yeterli
- **P2:** `parseDebtTable` / `generateDebtTable` @deprecated annotation eklenebilir (zaten DB-first'e geçildi)
- `getRotatedArchivePath` — dosya boyutunu statSync ile okuyor: rotation threshold kullanıcı configüre edilebilir ✅ (maxArchiveSize flag var)

## 13. Verdict: ANALYZED
