import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../../core/config.js';
import { readContext, checkUsage, adjustSprintSize, planSprint } from '../../orchestra/brain.js';
import type { BrainPlanningMode } from '../../core/types.js';
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
      description: 'Plan a sprint based on current DIRECTIVES.md. Returns task list and recommendation without executing.',
      inputSchema: z.object({
        dryRun: z.boolean().optional().default(true).describe('Always dry-run for plan tool'),
        mode: z.enum(['ai', 'structured', 'auto']).optional().describe('Planning mode: ai, structured, or auto'),
      }),
    },
    async (input: { dryRun?: boolean; mode?: 'ai' | 'structured' | 'auto' }) => {
      const root = process.cwd();
      const config = await loadConfig(root);
      const context = readContext(root);
      const usage = checkUsage(config);
      const recommendation = adjustSprintSize(config, usage);
      const sprint = await planSprint(root, config, context, recommendation, {
        mode: input.mode as BrainPlanningMode | undefined,
      });

      const tasks = sprint.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        model: t.model,
        priority: t.priority,
      }));

      const waveBreakdown = computeWaveBreakdown(tasks.length, recommendation.maxWorkers);
      const modelDistribution = computeModelDistribution(tasks);
      const riskAssessment = computeRiskAssessment(tasks.length);

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
        waveBreakdown,
        modelDistribution,
        riskAssessment,
      };

      const enrichedPlan = enrichResponse('plan', baseResponse);
      const summary = formatPlanResponse(baseResponse);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(wrapResponse(enrichedPlan, summary)),
        }],
      };
    },
  );
}
