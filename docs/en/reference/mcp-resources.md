# MCP resources

## Product-user perspective

Resources are read-oriented context endpoints, separate from the 49 callable MCP tools. A compatible host reads a `deckent://…` URI; the server returns one content item with the declared MIME type. The registry wires eight resources. [Evidence: `src/mcp/resources/index.ts:1-20`]

| URI | MIME | Returned view | Empty/failure behavior | Source |
|---|---|---|---|---|
| `deckent://dashboard` | `application/json` | Live sprint status, agents, progress, usage, and alerts from the safe dashboard reader. | Returns a serialized safe-output object. | `src/mcp/resources/dashboard.ts:6-28` |
| `deckent://directives` | `text/markdown` | Current root `DIRECTIVES.md`. | Missing file returns an empty string. | `src/mcp/resources/directives.ts:7-22` |
| `deckent://memory` | `text/markdown` | Exported/learned memory projection. | Read failure or absence returns empty Markdown. | `src/mcp/resources/memory.ts:8-33` |
| `deckent://debt` | `application/json` | Technical-debt items projected to JSON. | Missing/unreadable authority returns `[]`. | `src/mcp/resources/debt.ts:9-47` |
| `deckent://config` | `application/json` | Current project config file view: mode, language, project name, and planning fields are advertised. | Source handles absence/read failure and still returns JSON text. | `src/mcp/resources/config.ts:7-32` |
| `deckent://retro` | `text/markdown` | Latest sprint retrospective. | Missing/read failure returns empty Markdown. | `src/mcp/resources/retro.ts:8-33` |
| `deckent://tasks` | `application/json` | Parsed active `.tasks/task-*.json` records. | Missing directory returns an empty JSON collection; unreadable entries are not promoted to truth. | `src/mcp/resources/tasks.ts:7-38` |
| `deckent://agents` | `application/json` | Agent pool entries read from `.deckent/agents/`. | Missing/unreadable directory yields an empty list. | `src/mcp/resources/agents.ts:9-43` |

## Dogfood / repository reality

- ✅ All eight modules are registered by the single `registerResources()` composition point. [Evidence: `src/mcp/resources/index.ts:1-20`]
- ⚠️ These resources are file/projection readers; they are not equivalent to effective runtime config, a database transaction, or a lifecycle settlement receipt. Use MCP tools/API/CLI where the stronger contract is required. [Evidence: resource implementations above; effective config loader `src/core/config.ts:1865-1982`]
- ⚠️ Several readers intentionally collapse absence/read errors to empty content. Consumers must distinguish “empty view” from “authoritatively empty system” using status/diagnostic evidence. [Evidence: `src/mcp/resources/memory.ts:18-33`; `src/mcp/resources/retro.ts:18-33`; `src/mcp/resources/tasks.ts:17-38`; `src/mcp/resources/agents.ts:19-43`]

See [MCP tool reference](../mcp.md) for schemas and CLI parity.
