import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerInitTool } from './init.js';
import { registerSetDirectivesTool } from './directives.js';
import { registerPlanTool } from './plan.js';
import { registerStartTool } from './start.js';
import { registerStatusTool } from './status.js';
import { registerDoctorTool } from './doctor.js';
import { registerRetroTool } from './retro.js';
import { registerHistoryTool } from './history.js';
import { registerAnalyzeTool } from './analyze.js';
import { registerSyncTool } from './sync.js';
import { registerConfigTool } from './config.js';
import { registerReviewTool } from './review.js';
import { registerRunTool } from './run.js';
import { registerKillTool } from './kill.js';
import { registerCleanupTool } from './cleanup.js';
import { registerHelpTool } from './help.js'; // deckent_help
import { registerAgentListTool } from './agent-list.js';
import { registerSkillListTool } from './skill-list.js';
import { registerCheckpointTool } from './checkpoint.js';
import { registerDocsTool } from './docs.js';
import { registerExplainTool } from './explain.js';
import { registerMemoryQueryTool } from './memory-query.js';
import { registerWatch } from './watch.js';
import { registerNervousTools } from './nervous.js';
import { registerFeatureQueryTool } from './feature-query.js';
import { registerAuditTool } from './audit.js';
import { registerRecoverTool } from './recover.js';
import { registerModelsTool } from './models.js';
import { registerAutonomousTool } from './autonomous.js';
import { registerProcessTool } from './process.js';
import { registerUsageTool } from './usage.js';
import { registerKpiTool } from './kpi.js';
import { registerCostTool } from './cost.js';
import { registerCatalogParityTools } from './catalog-parity.js';
import { registerAutonomousSurfaceTools } from './autonomous-surface.js';

/**
 * One entry in the canonical MCP tool catalog.
 * `readOnly` mirrors the tool's `annotations.readOnlyHint`.
 */
export interface McpToolCatalogEntry {
  name: string;
  description: string;
  readOnly: boolean;
}

/**
 * CANONICAL MCP tool catalog — the single source of truth for the tool
 * name/description/read-only list (B-MCPCATALOG-SSOT). Every consumer that
 * needs to *list* or *count* tools (e.g. `deckent_help`) must derive from this
 * array rather than maintaining its own copy, which historically drifted
 * (help.ts listed 23 while 35 were registered).
 *
 * Invariant (enforced by tests/mcp/tools/index.test.ts): this list must stay
 * byte-for-byte aligned with the tools actually registered by
 * {@link registerTools} below — same names, same read-only flags, same count.
 * Order follows registration order. server.ts's DECKENT_MCP_INSTRUCTIONS list
 * is independently guarded against registration by scripts/lint-mcp-instructions.mjs.
 */
export const TOOL_CATALOG: McpToolCatalogEntry[] = [
  { name: 'deckent_init', description: 'Initialize a Deckent project in the current directory', readOnly: false },
  { name: 'deckent_set_directives', description: 'Write or update DIRECTIVES.md with sprint goals and task definitions', readOnly: false },
  { name: 'deckent_plan', description: 'Plan the next sprint — creates task JSON files in .tasks/', readOnly: false },
  { name: 'deckent_start', description: 'Start the sprint — spawns workers and begins execution', readOnly: false },
  { name: 'deckent_status', description: 'Get the current sprint dashboard: agents, progress, usage, alerts', readOnly: true },
  { name: 'deckent_doctor', description: 'Run system health checks — config, memory, locks, providers', readOnly: true },
  { name: 'deckent_retro', description: 'Read the latest sprint retrospective (RETRO.md)', readOnly: true },
  { name: 'deckent_history', description: 'Browse sprint history and outcomes across all past sprints', readOnly: true },
  { name: 'deckent_analyze_project', description: 'Analyze project stack: language, framework, test runner, build tool', readOnly: true },
  { name: 'deckent_sync', description: 'Sync workspace files and agent/skill manifests to disk', readOnly: false },
  { name: 'deckent_config', description: 'Read, get, or set Deckent configuration values', readOnly: false },
  { name: 'deckent_review', description: 'Evaluate sprint results — returns GO / NO_GO / GO_WITH_TECH_DEBT', readOnly: true },
  { name: 'deckent_run', description: 'Run a single task directly without a full sprint', readOnly: false },
  { name: 'deckent_kill', description: 'Kill a running worker by task ID or kill all workers', readOnly: false },
  { name: 'deckent_cleanup', description: 'Archive task files and release locks after sprint completes', readOnly: false },
  { name: 'deckent_help', description: 'Get runtime capabilities, project state, and next-step recommendation', readOnly: true },
  { name: 'deckent_agent_list', description: 'List registered agents (built-in and project-specific)', readOnly: true },
  { name: 'deckent_skill_list', description: 'List registered skills with manifest and sandbox info', readOnly: true },
  { name: 'deckent_checkpoint', description: 'Approve or reject a checkpoint gate during sprint execution', readOnly: false },
  { name: 'deckent_docs', description: 'Sprint lifecycle document management (add/remove/list)', readOnly: false },
  { name: 'deckent_explain', description: 'Explain sprint history and results in natural language', readOnly: true },
  { name: 'deckent_memory_query', description: 'Search project memory across all sources (ADR, sprint, debt, pattern)', readOnly: true },
  { name: 'deckent_watch', description: 'Subscribe to the live sprint event stream via MCP logging notifications (backfill + push)', readOnly: true },
  { name: 'deckent_nervous_subscribe', description: 'Subscribe to Nervous System notifications', readOnly: true },
  { name: 'deckent_nervous_accept', description: 'Accept a pending nervous notification', readOnly: false },
  { name: 'deckent_nervous_reject', description: 'Reject a pending nervous notification', readOnly: false },
  { name: 'deckent_nervous_status', description: 'Show the Nervous System dashboard (pending, recent, config)', readOnly: true },
  { name: 'deckent_nervous_config', description: 'Read or set Nervous System authority mode and overrides', readOnly: false },
  { name: 'deckent_feature_query', description: 'Query the feature manifest by category (active/lightly_used/dormant/dead/all)', readOnly: true },
  { name: 'deckent_audit', description: 'Run the Brain Self-Audit Gate for a sprint (tsc, vitest, honesty checks)', readOnly: true },
  { name: 'deckent_recover', description: 'Recover a crashed or stuck sprint (clean orphan IPC dirs, stale locks, archive tasks)', readOnly: false },
  { name: 'deckent_models', description: 'Browse model catalog: list by provider, refresh from models.dev, look up tier', readOnly: true },
  { name: 'deckent_autonomous', description: 'Autonomous engine control surface (status/start/stop/backlog list-add-approve-reject, cron)', readOnly: false },
  { name: 'deckent_process', description: 'Process-mode execution surface (submit an ExecutionRequest → policy-gated auto-run or park; status/result by executionId)', readOnly: false },
  { name: 'deckent_usage', description: 'Show token/limit consumption from Claude Code transcripts (model table or sprint task breakdown + cache-gate)', readOnly: true },
  { name: 'deckent_kpi', description: 'Show the KPI scorecard for a sprint — returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics', readOnly: true },
  { name: 'deckent_cost', description: 'Show cost config: budget limits, per-model pricing (input/output per MTok), and today\'s spend from the resource log', readOnly: true },
  // PARITY-CLI-MCP (359-011) + AUTONOMOUS-MCP (359-016) — registered by CC debt-payment
  // (both modules landed with honest "not wired into live server" GO_WITH_TECH_DEBT notes).
  { name: 'deckent_agent_manage', description: 'Manage the agent pool: add/remove/promote agents (CLI parity)', readOnly: false },
  { name: 'deckent_skill_manage', description: 'Manage the skill pool: add/remove + marketplace list (CLI parity)', readOnly: false },
  { name: 'deckent_memory_manage', description: 'Manage project memory: insert/update entries + trigger decay (CLI parity; query via deckent_memory_query)', readOnly: false },
  { name: 'deckent_autonomous_backlog', description: 'List/add/remove autonomous-engine backlog entries', readOnly: false },
  { name: 'deckent_autonomous_status', description: 'Read-only autonomous-engine status snapshot', readOnly: true },
];

/** Canonical count of registered MCP tools, derived from {@link TOOL_CATALOG}. */
export const MCP_TOOL_COUNT = TOOL_CATALOG.length;

export function registerTools(server: McpServer): void {
  registerInitTool(server);
  registerSetDirectivesTool(server);
  registerPlanTool(server);
  registerStartTool(server);
  registerStatusTool(server);
  registerDoctorTool(server);
  registerRetroTool(server);
  registerHistoryTool(server);
  registerAnalyzeTool(server);
  registerSyncTool(server);
  registerConfigTool(server);
  registerReviewTool(server);
  registerRunTool(server);
  registerKillTool(server);
  registerCleanupTool(server);
  registerHelpTool(server);
  registerAgentListTool(server);
  registerSkillListTool(server);
  registerCheckpointTool(server);
  registerDocsTool(server);
  registerExplainTool(server);
  registerMemoryQueryTool(server);
  registerWatch(server);
  registerNervousTools(server);
  registerFeatureQueryTool(server);
  registerAuditTool(server);
  registerRecoverTool(server);
  registerModelsTool(server);
  registerAutonomousTool(server);
  registerProcessTool(server);
  registerUsageTool(server);
  registerKpiTool(server);
  registerCostTool(server);
  registerCatalogParityTools(server);
  registerAutonomousSurfaceTools(server);
}
