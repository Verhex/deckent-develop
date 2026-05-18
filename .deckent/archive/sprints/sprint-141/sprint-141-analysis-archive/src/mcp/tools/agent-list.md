# Analysis: src/mcp/tools/agent-list.ts
**Task ID:** 141-004 | **LoC:** 112

## 1. Amaci

`deckent_agent_list` MCP tool — kayitli tum agent'lari listeler (16 built-in + custom temp agent'lar). `.deckent/agents/*/agent.json` manifest dosyalarini tarar, istatistikleri hesaplar.

## 2. Public API

```typescript
export function registerAgentListTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  includeBuiltin: z.boolean().optional().default(true),
  includeTemp: z.boolean().optional().default(true),
  root: z.string().optional()
}
```

**Internal:**
```typescript
function readAgents(agentsDir: string, includeBuiltin: boolean, includeTemp: boolean): AgentEntry[]
function resolveAgentType(manifest: AgentManifest, agentDir: string): 'builtin' | 'temp' | 'custom'
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`

**Ic:**
- `core/constants.js` — AGENTS_DIR

## 4. Complexity

- 3 fonksiyon: handler + readAgents + resolveAgentType
- Cyclomatic complexity ~4:
  - includeBuiltin / includeTemp filter
  - resolveAgentType: manifest type field, dirname pattern check
  - Stats summary: builtin count, temp count, total
- 112 LoC — makul

## 5. Type Safety

- `AgentManifest` interface: `{ id, name, description, type?, model?, skills?, totalUses?, successRate?, lastUsed? }`
- `AgentStats` interface: `{ total, builtin, temp, custom }`
- `AgentEntry` interface: `{ id, name, description, type, model?, skills?, stats? }`
- sort ile `localeCompare` — internationalization safe

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **COMPLIANT** | Sadece core/constants import — en temiz ADR-008 uyumlu tool |
| ADR-022 Parity | COMPLIANT | CLI `deckent agent list` ile eslesir |

**ReadOnly + idempotent** dogru set.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/agent-list.test.ts`
- Senaryolar:
  - includeBuiltin=false: sadece temp
  - includeTemp=false: sadece builtin
  - Bos agents dizini
  - Bozuk agent.json graceful skip

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- `resolveAgentType()` icinde `dirname` pattern kontrolu: `agentDir.includes('temp-')` — fragile. Agent manifest'teki explicit `type` field tercih edilmeli.

## 10. Security Findings

- **DUSUK RISK:** AGENTS_DIR'den manifest okuma — sabit path, guvenli.
- `JSON.parse()` bozuk manifest icin try/catch olmadan exception firlatiyor — graceful skip gerekli.

## 11. Memory V2 Uyumu

N/A — agent manifest'leri dosya-tabanli, DB'de degil. Bu dogru: agent manifests operational config, not knowledge.

## 12. Oneriler

1. `JSON.parse()` individual manifest hatasini izole et — bozuk manifest tum listeyi basarisiz etmesin.
2. `resolveAgentType()` dirname pattern yerine manifest.type field'ine guvenmeli — daha robust.
3. `totalUses` ve `successRate` istatistiklerini sort kriteri olarak expose et (en cok kullanilan agent'lar once).
4. LRU eviction bilgisi (max 50 temp, 5 sprint age) response'ta gosterilebilir.

## 13. Verdict

**ANALYZED** — En temiz ve ADR-008 compliant tool'lardan biri. Kucuk iyilestirmeler (JSON.parse error handling, type resolution) yeterli. Kritik sorun yok.
