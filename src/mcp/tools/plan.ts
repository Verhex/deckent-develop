import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../../core/config.js';
import { readContext } from '../../orchestra/brain.js';
import { generatePlanPreview } from '../../orchestra/plan-preview-service.js';
import { bootstrapProviders } from '../../core/provider.js';
import { debugLog } from '../../core/utils.js';
import type { BrainPlanningMode, PlannerProof, SprintSizeRecommendation } from '../../core/types.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatPlanResponse, wrapResponse } from '../helpers/format.js';

function computeWaveBreakdown(taskCount: number, maxWorkers: number): Record<string, number> {
  const waves: Record<string, number> = {};
  let remaining = taskCount;
  let wave = 1;
  while (remaining > 0) {
    const inWave = Math.min(remaining, maxWorkers);
    waves[`wave${wave}`] = inWave;
    remaining -= inWave;
    wave++;
  }
  return waves;
}

function computeModelDistribution(tasks: Array<{ model: string }>): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const t of tasks) {
    const m = t.model ?? 'sonnet';
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
      description: 'Preview a sprint plan based on current DIRECTIVES.md. Reads DIRECTIVES.md, analyzes task blocks, and returns a proposed task list with model assignments, wave breakdown, and risk assessment — without executing anything. Use this to validate your directives before running deckent_start. Prerequisite: deckent_init + deckent_set_directives must have been run.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        dryRun: z.boolean().optional().default(true).describe('Always dry-run for plan tool — tasks are never written to disk'),
        mode: z.enum(['ai', 'structured', 'auto']).optional().describe('Planning mode: "ai" uses Claude to interpret directives creatively (requires API access), "structured" parses DIRECTIVES.md task blocks directly (deterministic, no AI call), "auto" picks ai if available else falls back to structured'),
      }),
    },
    async (input: { dryRun?: boolean; mode?: 'ai' | 'structured' | 'auto' }) => {
      const root = process.cwd();

      try {
      const config = await loadConfig(root);
      // AI planning needs a registered provider. The MCP process does not bootstrap
      // the registry on its own (unlike `deckent start`), so `mode: 'ai'` hit
      // "No providers registered". Bootstrap from config (brain_provider etc.) here,
      // mirroring CLI `deckent plan`. Idempotent; failure degrades to structured.
      try {
        await bootstrapProviders(config, root);
      } catch (e) {
        debugLog('mcp:plan:bootstrapProviders', e);
      }
      const context = readContext(root);
      const recommendation: SprintSizeRecommendation = {
        size: 'full',
        maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
        modelConstraint: null,
        reason: 'No usage constraints',
      };
      // The plan tool is a PREVIEW only — its schema documents "Always dry-run …
      // tasks are never written to disk", and execution is deckent_start's job.
      // generatePlanPreview (TERM2 424-001) is the shared read-only preview
      // service CLI `plan --dry-run` also delegates to — it always forces
      // planSprint's dryRun so .tasks/task-*.json is never written here.
      const preview = await generatePlanPreview(root, config, context, recommendation, {
        mode: input.mode as BrainPlanningMode | undefined,
      });
      const sprint = preview.sprint;

      const tasks = sprint.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        model: t.model,
        priority: t.priority,
      }));

      const waveBreakdown = computeWaveBreakdown(tasks.length, recommendation.maxWorkers);
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
          maxWorkers: recommendation.maxWorkers,
          reason: recommendation.reason,
        },
        reasoning: sprint.reasoning,
        planningMode: sprint.planningMode,
        plannerProof: sprint.plannerProof,
        waveBreakdown,
        modelDistribution,
        riskAssessment,
        promptGate,
        // planDigest (TERM2 424-001) — content hash of the real plan preview
        // (task summaries + gate/policy outcome), for future digest-bound
        // approval flows (design doc "Net Öneri"). Additive field only.
        planDigest: preview.planDigest,
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
