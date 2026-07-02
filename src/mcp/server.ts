#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECKENT_VERSION } from '../core/constants.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';
import { McpNotificationAdapter } from '../core/notify-adapters/mcp-adapter.js';
import { NotifyDispatcher } from '../core/notification-dispatcher.js';
import { bootstrapNotifyDispatcher } from '../core/notify-bootstrap.js';
import { installWriterLeaseGate, type WriterLeaseGateContext } from './writer-lease-gate.js';
import { installWriterLeaseReleaseHooks } from './writer-lease.js';
import { getLanguage } from '../cli/helpers/messages.js';
import { loadConfig } from '../core/config.js';

export const DECKENT_MCP_INSTRUCTIONS = `
Deckent is an AI agent orchestration CLI that runs multi-agent sprints inside your project.

## Workflow
init → set_directives → plan → start → status → review → retro → cleanup

## Sprint Lifecycle
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP

## Tools (44)
- deckent_init: Initialize Deckent in the current project directory
- deckent_set_directives: Write sprint goals and task definitions to DIRECTIVES.md
- deckent_plan: Generate task plan from DIRECTIVES (mode: ai/structured/auto)
- deckent_start: Spawn workers and begin sprint execution (pre-spawn cost gate active — over-budget runs return COST_GATE_EXCEEDED unless acknowledgeCost=true)
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
- deckent_watch: Subscribe to live sprint event stream via MCP logging notifications (backfill + push)
- deckent_nervous_subscribe: Subscribe to Nervous System notifications
- deckent_nervous_accept: Accept a pending nervous notification
- deckent_nervous_reject: Reject a pending nervous notification
- deckent_nervous_status: Show Nervous System dashboard (pending, recent, config)
- deckent_nervous_config: Read/set Nervous System authority mode and overrides
- deckent_feature_query: Query feature manifest by category (active/lightly_used/dormant/dead/all)
- deckent_audit: Run Brain Self-Audit Gate for a sprint (tsc, vitest, honesty checks) — read-only
- deckent_recover: Recover a crashed or stuck sprint (clean orphan IPC dirs, stale locks, archive tasks) — destructive
- deckent_models: List and refresh model catalog (live fetch from models.dev with 24h cache + bundled fallback)
- deckent_autonomous: Autonomous engine control surface (status/start/stop/backlog list-add-approve-reject, cron support)
- deckent_process: Process-mode execution surface (submit an ExecutionRequest → policy-gated auto-run or park; status/result by executionId — ERP / business automation)
- deckent_usage: Show token/limit consumption from Claude Code transcripts (model table or sprint task breakdown + cache-gate)
- deckent_cost: Show cost config: budget limits, per-model pricing (input/output per MTok), and today's spend from the resource log
- deckent_agent_manage: Manage the agent pool: add/remove/promote agents (CLI parity)
- deckent_skill_manage: Manage the skill pool: add/remove + marketplace list (CLI parity)
- deckent_memory_manage: Manage project memory: insert/update entries + trigger decay (CLI parity)
- deckent_autonomous_backlog: List/add/remove autonomous-engine backlog entries
- deckent_autonomous_status: Read-only autonomous-engine status snapshot
- deckent_nervous_edit: Edit-and-accept a pending nervous suggestion (returns an exec-free plan)
- deckent_nervous_undo: Plan an undo for the last accepted nervous suggestion (honest-unsupported when unavailable)
- deckent_kpi: Show the KPI scorecard for a sprint — returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics

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
 * Delegates the CLI + file adapter wiring to the backend-agnostic
 * bootstrapNotifyDispatcher (WIRE-001), passing the MCP adapter as an extra so
 * adapter order (CLI → MCP → file) and parent-TTY env setup stay identical.
 */
export function initializeNotifyDispatcher(
  server: McpServer,
  projectRoot: string,
): NotifyDispatcher {
  // MCP notifications/message adapter (reuses the adapter wired in createServer)
  const mcpAdapter = mcpNotifyAdapter ?? new McpNotificationAdapter(server);
  return bootstrapNotifyDispatcher({
    projectRoot,
    extraAdapters: [mcpAdapter],
  });
}

export function createServer(ctx?: Partial<WriterLeaseGateContext>): McpServer {
  const server = new McpServer(
    { name: 'deckent', version: DECKENT_VERSION },
    { instructions: DECKENT_MCP_INSTRUCTIONS },
  );

  const gateCtx: WriterLeaseGateContext = {
    projectRoot: ctx?.projectRoot ?? process.cwd(),
    lang: ctx?.lang ?? getLanguage(),
    ttlMs: ctx?.ttlMs,
  };
  installWriterLeaseGate(server, gateCtx);

  registerTools(server);
  registerResources(server);

  mcpNotifyAdapter = new McpNotificationAdapter(server);
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
  const root = process.cwd();
  let lang = 'en';
  try {
    const config = await loadConfig(root);
    lang = getLanguage(config.language);
  } catch {
    // default 'en' — config load is best-effort for the denial locale
  }
  installWriterLeaseReleaseHooks(root);
  const server = createServer({ projectRoot: root, lang });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isEntryPoint) {
  main().catch((err: unknown) => {
    process.stderr.write(`deckent-mcp error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
