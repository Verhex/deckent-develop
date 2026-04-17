# Analysis: src/mcp/tools/init.ts
**Task ID:** 141-004 | **LoC:** 289

## 1. Amaci

`deckent_init` MCP tool — yeni bir Deckent projesini baslatir. Tum dizinleri, config dosyalarini, `.brain/` dosyalarini, `CLAUDE.md` referanslarini olusturur ve `.claude/settings.json`'a MCP auto-registration ekler.

## 2. Public API

```typescript
export function registerInitTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  root: z.string().optional(),           // proje koku
  projectName: z.string().optional(),    // proje adi
  template: z.string().optional(),       // init template
  force: z.boolean().optional(),         // mevcut dosyalari uzerine yaz
}
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `core/types.js` — ProjectConfig, BrainConfig
- `core/constants.js` — cok sayida (BRAIN_DIR, TASKS_DIR, LOCKS_DIR, DECKENT_DIR, DIRECTIVES_FILE, vb.)
- `core/analyzer.js` — analyzeProject() (stack tespiti)
- `orchestra/sprint-reporter.js` — generateProjectIdentity() [ADR-008 concern]
- `core/utils.js` — ensureDeckentImport()
- `helpers/enrich.js` — enrichContext()
- `orchestra/managed-docs/docs-config.js` — initializeManagedDocs()

## 4. Complexity

- 1 ana async handler + 4 helper:
  - `ensureDir(p)` — mkdirSync recursive
  - `writeIfNotExists(p, content)` — idempotent dosya yazma
  - `generateToolsContent(version)` — string template
  - `appendToGitignore(root, patterns)` — additive-only gitignore
- Cyclomatic complexity ~8-10 (MCP auto-registration icin JSON parse/merge, gitignore append logic)
- 289 LoC — buyuk tool, refactor icin aday

## 5. Type Safety

- `JSON.parse()` sonucu `as Record<string, unknown>` cast — runtime validation eksik
- `void auto` pattern — kullanilmayan degisken supression (unusual ama kabul edilebilir)
- `existsSync` oncesi null check eksik bazi noktalarda
- Genel olarak kabul edilebilir

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-013 DECKENT.md Adapter | COMPLIANT | ensureDeckentImport cagrilliyor |
| ADR-008 | **CONCERN** | `orchestra/sprint-reporter.js`'den generateProjectIdentity import — MCP→orchestra cross-layer |
| ADR-004 3-Layer Config | PARTIAL | Sadece default config yaziliyor (bootstrap icin kabul edilebilir) |

**ADR-008 Detay:** `generateProjectIdentity()` import'u incelenebilir — pure function ise core/'a tasimaliydi.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/init.test.ts`
- Buyuk surface area — mock gerektiren alanlar:
  - `mkdirSync`, `writeFileSync`, `existsSync`
  - `analyzeProject()`, `generateProjectIdentity()`
  - `JSON.parse` (settings.json merge)
  - `appendToGitignore`

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK comment bulunamadi.

## 9. Dead Code Candidates

- `void auto;` pattern — `auto` degiskeni kullanilmiyor, intentional suppression
- `generateToolsContent()` icinde hardcoded version string — DECKENT_VERSION constant kullanilabilir

## 10. Security Findings

- **ORTA RISK:** `.claude/settings.json` yazma — MCP auto-registration icin JSON merge yapiliyor. Mevcut 'deckent' key kontrolu var — idempotent. Ancak JSON.parse barisizlik durumunda sessizce basarisiz olabilir.
- `writeIfNotExists` pattern — force=false iken mevcut dosyalarin korunmasi dogru.
- `appendToGitignore` additive-only — destructive degil.

## 11. Memory V2 Uyumu

**PARTIAL / CONCERN:**
- `init.ts` hala `.brain/MEMORY.md`, `DECISIONS.md`, `DEBT.md` dosyalarini `writeIfNotExists` ile olusturuyor.
- Memory V2'de bu dosyalar V1 legacy — SQLite DB yetkili kaynak.
- Zararli degil (DB authoritative) ama yeni kullanicilar icin yaniltici olabilir.
- `.brain/memory.db` olusturmak icin `MemoryStore.initialize()` cagrisi yok — kullanici ilk `deckent recall` veya sprint calistirildiginda DB olusturulacak.

## 12. Oneriler

1. `generateProjectIdentity()`'yi `core/` katmanina tasimak ADR-008 ihlalini cozecek.
2. `.brain/MEMORY.md` vb. olusturma koduna Memory V2 notu ekle: "Legacy snapshot format — authoritative source is memory.db".
3. `force=true` icin mevcut dosyalarin backup'ini almadan ustune yazma riski var — kullaniciya uyari mesaji ekle.
4. `JSON.parse` hatasini catch et, bozuk `settings.json` icin graceful fallback sagla.
5. 289 LoC → refactor: `setupDirectories()`, `setupBrainFiles()`, `setupClaudeIntegration()` gibi sub-fonksiyonlara bol.

## 13. Verdict

**ANALYZED** — Calisir durumda. ADR-008 cross-layer concern ve Memory V2 legacy file creation iyilestirme gerektiriyor. Sprint 142 P1 refactor adayi.
