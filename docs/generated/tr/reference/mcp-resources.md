# MCP Kaynak Referansı

> **Otomatik üretilir** — AUTOGEN bloğunu elle düzenlemeyin. Yeniden üretmek için `npm run docs:ref` çalıştırın.

MCP kaynakları; canlı proje durumunu (dashboard, directives, memory, debt, tasks, …) `deckent://` URI şeması üzerinden MCP-uyumlu IDE'lere açar.

> Tablo içeriği koddan gelen tanımlayıcılardır; çevrilmez.

<!-- AUTOGEN:START id="mcp-resources-tr" -->
> 8 resources registered. Generated from `src/mcp/resources/*.ts`.

| Resource | URI | MIME | Description |
|----------|-----|------|-------------|
| `agents` | `deckent://agents` | `application/json` | Agent pool list from .deckent/agents/ |
| `config` | `deckent://config` | `application/json` | Current project configuration: mode, language, projectName, brain_planning |
| `dashboard` | `deckent://dashboard` | `application/json` | Live sprint status: agents, progress, usage, alerts |
| `debt` | `deckent://debt` | `application/json` | Technical debt items |
| `directives` | `deckent://directives` | `text/markdown` | Current DIRECTIVES.md content — sprint goals and tasks |
| `memory` | `deckent://memory` | `text/markdown` | Learned patterns from previous sprints |
| `retro` | `deckent://retro` | `text/markdown` | Latest sprint retrospective |
| `tasks` | `deckent://tasks` | `application/json` | Active task list from .tasks/*.json |
<!-- AUTOGEN:END id="mcp-resources-tr" -->
