# Analysis: src/mcp/tools/init.ts
**Task ID:** 142-024 | **Model:** opus | **LoC:** 290 | **Effort:** max

## 1. Amacı
Deckent projesini initialize eden MCP tool. `deckent_init` olarak kayıtlı. .deckent/, .brain/, .tasks/, .locks/, .claude/rules/ dizinlerini oluşturur, config.json yazar, DECKENT.md/CLAUDE.md/DIRECTIVES.md şablonlarını üretir, brain dosyalarını başlatır, i18n mesajlarını kopyalar, .gitignore'u günceller, MCP auto-registration yapar. 290 satır ile batch'teki en büyük dosya. Tüm ortamlarda (Claude Code, Cursor, VS Code) ilk kurulum için çağrılır.

## 2. Public API
- `registerInitTool(server: McpServer): void` — tek export
- JSDoc: **YOK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → 15+ sabit (DECKENT_DIR, BRAIN_DIR, TASKS_DIR, vb.)
- `../../core/analyzer.js` → analyzeProject() (proje stack tespiti)
- `../../orchestra/sprint-reporter.js` → generateProjectIdentity()
- `../../core/utils.js` → ensureDeckentImport()
- `../helpers/enrich.js` → enrichResponse()
- `../../orchestra/managed-docs/docs-config.js` → loadDocsConfig(), saveDocsConfig()
- Döngüsel bağımlılık riski: **DÜŞÜK** — orchestra/ ve core/ arasında tek yönlü

## 4. Dış Bağımlılıklar
- `node:fs` (writeFileSync, mkdirSync, readFileSync, existsSync) — Node built-in
- `node:path` (join) — Node built-in
- `zod/v4` — schema validation
- `@modelcontextprotocol/sdk` — MCP SDK (type-only)
- ADR-010 uyumu: ✅

## 5. Complexity
- Fonksiyon sayısı: 5 (ensureDir, writeIfNotExists, generateToolsContent, appendToGitignore, registerInitTool)
- Max cyclomatic: ~12 (registerInitTool handler — çok sayıda if/try-catch branch)
- En karmaşık fonksiyon: registerInitTool handler (satır 72-287) — **tek fonksiyon içinde 215 satır**
- **P2**: Handler fonksiyonu çok uzun, phase'lere bölünmeli

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0 (satır 101'de `mode as PlanMode` — güvenli cast, PlanMode enum)
- Non-null `!`: 0
- `as Record<string, string>` satır 34: ✅ güvenli — package.json scripts her zaman string→string
- `as Record<string, unknown>` satır 104, 257: ✅ kabul edilebilir

## 7. ADR Compliance
- **ADR-006 spawnSync**: N/A — spawn kullanmıyor
- **ADR-008 brain import**: ⚠️ `../../orchestra/sprint-reporter.js` ve `../../orchestra/managed-docs/docs-config.js` import ediyor. init.ts bir MCP tool — brain değil. ADR-008 kuralı "Brain dışında orchestra/ import eden var mı?" — MCP tools orchestration'ın bir parçası olarak kabul edilebilir ama sıkı yorumlamada soru işareti.
- **ADR-010 deps**: ✅
- **ADR-022 CLI/MCP parity**: ✅ CLI `deckent init` komutu ile paralel. Parametre uyumu: projectName, mode, language, force — eşleşiyor. `auto` parametresi MCP'de `void auto` ile görmezden geliniyor — **P3** dead param.
- **ADR-033 product vision**: ✅
- **Memory V2 DB-first**: ⚠️ Init sırasında Memory DB oluşturulmuyor. Brain dosyaları (.md formatında) yazılıyor (MEMORY.md, DECISIONS.md, DEBT.md, PATTERNS.md, RETRO.md). Bu doğru davranış — init .md template'lerini yazar, DB oluşturma migration step'inde yapılır. **Ancak**: DECKENT.md template'inde `@.brain/MEMORY.md` referansı var (satır 139) — bu Memory V2 sonrası `@.brain/exports/summary.md` olmalı.
- **P1**: DECKENT.md template'i stale — `@.brain/MEMORY.md` yerine `@.brain/exports/summary.md` olmalı

## 8. Test Coverage
- tests/mcp/tools/init.test.ts: **MEVCUT** ✅
- Template içerikleri (@ referanslar) test ediliyor mu? Muhtemelen hayır — doğrulanmalı

## 9. TODO/FIXME/HACK Inventory
- **YOK** — temiz

## 10. Dead Code
- `auto` parametresi: satır 75 `void auto;` — parametre kabul ediliyor ama kullanılmıyor. **P3 dead param**
- `writeIfNotExists` helper: kullanılıyor ✅
- `ensureDir` helper: kullanılıyor ✅

## 11. Security
- **.claude/settings.json yazma**: satır 250-264 — MCP server auto-registration yapıyor. `deckent-mcp` komutunu çalıştırmaya izin veriyor. Güvenli — kullanıcı zaten init çalıştırıyor.
- **package.json okuma**: satır 31 — try-catch ile korunuyor
- **Path traversal**: `root = process.cwd()` — sabit, kullanıcı kontrollü değil. ✅ GÜVENLİ
- **.gitignore yazma**: appendToGitignore mevcut içeriği okuyup append eder — race condition riski düşük (tek thread MCP)

## 12. Memory V2 Uyumu
- ⚠️ **KISMEN UYUMLU**: Init sırasında .md template'leri yazılıyor (doğru — migration sonra yapılır). Ancak DECKENT.md template'i `@.brain/MEMORY.md` referansı içeriyor — bu V2 sonrası `@.brain/exports/summary.md` olmalı.
- brain.md template (satır 165): Memory V2 kuralları **YOK** — eski template. "Update MEMORY.md after every sprint (max 200 lines)" — V2'de bu DB'ye yazılıyor.
- auditor.md template (satır 166): Eski template, DB-first kuralları yok
- worker-default.md template (satır 167): Eski template, ADR injection kuralı yok

## 13. i18n
- i18n mesajları: satır 222-239 — en.json ve tr.json template'leri yazılıyor ✅
- Hardcoded İngilizce: Tool description, DECKENT.md template, brain rules — uygun (konfigürasyon dosyaları)
- `language` parametresi: 'en' | 'tr' — enrichResponse'a geçiriliyor ✅

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Detaylı ve doğru
- annotations: readOnlyHint=false, destructiveHint=false, idempotentHint=true — ✅ DOĞRU (re-run güvenli)
- DECKENT.md MCP tool tablosunda `deckent_init` listeleniyor — ✅
- **P1**: Template'lerdeki Memory V2 referansları stale (brain.md, auditor.md, worker-default.md, DECKENT.md `@.brain/MEMORY.md`)

## 15. Performance
- Sync I/O: writeFileSync (çok sayıda), readFileSync (3), existsSync (5+), mkdirSync (9)
- **18 sync I/O çağrısı** — init bağlamında kabul edilebilir (tek seferlik işlem)
- Hot path değil ✅

## 16. Öneriler
- **P1**: DECKENT.md template'ini güncellenip `@.brain/MEMORY.md` → `@.brain/exports/summary.md` olmalı
- **P1**: claude/rules/ template'leri (brain.md, auditor.md, worker-default.md) Memory V2 DB-first kurallarıyla güncellenmeli
- **P2**: Handler fonksiyonu 215 satır — fase'lere (dirs, config, templates, gitignore, mcp-reg) bölünmeli
- **P3**: `auto` parametresi kullanılmıyor — kaldırılmalı veya implement edilmeli

## Verdict: ANALYZED
