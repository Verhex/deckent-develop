# Analysis: src/orchestra/managed-docs/plugin-loader.ts
**Task ID:** 140-002 | **LoC:** 113

## 1. Amaci
Kullanıcı tanımlı section generator'larını `.deckent/generators/` dizininden yükler. JSON (declarative) ve MJS (executable) formatlarını destekler. JSON generator'lar güvenli (no-eval), MJS generator'lar async'tir ve production'da henüz aktif değildir.

## 2. Public API
- `loadUserGeneratorsSync(projectRoot): SectionGenerator[]` — JSON-only, production
- `loadUserGeneratorsAsync(projectRoot): Promise<SectionGenerator[]>` — JSON+MJS, CLI `--with-plugins`

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs` (existsSync, readdirSync, readFileSync, statSync)
- **Dis:** `node:path` (join)
- **Dis:** `../../core/utils.js` (debugLog)
- **Dis:** `../doc-updaters/types.js` (DocUpdateContext)
- **Dis:** `./types.js` (SectionGenerator)
- **Dis:** `./template-renderer.js` (renderTemplate)

## 4. Complexity
- 3 fonksiyon, cyclomatic ~8 (try/catch + file filter + format check)

## 5. Type Safety
- `JSON.parse(readFileSync) as JsonGeneratorSpec` — cast, ancak `specToGenerator` içinde null check var ✓
- `await import(fullPath) as { default?: SectionGenerator }` — dynamic import, runtime check mevcut ✓

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-030 (Plugin Loader):** tam implementasyon ✓
- Security note: "only load from trusted sources" — belgelenmis ✓

## 7. Test Coverage
- `tests/docs/plugin-loader.test.ts` bekleniyor — özellikle JSON format validation

## 8. TODO/FIXME/HACK inventory
- `// .mjs loading is async — intentionally not handled here.` — açık yorum ✓

## 9. Dead Code Candidates
- `loadUserGeneratorsAsync`: henüz CLI'ya bağlanmamış — `docs run --with-plugins` için ayrılmış

## 10. Security Findings
- **MJS dynamic import:** `await import(fullPath)` — `fullPath` user-controlled `.deckent/generators/` dizininden, local Node process'e kod çalıştırır
- Güvenlik notu mevcut ama prod'da kapalı ✓
- JSON format: no-eval, güvenli ✓

## 11. Memory V2 Uyumu
- Yok

## 12. Oneriler
- `loadUserGeneratorsAsync`'ı CLI'ya bağlamadan önce sandboxing değerlendir (vm.Script veya worker_threads)

## 13. Verdict: ANALYZED
