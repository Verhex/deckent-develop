// ═══ Canonical MCP Tool Catalog ═════════════════════════════════════════════
// Pure catalog leaf: registration, help, workspace documentation and parity
// checks all consume this module without loading MCP tool implementations.

export type McpToolSideEffectClass = 'read-only' | 'mutating' | 'destructive';

export interface McpToolAnnotationHints {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
}

export interface McpToolCatalogSource {
  name: string;
  description: string;
  sideEffect: McpToolSideEffectClass;
  idempotent?: boolean;
}

export interface McpToolCatalogEntry extends McpToolCatalogSource {
  annotations: McpToolAnnotationHints;
  readOnly: boolean;
}

export function deriveMcpToolAnnotations(entry: McpToolCatalogSource): McpToolAnnotationHints {
  return {
    readOnlyHint: entry.sideEffect === 'read-only',
    destructiveHint: entry.sideEffect === 'destructive',
    idempotentHint: entry.idempotent ?? entry.sideEffect === 'read-only',
  };
}

const TOOL_CATALOG_SOURCE: readonly McpToolCatalogSource[] = [
  { name: 'deckent_init', description: 'Initialize a Deckent project in the current directory', sideEffect: 'mutating', idempotent: true },
  { name: 'deckent_set_directives', description: 'Write or update DIRECTIVES.md with run goals and task definitions', sideEffect: 'mutating' },
  { name: 'deckent_plan', description: 'Plan the next run — creates task JSON files in .tasks/', sideEffect: 'mutating' },
  { name: 'deckent_start', description: 'Start the run — spawns workers and begins execution', sideEffect: 'mutating' },
  { name: 'deckent_status', description: 'Get the current run dashboard: agents, progress, usage, alerts', sideEffect: 'read-only' },
  { name: 'deckent_inspect', description: 'Inspect logical runs via the canonical inspector read-model — run listing or task drill-down (CLI `deckent inspect` parity)', sideEffect: 'read-only' },
  { name: 'deckent_doctor', description: 'Run system health checks — config, memory, locks, providers', sideEffect: 'read-only' },
  { name: 'deckent_retro', description: 'Read the latest run retrospective (RETRO.md)', sideEffect: 'read-only' },
  { name: 'deckent_history', description: 'Browse run history and outcomes across all past runs', sideEffect: 'read-only' },
  { name: 'deckent_analyze_project', description: 'Analyze project stack: language, framework, test runner, build tool', sideEffect: 'read-only' },
  { name: 'deckent_sync', description: 'Sync workspace files and agent/skill manifests to disk', sideEffect: 'mutating', idempotent: true },
  { name: 'deckent_config', description: 'Read, get, or set Deckent configuration values', sideEffect: 'mutating' },
  { name: 'deckent_review', description: 'Evaluate run results — returns GO / NO_GO / GO_WITH_TECH_DEBT', sideEffect: 'read-only' },
  { name: 'deckent_run', description: 'Run a single task directly without a full run', sideEffect: 'mutating' },
  { name: 'deckent_kill', description: 'Kill a running worker by task ID or kill all workers', sideEffect: 'destructive' },
  { name: 'deckent_cleanup', description: 'Archive task files and release locks after run completes', sideEffect: 'destructive' },
  { name: 'deckent_help', description: 'Get runtime capabilities, project state, and next-step recommendation', sideEffect: 'read-only' },
  { name: 'deckent_agent_list', description: 'List registered agents (built-in and project-specific)', sideEffect: 'read-only' },
  { name: 'deckent_skill_list', description: 'List registered skills with manifest and sandbox info', sideEffect: 'read-only' },
  { name: 'deckent_checkpoint', description: 'Approve or reject a checkpoint gate during run execution', sideEffect: 'mutating' },
  { name: 'deckent_docs', description: 'Run lifecycle document management (add/remove/list)', sideEffect: 'mutating', idempotent: true },
  { name: 'deckent_explain', description: 'Explain run history and results in natural language', sideEffect: 'read-only' },
  { name: 'deckent_memory_query', description: 'Search project memory across all sources (ADR, run, debt, pattern)', sideEffect: 'read-only' },
  { name: 'deckent_watch', description: 'Subscribe to the live run event stream via MCP logging notifications (backfill + push)', sideEffect: 'read-only' },
  { name: 'deckent_nervous_subscribe', description: 'Subscribe to Nervous System notifications', sideEffect: 'read-only' },
  { name: 'deckent_nervous_accept', description: 'Accept a pending nervous notification', sideEffect: 'mutating' },
  { name: 'deckent_nervous_reject', description: 'Reject a pending nervous notification', sideEffect: 'mutating' },
  { name: 'deckent_nervous_status', description: 'Show the Nervous System dashboard (pending, recent, config)', sideEffect: 'read-only' },
  { name: 'deckent_nervous_config', description: 'Read or set Nervous System authority mode and overrides', sideEffect: 'mutating' },
  { name: 'deckent_feature_query', description: 'Query the feature manifest by category (active/lightly_used/dormant/dead/all)', sideEffect: 'read-only' },
  { name: 'deckent_truth', description: 'Feature truth-chain report: code -> wired -> enabled -> proof per feature (born-640)', sideEffect: 'read-only' },
  { name: 'deckent_audit', description: 'Run the Brain Self-Audit Gate for a run (tsc, vitest, honesty checks)', sideEffect: 'destructive' },
  { name: 'deckent_recover', description: 'Recover a crashed or stuck run (clean orphan IPC dirs, stale locks, archive tasks)', sideEffect: 'destructive' },
  { name: 'deckent_models', description: 'Browse model catalog: list by provider, refresh from models.dev, look up tier', sideEffect: 'mutating' },
  { name: 'deckent_autonomous', description: 'Autonomous engine control surface (status/start/stop/backlog list-add-approve-reject, cron)', sideEffect: 'mutating' },
  { name: 'deckent_process', description: 'Process-mode execution surface (submit an ExecutionRequest → policy-gated auto-run or park; status/result by executionId)', sideEffect: 'mutating' },
  { name: 'deckent_usage', description: 'Show token/limit consumption from Claude Code transcripts (model table or run task breakdown + cache-gate)', sideEffect: 'read-only' },
  { name: 'deckent_xverify', description: 'Cross-verify a claim on a DIFFERENT provider; host returns typed verdict + ALLOW/NO-GO/HOLD disposition', sideEffect: 'mutating' },
  { name: 'deckent_kpi', description: 'Show the KPI scorecard for a run — returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics', sideEffect: 'read-only' },
  { name: 'deckent_cost', description: 'Show cost config: budget limits, per-model pricing (input/output per MTok), and today\'s spend from the resource log', sideEffect: 'read-only' },
  { name: 'deckent_agent_manage', description: 'Manage the agent pool: add/remove/promote agents (CLI parity)', sideEffect: 'destructive' },
  { name: 'deckent_skill_manage', description: 'Manage the skill pool: add/remove + marketplace list (CLI parity)', sideEffect: 'destructive' },
  { name: 'deckent_memory_manage', description: 'Manage project memory: insert/update entries + trigger decay (CLI parity; query via deckent_memory_query)', sideEffect: 'destructive' },
  { name: 'deckent_autonomous_backlog', description: 'List/add/remove autonomous-engine backlog entries', sideEffect: 'destructive' },
  { name: 'deckent_autonomous_status', description: 'Read-only autonomous-engine status snapshot', sideEffect: 'read-only' },
  { name: 'deckent_nervous_edit', description: 'Edit-and-accept a pending nervous suggestion (returns an exec-free plan)', sideEffect: 'read-only' },
  { name: 'deckent_nervous_undo', description: 'Plan an undo for the last accepted nervous suggestion (honest-unsupported when unavailable)', sideEffect: 'read-only' },
  { name: 'deckent_autonomous_approve', description: 'Approve an approval-required autonomous backlog entry', sideEffect: 'mutating' },
  { name: 'deckent_autonomous_reject', description: 'Reject an approval-required autonomous backlog entry', sideEffect: 'mutating' },
  { name: 'deckent_execution_authority', description: 'Inspect or reconcile namespace-local execution-authority mount metadata', sideEffect: 'mutating', idempotent: true },
  { name: 'deckent_approvals', description: 'List pending runtime approval requests (read-only) over the canonical ApprovalBroker; deciding stays CLI-only behind interactive live-auth', sideEffect: 'read-only' },
];

export const TOOL_CATALOG: McpToolCatalogEntry[] = TOOL_CATALOG_SOURCE.map((entry) => {
    const annotations = deriveMcpToolAnnotations(entry);
    return { ...entry, annotations, readOnly: annotations.readOnlyHint };
  });

export const MCP_TOOL_COUNT = TOOL_CATALOG.length;
