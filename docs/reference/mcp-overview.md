# MCP Module Overview

The Deckent MCP server (`src/mcp/`) exposes the full Deckent orchestration surface as a Model Context Protocol server using the stdio transport. It is registered with Claude Code via `claude mcp add deckent -- npx deckent-mcp`, which launches it as a long-lived child process that communicates over stdin/stdout. The server publishes **35 tools** and **8 resources** organized across sprint lifecycle management, memory, autonomous execution, Nervous System integration, and enterprise process mode. A singleton lock (`mcp-server.pid`) prevents multiple concurrent server instances in the same project root.

---

## Architecture

### Server Bootstrap

`src/mcp/server.ts` is the entry point when invoked as a binary. `createServer()` instantiates an `McpServer` from `@modelcontextprotocol/sdk`, calls `registerTools(server)` and `registerResources(server)` to attach all handlers, and then binds a `McpNotificationAdapter` so sprint lifecycle hooks (sprint-controller, sprint-finalizer, result-evaluator) can emit `notifications/message` events to the connected client.

`main()` acquires the singleton lock via `bootSingletonGuard(process.cwd())`, creates the server, then connects to a `StdioServerTransport` and awaits the message loop. If the lock is already held by another PID, the process writes a diagnostic to stderr and exits with code 2.

### Registration Pattern

Tools are registered in `src/mcp/tools/index.ts` by calling `registerTools(server: McpServer)`, which calls one `registerXxxTool(server)` function per tool file. Each file exports exactly one registration function. The pattern is:

```typescript
export function registerXxxTool(server: McpServer): void {
  server.registerTool(
    'deckent_xxx',
    {
      title: '...',
      description: '...',
      annotations: { readOnlyHint: boolean, destructiveHint: boolean, idempotentHint: boolean },
      inputSchema: z.object({ ... }),    // Zod v4 schema
    },
    async (params) => {
      // handler body
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );
}
```

Resources follow the same pattern in `src/mcp/resources/index.ts`, calling `registerResources(server: McpServer)` which delegates to eight `registerXxxResource(server)` functions.

### Notification Dispatcher

`initializeNotifyDispatcher(server, projectRoot)` is called during `createServer()`. It wires three adapters — CLI (parent TTY), MCP (`notifications/message`), and file — so any sprint lifecycle event (task done, sprint complete, alert) is forwarded to the connected MCP client in real time. This uses `src/core/notification-dispatcher.ts` and `src/core/notify-bootstrap.ts`.

### Transport Lifecycle

1. `main()` calls `bootSingletonGuard` → acquires PID lock file.
2. `createServer()` → registers tools + resources + notification adapter.
3. `server.connect(new StdioServerTransport())` starts the JSON-RPC message loop over stdin/stdout.
4. SIGTERM/SIGINT signal handlers release the singleton lock and call `process.exit(0)`.
5. An `exit` hook also releases the lock for clean shutdown in all cases.

---

## Tools (35)

### Init / Config

| Tool | Read-only | Destructive | Description |
|------|-----------|-------------|-------------|
| `deckent_init` | No | No | Initialize Deckent in the current directory: creates `.deckent/`, `.brain/`, `.tasks/`, `.locks/`, `.claude/rules/` and writes `config.json`, `DECKENT.md`, workspace files, i18n bundles, and MCP registration in `.claude/settings.json`. Safe to re-run — merges existing config, only writes missing files. Accepts `mode`, `language`, `force`, `auto`, `installMissing`. |
| `deckent_set_directives` | No | No | Write sprint goals and task definitions to `DIRECTIVES.md`. Accepts a `content` string; the file is replaced atomically. |
| `deckent_config` | No | No | Read (`action=read`) or update (`action=set`) a single Deckent configuration key in `.deckent/config.json`. Returns the full resolved config on read. |
| `deckent_sync` | No | No | Synchronize agent/skill manifests, regenerate routing rules from `.brain/memory.db` ADRs, and update `.claude/rules/`. |
| `deckent_analyze_project` | Yes | No | Detect project stack (language, frameworks, build tool, test runner) and technical context by scanning `package.json`, lock files, and directory layout. Returns a `ProjectProfile`. |
| `deckent_doctor` | Yes | No | Run health checks: config validity, stale locks in `.locks/`, memory budget in `.brain/`, provider availability, and dependency graph. Reports issues and remediation steps. |
| `deckent_help` | Yes | No | Return runtime capabilities, current project status, and a usage guide derived from the live config and `DECKENT_MCP_INSTRUCTIONS`. |

### Sprint Lifecycle

| Tool | Read-only | Destructive | Description |
|------|-----------|-------------|-------------|
| `deckent_plan` | No | No | Generate task plan from `DIRECTIVES.md`. `mode=ai` uses the Brain LLM to interpret directives; `mode=structured` applies rule-based parsing; `mode=auto` selects based on project size. Writes task JSON files to `.tasks/`. |
| `deckent_start` | No | No | Start the full sprint lifecycle (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP) as a detached background job. Returns a `jobId` immediately; use `deckent_status` to monitor. Pre-spawn cost gate: if the estimated cost exceeds `cost_limits.sprint_max_usd`, returns `COST_GATE_EXCEEDED` unless `acknowledgeCost=true`. Supports `dryRun`, `sandbox`, `timeout`, and `force`. |
| `deckent_status` | Yes | No | Return live sprint progress: active workers, task statuses, heartbeat ages, recent event stream tail, and any auditor alerts. Reads `.dashboard`, `.tasks/*.json`, and the event JSONL for the active sprint. |
| `deckent_review` | Yes | No | Evaluate the current sprint results and return a Brain decision: `GO`, `NO_GO`, or `GO_WITH_TECH_DEBT`. Summarizes per-task outcomes, failed tasks, and any debt incurred. |
| `deckent_kill` | No | Yes | Kill the running sprint (`target=all`) or a specific worker process (`target=worker`, `workerId`). Writes a kill signal file and terminates the relevant processes. |
| `deckent_cleanup` | No | Yes | Archive task files from `.tasks/` to `.deckent/archive/`, release all file locks in `.locks/`, and mark the sprint complete. Does not delete `.brain/` data. |
| `deckent_recover` | No | Yes | Recover a crashed or stuck sprint: cleans orphan IPC directories, removes stale locks, archives partial task files, and resets sprint state so a new sprint can start. |
| `deckent_retro` | Yes | No | Read the last sprint retrospective from `.brain/memory.db` (type=`retro`). Returns gains, losses, decisions, and suggested next actions. |
| `deckent_history` | Yes | No | List sprint history with per-sprint metrics: task counts, GO/NO_GO distribution, agent and skill performance rates, and duration. |
| `deckent_explain` | Yes | No | Explain a sprint's history: what was planned, what happened, which tasks succeeded or failed, and what the Brain decided. Useful for auditing past sprints. |

### Task Execution

| Tool | Read-only | Destructive | Description |
|------|-----------|-------------|-------------|
| `deckent_run` | No | No | Run a single task directly (no full sprint): resolves the task file, spawns one worker via the configured backend, and waits for the result. Returns the task result JSON. |
| `deckent_checkpoint` | No | No | Approve (`action=approve`) or reject (`action=reject`) a checkpoint gate — a pause point written by a worker mid-sprint. The worker unblocks only after a checkpoint decision is recorded. |
| `deckent_docs` | No | No | Sprint lifecycle document management: `add` registers a managed doc template, `remove` deregisters it, `list` returns the current `docs.json` manifest. |

### Memory

| Tool | Read-only | Destructive | Description |
|------|-----------|-------------|-------------|
| `deckent_memory_query` | Yes | No | Full-text search across the project memory in `.brain/memory.db`. Searches ADRs, sprint learnings, patterns, and technical debt. Supports FTS5 dual-layer Turkish normalization, type/status filters, sprint range, and `mode=and\|or` token joining. |

### Monitoring

| Tool | Read-only | Destructive | Description |
|------|-----------|-------------|-------------|
| `deckent_watch` | Yes | No | Subscribe to the live sprint event stream. Backfills recent events from the JSONL file for the active sprint and then pushes new events via `notifications/message` (MCP log channel) as they arrive. |
| `deckent_audit` | Yes | No | Run the Brain Self-Audit Gate for a completed sprint: executes `tsc --noEmit`, selected vitest suites, and honesty checks on task result files. Returns a structured report without modifying any files. |
| `deckent_usage` | Yes | No | Show token and cost consumption from Claude Code transcript files. Returns a model breakdown table or per-task sprint breakdown, including cache-read hit rates and a cache gate cost summary. |

### Autonomous

| Tool | Read-only | Destructive | Description |
|------|-----------|-------------|-------------|
| `deckent_autonomous` | No | No | Control surface for the autonomous execution engine. Actions: `status` (query engine state and stop-marker), `start` (clear stop marker; loop must be launched separately from a terminal), `stop` (write stop marker), `backlog_add/list/remove` (manage the durable work queue in `.deckent/autonomous/backlog.json`), `pending/approve/reject` (resolve approval-gated entries). Mirrors the `deckent autonomous` CLI subcommands. |
| `deckent_process` | No | No | Process-mode execution surface for ERP and business automation. `action=submit` injects an `ExecutionRequest` into the durable backlog: read-only capabilities run automatically; side-effecting capabilities are parked for approval. `action=status\|result` polls a prior submission by `executionId`. Delegates to the same process-controller used by the REST API. |

### Nervous System

| Tool | Read-only | Destructive | Description |
|------|-----------|-------------|-------------|
| `deckent_nervous_subscribe` | No | No | Subscribe to Nervous System notifications for the current session. Returns the subscriber ID and any pending notifications at subscribe time. |
| `deckent_nervous_accept` | No | No | Accept a pending Nervous System notification by ID. Queues the accepted action for the Nervous executor and records the decision in history. |
| `deckent_nervous_reject` | No | No | Reject a pending Nervous System notification by ID. Optionally includes a reason; records the rejection in history. |
| `deckent_nervous_status` | Yes | No | Return the Nervous System dashboard: pending notifications, recent history, authority mode, and per-action overrides. |
| `deckent_nervous_config` | No | No | Read or update Nervous System configuration: `mode` (authority mode: `autonomous\|balanced\|supervised`), per-action overrides, and quiet hours. Writes changes to `.deckent/config.json`. |

### Models / Agents / Skills

| Tool | Read-only | Destructive | Description |
|------|-----------|-------------|-------------|
| `deckent_models` | Yes | No | List the model catalog from `ModelRegistry`: 13 models across 3 providers and 4 tiers (`premium_plus`, `premium`, `standard`, `economy`). Performs a live fetch from `models.dev` with a 24-hour file cache; falls back to the bundled registry on network failure. |
| `deckent_agent_list` | Yes | No | List all registered agents: 15 built-in agents plus any temporary agents in `.deckent/agents/`. Returns manifest data including activation keywords, success rates, and total use counts. |
| `deckent_skill_list` | Yes | No | List all registered skills: 21 built-in skills plus any custom skills. Returns manifest data including AST sandbox validation status and domain keywords. |
| `deckent_feature_query` | Yes | No | Query the feature manifest by lifecycle category: `active`, `lightly_used`, `dormant`, `dead`, or `all`. Reports feature adoption, last-sprint usage, and decay status. |

---

## Resources (8)

| Resource | URI | Content-Type | Description |
|----------|-----|--------------|-------------|
| `dashboard` | `deckent://dashboard` | `application/json` | Live sprint dashboard: active workers, task statuses, phase, usage counters, and auditor alerts. Reads `.dashboard` (written by the Auditor scan loop every 30 s). Returns `{ active: false }` when no sprint is running. |
| `directives` | `deckent://directives` | `text/markdown` | Current `DIRECTIVES.md` content — the sprint goals and task definitions that Brain reads before planning. Returns an empty string if the file does not exist yet. |
| `memory` | `deckent://memory` | `text/markdown` | Sprint learnings from `.brain/memory.db` (type=`memory`). Each entry is rendered as `## Title\n<content>`. DB-first; returns empty if no database is present. |
| `debt` | `deckent://debt` | `application/json` | Technical debt register from `.brain/memory.db` (type=`debt`). Returns a JSON array of `DebtItem` objects with `id`, `description`, `priority`, `sprintsOpen`, and `resolved` fields. |
| `config` | `deckent://config` | `application/json` | Raw contents of `.deckent/config.json` — the current project configuration: `mode`, `language`, `projectName`, `brain_planning`, provider settings, and all overrides. Returns an error object if the file is missing or unparseable. |
| `retro` | `deckent://retro` | `text/markdown` | Latest sprint retrospective from `.brain/memory.db` (type=`retro`, first entry). DB-first; returns empty string if no retrospective has been written yet. |
| `tasks` | `deckent://tasks` | `application/json` | Active task list parsed from `.tasks/task-*.json` files. Returns `{ tasks: [...] }` where each element is the full task JSON object. Returns `{ tasks: [] }` when no sprint is active. |
| `agents` | `deckent://agents` | `application/json` | Registered agent pool from `.deckent/agents/*/agent.json`. Returns `{ agents: [...] }` with manifest data for each registered agent (built-in pool is stored in memory; only custom/temp agents appear as files). |

---

## stdio Transport

When Claude Code runs `claude mcp add deckent -- npx deckent-mcp`, it launches `deckent-mcp` (the package binary pointing to `dist/mcp/server.js`) as a child process. The MCP SDK's `StdioServerTransport` attaches to the process's `stdin` and `stdout` streams and implements the JSON-RPC 2.0 framing expected by the MCP protocol:

- Each message is a JSON object delimited by newlines.
- The server reads requests from `stdin`, dispatches to the registered tool or resource handler, and writes the JSON response to `stdout`.
- Diagnostic and error output goes to `stderr` only, keeping `stdout` clean for the protocol.
- There is no built-in keep-alive or heartbeat at the transport level; the client process (Claude Code) monitors the child PID directly.

The singleton guard writes a PID file at `.deckent/mcp-server.pid`. If a second `deckent-mcp` process starts in the same directory and detects an existing lock with a live PID, it writes a diagnostic to stderr and exits with code 2, preventing duplicate server state.

The `McpNotificationAdapter` (`src/core/notify-adapters/mcp-adapter.ts`) uses `server.notification()` (the MCP SDK's `notifications/message` channel) to push sprint events to the client as log-level notifications. This enables `deckent_watch` to deliver a real-time event stream without polling.

---

## Adding a New Tool

1. **Implement the handler** in `src/mcp/tools/<tool-name>.ts`. Export a single `registerXxxTool(server: McpServer): void` function that calls `server.registerTool(...)`. Use Zod v4 (`zod/v4`) for the `inputSchema`. Set `annotations.readOnlyHint` and `annotations.destructiveHint` accurately — these drive permission prompts in the MCP client.

   ```typescript
   import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
   import { z } from 'zod/v4';

   export function registerMyTool(server: McpServer): void {
     server.registerTool(
       'deckent_my_tool',
       {
         title: 'My Tool',
         description: 'What this tool does for the caller.',
         annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
         inputSchema: z.object({
           root: z.string().optional().describe('Project root (default: cwd)'),
         }),
       },
       async ({ root }) => {
         const projectRoot = root ?? process.cwd();
         // implementation
         return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }] };
       },
     );
   }
   ```

2. **Register the tool** in `src/mcp/tools/index.ts`. Add the import and a `registerMyTool(server)` call inside `registerTools()`.

3. **Update documentation** in two places:
   - `docs/reference/api-surface.md` — add a row to the MCP Tool Reference table.
   - `docs/reference/mcp-tools.md` — run `npm run docs:ref` to auto-regenerate (the canonical tool list is built from source).

4. **Rebuild** with `npm run build` (`tsc + copy-assets`). MCP servers cache the compiled binary; after a rebuild, restart the MCP server in Claude Code with `/mcp restart` or by restarting the IDE.

5. **Verify** by calling the new tool from the MCP client. Tools appear in the client's tool list immediately after the server restarts with the rebuilt binary.
