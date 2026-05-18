# Analysis: src/cli/commands/docs.ts
**Task ID:** 142-019 | **Model:** opus | **LoC:** 157 | **Effort:** max

## 1. Amaci
Managed document yonetim CLI komutlarini saglar. `deckent docs add|remove|list|update|run` alt komutlari ile sprint lifecycle icerisinde otomatik guncellenen dokumanlari yapilanidr. ADR-029/030/031 ile tanimlanan managed-docs pipeline'inin kullanici arayuzudur. Dokumanlar `.deckent/docs.json` config dosyasinda tanimlanir, autoSections/protectedSections ile granular kontrol saglar.

## 2. Public API
- `registerDocs(program: Command): void` — Commander'a docs alt komutlarini kayit et
- JSDoc: EKSIK. registerDocs dahil hicbir fonksiyon icin JSDoc yok.

## 3. Ic Bagimliliklar
- `../../orchestra/managed-docs/docs-config.js` — addDoc, removeDoc, loadDocsConfig, saveDocsConfig
- `../../orchestra/managed-docs/managed-doc-runner.js` — runManagedDocUpdates, buildStandaloneDocContext
- `../../orchestra/managed-docs/doc-cache.js` — clearDocCache
- `../helpers/output.js` — print, printError
- `../helpers/process.js` — resolveProjectRoot
- Dongusel bagimllik riski: YOK.

## 4. Dis Bagimliliklar
- `node:fs` — existsSync
- `node:path` — join
- `commander` — type import
- ADR-010 uyumu: UYUMLU.

## 5. Complexity
- Fonksiyon sayisi: 1 (registerDocs — 5 alt komut inline)
- En karmasik fonksiyon: `docs update` action (satir 93-126) — 4 option handling (addAuto, addProtect, removeAuto, maxLines) + config find + save
- Max cyclomatic complexity (rough): ~6
- Genel karmasiklik: DUSUK-ORTA. Her alt komut basit ve okunabilir.

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: YOK.
- `parseInt` (satir 26): `--max-lines` option commander'in parseInt callback'i ile parse ediliyor — UYGUN.
- Genel: MUKEMMEL.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A.
- **ADR-008 (brain import):** Uyumlu.
- **ADR-010 (deps):** Uyumlu.
- **ADR-022 (CLI/MCP parity):** UYUMLU — `deckent_docs` MCP tool mevcut (add/remove/list/run).
- **ADR-029 (managed-docs):** UYUMLU — bu CLI dosyasi ADR-029'un kullanici arayuzu.
- **ADR-030 (template engine):** UYUMLU — `runManagedDocUpdates` template engine'i tetikliyor.
- **ADR-031 (content hash cache):** UYUMLU — `clearDocCache` entegrasyonu mevcut (docs run --no-cache).

## 8. Test Coverage
- Dogrudan `tests/cli/commands/docs.test.ts` YOK.
- Managed-docs testleri `tests/orchestra/managed-docs/` altinda olabilir ama CLI wrapper testi EKSIK.
- Test gap: MEVCUT — registerDocs, add/remove/list/update/run action'lari test edilmemis.

## 9. TODO/FIXME/HACK inventory
Hicbir TODO, FIXME, HACK veya XXX isareti yok.

## 10. Dead Code
- Dead code: YOK. Tum alt komutlar aktif ve kullaniliyor.

## 11. Security
- File path validation (docs add): `existsSync(fullPath)` kontrolu var (satir 29). Path traversal: `join(root, filePath)` — `filePath` kullanici saglanan, `../` ile root disina cikmak mumkun. Ancak managed-docs pipeline'i daha sonra scope sinirlamasi yapabilir.
- `printError` string overload (satir 60): `printError` normalde Error objesi aliyor ama burada string geciyor — `printError('Not found: ...')`. Bu calisiyorsa printError string de kabul ediyor demek.
- Config mutation: `saveDocsConfig(root, config)` — dosya yazimi, yerel erisimde guvenli.

## 12. Memory V2 Uyumu
- N/A — Managed docs sistemi Memory V2'den bagimsiz calisir. Dokumanlar .deckent/docs.json config'inde, DB'de degil.

## 13. i18n
- Mesajlar HARDCODED INGILIZCE: "File not found", "Added:", "Removed:", "No managed documents configured", "Updated:", "No docs config found" vb.
- `getMessage()` KULLANILMIYOR.
- Emoji kullanimi: "✓" (checkmark) mesajlarda kullaniliyor (satir 47, 59, 125, 150). Bu tutarli i18n pattern ama stil tercihi.
- i18n gap: BUYUK.

## 14. Dokumantasyon Tutarliligi
- DECKENT.md MCP tool tablosunda `deckent_docs` mevcut: "Sprint lifecycle dokuman yonetimi (add/remove/list)" — UYUMLU.
- `docs update` ve `docs run` alt komutlari MCP tool'da var mi? MCP tool aciklamasi "add/remove/list" diyor — `update` ve `run` EKSIK olabilir.
- Genel: CLI ↔ MCP parity kismi — update/run gap.

## 15. Performance
- Sync I/O sayisi: existsSync x1 = **1 sync I/O** (docs add'de)
- Is mantigi managed-docs modullere delege ediliyor — bu dosyanin sync I/O etkisi minimal.
- `runManagedDocUpdates`: Bu cagrinin sync/async durumu managed-doc-runner'da — bu dosyada sync cagri yapiliyor.
- Hot path mi? HAYIR.

## 16. Oneriler
- **P2:** docs CLI icin test dosyasi olustur (registerDocs, add/remove/list/update/run).
- **P2:** Mesajlari getMessage'a tasi.
- **P2:** `docs add` path validation'i guclendir — root disina cikan path'leri reddet.
- **P3:** MCP `deckent_docs` tool'unu update/run alt komutlarini da kapsayacak sekilde genislet (ADR-022 parity).
- **P3:** JSDoc ekle — en azindan registerDocs icin.
- **P3:** printError string overload kullanimi: `printError(new Error('Not found: ...'))` seklinde duzeltilebilir (tutarlilik).

## Verdict: ANALYZED
