# Analysis: src/core/plugin-loader.ts
**Task ID:** 141-001 | **LoC:** 161

## 1. Amaci (1-2 cumle)
`.deckent/plugins/` dizinindeki plugin modul dosyalarini dinamik olarak yukler. Imza dogrulama, AST sandbox kontrol ve plugin metadata okuma saglar.

## 2. Public API (export listesi)
- `loadPlugin(pluginPath, requireSignature?): Promise<PluginModule>`
- `scanPluginsDir(pluginsDir): Promise<string[]>`
- `PluginModule` interface

## 3. Ic + Dis Bagimliliklar
- **Ic import:** `./plugin.js`, `./utils.js`
- **Node.js:** dynamic `import()`, `node:fs`

## 4. Complexity
- 3 fonksiyon, cyclomatic rough: 12

## 5. Type Safety
- `any`: 2 (dynamic import result)

## 6. ADR Compliance
- ADR-001 (ESM): UYUMLU
- `requireSignature` security: ADR-036 ile ilgili

## 7. Test Coverage
- `tests/core/plugin-loader.test.ts` MEVCUT olmali

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Imza dogrulama tam implement edilmis mi?

## 10. Security Findings
- Dynamic import — arbitrary code execution
- Imza dogrulama false default'u ile bypass edilebilir

## 11. Memory V2 Uyumu
- Dogrudan iliskisi yok

## 12. Oneriler
- SHA-256 imza dogrulama tam implementasyon dogrulanmali
- Sandbox isolation degerlendirilmeli (vm.Module)

## 13. Verdict: ANALYZED
