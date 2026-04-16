# Analysis: src/cli/commands/plugin.ts
**Task ID:** 142-019 | **Model:** opus | **LoC:** 243 | **Effort:** max

## 1. Amaci
Plugin yonetim CLI komutlarini saglar. `deckent plugin install|remove|update|list|info|test|create` alt komutlarini kayit eder. Plugin'ler `.deckent/plugins/` altinda saklanir. Plugin sistemi skill'lerden farkli bir soyutlama katmani sunarak manifest.json + entrypoint tabanli genisletilebilirlik saglar. `core/plugin.js` modulu ile entegre calisir (asil is mantigi orada).

## 2. Public API
- `registerPlugin(program: Command): void` — Commander'a plugin alt komutlarini kayit et
- JSDoc: EKSIK. Hicbir fonksiyon icin JSDoc yok. registerPlugin dahil.

## 3. Ic Bagimliliklar
- `../../core/plugin.js` — loadPlugin, scanPlugins, createPlugin, installPlugin, removePlugin, listPlugins
- `../helpers/output.js` — print, printError
- `../helpers/process.js` — resolveProjectRoot
- Dongusel bagimllik riski: YOK.

## 4. Dis Bagimliliklar
- `node:path` — join, resolve
- `node:fs` — existsSync, readFileSync
- `node:child_process` — spawnSync (import edilmis ama KULLANILMIYOR — `plugin test` komutunda `spawnSync` yerine `npm test` stdio: 'inherit' ile cagriliyor, HAYIR — satir 184'te spawnSync cagriliyor)
- `commander` — type import
- ADR-010 uyumu: UYUMLU.

## 5. Complexity
- Fonksiyon sayisi: 1 (registerPlugin — tum alt komutlar icinde inline)
- En karmasik fonksiyon: `plugin test` action (satir 144-212) — manifest validation + entrypoint check + npm test
- Max cyclomatic complexity (rough): ~5 (test komutu, field validation loop + entrypoint check + npm test)
- Genel karmasiklik: DUSUK-ORTA. Is mantigi cogunlukla `core/plugin.js`'e delege ediliyor.

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: `JSON.parse(readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> }` (satir 181) — catch icinde, kabul edilebilir.
- `_opts` prefix (satir 19): `force` option alinmis ama install action'da `installPlugin`'e gecirilmiyor. Bu bir bug olabilir — `--force` flag'i etkisiz.
- Genel: IYI.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Kullaniliyor (satir 184) — `npm test` icin spawnSync, timeout 30s. UYUMLU.
- **ADR-008 (brain import):** Uyumlu.
- **ADR-010 (deps):** Uyumlu.
- **ADR-022 (CLI/MCP parity):** EKSIK. Plugin yonetimi icin hicbir MCP tool yok.
- **ADR-033:** Uyumlu.
- **Memory V2 DB-first:** N/A — plugin'ler DB kapsami disinda.

## 8. Test Coverage
- `tests/cli/commands/plugin.test.ts` — MEVCUT
- `tests/cli/commands/plugin-create.test.ts` — MEVCUT
- `tests/cli/commands/plugin-improvements.test.ts` — MEVCUT
- Test eslesmesi: IYI — 3 test dosyasi.

## 9. TODO/FIXME/HACK inventory
Hicbir TODO, FIXME, HACK veya XXX isareti yok.

## 10. Dead Code
- `_opts` (satir 19): `force` option alinmis ama `installPlugin`'e gecirilMIYOR. `--force` flag'i CLI'da kabul ediliyor ama etkisi yok. Bu ya dead option ya da bir bug.
- `listPlugins` import (satir 5): Yalnizca `plugin create` conflict detection'da kullaniliyor (satir 226) — aktif.
- Genel: `--force` flag disi dead code yok.

## 11. Security
- Plugin install: `installPlugin(source, pluginsDir)` — is mantigi `core/plugin.js`'de. CLI katmaninda ek validation yok.
- Plugin test: `spawnSync('npm', ['test'], { cwd: pluginDir, stdio: 'inherit', timeout: 30_000 })` — timeout var, cwd sinirli. UYGUN.
- Plugin info: `resolve(process.cwd(), dir)` — kullanici saglanan path, dogrudan loadPlugin'e geciliyor. Path traversal mumkun ama bu kasitli (kullanici zaten filesystem erisimi var).
- OWASP: Risk dusuk — is mantigi core/plugin.js'de.

## 12. Memory V2 Uyumu
- N/A — Plugin sistemi DB kapsami disinda.

## 13. i18n
- Tum mesajlar HARDCODED INGILIZCE: "Plugin installed successfully", "Plugin not found", "PASS", "FAIL" vb.
- `getMessage()` kullanilmiyor.
- i18n gap: BUYUK.

## 14. Dokumantasyon Tutarliligi
- JSDoc: TAMAMEN EKSIK.
- DECKENT.md'de plugin sistemi listelenmis mi? HAYIR — plugin sistemi DECKENT.md'de bahsedilmiyor. CLI 40+ komut arasinda "plugin" kapsam disi olabilir veya dokumantasyon gap'i.

## 15. Performance
- Sync I/O sayisi: existsSync x4, readFileSync x1, spawnSync x1 = **6 sync I/O**
- Hot path mi? HAYIR.
- Is mantigi core/plugin.js'e delege edildigi icin bu dosyanin performans etkisi minimal.

## 16. Oneriler
- **P1 (BUG):** `_opts.force` (satir 19) install action'da `installPlugin`'e gecirilmiyor. Ya `--force` flag'ini `installPlugin`'e pass et ya da komutu kaldir.
- **P2:** JSDoc ekle — en azindan `registerPlugin` icin.
- **P2:** Mesajlari i18n `getMessage()` uzerinden gecir.
- **P3:** DECKENT.md'ye plugin sistemi dokumantasyonu ekle.
- **P3:** ADR-022 — plugin MCP tool'lari dusunulabilir.

## Verdict: ANALYZED
