#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DECKENT_VERSION } from '../core/constants.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';

export const DECKENT_MCP_INSTRUCTIONS = `
Deckent is an AI agent orchestration CLI that runs multi-agent sprints inside your project.

## Workflow
init → set_directives → plan → start → status → review → retro → cleanup

## Sprint Lifecycle
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP

## Tools (16)
- deckent_init: Initialize Deckent in the current project directory
- deckent_set_directives: Write sprint goals and task definitions to DIRECTIVES.md
- deckent_plan: Generate task plan from DIRECTIVES (mode: ai/structured/auto)
- deckent_start: Spawn workers and begin sprint execution
- deckent_status: Show live sprint progress, agent activity, and alerts
- deckent_review: Evaluate sprint results — returns GO/NO_GO/GO_WITH_TECH_DEBT
- deckent_retro: Read the retrospective and learnings from the last sprint
- deckent_history: Show sprint history with agent/skill performance stats
- deckent_doctor: Run health checks (config, locks, usage, memory budget)
- deckent_analyze_project: Detect project stack, frameworks, and tech context
- deckent_sync: Sync agent/skill manifests and update routing rules
- deckent_config: Read or set Deckent configuration values
- deckent_usage: Show token and cost usage across sprints
- deckent_run: Run a single task directly without a full sprint
- deckent_kill: Kill a running sprint or specific worker agent
- deckent_cleanup: Archive task files and release all locks after a sprint

## Resources (9)
- deckent://dashboard — Live sprint dashboard (agents, phases, alerts)
- deckent://directives — Current DIRECTIVES.md content
- deckent://memory — Brain memory (MEMORY.md) — sprint learnings
- deckent://debt — Technical debt log (DEBT.md)
- deckent://config — Current resolved configuration
- deckent://retro — Last sprint retrospective (RETRO.md)
- deckent://usage — Token and cost usage summary
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

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'deckent', version: DECKENT_VERSION },
    { instructions: DECKENT_MCP_INSTRUCTIONS },
  );

  registerTools(server);
  registerResources(server);

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
