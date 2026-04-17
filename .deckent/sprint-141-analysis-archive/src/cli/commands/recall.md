# Analysis: src/cli/commands/recall.ts
**Task ID:** 141-003 | **LoC:** 54

## 1. Amacı
Memory V2 DB-first arama CLI komutunu uygular. `deckent recall <query>` ile proje hafızasında FTS5 arama yapar.

## 2. Public API (export listesi)
- `registerRecall(program: Command): void` — commander program'a recall komutunu register eder

## 3. İç + Dış Bağımlılıklar
İç:
- `../../core/memory-store.js` (MemoryStore)
- `../../core/memory-query.js` (searchMemory)
- `../../core/constants.js` (BRAIN_DIR, MEMORY_DB_FILE)

Dış:
- `../helpers/process.js` (resolveProjectRoot)
- `../helpers/output.js` (print, printError)
- `commander` (Command)
- `node:path` (join)
- `node:fs` (existsSync)

## 4. Complexity
- 1 exported function (registerRecall)
- 1 action handler
- Cyclomatic: ~3 (db check, results check, loop)

## 5. Type Safety
- `r.entry` erişimi: `results[i]!` non-null assertion kullanılmış (satır 43)
- `opts` parametresi untyped — implicit any risk var (commander action opts)
- `parseInt(opts.limit, 10) || 5` — NaN fallback doğru ancak 0 girilirse 5'e fallback yapıyor (edge case)

## 6. ADR Compliance
- ✅ ADR-001: ESM import (`node:path`, `node:fs`)
- ✅ ADR-008: memory-store, memory-query, constants'dan doğrudan import — brain'den import yok
- ✅ ADR-010: Tek runtime dependency (commander)
- ✅ Memory V2 DB-First: MemoryStore + searchMemory kullanılıyor, .md parse yok

## 7. Test Coverage
Test dosyası: `tests/cli/recall.test.ts` — varlığı doğrulanmadı
Kapsam: DB yokken hata mesajı, sonuç bulunamadığında mesaj, snippet gösterimi

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
Yok.

## 10. Security Findings
- FTS5 arama parametresi doğrudan kullanıcıdan geliyor. searchMemory içinde parametreli sorgu kullanılıyorsa güvenli; içeride SQL injection riski var mı kontrol edilmeli (memory-query.ts'a bağlı).
- `opts.limit` parseInt ile parse ediliyor — NaN kontrolü var (|| 5)

## 11. Memory V2 Uyumu
✅ Tam DB-first: MemoryStore açılıyor, FTS5 arama yapılıyor, kapatılıyor.
✅ Eski .md parse kodu yok.
✅ `store.close()` finally bloğunda çağrılıyor.

## 12. Öneriler
- `opts` parametresine explicit tip eklenebilir (interface RecallOpts)
- `parseInt(opts.limit, 10) || 5` → `Math.max(1, parseInt(opts.limit, 10) || 5)` daha güvenli
- `--json` flag eklenebilir (MCP parity)
- Sprint filter için `--sprint-max` desteği henüz yok

## 13. Verdict: ANALYZED
