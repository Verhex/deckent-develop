import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AttendedExecutionApprovalAuthority } from '../../core/attended-execution-approval.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
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
import { registerTruthTool } from './truth.js';
import { registerAuditTool } from './audit.js';
import { registerRecoverTool } from './recover.js';
import { registerModelsTool } from './models.js';
import { registerAutonomousTool } from './autonomous.js';
import { registerProcessTool } from './process.js';
import { registerUsageTool } from './usage.js';
import { registerXverifyTool } from './xverify.js';
import { registerKpiTool } from './kpi.js';
import { registerCostTool } from './cost.js';
import { registerCatalogParityTools } from './catalog-parity.js';
import { registerAutonomousSurfaceTools } from './autonomous-surface.js';
import { registerNervousEditTools } from './nervous-edit.js';
import { registerAutonomousApprovalTools } from './autonomous-approval.js';
import { registerExecutionAuthorityTool } from './execution-authority.js';

/**
 * WIDEST-SIDE-EFFECT ANNOTATION CONTRACT (row 490, sprint-509) — typed decision.
 *
 * A tool is classified by the *widest* effect any of its actions CAN produce, never
 * by its default or most common action. MCP clients treat `readOnlyHint: true` as
 * permission to skip an approval prompt, so an understated hint is a security defect,
 * not a cosmetic one. Concretely: `deckent_audit` defaults to a read-mostly gate run,
 * but that path writes `.deckent/{sprintId}-gate.json` and `action="retention"` with
 * `apply=true` permanently prunes audit events — so it declares `destructive`.
 *
 * - `read-only`  — cannot mutate any state the host cares about.
 * - `mutating`   — can create/update state (files, caches, processes, remote calls).
 * - `destructive`— can delete or irreversibly overwrite existing state.
 */
export type McpToolSideEffectClass = 'read-only' | 'mutating' | 'destructive';

/** The MCP tool-annotation hints Deckent owns for every registered tool. */
export interface McpToolAnnotationHints {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
}

/**
 * A catalog row as hand-written. The side-effect class is the ONLY place a tool's
 * effect is declared; the annotation hints below are derived from it, never typed
 * twice (that duplication is exactly how row 490's three wrong audit hints survived).
 */
interface McpToolCatalogSource {
  name: string;
  description: string;
  sideEffect: McpToolSideEffectClass;
  /**
   * Explicit idempotency when it differs from the class default (read-only → true,
   * mutating/destructive → false) — e.g. `deckent_init`/`deckent_sync` converge to the
   * same state when re-run with the same arguments.
   */
  idempotent?: boolean;
}

/**
 * One entry in the canonical MCP tool catalog.
 * `annotations` is the SSOT for what {@link registerTools} declares to clients, and
 * `readOnly` mirrors `annotations.readOnlyHint` (derived — never hand-set).
 */
export interface McpToolCatalogEntry extends McpToolCatalogSource {
  annotations: McpToolAnnotationHints;
  readOnly: boolean;
}

/** Derive the MCP annotation triple from a tool's side-effect class. */
function deriveAnnotations(entry: McpToolCatalogSource): McpToolAnnotationHints {
  return {
    readOnlyHint: entry.sideEffect === 'read-only',
    destructiveHint: entry.sideEffect === 'destructive',
    idempotentHint: entry.idempotent ?? entry.sideEffect === 'read-only',
  };
}

/**
 * CANONICAL MCP tool catalog — the single source of truth for the tool
 * name/description/side-effect list (B-MCPCATALOG-SSOT). Every consumer that
 * needs to *list* or *count* tools (e.g. `deckent_help`) must derive from this
 * array rather than maintaining its own copy, which historically drifted
 * (help.ts listed 23 while 35 were registered).
 *
 * Invariant (enforced by tests/mcp/tools/index.test.ts + tests/mcp/annotation-parity.test.ts):
 * this list must stay byte-for-byte aligned with the tools actually registered by
 * {@link registerTools} below — same names, same side-effect classes, same count — and
 * every declared class must be at least as wide as what the tool's module can actually do.
 * Order follows registration order. server.ts's DECKENT_MCP_INSTRUCTIONS list
 * is independently guarded against registration by scripts/lint-mcp-instructions.mjs.
 */
const TOOL_CATALOG_SOURCE: readonly McpToolCatalogSource[] = [
  { name: 'deckent_init', description: 'Initialize a Deckent project in the current directory', sideEffect: 'mutating', idempotent: true },
  { name: 'deckent_set_directives', description: 'Write or update DIRECTIVES.md with run goals and task definitions', sideEffect: 'mutating' },
  { name: 'deckent_plan', description: 'Plan the next run — creates task JSON files in .tasks/', sideEffect: 'mutating' },
  { name: 'deckent_start', description: 'Start the run — spawns workers and begins execution', sideEffect: 'mutating' },
  { name: 'deckent_status', description: 'Get the current run dashboard: agents, progress, usage, alerts', sideEffect: 'read-only' },
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
  // row 490: the gate action writes .deckent/{sprintId}-gate.json (audit.ts writeFileSync) and
  // action="retention" apply=true permanently prunes audit events — widest class wins.
  { name: 'deckent_audit', description: 'Run the Brain Self-Audit Gate for a run (tsc, vitest, honesty checks)', sideEffect: 'destructive' },
  { name: 'deckent_recover', description: 'Recover a crashed or stuck run (clean orphan IPC dirs, stale locks, archive tasks)', sideEffect: 'destructive' },
  // row 490: action="refresh" force-refreshes from models.dev and invalidates/rewrites the
  // 24h catalog cache — a network call plus a cache write, not a read.
  { name: 'deckent_models', description: 'Browse model catalog: list by provider, refresh from models.dev, look up tier', sideEffect: 'mutating' },
  { name: 'deckent_autonomous', description: 'Autonomous engine control surface (status/start/stop/backlog list-add-approve-reject, cron)', sideEffect: 'mutating' },
  { name: 'deckent_process', description: 'Process-mode execution surface (submit an ExecutionRequest → policy-gated auto-run or park; status/result by executionId)', sideEffect: 'mutating' },
  { name: 'deckent_usage', description: 'Show token/limit consumption from Claude Code transcripts (model table or run task breakdown + cache-gate)', sideEffect: 'read-only' },
  { name: 'deckent_xverify', description: 'Cross-verify a claim on a DIFFERENT provider; host returns typed verdict + ALLOW/NO-GO/HOLD disposition', sideEffect: 'mutating' },
  { name: 'deckent_kpi', description: 'Show the KPI scorecard for a run — returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics', sideEffect: 'read-only' },
  { name: 'deckent_cost', description: 'Show cost config: budget limits, per-model pricing (input/output per MTok), and today\'s spend from the resource log', sideEffect: 'read-only' },
  // PARITY-CLI-MCP (359-011) + AUTONOMOUS-MCP (359-016) — registered by CC debt-payment
  // (both modules landed with honest "not wired into live server" GO_WITH_TECH_DEBT notes).
  { name: 'deckent_agent_manage', description: 'Manage the agent pool: add/remove/promote agents (CLI parity)', sideEffect: 'destructive' },
  { name: 'deckent_skill_manage', description: 'Manage the skill pool: add/remove + marketplace list (CLI parity)', sideEffect: 'destructive' },
  { name: 'deckent_memory_manage', description: 'Manage project memory: insert/update entries + trigger decay (CLI parity; query via deckent_memory_query)', sideEffect: 'destructive' },
  { name: 'deckent_autonomous_backlog', description: 'List/add/remove autonomous-engine backlog entries', sideEffect: 'destructive' },
  { name: 'deckent_autonomous_status', description: 'Read-only autonomous-engine status snapshot', sideEffect: 'read-only' },
  // DEFER-002 (361-014) — nervous edit/undo plan-tools (exec-free)
  { name: 'deckent_nervous_edit', description: 'Edit-and-accept a pending nervous suggestion (returns an exec-free plan)', sideEffect: 'read-only' },
  { name: 'deckent_nervous_undo', description: 'Plan an undo for the last accepted nervous suggestion (honest-unsupported when unavailable)', sideEffect: 'read-only' },
  // DEFER-001 (363-011) — autonomous approval decisions
  { name: 'deckent_autonomous_approve', description: 'Approve an approval-required autonomous backlog entry', sideEffect: 'mutating' },
  { name: 'deckent_autonomous_reject', description: 'Reject an approval-required autonomous backlog entry', sideEffect: 'mutating' },
  { name: 'deckent_execution_authority', description: 'Inspect or reconcile namespace-local execution-authority mount metadata', sideEffect: 'mutating', idempotent: true },
];

/** Canonical MCP tool catalog with derived annotations (see {@link TOOL_CATALOG_SOURCE}). */
export const TOOL_CATALOG: McpToolCatalogEntry[] = TOOL_CATALOG_SOURCE.map((entry) => {
  const annotations = deriveAnnotations(entry);
  return { ...entry, annotations, readOnly: annotations.readOnlyHint };
});

const CATALOG_BY_NAME = new Map(TOOL_CATALOG.map((entry) => [entry.name, entry]));

/** Canonical count of registered MCP tools, derived from {@link TOOL_CATALOG}. */
export const MCP_TOOL_COUNT = TOOL_CATALOG.length;

/** Runtime dependencies handed to the tools that need host authority objects. */
export interface McpToolRuntimeDeps {
  attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
  providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
}

/**
 * One tool module and its registration entrypoint. `module` is the file name under
 * `src/mcp/tools/`; the annotation-parity gate scans exactly these modules for
 * mutating primitives, so a new tool module is covered the moment it is registered.
 */
export interface McpToolRegistrar {
  module: string;
  register: (server: McpServer, runtime: McpToolRuntimeDeps) => void;
}

/** Registration order — TOOL_CATALOG follows it. */
export const TOOL_REGISTRARS: readonly McpToolRegistrar[] = [
  { module: 'init.ts', register: (s) => registerInitTool(s) },
  { module: 'directives.ts', register: (s) => registerSetDirectivesTool(s) },
  { module: 'plan.ts', register: (s) => registerPlanTool(s) },
  { module: 'start.ts', register: (s, runtime) => registerStartTool(s, runtime) },
  { module: 'status.ts', register: (s) => registerStatusTool(s) },
  { module: 'doctor.ts', register: (s) => registerDoctorTool(s) },
  { module: 'retro.ts', register: (s) => registerRetroTool(s) },
  { module: 'history.ts', register: (s) => registerHistoryTool(s) },
  { module: 'analyze.ts', register: (s) => registerAnalyzeTool(s) },
  { module: 'sync.ts', register: (s) => registerSyncTool(s) },
  { module: 'config.ts', register: (s) => registerConfigTool(s) },
  { module: 'review.ts', register: (s) => registerReviewTool(s) },
  { module: 'run.ts', register: (s, runtime) => registerRunTool(s, runtime) },
  { module: 'kill.ts', register: (s) => registerKillTool(s) },
  { module: 'cleanup.ts', register: (s) => registerCleanupTool(s) },
  { module: 'help.ts', register: (s) => registerHelpTool(s) },
  { module: 'agent-list.ts', register: (s) => registerAgentListTool(s) },
  { module: 'skill-list.ts', register: (s) => registerSkillListTool(s) },
  { module: 'checkpoint.ts', register: (s) => registerCheckpointTool(s) },
  { module: 'docs.ts', register: (s) => registerDocsTool(s) },
  { module: 'explain.ts', register: (s) => registerExplainTool(s) },
  { module: 'memory-query.ts', register: (s) => registerMemoryQueryTool(s) },
  { module: 'watch.ts', register: (s) => registerWatch(s) },
  { module: 'nervous.ts', register: (s) => registerNervousTools(s) },
  { module: 'feature-query.ts', register: (s) => registerFeatureQueryTool(s) },
  // born-640b follow-up kapanışı (2026-07-11): deckent_truth SSOT-yolundan —
  // 404-002 scope-sınırı gereği server.ts'e ad-hoc kaydetmişti; katalog+kayıt+
  // help+sayaç yeniden tek-kaynaktan türüyor.
  { module: 'truth.ts', register: (s) => registerTruthTool(s) },
  { module: 'audit.ts', register: (s) => registerAuditTool(s) },
  { module: 'recover.ts', register: (s) => registerRecoverTool(s) },
  { module: 'models.ts', register: (s) => registerModelsTool(s) },
  { module: 'autonomous.ts', register: (s) => registerAutonomousTool(s) },
  { module: 'process.ts', register: (s) => registerProcessTool(s) },
  { module: 'usage.ts', register: (s) => registerUsageTool(s) },
  { module: 'xverify.ts', register: (s, runtime) => registerXverifyTool(s, runtime) },
  { module: 'kpi.ts', register: (s) => registerKpiTool(s) },
  { module: 'cost.ts', register: (s) => registerCostTool(s) },
  { module: 'catalog-parity.ts', register: (s) => registerCatalogParityTools(s) },
  { module: 'autonomous-surface.ts', register: (s) => registerAutonomousSurfaceTools(s) },
  { module: 'nervous-edit.ts', register: (s) => registerNervousEditTools(s) },
  { module: 'autonomous-approval.ts', register: (s) => registerAutonomousApprovalTools(s) },
  { module: 'execution-authority.ts', register: (s) => registerExecutionAuthorityTool(s) },
];

/**
 * Wrap a server so every `registerTool` call declares the catalog's annotation hints
 * (row 490). The catalog is the widest-side-effect authority: a module literal may be
 * stale or understated, but what reaches the client is always the catalog's class.
 * A tool with no catalog entry cannot be registered — fail closed, never silently
 * unclassified. Tool behaviour, schema, title and description are untouched.
 */
export function withCatalogAnnotations(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') {
        return (name: string, config: Record<string, unknown>, ...rest: unknown[]) => {
          const entry = CATALOG_BY_NAME.get(name);
          if (!entry) {
            throw new Error(
              `MCP tool "${name}" is missing from TOOL_CATALOG — declare its side-effect class before registering it.`,
            );
          }
          const declared = (config?.annotations ?? {}) as Record<string, unknown>;
          const merged = { ...config, annotations: { ...declared, ...entry.annotations } };
          const register = target.registerTool as unknown as (
            this: McpServer,
            ...args: unknown[]
          ) => unknown;
          return register.call(target, name, merged, ...rest);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

export function registerTools(server: McpServer, runtime: McpToolRuntimeDeps = {}): void {
  const annotated = withCatalogAnnotations(server);
  for (const { register } of TOOL_REGISTRARS) {
    register(annotated, runtime);
  }
}
