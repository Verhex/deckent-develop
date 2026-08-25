import { randomUUID } from 'node:crypto';
// PRINCIPAL-001 P1a: MCP stdio runs as the real host OS user — record that
// identity instead of the old synthetic 'mcp-operator' literal.
import { principalToActor, resolveLocalOsPrincipal } from '../../core/principal.js';
import { basename } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../../core/config.js';
import { readContext } from '../../orchestra/brain.js';
import { generatePlanPreview } from '../../orchestra/plan-preview-service.js';
import { planRunFlow } from '../../orchestra/run-flow-plan-service.js';
import { bootstrapProviders } from '../../core/provider.js';
import { debugLog } from '../../core/utils.js';
import type { BrainPlanningMode, PlannerProof, SprintSizeRecommendation } from '../../core/types.js';
import { getMessage } from '../../cli/helpers/messages.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatPlanResponse, wrapResponse } from '../helpers/format.js';
import { mcpToolDescription } from './description-catalog.js';

function computeModelDistribution(tasks: Array<{ model?: string }>): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const t of tasks) {
    if (!t.model) throw new Error('E_PLAN_TASK_MODEL_MISSING');
    const m = t.model;
    dist[m] = (dist[m] ?? 0) + 1;
  }
  return dist;
}

function computeRiskAssessment(taskCount: number): string {
  if (taskCount <= 3) return 'low';
  if (taskCount <= 8) return 'medium';
  return 'high';
}

export function registerPlanTool(server: McpServer): void {
  server.registerTool(
    'deckent_plan',
    {
      title: 'Plan Sprint',
      description: mcpToolDescription('deckent_plan'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        dryRun: z.boolean().optional().default(true).describe('Always dry-run for plan tool — tasks are never written to disk'),
        mode: z.enum(['ai', 'structured', 'auto']).optional().describe('Planning mode: "ai" uses Claude to interpret directives creatively (requires API access), "structured" parses DIRECTIVES.md task blocks directly (deterministic, no AI call), "auto" picks ai if available else falls back to structured'),
        approve: z.boolean().optional().default(false).describe(getMessage('plan.mcp_approve_option', 'en')),
        acknowledgeScopePaths: z.boolean().optional().default(false).describe(getMessage('plan.mcp_ack_scope_option', 'en')),
      }),
    },
    async (input: {
      dryRun?: boolean;
      mode?: 'ai' | 'structured' | 'auto';
      approve?: boolean;
      acknowledgeScopePaths?: boolean;
    }) => {
      const root = process.cwd();

      try {
      const config = await loadConfig(root);
      // Structured preview is provider-free by contract. Only bootstrap when
      // the effective planner mode may call a provider.
      const effectiveMode = input.mode ?? config.activeModeConfig.brain_planning;
      if (effectiveMode !== 'structured') {
        try {
          await bootstrapProviders(config, root);
        } catch (e) {
          debugLog('mcp:plan:bootstrapProviders', e);
        }
      }
      const context = readContext(root);
      const recommendation: SprintSizeRecommendation = {
        size: 'full',
        maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
        modelConstraint: null,
        reason: 'No usage constraints',
      };
      // Preview is the default MCP contract. Durable exact-plan/event
      // authority is entered by an explicit dryRun:false OR by an explicit
      // approval/adoption intent — `approve: true` on a pure preview would
      // silently approve nothing, which is worse than overriding the default.
      const projectName = config.projectName || basename(root);
      const heading = context.directives
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(line => line.length > 0)
        ?.replace(/^#+\s*/, '')
        .trim();
      const flowId = randomUUID();
      const revision = 1;
      const dryRun = input.dryRun !== false && input.approve !== true;
      const planned = dryRun ? undefined : await planRunFlow({
        projectRoot: root,
        config,
        recommendation,
        proposal: {
          flowId,
          tenant: 'local',
          project: projectName,
          actor: principalToActor(resolveLocalOsPrincipal('mcp')),
          origin: 'mcp',
          revision,
          intentSummary: heading || projectName,
        },
        lineage: {
          tenantId: 'local',
          actor: principalToActor(resolveLocalOsPrincipal('mcp')),
          origin: 'mcp',
          correlationId: flowId,
          idempotencyKey: `plan:${flowId}:r${revision}`,
          sourceRef: 'DIRECTIVES.md',
        },
        source: {
          sourceKind: 'directives',
          brainContext: context,
        },
        previewOptions: {
          mode: input.mode as BrainPlanningMode | undefined,
        },
        acknowledgeScopePaths: input.acknowledgeScopePaths === true,
        ...(input.approve === true
          ? {
              approval: {
                actor: principalToActor(resolveLocalOsPrincipal('mcp')),
                ...(input.acknowledgeScopePaths === true
                  ? { acknowledgeScopePaths: true }
                  : {}),
              },
            }
          : {}),
      });
      const generatedPreview = dryRun
        ? await generatePlanPreview(root, config, context, recommendation, {
            mode: input.mode as BrainPlanningMode | undefined,
          })
        : undefined;
      const sprint = generatedPreview?.sprint ?? planned!.sprint;
      const preview = generatedPreview ?? planned!.preview;
      const topology = preview.topology;
      if (!topology) throw new Error('E_PLAN_TOPOLOGY_MISSING');

      const tasks = sprint.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        model: t.model,
        priority: t.priority,
      }));

      const waveBreakdown = Object.fromEntries(
        topology.waves.map(wave => [`wave${wave.wave}`, wave.slots.length]),
      );
      const modelDistribution = computeModelDistribution(tasks);
      const riskAssessment = computeRiskAssessment(tasks.length);

      // born-628: surface the G-series plan-time prompt gate (persona /
      // decision-space / scope-contract findings, already computed by
      // planSprint()) in the MCP response — previously only `deckent plan`
      // (CLI) rendered it; deckent_plan callers had zero visibility that
      // deckent_start would later halt PLAN on an unacknowledged BLOCK.
      const promptGate = sprint.promptGate
        ? {
          ok: sprint.promptGate.ok,
          findings: sprint.promptGate.findings,
          blockerCount: sprint.promptGate.blockers.length,
        }
        : undefined;

      const baseResponse = {
        sprintId: sprint.id,
        sprintNumber: sprint.number,
        tasks,
        recommendation: {
          size: recommendation.size,
          maxWorkers: topology.configuredMaxWorkers,
          reason: recommendation.reason,
        },
        reasoning: sprint.reasoning,
        planningMode: sprint.planningMode,
        plannerProof: sprint.plannerProof,
        waveBreakdown,
        modelDistribution,
        riskAssessment,
        promptGate,
        scopeGate: 'scopeGateResult' in preview
          ? {
            result: preview.scopeGateResult ?? 'skipped',
            ...(preview.scopeGateMessage !== undefined
              ? { message: preview.scopeGateMessage }
              : {}),
            overridden: preview.scopeGateOverridden === true,
          }
          : {
            // Preview-path (PlanPreviewResult) carries the same
            // pass|fail|skipped vocabulary under gateResult; no override
            // concept exists before adoption.
            result: preview.gateResult,
            overridden: false,
          },
        executionTopology: topology,
        topologyGate: preview.topologyGateResult,
        // planDigest (TERM2 424-001) — content hash of the real plan preview
        // (task summaries + gate/policy outcome), for future digest-bound
        // approval flows (design doc "Net Öneri"). Additive field only.
        ...(planned !== undefined
          ? {
              flowId: planned.flowId,
              revision: planned.revision,
              approval: planned.approval,
            }
          : { approval: 'preview' as const }),
        planDigest: generatedPreview?.planDigest ?? planned!.planDigest,
        planDigestVersion: preview.planDigestVersion,
      };

      const enrichedPlan = enrichResponse('plan', baseResponse);
      let summary = formatPlanResponse(baseResponse);
      if (promptGate && promptGate.blockerCount > 0) {
        summary += ` ⚠ Prompt gate: ${promptGate.blockerCount} blocking finding(s) — `
          + '`deckent start` will halt at PLAN unless re-run with acknowledgePromptGate=true '
          + '(CLI: --force-prompt-gate).';
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(wrapResponse(enrichedPlan, summary)),
        }],
      };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const plannerProof = err instanceof Error
          ? (err as Error & { plannerProof?: PlannerProof }).plannerProof
          : undefined;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: true, message: `Failed to plan sprint: ${message}`, plannerProof }),
          }],
          isError: true,
        };
      }
    },
  );
}
