# Analysis: src/cli/commands/config.ts
**Task ID:** 142-018 | **Model:** opus | **LoC:** 269 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
`deckent config` CLI komutunu kaydeder. Proje konfigürasyonunu oku/yaz/liste/migrate işlevleri sunar. 7 alt komut barındırır: varsayılan gösterim, `set`, `get`, `export`, `import`, `list`, `keys`, `migrate`. Brain ve kullanıcılar tarafından konfigürasyon yönetimi için kullanılır. JSON yorumları (block + line) strip ederek toleranslı parse yapar.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `exportConfig(configPath: string, outputFile?: string): void` — JSDoc VAR ✓
- `importConfig(importPath: string, configPath: string): void` — JSDoc VAR ✓
- `registerConfig(program: Command): void` — JSDoc YOK ✗ (register pattern'ın convention'ı, kabul edilebilir)
- `stripJsonComments(text: string): string` — private, JSDoc VAR ✓

## 3. İç Bağımlılıklar (import chain listesi, döngüsel bağımlılık riski var mı?)
- `../../core/types.js` → DeckentConfig type
- `../../core/constants.js` → PROJECT_CONFIG_PATH
- `../../core/config.js` → loadConfig, validatePartialConfig, ConfigValidationError, deepMerge, CONFIG_METADATA, listConfigByCategory
- `../../core/config-migration.js` → migrateConfig, setNestedValue, getNestedValue (static + dynamic import)
- `../../core/errors.js` → ErrorRegistry
- `../helpers/output.js` → print, printError
- `../helpers/process.js` → resolveProjectRoot
- **Döngüsel bağımlılık riski: YOK** — CLI → core yönlü, tek yönlü

## 4. Dış Bağımlılıklar (node_modules, native modül — ADR-010 uyumu)
- `commander` (Command type) — ADR-010 izinli tek runtime dependency ✓
- `node:fs` (readFileSync, writeFileSync, existsSync) — native ✓
- `node:path` (join) — native ✓
- **ADR-010 uyumu: TAM** ✓

## 5. Complexity (fonksiyon sayısı, max cyclomatic rough, en karmaşık fonksiyon adı + satır no)
- 10 fonksiyon (stripJsonComments, exportConfig, importConfig, registerConfig + 7 action handlers)
- En karmaşık: `registerConfig` action handler (satır 75-106) — config auto-migration + loadConfig + JSON print — cyclomatic ~5
- Genel karmaşıklık: ORTA

## 6. Type Safety (any sayısı, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast — SATIR NUMARALARIYLA)
- `as unknown as Record<string, unknown>` — satır 155 (`config get` action'da getNestedValue çağrısı). Gerekli: DeckentConfig → Record dönüşümü. Kabul edilebilir.
- `as Record<string, unknown>` — satır 51, 60, 90, 118, 132 — JSON.parse dönüş tipi. Standart pattern.
- `as Partial<DeckentConfig>` — satır 118 — JSON.parse sonrası. Standart.
- **any: 0** ✓
- **@ts-ignore: 0** ✓
- **@ts-expect-error: 0** ✓
- **non-null !: 0** ✓

## 7. ADR Compliance
- **ADR-006 spawnSync:** Kullanmıyor — N/A ✓
- **ADR-008 brain import:** Brain import yok — CLI → core only ✓
- **ADR-010 deps:** Sadece commander + native ✓
- **ADR-022 CLI/MCP parity:** MCP karşılığı `src/mcp/tools/config.ts` MEVCUT ✓. CLI: read, set, get, export, import, list, keys, migrate. MCP: action="read"|"set". **GAP: MCP'de export/import/list/keys/migrate alt komutları YOK** — kısmi parity.
- **ADR-033 product vision:** N/A
- **ADR-037 RBAC:** N/A
- **ADR-039 self-modifying:** N/A
- **Memory V2 DB-first:** Config modülü memory kullanmıyor — N/A ✓

## 8. Test Coverage
- `tests/cli/commands/config.test.ts` — MEVCUT ✓
- `tests/cli/commands/config-export.test.ts` — MEVCUT ✓ (export/import alt komutları)
- `tests/cli/commands/config-overhaul.test.ts` — MEVCUT ✓
- `tests/cli/commands/config-nested.test.ts` — MEVCUT ✓ (nested get/set)
- **Kapsam: İYİ** — 4 test dosyası, export/import/nested/overhaul

## 9. TODO/FIXME/HACK inventory
- **YOK** ✓ — Temiz

## 10. Dead Code
- `stripJsonComments` fonksiyonu hem exportConfig hem importConfig tarafından kullanılıyor ✓
- Tüm export'lar kullanımda
- **Dead code: YOK** ✓

## 11. Security
- `stripJsonComments` regex: ReDoS riski düşük (basit pattern'lar)
- `JSON.parse` çağrıları try/catch ile sarmalanmış ✓
- `validatePartialConfig` import öncesi çalışıyor — untrusted JSON'dan koruma ✓
- Dosya yolları kullanıcıdan geliyor (export/import) — path traversal riski: `join(root, ...)` ile sınırlı ama doğrudan `file` parametresi export/import'ta kullanılıyor (satır 171, 188). **P2: import/export file parametresi root dışına çıkabilir**

## 12. Memory V2 Uyumu
- Config modülü memory sistemi kullanmıyor — N/A
- **Uyum: TAM** ✓

## 13. i18n
- Hata mesajları İngilizce hardcoded: "Config file not found", "Invalid JSON", "Set X = Y", "Config is already up to date" vb.
- `messages.ts` helper kullanılmıyor — **GAP: i18n desteği yok**
- **P3: Tüm kullanıcı-facing mesajlar hardcoded EN**

## 14. Dokümantasyon Tutarlılığı
- JSDoc: exportConfig, importConfig, stripJsonComments — MEVCUT ✓
- registerConfig: JSDoc yok ama register pattern convention
- DECKENT.md'de `deckent_config` MCP tool dokümante: `action: "read"` veya `action: "set"` — CLI'daki 7 alt komut ile MCP'deki 2 action arasında belge tutarsızlığı

## 15. Performance
- `readFileSync` × 5 çağrı (configPath okuma) — her action'da ayrı okuma
- `loadConfig` async (satır 99, 154) — disk + merge işlemi
- Auto-migration her `config` çağrısında çalışıyor (satır 88-97) — gereksiz olabilir ama non-fatal catch ile sarmalanmış
- **Hot path değil** — kullanıcı CLI komutu

## 16. Öneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
1. **P2:** import/export file parametresinde path traversal koruması ekle (root dizin dışına yazma/okuma önleme)
2. **P3:** ADR-022 gap — MCP config tool'a export/import/list/keys/migrate alt action'ları ekle
3. **P3:** i18n — messages.ts üzerinden dil desteği ekle
4. **P3:** Auto-migration'ı config set/get'te değil, sadece `config` (no subcommand) çağrısında çalıştır

## Verdict: ANALYZED
