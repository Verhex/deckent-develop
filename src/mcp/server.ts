#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DECKENT_VERSION } from '../core/constants.js';
import { registerTools } from './tools/index.js';
import { setMcpToolDescriptionLanguage } from './tools/description-catalog.js';
import { registerResources } from './resources/index.js';
import { McpNotificationAdapter } from '../core/notify-adapters/mcp-adapter.js';
import { NotifyDispatcher } from '../core/notification-dispatcher.js';
import { bootstrapNotifyDispatcher } from '../core/notify-bootstrap.js';
import { installWriterLeaseGate, type WriterLeaseGateContext } from './writer-lease-gate.js';
import { installWriterLeaseReleaseHooks } from './writer-lease.js';
import { getLanguage } from '../cli/helpers/messages.js';
import { loadConfig } from '../core/config.js';
import { modelRegistry, LEGACY_MODEL_ALIASES } from '../core/model-registry.js';
import type { AttendedExecutionApprovalAuthority } from '../core/attended-execution-approval.js';
import { bootstrapApprovalAuthority } from '../core/approval-authority-bootstrap.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import { openLocalProviderAuthorityRuntimeIfConfigured } from '../providers/provider-authority-runtime-bootstrap.js';

// 454-004: the DIRECTIVES-format example + Parameters reference below must
// teach an exact provider API ID + explicit provider ownership — never a
// retired alias (LEGACY_MODEL_ALIASES). resolveCanonicalModelIdentity() throws
// E_LEGACY_MODEL_ALIAS on "opus"/"sonnet"/"haiku"/"gpt-5"/"gpt-5.6", so documenting them
// as valid "Model:" values would teach a broken DIRECTIVES.md. Derived from the
// registry so the instructions track the live catalog instead of a hardcode.
function requireMcpExampleModel(tier: 'economy' | 'standard' | 'premium'): string {
  const model = modelRegistry.getByProviderAndTier('claude', tier);
  if (!model) throw new Error(`E_MCP_EXAMPLE_MODEL_UNAVAILABLE: tier=${tier}`);
  return model.id;
}
const MCP_EXAMPLE_MODEL_ID = requireMcpExampleModel('standard');
const MCP_MODEL_TIER_EXAMPLES = [
  requireMcpExampleModel('premium'),
  MCP_EXAMPLE_MODEL_ID,
  requireMcpExampleModel('economy'),
].join(', ');
const MCP_REJECTED_LEGACY_ALIASES = Object.keys(LEGACY_MODEL_ALIASES).join('/');

export const DECKENT_MCP_INSTRUCTIONS = `
Deckent is an AI agent orchestration CLI that runs multi-agent runs inside your project.

## Workflow
init → set_directives → plan → start → status → review → retro → cleanup

## Run Lifecycle
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → COMPLETE (cleanup is a separate command, not a phase)

## Tools (51)
- deckent_init: Initialize Deckent in the current project directory
- deckent_set_directives: Write run goals and task definitions to DIRECTIVES.md
- deckent_plan: Generate task plan from DIRECTIVES (mode: ai/structured/auto)
- deckent_start: Spawn workers and begin run execution (pre-spawn cost gate active — over-budget runs return COST_GATE_EXCEEDED unless acknowledgeCost=true)
- deckent_status: Show live run progress, agent activity, and alerts
- deckent_inspect: Inspect logical runs — run listing or task drill-down from the canonical inspector read-model
- deckent_review: Evaluate run results — returns GO/NO_GO/GO_WITH_TECH_DEBT
- deckent_retro: Read the retrospective and learnings from the last run
- deckent_history: Show run history with agent/skill performance stats
- deckent_doctor: Run health checks (config, locks, memory budget)
- deckent_analyze_project: Detect project stack, frameworks, and tech context
- deckent_sync: Sync agent/skill manifests and update routing rules
- deckent_config: Read or set Deckent configuration values
- deckent_run: Run a single task directly without a full run
- deckent_kill: Kill a running run or specific worker agent
- deckent_cleanup: Archive task files and release all locks after a run
- deckent_help: Show runtime capabilities, project status, and usage guide
- deckent_agent_list: List registered agents (built-in and temp)
- deckent_skill_list: List registered skills with manifest info
- deckent_checkpoint: Approve or reject a checkpoint gate
- deckent_docs: Run lifecycle document management (add/remove/list)
- deckent_explain: Explain run history and results
- deckent_memory_query: Search project memory across all sources (ADR, run, debt, pattern)
- deckent_watch: Subscribe to live run event stream via MCP logging notifications (backfill + push)
- deckent_nervous_subscribe: Subscribe to Nervous System notifications
- deckent_nervous_accept: Accept a pending nervous notification
- deckent_nervous_reject: Reject a pending nervous notification
- deckent_nervous_status: Show Nervous System dashboard (pending, recent, config)
- deckent_nervous_config: Read/set Nervous System authority mode and overrides
- deckent_feature_query: Query feature manifest by category (active/lightly_used/dormant/dead/all)
- deckent_truth: Feature truth-chain report (code/wired/enabled/proof per feature) — read-only
- deckent_audit: Run Brain Self-Audit Gate for a run (tsc, vitest, honesty checks) — read-only
- deckent_recover: Recover a crashed or stuck run (clean orphan IPC dirs, stale locks, archive tasks) — destructive
- deckent_models: List and refresh model catalog (live fetch from models.dev with 24h cache + bundled fallback)
- deckent_autonomous: Autonomous engine control surface (status/start/stop/backlog list-add-approve-reject, cron support)
- deckent_process: Process-mode execution surface (submit an ExecutionRequest → policy-gated auto-run or park; status/result by executionId — ERP / business automation)
- deckent_usage: Show token/limit consumption from Claude Code transcripts (model table or run task breakdown + cache-gate)
- deckent_xverify: Cross-verify a claim on a different provider; host derives CONFIRMED/REFUTED/UNCLEAR + ALLOW/NO-GO/HOLD
- deckent_cost: Show cost config: budget limits, per-model pricing (input/output per MTok), and today's spend from the resource log
- deckent_agent_manage: Manage the agent pool: add/remove/promote agents (CLI parity)
- deckent_skill_manage: Manage the skill pool: add/remove + marketplace list (CLI parity)
- deckent_memory_manage: Manage project memory: insert/update entries + trigger decay (CLI parity)
- deckent_autonomous_backlog: List/add/remove autonomous-engine backlog entries
- deckent_autonomous_status: Read-only autonomous-engine status snapshot
- deckent_nervous_edit: Edit-and-accept a pending nervous suggestion (returns an exec-free plan)
- deckent_nervous_undo: Plan an undo for the last accepted nervous suggestion (honest-unsupported when unavailable)
- deckent_autonomous_approve: Approve an approval-required autonomous backlog entry
- deckent_autonomous_reject: Reject an approval-required autonomous backlog entry
- deckent_execution_authority: Inspect or reconcile namespace-local execution-authority mount metadata
- deckent_kpi: Show the KPI scorecard for a run — returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics
- deckent_approvals: List pending runtime approval requests (read-only) over the canonical ApprovalBroker; deciding stays CLI-only behind interactive live-auth

## Resources (8)
- deckent://dashboard — Live run dashboard (agents, phases, alerts)
- deckent://directives — Current DIRECTIVES.md content
- deckent://memory — Brain memory (exports/memory.md) — run learnings
- deckent://debt — Technical debt register (exports/debt.md)
- deckent://config — Current resolved configuration
- deckent://retro — Last run retrospective (DB-first, exported)
- deckent://tasks — Active task list with status
- deckent://agents — Registered agent pool with stats

## DIRECTIVES Format
\`\`\`markdown
# DIRECTIVES — Run NNN: Title

## Task 1: Feature Name
- Model: ${MCP_EXAMPLE_MODEL_ID}
- Provider: claude
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
- model: an exact provider API ID (e.g. ${MCP_MODEL_TIER_EXAMPLES}) — resolved through the canonical registry (deckent_models); legacy aliases (${MCP_REJECTED_LEGACY_ALIASES}) are rejected
- provider: claude | codex | gemini — explicit ownership of the model id, required when it can't be inferred from the id's prefix
- effort: low | normal | high
- mode (plan): ai | structured | auto

## Error Recovery
Run stuck → deckent_kill → deckent_cleanup → deckent_doctor
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

export interface DeckentMcpServerContext extends Partial<WriterLeaseGateContext> {
  attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
  providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
}

export function createServer(ctx?: DeckentMcpServerContext): McpServer {
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

  // 559-004: tool descriptions resolve from the shared MESSAGES catalog, so the
  // surface language must be seeded from the canonical config-backed resolution
  // BEFORE any tool registers — a description is read at registration time.
  setMcpToolDescriptionLanguage(gateCtx.lang);

  registerTools(server, {
    ...(ctx?.attendedExecutionApprovalAuthority
      ? { attendedExecutionApprovalAuthority: ctx.attendedExecutionApprovalAuthority }
      : {}),
    ...(ctx?.providerAuthority
      ? { providerAuthority: ctx.providerAuthority }
      : {}),
  });
  // 404-002 + CC follow-up (2026-07-11): deckent_truth registration moved into
  // registerTools() (tools/index.ts SSOT) — catalog, derived count and help all
  // derive from the single source again.
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
  let attendedExecutionApprovalAuthority: AttendedExecutionApprovalAuthority | undefined;
  let providerAuthority: ProviderAuthorityRuntimeServiceOpenResult | undefined;
  try {
    const config = await loadConfig(root);
    lang = getLanguage(config.language);
    providerAuthority = openLocalProviderAuthorityRuntimeIfConfigured(root, config);
    const approvalAuthority = bootstrapApprovalAuthority(root, config);
    if (approvalAuthority.state === 'ready') {
      attendedExecutionApprovalAuthority =
        approvalAuthority.runtime.attendedExecutionApprovalAuthority;
    }
  } catch {
    // default 'en' — config load is best-effort for the denial locale
  }
  if (providerAuthority) {
    process.on('exit', () => {
      try { providerAuthority?.close(); } catch { /* process-exit best effort */ }
    });
  }
  installWriterLeaseReleaseHooks(root);
  const server = createServer({
    projectRoot: root,
    lang,
    ...(attendedExecutionApprovalAuthority
      ? { attendedExecutionApprovalAuthority }
      : {}),
    ...(providerAuthority ? { providerAuthority } : {}),
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Decide whether this module is the invoked executable, resolving npm-style
 * binary symlinks to the same filesystem identity as the module URL.
 *
 * @param moduleUrl - The current module's `import.meta.url`.
 * @param argvPath - The executable path supplied in `process.argv[1]`.
 * @returns Whether both paths resolve to the same existing filesystem object.
 */
export function isMcpEntryPoint(
  moduleUrl: string,
  argvPath: string | undefined,
): boolean {
  if (argvPath === undefined) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

/** Compatibility wrapper for callers using the original argv-first API. */
export function isMcpServerEntryPoint(
  argvPath: string | undefined,
  moduleUrl: string = import.meta.url,
): boolean {
  return isMcpEntryPoint(moduleUrl, argvPath);
}

if (isMcpEntryPoint(import.meta.url, process.argv[1])) {
  main().catch((err: unknown) => {
    process.stderr.write(`deckent-mcp error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
