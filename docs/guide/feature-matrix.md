# Deckent Feature Matrix

This matrix shows where major Deckent capabilities are available today across the CLI, MCP, and Dashboard surfaces. It is intentionally conservative: a Dashboard cell is marked only when a routed page or native browser flow was confirmed.

Legend: `✅` means the capability is directly exposed on that surface. `—` means no direct surface was confirmed from the current source docs and dashboard routes.

| Capability | CLI | MCP | Dashboard | Notes |
|---|:---:|:---:|:---:|---|
| Plan a sprint | ✅ | ✅ | ✅ | CLI `deckent plan`; MCP `deckent_plan`; Dashboard `NewSprintModal` calls `/api/plan`. |
| Start a sprint | ✅ | ✅ | ✅ | CLI `deckent start`; MCP `deckent_start`; Dashboard `NewSprintModal` calls `/api/start`. |
| Check sprint status | ✅ | ✅ | ✅ | CLI `deckent status`; MCP `deckent_status`; Dashboard `/status` page and main dashboard use `/api/status`. |
| Watch live sprint activity | ✅ | ✅ | ✅ | CLI `deckent watch` and `deckent status --watch`; MCP `deckent_watch`; Dashboard Status page uses SSE from `/api/events`. |
| Review sprint results | ✅ | ✅ | — | CLI `deckent review`; MCP `deckent_review`. No direct dashboard sprint-review route was confirmed. |
| Read retrospectives | ✅ | ✅ | — | CLI `deckent retro`; MCP `deckent_retro`. Dashboard has History and Memory pages, but no direct retro page was confirmed. |
| Search or recall memory | ✅ | ✅ | ✅ | CLI `deckent recall` and `deckent memory`; MCP `deckent_memory_query`; Dashboard Memory and Memory Explorer pages use memory APIs. |
| List agents and skills | ✅ | ✅ | — | CLI `deckent agent list` and `deckent skill list`; MCP `deckent_agent_list` and `deckent_skill_list`. Dashboard shows worker/agent state and routing distribution, but no confirmed combined registered agent/skill list page. |
| Run autonomous mode | ✅ | ✅ | — | CLI `deckent autonomous` (start/status/stop/pending/approve/reject/backlog); MCP `deckent_autonomous`. The engine ships live recurring cron re-enqueue, debt-driven work-generator candidates, `kind=capability` broker dispatch, and RBAC policy enforcement on machine-initiated dispatch (`autonomous.rbac_policy`) — all default-off (`autonomous.enabled`, `autonomous.work_generator.enabled`, `autonomous.rbac_policy.enabled`). No dashboard autonomous route was confirmed. |
| Audit compliance & SIEM export | ✅ | — | — | CLI `deckent audit compliance --sprint <id>` (compliance report over the live audit chain; exit 1 on broken chain) and `deckent audit forward --sprint <id> --out <path>` (NDJSON SIEM file export — no network transport yet). MCP `deckent_audit` covers the Brain Self-Audit Gate only; no read-side MCP tool or dashboard audit route was confirmed. |
| Use Nervous System alerts | ✅ | ✅ | ✅ | CLI `deckent nervous`; MCP `deckent_nervous_*` tools; Dashboard Nervous page uses `/api/nervous/status`, `/api/nervous/pending`, accept, and reject routes. |
| Manage checkpoints | ✅ | ✅ | — | CLI `deckent checkpoint`; MCP `deckent_checkpoint`. Dashboard config exposes human checkpoint settings, but no direct checkpoint list/approve/reject page was confirmed. |
| Configure Deckent | ✅ | ✅ | ✅ | CLI `deckent config`; MCP `deckent_config`; Dashboard Config page exposes sprint, memory, routing, provider, and related settings. |
| Query model catalog | ✅ | ✅ | — | CLI `deckent models`; MCP `deckent_models`. No direct dashboard model-catalog page was confirmed. |

## Source Notes

- MCP availability is based on the registered tool list in `src/mcp/tools/`, which contains 37 registered tools.
- CLI availability is based on `DECKENT.md` and registered CLI command modules.
- Dashboard availability is based on routed dashboard pages and API flows in `src/dashboard/src` and `src/api/server.ts`.
- The Dashboard includes an embedded terminal, but terminal access is not counted as native Dashboard availability in this table.
- A blank/`—` Dashboard cell means no dedicated page, modal, or browser control was confirmed from the dashboard guide and routes.
