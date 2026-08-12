<!-- DECKENT:WORKSPACE id="tools" schema="1" authority="managed" provenance="workspace-artifact-registry" -->
<!-- Bu dosya elle güncellenmiştir (2026-08-01); kalıcı çözüm AUTOGEN üretimidir — bkz. IDENTITY.md AUTOGEN blokları -->

# Environment Tools

Build: tsc
Test: npx vitest run
Lint: tsc --noEmit
Dev: tsc --watch
Coverage: npx vitest run --coverage
Dashboard: deckent web

## MCP Tools
<!-- DECKENT:CONTRACT id="tools" schema="1" sha256="1e3b573704972f01403f5284a76a52b0497a096d5f68ec99dda0fad8fc18e4a7" -->
This table is generated from the canonical MCP TOOL_CATALOG; filenames are never interpreted as tools.

| MCP Name | Effect | Approval | Idempotent |
|---|---|---|---|
| `deckent_init` | mutating | required by runtime policy | yes |
| `deckent_set_directives` | mutating | required by runtime policy | no |
| `deckent_plan` | mutating | required by runtime policy | no |
| `deckent_start` | mutating | required by runtime policy | no |
| `deckent_status` | read-only | not required by effect class | yes |
| `deckent_doctor` | read-only | not required by effect class | yes |
| `deckent_retro` | read-only | not required by effect class | yes |
| `deckent_history` | read-only | not required by effect class | yes |
| `deckent_analyze_project` | read-only | not required by effect class | yes |
| `deckent_sync` | mutating | required by runtime policy | yes |
| `deckent_config` | mutating | required by runtime policy | no |
| `deckent_review` | read-only | not required by effect class | yes |
| `deckent_run` | mutating | required by runtime policy | no |
| `deckent_kill` | destructive | required by runtime policy | no |
| `deckent_cleanup` | destructive | required by runtime policy | no |
| `deckent_help` | read-only | not required by effect class | yes |
| `deckent_agent_list` | read-only | not required by effect class | yes |
| `deckent_skill_list` | read-only | not required by effect class | yes |
| `deckent_checkpoint` | mutating | required by runtime policy | no |
| `deckent_docs` | mutating | required by runtime policy | yes |
| `deckent_explain` | read-only | not required by effect class | yes |
| `deckent_memory_query` | read-only | not required by effect class | yes |
| `deckent_watch` | read-only | not required by effect class | yes |
| `deckent_nervous_subscribe` | read-only | not required by effect class | yes |
| `deckent_nervous_accept` | mutating | required by runtime policy | no |
| `deckent_nervous_reject` | mutating | required by runtime policy | no |
| `deckent_nervous_status` | read-only | not required by effect class | yes |
| `deckent_nervous_config` | mutating | required by runtime policy | no |
| `deckent_feature_query` | read-only | not required by effect class | yes |
| `deckent_truth` | read-only | not required by effect class | yes |
| `deckent_audit` | destructive | required by runtime policy | no |
| `deckent_recover` | destructive | required by runtime policy | no |
| `deckent_models` | mutating | required by runtime policy | no |
| `deckent_autonomous` | mutating | required by runtime policy | no |
| `deckent_process` | mutating | required by runtime policy | no |
| `deckent_usage` | read-only | not required by effect class | yes |
| `deckent_xverify` | mutating | required by runtime policy | no |
| `deckent_kpi` | read-only | not required by effect class | yes |
| `deckent_cost` | read-only | not required by effect class | yes |
| `deckent_agent_manage` | destructive | required by runtime policy | no |
| `deckent_skill_manage` | destructive | required by runtime policy | no |
| `deckent_memory_manage` | destructive | required by runtime policy | no |
| `deckent_autonomous_backlog` | destructive | required by runtime policy | no |
| `deckent_autonomous_status` | read-only | not required by effect class | yes |
| `deckent_nervous_edit` | read-only | not required by effect class | yes |
| `deckent_nervous_undo` | read-only | not required by effect class | yes |
| `deckent_autonomous_approve` | mutating | required by runtime policy | no |
| `deckent_autonomous_reject` | mutating | required by runtime policy | no |
| `deckent_execution_authority` | mutating | required by runtime policy | yes |

Total: 49
<!-- DECKENT:CONTRACT:END id="tools" -->

## CLI Commands
<!-- DECKENT:CONTRACT id="tools" schema="1" sha256="a792b9fbbe0070e1caa9c7e8ab378b8c9d58d79ffe25e302423791330c1e12fe" -->
This table is generated from the registered cross-surface command tree; helper module filenames are excluded.

| Command | Category | Risk | Surfaces |
|---|---|---|---|
| `deckent agent` | Core | Modify | cli, mcp, repl |
| `deckent analyze` | Core | Read | cli, mcp, repl |
| `deckent archive-debt` | Core | Read | cli |
| `deckent attach` | Run | Execute | cli |
| `deckent audit` | Core | Execute | cli, mcp, repl |
| `deckent audit-verify` | Core | Read | cli |
| `deckent autonomous` | Enterprise | Autonomous | cli, mcp, repl |
| `deckent autonomous-mission` | Enterprise | Autonomous | cli |
| `deckent bot` | Enterprise | Execute | cli |
| `deckent chat` | Run | Execute | cli |
| `deckent checkpoint` | Run | Modify | cli, mcp, repl |
| `deckent cleanup` | Danger | Modify | cli, mcp, repl |
| `deckent config` | Core | Modify | cli, mcp, repl |
| `deckent connect` | Core | Read | cli |
| `deckent cost` | Enterprise | Modify | cli, mcp |
| `deckent cu-status` | Core | Read | cli |
| `deckent dashboard` | Core | Read | cli |
| `deckent do` | Run | Execute | cli, repl |
| `deckent docs` | Core | Modify | cli, mcp |
| `deckent doctor` | Core | Read | cli, mcp, repl |
| `deckent evolve` | Enterprise | Read | cli |
| `deckent execution-authority` | Enterprise | Modify | cli, mcp |
| `deckent explain` | Memory | Read | cli, mcp, repl |
| `deckent features` | Core | Read | cli, mcp, repl |
| `deckent finalize` | Run | Modify | cli |
| `deckent flow` | Enterprise | Execute | cli |
| `deckent gateway` | Enterprise | Execute | cli |
| `deckent gateway-runtime` | Enterprise | Autonomous | cli |
| `deckent heartbeat` | Run | Execute | cli |
| `deckent help-info` | Core | Read | cli, mcp, repl |
| `deckent history` | Memory | Read | cli, mcp, repl |
| `deckent image` | Core | Modify | cli |
| `deckent init` | Core | Modify | cli, mcp |
| `deckent kill` | Danger | Execute | cli, mcp, repl |
| `deckent kpi` | Core | Read | cli, mcp, repl |
| `deckent limits` | Core | Read | cli |
| `deckent mcp` | MCP | Modify | cli |
| `deckent memory` | Memory | Modify | cli, mcp |
| `deckent mode` | Core | Modify | cli |
| `deckent models` | Core | Modify | cli, mcp, repl |
| `deckent nervous` | Enterprise | Modify | cli, mcp, repl |
| `deckent onboard` | Core | Modify | cli |
| `deckent openrouter-probe` | Core | Read | cli |
| `deckent output` | Core | Read | cli |
| `deckent plan` | Run | Modify | cli, mcp, repl |
| `deckent plan-nl` | Run | Read | cli |
| `deckent plugin` | Core | Modify | cli |
| `deckent process` | Enterprise | Execute | cli, mcp |
| `deckent provider-authority` | Enterprise | Modify | cli |
| `deckent rbac` | Enterprise | Modify | cli |
| `deckent recall` | Memory | Read | cli, mcp, repl |
| `deckent recover` | Danger | Modify | cli, mcp, repl |
| `deckent remember` | Memory | Modify | cli |
| `deckent resources` | Core | Read | cli, repl |
| `deckent resume` | Run | Execute | cli, repl |
| `deckent retro` | Memory | Read | cli, mcp, repl |
| `deckent review` | Run | Modify | cli, mcp, repl |
| `deckent run` | Run | Execute | cli, mcp |
| `deckent runs` | Run | Read | cli, repl |
| `deckent serve` | Run | Execute | cli |
| `deckent set-directives` | Run | Modify | cli, mcp, repl |
| `deckent skill` | Core | Modify | cli, mcp, repl |
| `deckent spawn` | Run | Execute | cli |
| `deckent start` | Run | Execute | cli, mcp |
| `deckent status` | Core | Read | cli, mcp, repl |
| `deckent sync` | Core | Modify | cli, mcp, repl |
| `deckent task` | Run | Modify | cli |
| `deckent test` | Run | Execute | cli |
| `deckent trace` | Core | Modify | cli |
| `deckent truth` | Core | Read | cli, mcp |
| `deckent upgrade` | Core | Execute | cli |
| `deckent usage` | Core | Read | cli, mcp, repl |
| `deckent watch` | Run | Read | cli, mcp |
| `deckent web` | Run | Execute | cli |
| `deckent xverify` | Core | Read | cli, mcp |

Total: 75
<!-- DECKENT:CONTRACT:END id="tools" -->
