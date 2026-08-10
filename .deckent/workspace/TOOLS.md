<!-- Bu dosya elle güncellenmiştir (2026-08-01); kalıcı çözüm AUTOGEN üretimidir — bkz. IDENTITY.md AUTOGEN blokları -->

# Environment Tools

Build: tsc
Test: npx vitest run
Lint: tsc --noEmit
Dev: tsc --watch
Coverage: npx vitest run --coverage
Dashboard: deckent web

## MCP Tools
| Tool | MCP Name |
|------|---------|
| agent-list | `deckent_agent_list` |
| analyze | `deckent_analyze` |
| audit | `deckent_audit` |
| autonomous | `deckent_autonomous` |
| autonomous-approval | `deckent_autonomous_approval` |
| autonomous-surface | `deckent_autonomous_surface` |
| catalog-parity | `deckent_catalog_parity` |
| checkpoint | `deckent_checkpoint` |
| cleanup | `deckent_cleanup` |
| config | `deckent_config` |
| cost | `deckent_cost` |
| directives | `deckent_directives` |
| docs | `deckent_docs` |
| doctor | `deckent_doctor` |
| execution-authority | `deckent_execution_authority` |
| explain | `deckent_explain` |
| feature-query | `deckent_feature_query` |
| help | `deckent_help` |
| history | `deckent_history` |
| init | `deckent_init` |
| kill | `deckent_kill` |
| kpi | `deckent_kpi` |
| memory-query | `deckent_memory_query` |
| models | `deckent_models` |
| nervous | `deckent_nervous` |
| nervous-edit | `deckent_nervous_edit` |
| plan | `deckent_plan` |
| process | `deckent_process` |
| recover | `deckent_recover` |
| retro | `deckent_retro` |
| review | `deckent_review` |
| run | `deckent_run` |
| skill-list | `deckent_skill_list` |
| start | `deckent_start` |
| status | `deckent_status` |
| sync | `deckent_sync` |
| truth | `deckent_truth` |
| usage | `deckent_usage` |
| watch | `deckent_watch` |
| xverify | `deckent_xverify` |

_Total: 40 MCP tools_

**Key operational tools:** `deckent_audit`, `deckent_nervous`, `deckent_watch`, `deckent_recover`, `deckent_status`, `deckent_memory_query`

## CLI Commands
| Command Module | Description |
|---------------|-------------|
| `agent` | deckent agent |
| `agentic-confirm` | deckent agentic-confirm |
| `agentic-session` | deckent agentic-session |
| `analyze` | deckent analyze |
| `archive-debt` | deckent archive-debt |
| `attach` | deckent attach |
| `audit` | deckent audit |
| `audit-verify` | deckent audit-verify |
| `autonomous` | deckent autonomous |
| `autonomous-mission` | deckent autonomous-mission |
| `bot` | deckent bot |
| `chat` | deckent chat |
| `chat-agentic-dispatch` | deckent chat-agentic-dispatch |
| `chat-banner` | deckent chat-banner |
| `chat-enterprise-bridge` | deckent chat-enterprise-bridge |
| `chat-layout` | deckent chat-layout |
| `chat-mcp-bridge` | deckent chat-mcp-bridge |
| `chat-mode` | deckent chat-mode |
| `chat-native` | deckent chat-native |
| `chat-nervous-bridge` | deckent chat-nervous-bridge |
| `chat-permissions` | deckent chat-permissions |
| `chat-provider-parity` | deckent chat-provider-parity |
| `chat-render` | deckent chat-render |
| `chat-render-region` | deckent chat-render-region |
| `chat-repl-ux` | deckent chat-repl-ux |
| `chat-resume` | deckent chat-resume |
| `chat-session` | deckent chat-session |
| `chat-slash-menu` | deckent chat-slash-menu |
| `chat-slash-registry` | deckent chat-slash-registry |
| `chat-spinner` | deckent chat-spinner |
| `chat-status-line` | deckent chat-status-line |
| `chat-tool-bridge` | deckent chat-tool-bridge |
| `chat-tool-exec` | deckent chat-tool-exec |
| `checkpoint` | deckent checkpoint |
| `cleanup` | deckent cleanup |
| `config` | deckent config |
| `config-nervous` | deckent config-nervous |
| `connect` | deckent connect |
| `cost` | deckent cost |
| `cu-status` | deckent cu-status |
| `dashboard` | deckent dashboard |
| `do` | deckent do |
| `docs` | deckent docs |
| `doctor` | deckent doctor |
| `doctor-checks` | deckent doctor-checks |
| `evolve` | deckent evolve |
| `execution-authority` | deckent execution-authority |
| `explain` | deckent explain |
| `features` | deckent features |
| `finalize` | deckent finalize |
| `flow` | deckent flow |
| `gateway` | deckent gateway |
| `heartbeat` | deckent heartbeat |
| `help` | deckent help |
| `history` | deckent history |
| `image` | deckent image |
| `init` | deckent init |
| `init-steps` | deckent init-steps |
| `init-templates` | deckent init-templates |
| `init-wizard` | deckent init-wizard |
| `kill` | deckent kill |
| `kpi` | deckent kpi |
| `limits` | deckent limits |
| `mcp` | deckent mcp |
| `memory` | deckent memory |
| `mode` | deckent mode |
| `models` | deckent models |
| `nervous` | deckent nervous |
| `onboard` | deckent onboard |
| `openrouter-probe` | deckent openrouter-probe |
| `output` | deckent output |
| `plan` | deckent plan |
| `plan-nl` | deckent plan-nl |
| `plugin` | deckent plugin |
| `process` | deckent process |
| `provider-authority` | deckent provider-authority |
| `quick-start` | deckent quick-start |
| `rbac` | deckent rbac |
| `recall` | deckent recall |
| `recover` | deckent recover |
| `remember` | deckent remember |
| `resources` | deckent resources |
| `resume` | deckent resume |
| `retro` | deckent retro |
| `retro-formatter` | deckent retro-formatter |
| `retro-parser` | deckent retro-parser |
| `review` | deckent review |
| `run` | deckent run |
| `runs` | deckent runs |
| `serve` | deckent serve |
| `set-directives` | deckent set-directives |
| `skill` | deckent skill |
| `skill-marketplace` | deckent skill-marketplace |
| `spawn` | deckent spawn |
| `start` | deckent start |
| `status` | deckent status |
| `sync` | deckent sync |
| `task-settlement` | deckent task-settlement |
| `test-run` | deckent test-run |
| `trace-extract` | deckent trace-extract |
| `truth` | deckent truth |
| `upgrade` | deckent upgrade |
| `usage` | deckent usage |
| `watch` | deckent watch |
| `web` | deckent web |
| `xverify` | deckent xverify |

_Total: 106 CLI command modules_
