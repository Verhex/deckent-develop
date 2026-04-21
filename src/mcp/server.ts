#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join } from 'node:path';
import { DECKENT_VERSION, DECKENT_DIR } from '../core/constants.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';
import { McpNotificationAdapter } from '../core/notify-adapters/mcp-adapter.js';
import { CliNotificationAdapter } from '../core/notify-adapters/cli-adapter.js';
import { FileNotificationAdapter } from '../core/notify-adapters/file-adapter.js';
import { NotifyDispatcher } from '../core/notification-dispatcher.js';
import { setGlobalNotifyDispatcher } from '../core/notify-registry.js';

export const DECKENT_MCP_INSTRUCTIONS = `
Deckent is an AI agent orchestration CLI that runs multi-agent sprints inside your project.

## Workflow
init → set_directives → plan → start → status → review → retro → cleanup

## Sprint Lifecycle
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP

## Tools (27)
- deckent_init: Initialize Deckent in the current project directory
- deckent_set_directives: Write sprint goals and task definitions to DIRECTIVES.md
- deckent_plan: Generate task plan from DIRECTIVES (mode: ai/structured/auto)
- deckent_start: Spawn workers and begin sprint execution
- deckent_status: Show live sprint progress, agent activity, and alerts
- deckent_review: Evaluate sprint results — returns GO/NO_GO/GO_WITH_TECH_DEBT
- deckent_retro: Read the retrospective and learnings from the last sprint
- deckent_history: Show sprint history with agent/skill performance stats
- deckent_doctor: Run health checks (config, locks, memory budget)
- deckent_analyze_project: Detect project stack, frameworks, and tech context
- deckent_sync: Sync agent/skill manifests and update routing rules
- deckent_config: Read or set Deckent configuration values
- deckent_run: Run a single task directly without a full sprint
- deckent_kill: Kill a running sprint or specific worker agent
- deckent_cleanup: Archive task files and release all locks after a sprint
- deckent_help: Show runtime capabilities, project status, and usage guide
- deckent_agent_list: List registered agents (built-in and temp)
- deckent_skill_list: List registered skills with manifest info
- deckent_checkpoint: Approve or reject a checkpoint gate
- deckent_docs: Sprint lifecycle document management (add/remove/list)
- deckent_explain: Explain sprint history and results
- deckent_memory_query: Search project memory across all sources (ADR, sprint, debt, pattern)
- deckent_nervous_subscribe: Subscribe to Nervous System notifications
- deckent_nervous_accept: Accept a pending nervous notification
- deckent_nervous_reject: Reject a pending nervous notification
- deckent_nervous_status: Show Nervous System dashboard (pending, recent, config)
- deckent_nervous_config: Read/set Nervous System authority mode and overrides

## Resources (8)
- deckent://dashboard — Live sprint dashboard (agents, phases, alerts)
- deckent://directives — Current DIRECTIVES.md content
- deckent://memory — Brain memory (exports/memory.md) — sprint learnings
- deckent://debt — Technical debt register (exports/debt.md)
- deckent://config — Current resolved configuration
- deckent://retro — Last sprint retrospective (DB-first, exported)
- deckent://tasks — Active task list with status
- deckent://agents — Registered agent pool with stats

## DIRECTIVES Format
\`\`\`markdown
# DIRECTIVES — Sprint NNN: Title

## Task 1: Feature Name
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/feature.ts
- Scope: src/

### Description
What to implement and why.

**Kanıt / Proof:** grep "feature" src/feature.ts → exists
**Test:** 3+ tests covering the feature
\`\`\`

## Parameters
- model: opus | sonnet | haiku
- effort: low | normal | high
- mode (plan): ai | structured | auto
- provider: claude | codex | gemini

## Error Recovery
Sprint stuck → deckent_kill → deckent_cleanup → deckent_doctor
Config issue → deckent_config read → deckent_config set key value
`.trim();

/** MCP notification adapter — bound to the server after creation. */
export let mcpNotifyAdapter: McpNotificationAdapter | null = null;

/**
 * Initialize the global NotifyDispatcher with CLI + MCP + file adapters.
 * Fire-and-forget at MCP startup so lifecycle hooks (sprint-controller,
 * sprint-finalizer, result-evaluator) can emit DECKENT→USER:NOTIFY.
 *
 * Sets DECKENT_PARENT_PID env for CliNotificationAdapter parent-TTY detection.
 */
export function initializeNotifyDispatcher(
  server: McpServer,
  projectRoot: string,
): NotifyDispatcher {
  // Set parent PID env for CLI adapter (Claude Code terminal's stdout fd on Linux)
  if (!process.env['DECKENT_PARENT_PID']) {
    process.env['DECKENT_PARENT_PID'] = String(process.ppid);
  }

  const dispatcher = new NotifyDispatcher(1000); // 1s throttle (non-critical)

  // CLI parent-TTY adapter
  dispatcher.addAdapter(new CliNotificationAdapter());

  // MCP notifications/message adapter (reuses the singleton bound below)
  const mcpAdapter = mcpNotifyAdapter ?? new McpNotificationAdapter(server);
  dispatcher.addAdapter(mcpAdapter);

  // File JSONL adapter (audit trail at .deckent/notify-log.jsonl)
  const notifyLogPath = join(projectRoot, DECKENT_DIR, 'notify-log.jsonl');
  dispatcher.addAdapter(new FileNotificationAdapter(notifyLogPath));

  setGlobalNotifyDispatcher(dispatcher);
  return dispatcher;
}

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'deckent', version: DECKENT_VERSION },
    { instructions: DECKENT_MCP_INSTRUCTIONS },
  );

  registerTools(server);
  registerResources(server);

  // Bind MCP notification adapter to this server instance
  mcpNotifyAdapter = new McpNotificationAdapter(server);

  // Initialize global dispatcher (CLI + MCP + file) for lifecycle notifications
  try {
    initializeNotifyDispatcher(server, process.cwd());
  } catch (err) {
    process.stderr.write(
      `deckent-mcp: notify dispatcher init failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`deckent-mcp error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
