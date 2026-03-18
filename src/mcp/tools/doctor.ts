import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runDoctorChecks } from '../../cli/commands/doctor.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { detectSubscription } from '../../core/subscription.js';
import { enrichResponse } from '../helpers/enrich.js';

export function registerDoctorTool(server: McpServer): void {
  server.registerTool(
    'deckent_doctor',
    {
      title: 'Health Check',
      description: 'Run Deckent health checks: Node.js, git, tmux, Claude CLI, workspace, brain budget, debt, locks.',
      inputSchema: z.object({
        includeProfile: z.boolean().optional().default(false).describe('Include system profile information (CPU, RAM, recommended workers, subscription)'),
      }),
    },
    async ({ includeProfile }) => {
      const root = process.cwd();
      const result = runDoctorChecks(root);

      const response: Record<string, unknown> = { ...result };

      if (includeProfile) {
        const profile = getSystemProfile();
        const subscription = detectSubscription();
        response['systemProfile'] = {
          cpuCores: profile.cpuCores,
          totalMemMB: profile.totalMemMB,
          freeMemMB: profile.freeMemMB,
          recommendedMaxWorkers: profile.recommendedMaxWorkers,
          subscription: subscription.detected,
          subscriptionMethod: subscription.method,
        };
      }

      const checks = response.checks as Array<{ ok: boolean; name?: string }> | undefined;
      const totalChecks = checks?.length ?? 0;
      const passedChecks = checks?.filter((c) => c.ok).length ?? 0;
      const healthScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
      const recommendations: string[] = [];
      if (checks) {
        for (const check of checks) {
          if (!check.ok && check.name) {
            recommendations.push(`Fix: ${check.name}`);
          }
        }
      }
      response['recommendations'] = recommendations;
      response['healthScore'] = healthScore;

      const enriched = enrichResponse('doctor', response);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(enriched),
        }],
      };
    },
  );
}
