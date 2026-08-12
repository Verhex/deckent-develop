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

export { TOOL_CATALOG, MCP_TOOL_COUNT } from './tool-catalog.js';
export type {
  McpToolSideEffectClass,
  McpToolAnnotationHints,
  McpToolCatalogEntry,
} from './tool-catalog.js';
import { TOOL_CATALOG } from './tool-catalog.js';

const CATALOG_BY_NAME = new Map(TOOL_CATALOG.map((entry) => [entry.name, entry]));

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
