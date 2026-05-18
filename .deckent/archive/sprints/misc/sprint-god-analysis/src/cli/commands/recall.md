# Analysis: src/cli/commands/recall.ts
**Task ID:** 142-017 | **Model:** opus | **LoC:** 54 | **Effort:** max

## 1. Amaci
`deckent recall <query>` CLI komutunu register eder. Kullanici proje hafizasinda (ADR, sprint learnings, patterns, debt) metin tabanli arama yapar. Memory V2 DB-first mimarinin kullanici-facing arayuzu. searchMemory() ile FTS5 dual-layer arama yapar. Sonuclari formatlayarak terminale yazdirir.

## 2. Public API
- `registerRecall(program: Command): void` — JSDoc YOK, sadece 1 export. Fonksiyon imzasi acik ama dokumantasyonu eksik.

## 3. Ic Bagimliliklar
- `../../core/memory-store.js` → MemoryStore (DB baglantisi)
- `../../core/memory-query.js` → searchMemory (FTS5 arama)
- `../../core/constants.js` → BRAIN_DIR, MEMORY_DB_FILE
- `../helpers/process.js` → resolveProjectRoot
- `../helpers/output.js` → print, printError
- Dongusel bagimllik riski: YOK — tamamen leaf-node, sadece core/ ve helpers/ import ediyor.

## 4. Dis Bagimliliklar
- `commander` (ADR-010 uyumlu — tek runtime dep)
- `node:path` (built-in)
- `node:fs` → existsSync (built-in)

## 5. Complexity
- 1 fonksiyon (registerRecall), 1 iç closure (action handler)
- Max cyclomatic: ~4 (if/for/if icinde snippet kontrolu)
- En karmasik bolum: satir 42-49 — sonuc iterasyonu + snippet formatlama

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- non-null `!`: 1 (satir 43: `results[i]!`) — guard ile korunmus (for loop bounds)
- Genel: IYI — opts parametresi implicit any degil, split/filter zinciri tipli

## 7. ADR Compliance
- ADR-006 spawnSync: N/A — spawnSync kullanmiyor
- ADR-008 brain import: UYUMLU — sadece core/ import, brain/tmux/worker import yok
- ADR-010 deps: UYUMLU — sadece commander + node built-in
- ADR-022 CLI/MCP parity: UYUMLU — `deckent_memory_query` MCP tool karsiligi mevcut
- ADR-033 product vision: N/A
- ADR-037 RBAC: N/A — CLI, scope enforcement yok
- ADR-039 self-modifying: N/A
- Memory V2 DB-first: UYUMLU — MemoryStore + searchMemory kullaniliyor, .md parse yok

## 8. Test Coverage
- Dedicated test dosyasi: **YOK** (tests/cli/commands/recall.test.ts mevcut degil)
- `tests/cli/commands.test.ts` icinde basit mock test olabilir ama izole test yok
- KRITIK GAP: Memory V2'nin kullanici-facing CLI'si test edilmemis

## 9. TODO/FIXME/HACK inventory
- Hicbir TODO, FIXME, HACK, XXX bulunamadi.

## 10. Dead Code
- Tum export'lar kullaniliyor (registerRecall tek export, entry.ts'den register ediliyor)
- Unused branch yok
- @deprecated isaret yok

## 11. Security
- Input validation: query string commander'dan geliyor (string garanti), opts.limit parseInt ile parse ediliyor
- SQL injection: MemoryStore/searchMemory FTS5 parametrized — GUvENLI
- Secret exposure: Yok — sadece print() ile sonuc gosteriyor
- Snippet'teki `>>>` / `<<<` ANSI escape sequence'e donusturuluyor (satir 46) — potansiyel terminal injection? Dusuk risk (user-owned data).

## 12. Memory V2 Uyumu
- TAMAMEN UYUMLU — DB-first: MemoryStore(dbPath) + searchMemory(store, {...})
- Eski .md parse kodu: YOK
- readFileSync kullanimi: YOK (sadece existsSync ile DB varlik kontrolu)

## 13. i18n
- Error mesaji hardcoded EN: "Memory V2 DB not found. Run `deckent memory migrate` first."
- Sonuc formatlama EN: "No results for", "result(s) for"
- getMessage() KULLANILMIYOR — i18n gap

## 14. Dokumantasyon Tutarliligi
- JSDoc: YOK — registerRecall fonksiyonunda JSDoc eksik
- CLI help description: "Search project memory..." — doğru
- DECKENT.md workflow referansi: `deckent recall` mevcut degil (sadece start/plan/status referansli)

## 15. Performance
- Sync I/O: existsSync (1 kez) — minimal
- MemoryStore acilis/kapanis her cagri icin yapiliyor (new MemoryStore → close) — dogru pattern
- Hot path degil — CLI one-shot komutu

## 16. Oneriler
- **P1:** Test eklenmeli — recall.test.ts (Memory V2 CLI'nin en onemli arayuzu test edilmemis)
- **P2:** i18n: getMessage() ile hata mesajlari cevrilmeli
- **P2:** JSDoc eklenmeli — registerRecall fonksiyonu
- **P3:** DECKENT.md workflow'da `deckent recall` adimi belirtilmeli

## Verdict: ANALYZED
