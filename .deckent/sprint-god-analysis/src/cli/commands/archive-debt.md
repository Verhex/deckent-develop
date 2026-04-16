# Analysis: src/cli/commands/archive-debt.ts
**Task ID:** 142-017 | **Model:** opus | **LoC:** 200 | **Effort:** max

## 1. Amaci
`deckent archive-debt` CLI komutunu register eder. Cozulmus (resolved) teknik borc kalemlerini DEBT.md'den arsiv dosyasina (DEBT-ARCHIVE.md) tasir. DB-first: oncelik SQLite'tan okur, fallback DEBT.md parse. --dry-run, --count, --before (sprint filtre), --max-archive-size (rotation) destekler. Memory V2 ile hibrit calisan tek CLI komut — hem DB update hem dosya rewrite yapar.

## 2. Public API
- `registerArchiveDebt(program: Command): void` — JSDoc YOK. Tek export.
- `formatDebtRow(r: DebtItem): string` — private, modul icinde
- `getRotatedArchivePath(archiveDir, maxSizeBytes): string` — private

## 3. Ic Bagimliliklar
- `../../core/constants.js` → BRAIN_DIR, DEBT_FILE, ARCHIVE_DIR, DEBT_TABLE_HEADER, MEMORY_DB_FILE
- `../../core/utils.js` → parseDebtTable, generateDebtTable — **V1 fonksiyonlari hala kullaniliyor!**
- `../../core/memory-store.js` → MemoryStore
- `../../core/types.js` → DebtItem (type only)
- `../helpers/output.js` → print
- `../helpers/process.js` → resolveProjectRoot
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- `commander` (ADR-010)
- `node:fs` (readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync)
- `node:path`

## 5. Complexity
- 3 fonksiyon (registerArchiveDebt, formatDebtRow, getRotatedArchivePath)
- Max cyclomatic: ~10 (action handler — count/dryRun/before/normal flow 4-way branch)
- En karmasik: satir 27-177 — action handler, 4 ana akis + DB/file dual-write

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- non-null `!`: 0
- `JSON.parse(d.metadata || '{}') as Record<string, unknown>` — guvenli fallback
- `(d.priority?.toUpperCase() ?? 'NORMAL') as DebtItem['priority']` — runtime'da gecersiz priority olabilir (ornegin 'UNKNOWN' → DebtItem union'a uymaz) — **P3 type safety gap**

## 7. ADR Compliance
- ADR-006: N/A
- ADR-008: UYUMLU — sadece core/ import
- ADR-010: UYUMLU
- ADR-022 CLI/MCP parity: KISMI — MCP'de archive-debt karsiligi YOK
- Memory V2 DB-first: HIBRIT:
  - DB'den okuma: store.getByType('debt') — DOGRU
  - DB'ye yazma: store.upsert() — DOGRU
  - **AMA:** `writeFileSync(debtPath, generateDebtTable(unresolved))` satir 156 — DEBT.md dosyasini da yeniden yaziyor — "backward compat" icin. Bu V1 fallback'i koruyor.
  - `parseDebtTable` ve `generateDebtTable` V1 fonksiyonlari hala import ediliyor (utils.js)

## 8. Test Coverage
- `tests/cli/commands/archive-debt.test.ts` — MEVCUT
- Kapsam: Temel arsivleme akisi, --before filtre, --count, --dry-run test edilmis olmasi beklenir.

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- YOK — tum fonksiyonlar aktif

## 11. Security
- JSON.parse(d.metadata || '{}') — malformed metadata sessizce bos obje ile degistirilir, crash riski yok
- appendFileSync ile arsiv yaziliyor — yerel dosya, risk dusuk
- getRotatedArchivePath: while loop ile dosya boyutu kontrolu — sonsuz dosya olusturma riski: DUSUK (pratik limitler icinde)

## 12. Memory V2 Uyumu
- HIBRIT — DB-first + file dual-write:
  - DB okuma: DOGRU (store.getByType('debt'))
  - DB yazma: DOGRU (store.upsert())
  - Dosya yazma: DEBT.md rewrite (satir 156) — V1 backward compat
  - **BULGU:** `parseDebtTable` ve `generateDebtTable` V1 fonksiyonlari hala import ediliyor — bunlar src/core/utils.ts'de, Memory V2 sonrasi deprecated olmasi gerekir ama hala aktif kullaniliyor

## 13. i18n
- Tum mesajlar hardcoded EN: "No resolved debt items to archive", "Would archive", "Archived..."
- getMessage() KULLANILMIYOR

## 14. Dokumantasyon Tutarliligi
- JSDoc: YOK
- CLI help: "Archive resolved debt items from .brain/DEBT.md" — dogru ama DB-first bahsetmiyor
- Option help'leri acik: --dry-run, --count, --before, --max-archive-size

## 15. Performance
- Sync I/O: readFileSync (1-2), writeFileSync (2), existsSync (4), mkdirSync (1), appendFileSync (1), statSync (rotation) = ~10 sync cagri
- DB acilis/kapanis 2 kez (okuma + yazma) — tek MemoryStore instance ile optimize edilebilir
- getRotatedArchivePath while loop: statSync her iterasyonda — dosya sayisi arttikca yavaslar (ama pratikte <10 arsiv dosyasi beklenir)

## 16. Oneriler
- **P1:** `parseDebtTable`/`generateDebtTable` V1 fonksiyonlarini birakip tamamen DB-first gecis yapilmali
- **P1:** DEBT.md dual-write strategy'si acikca dokumante edilmeli — ne zaman kaldirilacak?
- **P2:** i18n: getMessage() ile mesajlar
- **P2:** DB 2 kez acilip kapatiliyor — tek instance ile birlestir
- **P2:** ADR-022: MCP'de archive-debt karsiligi eklenmeli
- **P3:** priority cast type safety — runtime validation eklenebilir

## Verdict: ANALYZED
