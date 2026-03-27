import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runDoctorChecks } from '../../cli/commands/doctor.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { detectSubscription } from '../../core/subscription.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatDoctorResponse, wrapResponse, type DoctorData } from '../helpers/format.js';

export function registerDoctorTool(server: McpServer): void {
  server.registerTool(
    'deckent_doctor',
    {
      title: 'Health Check',
      description: 'Run Deckent health checks and diagnose environment issues. Checks: Node.js version, git availability, tmux installation, Claude CLI auth, workspace directories (.deckent/, .brain/, .tasks/), brain memory budget, tech debt level, stale lock files. Returns a healthScore (0-100) and per-check pass/fail status with recommendations. Use when a sprint fails unexpectedly or before starting a new sprint. If issues found: fix them, then re-run doctor until healthScore reaches 100.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        includeProfile: z.boolean().optional().default(false).describe('Also include system profile: CPU core count, total/free RAM, recommended max workers, and detected Claude subscription tier'),
      }),
    },
    async ({ includeProfile }) => {
      const root = process.cwd();

      try {
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

      // safe: response.checks comes from runDoctorChecks() which returns DoctorResult with checks array
      // DoctorCheck uses 'passed' field, not 'ok'
      const checks = response.checks as Array<{ passed: boolean; name?: string; message?: string }> | undefined;
      const totalChecks = checks?.length ?? 0;
      const passedChecks = checks?.filter((c) => c.passed).length ?? 0;
      const healthScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
      const recommendations: string[] = [];
      if (checks) {
        for (const check of checks) {
          if (!check.passed && check.name) {
            recommendations.push(`Fix: ${check.name}${check.message ? ` — ${check.message}` : ''}`);
          }
        }
      }
      response['recommendations'] = recommendations;
      response['healthScore'] = healthScore;

      const enriched = enrichResponse('doctor', response);
      const summary = formatDoctorResponse(response as DoctorData);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(wrapResponse(enriched, summary)),
        }],
      };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Health check failed: ${message}` }) }],
          isError: true,
        };
      }
    },
  );
}
