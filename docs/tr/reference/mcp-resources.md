# MCP resource'ları

## Product-user perspektifi

Resource'lar 49 callable MCP tool'dan ayrı, read-oriented context endpoint'leridir. Compatible host bir `deckent://…` URI okur; server declared MIME type ile tek content item döndürür. Registry sekiz resource wire eder. [Kanıt: `src/mcp/resources/index.ts:1-20`]

| URI | MIME | Dönen görünüm | Empty/failure davranışı | Kaynak |
|---|---|---|---|---|
| `deckent://dashboard` | `application/json` | Safe dashboard reader'dan live sprint status, agents, progress, usage ve alerts. | Serialized safe-output object döndürür. | `src/mcp/resources/dashboard.ts:6-28` |
| `deckent://directives` | `text/markdown` | Güncel root `DIRECTIVES.md`. | Dosya yoksa empty string döner. | `src/mcp/resources/directives.ts:7-22` |
| `deckent://memory` | `text/markdown` | Exported/learned memory projection. | Read failure veya absence empty Markdown döndürür. | `src/mcp/resources/memory.ts:8-33` |
| `deckent://debt` | `application/json` | JSON'a projected technical-debt item'ları. | Missing/unreadable authority `[]` döndürür. | `src/mcp/resources/debt.ts:9-47` |
| `deckent://config` | `application/json` | Current project config file görünümü; mode, language, project name ve planning alanları advertised'dır. | Source absence/read failure'ı işler ve yine JSON text döndürür. | `src/mcp/resources/config.ts:7-32` |
| `deckent://retro` | `text/markdown` | Son sprint retrospective. | Missing/read failure empty Markdown döndürür. | `src/mcp/resources/retro.ts:8-33` |
| `deckent://tasks` | `application/json` | Parsed active `.tasks/task-*.json` kayıtları. | Missing directory empty JSON collection döndürür; unreadable entry truth'a yükseltilmez. | `src/mcp/resources/tasks.ts:7-38` |
| `deckent://agents` | `application/json` | `.deckent/agents/` üzerinden okunan agent pool entry'leri. | Missing/unreadable directory empty list üretir. | `src/mcp/resources/agents.ts:9-43` |

## Dogfood / repository gerçeği

- ✅ Sekiz module tek `registerResources()` composition point tarafından register edilir. [Kanıt: `src/mcp/resources/index.ts:1-20`]
- ⚠️ Bu resource'lar file/projection reader'dır; effective runtime config, database transaction veya lifecycle settlement receipt ile eşdeğer değildir. Daha güçlü contract gerektiğinde MCP tool/API/CLI kullan. [Kanıt: yukarıdaki resource implementation'ları; effective config loader `src/core/config.ts:1865-1982`]
- ⚠️ Bazı reader'lar absence/read error'ı bilinçli olarak empty content'e indirger. Consumer, “empty view” ile “authoritatively empty system” ayrımını status/diagnostic evidence ile yapmalıdır. [Kanıt: `src/mcp/resources/memory.ts:18-33`; `src/mcp/resources/retro.ts:18-33`; `src/mcp/resources/tasks.ts:17-38`; `src/mcp/resources/agents.ts:19-43`]

Schema ve CLI parity için [MCP tool reference](../mcp.md) belgesine bak.
