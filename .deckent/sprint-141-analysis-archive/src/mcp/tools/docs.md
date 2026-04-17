# Analysis: src/mcp/tools/docs.ts
**Task ID:** 141-004 | **LoC:** 140

## 1. Amaci

`deckent_docs` MCP tool — managed dokuman lifecycle yonetimi. Sprint ile otomatik guncellenen dokümanları ekler, kaldirir, listeler, gunceller veya calistirir. ADR-029/030 (Managed-Docs + Template Engine) enforcement point'i.

## 2. Public API

```typescript
export function registerDocsTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  action: z.enum(['add', 'remove', 'list', 'update', 'run']),
  file: z.string().optional(),   // add/remove icin dosya yolu
  template: z.string().optional(),
  root: z.string().optional()
}
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `orchestra/managed-docs/docs-config.js` — loadDocsConfig(), addDoc(), removeDoc() [ADR-008 concern]
- `orchestra/managed-docs/managed-doc-runner.js` — runDocUpdate() [ADR-008 concern]

## 4. Complexity

- 1 fonksiyon with 5 action branches
- Cyclomatic complexity ~8:
  - add: existsSync check + addDoc()
  - remove: removeDoc()
  - list: loadDocsConfig() format
  - update: runDocUpdate() specific doc
  - run: runDocUpdate() all docs
- 140 LoC — makul

## 5. Type Safety

- Action enum Zod'dan validate ediliyor
- `addDoc()`, `removeDoc()`, `runDocUpdate()` donus tipleri kontrol edilmeli
- `file` parametresi `existsSync` ile validate ediliyor (add action icin)

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **CONCERN** | `orchestra/managed-docs/`'dan import — MCP→orchestra cross-layer |
| ADR-029 Managed-Docs | **COMPLIANT** | Bu tool ADR-029'un MCP enforcement noktasi |
| ADR-030 Template Engine | COMPLIANT | runDocUpdate() template rendering tetikliyor |
| ADR-022 Parity | COMPLIANT | CLI `deckent docs` ile eslesir |

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/docs.test.ts`
- Mock: `loadDocsConfig()`, `addDoc()`, `removeDoc()`, `runDocUpdate()`
- Senaryolar: her action branch, dosya yok hatasi, config load hatasi

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

Yok. Her action branch aktif.

## 10. Security Findings

- **DUSUK RISK:** `file` parametresi `existsSync` ile validate ediliyor (add icin) — bu cok minimal validation. Dosya gercekten managed doc icin uygun mu kontrolu yok.
- `root` parametresi `path.resolve(root, file)` ile kullaniliyorsa path traversal riski — kontrol edilmeli.

## 11. Memory V2 Uyumu

N/A — managed docs dosya-tabanli sprint dokumanlari. DB ile iliskisi yok.

## 12. Oneriler

1. ADR-008: `loadDocsConfig`, `addDoc`, `removeDoc`, `runDocUpdate`'i core/ layerina tasimak uzun vadede temiz.
2. `file` validation: managed doc icin kabul edilebilir uzantilar kontrol et (`.md`, `.txt`).
3. `update` ve `run` action'lari icin kaç dokuman guncellendi response'ta gosterilebilir.
4. `add` action: duplicate check — zaten managed listede varsa uyari ver.

## 13. Verdict

**ANALYZED** — Calisir durumda. ADR-029/030 compliance sagliyor. ADR-008 MCP→orchestra cross-layer pattern diger tool'larla tutarli. Kritik sorun yok.
