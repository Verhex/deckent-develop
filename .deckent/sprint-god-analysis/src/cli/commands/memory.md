# Analysis: src/cli/commands/memory.ts
**Task ID:** 142-017 | **Model:** opus | **LoC:** 124 | **Effort:** max

## 1. Amaci
`deckent memory` alt-komut grubunu register eder. 3 alt-komut: `rebuild` (exports → DB), `export` (DB → exports), `stats` (DB istatistikleri). Memory V2 yasam dongusunun admin arayuzu. DB yikildiginda rebuild ile yeniden olusturma, periyodik export ile .md snapshot'lari uretme, ve durum izleme saglar.

## 2. Public API
- `registerMemory(program: Command): void` — JSDoc YOK. Tek export.

## 3. Ic Bagimliliklar
- `../../core/memory-store.js` → MemoryStore
- `../../core/memory-import.js` → parseDecisionsMd, parseMemoryMd, parseDebtMd
- `../../core/memory-export.js` → exportSummaryMd, exportDecisionsMd, exportMemoryMd, exportDebtMd
- `../../core/constants.js` → BRAIN_DIR, MEMORY_DB_FILE, MEMORY_EXPORTS_DIR
- `../helpers/process.js` → resolveProjectRoot
- `../helpers/output.js` → print, printError
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- `commander` (ADR-010)
- `node:path`, `node:fs` → existsSync, readFileSync, writeFileSync, mkdirSync (built-in)

## 5. Complexity
- 1 register fonksiyonu + 3 action closure (rebuild, export, stats)
- Max cyclomatic: ~5 (rebuild icinde 3 if + fallback)
- En karmasik: rebuild action — 3 kaynak dosya + fallback original DECISIONS.md

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- non-null `!`: 0
- `store.countByType()` Map donuyor — for...of ile iterate ediliyor — tip guvenli
- `store.getSchemaVersion()` — number donuyor — tip guvenli

## 7. ADR Compliance
- ADR-008: UYUMLU — sadece core/ import
- ADR-010: UYUMLU
- ADR-022 CLI/MCP parity: KISMI — MCP'de memory_query var ama rebuild/export/stats yok
- Memory V2 DB-first: UYUMLU — rebuild ve export tamamen DB tabanli
- **DIKKAT:** rebuild satir 59-64: "Also try original .brain/ files as secondary source" — eski DECISIONS.md'yi fallback olarak okuyor. Bu V1 compatibility kodu — DB yokken rebuild icin makul ama acikca dokumante edilmeli.

## 8. Test Coverage
- Dedicated test dosyasi: **YOK** (tests/cli/commands/memory.test.ts mevcut degil)
- KRITIK GAP: DB rebuild ve export test edilmemis

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- YOK — tum 3 alt-komut aktif

## 11. Security
- readFileSync ile .brain/ dosyalari okunuyor — yerel dosya, risk dusuk
- writeFileSync ile exports/ yaziliyor — yerel dosya
- SQL injection: MemoryStore parametrized — GUVENLI
- mkdirSync recursive: path traversal riski yok (join ile olusturuluyor)

## 12. Memory V2 Uyumu
- DB-first: UYUMLU — rebuild parseDecisionsMd/parseMemoryMd/parseDebtMd + store.insert
- Export: exportSummaryMd/exportDecisionsMd/exportMemoryMd/exportDebtMd + writeFileSync
- **BULGU:** rebuild sırasında eski .brain/DECISIONS.md fallback (satir 59-64) — V1 compatibility davranisi, tehlikeli degil ama stale olabilir

## 13. i18n
- Error mesajlari hardcoded EN: "memory.db already exists", "No exports directory found"
- Cikti EN: "ADRs:", "Memory:", "Debt:", "Rebuilt memory.db with..."
- getMessage() KULLANILMIYOR

## 14. Dokumantasyon Tutarliligi
- JSDoc: YOK
- CLI help: "Memory V2 management" — dogru
- Alt-komut help'leri acik: "Rebuild", "Export", "Show statistics"
- DECKENT.md'de `deckent memory rebuild|export|stats` referansi mevcut — UYUMLU

## 15. Performance
- Sync I/O: readFileSync (3), writeFileSync (4), existsSync (6), mkdirSync (1) = 14 sync cagri
- rebuild: O(n) entry insert — buyuk DB'lerde yavas olabilir (batch insert ile optimize edilebilir)
- export: 4 dosya yaziliyor — I/O bound ama one-shot

## 16. Oneriler
- **P1:** Test eklenmeli — memory.test.ts (rebuild roundtrip, export dogrulugu, stats ciktisi)
- **P2:** i18n: getMessage() ile mesajlar
- **P2:** rebuild batch insert optimizasyonu (DB.transaction wrapper)
- **P3:** rebuild fallback (eski DECISIONS.md) kodunu deprecated olarak isaretle
- **P3:** ADR-022: MCP'de memory_rebuild, memory_export tool'lari eklenebilir

## Verdict: ANALYZED
