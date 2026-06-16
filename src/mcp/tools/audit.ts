import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { RECENT_WORKS_DIR } from '../../core/constants.js';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { queryAudit } from '../../core/audit-query.js';
import type { RetentionPolicy } from '../../core/audit-retention.js';
// C-MCP-parite (269-004): CLI runners are the SSOT (ADR-022) — import, never reimplement.
import { runComplianceReport, runAuditRetention } from '../../cli/commands/audit.js';
import { loadConfig } from '../../core/config.js';
import { enrichResponse } from '../helpers/enrich.js';

const MS_PER_DAY = 86_400_000;
const DEFAULT_SPRINT = 'sprint-001'; // CLI --sprint default (cli/commands/audit.ts)

type AuditAction = 'gate' | 'query' | 'compliance' | 'retention';
const AUDIT_ACTIONS: readonly AuditAction[] = ['gate', 'query', 'compliance', 'retention'];

function errorResult(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}

export function registerAuditTool(server: McpServer): void {
  server.registerTool(
    'deckent_audit',
    {
      title: 'Sprint Audit',
      description: 'Sprint audit multitool, mirrors the `deckent audit` CLI (ADR-022 parity). action="gate" (default): run the Brain Self-Audit Gate for a sprint — checks tsc, vitest, honesty violations, and observability; returns PASS or GATE_FAILURE and writes .deckent/{sprintId}-gate.json. action="query": filter audit-log events by channel/tenant with an optional result limit. action="compliance": build a compliance report (audit-chain integrity, RBAC, tenant isolation) over the retained audit trail. action="retention": plan audit-log retention via keepDays/keepCount — dry-run by default (ZERO writes); apply=true is DESTRUCTIVE: it archives the planned partition and permanently deletes pruned events from the sprint event stream. The CLI "forward" subcommand (SIEM export) is intentionally not exposed over MCP because it requires network egress.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        sprintId: z.string().optional().describe('Sprint ID (e.g. "sprint-150"). Required for action="gate"; defaults to "sprint-001" for query/compliance/retention (CLI --sprint parity).'),
        action: z.enum(AUDIT_ACTIONS as [AuditAction, ...AuditAction[]]).optional().default('gate').describe('Audit subcommand: gate (default, back-compatible) | query | compliance | retention.'),
        channel: z.string().optional().describe('Filter audit events by action/channel (action="query", CLI --action parity).'),
        tenant: z.string().optional().describe('Filter audit events by tenant ID (action="query").'),
        limit: z.number().optional().describe('Maximum number of matched events to return (action="query").'),
        keepDays: z.number().optional().describe('Retention: prune audit events older than n days (action="retention").'),
        keepCount: z.number().optional().describe('Retention: archive audit events beyond the most recent n (action="retention").'),
        apply: z.boolean().optional().default(false).describe('Retention: apply the plan. DESTRUCTIVE — archives the archive partition and permanently deletes pruned events; without it the run is a dry-run with zero writes.'),
      }),
    },
    async ({ sprintId, action, channel, tenant, limit, keepDays, keepCount, apply }) => {
      const root = process.cwd();
      // Direct handler calls (tests/clients bypassing zod defaults) → gate.
      const act = (action ?? 'gate') as AuditAction;
      const sprint = sprintId ?? DEFAULT_SPRINT;

      try {
        if (!AUDIT_ACTIONS.includes(act)) {
          return errorResult(`Unknown action "${String(action)}". Valid actions: ${AUDIT_ACTIONS.join(', ')}.`);
        }

        if (act === 'query') {
          const result = queryAudit(root, sprint, { tenantId: tenant, channel });
          const matched = typeof limit === 'number' && limit >= 0 ? result.matched.slice(0, limit) : result.matched;
          const enriched = enrichResponse('audit', {
            action: 'query',
            sprintId: result.sprintId,
            totalScanned: result.totalScanned,
            matchedCount: matched.length,
            matched,
          });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        if (act === 'compliance') {
          const cfg = await loadConfig(root);
          const report = runComplianceReport(root, sprint, {
            rbacEnabled: cfg.autonomous?.rbac_policy?.enabled ?? false,
            tenantIsolation: cfg.strict_tenant_isolation ?? false,
          });
          const enriched = enrichResponse('audit', {
            action: 'compliance',
            sprintId: sprint,
            report,
          });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        if (act === 'retention') {
          // Same validation rules as the CLI retention subcommand (SSOT parity).
          const policy: RetentionPolicy = {};
          if (keepDays !== undefined) {
            if (!Number.isFinite(keepDays) || keepDays < 0) {
              return errorResult(`Invalid keepDays value: ${String(keepDays)} (must be a non-negative number).`);
            }
            policy.maxAgeMs = keepDays * MS_PER_DAY;
          }
          if (keepCount !== undefined) {
            if (!Number.isInteger(keepCount) || keepCount < 0) {
              return errorResult(`Invalid keepCount value: ${String(keepCount)} (must be a non-negative integer).`);
            }
            policy.maxCount = keepCount;
          }
          const result = runAuditRetention(root, sprint, policy, apply === true);
          const enriched = enrichResponse('audit', { action: 'retention', ...result });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // act === 'gate' — original behavior, unchanged (back-compat).
        if (!sprintId) {
          return errorResult('sprintId is required for action "gate" (e.g. "sprint-150").');
        }

        const result = await runSelfAuditGate(sprintId, root);

        // Write gate result
        const recentWorksDir = join(root, RECENT_WORKS_DIR);
        if (!existsSync(recentWorksDir)) mkdirSync(recentWorksDir, { recursive: true });
        const gatePath = join(recentWorksDir, `${sprintId}-gate.json`);
        writeFileSync(gatePath, JSON.stringify(result, null, 2) + '\n', 'utf-8');

        const enriched = enrichResponse('audit', {
          sprintId,
          overallGate: result.overallGate,
          tsc: result.tsc.status,
          tscErrors: result.tsc.errors.length,
          vitest: result.vitest.status,
          vitestDelta: result.vitest.delta,
          honestyViolations: result.honesty.violations,
          flaggedTasks: result.honesty.flaggedTasks,
          observability: result.observability.metricsJsonlExists ? 'OK' : 'WARNING',
          metricsLineCount: result.observability.lineCount,
          gatePath,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );
}
