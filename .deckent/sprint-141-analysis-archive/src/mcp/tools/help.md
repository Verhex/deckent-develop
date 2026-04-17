# Analysis: src/mcp/tools/help.ts
**Task ID:** 141-004 | **LoC:** 237

## 1. Amaci

`deckent_help` MCP tool — runtime yetenekleri, proje durumu ve onerilen sonraki adimi dondurur. Sabit TOOLS ve RESOURCES dizileri + dinamik durum tespiti (`detectState()`) + Turkish string'li `determineNextAction()` iceriyor.

## 2. Public API

```typescript
export function registerHelpTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  root: z.string().optional(),
  topic: z.string().optional()  // specific help topic
}
```

**Internal interfaces:**
```typescript
interface HelpToolInfo { name, description, category, readOnly, destructive }
interface HelpState { initialized, hasDirectives, hasActiveSprint, hasRecentRetro }
interface HelpResponse { version, state, tools, resources, nextAction, tips }
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`

**Ic:**
- `core/constants.js` — SPRINT_LOCK_FILE, DIRECTIVES_FILE, RETRO_FILE, DECKENT_DIR

## 4. Complexity

- 4 fonksiyon: registerHelpTool, detectState, determineNextAction + inline TOOLS/RESOURCES arrays
- Cyclomatic complexity ~8:
  - `detectState()` 4 boolean check
  - `determineNextAction()` multi-state branching
- TOOLS dizisi statik (array literal) — 237 LoC'un buyuk kismi

## 5. Type Safety

- `HelpState` interface tam tipli
- `config as { routing_engine?: string }` — partial cast, safe
- TOOLS/RESOURCES dizileri literal type checked

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-022 CLI/MCP Parity | **VIOLATED** | TOOLS array sadece 15 tool listeliyor — 22 gercekte kayitli |
| ADR-008 | COMPLIANT | Sadece core/constants import |

**Eksik 7 Tool:** `agent_list`, `skill_list`, `checkpoint`, `docs`, `explain`, `memory_query` ve bir diger. Bu eksiklikler LLM kullanicilara yanlis yonlendirme yapiyor.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/help.test.ts`
- Senaryolar:
  - initialized=false, hasDirectives=false → correct nextAction
  - initialized=true, hasActiveSprint=true
  - TOOLS array count dogrulama (22 olmali)
  - determineNextAction Turkish string check

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi. Ancak eksik tool listesi kritik bir ihmal.

## 9. Dead Code Candidates

- `determineNextAction()` Turkish string donduruyor — diger tum MCP tool'lari English. Dil tutarsizligi.
- TOOLS array'inde kategoriler: `'sprint'`, `'config'`, `'meta'` — `memory_query` icin `'memory'` kategorisi eklenmeli.

## 10. Security Findings

- **DUSUK RISK:** Read-only durum tespiti — `existsSync` cagrilari sabit path'lere. Guvenli.

## 11. Memory V2 Uyumu

**PARTIAL:** `memory_query` tool TOOLS dizisinde listelenmemis. Help tool Memory V2 kapabilitelerini kullanicilara gostermiyor. Bu kritik bir dokumantasyon eksikligi.

## 12. Oneriler

1. **KRITIK — MUST FIX:** TOOLS dizisine eksik 7 tool ekle:
   - `agent_list`, `skill_list`, `checkpoint`, `docs`, `explain`, `memory_query`
   - Her biri icin category, readOnly, destructive flagleri dogru set et
2. `determineNextAction()` Turkish → English donusum — dil tutarsizligini gider.
3. TOOLS array'ini tek yerden manage et — server.ts'deki DECKENT_MCP_INSTRUCTIONS ile senkron kalsin.
4. `memory_query` icin `'memory'` kategorisi ekle.
5. Help topic parametresi kullaniliyorsa (`topic: 'memory'`) filter logigi ekle.

## 13. Verdict

**ANALYZED — KRITIK SORUN:** TOOLS dizisi 15/22 tool — eksik 7 tool LLM kullanicilara yanlis capabilities portrait yapiyor. Sprint 142 P0 fix zorunlu. Turkish string inconsistency P2.
